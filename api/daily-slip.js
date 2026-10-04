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

function sendJson(res, status, data) {
    res.status(status);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
    try {
        // This endpoint is for reading the published daily slip.
        if (req.method !== "GET") {
            return sendJson(res, 405, {
                success: false,
                error: "Method not allowed."
            });
        }

        // Accept either:
        // /api/daily-slip?date=2026-10-04
        // or
        // /api/daily-slip?prediction_date=2026-10-04
        const predictionDate =
            req.query?.date ||
            req.query?.prediction_date;

        if (!predictionDate) {
            return sendJson(res, 400, {
                success: false,
                error: "date is required."
            });
        }

        // Get the exact daily slip for this date.
        const { data, error } =
            await supabase
                .from("daily_slips")
                .select("*")
                .eq("prediction_date", predictionDate)
                .maybeSingle();

        if (error) {
            console.error("GET daily slip error:", error);

            return sendJson(res, 500, {
                success: false,
                error: error.message,
                details: error.details || null,
                hint: error.hint || null
            });
        }

        // No slip published/saved for this date.
        // Return 200 with slip:null so the frontend can simply hide the card.
        if (!data) {
            return sendJson(res, 200, {
                success: true,
                slip: null
            });
        }

        // Return the exact database record.
        return sendJson(res, 200, {
            success: true,
            slip: data
        });

    } catch (error) {
        console.error("Daily slip API error:", error);

        return sendJson(res, 500, {
            success: false,
            error:
                error.message ||
                "Internal server error."
        });
    }
};
