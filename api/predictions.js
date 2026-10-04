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


/* =====================================================
   JSON RESPONSE
===================================================== */

function sendJson(res, status, data) {

    res.status(status);

    res.setHeader(
        "Content-Type",
        "application/json"
    );

    return res.end(
        JSON.stringify(data)
    );
}


/* =====================================================
   READ REQUEST BODY
===================================================== */

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
                    new Error(
                        "Invalid JSON request body."
                    )
                );
            }

        });

        req.on("error", reject);

    });

}


/* =====================================================
   NORMALIZE STATUS
===================================================== */

function normalizeStatus(status) {

    const value =
        String(status || "DRAFT")
            .trim()
            .toUpperCase();

    const allowed = [
        "DRAFT",
        "PUBLISHED",
        "UNPUBLISHED"
    ];

    return allowed.includes(value)
        ? value
        : "DRAFT";
}


/* =====================================================
   NORMALIZE RESULT
===================================================== */

function normalizeResult(result) {

    const value =
        String(result || "PENDING")
            .trim()
            .toUpperCase();

    const allowed = [
        "PENDING",
        "WIN",
        "LOSS",
        "VOID"
    ];

    return allowed.includes(value)
        ? value
        : "PENDING";
}


/* =====================================================
   VALIDATE CONFIDENCE
===================================================== */

function validConfidence(value) {

    const confidence =
        Number(value);

    return (
        Number.isInteger(confidence) &&
        confidence >= 5 &&
        confidence <= 10
    );
}


/* =====================================================
   BUILD PREDICTION DATA
===================================================== */

function buildPredictionData(body, includeDefaults = true) {

    const data = {};

    if (includeDefaults) {

        data.prediction_date =
            body.prediction_date;

        data.fixture_id =
            body.fixture_id || null;

        data.home_team =
            body.home_team;

        data.away_team =
            body.away_team;

        data.home_team_id =
            body.home_team_id || null;

        data.away_team_id =
            body.away_team_id || null;

        data.country =
            body.country || null;

        data.league =
            body.league || null;

        data.kickoff =
            body.kickoff || null;

        data.market =
            body.market;

        data.selection =
            body.selection;

        data.confidence =
            Number(body.confidence);

        data.analysis =
            body.analysis || null;

        data.status =
            normalizeStatus(body.status);

        data.result =
            normalizeResult(body.result);

    }

    return data;
}


/* =====================================================
   MAIN HANDLER
===================================================== */

module.exports = async function handler(req, res) {

    try {

        /* =================================================
           GET
        ================================================= */

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
                            error.message
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


        /* =================================================
           POST
        ================================================= */

        if (req.method === "POST") {

            const body =
                await readBody(req);


            /* =============================================
               DAILY SLIP
            ============================================= */

            if (
                body.type ===
                "daily_slip"
            ) {

                const predictionDate =
                    body.prediction_date;

                if (!predictionDate) {

                    return sendJson(
                        res,
                        400,
                        {
                            success: false,
                            error:
                                "prediction_date is required."
                        }
                    );

                }

                const status =
                    normalizeStatus(
                        body.status
                    );

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

                    updated_at:
                        new Date().toISOString()

                };

                if (
                    status ===
                    "PUBLISHED"
                ) {

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
                                null,
                            code:
                                error.code ||
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


            /* =============================================
               CREATE PREDICTION
            ============================================= */

            const predictionDate =
                body.prediction_date;

            const homeTeam =
                body.home_team;

            const awayTeam =
                body.away_team;

            const market =
                body.market;

            const selection =
                body.selection;

            const confidence =
                Number(body.confidence);


            if (!predictionDate) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "prediction_date is required."
                    }
                );

            }

            if (!homeTeam) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "home_team is required."
                    }
                );

            }

            if (!awayTeam) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "away_team is required."
                    }
                );

            }

            if (!market) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "market is required."
                    }
                );

            }

            if (!selection) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "selection is required."
                    }
                );

            }

            if (
                !validConfidence(
                    confidence
                )
            ) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "Confidence must be an integer from 5 to 10."
                    }
                );

            }


            const status =
                normalizeStatus(
                    body.status
                );

            const result =
                normalizeResult(
                    body.result
                );


            const predictionData = {

                prediction_date:
                    predictionDate,

                fixture_id:
                    body.fixture_id || null,

                home_team:
                    homeTeam,

                away_team:
                    awayTeam,

                home_team_id:
                    body.home_team_id || null,

                away_team_id:
                    body.away_team_id || null,

                country:
                    body.country || null,

                league:
                    body.league || null,

                kickoff:
                    body.kickoff || null,

                market:
                    market,

                selection:
                    selection,

                confidence:
                    confidence,

                analysis:
                    body.analysis || null,

                status:
                    status,

                result:
                    result,

                updated_at:
                    new Date().toISOString()

            };


            if (
                status ===
                "PUBLISHED"
            ) {

                predictionData.published_at =
                    new Date().toISOString();

            }


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
                            null,
                        code:
                            error.code ||
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
           PATCH
           UPDATE EXISTING PREDICTION
        ================================================= */

        if (req.method === "PATCH") {

            const body =
                await readBody(req);

            const id =
                req.query?.id ||
                body.id;


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


            const updateData = {};

            if (
                body.status !==
                undefined
            ) {

                updateData.status =
                    normalizeStatus(
                        body.status
                    );

            }


            if (
                body.result !==
                undefined
            ) {

                updateData.result =
                    normalizeResult(
                        body.result
                    );

            }


            if (
                body.market !==
                undefined
            ) {

                updateData.market =
                    body.market;

            }


            if (
                body.selection !==
                undefined
            ) {

                updateData.selection =
                    body.selection;

            }


            if (
                body.confidence !==
                undefined
            ) {

                const confidence =
                    Number(
                        body.confidence
                    );

                if (
                    !validConfidence(
                        confidence
                    )
                ) {

                    return sendJson(
                        res,
                        400,
                        {
                            success: false,
                            error:
                                "Confidence must be an integer from 5 to 10."
                        }
                    );

                }

                updateData.confidence =
                    confidence;

            }


            if (
                body.analysis !==
                undefined
            ) {

                updateData.analysis =
                    body.analysis ||
                    null;

            }


            if (
                updateData.status ===
                "PUBLISHED"
            ) {

                updateData.published_at =
                    new Date().toISOString();

            }


            updateData.updated_at =
                new Date().toISOString();


            if (
                Object.keys(
                    updateData
                ).length === 1
            ) {

                return sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error:
                            "No fields to update."
                    }
                );

            }


            const {
                data,
                error
            } =
                await supabase
                    .from("predictions")
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
                            null,
                        code:
                            error.code ||
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
           METHOD NOT ALLOWED
        ================================================= */

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


    /* =================================================
       GLOBAL ERROR
    ================================================= */

    catch (error) {

        console.error(
            "API error:",
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
