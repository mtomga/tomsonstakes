/*
===========================================================
 TOMSONSTAKES GLOBAL FOOTBALL PREDICTION ENGINE
 Prediction Engine V4.0
===========================================================

 FRONTEND CONTRACT:
 {
   prediction: "Home Win",
   probability: 63
 }

 ENVIRONMENT VARIABLES:
   APIFOOTBALL_KEY=
   SPORTMONKS_TOKEN=

 OPTIONAL:
   SPORTMONKS_BASE_URL=https://api.sportmonks.com/v3/football
   APIFOOTBALL_BASE_URL=https://v3.football.api-sports.io

 DATA SOURCES:
   1. API-Football
   2. Sportmonks

 MODEL:
   - API-Football prediction
   - Sportmonks prediction
   - Historical Sportmonks xG/xGA
   - API-Football season strength
   - Recent form
   - Market odds
   - H2H
   - Injuries / sidelined
   - Expected / confirmed lineups
   - Rest / congestion
   - Poisson
   - BTTS
   - Over / Under
   - Value / edge
   - Data-quality confidence

 IMPORTANT:
   Actual xG of the upcoming fixture is NEVER used as a
   pre-match feature. Historical completed fixtures only.
===========================================================
*/

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY;
  const SPORTMONKS_TOKEN = process.env.SPORTMONKS_TOKEN;

  if (!APIFOOTBALL_KEY) {
    return res.status(500).json({
      error: "APIFOOTBALL_KEY is not configured"
    });
  }

  const body = req.body || {};
  const match = body.match || {};
  const normalized = body.normalized || {};

  const homeName =
    match.home ||
    match.homeTeam ||
    normalized.homeTeam ||
    normalized.home ||
    "";

  const awayName =
    match.away ||
    match.awayTeam ||
    normalized.awayTeam ||
    normalized.away ||
    "";

  const requestedDate =
    match.date ||
    match.matchDate ||
    normalized.matchDate ||
    normalized.date ||
    "";

  if (!homeName || !awayName) {
    return res.status(400).json({
      error: "Home and away team names are required"
    });
  }

  const diagnostics = {
    apiFootball: {},
    sportmonks: {},
    warnings: []
  };

  /*
  ==========================================================
  BASIC HELPERS
  ==========================================================
  */

  const clamp = (n, min, max) =>
    Math.max(min, Math.min(max, Number(n) || 0));

  const safeNumber = (n, fallback = 0) => {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  };

  const average = arr => {
    const a = arr
      .map(Number)
      .filter(Number.isFinite);

    if (!a.length) return 0;

    return a.reduce((a, b) => a + b, 0) / a.length;
  };

  const median = arr => {
    const a = arr
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    if (!a.length) return 0;

    const mid = Math.floor(a.length / 2);

    return a.length % 2
      ? a[mid]
      : (a[mid - 1] + a[mid]) / 2;
  };

  const normalize = n => {
    const x = safeNumber(n);
    return x > 1 ? x / 100 : x;
  };

  const cleanName = name =>
    String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\b(fc|cf|afc|sc|ac|club|women|wfc|u21|u23)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const nameTokens = name =>
    cleanName(name)
      .split(" ")
      .filter(Boolean);

  const similarity = (a, b) => {
    const A = cleanName(a);
    const B = cleanName(b);

    if (!A || !B) return 0;

    if (A === B) return 1;

    if (A.includes(B) || B.includes(A)) {
      return 0.85;
    }

    const at = new Set(nameTokens(A));
    const bt = new Set(nameTokens(B));

    const intersection =
      [...at].filter(x => bt.has(x)).length;

    const union =
      new Set([...at, ...bt]).size;

    return union ? intersection / union : 0;
  };

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const fetchJSON = async (
    url,
    options = {},
    timeoutMs = 12000
  ) => {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      const text = await response.text();

      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = {
          raw: text
        };
      }

      return {
        ok: response.ok,
        status: response.status,
        data
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error:
          error?.name === "AbortError"
            ? "Request timeout"
            : String(error?.message || error)
      };
    } finally {
      clearTimeout(timer);
    }
  };

  /*
  ==========================================================
  API-FOOTBALL
  ==========================================================
  */

  const API_FOOTBALL_BASE =
    process.env.APIFOOTBALL_BASE_URL ||
    "https://v3.football.api-sports.io";

  const apiFootball = async endpoint => {
    const result = await fetchJSON(
      `${API_FOOTBALL_BASE}${endpoint}`,
      {
        headers: {
          "x-apisports-key": APIFOOTBALL_KEY
        }
      }
    );

    diagnostics.apiFootball[endpoint] = {
      ok: result.ok,
      status: result.status
    };

    if (!result.ok) {
      diagnostics.warnings.push(
        `API-Football failed: ${endpoint}`
      );
    }

    return result.ok ? result.data : null;
  };

  /*
  ==========================================================
  SPORTMONKS
  ==========================================================
  */

  const SPORTMONKS_BASE =
    process.env.SPORTMONKS_BASE_URL ||
    "https://api.sportmonks.com/v3/football";

  const sportmonks = async (
    endpoint,
    params = {}
  ) => {
    if (!SPORTMONKS_TOKEN) {
      diagnostics.sportmonks.disabled = true;
      return null;
    }

    const query = new URLSearchParams(params);

    const url =
      `${SPORTMONKS_BASE}${endpoint}` +
      `${query.toString() ? "?" + query.toString() : ""}`;

    const result = await fetchJSON(
      url,
      {
        headers: {
          Authorization: `Bearer ${SPORTMONKS_TOKEN}`,
          Accept: "application/json"
        }
      }
    );

    diagnostics.sportmonks[endpoint] = {
      ok: result.ok,
      status: result.status
    };

    if (!result.ok) {
      diagnostics.warnings.push(
        `Sportmonks failed: ${endpoint}`
      );
    }

    return result.ok ? result.data : null;
  };

  /*
  ==========================================================
  DATE HELPERS
  ==========================================================
  */

  const toDateOnly = value => {
    if (!value) return null;

    const m = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

    if (m) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
      return null;
    }

    return d.toISOString().slice(0, 10);
  };

  const addDays = (dateString, days) => {
    const d = new Date(`${dateString}T12:00:00Z`);

    d.setUTCDate(
      d.getUTCDate() + days
    );

    return d.toISOString().slice(0, 10);
  };

  const daysBetween = (a, b) => {
    const A = new Date(`${a}T12:00:00Z`);
    const B = new Date(`${b}T12:00:00Z`);

    return Math.abs(
      Math.round(
        (A.getTime() - B.getTime()) /
          86400000
      )
    );
  };

  /*
  ==========================================================
  1. RESOLVE API-FOOTBALL FIXTURE
  ==========================================================
  */

  let apiFixture = null;

  if (
    normalized.fixture &&
    typeof normalized.fixture === "object"
  ) {
    apiFixture = normalized.fixture;
  }

  if (
    !apiFixture &&
    normalized.fixtureData &&
    typeof normalized.fixtureData === "object"
  ) {
    apiFixture = normalized.fixtureData;
  }

  if (
    !apiFixture &&
    normalized.apiFixture &&
    typeof normalized.apiFixture === "object"
  ) {
    apiFixture = normalized.apiFixture;
  }

  const fixtureIdFromInput =
    apiFixture?.fixture?.id ||
    apiFixture?.fixtureId ||
    apiFixture?.id ||
    normalized.fixtureId ||
    null;

  /*
  ==========================================================
  API-FOOTBALL DATE FIXTURE SEARCH
  ==========================================================
  */

  if (!fixtureIdFromInput) {
    const dateOnly =
      toDateOnly(requestedDate);

    if (dateOnly) {
      const fixtureData =
        await apiFootball(
          `/fixtures?date=${encodeURIComponent(
            dateOnly
          )}&timezone=Africa/Lagos`
        );

      const fixtures =
        Array.isArray(fixtureData?.response)
          ? fixtureData.response
          : [];

      const candidates = fixtures
        .map(f => {
          const h =
            f?.teams?.home?.name || "";

          const a =
            f?.teams?.away?.name || "";

          const score =
            similarity(homeName, h) +
            similarity(awayName, a);

          return {
            fixture: f,
            score
          };
        })
        .filter(x => x.score >= 1.35)
        .sort((a, b) => b.score - a.score);

      if (candidates.length) {
        apiFixture =
          candidates[0].fixture;
      }
    }
  }

  const apiFixtureId =
    fixtureIdFromInput ||
    apiFixture?.fixture?.id ||
    apiFixture?.id ||
    null;

  /*
  ==========================================================
  FIXTURE METADATA
  ==========================================================
  */

  const apiHomeId =
    apiFixture?.teams?.home?.id ||
    normalized.homeTeamId ||
    null;

  const apiAwayId =
    apiFixture?.teams?.away?.id ||
    normalized.awayTeamId ||
    null;

  const leagueId =
    apiFixture?.league?.id ||
    normalized.leagueId ||
    null;

  const seasonId =
    apiFixture?.league?.season ||
    normalized.seasonId ||
    null;

  const fixtureDate =
    toDateOnly(
      apiFixture?.fixture?.date ||
      requestedDate
    );

  /*
  ==========================================================
  2. SPORTMONKS FIXTURE RESOLUTION
  ==========================================================
  */

  let smFixture = null;

  const suppliedSportmonksFixtureId =
    normalized.sportmonksFixtureId ||
    match.sportmonksFixtureId ||
    null;

  if (suppliedSportmonksFixtureId) {
    const data = await sportmonks(
      `/fixtures/${suppliedSportmonksFixtureId}`,
      {
        include:
          "participants;scores;state;league;season;statistics;xGFixture;lineups.player;predictions;expectedLineups;sidelined"
      }
    );

    smFixture = data?.data || null;
  }

  /*
  ----------------------------------------------------------
  SPORTMONKS SEARCH BY DATE RANGE
  ----------------------------------------------------------
  */

  if (!smFixture && SPORTMONKS_TOKEN && fixtureDate) {
    const from = addDays(fixtureDate, -1);
    const to = addDays(fixtureDate, 1);

    const data = await sportmonks(
      `/fixtures/between/${from}/${to}`,
      {
        include:
          "participants;scores;state;league;season",
        per_page: 50
      }
    );

    const fixtures =
      Array.isArray(data?.data)
        ? data.data
        : [];

    const matches = fixtures
      .map(f => {
        const participants =
          Array.isArray(f.participants)
            ? f.participants
            : [];

        const home =
          participants.find(
            p =>
              p.meta?.location === "home" ||
              p.location === "home"
          );

        const away =
          participants.find(
            p =>
              p.meta?.location === "away" ||
              p.location === "away"
          );

        const score =
          similarity(
            homeName,
            home?.name || ""
          ) +
          similarity(
            awayName,
            away?.name || ""
          );

        return {
          fixture: f,
          score
        };
      })
      .filter(x => x.score >= 1.35)
      .sort((a, b) => b.score - a.score);

    if (matches.length) {
      smFixture =
        matches[0].fixture;
    }
  }

  /*
  ----------------------------------------------------------
  ENRICH SPORTMONKS FIXTURE
  ----------------------------------------------------------
  */

  if (
    smFixture?.id &&
    SPORTMONKS_TOKEN
  ) {
    const enriched =
      await sportmonks(
        `/fixtures/${smFixture.id}`,
        {
          include:
            "participants;scores;events;state;league;season;statistics;xGFixture;lineups.player;predictions;expectedLineups;sidelined"
        }
      );

    if (enriched?.data) {
      smFixture = enriched.data;
    }
  }

  /*
  ==========================================================
  SPORTMONKS TEAM IDS
  ==========================================================
  */

  const smParticipants =
    Array.isArray(smFixture?.participants)
      ? smFixture.participants
      : [];

  const getParticipantLocation = p =>
    p?.meta?.location ||
    p?.location ||
    "";

  let smHome =
    smParticipants.find(
      p =>
        getParticipantLocation(p) ===
        "home"
    );

  let smAway =
    smParticipants.find(
      p =>
        getParticipantLocation(p) ===
        "away"
    );

  if (!smHome || !smAway) {
    const sorted =
      smParticipants
        .slice()
        .sort(
          (a, b) =>
            similarity(
              homeName,
              b?.name
            ) -
            similarity(
              homeName,
              a?.name
            )
        );

    if (!smHome) {
      smHome = sorted[0];
    }

    if (!smAway) {
      smAway = sorted.find(
        p =>
          p?.id !== smHome?.id
      );
  }

  const smHomeId =
    smHome?.id || null;

  const smAwayId =
    smAway?.id || null;

  /*
  ==========================================================
  3. API-FOOTBALL PARALLEL DATA
  ==========================================================
  */

  let afPrediction = null;
  let homeStats = null;
  let awayStats = null;
  let h2hData = null;
  let injuriesData = null;
  let oddsData = null;
  let homeRecent = null;
  let awayRecent = null;
  let lineupData = null;

  if (apiFixtureId) {
    const requests = [];

    requests.push(
      apiFootball(
        `/predictions?fixture=${apiFixtureId}`
      )
    );

    requests.push(
      apiFootball(
        `/injuries?fixture=${apiFixtureId}`
      )
    );

    requests.push(
      apiFootball(
        `/odds?fixture=${apiFixtureId}`
      )
    );

    requests.push(
      apiFootball(
        `/fixtures/lineups?fixture=${apiFixtureId}`
      )
    );

    if (apiHomeId && apiAwayId) {
      requests.push(
        apiFootball(
          `/fixtures/headtohead?h2h=${apiHomeId}-${apiAwayId}&last=10`
        )
      );
    }

    if (apiHomeId && leagueId && seasonId) {
      requests.push(
        apiFootball(
          `/teams/statistics?league=${leagueId}&season=${seasonId}&team=${apiHomeId}`
        )
      );
    }

    if (apiAwayId && leagueId && seasonId) {
      requests.push(
        apiFootball(
          `/teams/statistics?league=${leagueId}&season=${seasonId}&team=${apiAwayId}`
        )
      );
    }

    if (apiHomeId) {
      requests.push(
        apiFootball(
          `/fixtures?team=${apiHomeId}&last=10`
        )
      );
    }

    if (apiAwayId) {
      requests.push(
        apiFootball(
          `/fixtures?team=${apiAwayId}&last=10`
        )
      );
    }

    const results =
      await Promise.all(requests);

    let index = 0;

    afPrediction =
      results[index++];

    injuriesData =
      results[index++];

    oddsData =
      results[index++];

    lineupData =
      results[index++];

    if (apiHomeId && apiAwayId) {
      h2hData =
        results[index++];
    }

    if (apiHomeId && leagueId && seasonId) {
      homeStats =
        results[index++];
    }

    if (apiAwayId && leagueId && seasonId) {
      awayStats =
        results[index++];
    }

    if (apiHomeId) {
      homeRecent =
        results[index++];
    }

    if (apiAwayId) {
      awayRecent =
        results[index++];
    }
  }

  /*
  ==========================================================
  4. API-FOOTBALL PREDICTION EXTRACTION
  ==========================================================
  */

  const afPredictionRow =
    afPrediction?.response?.[0] ||
    null;

  const afPred =
    afPredictionRow?.predictions ||
    {};

  const afPercent =
    afPred?.percent ||
    {};

  const apiFootballPrediction = {
    home: normalize(
      afPercent?.home
    ),
    draw: normalize(
      afPercent?.draw
    ),
    away: normalize(
      afPercent?.away
    ),
    homeGoals: safeNumber(
      afPred?.goals?.home
    ),
    awayGoals: safeNumber(
      afPred?.goals?.away
    ),
    advice:
      afPred?.advice || null,
    underOver:
      afPred?.under_over || null,
    winner:
      afPred?.winner?.name || null
  };

  /*
  ==========================================================
  5. SPORTMONKS HISTORICAL xG
  ==========================================================
  */

  const extractExpectedGoals = fixture => {
    const rows =
      fixture?.xgfixture ||
      fixture?.xGFixture ||
      fixture?.expected ||
      [];

    if (!Array.isArray(rows)) {
      return null;
    }

    let homeXG = null;
    let awayXG = null;

    for (const row of rows) {
      const typeId =
        Number(row?.type_id);

      const developer =
        String(
          row?.type?.developer_name ||
          row?.type?.name ||
          ""
        ).toUpperCase();

      const isXG =
        typeId === 5304 ||
        developer.includes(
          "EXPECTED_GOALS"
        ) ||
        developer === "XG";

      if (!isXG) continue;

      const value =
        safeNumber(
          row?.data?.value,
          NaN
        );

      if (!Number.isFinite(value)) {
        continue;
      }

      const location =
        row?.location ||
        row?.meta?.location;

      if (location === "home") {
        homeXG = value;
      }

      if (location === "away") {
        awayXG = value;
      }
    }

    if (
      homeXG === null &&
      awayXG === null
    ) {
      return null;
    }

    return {
      home: homeXG,
      away: awayXG
    };
  };

  const completedStateIds = new Set([
    5,
    6,
    7
  ]);

  const isCompletedFixture = fixture => {
    const stateId =
      Number(
        fixture?.state_id ||
        fixture?.state?.id
      );

    if (
      completedStateIds.has(stateId)
    ) {
      return true;
    }

    const stateName =
      String(
        fixture?.state?.name ||
        fixture?.state?.developer_name ||
        ""
      ).toLowerCase();

    if (
      /finished|full.?time|ended|after.?full/.test(
        stateName
      )
    ) {
      return true;
    }

    const resultInfo =
      String(
        fixture?.result_info || ""
      ).toLowerCase();

    return /won|draw|full.?time/.test(
      resultInfo
    );
  };

  const weightedMean = rows => {
    if (!rows.length) return null;

    let numerator = 0;
    let denominator = 0;

    rows.forEach(
      (row, index) => {
        const weight =
          Math.pow(
            0.88,
            index
          );

        numerator +=
          row.value * weight;

        denominator += weight;
      }
    );

    return denominator
      ? numerator / denominator
      : null;
  };

  const buildHistoricalXGProfile =
    async (
      teamId,
      targetDate,
      side
    ) => {
      if (
        !teamId ||
        !SPORTMONKS_TOKEN ||
        !targetDate
      ) {
        return {
          available: false,
          sampleSize: 0
        };
      }

      const start =
        addDays(targetDate, -240);

      const data =
        await sportmonks(
          `/fixtures/between/${start}/${targetDate}/${teamId}`,
          {
            include:
              "participants;scores;state;xGFixture;league",
            order: "desc",
            per_page: 50
          }
        );

      const fixtures =
        Array.isArray(data?.data)
          ? data.data
          : [];

      const usable = [];

      for (const fixture of fixtures) {
        if (
          !isCompletedFixture(fixture)
        ) {
          continue;
        }

        const startingAt =
          toDateOnly(
            fixture?.starting_at
          );

        if (
          !startingAt ||
          startingAt >= targetDate
        ) {
          continue;
        }

        const participants =
          Array.isArray(
            fixture?.participants
          )
            ? fixture.participants
            : [];

        const participant =
          participants.find(
            p =>
              Number(p?.id) ===
              Number(teamId)
          );

        if (!participant) {
          continue;
        }

        const location =
          getParticipantLocation(
            participant
          );

        const xg =
          extractExpectedGoals(
            fixture
          );

        if (!xg) continue;

        const teamXG =
          location === "home"
            ? xg.home
            : xg.away;

        const opponentXG =
          location === "home"
            ? xg.away
            : xg.home;

        if (
          !Number.isFinite(
            teamXG
          ) ||
          !Number.isFinite(
            opponentXG
          )
        ) {
          continue;
        }

        usable.push({
          date: startingAt,
          location,
          xGF: teamXG,
          xGA: opponentXG
        });
      }

      /*
      Newest first.
      */

      usable.sort(
        (a, b) =>
          new Date(b.date) -
          new Date(a.date)
      );

      const all =
        usable.slice(0, 12);

      const venue =
        all.filter(
          x =>
            x.location === side
        ).slice(0, 8);

      const useVenue =
        venue.length >= 3
          ? venue
          : all;

      return {
        available:
          useVenue.length >= 3,
        sampleSize:
          useVenue.length,
        allSampleSize:
          all.length,
        venueSampleSize:
          venue.length,
        xGF:
          weightedMean(
            useVenue.map(x => ({
              value: x.xGF
            }))
          ),
        xGA:
          weightedMean(
            useVenue.map(x => ({
              value: x.xGA
            }))
          ),
        matches: useVenue
      };
    };

  const homeXGProfile =
    await buildHistoricalXGProfile(
      smHomeId,
      fixtureDate,
      "home"
    );

  const awayXGProfile =
    await buildHistoricalXGProfile(
      smAwayId,
      fixtureDate,
      "away"
    );

  /*
  ==========================================================
  6. PRE-MATCH xG CONSENSUS
  ==========================================================
  */

  const normalizedHomeXG =
    safeNumber(
      normalized?.homeXG ||
      normalized?.home_xg ||
      normalized?.xg?.home,
      NaN
    );

  const normalizedAwayXG =
    safeNumber(
      normalized?.awayXG ||
      normalized?.away_xg ||
      normalized?.xg?.away,
      NaN
    );

  const homeHistoricalXGF =
    homeXGProfile?.xGF;

  const homeHistoricalXGA =
    homeXGProfile?.xGA;

  const awayHistoricalXGF =
    awayXGProfile?.xGF;

  const awayHistoricalXGA =
    awayXGProfile?.xGA;

  let homeLambda =
    average([
      homeHistoricalXGF,
      awayHistoricalXGA
    ]);

  let awayLambda =
    average([
      awayHistoricalXGF,
      homeHistoricalXGA
    ]);

  /*
  If historical xG is unavailable,
  use API-Football predicted goals.
  */

  if (
    !homeLambda ||
    homeLambda <= 0
  ) {
    homeLambda =
      apiFootballPrediction.homeGoals;
  }

  if (
    !awayLambda ||
    awayLambda <= 0
  ) {
    awayLambda =
      apiFootballPrediction.awayGoals;
  }

  /*
  Normalized external xG receives limited
  influence because its provenance can vary.
  */

  if (
    Number.isFinite(
      normalizedHomeXG
    ) &&
    normalizedHomeXG > 0
  ) {
    homeLambda =
      homeLambda * 0.75 +
      normalizedHomeXG * 0.25;
  }

  if (
    Number.isFinite(
      normalizedAwayXG
    ) &&
    normalizedAwayXG > 0
  ) {
    awayLambda =
      awayLambda * 0.75 +
      normalizedAwayXG * 0.25;
  }

  /*
  Final safety limits.
  */

  homeLambda =
    clamp(
      homeLambda || 1.20,
      0.15,
      4.50
    );

  awayLambda =
    clamp(
      awayLambda || 1.00,
      0.15,
      4.50
    );

  /*
  ==========================================================
  7. POISSON MODEL
  ==========================================================
  */

  const factorial = n => {
    let result = 1;

    for (
      let i = 2;
      i <= n;
      i++
    ) {
      result *= i;
    }

    return result;
  };

  const poisson = (
    goals,
    lambda
  ) => {
    return (
      Math.exp(-lambda) *
      Math.pow(lambda, goals) /
      factorial(goals)
    );
  };

  const poissonMatrix = (
    homeGoalLambda,
    awayGoalLambda
  ) => {
    const maxGoals = 8;

    const homeDist = [];
    const awayDist = [];

    for (
      let i = 0;
      i <= maxGoals;
      i++
    ) {
      homeDist.push(
        poisson(
          i,
          homeGoalLambda
        )
      );

      awayDist.push(
        poisson(
          i,
          awayGoalLambda
        )
      );
    }

    let home = 0;
    let draw = 0;
    let away = 0;

    let bttsYes = 0;
    let over15 = 0;
    let over25 = 0;
    let over35 = 0;

    for (
      let h = 0;
      h <= maxGoals;
      h++
    ) {
      for (
        let a = 0;
        a <= maxGoals;
        a++
      ) {
        const probability =
          homeDist[h] *
          awayDist[a];

        if (h > a) {
          home += probability;
        } else if (h === a) {
          draw += probability;
        } else {
          away += probability;
        }

        if (
          h > 0 &&
          a > 0
        ) {
          bttsYes += probability;
        }

        if (
          h + a > 1.5
        ) {
          over15 += probability;
        }

        if (
          h + a > 2.5
        ) {
          over25 += probability;
        }

        if (
          h + a > 3.5
        ) {
          over35 += probability;
        }
      }
    }

    const total =
      home + draw + away;

    return {
      home:
        home / total,
      draw:
        draw / total,
      away:
        away / total,
      bttsYes:
        bttsYes / total,
      bttsNo:
        1 - bttsYes / total,
      over15:
        over15 / total,
      under15:
        1 - over15 / total,
      over25:
        over25 / total,
      under25:
        1 - over25 / total,
      over35:
        over35 / total,
      under35:
        1 - over35 / total
    };
  };

  const poissonModel =
    poissonMatrix(
      homeLambda,
      awayLambda
    );

  /*
  ==========================================================
  8. API-FOOTBALL SEASON STRENGTH
  ==========================================================
  */

  const extractSeasonStrength =
    stats => {
      const s =
        stats?.response ||
        {};

      const fixtures =
        s?.fixtures ||
        {};

      const goals =
        s?.goals ||
        {};

      const homeGoals =
        safeNumber(
          goals?.for?.home?.average,
          0
        );

      const awayGoals =
        safeNumber(
          goals?.against?.home?.average,
          0
        );

      return {
        matchesHome:
          safeNumber(
            fixtures?.played?.home
          ),
        winsHome:
          safeNumber(
            fixtures?.wins?.home
          ),
        drawsHome:
          safeNumber(
            fixtures?.draws?.home
          ),
        lossesHome:
          safeNumber(
            fixtures?.loses?.home
          ),
        goalsForHome:
          homeGoals,
        goalsAgainstHome:
          awayGoals,

        matchesAway:
          safeNumber(
            fixtures?.played?.away
          ),
        winsAway:
          safeNumber(
            fixtures?.wins?.away
          ),
        drawsAway:
          safeNumber(
            fixtures?.draws?.away
          ),
        lossesAway:
          safeNumber(
            fixtures?.loses?.away
          ),
        goalsForAway:
          safeNumber(
            goals?.for?.away?.average,
            0
          ),
        goalsAgainstAway:
          safeNumber(
            goals?.against?.away?.average,
            0
          )
      };
    };

  const homeSeason =
    extractSeasonStrength(
      homeStats
    );

  const awaySeason =
    extractSeasonStrength(
      awayStats
    );

  const seasonHomeSignal =
    homeSeason.matchesHome > 0
      ? (
          homeSeason.winsHome /
            homeSeason.matchesHome
        )
      : 0.33;

  const seasonAwaySignal =
    awaySeason.matchesAway > 0
      ? (
          awaySeason.winsAway /
            awaySeason.matchesAway
        )
      : 0.33;

  /*
  ==========================================================
  9. RECENT FORM
  ==========================================================
  */

  const extractRecentForm =
    (data, teamId) => {
      const fixtures =
        Array.isArray(
          data?.response
        )
          ? data.response
          : [];

      const completed =
        fixtures
          .filter(f => {
            const status =
              f?.fixture?.status?.short;

            return [
              "FT",
              "AET",
              "PEN"
            ].includes(status);
          })
          .sort(
            (a, b) =>
              new Date(
                b.fixture.date
              ) -
              new Date(
                a.fixture.date
              )
          )
          .slice(0, 8);

      const points = [];

      completed.forEach(f => {
        const home =
          f?.teams?.home?.id;

        const away =
          f?.teams?.away?.id;

        const hg =
          safeNumber(
            f?.goals?.home
          );

        const ag =
          safeNumber(
            f?.goals?.away
          );

        if (
          Number(teamId) ===
          Number(home)
        ) {
          points.push(
            hg > ag
              ? 1
              : hg === ag
                ? 0.5
                : 0
          );
        }

        if (
          Number(teamId) ===
          Number(away)
        ) {
          points.push(
            ag > hg
              ? 1
              : hg === ag
                ? 0.5
                : 0
          );
        }
      });

      return {
        sampleSize:
          points.length,
        rating:
          points.length
            ? average(points)
            : 0.5
      };
    };

  const homeForm =
    extractRecentForm(
      homeRecent,
      apiHomeId
    );

  const awayForm =
    extractRecentForm(
      awayRecent,
      apiAwayId
    );

  /*
  ==========================================================
  10. H2H
  ==========================================================
  */

  const h2hFixtures =
    Array.isArray(
      h2hData?.response
    )
      ? h2hData.response
      : [];

  let h2hHome = 0.33;
  let h2hDraw = 0.34;
  let h2hAway = 0.33;

  if (h2hFixtures.length) {
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;

    h2hFixtures
      .slice(0, 10)
      .forEach(f => {
        const home =
          f?.teams?.home?.id;

        const hg =
          safeNumber(
            f?.goals?.home
          );

        const ag =
          safeNumber(
            f?.goals?.away
          );

        if (hg === ag) {
          draws++;
        } else if (
          Number(home) ===
          Number(apiHomeId)
        ) {
          hg > ag
            ? homeWins++
            : awayWins++;
        } else {
          hg > ag
            ? awayWins++
            : homeWins++;
        }
      });

    const total =
      homeWins +
      draws +
      awayWins;

    if (total) {
      h2hHome =
        homeWins / total;

      h2hDraw =
        draws / total;

      h2hAway =
        awayWins / total;
    }
  }

  /*
  ==========================================================
  11. INJURIES
  ==========================================================
  */

  const injuries =
    Array.isArray(
      injuriesData?.response
    )
      ? injuriesData.response
      : [];

  const injuryImpact =
    teamId => {
      const teamInjuries =
        injuries.filter(
          x =>
            Number(
              x?.team?.id
            ) === Number(teamId)
        );

      let impact = 0;

      for (
        const injury of teamInjuries
      ) {
        const type =
          String(
            injury?.player?.type ||
            injury?.type ||
            injury?.reason ||
            ""
          ).toLowerCase();

        if (
          /suspend/.test(type)
        ) {
          impact += 0.08;
        } else if (
          /injur|absent|out/.test(
            type
          )
        ) {
          impact += 0.05;
        } else {
          impact += 0.025;
        }
      }

      return clamp(
        impact,
        0,
        0.25
      );
    };

  const homeInjuryImpact =
    injuryImpact(apiHomeId);

  const awayInjuryImpact =
    injuryImpact(apiAwayId);

  /*
  ==========================================================
  12. LINEUP SIGNAL
  ==========================================================
  */

  const lineupRows =
    Array.isArray(
      lineupData?.response
    )
      ? lineupData.response
      : [];

  const lineupAvailability =
    teamId => {
      const row =
        lineupRows.find(
          x =>
            Number(
              x?.team?.id
            ) === Number(teamId)
        );

      if (!row) {
        return {
          available: false,
          rating: 0.5,
          starters: 0
        };
      }

      const starters =
        Array.isArray(
          row?.startXI
        )
          ? row.startXI.length
          : 0;

      return {
        available:
          starters > 0,
        rating:
          clamp(
            starters / 11,
            0,
            1
          ),
        starters
      };
    };

  const homeLineup =
    lineupAvailability(
      apiHomeId
    );

  const awayLineup =
    lineupAvailability(
      apiAwayId
    );

  /*
  ==========================================================
  13. REST / CONGESTION
  ==========================================================
  */

  const getRecentDates =
    data => {
      const fixtures =
        Array.isArray(
          data?.response
        )
          ? data.response
          : [];

      return fixtures
        .map(
          f =>
            toDateOnly(
              f?.fixture?.date
            )
        )
        .filter(Boolean)
        .sort()
        .reverse();
    };

  const restSignal =
    (data, targetDate) => {
      const dates =
        getRecentDates(data);

      if (
        !dates.length ||
        !targetDate
      ) {
        return {
          daysRest: null,
          congestion: 0
        };
      }

      const lastDate =
        dates[0];

      const daysRest =
        daysBetween(
          lastDate,
          targetDate
        );

      let congestion = 0;

      if (daysRest <= 2) {
        congestion = 0.10;
      } else if (
        daysRest <= 3
      ) {
        congestion = 0.05;
      }

      return {
        daysRest,
        congestion
      };
    };

  const homeRest =
    restSignal(
      homeRecent,
      fixtureDate
    );

  const awayRest =
    restSignal(
      awayRecent,
      fixtureDate
    );

  /*
  ==========================================================
  14. SPORTMONKS PREDICTIONS
  ==========================================================
  */

  const smPredictions =
    Array.isArray(
      smFixture?.predictions
    )
      ? smFixture.predictions
      : [];

  const extractSportmonksPrediction =
    predictions => {
      let home = null;
      let draw = null;
      let away = null;

      for (
        const prediction
        of predictions
      ) {
        const values =
          prediction?.predictions ||
          prediction?.values ||
          prediction?.data ||
          prediction;

        const winner =
          String(
            prediction?.type?.developer_name ||
            prediction?.type?.name ||
            prediction?.market?.name ||
            ""
          ).toLowerCase();

        const candidateHome =
          normalize(
            values?.home ||
            values?.home_win ||
            values?.homeWin
          );

        const candidateDraw =
          normalize(
            values?.draw
          );

        const candidateAway =
          normalize(
            values?.away ||
            values?.away_win ||
            values?.awayWin
          );

        if (
          candidateHome > 0 &&
          candidateAway > 0
        ) {
          home = candidateHome;
          draw = candidateDraw;
          away = candidateAway;
        }

        if (
          winner.includes("winner") ||
          winner.includes("match")
        ) {
          if (
            candidateHome > 0 ||
            candidateAway > 0
          ) {
            home =
              candidateHome || home;

            draw =
              candidateDraw || draw;

            away =
              candidateAway || away;
          }
        }
      }

      if (
        home === null &&
        draw === null &&
        away === null
      ) {
        return null;
      }

      const total =
        home + draw + away;

      if (total <= 0) {
        return null;
      }

      return {
        home: home / total,
        draw: draw / total,
        away: away / total
      };
    };

  const sportmonksPrediction =
    extractSportmonksPrediction(
      smPredictions
    );

  /*
  ==========================================================
  15. BOOKMAKER ODDS
  ==========================================================
  */

  const extractMarketProbabilities =
    odds => {
      const response =
        Array.isArray(
          odds?.response
        )
          ? odds.response
          : [];

      const all =
        [];

      for (
        const fixtureOdds
        of response
      ) {
        const bookmakers =
          Array.isArray(
            fixtureOdds?.bookmakers
          )
            ? fixtureOdds.bookmakers
            : [];

        for (
          const bookmaker
          of bookmakers
        ) {
          const bets =
            Array.isArray(
              bookmaker?.bets
            )
              ? bookmaker.bets
              : [];

          for (
            const bet of bets
          ) {
            const name =
              String(
                bet?.name || ""
              ).toLowerCase();

            if (
              !name.includes(
                "match winner"
              )
            ) {
              continue;
            }

            const values =
              Array.isArray(
                bet?.values
              )
                ? bet.values
                : [];

            let home = null;
            let draw = null;
            let away = null;

            for (
              const value of values
            ) {
              const odd =
                Number(
                  value?.odd
                );

              if (
                !Number.isFinite(
                  odd
                ) ||
                odd <= 1
              ) {
                continue;
              }

              const label =
                String(
                  value?.value ||
                  ""
                ).toLowerCase();

              if (
                label === "home"
              ) {
                home = odd;
              }

              if (
                label === "draw"
              ) {
                draw = odd;
              }

              if (
                label === "away"
              ) {
                away = odd;
              }
            }

            if (
              home &&
              draw &&
              away
            ) {
              const ih = 1 / home;
              const id = 1 / draw;
              const ia = 1 / away;

              const total =
                ih + id + ia;

              all.push({
                bookmaker:
                  bookmaker?.name ||
                  "Unknown",
                home:
                  ih / total,
                draw:
                  id / total,
                away:
                  ia / total,
                odds: {
                  home,
                  draw,
                  away
                }
              });
            }
          }
        }
      }

      if (!all.length) {
        return null;
      }

      return {
        sampleSize:
          all.length,
        home:
          median(
            all.map(x => x.home)
          ),
        draw:
          median(
            all.map(x => x.draw)
          ),
        away:
          median(
            all.map(x => x.away)
          ),
        bookmakers:
          all
      };
    };

  const market =
    extractMarketProbabilities(
      oddsData
    );

  /*
  ==========================================================
  16. CONSENSUS MODEL
  ==========================================================
  */

  const normalizeTriple =
    (home, draw, away) => {
      const h = Math.max(
        0,
        safeNumber(home)
      );

      const d = Math.max(
        0,
        safeNumber(draw)
      );

      const a = Math.max(
        0,
        safeNumber(away)
      );

      const total =
        h + d + a;

      if (!total) {
        return {
          home: 0.33,
          draw: 0.34,
          away: 0.33
        };
      }

      return {
        home: h / total,
        draw: d / total,
        away: a / total
      };
    };

  const afTriple =
    normalizeTriple(
      apiFootballPrediction.home,
      apiFootballPrediction.draw,
      apiFootballPrediction.away
    );

  const smTriple =
    sportmonksPrediction
      ? normalizeTriple(
          sportmonksPrediction.home,
          sportmonksPrediction.draw,
          sportmonksPrediction.away
        )
      : null;

  const marketTriple =
    market
      ? normalizeTriple(
          market.home,
          market.draw,
          market.away
        )
      : null;

  /*
  Base ensemble.
  */

  let probability = {
    home: 0,
    draw: 0,
    away: 0
  };

  let totalWeight = 0;

  const addSignal =
    (
      signal,
      weight
    ) => {
      if (!signal) return;

      probability.home +=
        signal.home * weight;

      probability.draw +=
        signal.draw * weight;

      probability.away +=
        signal.away * weight;

      totalWeight += weight;
    };

  /*
  API-Football prediction.
  */

  addSignal(
    afTriple,
    0.20
  );

  /*
  Sportmonks prediction.
  */

  if (smTriple) {
    addSignal(
      smTriple,
      0.15
    );
  }

  /*
  Market consensus.
  */

  if (marketTriple) {
    addSignal(
      marketTriple,
      0.15
    );
  }

  /*
  Poisson/xG.
  */

  addSignal(
    {
      home:
        poissonModel.home,
      draw:
        poissonModel.draw,
      away:
        poissonModel.away
    },
    0.30
  );

  /*
  Recent form.
  */

  const formHome =
    homeForm.rating;

  const formAway =
    awayForm.rating;

  const formDraw =
    1 -
    Math.abs(
      formHome -
      formAway
    );

  addSignal(
    normalizeTriple(
      formHome,
      formDraw,
      formAway
    ),
    0.08
  );

  /*
  Season strength.
  */

  addSignal(
    normalizeTriple(
      seasonHomeSignal,
      0.34,
      seasonAwaySignal
    ),
    0.07
  );

  /*
  H2H intentionally weak.
  */

  addSignal(
    normalizeTriple(
      h2hHome,
      h2hDraw,
      h2hAway
    ),
    0.05
  );

  if (!totalWeight) {
    probability =
      normalizeTriple(
        poissonModel.home,
        poissonModel.draw,
        poissonModel.away
      );
  } else {
    probability.home /=
      totalWeight;

    probability.draw /=
      totalWeight;

    probability.away /=
      totalWeight;
  }

  /*
  ==========================================================
  17. INJURY / REST / LINEUP ADJUSTMENTS
  ==========================================================
  */

  probability.home -=
    homeInjuryImpact * 0.30;

  probability.away -=
    awayInjuryImpact * 0.30;

  /*
  Congestion.
  */

  if (
    homeRest.daysRest !== null &&
    awayRest.daysRest !== null
  ) {
    if (
      homeRest.daysRest <
      awayRest.daysRest
    ) {
      probability.home -=
        0.025;
    }

    if (
      awayRest.daysRest <
      homeRest.daysRest
    ) {
      probability.away -=
        0.025;
    }
  }

  /*
  Lineup information.
  */

  if (
    homeLineup.available &&
    awayLineup.available
  ) {
    if (
      homeLineup.starters >= 11 &&
      awayLineup.starters < 11
    ) {
      probability.home +=
        0.015;
    }

    if (
      awayLineup.starters >= 11 &&
      homeLineup.starters < 11
    ) {
      probability.away +=
        0.015;
    }
  }

  /*
  Re-normalize.
  */

  probability =
    normalizeTriple(
      clamp(
        probability.home,
        0.02,
        0.94
      ),
      clamp(
        probability.draw,
        0.03,
        0.60
      ),
      clamp(
        probability.away,
        0.02,
        0.94
      )
    );

  /*
  ==========================================================
  18. DRAW PROTECTION
  ==========================================================
  */

  const strongest =
    Math.max(
      probability.home,
      probability.draw,
      probability.away
    );

  /*
  Very close matches should not produce
  exaggerated certainty.
  */

  const sortedProbabilities =
    [
      probability.home,
      probability.draw,
      probability.away
    ].sort(
      (a, b) => b - a
    );

  const margin =
    sortedProbabilities[0] -
    sortedProbabilities[1];

  if (margin < 0.025) {
    probability.home =
      probability.home * 0.90 +
      0.10 / 3;

    probability.draw =
      probability.draw * 0.90 +
      0.10 / 3;

    probability.away =
      probability.away * 0.90 +
      0.10 / 3;

    probability =
      normalizeTriple(
        probability.home,
        probability.draw,
        probability.away
      );
  }

  /*
  ==========================================================
  19. FINAL 1X2
  ==========================================================
  */

  const outcomes = [
    {
      label: "Home Win",
      key: "home",
      probability:
        probability.home
    },
    {
      label: "Draw",
      key: "draw",
      probability:
        probability.draw
    },
    {
      label: "Away Win",
      key: "away",
      probability:
        probability.away
    }
  ];

  outcomes.sort(
    (a, b) =>
      b.probability -
      a.probability
  );

  const winner =
    outcomes[0];

  /*
  ==========================================================
  20. DOUBLE CHANCE
  ==========================================================
  */

  const doubleChance = {
    "1X":
      probability.home +
      probability.draw,

    "X2":
      probability.draw +
      probability.away,

    "12":
      probability.home +
      probability.away
  };

  /*
  ==========================================================
  21. DRAW NO BET
  ==========================================================
  */

  const dnbDenominatorHome =
    probability.home +
    probability.away;

  const dnbDenominatorAway =
    probability.home +
    probability.away;

  const dnb = {
    home:
      dnbDenominatorHome
        ? probability.home /
          dnbDenominatorHome
        : 0.5,

    away:
      dnbDenominatorAway
        ? probability.away /
          dnbDenominatorAway
        : 0.5
  };

  /*
  ==========================================================
  22. BTTS / TOTALS
  ==========================================================
  */

  const markets = {
    btts: {
      yes:
        poissonModel.bttsYes,
      no:
        poissonModel.bttsNo
    },

    overUnder: {
      "Over 1.5":
        poissonModel.over15,
      "Under 1.5":
        poissonModel.under15,

      "Over 2.5":
        poissonModel.over25,
      "Under 2.5":
        poissonModel.under25,

      "Over 3.5":
        poissonModel.over35,
      "Under 3.5":
        poissonModel.under35
    },

    doubleChance,

    drawNoBet: dnb
  };

  /*
  ==========================================================
  23. MARKET VALUE / EDGE
  ==========================================================
  */

  const value = {};

  if (marketTriple) {
    value.home =
      probability.home -
      marketTriple.home;

    value.draw =
      probability.draw -
      marketTriple.draw;

    value.away =
      probability.away -
      marketTriple.away;
  }

  /*
  ==========================================================
  24. IMPLIED FAIR ODDS
  ==========================================================
  */

  const fairOdds = {
    home:
      probability.home > 0
        ? 1 / probability.home
        : null,

    draw:
      probability.draw > 0
        ? 1 / probability.draw
        : null,

    away:
      probability.away > 0
        ? 1 / probability.away
        : null
  };

  /*
  ==========================================================
  25. DATA QUALITY / CONFIDENCE
  ==========================================================
  */

  let confidenceScore = 45;

  if (apiFixtureId) {
    confidenceScore += 8;
  }

  if (smFixture?.id) {
    confidenceScore += 8;
  }

  if (
    homeXGProfile?.sampleSize >= 5
  ) {
    confidenceScore += 7;
  }

  if (
    awayXGProfile?.sampleSize >= 5
  ) {
    confidenceScore += 7;
  }

  if (market) {
    confidenceScore += 6;
  }

  if (afPredictionRow) {
    confidenceScore += 5;
  }

  if (sportmonksPrediction) {
    confidenceScore += 4;
  }

  if (
    homeLineup.available ||
    awayLineup.available
  ) {
    confidenceScore += 3;
  }

  if (
    injuries.length > 0
  ) {
    confidenceScore += 2;
  }

  if (
    Math.abs(
      probability.home -
      probability.away
    ) < 0.05
  ) {
    confidenceScore -= 7;
  }

  if (
    Math.abs(
      poissonModel.home -
      afTriple.home
    ) > 0.20
  ) {
    confidenceScore -= 5;
  }

  confidenceScore =
    Math.round(
      clamp(
        confidenceScore,
        20,
        92
      )
    );

  /*
  ==========================================================
  26. CONFIDENCE LABEL
  ==========================================================
  */

  let confidence =
    "Low";

  if (
    confidenceScore >= 75
  ) {
    confidence = "High";
  } else if (
    confidenceScore >= 60
  ) {
    confidence = "Medium";
  }

  /*
  ==========================================================
  27. BEST GOAL MARKET
  ==========================================================
  */

  const totalMarkets = [
    {
      market: "Over 1.5",
      probability:
        poissonModel.over15
    },
    {
      market: "Under 1.5",
      probability:
        poissonModel.under15
    },
    {
      market: "Over 2.5",
      probability:
        poissonModel.over25
    },
    {
      market: "Under 2.5",
      probability:
        poissonModel.under25
    },
    {
      market: "Over 3.5",
      probability:
        poissonModel.over35
    },
    {
      market: "Under 3.5",
      probability:
        poissonModel.under35
    }
  ].sort(
    (a, b) =>
      b.probability -
      a.probability
  );

  const bestGoalMarket =
    totalMarkets[0];

  const bestBTTS =
    poissonModel.bttsYes >=
    poissonModel.bttsNo
      ? {
          market: "BTTS Yes",
          probability:
            poissonModel.bttsYes
        }
      : {
          market: "BTTS No",
          probability:
            poissonModel.bttsNo
        };

  /*
  ==========================================================
  28. SCORELINE DISTRIBUTION
  ==========================================================
  */

  const scorelines = [];

  for (
    let h = 0;
    h <= 5;
    h++
  ) {
    for (
      let a = 0;
      a <= 5;
      a++
    ) {
      scorelines.push({
        score:
          `${h}-${a}`,
        probability:
          poisson(
            h,
            homeLambda
          ) *
          poisson(
            a,
            awayLambda
          )
      });
    }
  }

  scorelines.sort(
    (a, b) =>
      b.probability -
      a.probability
  );

  /*
  ==========================================================
  29. FINAL INTERNAL ANALYSIS
  ==========================================================
  */

  const internalAnalysis = {
    engine:
      "TomsonStakes Global Football Prediction Engine V4.0",

    fixture: {
      home:
        homeName,
      away:
        awayName,
      date:
        fixtureDate,
      apiFootballFixtureId:
        apiFixtureId,
      sportmonksFixtureId:
        smFixture?.id || null,
      leagueId,
      seasonId
    },

    model: {
      probabilities: {
        home:
          probability.home,
        draw:
          probability.draw,
        away:
          probability.away
      },

      percentage: {
        home:
          Math.round(
            probability.home * 100
          ),
        draw:
          Math.round(
            probability.draw * 100
          ),
        away:
          Math.round(
            probability.away * 100
          )
      },

      predictedGoals: {
        home:
          Number(
            homeLambda.toFixed(2)
          ),
        away:
          Number(
            awayLambda.toFixed(2)
          )
      },

      poisson:
        poissonModel
    },

    xG: {
      home: {
        historicalXGF:
          homeHistoricalXGF,
        historicalXGA:
          homeHistoricalXGA,
        sampleSize:
          homeXGProfile?.sampleSize ||
          0,
        venueSampleSize:
          homeXGProfile?.venueSampleSize ||
          0
      },

      away: {
        historicalXGF:
          awayHistoricalXGF,
        historicalXGA:
          awayHistoricalXGA,
        sampleSize:
          awayXGProfile?.sampleSize ||
          0,
        venueSampleSize:
          awayXGProfile?.venueSampleSize ||
          0
      },

      expectedGoals:
        {
          home:
            homeLambda,
          away:
            awayLambda
        }
    },

    apiFootball: {
      prediction:
        apiFootballPrediction,

      seasonStrength: {
        home:
          homeSeason,
        away:
          awaySeason
      }
    },

    sportmonks: {
      fixtureId:
        smFixture?.id || null,

      prediction:
        sportmonksPrediction,

      historicalXG: {
        home:
          homeXGProfile,
        away:
          awayXGProfile
      },

      sidelinedAvailable:
        Array.isArray(
          smFixture?.sidelined
        )
    },

    form: {
      home:
        homeForm,
      away:
        awayForm
    },

    h2h: {
      sampleSize:
        h2hFixtures.length,
      probabilities: {
        home:
          h2hHome,
        draw:
          h2hDraw,
        away:
          h2hAway
      }
    },

    injuries: {
      total:
        injuries.length,
      homeImpact:
        homeInjuryImpact,
      awayImpact:
        awayInjuryImpact
    },

    lineups: {
      home:
        homeLineup,
      away:
        awayLineup
    },

    rest: {
      home:
        homeRest,
      away:
        awayRest
    },

    market: market
      ? {
          sampleSize:
            market.sampleSize,
          probabilities: {
            home:
              market.home,
            draw:
              market.draw,
            away:
              market.away
          }
        }
      : null,

    value,

    fairOdds,

    markets,

    bestMarkets: {
      btts:
        bestBTTS,
      totals:
        bestGoalMarket,
      doubleChance:
        Object.entries(
          doubleChance
        ).sort(
          (a, b) =>
            b[1] - a[1]
        )[0]
    },

    topScorelines:
      scorelines.slice(0, 8),

    confidence: {
      score:
        confidenceScore,
      label:
        confidence
    },

    dataQuality: {
      apiFootballFixture:
        Boolean(apiFixtureId),

      sportmonksFixture:
        Boolean(smFixture?.id),

      historicalHomeXG:
        Boolean(
          homeXGProfile?.available
        ),

      historicalAwayXG:
        Boolean(
          awayXGProfile?.available
        ),

      bookmakerMarket:
        Boolean(market),

      apiFootballPrediction:
        Boolean(afPredictionRow),

      sportmonksPrediction:
        Boolean(
          sportmonksPrediction
        )
    },

    diagnostics
  };

  /*
  ==========================================================
  30. FINAL RESPONSE
  ==========================================================
  */

  return res.status(200).json({
    prediction:
      winner.label,

    probability:
      Math.round(
        winner.probability * 100
      ),

    /*
    Additional data is available to
    the frontend without changing the
    original prediction/probability
    contract.
    */

    homeTeam:
      homeName,

    awayTeam:
      awayName,

    confidence,

    confidenceScore,

    probabilities: {
      home:
        Number(
          (
            probability.home *
            100
          ).toFixed(1)
        ),

      draw:
        Number(
          (
            probability.draw *
            100
          ).toFixed(1)
        ),

      away:
        Number(
          (
            probability.away *
            100
          ).toFixed(1)
        )
    },

    predictedGoals: {
      home:
        Number(
          homeLambda.toFixed(2)
        ),

      away:
        Number(
          awayLambda.toFixed(2)
        )
    },

    markets: {
      doubleChance: {
        "1X":
          Math.round(
            doubleChance["1X"] *
            100
          ),

        "X2":
          Math.round(
            doubleChance["X2"] *
            100
          ),

        "12":
          Math.round(
            doubleChance["12"] *
            100
          )
      },

      drawNoBet: {
        home:
          Math.round(
            dnb.home * 100
          ),

        away:
          Math.round(
            dnb.away * 100
          )
      },

      btts: {
        yes:
          Math.round(
            poissonModel.bttsYes *
            100
          ),

        no:
          Math.round(
            poissonModel.bttsNo *
            100
          )
      },

      totals: {
        over15:
          Math.round(
            poissonModel.over15 *
            100
          ),

        under15:
          Math.round(
            poissonModel.under15 *
            100
          ),

        over25:
          Math.round(
            poissonModel.over25 *
            100
          ),

        under25:
          Math.round(
            poissonModel.under25 *
            100
          ),

        over35:
          Math.round(
            poissonModel.over35 *
            100
          ),

        under35:
          Math.round(
            poissonModel.under35 *
            100
          )
      }
    },

    fairOdds,

    value,

    bestMarkets: {
      btts:
        bestBTTS,

      totals:
        bestGoalMarket,

      doubleChance:
        Object.entries(
          doubleChance
        )
        .sort(
          (a, b) =>
            b[1] - a[1]
        )[0]
    },

    topScorelines:
      scorelines
        .slice(0, 5)
        .map(x => ({
          score:
            x.score,
          probability:
            Math.round(
              x.probability * 1000
            ) / 10
        })),

    internalAnalysis
  });
}
