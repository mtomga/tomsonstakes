// api/fixtures.js
// TOMSONSTAKES GLOBAL FIXTURE ENGINE
// SportMonks Edition
// Version 5.0
//
// IMPORTANT:
// - Keeps the existing /api/fixtures?date=YYYY-MM-DD interface.
// - Returns an API-Football-compatible "response" array so the
//   existing TomsonStakes admin.html can continue consuming fixtures.
// - Uses ONE existing Vercel serverless function.
// - Does NOT create another /api/*.js function.
//
// Required Vercel Environment Variable:
// SPORTMONKS_API_TOKEN

export default async function handler(req, res) {
  const startedAt = Date.now();

  // ------------------------------------------------------------
  // CORS
  // ------------------------------------------------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).json({ success: true });
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET."
    });
  }

  // ------------------------------------------------------------
  // ENVIRONMENT
  // ------------------------------------------------------------
  const apiToken = process.env.SPORTMONKS_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({
      success: false,
      error: "SportMonks API token is not configured.",
      hint: "Add SPORTMONKS_API_TOKEN to Vercel Environment Variables."
    });
  }

  // ------------------------------------------------------------
  // DATE
  // ------------------------------------------------------------
  const rawDate =
    req.query?.date ||
    req.query?.prediction_date ||
    req.query?.fixture_date;

  if (!rawDate) {
    return res.status(400).json({
      success: false,
      error: "Missing date parameter.",
      expected: "/api/fixtures?date=YYYY-MM-DD"
    });
  }

  const date = String(rawDate).trim();

  // Strict YYYY-MM-DD validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      error: "Invalid date format.",
      received: date,
      expected: "YYYY-MM-DD"
    });
  }

  // Prevent invalid calendar dates such as 2026-99-99.
  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return res.status(400).json({
      success: false,
      error: "Invalid calendar date.",
      received: date
    });
  }

  // ------------------------------------------------------------
  // SPORTMONKS REQUEST
  // ------------------------------------------------------------
  //
  // SportMonks officially supports:
  //
  // GET /v3/football/fixtures/date/{date}
  //
  // We request participants, league, country and venue so the
  // response can be normalized into the structure used by the
  // existing TomsonStakes admin page.
  //
  const url =
    `https://api.sportmonks.com/v3/football/fixtures/date/${date}` +
    `?include=participants;league.country;venue;state;round;stage`;

  let providerResponse;

  try {
    providerResponse = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiToken}`
      }
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: "Could not connect to SportMonks.",
      details: error?.message || "Network error"
    });
  }

  // ------------------------------------------------------------
  // READ PROVIDER RESPONSE
  // ------------------------------------------------------------
  let providerData;

  try {
    providerData = await providerResponse.json();
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: "SportMonks returned an invalid JSON response.",
      httpStatus: providerResponse.status
    });
  }

  // ------------------------------------------------------------
  // PROVIDER ERROR HANDLING
  // ------------------------------------------------------------
  if (!providerResponse.ok) {
    return res.status(providerResponse.status).json({
      success: false,
      error: "SportMonks returned an error.",
      providerStatus: providerResponse.status,
      providerErrors:
        providerData?.message ||
        providerData?.errors ||
        providerData
    });
  }

  // SportMonks normally places fixtures inside data.
  const sportmonksFixtures = Array.isArray(providerData?.data)
    ? providerData.data
    : [];

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------

  function safeString(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    return String(value);
  }

  function getParticipant(fixture, position) {
    const participants = Array.isArray(fixture?.participants)
      ? fixture.participants
      : [];

    return (
      participants.find(
        (participant) =>
          participant?.meta?.location === position
      ) ||
      participants.find(
        (participant) =>
          participant?.location === position
      ) ||
      null
    );
  }

  function getTeamName(participant) {
    return (
      participant?.name ||
      participant?.short_code ||
      participant?.short_name ||
      "Unknown Team"
    );
  }

  function getTeamId(participant) {
    return (
      participant?.id ??
      null
    );
  }

  function getTeamLogo(participant) {
    return (
      participant?.image_path ||
      participant?.logo ||
      null
    );
  }

  function getLeagueName(fixture) {
    return (
      fixture?.league?.name ||
      fixture?.league_name ||
      "Unknown League"
    );
  }

  function getCountryName(fixture) {
    return (
      fixture?.league?.country?.name ||
      fixture?.country?.name ||
      fixture?.country_name ||
      "International"
    );
  }

  function getVenueName(fixture) {
    return (
      fixture?.venue?.name ||
      null
    );
  }

  function getStatus(fixture) {
    const stateName =
      fixture?.state?.name ||
      fixture?.state?.short_name ||
      "";

    const stateId = fixture?.state_id;

    const state = String(stateName).toLowerCase();

    // Common SportMonks states.
    if (
      state.includes("finished") ||
      state.includes("full time") ||
      state === "ft"
    ) {
      return "FT";
    }

    if (
      state.includes("live") ||
      state.includes("inplay") ||
      state.includes("in play")
    ) {
      return "LIVE";
    }

    if (
      state.includes("postpon")
    ) {
      return "PST";
    }

    if (
      state.includes("cancel")
    ) {
      return "CANC";
    }

    if (
      state.includes("abandon")
    ) {
      return "ABD";
    }

    // SportMonks commonly uses state_id 1 for not started,
    // but we intentionally don't depend only on numeric IDs.
    if (stateId === 1) {
      return "NS";
    }

    return stateName
      ? String(stateName).toUpperCase()
      : "NS";
  }

  function getKickoff(fixture) {
    if (fixture?.starting_at) {
      return fixture.starting_at;
    }

    if (fixture?.starting_at_timestamp) {
      const timestamp = Number(fixture.starting_at_timestamp);

      if (Number.isFinite(timestamp)) {
        return new Date(timestamp * 1000).toISOString();
      }
    }

    return null;
  }

  function getScore(fixture) {
    const scores = Array.isArray(fixture?.scores)
      ? fixture.scores
      : [];

    let homeScore = null;
    let awayScore = null;

    for (const score of scores) {
      const participant =
        score?.participant ||
        score?.participant_type ||
        "";

      const participantText = String(participant).toLowerCase();

      const goals =
        score?.score?.goals ??
        score?.goals ??
        null;

      if (
        participantText === "home" ||
        participantText.includes("home")
      ) {
        homeScore = goals;
      }

      if (
        participantText === "away" ||
        participantText.includes("away")
      ) {
        awayScore = goals;
      }
    }

    return {
      home: homeScore,
      away: awayScore
    };
  }

  // ------------------------------------------------------------
  // NORMALIZE SPORTMONKS -> API-FOOTBALL-LIKE STRUCTURE
  // ------------------------------------------------------------

  const response = sportmonksFixtures
    .map((fixture) => {
      const home = getParticipant(fixture, "home");
      const away = getParticipant(fixture, "away");

      const kickoff = getKickoff(fixture);
      const statusShort = getStatus(fixture);
      const score = getScore(fixture);

      const homeTeam = {
        id: getTeamId(home),
        name: getTeamName(home),
        logo: getTeamLogo(home),
        winner:
          score.home !== null &&
          score.away !== null
            ? Number(score.home) > Number(score.away)
            : null
      };

      const awayTeam = {
        id: getTeamId(away),
        name: getTeamName(away),
        logo: getTeamLogo(away),
        winner:
          score.home !== null &&
          score.away !== null
            ? Number(score.away) > Number(score.home)
            : null
      };

      return {
        fixture: {
          id: fixture?.id ?? null,

          referee:
            fixture?.referee?.name ||
            null,

          timezone: "Africa/Lagos",

          date: kickoff,

          timestamp:
            fixture?.starting_at_timestamp ??
            (
              kickoff
                ? Math.floor(new Date(kickoff).getTime() / 1000)
                : null
            ),

          venue: {
            id: fixture?.venue_id ?? null,
            name: getVenueName(fixture),
            city:
              fixture?.venue?.city?.name ||
              fixture?.venue?.city ||
              null
          },

          status: {
            long:
              fixture?.state?.name ||
              statusShort,

            short: statusShort,

            elapsed:
              fixture?.periods?.current ??
              null
          }
        },

        league: {
          id: fixture?.league_id ?? null,
          name: getLeagueName(fixture),
          country: getCountryName(fixture),

          logo:
            fixture?.league?.image_path ||
            fixture?.league?.logo ||
            null,

          flag:
            fixture?.league?.country?.image_path ||
            fixture?.league?.country?.flag ||
            null,

          season:
            fixture?.season_id ??
            null,

          round:
            fixture?.round?.name ||
            fixture?.round?.round ||
            null,

          stage:
            fixture?.stage?.name ||
            null
        },

        teams: {
          home: homeTeam,
          away: awayTeam
        },

        goals: {
          home: score.home,
          away: score.away
        },

        score: {
          halftime: {
            home: null,
            away: null
          },

          fulltime: {
            home: score.home,
            away: score.away
          },

          extratime: {
            home: null,
            away: null
          },

          penalty: {
            home: null,
            away: null
          }
        },

        // Extra SportMonks information retained for future
        // TomsonStakes analysis.
        sportmonks: {
          fixture_id: fixture?.id ?? null,
          league_id: fixture?.league_id ?? null,
          season_id: fixture?.season_id ?? null,
          stage_id: fixture?.stage_id ?? null,
          round_id: fixture?.round_id ?? null,
          state_id: fixture?.state_id ?? null,
          venue_id: fixture?.venue_id ?? null,
          starting_at: fixture?.starting_at ?? null,
          starting_at_timestamp:
            fixture?.starting_at_timestamp ?? null,
          placeholder:
            fixture?.placeholder ?? false,
          has_odds:
            fixture?.has_odds ?? false
        }
      };
    })
    .filter((fixture) => {
      // Do not allow completely unidentified fixtures into the
      // admin selection list.
      return (
        fixture?.teams?.home?.name &&
        fixture?.teams?.away?.name
      );
    });

  // ------------------------------------------------------------
  // SORT BY KICKOFF
  // ------------------------------------------------------------

  response.sort((a, b) => {
    const aTime = a?.fixture?.timestamp ?? Number.MAX_SAFE_INTEGER;
    const bTime = b?.fixture?.timestamp ?? Number.MAX_SAFE_INTEGER;

    return aTime - bTime;
  });

  // ------------------------------------------------------------
  // COUNTRIES
  // ------------------------------------------------------------

  const countries = [
    ...new Set(
      response
        .map((fixture) => fixture?.league?.country)
        .filter(Boolean)
    )
  ].sort();

  // ------------------------------------------------------------
  // LEAGUES
  // ------------------------------------------------------------

  const leagueMap = new Map();

  for (const fixture of response) {
    const leagueId = fixture?.league?.id;

    if (leagueId === null || leagueId === undefined) {
      continue;
    }

    if (!leagueMap.has(String(leagueId))) {
      leagueMap.set(String(leagueId), {
        id: leagueId,
        name: fixture?.league?.name || "Unknown League",
        country:
          fixture?.league?.country ||
          "International"
      });
    }
  }

  const leagues = [...leagueMap.values()].sort((a, b) =>
    `${a.country} ${a.name}`.localeCompare(
      `${b.country} ${b.name}`
    )
  );

  // ------------------------------------------------------------
  // STATUS SUMMARY
  // ------------------------------------------------------------

  const statusSummary = {
    NS: 0,
    LIVE: 0,
    FT: 0,
    PST: 0,
    CANC: 0,
    ABD: 0,
    OTHER: 0
  };

  for (const fixture of response) {
    const status =
      fixture?.fixture?.status?.short ||
      "OTHER";

    if (Object.prototype.hasOwnProperty.call(statusSummary, status)) {
      statusSummary[status]++;
    } else {
      statusSummary.OTHER++;
    }
  }

  // ------------------------------------------------------------
  // GENERAL SUMMARY
  // ------------------------------------------------------------

  const upcoming = response.filter((fixture) => {
    const status = fixture?.fixture?.status?.short;

    return (
      status === "NS" ||
      status === "TBD" ||
      status === "SCH"
    );
  });

  const live = response.filter((fixture) => {
    return fixture?.fixture?.status?.short === "LIVE";
  });

  const finished = response.filter((fixture) => {
    return fixture?.fixture?.status?.short === "FT";
  });

  const postponed = response.filter((fixture) => {
    return fixture?.fixture?.status?.short === "PST";
  });

  const cancelled = response.filter((fixture) => {
    return fixture?.fixture?.status?.short === "CANC";
  });

  // ------------------------------------------------------------
  // PAGINATION
  // ------------------------------------------------------------

  const providerPagination =
    providerData?.pagination ||
    {};

  // ------------------------------------------------------------
  // QUOTA / SUBSCRIPTION
  // ------------------------------------------------------------

  const subscription =
    providerData?.subscription ||
    null;

  // ------------------------------------------------------------
  // FINAL RESPONSE
  // ------------------------------------------------------------

  const executionTime = Date.now() - startedAt;

  return res.status(200).json({
    success: true,

    version: "5.0",

    source: "SportMonks",

    request: {
      date,
      timezone: "Africa/Lagos",
      timezoneLabel: "WAT"
    },

    results: {
      count: response.length,
      countries: countries.length,
      leagues: leagues.length
    },

    summary: {
      total: response.length,
      upcoming: upcoming.length,
      live: live.length,
      finished: finished.length,
      postponed: postponed.length,
      cancelled: cancelled.length
    },

    statusSummary,

    countries,

    leagues,

    paging: {
      current:
        providerPagination?.current_page ??
        1,

      total:
        providerPagination?.total ??
        response.length,

      perPage:
        providerPagination?.per_page ??
        response.length
    },

    quota: {
      source: "SportMonks",
      subscription: subscription,
      remaining:
        subscription?.meta?.trial_ends_at ??
        null
    },

    performance: {
      executionMs: executionTime
    },

    response
  });
}
