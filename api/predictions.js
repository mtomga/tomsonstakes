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

  res.end(
    JSON.stringify(data)
  );

}


function cleanStatus(value) {

  const status =
    String(value || "DRAFT")
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


function normalizePrediction(row) {

  return {
    ...row,

    // Frontend uses "prediction".
    // Database currently uses "selection".
    prediction:
      row.prediction ||
      row.selection ||
      ""
  };

}


function validatePrediction(body) {

  const predictionDate =
    body.prediction_date;

  const homeTeam =
    body.home_team;

  const awayTeam =
    body.away_team;

  const country =
    body.country;

  const league =
    body.league;

  const kickoff =
    body.kickoff;

  const prediction =
    body.prediction ||
    body.selection;


  if (!predictionDate) {

    return "prediction_date is required.";

  }

  if (!homeTeam) {

    return "home_team is required.";

  }

  if (!awayTeam) {

    return "away_team is required.";

  }

  if (!country) {

    return "country is required.";

  }

  if (!league) {

    return "league is required.";

  }

  if (!kickoff) {

    return "kickoff/time is required.";

  }

  if (!prediction) {

    return "prediction is required.";

  }

  return null;

}


/* ==========================================================
   MAIN HANDLER
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


      /* -----------------------------------------------
         DAILY SLIP
      ------------------------------------------------ */

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


      /* -----------------------------------------------
         PREDICTIONS
      ------------------------------------------------ */

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
            (data || [])
              .map(normalizePrediction)
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


      /* -----------------------------------------------
         DAILY SLIP
      ------------------------------------------------ */

      if (
        body.type === "daily_slip"
      ) {

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
          cleanStatus(
            body.status
          );


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


        const {
          data,
          error
        } = await supabase
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
            "Daily slip POST error:",
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


      /* -----------------------------------------------
         NORMAL MANUAL PREDICTION
      ------------------------------------------------ */

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


      const selection =
        String(
          body.prediction ||
          body.selection ||
          ""
        ).trim();


      /*
       * IMPORTANT:
       *
       * Manual matches do not come from a football API.
       * Therefore fixture_id and team IDs are intentionally null.
       *
       * "market" and "confidence" are retained for compatibility
       * with the existing database.
       */

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
          body.market ||
          "MANUAL",

        selection:
          selection,

        /*
         * Keep an ordinary default so an older NOT NULL
         * confidence column will not break manual entries.
         */

        confidence:
          Number.isInteger(
            Number(body.confidence)
          )
            ? Number(body.confidence)
            : 7,

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


      const id =
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
       * If this is only a Publish action,
       * update the existing record without requiring
       * all the manual-entry fields again.
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

          console.error(
            "Prediction status update error:",
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
            prediction:
              normalizePrediction(data)
          }
        );

      }


      /* -----------------------------------------------
         FULL EDIT
      ------------------------------------------------ */

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
        status ||
        "DRAFT";


      const selection =
        String(
          body.prediction ||
          body.selection ||
          ""
        ).trim();


      const updateData = {

        prediction_date:
          body.prediction_date,

        home_team:
          body.home_team,

        away_team:
          body.away_team,

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
          body.market ||
          "MANUAL",

        selection:
          selection,

        confidence:
          Number.isInteger(
            Number(body.confidence)
          )
            ? Number(body.confidence)
            : 7,

        analysis:
          body.analysis ||
          null,

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

        console.error(
          "Prediction PUT error:",
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

        console.error(
          "Prediction DELETE error:",
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
          message:
            "Prediction deleted successfully."
        }
      );

    }


    /* ======================================================
       METHOD NOT ALLOWED
    ====================================================== */

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
      "TomsonStakes predictions API error:",
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
