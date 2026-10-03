// /api/fixtures.js
// ============================================================
// TOMSONSTAKES GLOBAL FOOTBALL
// FIXTURES API V4.0
//
// Purpose:
// - Retrieve fixtures for a specific date
// - Use Nigeria/WAT timezone
// - Preserve fixture ID
// - Preserve home/away team IDs
// - Preserve league ID and season
// - Add a clean normalized match object
// - Keep raw API-Football response available
//
// IMPORTANT:
// This endpoint does NOT calculate predictions.
// Prediction calculations are handled by /api/predict.js
// ============================================================

export default async function handler(req, res) {
  try {
    const { date } = req.query;

    // ----------------------------------------------------------
    // 1. Validate date
    // ----------------------------------------------------------

    if (!date) {
      return res.status(400).json({
        success: false,
        error: "Date is required. Use YYYY-MM-DD."
      });
    }

    // Basic YYYY-MM-DD validation
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(date)) {
      return res.status(400).json({
        success: false,
        error: "Invalid date format. Use YYYY-MM-DD."
      });
    }

    // ----------------------------------------------------------
    // 2. API key
    // ----------------------------------------------------------

    const apiKey = process.env.APIFOOTBALL_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "API key is not configured."
      });
    }

    // ----------------------------------------------------------
    // 3. Request API-Football
    //
    // timezone=Europe/Lagos ensures kickoff times are returned
    // in Nigeria local time.
    // ----------------------------------------------------------

    const apiUrl =
      `https://v3.football.api-sports.io/fixtures` +
      `?date=${encodeURIComponent(date)}` +
      `&timezone=Europe/Lagos`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey
      }
    });

    // ----------------------------------------------------------
    // 4. Safely parse response
    // ----------------------------------------------------------

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (parseError) {
      return res.status(502).json({
        success: false,
        error: "API-Football returned invalid JSON.",
        details: text.slice(0, 500)
      });
    }

    // ----------------------------------------------------------
    // 5. API error handling
    // ----------------------------------------------------------

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: "API-Football request failed.",
        api: data
      });
    }

    // API-Football can return errors even with HTTP 200.
    if (data.errors && Object.keys(data.errors).length > 0) {
      return res.status(502).json({
        success: false,
        error: "API-Football returned an API error.",
        api: data
      });
    }

    // ----------------------------------------------------------
    // 6. Raw fixtures
    // ----------------------------------------------------------

    const fixtures = Array.isArray(data.response)
      ? data.response
      : [];

    // ----------------------------------------------------------
    // 7. Normalize fixtures
    //
    // This is the important V4.0 change.
    //
    // The frontend will receive explicit:
    //
    // fixtureId
    // homeTeamId
    // awayTeamId
    // leagueId
    // season
    //
    // Therefore /api/predict.js does not need to guess
    // which IDs belong to the selected match.
    // ----------------------------------------------------------

    const matches = fixtures.map((fixture) => {
      const fixtureId = fixture?.fixture?.id ?? null;

      const homeTeamId =
        fixture?.teams?.home?.id ?? null;

      const awayTeamId =
        fixture?.teams?.away?.id ?? null;

      const leagueId =
        fixture?.league?.id ?? null;

      const season =
        fixture?.league?.season ?? null;

      return {
        fixtureId,

        homeTeamId,
        awayTeamId,

        leagueId,
        season,

        home: {
          id: homeTeamId,
          name: fixture?.teams?.home?.name ?? null,
          logo: fixture?.teams?.home?.logo ?? null,
          winner: fixture?.teams?.home?.winner ?? null
        },

        away: {
          id: awayTeamId,
          name: fixture?.teams?.away?.name ?? null,
          logo: fixture?.teams?.away?.logo ?? null,
          winner: fixture?.teams?.away?.winner ?? null
        },

        league: {
          id: leagueId,
          name: fixture?.league?.name ?? null,
          country: fixture?.league?.country ?? null,
          season,
          round: fixture?.league?.round ?? null,
          logo: fixture?.league?.logo ?? null
        },

        fixture: {
          id: fixtureId,
          date: fixture?.fixture?.date ?? null,
          timestamp: fixture?.fixture?.timestamp ?? null,
          timezone: fixture?.fixture?.timezone ?? "UTC",
          status: fixture?.fixture?.status ?? null,
          venue: fixture?.fixture?.venue ?? null
        }
      };
    });

    // ----------------------------------------------------------
    // 8. Check for malformed fixtures
    // ----------------------------------------------------------

    const validMatches = matches.filter(
      (match) =>
        match.fixtureId &&
        match.homeTeamId &&
        match.awayTeamId
    );

    const invalidCount =
      matches.length - validMatches.length;

    // ----------------------------------------------------------
    // 9. Return V4.0 response
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,

      version: "V4.0",

      date,

      timezone: "Europe/Lagos",

      count: validMatches.length,

      invalidFixtures: invalidCount,

      matches: validMatches,

      // Keep original API-Football response for compatibility.
      raw: data.response || [],

      paging: data.paging || null
    });

  } catch (error) {
    console.error("fixtures.js error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to retrieve football fixtures.",
      details: error?.message || "Unknown server error"
    });
  }
}
