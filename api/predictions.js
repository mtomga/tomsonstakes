export default async function handler(req, res) {

    const SUPABASE_URL =
        process.env.SUPABASE_URL;

    const SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY
    ) {

        return res.status(500).json({

            success: false,

            error:
                "Supabase environment variables are missing."

        });

    }


    /*
     * GET
     * Return published predictions
     */

    if (req.method === "GET") {

        try {

            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/prediction?status=eq.published&order=fixture_date.desc,kickoff.asc`,
                    {

                        headers: {

                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                            "Content-Type":
                                "application/json"

                        }

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({

                    success: false,

                    error:
                        data.message ||
                        data.error ||
                        "Failed to retrieve predictions."

                });

            }


            return res.status(200).json({

                success: true,

                count:
                    Array.isArray(data)
                    ?
                    data.length
                    :
                    0,

                predictions:
                    Array.isArray(data)
                    ?
                    data
                    :
                    []

            });

        }

        catch (error) {

            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }


    /*
     * POST
     * Save a new prediction
     */

    if (req.method === "POST") {

        try {

            const body =
                typeof req.body === "string"
                ?
                JSON.parse(req.body)
                :
                req.body;


            if (!body) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Request body is required."

                });

            }


            const requiredFields = [

                "fixture_date",
                "fixture_id",
                "home_team",
                "away_team",
                "market",
                "prediction",
                "confidence",
                "analysis",
                "status"

            ];


            for (
                const field
                of requiredFields
            ) {

                if (
                    body[field] === undefined ||
                    body[field] === null ||
                    body[field] === ""
                ) {

                    return res.status(400).json({

                        success: false,

                        error:
                            `Missing required field: ${field}`

                    });

                }

            }


            const confidence =
                Number(
                    body.confidence
                );


            if (
                !Number.isFinite(confidence) ||
                confidence < 1 ||
                confidence > 100
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Confidence must be between 1 and 100."

                });

            }


            const row = {

                fixture_date:
                    body.fixture_date,

                fixture_id:
                    body.fixture_id,

                home_team:
                    body.home_team,

                away_team:
                    body.away_team,

                home_team_id:
                    body.home_team_id,

                away_team_id:
                    body.away_team_id,

                country:
                    body.country || "",

                league:
                    body.league || "",

                kickoff:
                    body.kickoff,

                market:
                    body.market,

                prediction:
                    body.prediction,

                confidence,

                analysis:
                    body.analysis,

                status:
                    body.status,

                result:
                    body.result || null,

                published_at:
                    body.status === "published"
                    ?
                    (
                        body.published_at ||
                        new Date().toISOString()
                    )
                    :
                    null

            };


            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/prediction`,
                    {

                        method: "POST",

                        headers: {

                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                            "Content-Type":
                                "application/json",

                            Prefer:
                                "return=representation"

                        },

                        body:
                            JSON.stringify(row)

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                console.error(
                    "SUPABASE INSERT ERROR:",
                    data
                );


                return res.status(
                    response.status
                ).json({

                    success: false,

                    error:
                        data.message ||
                        data.error ||
                        data.hint ||
                        "Supabase insert failed."

                });

            }


            return res.status(201).json({

                success: true,

                prediction:
                    Array.isArray(data)
                    ?
                    data[0]
                    :
                    data

            });

        }

        catch (error) {

            console.error(
                "PREDICTION API ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }


    return res.status(405).json({

        success: false,

        error:
            "Method not allowed."

    });

}
