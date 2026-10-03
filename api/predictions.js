// =========================================================
// TOMSONSTAKES
// /api/predictions.js
//
// Persistent prediction storage using Supabase REST API.
// GET    -> public published predictions
// POST   -> create prediction
// PATCH  -> update prediction
// DELETE -> delete prediction
// =========================================================

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
                "Supabase environment variables are not configured."

        });

    }


    // =====================================================
    // SUPABASE REQUEST HELPER
    // =====================================================

    async function supabaseRequest(
        path,
        options = {}
    ) {

        const response =
            await fetch(
                `${SUPABASE_URL}/rest/v1/${path}`,
                {

                    ...options,

                    headers: {

                        "apikey":
                            SUPABASE_SERVICE_ROLE_KEY,

                        "Authorization":
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                        "Content-Type":
                            "application/json",

                        ...(options.headers || {})

                    }

                }
            );

        const text =
            await response.text();

        let data = null;

        try {

            data =
                text
                ?
                JSON.parse(text)
                :
                null;

        }

        catch {

            data = text;

        }

        if (!response.ok) {

            const message =
                data?.message ||
                data?.error ||
                data?.hint ||
                "Supabase request failed.";

            throw new Error(
                message
            );

        }

        return data;

    }


    try {

        // =================================================
        // GET
        // =================================================

        if (
            req.method === "GET"
        ) {

            const {
                date,
                status,
                id
            } = req.query;


            let query =
                "predictions?select=*";


            // ---------------------------------------------
            // Specific prediction
            // ---------------------------------------------

            if (id) {

                query +=
                    `&id=eq.${encodeURIComponent(id)}`;

            }

            else {

                // -----------------------------------------
                // Date filter
                // -----------------------------------------

                if (date) {

                    query +=
                        `&prediction_date=eq.${encodeURIComponent(date)}`;

                }


                // -----------------------------------------
                // Public default = published only
                // -----------------------------------------

                if (status) {

                    query +=
                        `&status=eq.${encodeURIComponent(status)}`;

                }

                else {

                    query +=
                        `&status=eq.PUBLISHED`;

                }

            }


            query +=
                "&order=kickoff.asc,created_at.asc";


            const predictions =
                await supabaseRequest(
                    query,
                    {
                        method: "GET"
                    }
                );


            return res.status(200).json({

                success: true,

                count:
                    Array.isArray(predictions)
                    ?
                    predictions.length
                    :
                    0,

                predictions:
                    predictions || []

            });

        }


        // =================================================
        // POST
        // CREATE NEW PREDICTION
        // =================================================

        if (
            req.method === "POST"
        ) {

            const body =
                req.body || {};


            const {

                prediction_date,

                fixture_id,

                home_team,
                away_team,

                home_team_id,
                away_team_id,

                country,
                league,

                kickoff,

                market,
                selection,

                confidence,

                analysis,

                status = "PUBLISHED",

                result = "PENDING"

            } = body;


            // ---------------------------------------------
            // REQUIRED FIELDS
            // ---------------------------------------------

            if (
                !prediction_date ||
                !home_team ||
                !away_team ||
                !market ||
                !selection
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "prediction_date, home_team, away_team, market and selection are required."

                });

            }


            // ---------------------------------------------
            // CONFIDENCE
            // ---------------------------------------------

            const confidenceNumber =
                Number(confidence);


            if (
                !Number.isFinite(
                    confidenceNumber
                ) ||
                confidenceNumber < 5 ||
                confidenceNumber > 10
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Confidence must be between 5 and 10."

                });

            }


            // ---------------------------------------------
            // VALID STATUS
            // ---------------------------------------------

            const validStatuses = [

                "DRAFT",
                "PUBLISHED",
                "UNPUBLISHED"

            ];

            if (
                !validStatuses.includes(
                    status
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid prediction status."

                });

            }


            // ---------------------------------------------
            // VALID RESULT
            // ---------------------------------------------

            const validResults = [

                "PENDING",
                "WIN",
                "LOSS",
                "VOID"

            ];

            if (
                !validResults.includes(
                    result
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid prediction result."

                });

            }


            const prediction = {

                prediction_date,

                fixture_id:
                    fixture_id
                    ?
                    Number(fixture_id)
                    :
                    null,

                home_team,

                away_team,

                home_team_id:
                    home_team_id
                    ?
                    Number(home_team_id)
                    :
                    null,

                away_team_id:
                    away_team_id
                    ?
                    Number(away_team_id)
                    :
                    null,

                country:
                    country || null,

                league:
                    league || null,

                kickoff:
                    kickoff || null,

                market,

                selection,

                confidence:
                    confidenceNumber,

                analysis:
                    analysis || null,

                status,

                result

            };


            const created =
                await supabaseRequest(
                    "predictions",
                    {

                        method: "POST",

                        headers: {

                            "Prefer":
                                "return=representation"

                        },

                        body:
                            JSON.stringify(
                                prediction
                            )

                    }
                );


            return res.status(201).json({

                success: true,

                message:
                    "Prediction created successfully.",

                prediction:
                    Array.isArray(created)
                    ?
                    created[0]
                    :
                    created

            });

        }


        // =================================================
        // PATCH
        // UPDATE PREDICTION
        // =================================================

        if (
            req.method === "PATCH"
        ) {

            const body =
                req.body || {};

            const id =
                body.id;


            if (!id) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Prediction ID is required."

                });

            }


            const allowedFields = [

                "prediction_date",

                "fixture_id",

                "home_team",

                "away_team",

                "home_team_id",

                "away_team_id",

                "country",

                "league",

                "kickoff",

                "market",

                "selection",

                "confidence",

                "analysis",

                "status",

                "result"

            ];


            const updates = {};


            for (
                const field
                of allowedFields
            ) {

                if (
                    body[field] !==
                    undefined
                ) {

                    updates[field] =
                        body[field];

                }

            }


            updates.updated_at =
                new Date().toISOString();


            const updated =
                await supabaseRequest(
                    `predictions?id=eq.${encodeURIComponent(id)}`,
                    {

                        method: "PATCH",

                        headers: {

                            "Prefer":
                                "return=representation"

                        },

                        body:
                            JSON.stringify(
                                updates
                            )

                    }
                );


            return res.status(200).json({

                success: true,

                message:
                    "Prediction updated successfully.",

                prediction:
                    Array.isArray(updated)
                    ?
                    updated[0]
                    :
                    updated

            });

        }


        // =================================================
        // DELETE
        // =================================================

        if (
            req.method === "DELETE"
        ) {

            const id =
                req.query.id ||
                req.body?.id;


            if (!id) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Prediction ID is required."

                });

            }


            const deleted =
                await supabaseRequest(
                    `predictions?id=eq.${encodeURIComponent(id)}`,
                    {

                        method: "DELETE",

                        headers: {

                            "Prefer":
                                "return=representation"

                        }

                    }
                );


            return res.status(200).json({

                success: true,

                message:
                    "Prediction deleted successfully.",

                prediction:
                    deleted

            });

        }


        // =================================================
        // METHOD NOT ALLOWED
        // =================================================

        res.setHeader(
            "Allow",
            "GET, POST, PATCH, DELETE"
        );

        return res.status(405).json({

            success: false,

            error:
                "Method not allowed."

        });

    }

    catch (error) {

        console.error(
            "TOMSONSTAKES PREDICTIONS ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "Prediction database request failed."

        });

    }

}
