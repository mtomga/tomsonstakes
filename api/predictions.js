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

/* =========================================================
   HELPERS
========================================================= */

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
                reject(
                    new Error("Invalid JSON request body.")
                );
            }
        });

        req.on("error", reject);
    });
}

function cleanStatus(value) {
    const status =
        String(value || "DRAFT")
            .trim()
            .toUpperCase();

    if (
        status !== "DRAFT" &&
        status !== "PUBLISHED" &&
        status !== "UNPUBLISHED"
    ) {
        return null;
    }

    return status;
}

function cleanText(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    const text = String(value).trim();

    return text || null;
}

/* =========================================================
   MANUAL PREDICTION VALIDATION

   New TomsonStakes structure:

   prediction_date
   country
   league
   home_team
   away_team
   kickoff
   prediction
========================================================= */

function validatePrediction(body) {

    if (!body.prediction_date) {
        return "Prediction date is required.";
    }

    if (!body.country) {
        return "Country is required.";
    }

    if (!body.league) {
        return "League is required.";
    }

    if (!body.home_team) {
        return "Team A is required.";
    }

    if (!body.away_team) {
        return "Team B is required.";
    }

    if (!body.kickoff) {
        return "Match time is required.";
    }

    if (!body.prediction) {
        return "Prediction is required.";
    }

    return null;
}

/* =========================================================
   DAILY SLIP VALIDATION
========================================================= */

function validateDailySlip(body) {

    if (!body.prediction_date) {
        return "Prediction date is required.";
    }

    if (!body.booking_code) {
        return "Booking code is required.";
    }

    if (!body.bookmaker) {
        return "Bookmaker is required.";
    }

    return null;
}

/* =========================================================
   BUILD MANUAL PREDICTION
========================================================= */

function buildPredictionData(body, status) {

    const predictionData = {

        prediction_date:
            body.prediction_date,

        country:
            cleanText(body.country),

        league:
            cleanText(body.league),

        home_team:
            cleanText(body.home_team),

        away_team:
            cleanText(body.away_team),

        kickoff:
            cleanText(body.kickoff),

        prediction:
            cleanText(body.prediction),

        status:
            status,

        updated_at:
            new Date().toISOString()
    };

    /*
     * These old fields are intentionally retained only
     * when the existing Supabase table still contains them.
     *
     * They are NOT required by the new manual system.
     */

    if (body.fixture_id !== undefined) {
        predictionData.fixture_id =
            body.fixture_id || null;
    }

    if (body.home_team_id !== undefined) {
        predictionData.home_team_id =
            body.home_team_id || null;
    }

    if (body.away_team_id !== undefined) {
        predictionData.away_team_id =
            body.away_team_id || null;
    }

    /*
     * Keep compatibility with the existing admin.html
     * while the frontend is being migrated.
     */

    if (body.market !== undefined) {
        predictionData.market =
            body.market || null;
    }

    if (body.confidence !== undefined) {

        const confidence =
            Number(body.confidence);

        if (
            Number.isInteger(confidence) &&
            confidence >= 5 &&
            confidence <= 10
        ) {
            predictionData.confidence =
                confidence;
        }
    }

    if (body.analysis !== undefined) {
        predictionData.analysis =
            cleanText(body.analysis);
    }

    if (body.selection !== undefined) {
        predictionData.selection =
            cleanText(body.selection);
    }

    if (body.result !== undefined) {
        predictionData.result =
            cleanText(body.result) ||
            "pending";
    }

    if (status === "PUBLISHED") {
        predictionData.published_at =
            new Date().toISOString();
    }

    return predictionData;
}

/* =========================================================
   HANDLER
========================================================= */

module.exports = async function handler(req, res) {

    try {

        /* =====================================================
           GET PREDICTIONS
           
           /api/predictions?date=2026-10-04
        ===================================================== */

        if (req.method === "GET") {

            const date =
                req.query?.date ||
                req.query?.prediction_date;

            let query =
                supabase
                    .from("predictions")
                    .select("*")
                    .order(
                        "kickoff",
                        {
                            ascending: true
                        }
                    );

            if (date) {

                query =
                    query.eq(
                        "prediction_date",
                        date
                    );

            }

            const {
                data,
                error
            } = await query;

            if (error) {

                console.error(
                    "GET predictions error:",
                    error
                );

                return sendJson(
                    res,
                    500,
                    {
                        success: false,
                        error:
                            error.message,
                        details:
                            error.details ||
                            null,
                        hint:
                            error.hint ||
                            null
                    }
                );
            }

            return sendJson(
                res,
                200,
                {
                    success: true,
                    count:
                        data?.length || 0,
                    predictions:
                        data || []
                }
            );
        }


        /* =====================================================
           POST
           
           CREATE MANUAL PREDICTION
           
           OR
           
           CREATE / UPDATE DAILY SLIP
        ===================================================== */

        if (req.method === "POST") {

            const body =
                await readBody(req);


            /* =================================================
               DAILY SLIP
            ================================================= */

            if (
                body.type ===
                "daily_slip"
            ) {

                const validationError =
                    validateDailySlip(
                        body
                    );

                if (validationError) {

                    return sendJson(
                        res,
                        400,
                        {
                            success: false,
                            error:
                                validationError
                        }
                    );
                }

                const status =
                    cleanStatus(
                        body.status
                    ) ||
                    "DRAFT";

                const isPublished =
                    status ===
                    "PUBLISHED";

                const now =
                    new Date()
                        .toISOString();

                const slipData = {

                    prediction_date:
                        body.prediction_date,

                    booking_code:
                        cleanText(
                            body.booking_code
                        ),

                    bookmaker:
                        cleanText(
                            body.bookmaker
                        ),

                    status:
                        status,

                    is_published:
                        isPublished,

                    updated_at:
                        now
                };

                if (isPublished) {

                    slipData.published_at =
                        now;

                }

                const {
                    data,
                    error
                } =
                    await supabase
                        .from(
                            "daily_slips"
                        )
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

                    return sendJson(
                        res,
                        500,
                        {
                            success: false,
                            error:
                                error.message,
                            details:
                                error.details ||
                                null,
                            hint:
                                error.hint ||
                                null
                        }
                    );
                }

                return sendJson(
                    res,
                    200,
                    {
                        success: true,
                        type:
                            "daily_slip",
                        slip:
                            data
                    }
                );
            }


            /* =================================================
               MANUAL PREDICTION
            ================================================= */

            const validationError =
                validatePrediction(
                    body
                );

            if (validationError) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            validationError
                    }
                );
            }

            const status =
                cleanStatus(
                    body.status
                ) ||
                "DRAFT";

            const predictionData =
                buildPredictionData(
                    body,
                    status
                );

            const {
                data,
                error
            } =
                await supabase
                    .from("predictions")
                    .insert(
                        predictionData
                    )
                    .select()
                    .single();

            if (error) {

                console.error(
                    "Prediction insert error:",
                    error
                );

                return sendJson(
                    res,
                    500,
                    {
                        success: false,
                        error:
                            error.message,
                        details:
                            error.details ||
                            null,
                        hint:
                            error.hint ||
                            null
                    }
                );
            }

            return sendJson(
                res,
                200,
                {
                    success: true,
                    prediction:
                        data
                }
            );
        }


        /* =====================================================
           PUT
           
           EDIT / PUBLISH EXISTING PREDICTION
        ===================================================== */

        if (req.method === "PUT") {

            const body =
                await readBody(req);

            const id =
                body.id ||
                req.query?.id;

            if (!id) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "Prediction id is required."
                    }
                );
            }


            /*
             * Special case:
             * Publishing an existing record.
             *
             * The current admin page sends only:
             *
             * {
             *   id,
             *   status: "PUBLISHED"
             * }
             *
             * So don't require the complete form
             * for this operation.
             */

            if (
                String(
                    body.status || ""
                ).toUpperCase() ===
                "PUBLISHED" &&
                !body.home_team &&
                !body.away_team
            ) {

                const {
                    data,
                    error
                } =
                    await supabase
                        .from(
                            "predictions"
                        )
                        .update({
                            status:
                                "PUBLISHED",

                            published_at:
                                new Date()
                                    .toISOString(),

                            updated_at:
                                new Date()
                                    .toISOString()
                        })
                        .eq(
                            "id",
                            id
                        )
                        .select()
                        .single();

                if (error) {

                    console.error(
                        "Prediction publish error:",
                        error
                    );

                    return sendJson(
                        res,
                        500,
                        {
                            success: false,
                            error:
                                error.message,
                            details:
                                error.details ||
                                null,
                            hint:
                                error.hint ||
                                null
                        }
                    );
                }

                return sendJson(
                    res,
                    200,
                    {
                        success: true,
                        prediction:
                            data
                    }
                );
            }


            /* =================================================
               NORMAL EDIT
            ================================================= */

            const validationError =
                validatePrediction(
                    body
                );

            if (validationError) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            validationError
                    }
                );
            }

            const status =
                cleanStatus(
                    body.status
                );

            if (!status) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "Invalid prediction status."
                    }
                );
            }

            const updateData =
                buildPredictionData(
                    body,
                    status
                );

            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "predictions"
                    )
                    .update(
                        updateData
                    )
                    .eq(
                        "id",
                        id
                    )
                    .select()
                    .single();

            if (error) {

                console.error(
                    "Prediction update error:",
                    error
                );

                return sendJson(
                    res,
                    500,
                    {
                        success: false,
                        error:
                            error.message,
                        details:
                            error.details ||
                            null,
                        hint:
                            error.hint ||
                            null
                    }
                );
            }

            return sendJson(
                res,
                200,
                {
                    success: true,
                    prediction:
                        data
                }
            );
        }


        /* =====================================================
           DELETE
        ===================================================== */

        if (req.method === "DELETE") {

            const id =
                req.query?.id;

            if (!id) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "Prediction id is required."
                    }
                );
            }

            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "predictions"
                    )
                    .delete()
                    .eq(
                        "id",
                        id
                    )
                    .select()
                    .single();

            if (error) {

                console.error(
                    "Prediction delete error:",
                    error
                );

                return sendJson(
                    res,
                    500,
                    {
                        success: false,
                        error:
                            error.message,
                        details:
                            error.details ||
                            null,
                        hint:
                            error.hint ||
                            null
                    }
                );
            }

            return sendJson(
                res,
                200,
                {
                    success: true,
                    deleted:
                        data
                }
            );
        }


        /* =====================================================
           METHOD NOT ALLOWED
        ===================================================== */

        return sendJson(
            res,
            405,
            {
                success: false,
                error:
                    "Method not allowed."
            }
        );

    }

    catch (error) {

        console.error(
            "Predictions API error:",
            error
        );

        return sendJson(
            res,
            500,
            {
                success: false,
                error:
                    error.message ||
                    "Internal server error."
            }
        );
    }
};
