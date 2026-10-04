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

                resolve(
                    JSON.parse(body)
                );

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
        String(
            status || "DRAFT"
        )
        .trim()
        .toUpperCase();


    const allowed = [
        "DRAFT",
        "PUBLISHED",
        "UNPUBLISHED"
    ];


    if (
        allowed.includes(value)
    ) {

        return value;

    }


    return "DRAFT";

}


/* =====================================================
   NORMALIZE RESULT
===================================================== */

function normalizeResult(result) {

    const value =
        String(
            result || "PENDING"
        )
        .trim()
        .toUpperCase();


    const allowed = [
        "PENDING",
        "WIN",
        "LOSS",
        "VOID"
    ];


    if (
        allowed.includes(value)
    ) {

        return value;

    }


    return "PENDING";

}


/* =====================================================
   MAIN HANDLER
===================================================== */

module.exports = async function handler(req, res) {

    try {

        /* =============================================
           GET PREDICTIONS
        ============================================= */

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


        /* =============================================
           ONLY POST BELOW
        ============================================= */

        if (req.method !== "POST") {

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


            /*
             * Daily slips have their own table,
             * so their status is kept separate
             * from predictions.status.
             */

            const slipStatus =
                String(
                    body.status ||
                    "DRAFT"
                )
                .trim()
                .toUpperCase();


            const allowedSlipStatuses = [
                "DRAFT",
                "PUBLISHED",
                "UNPUBLISHED"
            ];


            const status =
                allowedSlipStatuses.includes(
                    slipStatus
                )
                    ?
                slipStatus
                    :
                "DRAFT";


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
           PREDICTION
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
            Number(
                body.confidence
            );


        /* =============================================
           VALIDATION
        ============================================= */

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


        /* =============================================
           CONFIDENCE
           Database requires 5 to 10
        ============================================= */

        if (
            !Number.isInteger(
                confidence
            ) ||
            confidence < 5 ||
            confidence > 10
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


        /* =============================================
           NORMALIZE STATUS
        ============================================= */

        const status =
            normalizeStatus(
                body.status
            );


        /* =============================================
           NORMALIZE RESULT
        ============================================= */

        const result =
            normalizeResult(
                body.result
            );


        /* =============================================
           BUILD PREDICTION
        ============================================= */

        const predictionData = {

            prediction_date:
                predictionDate,

            fixture_id:
                body.fixture_id ||
                null,

            home_team:
                homeTeam,

            away_team:
                awayTeam,

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
                market,

            selection:
                selection,

            confidence:
                confidence,

            analysis:
                body.analysis ||
                null,

            status:
                status,

            result:
                result,

            updated_at:
                new Date().toISOString()

        };


        /* =============================================
           PUBLISHED TIME
        ============================================= */

        if (
            status ===
            "PUBLISHED"
        ) {

            predictionData.published_at =
                new Date().toISOString();

        }


        /* =============================================
           INSERT INTO PREDICTIONS
        ============================================= */

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


        /* =============================================
           SUCCESS
        ============================================= */

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
       GLOBAL ERROR HANDLER
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
