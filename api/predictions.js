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
            error: "Supabase environment variables are missing."
        });
    }

    const headers = {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
    };


    /* =====================================================
       GET — PUBLIC PREDICTIONS
    ===================================================== */

    if (req.method === "GET") {

        try {

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/predictions?status=eq.published&order=prediction_date.desc,kickoff.asc`,
                {
                    method: "GET",
                    headers
                }
            );

            const data = await response.json();

            if (!response.ok) {

                return res.status(response.status).json({
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
                        ? data.length
                        : 0,

                predictions:
                    Array.isArray(data)
                        ? data
                        : []

            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                error: error.message
            });

        }

    }


    /* =====================================================
       POST — CREATE PREDICTION
    ===================================================== */

    if (req.method === "POST") {

        try {

            const body =
                typeof req.body === "string"
                    ? JSON.parse(req.body)
                    : req.body;


            if (!body) {

                return res.status(400).json({
                    success: false,
                    error: "Request body is required."
                });

            }


            /* ---------------------------------------------
               REQUIRED FIELDS
            --------------------------------------------- */

            const requiredFields = [
                "prediction_date",
                "home_team",
                "away_team",
                "market",
                "selection",
                "confidence",
                "status"
            ];


            for (const field of requiredFields) {

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


            /* ---------------------------------------------
               CONFIDENCE VALIDATION
            --------------------------------------------- */

            const confidence =
                Number(body.confidence);


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


            /* ---------------------------------------------
               STATUS VALIDATION
            --------------------------------------------- */

            const allowedStatuses = [
                "draft",
                "published"
            ];


            if (
                !allowedStatuses.includes(
                    String(body.status).toLowerCase()
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Status must be draft or published."

                });

            }


            /* ---------------------------------------------
               BUILD DATABASE ROW
            --------------------------------------------- */

            const row = {

                prediction_date:
                    body.prediction_date,

                fixture_id:
                    body.fixture_id || null,

                home_team:
                    body.home_team,

                away_team:
                    body.away_team,

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
                    body.market,

                selection:
                    body.selection,

                confidence,

                analysis:
                    body.analysis || null,

                status:
                    String(body.status).toLowerCase(),

                /*
                 * Your database requires result.
                 * Use "pending" until the match is settled.
                 */

                result:
                    body.result || "pending",

                published_at:
                    String(body.status).toLowerCase() === "published"
                        ? (
                            body.published_at ||
                            new Date().toISOString()
                        )
                        : null

            };


            /* ---------------------------------------------
               INSERT INTO public.predictions
            --------------------------------------------- */

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/predictions`,
                {
                    method: "POST",

                    headers: {
                        ...headers,
                        Prefer: "return=representation"
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
                        ? data[0]
                        : data

            });

        } catch (error) {

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


    /* =====================================================
       OTHER METHODS
    ===================================================== */

    return res.status(405).json({

        success: false,

        error: "Method not allowed."

    });

}
