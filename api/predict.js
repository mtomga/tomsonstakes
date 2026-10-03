// /api/predict.js
// ============================================================
// TOMSONSTAKES GLOBAL FOOTBALL
// Prediction Engine V4.0
//
// PRIMARY MODEL
// ------------------------------------------------------------
// Last 5 matches - recency weighted       45%
// Current league standings                 30%
// Season home/away strength                 5%
// Expected goals / goal model              10%
// Recent home/away venue form                5%
// Last 5 H2H                                 5%
// ------------------------------------------------------------
// TOTAL                                    100%
//
// IMPORTANT:
// - Injuries do NOT determine prediction.
// - Lineups do NOT determine prediction.
// - Bookmaker odds do NOT determine prediction.
// - API-Football /predictions does NOT determine prediction.
// - The highest calculated probability is always selected.
// - Missing data is NOT fabricated.
// ============================================================

const API_HOST = "https://v3.football.api-sports.io";

// ------------------------------------------------------------
// MODEL WEIGHTS
// ------------------------------------------------------------

const WEIGHTS = {
  recentForm: 0.45,
  standings: 0.30,
  seasonVenue: 0.05,
  expectedGoals: 0.10,
  recentVenueForm: 0.05,
  h2h: 0.05
};

// Recency weights: newest -> oldest
const RECENCY_WEIGHTS = [
  0.30,
  0.25,
  0.20,
  0.15,
  0.10
];

// ------------------------------------------------------------
// BASIC HELPERS
// ------------------------------------------------------------

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const n = Number(String(value).replace("%", "").trim());

  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;

  const factor = Math.pow(10, decimals);

  return Math.round(value * factor) / factor;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isCompletedFixture(fixture) {
  const status = fixture?.fixture?.status?.short;

  return [
    "FT",
    "AET",
    "PEN",
    "AWD",
    "WO"
  ].includes(status);
}

function getFixtureDate(fixture) {
  return parseDate(fixture?.fixture?.date);
}

// ------------------------------------------------------------
// API-FOOTBALL REQUEST
// ------------------------------------------------------------

async function api(path, params = {}) {
  const key =
    process.env.API_FOOTBALL_KEY ||
    process.env.APIFOOTBALL_KEY ||
    process.env.API_KEY;

  if (!key) {
    throw new Error(
      "Missing API_FOOTBALL_KEY environment variable."
    );
  }

  const query = new URLSearchParams();

  for (const [keyName, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      query.set(keyName, String(value));
    }
  }

  const url =
    `${API_HOST}${path}?${query.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-apisports-key": key,
      "Accept": "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `API returned non-JSON response (${response.status}).`
    );
  }

  if (!response.ok) {
    const message =
      data?.errors
        ? JSON.stringify(data.errors)
        : `HTTP ${response.status}`;

    throw new Error(message);
  }

  if (data?.errors && Object.keys(data.errors).length > 0) {
    throw new Error(
      JSON.stringify(data.errors)
    );
  }

  return data;
}

// ------------------------------------------------------------
// NORMALIZE PROBABILITIES
// ------------------------------------------------------------

function normalizeProbabilities(home, draw, away) {
  home = Math.max(0, numeric(home, 0));
  draw = Math.max(0, numeric(draw, 0));
  away = Math.max(0, numeric(away, 0));

  const total = home + draw + away;

  if (total <= 0) {
    return {
      home: 1 / 3,
      draw: 1 / 3,
      away: 1 / 3
    };
  }

  return {
    home: home / total,
    draw: draw / total,
    away: away / total
  };
}

// ------------------------------------------------------------
// CONVERT TWO TEAM STRENGTHS INTO 1X2 PROBABILITY
//
// Symmetric calculation.
// There is NO artificial home advantage here.
// ------------------------------------------------------------

function strengthToProbability(
  homeStrength,
  awayStrength,
  drawBase = 0.27
) {
  const home = clamp(
    numeric(homeStrength, 0.5)
  );

  const away = clamp(
    numeric(awayStrength, 0.5)
  );

  const total = home + away;

  let homeShare = 0.5;

  if (total > 0) {
    homeShare = home / total;
  }

  const edge = Math.abs(home - away);

  const drawProbability = clamp(
    drawBase - edge * 0.10,
    0.16,
    0.30
  );

  const remaining = 1 - drawProbability;

  const homeProbability =
    remaining * homeShare;

  const awayProbability =
    remaining * (1 - homeShare);

  return normalizeProbabilities(
    homeProbability,
    drawProbability,
    awayProbability
  );
}

// ------------------------------------------------------------
// GET LAST FIVE COMPLETED MATCHES
// ------------------------------------------------------------

function getRecentCompletedFixtures(
  fixtures,
  teamId,
  targetDate
) {
  const target = parseDate(targetDate);

  if (!target) return [];

  return safeArray(fixtures)
    .filter((fixture) => {
      const date = getFixtureDate(fixture);

      if (!date) return false;

      if (date >= target) return false;

      if (!isCompletedFixture(fixture)) {
        return false;
      }

      const homeId =
        numeric(fixture?.teams?.home?.id);

      const awayId =
        numeric(fixture?.teams?.away?.id);

      return (
        homeId === Number(teamId) ||
        awayId === Number(teamId)
      );
    })
    .sort((a, b) => {
      return (
        getFixtureDate(b) -
        getFixtureDate(a)
      );
    })
    .slice(0, 5);
}

// ------------------------------------------------------------
// BUILD RECENT FORM
// ------------------------------------------------------------

function buildRecentForm(
  fixtures,
  teamId,
  targetDate
) {
  const recent =
    getRecentCompletedFixtures(
      fixtures,
      teamId,
      targetDate
    );

  if (!recent.length) {
    return null;
  }

  const matches = [];

  let weightedResult = 0;
  let weightedGoalDiff = 0;
  let weightedGoalsFor = 0;
  let weightedGoalsAgainst = 0;

  let totalWeight = 0;

  let wins = 0;
  let draws = 0;
  let losses = 0;

  let goalsFor = 0;
  let goalsAgainst = 0;

  let cleanSheets = 0;
  let failedToScore = 0;

  recent.forEach((fixture, index) => {
    const homeId =
      numeric(fixture?.teams?.home?.id);

    const awayId =
      numeric(fixture?.teams?.away?.id);

    const homeGoals =
      numeric(fixture?.goals?.home, 0);

    const awayGoals =
      numeric(fixture?.goals?.away, 0);

    const isHome =
      homeId === Number(teamId);

    const gf =
      isHome ? homeGoals : awayGoals;

    const ga =
      isHome ? awayGoals : homeGoals;

    const goalDifference =
      gf - ga;

    let result = "D";
    let points = 1;
    let resultScore = 0.5;

    if (gf > ga) {
      result = "W";
      points = 3;
      resultScore = 1;
      wins++;
    } else if (gf < ga) {
      result = "L";
      points = 0;
      resultScore = 0;
      losses++;
    } else {
      draws++;
    }

    if (ga === 0) {
      cleanSheets++;
    }

    if (gf === 0) {
      failedToScore++;
    }

    goalsFor += gf;
    goalsAgainst += ga;

    const weight =
      RECENCY_WEIGHTS[index] ??
      0.10;

    weightedResult +=
      resultScore * weight;

    weightedGoalDiff +=
      goalDifference * weight;

    weightedGoalsFor +=
      gf * weight;

    weightedGoalsAgainst +=
      ga * weight;

    totalWeight += weight;

    matches.push({
      fixtureId:
        fixture?.fixture?.id ?? null,

      date:
        fixture?.fixture?.date ?? null,

      opponent:
        isHome
          ? fixture?.teams?.away?.name
          : fixture?.teams?.home?.name,

      venue:
        isHome ? "HOME" : "AWAY",

      result,

      points,

      goalsFor: gf,

      goalsAgainst: ga,

      goalDifference
    });
  });

  if (totalWeight <= 0) {
    return null;
  }

  weightedResult /=
    totalWeight;

  weightedGoalDiff /=
    totalWeight;

  weightedGoalsFor /=
    totalWeight;

  weightedGoalsAgainst /=
    totalWeight;

  // Normalize goal difference.
  const goalDifferenceScore =
    clamp(
      0.5 +
      weightedGoalDiff / 2,
      0,
      1
    );

  // Normalize attacking output.
  const attackScore =
    clamp(
      weightedGoalsFor / 3,
      0,
      1
    );

  // Normalize defensive output.
  const defenseScore =
    clamp(
      1 -
      weightedGoalsAgainst / 3,
      0,
      1
    );

  // Recent-form strength.
  //
  // Results are deliberately the strongest part,
  // followed by goal difference.
  const strength =
    (
      weightedResult * 0.55
    ) +
    (
      goalDifferenceScore * 0.25
    ) +
    (
      attackScore * 0.10
    ) +
    (
      defenseScore * 0.10
    );

  const totalPoints =
    wins * 3 + draws;

  return {
    matches,

    matchCount: recent.length,

    wins,
    draws,
    losses,

    points: totalPoints,

    ppg:
      totalPoints /
      recent.length,

    goalsFor,

    goalsAgainst,

    goalDifference:
      goalsFor - goalsAgainst,

    cleanSheets,

    failedToScore,

    weightedResult:
      round(weightedResult * 100, 2),

    weightedGoalDifference:
      round(weightedGoalDiff, 3),

    weightedGoalsFor:
      round(weightedGoalsFor, 3),

    weightedGoalsAgainst:
      round(weightedGoalsAgainst, 3),

    strength:
      clamp(strength)
  };
}

// ------------------------------------------------------------
// VENUE-SPECIFIC RECENT FORM
// ------------------------------------------------------------

function buildRecentVenueForm(
  fixtures,
  teamId,
  targetDate,
  venue
) {
  const target = parseDate(targetDate);

  if (!target) return null;

  const filtered =
    safeArray(fixtures)
      .filter((fixture) => {
        const date =
          getFixtureDate(fixture);

        if (!date || date >= target) {
          return false;
        }

        if (!isCompletedFixture(fixture)) {
          return false;
        }

        const homeId =
          numeric(
            fixture?.teams?.home?.id
          );

        const awayId =
          numeric(
            fixture?.teams?.away?.id
          );

        if (
          homeId !== Number(teamId) &&
          awayId !== Number(teamId)
        ) {
          return false;
        }

        if (venue === "HOME") {
          return homeId === Number(teamId);
        }

        if (venue === "AWAY") {
          return awayId === Number(teamId);
        }

        return false;
      })
      .sort((a, b) => {
        return (
          getFixtureDate(b) -
          getFixtureDate(a)
        );
      })
      .slice(0, 5);

  if (!filtered.length) {
    return null;
  }

  return buildRecentForm(
    filtered,
    teamId,
    targetDate
  );
}

// ------------------------------------------------------------
// STANDINGS MAP
// ------------------------------------------------------------

function buildStandingsMap(response) {
  const map = new Map();

  for (const leagueBlock of safeArray(response)) {
    const standingsGroups =
      safeArray(
        leagueBlock?.league?.standings
      );

    for (const group of standingsGroups) {
      const table =
        safeArray(group);

      const tableSize =
        table.length;

      for (const row of table) {
        const id =
          numeric(row?.team?.id);

        if (id === null) continue;

        map.set(Number(id), {
          ...row,
          tableSize
        });
      }
    }
  }

  return map;
}

// ------------------------------------------------------------
// STANDINGS TEAM STRENGTH
// ------------------------------------------------------------

function buildStandingTeamStrength(row) {
  if (!row) return null;

  const played =
    numeric(row?.all?.played, 0);

  const points =
    numeric(row?.points, 0);

  const rank =
    numeric(row?.rank, null);

  const goalsDiff =
    numeric(row?.goalsDiff, 0);

  const tableSize =
    numeric(row?.tableSize, null);

  if (
    rank === null &&
    points === null
  ) {
    return null;
  }

  const ppg =
    played > 0
      ? points / played
      : points;

  const pointsScore =
    clamp(
      ppg / 3,
      0,
      1
    );

  const gdPerGame =
    played > 0
      ? goalsDiff / played
      : goalsDiff;

  const gdScore =
    clamp(
      0.5 + gdPerGame / 2,
      0,
      1
    );

  let rankScore = 0.5;

  if (
    rank !== null &&
    tableSize &&
    tableSize > 1
  ) {
    rankScore =
      clamp(
        (
          tableSize - rank
        ) /
        (
          tableSize - 1
        ),
        0,
        1
      );
  }

  const strength =
    (
      pointsScore * 0.50
    ) +
    (
      gdScore * 0.25
    ) +
    (
      rankScore * 0.25
    );

  return {
    rank,

    points,

    played,

    goalDifference: goalsDiff,

    goalDifferencePerGame:
      round(gdPerGame, 3),

    pointsPerGame:
      round(ppg, 3),

    form:
      row?.form || null,

    strength:
      clamp(strength)
  };
}

// ------------------------------------------------------------
// SEASON HOME/AWAY STRENGTH
// ------------------------------------------------------------

function getVenueSeasonStrength(
  stats,
  venue
) {
  if (!stats) return null;

  const played =
    numeric(
      stats?.fixtures?.played?.[venue],
      null
    );

  if (!played || played <= 0) {
    return null;
  }

  const wins =
    numeric(
      stats?.fixtures?.wins?.[venue],
      0
    );

  const draws =
    numeric(
      stats?.fixtures?.draws?.[venue],
      0
    );

  const losses =
    numeric(
      stats?.fixtures?.loses?.[venue],
      0
    );

  const goalsFor =
    numeric(
      stats?.goals?.for?.average?.[venue],
      null
    );

  const goalsAgainst =
    numeric(
      stats?.goals?.against?.average?.[venue],
      null
    );

  const points =
    wins * 3 + draws;

  const ppg =
    points / played;

  const resultScore =
    clamp(
      ppg / 3,
      0,
      1
    );

  const attackScore =
    goalsFor === null
      ? 0.5
      : clamp(
          goalsFor / 3,
          0,
          1
        );

  const defenseScore =
    goalsAgainst === null
      ? 0.5
      : clamp(
          1 -
          goalsAgainst / 3,
          0,
          1
        );

  const strength =
    (
      resultScore * 0.50
    ) +
    (
      attackScore * 0.25
    ) +
    (
      defenseScore * 0.25
    );

  return {
    played,

    wins,

    draws,

    losses,

    points,

    pointsPerGame:
      round(ppg, 3),

    goalsFor:
      round(goalsFor, 3),

    goalsAgainst:
      round(goalsAgainst, 3),

    strength:
      clamp(strength)
  };
}

// ------------------------------------------------------------
// XG EXTRACTION FROM NORMALIZED WEB DATA
//
// This intentionally supports several possible shapes because
// your normalize-web.js has changed during development.
// ------------------------------------------------------------

function extractNumericXG(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  if (typeof value === "string") {
    const n =
      Number(
        value
          .replace("xG", "")
          .replace("%", "")
          .trim()
      );

    return Number.isFinite(n)
      ? n
      : null;
  }

  return null;
}

function extractTeamXG(
  xgBlock,
  team
) {
  if (!xgBlock) return null;

  const candidates =
    team === "home"
      ? [
          xgBlock.home,
          xgBlock.homeXg,
          xgBlock.home_xg,
          xgBlock.xgHome,
          xgBlock.homeExpectedGoals,
          xgBlock.home_expected_goals
        ]
      : [
          xgBlock.away,
          xgBlock.awayXg,
          xgBlock.away_xg,
          xgBlock.xgAway,
          xgBlock.awayExpectedGoals,
          xgBlock.away_expected_goals
        ];

  for (const value of candidates) {
    const parsed =
      extractNumericXG(value);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

// ------------------------------------------------------------
// POISSON DISTRIBUTION
// ------------------------------------------------------------

function factorial(n) {
  if (n <= 1) return 1;

  let result = 1;

  for (let i = 2; i <= n; i++) {
    result *= i;
  }

  return result;
}

function poissonProbability(
  goals,
  lambda
) {
  if (
    !Number.isFinite(lambda) ||
    lambda < 0
  ) {
    return 0;
  }

  return (
    Math.exp(-lambda) *
    Math.pow(lambda, goals) /
    factorial(goals)
  );
}

// ------------------------------------------------------------
// POISSON 1X2
// ------------------------------------------------------------

function poisson1X2(
  homeXG,
  awayXG
) {
  homeXG =
    clamp(
      numeric(homeXG, 1.2),
      0,
      6
    );

  awayXG =
    clamp(
      numeric(awayXG, 1.0),
      0,
      6
    );

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  const maxGoals = 8;

  for (
    let homeGoals = 0;
    homeGoals <= maxGoals;
    homeGoals++
  ) {
    const homeProbability =
      poissonProbability(
        homeGoals,
        homeXG
      );

    for (
      let awayGoals = 0;
      awayGoals <= maxGoals;
      awayGoals++
    ) {
      const awayProbability =
        poissonProbability(
          awayGoals,
          awayXG
        );

      const probability =
        homeProbability *
        awayProbability;

      if (homeGoals > awayGoals) {
        homeWin += probability;
      } else if (
        homeGoals === awayGoals
      ) {
        draw += probability;
      } else {
        awayWin += probability;
      }
    }
  }

  return normalizeProbabilities(
    homeWin,
    draw,
    awayWin
  );
}

// ------------------------------------------------------------
// DERIVE XG FROM SEASON ATTACK/DEFENCE
// ------------------------------------------------------------

function deriveExpectedGoals(
  homeStats,
  awayStats
) {
  const homeAttack =
    numeric(
      homeStats?.goals?.for?.average?.home,
      null
    );

  const homeDefense =
    numeric(
      homeStats?.goals?.against?.average?.home,
      null
    );

  const awayAttack =
    numeric(
      awayStats?.goals?.for?.average?.away,
      null
    );

  const awayDefense =
    numeric(
      awayStats?.goals?.against?.average?.away,
      null
    );

  if (
    homeAttack === null &&
    homeDefense === null &&
    awayAttack === null &&
    awayDefense === null
  ) {
    return null;
  }

  // Combine attacking and defensive expectations.
  //
  // We do NOT simply use one team's scoring average.
  // Each side's attack is compared with the opponent's
  // defensive record.

  const homeXG =
    (
      numeric(homeAttack, 1.2) +
      numeric(awayDefense, 1.2)
    ) / 2;

  const awayXG =
    (
      numeric(awayAttack, 1.0) +
      numeric(homeDefense, 1.2)
    ) / 2;

  return {
    homeXG:
      clamp(homeXG, 0.15, 4.5),

    awayXG:
      clamp(awayXG, 0.15, 4.5),

    source:
      "derived_from_season_home_away_goals"
  };
}

// ------------------------------------------------------------
// BUILD XG SIGNAL
// ------------------------------------------------------------

function buildExpectedGoalsSignal(
  normalized,
  homeStats,
  awayStats
) {
  const xgBlock =
    normalized?.xg ||
    normalized?.expectedGoals ||
    normalized?.goals?.xg ||
    null;

  let homeXG =
    extractTeamXG(
      xgBlock,
      "home"
    );

  let awayXG =
    extractTeamXG(
      xgBlock,
      "away"
    );

  let source =
    "normalized_web_data";

  if (
    homeXG === null ||
    awayXG === null
  ) {
    const derived =
      deriveExpectedGoals(
        homeStats,
        awayStats
      );

    if (!derived) {
      return null;
    }

    homeXG =
      derived.homeXG;

    awayXG =
      derived.awayXG;

    source =
      derived.source;
  }

  const probabilities =
    poisson1X2(
      homeXG,
      awayXG
    );

  return {
    homeXG:
      round(homeXG, 3),

    awayXG:
      round(awayXG, 3),

    source,

    probabilities
  };
}

// ------------------------------------------------------------
// H2H SIGNAL
// ------------------------------------------------------------

function buildH2HSignal(
  fixtures,
  homeTeamId,
  awayTeamId
) {
  const matches =
    safeArray(fixtures)
      .filter(
        isCompletedFixture
      )
      .sort((a, b) => {
        return (
          getFixtureDate(b) -
          getFixtureDate(a)
        );
      })
      .slice(0, 5);

  if (!matches.length) {
    return null;
  }

  let homeWeight = 0;
  let drawWeight = 0;
  let awayWeight = 0;

  let totalWeight = 0;

  matches.forEach(
    (fixture, index) => {
      const homeId =
        numeric(
          fixture?.teams?.home?.id
        );

      const awayId =
        numeric(
          fixture?.teams?.away?.id
        );

      const homeGoals =
        numeric(
          fixture?.goals?.home,
          0
        );

      const awayGoals =
        numeric(
          fixture?.goals?.away,
          0
        );

      const weight =
        RECENCY_WEIGHTS[index] ??
        0.10;

      totalWeight += weight;

      // Current fixture's home team
      // gets the H2H home-side signal.
      if (
        homeId === Number(homeTeamId)
      ) {
        if (homeGoals > awayGoals) {
          homeWeight += weight;
        } else if (
          homeGoals === awayGoals
        ) {
          drawWeight += weight;
        } else {
          awayWeight += weight;
        }

      } else if (
        awayId === Number(homeTeamId)
      ) {
        // Target home team was away in this
        // historical meeting.
        if (awayGoals > homeGoals) {
          homeWeight += weight;
        } else if (
          awayGoals === homeGoals
        ) {
          drawWeight += weight;
        } else {
          awayWeight += weight;
        }
      }
    }
  );

  if (totalWeight <= 0) {
    return null;
  }

  return {
    matchCount: matches.length,

    probabilities:
      normalizeProbabilities(
        homeWeight,
        drawWeight,
        awayWeight
      ),

    matches:
      matches.map((fixture) => ({
        date:
          fixture?.fixture?.date,

        home:
          fixture?.teams?.home?.name,

        away:
          fixture?.teams?.away?.name,

        homeGoals:
          fixture?.goals?.home,

        awayGoals:
          fixture?.goals?.away
      }))
  };
}

// ------------------------------------------------------------
// GET MAXIMUM PREDICTION
// ------------------------------------------------------------

function choosePrediction(
  probabilities
) {
  const entries = [
    {
      key: "home",
      label: "Home Win",
      probability:
        probabilities.home
    },
    {
      key: "draw",
      label: "Draw",
      probability:
        probabilities.draw
    },
    {
      key: "away",
      label: "Away Win",
      probability:
        probabilities.away
    }
  ];

  entries.sort(
    (a, b) =>
      b.probability -
      a.probability
  );

  return entries[0];
}

// ------------------------------------------------------------
// COMBINE SIGNALS
//
// Missing signals are excluded and the remaining weights
// are renormalized. This is much safer than inventing data.
// ------------------------------------------------------------

function combineSignals(signals) {
  let home = 0;
  let draw = 0;
  let away = 0;

  let usedWeight = 0;

  const details = {};

  for (
    const [
      name,
      signal
    ] of Object.entries(signals)
  ) {
    if (!signal) {
      details[name] = {
        available: false,
        configuredWeight:
          WEIGHTS[name]
      };

      continue;
    }

    const weight =
      WEIGHTS[name];

    if (
      !weight ||
      !signal.probabilities
    ) {
      continue;
    }

    home +=
      signal.probabilities.home *
      weight;

    draw +=
      signal.probabilities.draw *
      weight;

    away +=
      signal.probabilities.away *
      weight;

    usedWeight += weight;

    details[name] = {
      available: true,

      configuredWeight:
        weight,

      effectiveWeight:
        weight,

      probabilities:
        signal.probabilities
    };
  }

  if (usedWeight <= 0) {
    return {
      probabilities:
        normalizeProbabilities(
          1,
          1,
          1
        ),

      usedWeight: 0,

      details
    };
  }

  const probabilities =
    normalizeProbabilities(
      home / usedWeight,
      draw / usedWeight,
      away / usedWeight
    );

  // Calculate effective weights after
  // missing-data renormalization.
  for (
    const name of Object.keys(details)
  ) {
    if (
      details[name]?.available
    ) {
      details[name].effectiveWeight =
        WEIGHTS[name] /
        usedWeight;
    }
  }

  return {
    probabilities,

    usedWeight,

    details
  };
}

// ------------------------------------------------------------
// SIGNAL AGREEMENT
//
// Measures whether the available signals broadly point
// in the same direction.
// ------------------------------------------------------------

function calculateAgreement(
  signals
) {
  const available =
    Object.entries(signals)
      .filter(
        ([, signal]) =>
          signal &&
          signal.probabilities
      )
      .map(
        ([name, signal]) => ({
          name,
          probabilities:
            signal.probabilities
        })
      );

  if (available.length < 2) {
    return 0.5;
  }

  let totalDistance = 0;
  let comparisons = 0;

  for (
    let i = 0;
    i < available.length;
    i++
  ) {
    for (
      let j = i + 1;
      j < available.length;
      j++
    ) {
      const a =
        available[i].probabilities;

      const b =
        available[j].probabilities;

      const distance =
        (
          Math.abs(
            a.home - b.home
          ) +
          Math.abs(
            a.draw - b.draw
          ) +
          Math.abs(
            a.away - b.away
          )
        ) / 2;

      totalDistance += distance;
      comparisons++;
    }
  }

  if (comparisons <= 0) {
    return 0.5;
  }

  return clamp(
    1 -
    totalDistance /
    comparisons,
    0,
    1
  );
}

// ------------------------------------------------------------
// DATA COMPLETENESS
// ------------------------------------------------------------

function calculateDataCompleteness(
  signals
) {
  const total =
    Object.keys(WEIGHTS).length;

  const available =
    Object.values(signals)
      .filter(Boolean)
      .length;

  return clamp(
    available / total,
    0,
    1
  );
}

// ------------------------------------------------------------
// CONFIDENCE
//
// This is NOT the probability itself.
// It reflects probability strength + margin +
// signal agreement + data completeness.
// ------------------------------------------------------------

function calculateConfidence(
  probabilities,
  agreement,
  completeness
) {
  const selected =
    Math.max(
      probabilities.home,
      probabilities.draw,
      probabilities.away
    );

  const sorted = [
    probabilities.home,
    probabilities.draw,
    probabilities.away
  ].sort((a, b) => b - a);

  const margin =
    sorted[0] - sorted[1];

  const score =
    (
      selected * 45
    ) +
    (
      margin * 25
    ) +
    (
      agreement * 20
    ) +
    (
      completeness * 10
    );

  let level = "LOW";

  if (score >= 65) {
    level = "HIGH";
  } else if (score >= 50) {
    level = "MEDIUM";
  }

  return {
    score:
      round(score, 2),

    level,

    highestProbability:
      round(selected * 100, 2),

    margin:
      round(margin * 100, 2),

    agreement:
      round(agreement * 100, 2),

    dataCompleteness:
      round(completeness * 100, 2)
  };
}

// ------------------------------------------------------------
// FLEXIBLE NORMALIZED FIXTURE EXTRACTION
// ------------------------------------------------------------

function extractFixture(
  normalized
) {
  return (
    normalized?.fixture ||
    normalized?.match ||
    normalized?.fixtureData ||
    null
  );
}

// ------------------------------------------------------------
// MAIN HANDLER
// ------------------------------------------------------------

export default async function handler(
  req,
  res
) {
  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ----------------------------------------------------------
  // HEALTH CHECK
  // ----------------------------------------------------------

  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      service:
        "TomsonStakes Global Football Prediction Engine",
      version:
        "Prediction Engine V4.0",
      status:
        "online",
      weights: WEIGHTS,
      predictionSignals: [
        "recent_form",
        "standings",
        "season_home_away_strength",
        "expected_goals",
        "recent_venue_form",
        "h2h"
      ],
      excludedFromPrediction: [
        "injuries",
        "lineups",
        "bookmaker_odds",
        "api_football_predictions"
      ]
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error:
        "Method not allowed."
    });
  }

  try {
    // --------------------------------------------------------
    // REQUEST BODY
    // --------------------------------------------------------

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const normalized =
      body?.normalized ||
      body?.data ||
      body ||
      {};

    // --------------------------------------------------------
    // FIXTURE
    // --------------------------------------------------------

    const fixture =
      extractFixture(
        normalized
      );

    const fixtureId =
      numeric(
        fixture?.fixture?.id ??
        fixture?.id ??
        body?.fixtureId
      );

    const homeTeam =
      fixture?.teams?.home ||
      normalized?.teams?.home ||
      body?.homeTeam ||
      {};

    const awayTeam =
      fixture?.teams?.away ||
      normalized?.teams?.away ||
      body?.awayTeam ||
      {};

    const homeTeamId =
      numeric(
        homeTeam?.id ??
        normalized?.homeTeamId ??
        body?.homeTeamId
      );

    const awayTeamId =
      numeric(
        awayTeam?.id ??
        normalized?.awayTeamId ??
        body?.awayTeamId
      );

    const leagueId =
      numeric(
        fixture?.league?.id ??
        normalized?.league?.id ??
        normalized?.leagueId ??
        body?.leagueId
      );

    const season =
      numeric(
        fixture?.league?.season ??
        normalized?.league?.season ??
        normalized?.season ??
        body?.season
      );

    const fixtureDate =
      fixture?.fixture?.date ||
      normalized?.fixtureDate ||
      body?.fixtureDate ||
      new Date().toISOString();

    if (
      homeTeamId === null ||
      awayTeamId === null
    ) {
      return res.status(400).json({
        success: false,
        version:
          "Prediction Engine V4.0",
        error:
          "Home and away team IDs are required."
      });
    }

    if (
      leagueId === null ||
      season === null
    ) {
      return res.status(400).json({
        success: false,
        version:
          "Prediction Engine V4.0",
        error:
          "League ID and season are required."
      });
    }

    // --------------------------------------------------------
    // FETCH PRIMARY DATA
    //
    // No injuries.
    // No lineups.
    // No bookmaker odds.
    // No /predictions.
    // --------------------------------------------------------

    const requests = {
      homeRecent:
        api("/fixtures", {
          team: homeTeamId,
          last: 10
        }),

      awayRecent:
        api("/fixtures", {
          team: awayTeamId,
          last: 10
        }),

      standings:
        api("/standings", {
          league: leagueId,
          season
        }),

      homeStats:
        api("/teams/statistics", {
          league: leagueId,
          season,
          team: homeTeamId
        }),

      awayStats:
        api("/teams/statistics", {
          league: leagueId,
          season,
          team: awayTeamId
        }),

      h2h:
        api("/fixtures/headtohead", {
          h2h:
            `${homeTeamId}-${awayTeamId}`,
          last: 5
        })
    };

    const keys =
      Object.keys(requests);

    const results =
      await Promise.allSettled(
        Object.values(requests)
      );

    const data = {};

    keys.forEach(
      (key, index) => {
        const result =
          results[index];

        data[key] =
          result.status === "fulfilled"
            ? result.value
            : null;
      }
    );

    // --------------------------------------------------------
    // LAST FIVE FORM
    // --------------------------------------------------------

    const homeRecentForm =
      buildRecentForm(
        data.homeRecent?.response,
        homeTeamId,
        fixtureDate
      );

    const awayRecentForm =
      buildRecentForm(
        data.awayRecent?.response,
        awayTeamId,
        fixtureDate
      );

    let recentFormSignal = null;

    if (
      homeRecentForm &&
      awayRecentForm
    ) {
      recentFormSignal = {
        probabilities:
          strengthToProbability(
            homeRecentForm.strength,
            awayRecentForm.strength,
            0.27
          ),

        home:
          homeRecentForm,

        away:
          awayRecentForm
      };
    }

    // --------------------------------------------------------
    // STANDINGS
    // --------------------------------------------------------

    const standingsMap =
      buildStandingsMap(
        data.standings?.response
      );

    const homeStandingRow =
      standingsMap.get(
        Number(homeTeamId)
      );

    const awayStandingRow =
      standingsMap.get(
        Number(awayTeamId)
      );

    const homeStanding =
      buildStandingTeamStrength(
        homeStandingRow
      );

    const awayStanding =
      buildStandingTeamStrength(
        awayStandingRow
      );

    let standingsSignal = null;

    if (
      homeStanding &&
      awayStanding
    ) {
      standingsSignal = {
        probabilities:
          strengthToProbability(
            homeStanding.strength,
            awayStanding.strength,
            0.27
          ),

        home:
          homeStanding,

        away:
          awayStanding
      };
    }

    // --------------------------------------------------------
    // SEASON HOME/AWAY STRENGTH
    // --------------------------------------------------------

    const homeSeasonVenue =
      getVenueSeasonStrength(
        data.homeStats?.response?.[0],
        "home"
      );

    const awaySeasonVenue =
      getVenueSeasonStrength(
        data.awayStats?.response?.[0],
        "away"
      );

    let seasonVenueSignal = null;

    if (
      homeSeasonVenue &&
      awaySeasonVenue
    ) {
      seasonVenueSignal = {
        probabilities:
          strengthToProbability(
            homeSeasonVenue.strength,
            awaySeasonVenue.strength,
            0.27
          ),

        home:
          homeSeasonVenue,

        away:
          awaySeasonVenue
      };
    }

    // --------------------------------------------------------
    // EXPECTED GOALS
    // --------------------------------------------------------

    const expectedGoalsSignal =
      buildExpectedGoalsSignal(
        normalized,
        data.homeStats?.response?.[0],
        data.awayStats?.response?.[0]
      );

    // --------------------------------------------------------
    // RECENT HOME/AWAY VENUE FORM
    // --------------------------------------------------------

    const homeVenueForm =
      buildRecentVenueForm(
        data.homeRecent?.response,
        homeTeamId,
        fixtureDate,
        "HOME"
      );

    const awayVenueForm =
      buildRecentVenueForm(
        data.awayRecent?.response,
        awayTeamId,
        fixtureDate,
        "AWAY"
      );

    let recentVenueFormSignal = null;

    if (
      homeVenueForm &&
      awayVenueForm
    ) {
      recentVenueFormSignal = {
        probabilities:
          strengthToProbability(
            homeVenueForm.strength,
            awayVenueForm.strength,
            0.27
          ),

        home:
          homeVenueForm,

        away:
          awayVenueForm
      };
    }

    // --------------------------------------------------------
    // H2H
    // --------------------------------------------------------

    const h2hSignal =
      buildH2HSignal(
        data.h2h?.response,
        homeTeamId,
        awayTeamId
      );

    // --------------------------------------------------------
    // ALL MODEL SIGNALS
    // --------------------------------------------------------

    const signals = {
      recentForm:
        recentFormSignal,

      standings:
        standingsSignal,

      seasonVenue:
        seasonVenueSignal,

      expectedGoals:
        expectedGoalsSignal,

      recentVenueForm:
        recentVenueFormSignal,

      h2h:
        h2hSignal
    };

    // --------------------------------------------------------
    // COMBINE
    // --------------------------------------------------------

    const combined =
      combineSignals(
        signals
      );

    const probabilities =
      combined.probabilities;

    // --------------------------------------------------------
    // SELECT TRUE MAXIMUM
    // --------------------------------------------------------

    const selected =
      choosePrediction(
        probabilities
      );

    // --------------------------------------------------------
    // AGREEMENT
    // --------------------------------------------------------

    const agreement =
      calculateAgreement(
        signals
      );

    // --------------------------------------------------------
    // DATA COMPLETENESS
    // --------------------------------------------------------

    const dataCompleteness =
      calculateDataCompleteness(
        signals
      );

    // --------------------------------------------------------
    // CONFIDENCE
    // --------------------------------------------------------

    const confidence =
      calculateConfidence(
        probabilities,
        agreement,
        dataCompleteness
      );

    // --------------------------------------------------------
    // PROBABILITY PERCENTAGES
    // --------------------------------------------------------

    const probabilityPercentages = {
      home:
        round(
          probabilities.home * 100,
          2
        ),

      draw:
        round(
          probabilities.draw * 100,
          2
        ),

      away:
        round(
          probabilities.away * 100,
          2
        )
    };

    // --------------------------------------------------------
    // PREDICTION REMARK
    //
    // This is included in the API so the frontend can use it
    // directly.
    // --------------------------------------------------------

    let remark = "AVOID";

    if (
      selected.probability > 0.80
    ) {
      remark = "HIGH";
    } else if (
      selected.probability >= 0.60
    ) {
      remark = "MEDIUM";
    }

    // --------------------------------------------------------
    // MODEL STATUS
    // --------------------------------------------------------

    let status =
      "FULL_DATA";

    if (
      dataCompleteness < 0.50
    ) {
      status =
        "LIMITED_DATA";
    } else if (
      dataCompleteness < 1
    ) {
      status =
        "PARTIAL_DATA";
    }

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,

      version:
        "Prediction Engine V4.0",

      engine:
        "TomsonStakes Global Football",

      status,

      match: {
        fixtureId,

        homeTeam:
          homeTeam?.name ||
          "Home",

        awayTeam:
          awayTeam?.name ||
          "Away",

        league:
          fixture?.league?.name ||
          normalized?.league?.name ||
          null,

        country:
          fixture?.league?.country ||
          normalized?.league?.country ||
          null,

        season,

        date:
          fixtureDate
      },

      prediction:
        selected.label,

      predictedTeam:
        selected.key === "home"
          ? homeTeam?.name || "Home"
          : selected.key === "away"
            ? awayTeam?.name || "Away"
            : null,

      probability:
        round(
          selected.probability * 100,
          2
        ),

      probabilities:
        probabilityPercentages,

      confidence,

      remark,

      agreement:
        round(
          agreement * 100,
          2
        ),

      dataCompleteness:
        round(
          dataCompleteness * 100,
          2
        ),

      weights: {
        recentForm:
          "45%",

        standings:
          "30%",

        seasonVenue:
          "5%",

        expectedGoals:
          "10%",

        recentVenueForm:
          "5%",

        h2h:
          "5%"
      },

      signalAvailability:
        combined.details,

      internalAnalysis: {
        recentForm: {
          available:
            !!recentFormSignal,

          home:
            homeRecentForm,

          away:
            awayRecentForm,

          probabilities:
            recentFormSignal?.probabilities ||
            null
        },

        standings: {
          available:
            !!standingsSignal,

          home:
            homeStanding,

          away:
            awayStanding,

          probabilities:
            standingsSignal?.probabilities ||
            null
        },

        seasonHomeAway: {
          available:
            !!seasonVenueSignal,

          home:
            homeSeasonVenue,

          away:
            awaySeasonVenue,

          probabilities:
            seasonVenueSignal?.probabilities ||
            null
        },

        expectedGoals: {
          available:
            !!expectedGoalsSignal,

          homeXG:
            expectedGoalsSignal?.homeXG ||
            null,

          awayXG:
            expectedGoalsSignal?.awayXG ||
            null,

          source:
            expectedGoalsSignal?.source ||
            null,

          probabilities:
            expectedGoalsSignal?.probabilities ||
            null
        },

        recentVenueForm: {
          available:
            !!recentVenueFormSignal,

          home:
            homeVenueForm,

          away:
            awayVenueForm,

          probabilities:
            recentVenueFormSignal?.probabilities ||
            null
        },

        h2h: {
          available:
            !!h2hSignal,

          matchCount:
            h2hSignal?.matchCount ||
            0,

          probabilities:
            h2hSignal?.probabilities ||
            null,

          matches:
            h2hSignal?.matches ||
            []
        },

        finalProbabilities:
          probabilities,

        selectedSignal:
          selected.key,

        selectedProbability:
          round(
            selected.probability * 100,
            2
          )
      },

      excludedFromPrediction: [
        "injuries",
        "lineups",
        "bookmaker_odds",
        "api_football_predictions"
      ],

      notes: [
        "Last five matches receive the highest model weight.",
        "Recent matches are recency weighted.",
        "Current standings receive 30% of the model.",
        "Missing signals are not fabricated; available signal weights are renormalized.",
        "The prediction is always the highest calculated Home/Draw/Away probability.",
        "Injuries and lineups do not alter the final probability."
      ]
    });

  } catch (error) {
    console.error(
      "Prediction Engine V4.0 error:",
      error
    );

    return res.status(500).json({
      success: false,

      version:
        "Prediction Engine V4.0",

      error:
        error?.message ||
        "Prediction engine failed.",

      prediction:
        null,

      probability:
        null,

      probabilities: {
        home: null,
        draw: null,
        away: null
      },

      confidence: {
        level: "LOW"
      }
    });
  }
}
