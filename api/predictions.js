const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;

const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable."
    );
}

const supabase = createClient(
    supabaseUrl,
    supabaseKey
);

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function sendJson(res, status, data) {
    res.status(status);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {
            if (!body) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error("Invalid JSON request body."));
            }
        });

        req.on("error", reject);
    });
}

function cleanStatus(value) {
    const status = String(value || "DRAFT").toUpperCase();

    if (
        status !== "DRAFT" &&
        status !== "PUBLISHED" &&
        status !== "UNPUBLISHED"
    ) {
        return null;
    }

    return status;
}

function validatePrediction(body) {
    const predictionDate = body.prediction_date;
    const homeTeam = body.home_team;
    const awayTeam = body.away_team;
    const market = body.market;
    const selection = body.selection;

    if (!predictionDate) {
        return "prediction_date is required.";
    }

    if (!homeTeam) {
        return "home_team is required.";
    }

    if (!awayTeam) {
        return "away_team is required.";
    }

    if (!market) {
        return "market is required.";
    }

    if (!selection) {
        return "selection is required.";
    }

    const confidence = Number(body.confidence);

    if (
        !Number.isInteger(confidence) ||
        confidence < 5 ||
        confidence > 10
    ) {
        return "confidence must be an integer between 5 and 10.";
    }

    return null;
}

/* ---------------------------------------------------------
   HANDLER
--------------------------------------------------------- */

module.exports = async function handler(req, res) {
    try {

        /* =====================================================
           GET
           /api/predictions?date=YYYY-MM-DD
        ===================================================== */

        if (req.method === "GET") {

            const date =
                req.query?.date ||
                req.query?.prediction_date;

            let query =
                supabase
                    .from("predictions")
                    .select("*")
                    .order("kickoff", {
                        ascending: true
                    });

            if (date) {
                query = query.eq(
                    "prediction_date",
                    date
                );
            }

            const { data, error } = await query;

            if (error) {
                console.error(
                    "GET predictions error:",
                    error
                );

                return sendJson(res, 500, {
                    success: false,
                    error: error.message,
                    details: error.details || null,
                    hint: error.hint || null
                });
            }

            return sendJson(res, 200, {
                success: true,
                count: data?.length || 0,
                predictions: data || []
            });
        }


        /* =====================================================
           POST
           Create prediction OR save/publish daily slip
        ===================================================== */

        if (req.method === "POST") {

            const body = await readBody(req);


            /* -------------------------------------------------
               DAILY SLIP
            ------------------------------------------------- */

            if (body.type === "daily_slip") {

                const predictionDate =
                    body.prediction_date;

                if (!predictionDate) {
                    return sendJson(res, 400, {
                        success: false,
                        error:
                            "prediction_date is required."
                    });
                }

                const status =
                    cleanStatus(body.status) ||
                    "DRAFT";

                const isPublished =
                    status === "PUBLISHED";

                const slipData = {
                    prediction_date:
                        predictionDate,

                    booking_code:
                        body.booking_code ||
                        null,

                    bookmaker:
                        body.bookmaker ||
                        null,

                    status:
                        status,

                    is_published:
                        isPublished,

                    updated_at:
                        new Date().toISOString()
                };

                if (isPublished) {
                    slipData.published_at =
                        new Date().toISOString();
                }

                const {
                    data,
                    error
                } =
                    await supabase
                        .from("daily_slips")
                        .upsert(
                            slipData,
                            {
                                onConflict:
                                    "prediction_date"
                            }
                        )
                        .select()
                        .single();

                if (error) {
                    console.error(
                        "Daily slip error:",
                        error
                    );

                    return sendJson(res, 500, {
                        success: false,
                        error: error.message,
                        details:
                            error.details ||
                            null,
                        hint:
                            error.hint ||
                            null
                    });
                }

                return sendJson(res, 200, {
                    success: true,
                    type: "daily_slip",
                    slip: data
                });
            }


            /* -------------------------------------------------
               CREATE PREDICTION
            ------------------------------------------------- */

            const validationError =
                validatePrediction(body);

            if (validationError) {
                return sendJson(res, 400, {
                    success: false,
                    error: validationError
                });
            }

            const status =
                cleanStatus(body.status) ||
                "DRAFT";

            const predictionData = {
                prediction_date:
                    body.prediction_date,

                fixture_id:
                    body.fixture_id ||
                    null,

                home_team:
                    body.home_team,

                away_team:
                    body.away_team,

                home_team_id:
                    body.home_team_id ||
                    null,

                away_team_id:
                    body.away_team_id ||
                    null,

                country:
                    body.country ||
                    null,

                league:
                    body.league ||
                    null,

                kickoff:
                    body.kickoff ||
                    null,

                market:
                    body.market,

                selection:
                    body.selection,

                confidence:
                    Number(body.confidence),

                analysis:
                    body.analysis ||
                    null,

                status:
                    status,

                result:
                    body.result ||
                    "pending",

                updated_at:
                    new Date().toISOString()
            };

            if (status === "PUBLISHED") {
                predictionData.published_at =
                    new Date().toISOString();
            }

            const {
                data,
                error
            } =
                await supabase
                    .from("predictions")
                    .insert(predictionData)
                    .select()
                    .single();

            if (error) {
                console.error(
                    "Prediction insert error:",
                    error
                );

                return sendJson(res, 500, {
                    success: false,
                    error: error.message,
                    details:
                        error.details ||
                        null,
                    hint:
                        error.hint ||
                        null
                });
            }

            return sendJson(res, 200, {
                success: true,
                prediction: data
            });
        }


        /* =====================================================
           PUT
           Edit an existing prediction
        ===================================================== */

        if (req.method === "PUT") {

            const body = await readBody(req);

            const id =
                body.id ||
                req.query?.id;

            if (!id) {
                return sendJson(res, 400, {
                    success: false,
                    error:
                        "Prediction id is required."
                });
            }

            const validationError =
                validatePrediction(body);

            if (validationError) {
                return sendJson(res, 400, {
                    success: false,
                    error: validationError
                });
            }

            const status =
                cleanStatus(body.status);

            if (!status) {
                return sendJson(res, 400, {
                    success: false,
                    error:
                        "Invalid prediction status."
                });
            }

            const updateData = {
                prediction_date:
                    body.prediction_date,

                fixture_id:
                    body.fixture_id ||
                    null,

                home_team:
                    body.home_team,

                away_team:
                    body.away_team,

                home_team_id:
                    body.home_team_id ||
                    null,

                away_team_id:
                    body.away_team_id ||
                    null,

                country:
                    body.country ||
                    null,

                league:
                    body.league ||
                    null,

                kickoff:
                    body.kickoff ||
                    null,

                market:
                    body.market,

                selection:
                    body.selection,

                confidence:
                    Number(body.confidence),

                analysis:
                    body.analysis ||
                    null,

                status:
                    status,

                result:
                    body.result ||
                    "pending",

                updated_at:
                    new Date().toISOString()
            };

            /*
             * Only refresh published_at when the record
             * becomes published.
             */
            if (status === "PUBLISHED") {
                updateData.published_at =
                    new Date().toISOString();
            }

            const {
                data,
                error
            } =
                await supabase
                    .from("predictions")
                    .update(updateData)
                    .eq("id", id)
                    .select()
                    .single();

            if (error) {
                console.error(
                    "Prediction update error:",
                    error
                );

                return sendJson(res, 500, {
                    success: false,
                    error: error.message,
                    details:
                        error.details ||
                        null,
                    hint:
                        error.hint ||
                        null
                });
            }

            return sendJson(res, 200, {
                success: true,
                prediction: data
            });
        }


        /* =====================================================
           DELETE
           Delete an existing prediction
        ===================================================== */

        if (req.method === "DELETE") {

            const id =
                req.query?.id;

            if (!id) {
                return sendJson(res, 400, {
                    success: false,
                    error:
                        "Prediction id is required."
                });
            }

            const {
                data,
                error
            } =
                await supabase
                    .from("predictions")
                    .delete()
                    .eq("id", id)
                    .select()
                    .single();

            if (error) {
                console.error(
                    "Prediction delete error:",
                    error
                );

                return sendJson(res, 500, {
                    success: false,
                    error: error.message,
                    details:
                        error.details ||
                        null,
                    hint:
                        error.hint ||
                        null
                });
            }

            return sendJson(res, 200, {
                success: true,
                deleted: data
            });
        }


        /* =====================================================
           METHOD NOT ALLOWED
        ===================================================== */

        return sendJson(res, 405, {
            success: false,
            error: "Method not allowed."
        });

    } catch (error) {

        console.error(
            "Predictions API error:",
            error
        );

        return sendJson(res, 500, {
            success: false,
            error:
                error.message ||
                "Internal server error."
        });
    }
};
