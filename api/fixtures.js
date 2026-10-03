// /api/fixtures.js
// ============================================================
// TOMSONSTAKES GLOBAL FIXTURE ENGINE
// Version 4.0
//
// Purpose:
// - Retrieve global football fixtures for a selected date
// - Act as the frontend fixture-discovery layer
// - Preserve complete API-Football fixture objects
// - Provide clean metadata for the frontend
//
// IMPORTANT:
// - This endpoint DOES NOT predict matches.
// - This endpoint DOES NOT analyze teams.
// - This endpoint DOES NOT call api/predict.js.
// - This endpoint DOES NOT call api/analyze.js.
// - Prediction and analysis happen only after the user
//   selects an individual fixture.
//
// API-Football endpoint:
// GET /fixtures?date=YYYY-MM-DD
// ============================================================

export default async function handler(req, res) {

  try {

    // ==========================================================
    // REQUEST METHOD
    // ==========================================================

    if (req.method !== "GET") {

      return res.status(405).json({
        success: false,
        error: "Method not allowed. Use GET."
      });

    }


    // ==========================================================
    // REQUEST PARAMETERS
    // ==========================================================

    const rawDate =
      req.query?.date;


    // ==========================================================
    // VALIDATE DATE
    // ==========================================================

    if (!rawDate) {

      return res.status(400).json({

        success: false,

        error:
          "Date is required. Use YYYY-MM-DD."

      });

    }


    const date =
      String(rawDate).trim();


    // Strict YYYY-MM-DD format
    const datePattern =
      /^\d{4}-\d{2}-\d{2}$/;


    if (!datePattern.test(date)) {

      return res.status(400).json({

        success: false,

        error:
          "Invalid date format. Use YYYY-MM-DD."

      });

    }


    // ==========================================================
    // VALIDATE THAT THE DATE ACTUALLY EXISTS
    // ==========================================================

    const dateParts =
      date.split("-").map(Number);


    const year =
      dateParts[0];

    const month =
      dateParts[1];

    const day =
      dateParts[2];


    const dateObject =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day
        )
      );


    const validDate =
      dateObject.getUTCFullYear() === year &&
      dateObject.getUTCMonth() === month - 1 &&
      dateObject.getUTCDate() === day;


    if (!validDate) {

      return res.status(400).json({

        success: false,

        error:
          "Invalid calendar date."

      });

    }


    // ==========================================================
    // API KEY
    // ==========================================================

    const apiKey =
      process.env.APIFOOTBALL_KEY;


    if (!apiKey) {

      console.error(
        "APIFOOTBALL_KEY is not configured."
      );


      return res.status(500).json({

        success: false,

        error:
          "APIFOOTBALL_KEY is not configured."

      });

    }


    // ==========================================================
    // API URL
    // ==========================================================

    const apiUrl =
      "https://v3.football.api-sports.io/fixtures";


    const url =
      `${apiUrl}?date=${encodeURIComponent(date)}`;


    // ==========================================================
    // API REQUEST
    // ==========================================================

    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {

            "x-apisports-key":
              apiKey,

            "Accept":
              "application/json"

          }
        }
      );


    // ==========================================================
    // READ RESPONSE SAFELY
    // ==========================================================

    const text =
      await response.text();


    let data;


    try {

      data =
        text
          ? JSON.parse(text)
          : {};

    } catch (parseError) {

      console.error(
        "API-Football returned non-JSON:",
        text?.slice(0, 500)
      );


      return res.status(502).json({

        success: false,

        error:
          "Football data provider returned an invalid response.",

        providerStatus:
          response.status

      });

    }


    // ==========================================================
    // HTTP ERROR
    // ==========================================================

    if (!response.ok) {

      console.error(
        "API-Football HTTP error:",
        response.status,
        data
      );


      return res.status(
        response.status >= 400 &&
        response.status <= 599
          ? response.status
          : 502
      ).json({

        success: false,

        error:
          "Football data provider request failed.",

        providerStatus:
          response.status,

        providerErrors:
          data?.errors || {},

        message:
          data?.message ||
          null

      });

    }


    // ==========================================================
    // API-FOOTBALL APPLICATION ERRORS
    // ==========================================================

    if (
      data?.errors &&
      typeof data.errors === "object" &&
      Object.keys(data.errors).length > 0
    ) {

      console.error(
        "API-Football application errors:",
        data.errors
      );


      return res.status(502).json({

        success: false,

        error:
          "Football data provider returned an error.",

        providerErrors:
          data.errors

      });

    }


    // ==========================================================
    // FIXTURE ARRAY
    // ==========================================================

    const fixtures =
      Array.isArray(data?.response)
        ? data.response
        : [];


    // ==========================================================
    // PAGINATION
    // ==========================================================

    const paging =
      data?.paging || {};


    const currentPage =
      Number(paging.current) || 1;


    const totalPages =
      Number(paging.total) || 1;


    // ==========================================================
    // BASIC FIXTURE METADATA
    // ==========================================================

    const fixtureCount =
      fixtures.length;


    const countries =
      [
        ...new Set(
          fixtures
            .map(
              fixture =>
                fixture?.league?.country
            )
            .filter(Boolean)
        )
      ]
      .sort(
        (a, b) =>
          String(a).localeCompare(
            String(b)
          )
      );


    const leagues =
      [
        ...new Map(
          fixtures
            .filter(
              fixture =>
                fixture?.league?.id
            )
            .map(
              fixture => [
                fixture.league.id,
                {
                  id:
                    fixture.league.id,

                  name:
                    fixture.league.name ||
                    null,

                  country:
                    fixture.league.country ||
                    null,

                  logo:
                    fixture.league.logo ||
                    null,

                  flag:
                    fixture.league.flag ||
                    null
                }
              ]
            )
        ).values()
      ];


    // ==========================================================
    // STATUS SUMMARY
    // ==========================================================

    const statusSummary = {};


    fixtures.forEach(
      fixture => {

        const status =
          String(
            fixture
              ?.fixture
              ?.status
              ?.short ||
            "UNKNOWN"
          )
          .toUpperCase();


        statusSummary[status] =
          (
            statusSummary[status] ||
            0
          ) + 1;

      }
    );


    // ==========================================================
    // UPCOMING / LIVE / FINISHED SUMMARY
    // ==========================================================

    const upcomingStatuses =
      new Set([
        "NS",
        "TBD"
      ]);


    const liveStatuses =
      new Set([
        "1H",
        "HT",
        "2H",
        "ET",
        "BT",
        "P",
        "LIVE"
      ]);


    const finishedStatuses =
      new Set([
        "FT",
        "AET",
        "PEN",
        "AWD",
        "WO"
      ]);


    const postponedStatuses =
      new Set([
        "PST"
      ]);


    const cancelledStatuses =
      new Set([
        "CANC",
        "ABD"
      ]);


    let upcoming =
      0;

    let live =
      0;

    let finished =
      0;

    let postponed =
      0;

    let cancelled =
      0;


    fixtures.forEach(
      fixture => {

        const status =
          String(
            fixture
              ?.fixture
              ?.status
              ?.short ||
            ""
          )
          .toUpperCase();


        if (
          upcomingStatuses.has(
            status
          )
        ) {

          upcoming++;

        }

        else if (
          liveStatuses.has(
            status
          )
        ) {

          live++;

        }

        else if (
          finishedStatuses.has(
            status
          )
        ) {

          finished++;

        }

        else if (
          postponedStatuses.has(
            status
          )
        ) {

          postponed++;

        }

        else if (
          cancelledStatuses.has(
            status
          )
        ) {

          cancelled++;

        }

      }
    );


    // ==========================================================
    // API QUOTA INFORMATION
    //
    // API-Sports exposes rate-limit information through
    // response headers. We read it when available.
    // ==========================================================

    const requestsRemaining =
      response.headers.get(
        "x-ratelimit-requests-remaining"
      );


    const requestsLimit =
      response.headers.get(
        "x-ratelimit-requests-limit"
      );


    const quota = {

      requestsRemaining:
        requestsRemaining !== null
          ? Number(
              requestsRemaining
            )
          : null,

      requestsLimit:
        requestsLimit !== null
          ? Number(
              requestsLimit
            )
          : null

    };


    // ==========================================================
    // RESPONSE HEADERS
    //
    // The frontend normally fetches fresh fixture data.
    // Avoid aggressive caching because live fixture states
    // can change.
    // ==========================================================

    res.setHeader(
      "Cache-Control",
      "no-store"
    );


    // ==========================================================
    // FINAL RESPONSE
    // ==========================================================

    return res.status(200).json({

      success: true,

      version:
        "TomsonStakes Fixtures V4.0",

      source:
        "API-Football",

      request: {

        date,

        timezone:
          "Africa/Lagos",

        timezoneLabel:
          "WAT"

      },

      results: {

        count:
          fixtureCount,

        countries:
          countries.length,

        leagues:
          leagues.length

      },

      summary: {

        total:
          fixtureCount,

        upcoming,

        live,

        finished,

        postponed,

        cancelled,

        other:
          fixtureCount -
          (
            upcoming +
            live +
            finished +
            postponed +
            cancelled
          )

      },

      statusSummary,

      countries,

      leagues,

      paging: {

        current:
          currentPage,

        total:
          totalPages

      },

      quota,

      /*
       * Keep the original API-Football fixture objects intact.
       *
       * This is important because the frontend uses:
       *
       * fixture.id
       * fixture.date
       * fixture.timestamp
       * fixture.status
       * league
       * teams
       * goals
       *
       * and other fields.
       */

      response:
        fixtures

    });

  } catch (error) {

    console.error(
      "TOMSONSTAKES FIXTURES V4.0 ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      version:
        "TomsonStakes Fixtures V4.0",

      error:
        "Unable to retrieve football fixtures.",

      details:
        error?.message ||
        "Unknown server error."

    });

  }

}
