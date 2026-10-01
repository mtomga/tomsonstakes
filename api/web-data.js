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

        // =====================================================
        // BASIC VALIDATION
        // =====================================================

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
        // GLOBAL TEAM IDENTITY
        // =====================================================

        function createIdentity(name) {

            return String(name || "")
                .trim()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[’']/g, "")
                .replace(/&/g, " AND ")
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
        }

        const expectedHomeIdentity =
            createIdentity(home);

        const expectedAwayIdentity =
            createIdentity(away);

        // =====================================================
        // VERIFY IDENTITIES
        // =====================================================

        if (
            !expectedHomeIdentity ||
            !expectedAwayIdentity
        ) {
            return res.status(400).json({
                success: false,
                error: "Unable to generate team identity."
            });
        }

        if (
            homeIdentity !== expectedHomeIdentity ||
            awayIdentity !== expectedAwayIdentity
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid team identity.",

                details: {
                    home: {
                        supplied:
                            homeIdentity,
                        expected:
                            expectedHomeIdentity
                    },

                    away: {
                        supplied:
                            awayIdentity,
                        expected:
                            expectedAwayIdentity
                    }
                }
            });
        }

        // =====================================================
        // SAME TEAM PROTECTION
        // =====================================================

        if (
            homeIdentity === awayIdentity
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Home and away teams cannot have the same identity."
            });
        }

        // =====================================================
        // CANONICAL TEAM NAMES
        //
        // IMPORTANT:
        // No hard-coded team list.
        // The names supplied by API-Football are used.
        // =====================================================

        const canonicalHome =
            String(home).trim();

        const canonicalAway =
            String(away).trim();

        // =====================================================
        // SEARCH NAME VARIANTS
        // =====================================================

        function getSearchNames(teamName) {

            const original =
                String(teamName || "").trim();

            const withoutApostrophe =
                original.replace(/[’']/g, "");

            const normalized =
                original
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[’']/g, "");

            const compactSpaces =
                original.replace(/\s+/g, " ");

            return [
                original,
                withoutApostrophe,
                normalized,
                compactSpaces
            ]
                .map(value => value.trim())
                .filter(Boolean)
                .filter(
                    (value, index, array) =>
                        array.indexOf(value) === index
                );
        }

        const homeNames =
            getSearchNames(canonicalHome);

        const awayNames =
            getSearchNames(canonicalAway);

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

        // =====================================================
        // DATE
        // =====================================================

        const parsedDate =
            new Date(date);

        if (
            Number.isNaN(
                parsedDate.getTime()
            )
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Invalid match date."
            });
        }

        const matchYear =
            parsedDate.getUTCFullYear();

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

                    team:
                        canonicalHome,

                    teamIdentity:
                        homeIdentity,

                    query:
                        `"${teamName}" results ${matchYear} football recent`
                },

                {
                    type: "form_home_recent",

                    team:
                        canonicalHome,

                    teamIdentity:
                        homeIdentity,

                    query:
                        `"${teamName}" recent results ${matchYear} football`
                },

                {
                    type: "form_home_fixtures",

                    team:
                        canonicalHome,

                    teamIdentity:
                        homeIdentity,

                    query:
                        `"${teamName}" fixtures results ${matchYear} FotMob`
                },

                {
                    type: "form_home_soccerway",

                    team:
                        canonicalHome,

                    teamIdentity:
                        homeIdentity,

                    query:
                        `"${teamName}" Soccerway results ${matchYear}`
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

                    team:
                        canonicalAway,

                    teamIdentity:
                        awayIdentity,

                    query:
                        `"${teamName}" results ${matchYear} football recent`
                },

                {
                    type: "form_away_recent",

                    team:
                        canonicalAway,

                    teamIdentity:
                        awayIdentity,

                    query:
                        `"${teamName}" recent results ${matchYear} football`
                },

                {
                    type: "form_away_fixtures",

                    team:
                        canonicalAway,

                    teamIdentity:
                        awayIdentity,

                    query:
                        `"${teamName}" fixtures results ${matchYear} FotMob`
                },

                {
                    type: "form_away_soccerway",

                    team:
                        canonicalAway,

                    teamIdentity:
                        awayIdentity,

                    query:
                        `"${teamName}" Soccerway results ${matchYear}`
                }
            );
        }

        // =====================================================
        // DIRECT HOME RESULT SEARCH
        // =====================================================

        searches.push({

            type:
                "form_home_direct",

            team:
                canonicalHome,

            teamIdentity:
                homeIdentity,

            query:
                `"${canonicalHome}" "${matchYear}" football results W D L`
        });

        // =====================================================
        // DIRECT AWAY RESULT SEARCH
        // =====================================================

        searches.push({

            type:
                "form_away_direct",

            team:
                canonicalAway,

            teamIdentity:
                awayIdentity,

            query:
                `"${canonicalAway}" "${matchYear}" football results W D L`
        });

        // =====================================================
        // HOME + AWAY MATCH SEARCH
        // =====================================================

        searches.push({

            type:
                "form_home_matches",

            team:
                canonicalHome,

            teamIdentity:
                homeIdentity,

            query:
                `"${canonicalHome}" football matches results ${matchYear}`
        });

        searches.push({

            type:
                "form_away_matches",

            team:
                canonicalAway,

            teamIdentity:
                awayIdentity,

            query:
                `"${canonicalAway}" football matches results ${matchYear}`
        });

        // =====================================================
        // H2H
        // =====================================================

        searches.push({

            type:
                "h2h",

            team:
                null,

            teamIdentity:
                null,

            query:
                `"${canonicalHome}" "${canonicalAway}" head to head H2H results football`
        });

        // =====================================================
        // STATS
        // =====================================================

        searches.push({

            type:
                "stats",

            team:
                null,

            teamIdentity:
                null,

            query:
                `"${canonicalHome}" "${canonicalAway}" statistics goals xG BTTS over under ${matchYear} football`
        });

        // =====================================================
        // INJURIES
        // =====================================================

        searches.push({

            type:
                "injuries",

            team:
                null,

            teamIdentity:
                null,

            query:
                `"${canonicalHome}" "${canonicalAway}" injuries suspended players team news ${matchYear} football`
        });

        // =====================================================
        // LINEUPS
        // =====================================================

        searches.push({

            type:
                "lineups",

            team:
                null,

            teamIdentity:
                null,

            query:
                `"${canonicalHome}" "${canonicalAway}" predicted lineup starting XI ${matchYear} football`
        });

        // =====================================================
        // ODDS
        // =====================================================

        searches.push({

            type:
                "odds",

            team:
                null,

            teamIdentity:
                null,

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
                                "X-API-KEY":
                                    apiKey,

                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    q:
                                        search.query,

                                    num:
                                        8
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
                        Array.isArray(
                            data.organic
                        )
                            ? data.organic.map(
                                item => ({

                                    title:
                                        item.title ||
                                        null,

                                    link:
                                        item.link ||
                                        null,

                                    snippet:
                                        item.snippet ||
                                        null,

                                    date:
                                        item.date ||
                                        null,

                                    position:
                                        item.position ||
                                        null
                                })
                            )
                            : [],

                    knowledgeGraph:
                        data.knowledgeGraph ||
                        null
                });

            } catch (searchError) {

                results.push({

                    type:
                        search.type,

                    team:
                        search.team || null,

                    teamIdentity:
                        search.teamIdentity ||
                        null,

                    query:
                        search.query,

                    status:
                        500,

                    success:
                        false,

                    error:
                        searchError.message,

                    results:
                        []
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
                        search.teamIdentity ||
                        null,

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

                item.teamIdentity ===
                    homeIdentity &&

                String(item.type)
                    .startsWith("form_home")
            );

        const awayFormResults =
            allResults.filter(item =>

                item.teamIdentity ===
                    awayIdentity &&

                String(item.type)
                    .startsWith("form_away")
            );

        // =====================================================
        // RESPONSE
        // =====================================================

        return res.status(200).json({

            success:
                true,

            version:
                "V4.0-GLOBAL",

            match: {

                home:
                    canonicalHome,

                homeInput:
                    home,

                homeIdentity:
                    homeIdentity,

                away:
                    canonicalAway,

                awayInput:
                    away,

                awayIdentity:
                    awayIdentity,

                date:
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

            allResults:

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
                        item =>
                            item.success
                    ).length,

                failedSearches:
                    results.filter(
                        item =>
                            !item.success
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

                "Team identities are generated dynamically from the requested team names.",

                "Form searches use multiple team-name variants.",

                "Form must be extracted only from results belonging to the requested team.",

                "Missing statistics must not be guessed.",

                "Source URLs should be retained for verification.",

                "The home and away clubs are treated as separate identities."
            ]
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            success:
                false,

            error:
                "Web data search failed.",

            details:
                error.message
        });
    }
}
