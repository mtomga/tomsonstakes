// /api/fixtures.js
// ============================================================
// TOMSONSTAKES GLOBAL FIXTURE ENGINE
// SportMonks Edition
// Version 6.0
//
// IMPORTANT
// ------------------------------------------------------------
// Existing frontend URL remains:
//
// /api/fixtures?date=YYYY-MM-DD
//
// The response deliberately preserves the API-Football-style
// structure expected by the existing TomsonStakes admin.html.
//
// SportMonks endpoint:
//
// /v3/football/fixtures/date/{date}
//
// Authentication:
//
// ?api_token=SPORTMONKS_API_TOKEN
//
// ============================================================

export default async function handler(req, res) {

    try {

        // =====================================================
        // METHOD
        // =====================================================

        if (req.method !== "GET") {

            return res.status(405).json({

                success: false,

                error:
                    "Method not allowed. Use GET."

            });

        }


        // =====================================================
        // DATE
        // =====================================================

        const rawDate =
            req.query?.date ||
            req.query?.prediction_date ||
            req.query?.fixture_date;


        if (!rawDate) {

            return res.status(400).json({

                success: false,

                error:
                    "Date is required. Use YYYY-MM-DD."

            });

        }


        const date =
            String(rawDate).trim();


        // =====================================================
        // DATE VALIDATION
        // =====================================================

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(
                date
            )
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Invalid date format. Use YYYY-MM-DD."

            });

        }


        const dateObject =
            new Date(
                `${date}T00:00:00Z`
            );


        if (
            Number.isNaN(
                dateObject.getTime()
            ) ||
            dateObject
                .toISOString()
                .slice(0, 10) !== date
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Invalid calendar date."

            });

        }


        // =====================================================
        // SPORTMONKS TOKEN
        // =====================================================

        const token =
            process.env.SPORTMONKS_API_TOKEN;


        if (!token) {

            return res.status(500).json({

                success: false,

                error:
                    "SPORTMONKS_API_TOKEN is not configured.",

                hint:
                    "Add SPORTMONKS_API_TOKEN to Vercel Environment Variables."

            });

        }


        // =====================================================
        // SPORTMONKS REQUEST
        //
        // IMPORTANT:
        // SportMonks documents api_token as a query parameter.
        //
        // We also explicitly request Africa/Lagos because
        // TomsonStakes works with Nigerian calendar dates.
        // =====================================================

        const baseUrl =
            `https://api.sportmonks.com/v3/football/fixtures/date/${encodeURIComponent(
                date
            )}`;


        const params =
            new URLSearchParams();


        params.set(
            "api_token",
            token
        );


        params.set(
            "timezone",
            "Africa/Lagos"
        );


        params.set(
            "include",
            [
                "participants",
                "league.country",
                "state",
                "venue",
                "round",
                "stage"
            ].join(";")
        );


        const url =
            `${baseUrl}?${params.toString()}`;


        // =====================================================
        // FETCH SPORTMONKS
        // =====================================================

        const providerResponse =
            await fetch(
                url,
                {
                    method: "GET",

                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );


        // =====================================================
        // READ JSON
        // =====================================================

        const rawText =
            await providerResponse.text();


        let providerData;


        try {

            providerData =
                rawText
                    ? JSON.parse(
                        rawText
                    )
                    : {};

        }

        catch (error) {

            console.error(
                "SportMonks invalid JSON:",
                rawText?.slice(
                    0,
                    500
                )
            );


            return res.status(502).json({

                success: false,

                error:
                    "SportMonks returned an invalid response.",

                providerStatus:
                    providerResponse.status

            });

        }


        // =====================================================
        // PROVIDER ERROR
        // =====================================================

        if (
            !providerResponse.ok
        ) {

            console.error(
                "SportMonks HTTP error:",
                providerResponse.status,
                providerData
            );


            return res.status(
                providerResponse.status
            ).json({

                success: false,

                error:
                    "SportMonks returned an error.",

                providerStatus:
                    providerResponse.status,

                providerErrors:
                    providerData?.message ||
                    providerData?.errors ||
                    null

            });

        }


        // =====================================================
        // SPORTMONKS DATA
        // =====================================================

        const sportmonksFixtures =
            Array.isArray(
                providerData?.data
            )
                ?
                providerData.data
                :
                [];


        // =====================================================
        // HELPERS
        // =====================================================

        function getParticipant(
            fixture,
            location
        ) {

            const participants =
                Array.isArray(
                    fixture?.participants
                )
                    ?
                    fixture.participants
                    :
                    [];


            return (
                participants.find(
                    participant =>
                        participant?.meta
                            ?.location ===
                        location
                )
                ||
                participants.find(
                    participant =>
                        participant?.location ===
                        location
                )
                ||
                null
            );

        }


        function getTeamName(
            participant
        ) {

            return (
                participant?.name ||
                participant?.short_code ||
                participant?.short_name ||
                "Unknown Team"
            );

        }


        function getTeamId(
            participant
        ) {

            return (
                participant?.id ??
                null
            );

        }


        function getTeamLogo(
            participant
        ) {

            return (
                participant?.image_path ||
                null
            );

        }


        function getLeagueName(
            fixture
        ) {

            return (
                fixture?.league?.name ||
                "Unknown League"
            );

        }


        function getCountry(
            fixture
        ) {

            return (
                fixture
                    ?.league
                    ?.country
                    ?.name ||
                fixture
                    ?.league
                    ?.country
                    ?.country_name ||
                "International"
            );

        }


        function getStatus(
            fixture
        ) {

            const state =
                fixture?.state;


            const stateName =
                String(
                    state?.name ||
                    state?.short_name ||
                    ""
                ).toLowerCase();


            if (
                stateName.includes(
                    "finished"
                ) ||
                stateName.includes(
                    "full time"
                )
            ) {

                return "FT";

            }


            if (
                stateName.includes(
                    "live"
                ) ||
                stateName.includes(
                    "in play"
                ) ||
                stateName.includes(
                    "inplay"
                )
            ) {

                return "LIVE";

            }


            if (
                stateName.includes(
                    "postpon"
                )
            ) {

                return "PST";

            }


            if (
                stateName.includes(
                    "cancel"
                )
            ) {

                return "CANC";

            }


            if (
                stateName.includes(
                    "abandon"
                )
            ) {

                return "ABD";

            }


            /*
             * SportMonks state_id 1 is commonly
             * the not-started state.
             */

            if (
                Number(
                    fixture?.state_id
                ) === 1
            ) {

                return "NS";

            }


            return (
                state?.short_name ||
                state?.name ||
                "NS"
            );

        }


        function getKickoff(
            fixture
        ) {

            if (
                fixture?.starting_at
            ) {

                /*
                 * SportMonks returns:
                 *
                 * YYYY-MM-DD HH:mm:ss
                 *
                 * We deliberately keep it as a
                 * parseable date string.
                 */

                return String(
                    fixture.starting_at
                )
                .replace(
                    " ",
                    "T"
                ) +
                "+00:00";

            }


            if (
                fixture?.starting_at_timestamp
            ) {

                const timestamp =
                    Number(
                        fixture.starting_at_timestamp
                    );


                if (
                    Number.isFinite(
                        timestamp
                    )
                ) {

                    return new Date(
                        timestamp * 1000
                    ).toISOString();

                }

            }


            return null;

        }


        function getGoals(
            fixture
        ) {

            let home = null;

            let away = null;


            /*
             * SportMonks may provide
             * scores as an array.
             */

            const scores =
                Array.isArray(
                    fixture?.scores
                )
                    ?
                    fixture.scores
                    :
                    [];


            for (
                const score
                of scores
            ) {

                const location =
                    String(
                        score?.participant ||
                        score?.participant_type ||
                        score?.location ||
                        ""
                    ).toLowerCase();


                const goals =
                    score?.score?.goals ??
                    score?.goals ??
                    null;


                if (
                    location === "home" ||
                    location.includes(
                        "home"
                    )
                ) {

                    home =
                        goals;

                }


                if (
                    location === "away" ||
                    location.includes(
                        "away"
                    )
                ) {

                    away =
                        goals;

                }

            }


            /*
             * Some SportMonks responses expose
             * home_score / away_score directly.
             */

            if (
                home === null &&
                fixture?.home_score !== undefined
            ) {

                home =
                    fixture.home_score;

            }


            if (
                away === null &&
                fixture?.away_score !== undefined
            ) {

                away =
                    fixture.away_score;

            }


            return {
                home,
                away
            };

        }


        // =====================================================
        // NORMALIZE
        // =====================================================

        const response =
            sportmonksFixtures
                .map(
                    fixture => {

                        const home =
                            getParticipant(
                                fixture,
                                "home"
                            );


                        const away =
                            getParticipant(
                                fixture,
                                "away"
                            );


                        const goals =
                            getGoals(
                                fixture
                            );


                        const status =
                            getStatus(
                                fixture
                            );


                        const kickoff =
                            getKickoff(
                                fixture
                            );


                        return {

                            fixture: {

                                id:
                                    fixture?.id ??
                                    null,

                                date:
                                    kickoff,

                                timestamp:
                                    fixture
                                        ?.starting_at_timestamp ??
                                    null,

                                timezone:
                                    "Africa/Lagos",

                                venue: {

                                    id:
                                        fixture?.venue_id ??
                                        null,

                                    name:
                                        fixture
                                            ?.venue
                                            ?.name ??
                                        null,

                                    city:
                                        fixture
                                            ?.venue
                                            ?.city ??
                                        null

                                },

                                status: {

                                    long:
                                        fixture
                                            ?.state
                                            ?.name ||
                                        status,

                                    short:
                                        status,

                                    elapsed:
                                        null

                                }

                            },


                            league: {

                                id:
                                    fixture
                                        ?.league_id ??
                                    null,

                                name:
                                    getLeagueName(
                                        fixture
                                    ),

                                country:
                                    getCountry(
                                        fixture
                                    ),

                                logo:
                                    fixture
                                        ?.league
                                        ?.image_path ??
                                    null,

                                flag:
                                    fixture
                                        ?.league
                                        ?.country
                                        ?.image_path ??
                                    null,

                                season:
                                    fixture
                                        ?.season_id ??
                                    null,

                                round:
                                    fixture
                                        ?.round
                                        ?.name ??
                                    null,

                                stage:
                                    fixture
                                        ?.stage
                                        ?.name ??
                                    null

                            },


                            teams: {

                                home: {

                                    id:
                                        getTeamId(
                                            home
                                        ),

                                    name:
                                        getTeamName(
                                            home
                                        ),

                                    logo:
                                        getTeamLogo(
                                            home
                                        )

                                },

                                away: {

                                    id:
                                        getTeamId(
                                            away
                                        ),

                                    name:
                                        getTeamName(
                                            away
                                        ),

                                    logo:
                                        getTeamLogo(
                                            away
                                        )

                                }

                            },


                            goals: {

                                home:
                                    goals.home,

                                away:
                                    goals.away

                            },


                            score: {

                                halftime: {

                                    home:
                                        null,

                                    away:
                                        null

                                },

                                fulltime: {

                                    home:
                                        goals.home,

                                    away:
                                        goals.away

                                },

                                extratime: {

                                    home:
                                        null,

                                    away:
                                        null

                                },

                                penalty: {

                                    home:
                                        null,

                                    away:
                                        null

                                }

                            },


                            /*
                             * Keep the native SportMonks
                             * information available for
                             * future TomsonStakes analysis.
                             */

                            sportmonks: {

                                fixture_id:
                                    fixture?.id ??
                                    null,

                                league_id:
                                    fixture
                                        ?.league_id ??
                                    null,

                                season_id:
                                    fixture
                                        ?.season_id ??
                                    null,

                                stage_id:
                                    fixture
                                        ?.stage_id ??
                                    null,

                                round_id:
                                    fixture
                                        ?.round_id ??
                                    null,

                                state_id:
                                    fixture
                                        ?.state_id ??
                                    null,

                                venue_id:
                                    fixture
                                        ?.venue_id ??
                                    null,

                                starting_at:
                                    fixture
                                        ?.starting_at ??
                                    null,

                                starting_at_timestamp:
                                    fixture
                                        ?.starting_at_timestamp ??
                                    null

                            }

                        };

                    }
                )
                .filter(
                    fixture =>
                        fixture
                            ?.teams
                            ?.home
                            ?.name &&
                        fixture
                            ?.teams
                            ?.away
                            ?.name
                );


        // =====================================================
        // SORT BY KICKOFF
        // =====================================================

        response.sort(
            (
                a,
                b
            ) => {

                const aTime =
                    Number(
                        a
                            ?.fixture
                            ?.timestamp
                    ) ||
                    Number.MAX_SAFE_INTEGER;


                const bTime =
                    Number(
                        b
                            ?.fixture
                            ?.timestamp
                    ) ||
                    Number.MAX_SAFE_INTEGER;


                return (
                    aTime -
                    bTime
                );

            }
        );


        // =====================================================
        // COUNTRIES
        // =====================================================

        const countries =
            [
                ...new Set(
                    response
                        .map(
                            fixture =>
                                fixture
                                    ?.league
                                    ?.country
                        )
                        .filter(Boolean)
                )
            ]
            .sort();


        // =====================================================
        // LEAGUES
        // =====================================================

        const leagueMap =
            new Map();


        response.forEach(
            fixture => {

                const league =
                    fixture?.league;


                if (
                    !league?.id
                ) {

                    return;

                }


                if (
                    !leagueMap.has(
                        String(
                            league.id
                        )
                    )
                ) {

                    leagueMap.set(
                        String(
                            league.id
                        ),
                        {

                            id:
                                league.id,

                            name:
                                league.name,

                            country:
                                league.country,

                            logo:
                                league.logo,

                            flag:
                                league.flag

                        }
                    );

                }

            }
        );


        const leagues =
            [
                ...leagueMap.values()
            ];


        // =====================================================
        // STATUS SUMMARY
        // =====================================================

        const statusSummary =
            {};


        response.forEach(
            fixture => {

                const status =
                    String(
                        fixture
                            ?.fixture
                            ?.status
                            ?.short ||
                        "UNKNOWN"
                    )
                    .toUpperCase();


                statusSummary[status] =
                    (
                        statusSummary[status] ||
                        0
                    ) + 1;

            }
        );


        // =====================================================
        // COUNTS
        // =====================================================

        let upcoming = 0;

        let live = 0;

        let finished = 0;

        let postponed = 0;

        let cancelled = 0;


        response.forEach(
            fixture => {

                const status =
                    fixture
                        ?.fixture
                        ?.status
                        ?.short;


                if (
                    status === "NS" ||
                    status === "TBD"
                ) {

                    upcoming++;

                }

                else if (
                    status === "LIVE"
                ) {

                    live++;

                }

                else if (
                    status === "FT"
                ) {

                    finished++;

                }

                else if (
                    status === "PST"
                ) {

                    postponed++;

                }

                else if (
                    status === "CANC"
                ) {

                    cancelled++;

                }

            }
        );


        // =====================================================
        // NO-FIXTURE DIAGNOSTIC
        // =====================================================

        /*
         * This is important.
         *
         * A valid SportMonks response with zero fixtures is
         * NOT the same thing as an API error.
         *
         * We expose the provider response metadata so we can
         * determine whether the date is outside your plan's
         * available coverage.
         */

        if (
            response.length === 0
        ) {

            console.warn(
                "SportMonks returned zero fixtures for:",
                date
            );

        }


        // =====================================================
        // CACHE
        // =====================================================

        res.setHeader(
            "Cache-Control",
            "no-store"
        );


        // =====================================================
        // FINAL RESPONSE
        // =====================================================

        return res.status(200).json({

            success: true,

            version:
                "TomsonStakes Fixtures V6.0",

            source:
                "SportMonks",

            request: {

                date,

                timezone:
                    "Africa/Lagos",

                timezoneLabel:
                    "WAT"

            },

            results: {

                count:
                    response.length,

                countries:
                    countries.length,

                leagues:
                    leagues.length

            },

            summary: {

                total:
                    response.length,

                upcoming,

                live,

                finished,

                postponed,

                cancelled,

                other:
                    response.length -
                    (
                        upcoming +
                        live +
                        finished +
                        postponed +
                        cancelled
                    )

            },

            statusSummary,

            countries,

            leagues,

            paging: {

                current:
                    providerData
                        ?.pagination
                        ?.current_page ??
                    1,

                total:
                    providerData
                        ?.pagination
                        ?.total ??
                    1,

                perPage:
                    providerData
                        ?.pagination
                        ?.per_page ??
                    response.length

            },

            /*
             * Helpful information without exposing
             * the API token.
             */

            provider: {

                name:
                    "SportMonks",

                endpoint:
                    "/v3/football/fixtures/date/{date}",

                timezone:
                    "Africa/Lagos",

                providerResults:
                    Array.isArray(
                        providerData?.data
                    )
                        ?
                        providerData.data.length
                        :
                        0

            },

            /*
             * THIS IS THE IMPORTANT PART.
             *
             * Your existing admin.html continues
             * reading response[].
             */

            response

        });

    }

    catch (error) {

        console.error(
            "TOMSONSTAKES SPORTMONKS FIXTURES ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            version:
                "TomsonStakes Fixtures V6.0",

            error:
                "Unable to retrieve football fixtures.",

            details:
                error?.message ||
                "Unknown server error."

        });

    }

}
