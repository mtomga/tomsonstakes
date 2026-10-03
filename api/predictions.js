import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.status(200).json({
            success: true
        });
    }


    /* =====================================================
       GET
       PUBLIC FRONTEND
    ===================================================== */

    if (req.method === "GET") {

        try {

            const date =
                req.query?.date ||
                new Date().toISOString().slice(0, 10);


            /* ---------------------------------------------
               GET DAILY SLIP
            --------------------------------------------- */

            const {
                data: slip,
                error: slipError
            } = await supabase
                .from("daily_slips")
                .select("*")
                .eq(
                    "prediction_date",
                    date
                )
                .eq(
                    "is_published",
                    true
                )
                .maybeSingle();


            if (slipError) {

                console.error(
                    "DAILY SLIP ERROR:",
                    slipError
                );

                return res.status(500).json({
                    success: false,
                    error:
                        slipError.message
                });

            }


            /* ---------------------------------------------
               GET PUBLISHED PREDICTIONS
            --------------------------------------------- */

            const {
                data: predictions,
                error: predictionError
            } = await supabase
                .from("predictions")
                .select(`
                    id,
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
                    status,
                    result,
                    published_at,
                    created_at,
                    updated_at
                `)
                .eq(
                    "prediction_date",
                    date
                )
                .eq(
                    "status",
                    "published"
                )
                .order(
                    "kickoff",
                    {
                        ascending: true
                    }
                );


            if (predictionError) {

                console.error(
                    "PREDICTION ERROR:",
                    predictionError
                );

                return res.status(500).json({
                    success: false,
                    error:
                        predictionError.message
                });

            }


            return res.status(200).json({

                success: true,

                date,

                slip:
                    slip || null,

                count:
                    predictions?.length || 0,

                predictions:
                    predictions || []

            });

        }

        catch (error) {

            console.error(
                "GET PREDICTIONS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Unable to load predictions."

            });

        }

    }


    /* =====================================================
       POST
       ADMIN
    ===================================================== */

    if (req.method === "POST") {

        try {

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

                status,

                result,

                booking_code,

                bookmaker,

                publish_slip

            } = body;


            /* ---------------------------------------------
               REQUIRED FIELDS
            --------------------------------------------- */

            if (!prediction_date) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Prediction date is required."

                });

            }


            if (!home_team) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Home team is required."

                });

            }


            if (!away_team) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Away team is required."

                });

            }


            if (!market) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Market is required."

                });

            }


            if (!selection) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Prediction selection is required."

                });

            }


            /* ---------------------------------------------
               CONFIDENCE
            --------------------------------------------- */

            const confidenceNumber =
                Number(confidence);


            if (
                !Number.isInteger(
                    confidenceNumber
                ) ||
                confidenceNumber < 5 ||
                confidenceNumber > 10
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Confidence must be an integer between 5 and 10."

                });

            }


            /* ---------------------------------------------
               STATUS
            --------------------------------------------- */

            const predictionStatus =
                status ||
                "draft";


            /* ---------------------------------------------
               RESULT
            --------------------------------------------- */

            const predictionResult =
                result ||
                "pending";


            /* ---------------------------------------------
               SAVE DAILY SLIP
            --------------------------------------------- */

            if (
                booking_code !== undefined ||
                bookmaker !== undefined ||
                publish_slip !== undefined
            ) {

                const {
                    error: slipError
                } = await supabase
                    .from("daily_slips")
                    .upsert(
                        {

                            prediction_date,

                            booking_code:
                                booking_code ||
                                null,

                            bookmaker:
                                bookmaker ||
                                null,

                            is_published:
                                Boolean(
                                    publish_slip
                                ),

                            updated_at:
                                new Date().toISOString()

                        },
                        {
                            onConflict:
                                "prediction_date"
                        }
                    );


                if (slipError) {

                    console.error(
                        "SLIP SAVE ERROR:",
                        slipError
                    );

                    return res.status(500).json({

                        success: false,

                        error:
                            slipError.message

                    });

                }

            }


            /* ---------------------------------------------
               SAVE PREDICTION
            --------------------------------------------- */

            const {
                data: prediction,
                error: predictionError
            } = await supabase
                .from("predictions")
                .insert({

                    prediction_date,

                    fixture_id:
                        fixture_id ||
                        null,

                    home_team,

                    away_team,

                    home_team_id:
                        home_team_id ||
                        null,

                    away_team_id:
                        away_team_id ||
                        null,

                    country:
                        country ||
                        null,

                    league:
                        league ||
                        null,

                    kickoff:
                        kickoff ||
                        null,

                    market,

                    selection,

                    confidence:
                        confidenceNumber,

                    analysis:
                        analysis ||
                        null,

                    status:
                        predictionStatus,

                    result:
                        predictionResult,

                    published_at:
                        predictionStatus ===
                        "published"
                            ?
                            new Date().toISOString()
                            :
                            null,

                    updated_at:
                        new Date().toISOString()

                })
                .select()
                .single();


            if (predictionError) {

                console.error(
                    "PREDICTION INSERT ERROR:",
                    predictionError
                );

                return res.status(500).json({

                    success: false,

                    error:
                        predictionError.message

                });

            }


            return res.status(201).json({

                success: true,

                message:
                    "Prediction saved successfully.",

                prediction

            });

        }

        catch (error) {

            console.error(
                "POST PREDICTION ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Unable to save prediction."

            });

        }

    }


    /* =====================================================
       METHOD NOT ALLOWED
    ===================================================== */

    return res.status(405).json({

        success: false,

        error:
            "Method not allowed."

    });

}
