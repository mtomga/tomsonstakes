const fetch = global.fetch;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET."
    });
  }

  const apiKey = process.env.APIFOOTBALL_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "APIFOOTBALL_KEY is not configured."
    });
  }
 
  /*
   * ============================================================
   * API-FOOTBALL ACCOUNT STATUS CHECK
   *
   * Open:
   * /api/fixtures?status=1
   *
   * This uses the existing serverless function, so it does NOT
   * create another Vercel function.
   * ============================================================
   */

  if (req.query.status === "1") {
    try {
      const response = await fetch(
        "https://v3.football.api-sports.io/status",
        {
          method: "GET",
          headers: {
            "x-apisports-key": apiKey,
            "Accept": "application/json"
          }
        }
      );

      const rawText = await response.text();

      let data;

      try {
        data = JSON.parse(rawText);
      } catch (parseError) {
        return res.status(502).json({
          success: false,
          diagnostic: true,
          error: "API-Football returned a non-JSON response.",
          providerStatus: response.status,
          providerResponse: rawText.slice(0, 2000)
        });
      }

      return res.status(response.ok ? 200 : response.status).json({
        success: response.ok,
        diagnostic: true,
        providerStatus: response.status,
        providerErrors: data && data.errors
          ? data.errors
          : {},
        providerMessage: data && data.message
          ? data.message
          : null,
        account: data &&
          data.response &&
          data.response.account
          ? data.response.account
          : null,
        subscription: data &&
          data.response &&
          data.response.subscription
          ? data.response.subscription
          : null,
        requests: data &&
          data.response &&
          data.response.requests
          ? data.response.requests
          : null,
        providerResponse: data
      });

    } catch (error) {
      console.error(
        "API-Football status check error:",
        error
      );

      return res.status(500).json({
        success: false,
        diagnostic: true,
        error: "Unable to connect to API-Football.",
        message: error && error.message
          ? error.message
          : "Unknown server error."
      });
    }
  }

  /*
   * ============================================================
   * NORMAL FIXTURE ENGINE
   * ============================================================
   */

  const date = String(req.query.date || "").trim();

  // Require YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      error: "A valid date is required in YYYY-MM-DD format."
    });
  }

  // Validate calendar date
  const [year, month, day] = date.split("-").map(Number);
  const checkDate = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return res.status(400).json({
      success: false,
      error: "Invalid calendar date."
    });
  }

  try {
    const providerUrl =
      `https://v3.football.api-sports.io/fixtures?date=${encodeURIComponent(date)}`;

    const response = await fetch(providerUrl, {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey,
        "Accept": "application/json"
      }
    });

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      return res.status(502).json({
        success: false,
        error: "Football data provider returned invalid JSON.",
        providerStatus: response.status
      });
    }

    // HTTP-level provider error
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "Football data provider request failed.",
        providerStatus: response.status,
        providerErrors: data && data.errors
          ? data.errors
          : {},
        message: data && data.message
          ? data.message
          : null
      });
    }

    // API-Football application-level error
    if (
      data &&
      data.errors &&
      typeof data.errors === "object" &&
      Object.keys(data.errors).length > 0
    ) {
      return res.status(502).json({
        success: false,
        error: "Football data provider returned an error.",
        providerErrors: data.errors,
        providerMessage: data.message || null
      });
    }

    const fixtures =
      Array.isArray(data && data.response)
        ? data.response
        : [];

    /*
     * ============================================================
     * SUMMARY INFORMATION
     * ============================================================
     */

    const countries = [
      ...new Set(
        fixtures
          .map(f => f && f.league && f.league.country)
          .filter(Boolean)
      )
    ].sort();

    const leagues = [
      ...new Set(
        fixtures
          .map(f => f && f.league && f.league.name)
          .filter(Boolean)
      )
    ].sort();

    const summary = {
      total: fixtures.length,
      upcoming: 0,
      live: 0,
      finished: 0,
      postponed: 0,
      cancelled: 0,
      other: 0
    };

    const statusSummary = {};

    fixtures.forEach(fixture => {
      const status =
        fixture &&
        fixture.fixture &&
        fixture.fixture.status
          ? fixture.fixture.status
          : {};

      const short = String(
        status.short || "UNKNOWN"
      ).toUpperCase();

      statusSummary[short] =
        (statusSummary[short] || 0) + 1;

      if (
        ["NS", "TBD"].includes(short)
      ) {
        summary.upcoming++;
      } else if (
        ["1H", "HT", "2H", "ET", "BT", "P"].includes(short)
      ) {
        summary.live++;
      } else if (
        ["FT", "AET", "PEN"].includes(short)
      ) {
        summary.finished++;
      } else if (short === "PST") {
        summary.postponed++;
      } else if (
        ["CANC", "ABD", "AWD", "WO"].includes(short)
      ) {
        summary.cancelled++;
      } else {
        summary.other++;
      }
    });

    /*
     * ============================================================
     * CACHE CONTROL
     * ============================================================
     */

    res.setHeader(
      "Cache-Control",
      "no-store, max-age=0"
    );

    /*
     * ============================================================
     * NORMAL RESPONSE
     * ============================================================
     */

    return res.status(200).json({
      success: true,

      version: "TomsonStakes Fixtures V4.0",

      source: "API-Football",

      request: {
        date,
        timezone: "Africa/Lagos",
        timezoneLabel: "WAT"
      },

      results: {
        count: fixtures.length,
        countries,
        leagues
      },

      summary,

      statusSummary,

      countries,

      leagues,

      paging: data && data.paging
        ? data.paging
        : null,

      quota: data && data.response
        ? null
        : null,

      response: fixtures
    });

  } catch (error) {
    console.error(
      "Fixture provider error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to connect to football data provider.",
      message: error && error.message
        ? error.message
        : "Unknown server error."
    });
  }
};

After deployment

Don't create another file.

Open this:

https://YOUR-VERCEL-DOMAIN.vercel.app/api/fixtures?status=1

For example:

https://tomsonstakes.vercel.app/api/fixtures?status=1

Then send me the complete JSON response.

The key part we're looking for is:

"account": {...},
"subscription": {...},
"requests": {...},
"providerErrors": {...}

This keeps us within your Vercel Hobby limit and lets us diagnose the suspended API-Football account using the function you already have.
