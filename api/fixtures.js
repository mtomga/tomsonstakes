// /api/fixtures.js
// ============================================================
// TOMSONSTAKES SPORTMONKS FIXTURE ENGINE
// Version 7.0 - COVERAGE DIAGNOSTIC
//
// Purpose:
// - Verify SportMonks authentication
// - Check fixtures for selected date
// - Check nearby date range
// - Check general accessible fixture feed
// - Preserve the JSON structure expected by admin.html
//
// IMPORTANT:
// This version is intentionally diagnostic.
// Once we identify the leagues available to the token,
// we can lock the endpoint to the correct production strategy.
// ============================================================

export default async function handler(req, res) {

  const VERSION = "TomsonStakes Fixtures V7.0";

  try {

    // ----------------------------------------------------------
    // METHOD
    // ----------------------------------------------------------

    if (req.method !== "GET") {
      return res.status(405).json({
        success: false,
        version: VERSION,
        error: "Method not allowed. Use GET."
      });
    }

    // ----------------------------------------------------------
    // DATE
    // ----------------------------------------------------------

    const rawDate = req.query?.date;

    if (!rawDate) {
      return res.status(400).json({
        success: false,
        version: VERSION,
        error: "Date is required. Use YYYY-MM-DD."
      });
    }

    const date = String(rawDate).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        version: VERSION,
        error: "Invalid date format. Use YYYY-MM-DD."
      });
    }

    // Validate calendar date
    const [year, month, day] = date.split("-").map(Number);

    const testDate = new Date(
      Date.UTC(year, month - 1, day)
    );

    if (
      testDate.getUTCFullYear() !== year ||
      testDate.getUTCMonth() !== month - 1 ||
      testDate.getUTCDate() !== day
    ) {
      return res.status(400).json({
        success: false,
        version: VERSION,
        error: "Invalid calendar date."
      });
    }

    // ----------------------------------------------------------
    // TOKEN
    // ----------------------------------------------------------

    const token =
      process.env.SPORTMONKS_API_TOKEN ||
      process.env.SPORTMONKS_TOKEN ||
      process.env.SPORTMONKS_API_KEY;

    if (!token) {

      console.error(
        "SPORTMONKS token is not configured."
      );

      return res.status(500).json({
        success: false,
        version: VERSION,
        error:
          "SportMonks API token is not configured."
      });
    }

    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------

    function addDays(dateString, amount) {

      const [y, m, d] =
        dateString.split("-").map(Number);

      const dt = new Date(
        Date.UTC(y, m - 1, d)
      );

      dt.setUTCDate(
        dt.getUTCDate() + amount
      );

      return dt
        .toISOString()
        .slice(0, 10);
    }

    async function sportmonksRequest(
      endpoint,
      params = {}
    ) {

      const url =
        new URL(
          `https://api.sportmonks.com/v3/football${endpoint}`
        );

      url.searchParams.set(
        "api_token",
        token
      );

      url.searchParams.set(
        "timezone",
        "Africa/Lagos"
      );

      for (
        const [key, value]
        of Object.entries(params)
      ) {

        if (
          value !== undefined &&
          value !== null &&
          value !== ""
        ) {
          url.searchParams.set(
            key,
            String(value)
          );
        }
      }

      console.log(
        "SportMonks request:",
        endpoint
      );

      const response =
        await fetch(
          url.toString(),
          {
            method: "GET",
            headers: {
              "Accept": "application/json"
            }
          }
        );

      const text =
        await response.text();

      let data = {};

      try {

        data =
          text
            ? JSON.parse(text)
            : {};

      } catch (error) {

        return {
          ok: false,
          httpStatus: response.status,
          data: null,
          raw: text?.slice(0, 1000),
          parseError: true
        };

      }

      return {
        ok: response.ok,
        httpStatus: response.status,
        data,
        raw: null,
        parseError: false
      };
    }

    // ----------------------------------------------------------
    // 1. EXACT DATE
    // ----------------------------------------------------------

    const exactResult =
      await sportmonksRequest(
        `/fixtures/date/${date}`,
        {
          include:
            "participants;scores;state;league"
        }
      );

    const exactFixtures =
      Array.isArray(
        exactResult?.data?.data
      )
        ? exactResult.data.data
        : [];

    // ----------------------------------------------------------
    // 2. DATE RANGE
    // ----------------------------------------------------------

    const rangeEnd =
      addDays(date, 7);

    const rangeResult =
      await sportmonksRequest(
        `/fixtures/between/${date}/${rangeEnd}`,
        {
          include:
            "participants;scores;state;league"
        }
      );

    const rangeFixtures =
      Array.isArray(
        rangeResult?.data?.data
      )
        ? rangeResult.data.data
        : [];

    // ----------------------------------------------------------
    // 3. GENERAL FIXTURE FEED
    // ----------------------------------------------------------

    const allResult =
      await sportmonksRequest(
        `/fixtures`,
        {
          include:
            "participants;scores;state;league",
          per_page: 10
        }
      );

    const allFixtures =
      Array.isArray(
        allResult?.data?.data
      )
        ? allResult.data.data
        : [];

    // ----------------------------------------------------------
    // UNIQUE LEAGUES
    // ----------------------------------------------------------

    function extractLeagueInfo(fixtures) {

      const map =
        new Map();

      fixtures.forEach(
        fixture => {

          const league =
            fixture?.league ||
            {};

          if (!league?.id) {
            return;
          }

          if (!map.has(league.id)) {

            map.set(
              league.id,
              {
                id: league.id,
                name:
                  league.name ||
                  null,
                country:
                  league.country?.name ||
                  league.country ||
                  null
              }
            );

          }

        }
      );

      return [
        ...map.values()
      ];
    }

    const exactLeagues =
      extractLeagueInfo(
        exactFixtures
      );

    const rangeLeagues =
      extractLeagueInfo(
        rangeFixtures
      );

    const allLeagues =
      extractLeagueInfo(
        allFixtures
      );

    // ----------------------------------------------------------
    // SAMPLE FIXTURES
    // ----------------------------------------------------------

    function fixtureSample(fixtures) {

      return fixtures
        .slice(0, 10)
        .map(
          fixture => ({

            id:
              fixture?.id ||
              null,

            name:
              fixture?.name ||
              null,

            starting_at:
              fixture?.starting_at ||
              null,

            starting_at_timestamp:
              fixture?.starting_at_timestamp ||
              null,

            state:
              fixture?.state
                ? {
                    id:
                      fixture.state.id ||
                      null,
                    name:
                      fixture.state.name ||
                      null,
                    short_code:
                      fixture.state.short_code ||
                      null
                  }
                : null,

            league:
              fixture?.league
                ? {
                    id:
                      fixture.league.id ||
                      null,
                    name:
                      fixture.league.name ||
                      null,
                    country:
                      fixture.league.country?.name ||
                      fixture.league.country ||
                      null
                  }
                : null,

            participants:
              Array.isArray(
                fixture?.participants
              )
                ? fixture.participants.map(
                    team => ({
                      id:
                        team?.id ||
                        null,
                      name:
                        team?.name ||
                        null,
                      meta:
                        team?.meta ||
                        null
                    })
                  )
                : []

          })
        );

    }

    // ----------------------------------------------------------
    // PROVIDER ERRORS
    // ----------------------------------------------------------

    function extractProviderError(result) {

      if (!result) {
        return null;
      }

      if (result.data?.message) {
        return result.data.message;
      }

      if (result.data?.error) {
        return result.data.error;
      }

      if (result.data?.errors) {
        return result.data.errors;
      }

      if (result.raw) {
        return result.raw;
      }

      return null;
    }

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.status(200).json({

      success: true,

      version: VERSION,

      source: "SportMonks",

      request: {
        date,
        timezone: "Africa/Lagos",
        timezoneLabel: "WAT"
      },

      diagnostics: {

        authentication:
          exactResult.httpStatus === 401
            ? "FAILED"
            : "PASSED",

        exactDate: {
          date,
          httpStatus:
            exactResult.httpStatus,
          fixtureCount:
            exactFixtures.length,
          leagueCount:
            exactLeagues.length,
          providerError:
            extractProviderError(
              exactResult
            )
        },

        nextSevenDays: {
          from: date,
          to: rangeEnd,
          httpStatus:
            rangeResult.httpStatus,
          fixtureCount:
            rangeFixtures.length,
          leagueCount:
            rangeLeagues.length,
          providerError:
            extractProviderError(
              rangeResult
            )
        },

        generalFixtureFeed: {
          httpStatus:
            allResult.httpStatus,
          fixtureCount:
            allFixtures.length,
          leagueCount:
            allLeagues.length,
          providerError:
            extractProviderError(
              allResult
            )
        }

      },

      results: {

        count:
          exactFixtures.length,

        countries:
          exactLeagues
            .map(
              league =>
                league.country
            )
            .filter(Boolean)
            .filter(
              (value, index, array) =>
                array.indexOf(value) === index
            )
            .sort(),

        leagues:
          exactLeagues.length

      },

      summary: {

        total:
          exactFixtures.length,

        upcoming: 0,

        live: 0,

        finished: 0,

        postponed: 0,

        cancelled: 0,

        other:
          exactFixtures.length

      },

      statusSummary: {},

      countries:
        exactLeagues
          .map(
            league =>
              league.country
          )
          .filter(Boolean)
          .filter(
            (value, index, array) =>
              array.indexOf(value) === index
          )
          .sort(),

      leagues:
        exactLeagues,

      paging: {

        current:
          exactResult?.data?.pagination?.current_page ||
          1,

        total:
          exactResult?.data?.pagination?.total_pages ||
          1,

        perPage:
          exactResult?.data?.pagination?.per_page ||
          exactFixtures.length

      },

      provider: {

        name:
          "SportMonks",

        endpoint:
          "/v3/football/fixtures/date/{date}",

        timezone:
          "Africa/Lagos",

        providerResults:
          exactFixtures.length,

        sevenDayResults:
          rangeFixtures.length,

        generalResults:
          allFixtures.length

      },

      debug: {

        exactDateSample:
          fixtureSample(
            exactFixtures
          ),

        sevenDaySample:
          fixtureSample(
            rangeFixtures
          ),

        generalSample:
          fixtureSample(
            allFixtures
          ),

        availableLeagues:
          allLeagues

      },

      response:
        exactFixtures

    });

  } catch (error) {

    console.error(
      "TOMSONSTAKES SPORTMONKS V7 ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      version: VERSION,

      error:
        "Unable to retrieve football fixtures.",

      details:
        error?.message ||
        "Unknown server error."

    });

  }

}
