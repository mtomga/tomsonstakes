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


/* ==========================================================
   HELPERS
========================================================== */

function sendJson(res, status, data) {
  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json"
  );

  res.end(JSON.stringify(data));
}


function cleanStatus(value) {

  const status =
    String(value || "DRAFT").toUpperCase();

  if (
    status !== "DRAFT" &&
    status !== "PUBLISHED" &&
    status !== "UNPUBLISHED"
  ) {
    return null;
  }

  return status;
}


/*
 * Convert the manual date + time into the timestamp
 * required by Supabase.
 *
 * Example:
 * 2026-10-04 + 14:30
 * becomes
 * 2026-10-04T14:30:00+01:00
 *
 * Nigeria uses WAT (UTC+1).
 */
function buildKickoff(predictionDate, time) {

  if (!predictionDate || !time) {
    return null;
  }

  const cleanTime = String(time).trim();

  if (!/^\d{2}:\d{2}$/.test(cleanTime)) {
    return null;
  }

  return `${predictionDate}T${cleanTime}:00+01:00`;
}


/*
 * Convert database timestamp back into HH:MM
 * for the admin time input.
 */
function formatKickoff(kickoff) {

  if (!kickoff) {
    return "";
  }

  const value = String(kickoff);

  const match =
    value.match(/T(\d{2}):(\d{2})/);

  if (match) {
    return `${match[1]}:${match[2]}`;
  }

  /*
   * If database somehow contains just HH:MM,
   * leave it unchanged.
   */
  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  return value;
}


function normalizePrediction(row) {

  return {
    ...row,

    prediction:
      row.prediction ||
      row.selection ||
      "",

    kickoff:
      formatKickoff(row.kickoff)
  };
}


function validatePrediction(body) {

  if (!body.prediction_date) {
    return "prediction_date is required.";
  }

  if (!body.home_team) {
    return "home_team is required.";
  }

  if (!body.away_team) {
    return "away_team is required.";
  }

  if (!body.country) {
    return "country is required.";
  }

  if (!body.league) {
    return "league is required.";
  }

  if (!body.kickoff) {
    return "kickoff/time is required.";
  }

  if (!/^\d{2}:\d{2}$/.test(String(body.kickoff))) {
    return "kickoff must be in HH:MM format.";
  }

  if (
    !body.prediction &&
    !body.selection
  ) {
    return "prediction is required.";
  }

  return null;
}


/* ==========================================================
   HANDLER
========================================================== */

module.exports = async function handler(req, res) {

  try {

    /* ======================================================
       GET
    ====================================================== */

    if (req.method === "GET") {

      const {
        date,
        type
      } = req.query || {};


      /* ----------------------------------------------------
         DAILY SLIP
      ---------------------------------------------------- */

      if (type === "daily_slip") {

        if (!date) {
          return sendJson(
            res,
            400,
            {
              success: false,
              error: "date is required."
            }
          );
        }


        const {
          data,
          error
        } = await supabase
          .from("daily_slips")
          .select("*")
          .eq("prediction_date", date)
          .maybeSingle();


        if (error) {

          console.error(
            "Daily slip GET error:",
            error
          );

          return sendJson(
            res,
            500,
            {
              success: false,
              error: error.message
            }
          );
        }


        return sendJson(
          res,
          200,
          {
            success: true,
            slip: data || null
          }
        );
      }


      /* ----------------------------------------------------
         PREDICTIONS
      ---------------------------------------------------- */

      let query = supabase
        .from("predictions")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false
          }
        );


      if (date) {
        query = query.eq(
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
          "Prediction GET error:",
          error
        );

        return sendJson(
          res,
          500,
          {
            success: false,
            error: error.message
          }
        );
      }


      return sendJson(
        res,
        200,
        {
          success: true,
          predictions:
            (data || []).map(
              normalizePrediction
            )
        }
      );
    }


    /* ======================================================
       POST
    ====================================================== */

    if (req.method === "POST") {

      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : (req.body || {});


      /* ----------------------------------------------------
         DAILY SLIP
      ---------------------------------------------------- */

      if (body.type === "daily_slip") {

        const predictionDate =
          body.prediction_date;

        const bookingCode =
          String(
            body.booking_code || ""
          ).trim();

        const bookmaker =
          String(
            body.bookmaker || ""
          ).trim();

        const status =
          cleanStatus(body.status);


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

        if (!bookingCode) {
          return sendJson(
            res,
            400,
            {
              success: false,
              error:
                "booking_code is required."
            }
          );
        }

        if (!bookmaker) {
          return sendJson(
            res,
            400,
            {
              success: false,
              error:
                "bookmaker is required."
            }
          );
        }

        if (!status) {
          return sendJson(
            res,
            400,
            {
              success: false,
              error:
                "Invalid slip status."
            }
          );
        }


        const isPublished =
          status === "PUBLISHED";


        const slipData = {

          prediction_date:
            predictionDate,

          booking_code:
            bookingCode,

          bookmaker:
            bookmaker,

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


        /*
         * Don't use upsert here.
         *
         * First find the existing slip for this date.
         * Then UPDATE or INSERT.
         */
        const existing =
          await supabase
            .from("daily_slips")
            .select("id")
            .eq(
              "prediction_date",
              predictionDate
            )
            .maybeSingle();


        if (existing.error) {

          console.error(
            "Daily slip lookup error:",
            existing.error
          );

          return sendJson(
            res,
            500,
            {
              success: false,
              error:
                existing.error.message
            }
          );
        }


        let data;
        let error;


        if (existing.data) {

          const result =
            await supabase
              .from("daily_slips")
              .update(slipData)
              .eq(
                "id",
                existing.data.id
              )
              .select()
              .single();

          data = result.data;
          error = result.error;

        } else {

          const result =
            await supabase
              .from("daily_slips")
              .insert(slipData)
              .select()
              .single();

          data = result.data;
          error = result.error;

        }


        if (error) {

          console.error(
            "Daily slip save error:",
            error
          );

          return sendJson(
            res,
            500,
            {
              success: false,
              error: error.message
            }
          );
        }


        return sendJson(
          res,
          200,
          {
            success: true,
            slip: data
          }
        );
      }


      /* ----------------------------------------------------
         NORMAL PREDICTION
      ---------------------------------------------------- */

      const validationError =
        validatePrediction(body);


      if (validationError) {

        return sendJson(
          res,
          400,
          {
            success: false,
            error: validationError
          }
        );
      }


      const status =
        cleanStatus(body.status);


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


      const selection =
        String(
          body.prediction ||
          body.selection ||
          ""
        ).trim();


      const kickoff =
        buildKickoff(
          body.prediction_date,
          body.kickoff
        );


      if (!kickoff) {

        return sendJson(
          res,
          400,
          {
            success: false,
            error:
              "Invalid match time."
          }
        );
      }


      const predictionData = {

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
          kickoff,

        market:
          body.market || "MANUAL",

        selection:
          selection,

        confidence:
          Number.isInteger(
            Number(body.confidence)
          )
            ? Number(body.confidence)
            : 7,

        analysis:
          body.analysis || null,

        status:
          status,

        result:
          body.result || "pending",

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
      } = await supabase
        .from("predictions")
        .insert(predictionData)
        .select()
        .single();


      if (error) {

        console.error(
          "Prediction POST error:",
          error
        );

        return sendJson(
          res,
          500,
          {
            success: false,
            error: error.message
          }
        );
      }


      return sendJson(
        res,
        201,
        {
          success: true,
          prediction:
            normalizePrediction(data)
        }
      );
    }


    /* ======================================================
       PUT
    ====================================================== */

    if (req.method === "PUT") {

      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : (req.body || {});


      const id = body.id;


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


      const status =
        body.status
          ? cleanStatus(body.status)
          : null;


      if (
        body.status &&
        !status
      ) {

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


      /*
       * PUBLISH EXISTING PREDICTION
       */

      const onlyStatusUpdate =
        status &&
        !body.home_team &&
        !body.away_team &&
        !body.prediction &&
        !body.selection;


      if (onlyStatusUpdate) {

        const updateData = {

          status:
            status,

          updated_at:
            new Date().toISOString()

        };


        if (status === "PUBLISHED") {

          updateData.published_at =
            new Date().toISOString();

        }


        const {
          data,
          error
        } = await supabase
          .from("predictions")
          .update(updateData)
          .eq("id", id)
          .select()
          .single();


        if (error) {

          return sendJson(
            res,
            500,
            {
              success: false,
              error: error.message
            }
          );
        }


        return sendJson(
          res,
          200,
          {
            success: true,
            prediction:
              normalizePrediction(data)
          }
        );
      }


      /* ----------------------------------------------------
         FULL EDIT
      ---------------------------------------------------- */

      const validationError =
        validatePrediction(body);


      if (validationError) {

        return sendJson(
          res,
          400,
          {
            success: false,
            error: validationError
          }
        );
      }


      const finalStatus =
        status || "DRAFT";


      const selection =
        String(
          body.prediction ||
          body.selection ||
          ""
        ).trim();


      const kickoff =
        buildKickoff(
          body.prediction_date,
          body.kickoff
        );


      const updateData = {

        prediction_date:
          body.prediction_date,

        home_team:
          body.home_team,

        away_team:
          body.away_team,

        country:
          body.country || null,

        league:
          body.league || null,

        kickoff:
          kickoff,

        market:
          body.market || "MANUAL",

        selection:
          selection,

        confidence:
          Number.isInteger(
            Number(body.confidence)
          )
            ? Number(body.confidence)
            : 7,

        analysis:
          body.analysis || null,

        status:
          finalStatus,

        updated_at:
          new Date().toISOString()

      };


      if (finalStatus === "PUBLISHED") {

        updateData.published_at =
          new Date().toISOString();

      }


      const {
        data,
        error
      } = await supabase
        .from("predictions")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();


      if (error) {

        return sendJson(
          res,
          500,
          {
            success: false,
            error: error.message
          }
        );
      }


      return sendJson(
        res,
        200,
        {
          success: true,
          prediction:
            normalizePrediction(data)
        }
      );
    }


    /* ======================================================
       DELETE
    ====================================================== */

    if (req.method === "DELETE") {

      const id =
        req.query &&
        req.query.id;


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
        error
      } = await supabase
        .from("predictions")
        .delete()
        .eq("id", id);


      if (error) {

        return sendJson(
          res,
          500,
          {
            success: false,
            error: error.message
          }
        );
      }


      return sendJson(
        res,
        200,
        {
          success: true,
          message:
            "Prediction deleted successfully."
        }
      );
    }


    return sendJson(
      res,
      405,
      {
        success: false,
        error:
          "Method not allowed."
      }
    );


  } catch (error) {

    console.error(
      "TomsonStakes API error:",
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
