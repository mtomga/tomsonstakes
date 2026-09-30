export default async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed. Use GET."
            });
        }

        const {
            home,
            homeIdentity,
            away,
            awayIdentity,
            date
        } = req.query;

        if (!home || !homeIdentity || !away || !awayIdentity || !date) {
            return res.status(400).json({
                error: "home, homeIdentity, away, awayIdentity and date are required."
            });
        }

        const allowedIdentities = [
            "DEPORTES_CONCEPCION",
            "UNIVERSIDAD_DE_CONCEPCION",
            "OHIGGINS"
        ];

        if (!allowedIdentities.includes(homeIdentity)) {
            return res.status(400).json({
                error: `Invalid homeIdentity: ${homeIdentity}`
            });
        }

        if (!allowedIdentities.includes(awayIdentity)) {
            return res.status(400).json({
                error: `Invalid awayIdentity: ${awayIdentity}`
            });
        }

        if (homeIdentity === awayIdentity) {
            return res.status(400).json({
                error: "Home and away teams cannot have the same identity."
            });
        }

        const apiKey = process.env.SERPER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "SERPER_API_KEY is not configured."
            });
        }

        const matchDate = new Date(`${date}T00:00:00Z`);

        if (Number.isNaN(matchDate.getTime())) {
            return res.status(400).json({
                error: "Invalid match date."
            });
        }

        const matchYear = matchDate.getUTCFullYear();

        const canonicalNames = {
            DEPORTES_CONCEPCION: "Deportes Concepcion",
            UNIVERSIDAD_DE_CONCEPCION: "Universidad de Concepcion",
            OHIGGINS: "O'Higgins"
        };

        const canonicalHome = canonicalNames[homeIdentity];
        const canonicalAway = canonicalNames[awayIdentity];

        /*
         * IMPORTANT:
         * The form search is now split by team.
         *
         * The previous version searched:
         *
         * "Home" "Away" recent form...
         *
         * That caused Google/Serper to return mostly fixture pages.
         *
         * V3.12 searches each team's recent results independently.
         */

        const searches = [
            {
                type: "form_home",
                team: canonicalHome,
                teamIdentity: homeIdentity,
                query: `"${canonicalHome}" last 5 matches results ${matchYear} football`
            },
            {
                type: "form_home_recent",
                team: canonicalHome,
                teamIdentity: homeIdentity,
                query: `"${canonicalHome}" recent results ${matchYear} football`
            },
            {
                type: "form_away",
                team: canonicalAway,
                teamIdentity: awayIdentity,
                query: `"${canonicalAway}" last 5 matches results ${matchYear} football`
            },
            {
                type: "form_away_recent",
                team: canonicalAway,
                teamIdentity: awayIdentity,
                query: `"${canonicalAway}" recent results ${matchYear} football`
            },

            {
                type: "h2h",
                query: `"${canonicalHome}" "${canonicalAway}" head to head H2H results football`
            },

            {
                type: "stats",
                query: `"${canonicalHome}" "${canonicalAway}" statistics goals xG BTTS over under ${matchYear} football`
            },

            {
                type: "injuries",
                query: `"${canonicalHome}" "${canonicalAway}" injuries suspended players team news ${matchYear} football`
            },

            {
                type: "lineups",
                query: `"${canonicalHome}" "${canonicalAway}" predicted lineup starting XI ${matchYear} football`
            },

            {
                type: "odds",
                query: `"${canonicalHome}" "${canonicalAway}" odds 1X2 over under BTTS ${matchYear} football`
            }
        ];

        const results = [];

        for (const search of searches) {
            try {
                const response = await fetch(
                    "https://google.serper.dev/search",
                    {
                        method: "POST",
                        headers: {
                            "X-API-KEY": apiKey,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            q: search.query,
                            num: 8
                        })
                    }
                );

                const data = await response.json();

                results.push({
                    type: search.type,
                    team: search.team || null,
                    teamIdentity: search.teamIdentity || null,
                    query: search.query,
                    status: response.status,
                    success: response.ok,

                    results: (data.organic || []).map(item => ({
                        title: item.title || null,
                        link: item.link || null,
                        snippet: item.snippet || null,
                        date: item.date || null,
                        position: item.position || null
                    })),

                    knowledgeGraph: data.knowledgeGraph || null
                });

            } catch (searchError) {

                results.push({
                    type: search.type,
                    team: search.team || null,
                    teamIdentity: search.teamIdentity || null,
                    query: search.query,
                    status: 500,
                    success: false,
                    error: searchError.message,
                    results: []
                });
            }
        }

        /*
         * Flatten results while retaining:
         * - search category
         * - team requested for form searches
         * - team identity
         */

        const allResults = [];

        for (const search of results) {
            for (const item of search.results) {

                allResults.push({
                    type: search.type,
                    team: search.team || null,
                    teamIdentity: search.teamIdentity || null,

                    title: item.title,
                    link: item.link,
                    snippet: item.snippet,
                    date: item.date,
                    position: item.position
                });
            }
        }

        /*
         * Count searches.
         */

        const successfulSearches = results.filter(
            item => item.success
        ).length;

        const failedSearches = results.filter(
            item => !item.success
        ).length;

        /*
         * Form search summary.
         */

        const formHomeResults = allResults.filter(
            item =>
                item.type === "form_home" ||
                item.type === "form_home_recent"
        );

        const formAwayResults = allResults.filter(
            item =>
                item.type === "form_away" ||
                item.type === "form_away_recent"
        );

        return res.status(200).json({

            success: true,

            version: "V3.12",

            match: {
                home: canonicalHome,
                away: canonicalAway,
                date,
                year: matchYear,

                homeInput: home,
                awayInput: away,

                homeIdentity,
                awayIdentity
            },

            searchedAt: new Date().toISOString(),

            identityResolution: {
                requested: {
                    home,
                    homeIdentity,
                    away,
                    awayIdentity
                },

                resolved: {
                    home: homeIdentity,
                    away: awayIdentity
                },

                canonicalNames: {
                    home: canonicalHome,
                    away: canonicalAway
                },

                identitySafe: true,

                importantRule:
                    "Deportes Concepcion and Universidad de Concepcion are separate clubs."
            },

            searches: results,

            allResults,

            formSearchSummary: {
                home: {
                    identity: homeIdentity,
                    searchCount: 2,
                    resultCount: formHomeResults.length
                },

                away: {
                    identity: awayIdentity,
                    searchCount: 2,
                    resultCount: formAwayResults.length
                }
            },

            summary: {
                totalSearches: searches.length,
                successfulSearches,
                failedSearches,
                totalResults: allResults.length
            },

            analysisReady: {
                identity: true,
                form: true,
                h2h: true,
                stats: true,
                injuries: true,
                lineups: true,
                odds: true
            },

            warnings: [
                "Web results are raw source information.",
                "Form searches are separated by home and away team.",
                "No prediction has been generated from web results.",
                "Missing statistics must not be guessed.",
                "Source URLs should be retained for verification.",
                "Deportes Concepcion and Universidad de Concepcion must never be conflated."
            ]
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            error: "Web data search failed.",
            details: error.message
        });
    }
}
