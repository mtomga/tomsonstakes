export default async function handler(req, res) {
    try {

        const {
            home,
            homeIdentity,
            away,
            awayIdentity,
            date
        } = req.query;


        /*
        ============================================================
        VALIDATION
        ============================================================
        */

        if (
            !home ||
            !homeIdentity ||
            !away ||
            !awayIdentity ||
            !date
        ) {

            return res.status(400).json({

                error:
                    "home, homeIdentity, away, awayIdentity and date are required."

            });

        }


        /*
        ============================================================
        VALID IDENTITY KEYS
        ============================================================
        */

        const validIdentities = [

            "DEPORTES_CONCEPCION",

            "UNIVERSIDAD_DE_CONCEPCION",

            "OHIGGINS"

        ];


        if (!validIdentities.includes(homeIdentity)) {

            return res.status(400).json({

                error:
                    "Invalid homeIdentity.",

                received:
                    homeIdentity,

                allowed:
                    validIdentities

            });

        }


        if (!validIdentities.includes(awayIdentity)) {

            return res.status(400).json({

                error:
                    "Invalid awayIdentity.",

                received:
                    awayIdentity,

                allowed:
                    validIdentities

            });

        }


        /*
        ============================================================
        PREVENT SAME-TEAM MATCH
        ============================================================
        */

        if (homeIdentity === awayIdentity) {

            return res.status(400).json({

                error:
                    "Home and away teams cannot have the same identity.",

                identity:
                    homeIdentity

            });

        }


        /*
        ============================================================
        API KEY
        ============================================================
        */

        const apiKey =
            process.env.SERPER_API_KEY;


        if (!apiKey) {

            return res.status(500).json({

                error:
                    "SERPER_API_KEY is not configured."

            });

        }


        /*
        ============================================================
        MATCH YEAR
        ============================================================
        */

        const matchYear =
            new Date(date).getUTCFullYear();


        /*
        ============================================================
        CANONICAL SEARCH NAMES
        ============================================================
        */

        const canonicalNames = {

            DEPORTES_CONCEPCION:
                "Deportes Concepcion",

            UNIVERSIDAD_DE_CONCEPCION:
                "Universidad de Concepcion",

            OHIGGINS:
                "O'Higgins"

        };


        const homeSearchName =
            canonicalNames[homeIdentity];


        const awaySearchName =
            canonicalNames[awayIdentity];


        /*
        ============================================================
        SEARCH PHRASE
        ============================================================
        */

        const matchPhrase =
            `"${homeSearchName}" "${awaySearchName}"`;


        /*
        ============================================================
        TARGETED SEARCHES
        ============================================================
        */

        const searches = [

            {
                type: "form",

                query:
                    `${matchPhrase} recent form last 5 matches ${matchYear} football`
            },


            {
                type: "h2h",

                query:
                    `${matchPhrase} head to head H2H results football`
            },


            {
                type: "stats",

                query:
                    `${matchPhrase} statistics goals xG BTTS over under ${matchYear} football`
            },


            {
                type: "injuries",

                query:
                    `${matchPhrase} injuries suspended players team news ${matchYear} football`
            },


            {
                type: "lineups",

                query:
                    `${matchPhrase} predicted lineup starting XI ${matchYear} football`
            },


            {
                type: "odds",

                query:
                    `${matchPhrase} odds 1X2 over under BTTS ${matchYear} football`
            }

        ];


        /*
        ============================================================
        RUN SEARCHES
        ============================================================
        */

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

                    query:
                        search.query,

                    status:
                        response.status,

                    success:
                        response.ok,


                    results:
                        (data.organic || [])
                            .map(item => ({

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

                            })),


                    knowledgeGraph:
                        data.knowledgeGraph ||
                        null

                });


            } catch (searchError) {

                results.push({

                    type:
                        search.type,

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


        /*
        ============================================================
        FLATTEN RESULTS
        ============================================================
        */

        const allResults = [];


        for (const search of results) {

            for (const item of search.results) {

                allResults.push({

                    type:
                        search.type,

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


        /*
        ============================================================
        QUALITY INFORMATION
        ============================================================
        */

        const successfulSearches =
            results.filter(
                item => item.success
            ).length;


        const failedSearches =
            results.filter(
                item => !item.success
            ).length;


        /*
        ============================================================
        RESPONSE
        ============================================================
        */

        return res.status(200).json({

            match: {

                home:
                    homeSearchName,

                homeInput:
                    home,

                homeIdentity:
                    homeIdentity,

                away:
                    awaySearchName,

                awayInput:
                    away,

                awayIdentity:
                    awayIdentity,

                date:
                    date,

                year:
                    matchYear

            },


            searchedAt:
                new Date().toISOString(),


            identityResolution: {

                resolved:
                    true,

                home: {

                    input:
                        home,

                    canonicalName:
                        homeSearchName,

                    identity:
                        homeIdentity

                },

                away: {

                    input:
                        away,

                    canonicalName:
                        awaySearchName,

                    identity:
                        awayIdentity

                }

            },


            searches:
                results,


            allResults:
                allResults,


            summary: {

                totalSearches:
                    searches.length,

                successfulSearches:
                    successfulSearches,

                failedSearches:
                    failedSearches,

                totalResults:
                    allResults.length

            },


            analysisReady: {

                form:
                    successfulSearches > 0,

                h2h:
                    successfulSearches > 0,

                stats:
                    successfulSearches > 0,

                injuries:
                    successfulSearches > 0,

                lineups:
                    successfulSearches > 0,

                odds:
                    successfulSearches > 0

            },


            warnings: [

                "Web results are raw source information.",

                "Team identity has been explicitly resolved before searching.",

                "Deportes Concepcion and Universidad de Concepcion are treated as different clubs.",

                "No prediction has been generated from web results.",

                "Missing statistics must not be guessed.",

                "Source URLs should be retained for verification."

            ]

        });


    } catch (error) {

        console.error(error);


        return res.status(500).json({

            error:
                "Web data search failed.",

            details:
                error.message

        });

    }

}
