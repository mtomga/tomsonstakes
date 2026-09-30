export default async function handler(req, res) {

    try {

        if (req.method !== "GET") {
            return res.status(405).json({
                success: false,
                error: "GET method required."
            });
        }

        const {
            home,
            homeIdentity,
            away,
            awayIdentity,
            date
        } = req.query;

        if (
            !home ||
            !homeIdentity ||
            !away ||
            !awayIdentity ||
            !date
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "home, homeIdentity, away, awayIdentity and date are required."
            });
        }

        // =====================================================
        // VALID IDENTITIES
        // =====================================================

        const validIdentities = [
            "DEPORTES_CONCEPCION",
            "UNIVERSIDAD_DE_CONCEPCION",
            "OHIGGINS"
        ];

        if (
            !validIdentities.includes(homeIdentity) ||
            !validIdentities.includes(awayIdentity)
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid team identity."
            });
        }

        if (homeIdentity === awayIdentity) {
            return res.status(400).json({
                success: false,
                error:
                    "Home and away teams cannot have the same identity."
            });
        }

        // =====================================================
        // CANONICAL NAMES
        // =====================================================

        const canonicalNames = {
            DEPORTES_CONCEPCION: "Deportes Concepcion",
            UNIVERSIDAD_DE_CONCEPCION: "Universidad de Concepcion",
            OHIGGINS: "O'Higgins"
        };

        const canonicalHome =
            canonicalNames[homeIdentity];

        const canonicalAway =
            canonicalNames[awayIdentity];

        if (!canonicalHome || !canonicalAway) {
            return res.status(400).json({
                success: false,
                error:
                    "Could not resolve canonical team names."
            });
        }

        // =====================================================
        // SEARCH NAME VARIANTS
        // =====================================================

        const searchNames = {

            DEPORTES_CONCEPCION: [
                "Deportes Concepcion"
            ],

            UNIVERSIDAD_DE_CONCEPCION: [
                "Universidad de Concepcion"
            ],

            OHIGGINS: [
                "O'Higgins",
                "O Higgins",
                "Club O'Higgins"
            ]
        };

        const homeNames =
            searchNames[homeIdentity];

        const awayNames =
            searchNames[awayIdentity];

        // =====================================================
        // API KEY
        // =====================================================

        const apiKey =
            process.env.SERPER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error:
                    "SERPER_API_KEY is not configured."
            });
        }

        const matchYear =
            new Date(date).getUTCFullYear();

        // =====================================================
        // SEARCH DEFINITIONS
        // =====================================================

        const searches = [];

        // =====================================================
        // HOME FORM SEARCHES
        // =====================================================

        for (const teamName of homeNames) {

            searches.push(
                {
                    type: "form_home",
                    team: canonicalHome,
                    teamIdentity: homeIdentity,
                    query:
                        `"${teamName}" results 2026 football recent`
                },
                {
                    type: "form_home_recent",
                    team: canonicalHome,
                    teamIdentity: homeIdentity,
                    query:
                        `"${teamName}" recent results 2026 football`
                },
                {
                    type: "form_home_fixtures",
                    team: canonicalHome,
                    teamIdentity: homeIdentity,
                    query:
                        `"${teamName}" fixtures results 2026 FotMob`
                },
                {
                    type: "form_home_soccerway",
                    team: canonicalHome,
                    teamIdentity: homeIdentity,
                    query:
                        `"${teamName}" Soccerway results 2026`
                }
            );
        }

        // =====================================================
        // AWAY FORM SEARCHES
        // =====================================================

        for (const teamName of awayNames) {

            searches.push(
                {
                    type: "form_away",
                    team: canonicalAway,
                    teamIdentity: awayIdentity,
                    query:
                        `"${teamName}" results 2026 football recent`
                },
                {
                    type: "form_away_recent",
                    team: canonicalAway,
                    teamIdentity: awayIdentity,
                    query:
                        `"${teamName}" recent results 2026 football`
                },
                {
                    type: "form_away_fixtures",
                    team: canonicalAway,
                    teamIdentity: awayIdentity,
                    query:
                        `"${teamName}" fixtures results 2026 FotMob`
                },
                {
                    type: "form_away_soccerway",
                    team: canonicalAway,
                    teamIdentity: awayIdentity,
                    query:
                        `"${teamName}" Soccerway results 2026`
                }
            );
        }

        // =====================================================
        // DIRECT TEAM RESULT SEARCHES
        // =====================================================

        searches.push(

            {
                type: "form_home_direct",
                team: canonicalHome,
                teamIdentity: homeIdentity,
                query:
                    `"${canonicalHome}" "2026" "W" "D" "L" football results`
            },

            {
                type: "form_away_direct",
                team: canonicalAway,
                teamIdentity: awayIdentity,
                query:
                    `"O'Higgins" OR "O Higgins" "2026" football results`
            },

            {
                type: "form_away_matches",
                team: canonicalAway,
                teamIdentity: awayIdentity,
                query:
                    `"O'Higgins" football matches results 2026 Chile`
            },

            {
                type: "form_away_recent_matches",
                team: canonicalAway,
                teamIdentity: awayIdentity,
                query:
                    `"O Higgins" recent matches results 2026 Chile`
            }
        );

        // =====================================================
        // H2H
        // =====================================================

        searches.push({
            type: "h2h",
            query:
                `"${canonicalHome}" "${canonicalAway}" head to head H2H results football`
        });

        // =====================================================
        // STATS
        // =====================================================

        searches.push({
            type: "stats",
            query:
                `"${canonicalHome}" "${canonicalAway}" statistics goals xG BTTS over under ${matchYear} football`
        });

        // =====================================================
        // INJURIES
        // =====================================================

        searches.push({
            type: "injuries",
            query:
                `"${canonicalHome}" "${canonicalAway}" injuries suspended players team news ${matchYear} football`
        });

        // =====================================================
        // LINEUPS
        // =====================================================

        searches.push({
            type: "lineups",
            query:
                `"${canonicalHome}" "${canonicalAway}" predicted lineup starting XI ${matchYear} football`
        });

        // =====================================================
        // ODDS
        // =====================================================

        searches.push({
            type: "odds",
            query:
                `"${canonicalHome}" "${canonicalAway}" odds 1X2 over under BTTS football ${matchYear}`
        });

        // =====================================================
        // EXECUTE SEARCHES
        // =====================================================

        const results = [];

        for (const search of searches) {

            try {

                const response =
                    await fetch(
                        "https://google.serper.dev/search",
                        {
                            method: "POST",

                            headers: {
                                "X-API-KEY": apiKey,
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                q: search.query,
                                num: 8
                            })
                        }
                    );

                const data =
                    await response.json();

                results.push({

                    type:
                        search.type,

                    team:
                        search.team || null,

                    teamIdentity:
                        search.teamIdentity || null,

                    query:
                        search.query,

                    status:
                        response.status,

                    success:
                        response.ok,

                    results:
                        (data.organic || []).map(item => ({

                            title:
                                item.title || null,

                            link:
                                item.link || null,

                            snippet:
                                item.snippet || null,

                            date:
                                item.date || null,

                            position:
                                item.position || null
                        })),

                    knowledgeGraph:
                        data.knowledgeGraph || null
                });

            } catch (searchError) {

                results.push({

                    type:
                        search.type,

                    team:
                        search.team || null,

                    teamIdentity:
                        search.teamIdentity || null,

                    query:
                        search.query,

                    status: 500,

                    success: false,

                    error:
                        searchError.message,

                    results: []
                });
            }
        }

        // =====================================================
        // FLATTEN RESULTS
        // =====================================================

        const allResults = [];

        for (const search of results) {

            for (const item of search.results) {

                allResults.push({

                    type:
                        search.type,

                    team:
                        search.team || null,

                    teamIdentity:
                        search.teamIdentity || null,

                    title:
                        item.title,

                    link:
                        item.link,

                    snippet:
                        item.snippet,

                    date:
                        item.date,

                    position:
                        item.position
                });
            }
        }

        // =====================================================
        // FORM RESULT COUNTS
        // =====================================================

        const homeFormResults =
            allResults.filter(item =>
                item.teamIdentity === homeIdentity &&
                String(item.type).startsWith("form_home")
            );

        const awayFormResults =
            allResults.filter(item =>
                item.teamIdentity === awayIdentity &&
                String(item.type).startsWith("form_away")
            );

        // =====================================================
        // RESPONSE
        // =====================================================

        return res.status(200).json({

            success: true,

            version:
                "V3.14",

            match: {

                home:
                    canonicalHome,

                homeInput:
                    home,

                homeIdentity,

                away:
                    canonicalAway,

                awayInput:
                    away,

                awayIdentity,

                date,

                year:
                    matchYear
            },

            identityResolution: {

                home: {
                    input:
                        home,

                    identity:
                        homeIdentity,

                    canonical:
                        canonicalHome
                },

                away: {
                    input:
                        away,

                    identity:
                        awayIdentity,

                    canonical:
                        canonicalAway
                }
            },

            searchedAt:
                new Date().toISOString(),

            searches:
                results,

            allResults,

            formSearchSummary: {

                home: {

                    identity:
                        homeIdentity,

                    searchResultCount:
                        homeFormResults.length
                },

                away: {

                    identity:
                        awayIdentity,

                    searchResultCount:
                        awayFormResults.length
                }
            },

            summary: {

                totalSearches:
                    searches.length,

                successfulSearches:
                    results.filter(
                        item => item.success
                    ).length,

                failedSearches:
                    results.filter(
                        item => !item.success
                    ).length,

                totalResults:
                    allResults.length
            },

            analysisReady: {

                form:
                    homeFormResults.length > 0 &&
                    awayFormResults.length > 0,

                h2h:
                    allResults.some(
                        item =>
                            item.type === "h2h"
                    ),

                stats:
                    allResults.some(
                        item =>
                            item.type === "stats"
                    ),

                injuries:
                    allResults.some(
                        item =>
                            item.type === "injuries"
                    ),

                lineups:
                    allResults.some(
                        item =>
                            item.type === "lineups"
                    ),

                odds:
                    allResults.some(
                        item =>
                            item.type === "odds"
                    )
            },

            warnings: [

                "Web results are raw source information.",

                "Form searches use multiple team-name variants.",

                "O'Higgins and unrelated clubs must not be conflated.",

                "Form must be extracted only from results belonging to the requested team.",

                "Deportes Concepcion and Universidad de Concepcion are separate clubs.",

                "Missing statistics must not be guessed.",

                "Source URLs should be retained for verification."
            ]
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            error:
                "Web data search failed.",

            details:
                error.message
        });
    }
}
