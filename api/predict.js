// /api/predict.js
// TomsonStakes Global Football Prediction Engine
// Prediction Engine V3.1
//
// Frontend contract remains unchanged.
// Frontend only needs:
//   prediction
//   probability
//
// Backend combines:
//   API-Football prediction
//   bookmaker market probability
//   team season statistics
//   recent last-5 results
//   home/away strength
//   xG / expected goals
//   H2H
//   injuries
//   lineups when available
//   congestion/rest
//   normalized web/context evidence

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const API_KEY = process.env.APIFOOTBALL_KEY;

    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        error: "APIFOOTBALL_KEY is not configured."
      });
    }

    const body = req.body || {};
    const match = body.match || {};
    const normalized = body.normalized || {};

    const homeName = match.home;
    const awayName = match.away;
    const matchDate = match.date || null;

    if (!homeName || !awayName) {
      return res.status(400).json({
        success: false,
        error: "Home and away team names are required."
      });
    }

    const api = (endpoint) =>
      fetch(`https://v3.football.api-sports.io${endpoint}`, {
        headers: {
          "x-apisports-key": API_KEY
        }
      })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));

          return {
            ok: r.ok,
            status: r.status,
            data
          };
        })
        .catch(() => ({
          ok: false,
          status: 0,
          data: {}
        }));

    // ============================================================
    // HELPERS
    // ============================================================

    const clamp = (value, min, max) =>
      Math.max(min, Math.min(max, value));

    const round = (value, decimals = 3) => {
      if (!Number.isFinite(value)) return null;

      const factor = Math.pow(10, decimals);
      return Math.round(value * factor) / factor;
    };

    const normalizeName = (name) => {
      return String(name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
    };

    const safeArray = (value) =>
      Array.isArray(value) ? value : [];

    const numeric = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const parseDate = (value) => {
      if (!value) return null;

      const d = new Date(value);

      if (Number.isNaN(d.getTime())) {
        return null;
      }

      return d;
    };

    // ============================================================
    // FIXTURE RESOLUTION
    // ============================================================

    let fixture = null;

    // Try fixture supplied by normalized data first.
    fixture =
      normalized.fixture ||
      normalized.fixtureData ||
      normalized.apiFixture ||
      null;

    let fixtureId =
      fixture?.fixture?.id ||
      fixture?.id ||
      null;

    let leagueId =
      fixture?.league?.id ||
      null;

    let season =
      fixture?.league?.season ||
      null;

    let homeTeamId =
      fixture?.teams?.home?.id ||
      null;

    let awayTeamId =
      fixture?.teams?.away?.id ||
      null;

    // ------------------------------------------------------------
    // If fixture information was not supplied, resolve it.
    // ------------------------------------------------------------

    if (!fixtureId && matchDate) {
      const dateOnly = String(matchDate).slice(0, 10);

      const fixtureResponse = await api(
        `/fixtures?date=${encodeURIComponent(
          dateOnly
        )}&timezone=Africa%2FLagos`
      );

      const fixtures = safeArray(
        fixtureResponse.data?.response
      );

      const targetHome = normalizeName(homeName);
      const targetAway = normalizeName(awayName);

      // Exact team-name match
      fixture =
        fixtures.find((f) => {
          const h = normalizeName(
            f?.teams?.home?.name
          );

          const a = normalizeName(
            f?.teams?.away?.name
          );

          return h === targetHome && a === targetAway;
        }) || null;

      // Fuzzy fallback
      if (!fixture) {
        fixture =
          fixtures.find((f) => {
            const h = normalizeName(
              f?.teams?.home?.name
            );

            const a = normalizeName(
              f?.teams?.away?.name
            );

            return (
              (h.includes(targetHome) ||
                targetHome.includes(h)) &&
              (a.includes(targetAway) ||
                targetAway.includes(a))
            );
          }) || null;
      }

      if (fixture) {
        fixtureId = fixture.fixture?.id || null;
        leagueId = fixture.league?.id || null;
        season = fixture.league?.season || null;
        homeTeamId = fixture.teams?.home?.id || null;
        awayTeamId = fixture.teams?.away?.id || null;
      }
    }

    // ============================================================
    // FALLBACK ENGINE
    // ============================================================

    const getNormalizedXG = () => {
      const home =
        numeric(normalized?.xG?.home) ??
        numeric(normalized?.xg?.home) ??
        numeric(normalized?.expectedGoals?.home) ??
        numeric(normalized?.expected_goals?.home) ??
        numeric(normalized?.homeXG) ??
        numeric(normalized?.homeXg) ??
        numeric(normalized?.goals?.xG?.home) ??
        numeric(normalized?.statistics?.xG?.home);

      const away =
        numeric(normalized?.xG?.away) ??
        numeric(normalized?.xg?.away) ??
        numeric(normalized?.expectedGoals?.away) ??
        numeric(normalized?.expected_goals?.away) ??
        numeric(normalized?.awayXG) ??
        numeric(normalized?.awayXg) ??
        numeric(normalized?.goals?.xG?.away) ??
        numeric(normalized?.statistics?.xG?.away);

      if (home == null || away == null) {
        return null;
      }

      return {
        home: clamp(home, 0, 8),
        away: clamp(away, 0, 8)
      };
    };

    const fallbackFromXG = (xg) => {
      if (!xg) {
        return {
          home: 0.38,
          draw: 0.30,
          away: 0.32
        };
      }

      const homeStrength = Math.max(xg.home, 0.1);
      const awayStrength = Math.max(xg.away, 0.1);

      const total = homeStrength + awayStrength;

      let home =
        0.20 +
        (homeStrength / total) * 0.50;

      let away =
        0.20 +
        (awayStrength / total) * 0.40;

      let draw =
        1 - home - away;

      if (draw < 0.15) {
        draw = 0.15;

        const remaining = 0.85;

        const ratio =
          homeStrength /
          (homeStrength + awayStrength);

        home = remaining * ratio;
        away = remaining * (1 - ratio);
      }

      const totalProbability =
        home + draw + away;

      return {
        home: home / totalProbability,
        draw: draw / totalProbability,
        away: away / totalProbability
      };
    };

    // ============================================================
    // IF WE CANNOT IDENTIFY THE FIXTURE
    // ============================================================

    if (
      !fixtureId ||
      !homeTeamId ||
      !awayTeamId
    ) {
      const fallbackXG = getNormalizedXG();

      const fallbackProbabilities =
        fallbackFromXG(fallbackXG);

      const prediction =
        fallbackProbabilities.home >=
        fallbackProbabilities.away &&
        fallbackProbabilities.home >=
        fallbackProbabilities.draw
          ? "Home Win"
          : fallbackProbabilities.away >=
              fallbackProbabilities.draw
            ? "Away Win"
            : "Draw";

      const probability =
        prediction === "Home Win"
          ? fallbackProbabilities.home
          : prediction === "Away Win"
            ? fallbackProbabilities.away
            : fallbackProbabilities.draw;

      return res.status(200).json({
        success: true,
        version: "Prediction Engine V3.1",
        prediction,
        probability: Math.round(
          probability * 100
        ),
        status: "FALLBACK",
        match: {
          home: homeName,
          away: awayName,
          date: matchDate
        },
        internalAnalysis: {
          fixtureId: null,
          signalsUsed: [
            "normalized_xg"
          ],
          probabilities: fallbackProbabilities,
          xG: fallbackXG
        }
      });
    }

    // ============================================================
    // PARALLEL DATA COLLECTION
    // ============================================================

    const requests = await Promise.all([
      // API-Football model
      api(
        `/predictions?fixture=${fixtureId}`
      ),

      // Home team season statistics
      leagueId && season
        ? api(
            `/teams/statistics?league=${leagueId}&season=${season}&team=${homeTeamId}`
          )
        : Promise.resolve({
            ok: false,
            data: {}
          }),

      // Away team season statistics
      leagueId && season
        ? api(
            `/teams/statistics?league=${leagueId}&season=${season}&team=${awayTeamId}`
          )
        : Promise.resolve({
            ok: false,
            data: {}
          }),

      // H2H
      api(
        `/fixtures/headtohead?h2h=${homeTeamId}-${awayTeamId}&last=10`
      ),

      // Injuries
      api(
        `/injuries?fixture=${fixtureId}`
      ),

      // Odds
      api(
        `/odds?fixture=${fixtureId}`
      ),

      // Home last 5
      api(
        `/fixtures?team=${homeTeamId}&last=5`
      ),

      // Away last 5
      api(
        `/fixtures?team=${awayTeamId}&last=5`
      ),

      // Lineups
      api(
        `/fixtures/lineups?fixture=${fixtureId}`
      )
    ]);

    const [
      predictionResponse,
      homeStatsResponse,
      awayStatsResponse,
      h2hResponse,
      injuryResponse,
      oddsResponse,
      homeRecentResponse,
      awayRecentResponse,
      lineupResponse
    ] = requests;

    const apiPrediction =
      predictionResponse.data?.response?.[0] ||
      null;

    const homeStats =
      homeStatsResponse.data?.response?.[0] ||
      null;

    const awayStats =
      awayStatsResponse.data?.response?.[0] ||
      null;

    const h2hFixtures =
      safeArray(
        h2hResponse.data?.response
      );

    const injuries =
      safeArray(
        injuryResponse.data?.response
      );

    const odds =
      safeArray(
        oddsResponse.data?.response
      );

    const homeRecent =
      safeArray(
        homeRecentResponse.data?.response
      );

    const awayRecent =
      safeArray(
        awayRecentResponse.data?.response
      );

    const lineups =
      safeArray(
        lineupResponse.data?.response
      );

    // ============================================================
    // SIGNAL 1
    // API-FOOTBALL PREDICTION
    // ============================================================

    const parseApiPrediction = () => {
      const percent =
        apiPrediction?.predictions?.percent;

      if (!percent) {
        return null;
      }

      const home =
        numeric(percent.home);

      const draw =
        numeric(percent.draw);

      const away =
        numeric(percent.away);

      if (
        home == null ||
        draw == null ||
        away == null
      ) {
        return null;
      }

      const total =
        home + draw + away;

      if (total <= 0) {
        return null;
      }

      const goals =
        apiPrediction?.predictions?.goals ||
        {};

      return {
        home: home / total,
        draw: draw / total,
        away: away / total,

        predictedGoals: {
          home:
            numeric(goals.home),
          away:
            numeric(goals.away)
        },

        winner:
          apiPrediction?.predictions?.winner
            ?.name || null,

        advice:
          apiPrediction?.predictions
            ?.advice || null,

        underOver:
          apiPrediction?.predictions
            ?.under_over || null
      };
    };

    const apiSignal =
      parseApiPrediction();

    // ============================================================
    // SIGNAL 2
    // BOOKMAKER MARKET PROBABILITY
    // ============================================================

    const parseMarketProbabilities = () => {
      const probabilities = [];

      for (const bookmaker of odds) {
        const bets =
          safeArray(bookmaker?.bookmaker?.bets);

        for (const bet of bets) {
          const betName =
            String(bet?.name || "")
              .toLowerCase();

          const isMatchWinner =
            betName.includes(
              "match winner"
            ) ||
            betName.includes("1x2") ||
            String(bet?.id) === "1";

          if (!isMatchWinner) {
            continue;
          }

          let homeOdd = null;
          let drawOdd = null;
          let awayOdd = null;

          for (const value of safeArray(
            bet?.values
          )) {
            const label =
              String(value?.value || "")
                .toLowerCase();

            const odd =
              numeric(value?.odd);

            if (odd == null || odd <= 1) {
              continue;
            }

            if (
              label === "home" ||
              label === "1"
            ) {
              homeOdd = odd;
            }

            if (
              label === "draw" ||
              label === "x"
            ) {
              drawOdd = odd;
            }

            if (
              label === "away" ||
              label === "2"
            ) {
              awayOdd = odd;
            }
          }

          if (
            homeOdd &&
            drawOdd &&
            awayOdd
          ) {
            const h = 1 / homeOdd;
            const d = 1 / drawOdd;
            const a = 1 / awayOdd;

            const total = h + d + a;

            probabilities.push({
              home: h / total,
              draw: d / total,
              away: a / total
            });
          }
        }
      }

      // --------------------------------------------------------
      // Normalized market fallback
      // --------------------------------------------------------

      if (!probabilities.length) {
        const market =
          normalized?.marketProbability ||
          normalized?.marketProbabilities ||
          normalized?.oddsProbability ||
          normalized?.odds?.probabilities ||
          null;

        if (
          market &&
          numeric(market.home) != null &&
          numeric(market.draw) != null &&
          numeric(market.away) != null
        ) {
          const h =
            numeric(market.home);

          const d =
            numeric(market.draw);

          const a =
            numeric(market.away);

          const total = h + d + a;

          if (total > 0) {
            return {
              home: h / total,
              draw: d / total,
              away: a / total
            };
          }
        }

        return null;
      }

      const count =
        probabilities.length;

      return {
        home:
          probabilities.reduce(
            (sum, p) =>
              sum + p.home,
            0
          ) / count,

        draw:
          probabilities.reduce(
            (sum, p) =>
              sum + p.draw,
            0
          ) / count,

        away:
          probabilities.reduce(
            (sum, p) =>
              sum + p.away,
            0
          ) / count
      };
    };

    const marketSignal =
      parseMarketProbabilities();

    // ============================================================
    // SIGNAL 3
    // SEASON TEAM STATISTICS / HOME-AWAY STRENGTH
    // ============================================================

    const getStatAverage = (
      stats,
      type,
      venue
    ) => {
      const value =
        stats?.goals?.[type]?.average?.[
          venue
        ];

      return numeric(value);
    };

    const buildXGFromTeamStats = () => {
      if (
        !homeStats ||
        !awayStats
      ) {
        return null;
      }

      const homeAttack =
        getStatAverage(
          homeStats,
          "for",
          "home"
        );

      const homeDefense =
        getStatAverage(
          homeStats,
          "against",
          "home"
        );

      const awayAttack =
        getStatAverage(
          awayStats,
          "for",
          "away"
        );

      const awayDefense =
        getStatAverage(
          awayStats,
          "against",
          "away"
        );

      if (
        homeAttack == null ||
        homeDefense == null ||
        awayAttack == null ||
        awayDefense == null
      ) {
        return null;
      }

      const homeXG =
        (homeAttack + awayDefense) /
        2;

      const awayXG =
        (awayAttack + homeDefense) /
        2;

      return {
        home: clamp(homeXG, 0.05, 5),
        away: clamp(awayXG, 0.05, 5)
      };
    };

    // ============================================================
    // SIGNAL 4
    // RECENT LAST-5 RESULTS
    // ============================================================

    const getResultForTeam = (
      fixture,
      teamId
    ) => {
      const homeId =
        fixture?.teams?.home?.id;

      const awayId =
        fixture?.teams?.away?.id;

      const homeGoals =
        numeric(
          fixture?.goals?.home
        );

      const awayGoals =
        numeric(
          fixture?.goals?.away
        );

      if (
        homeGoals == null ||
        awayGoals == null
      ) {
        return null;
      }

      const isHome =
        homeId === teamId;

      if (
        !isHome &&
        awayId !== teamId
      ) {
        return null;
      }

      const teamGoals =
        isHome
          ? homeGoals
          : awayGoals;

      const opponentGoals =
        isHome
          ? awayGoals
          : homeGoals;

      let result = "D";

      if (teamGoals > opponentGoals) {
        result = "W";
      } else if (
        teamGoals < opponentGoals
      ) {
        result = "L";
      }

      return {
        result,
        points:
          result === "W"
            ? 3
            : result === "D"
              ? 1
              : 0,
        goalsFor: teamGoals,
        goalsAgainst: opponentGoals,
        date:
          fixture?.fixture?.date ||
          null
      };
    };

    const buildRecentForm = (
      fixtures,
      teamId
    ) => {
      const results = fixtures
        .map((fixture) =>
          getResultForTeam(
            fixture,
            teamId
          )
        )
        .filter(Boolean);

      if (!results.length) {
        return null;
      }

      const points =
        results.reduce(
          (sum, item) =>
            sum + item.points,
          0
        );

      const goalsFor =
        results.reduce(
          (sum, item) =>
            sum + item.goalsFor,
          0
        );

      const goalsAgainst =
        results.reduce(
          (sum, item) =>
            sum + item.goalsAgainst,
          0
        );

      const ppg =
        points / results.length;

      const goalDiff =
        (goalsFor - goalsAgainst) /
        results.length;

      const wins =
        results.filter(
          (r) => r.result === "W"
        ).length;

      const draws =
        results.filter(
          (r) => r.result === "D"
        ).length;

      const losses =
        results.filter(
          (r) => r.result === "L"
        ).length;

      return {
        results,
        points,
        ppg,
        goalDiff,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst
      };
    };

    const homeForm =
      buildRecentForm(
        homeRecent,
        homeTeamId
      );

    const awayForm =
      buildRecentForm(
        awayRecent,
        awayTeamId
      );

    const buildFormSignal = () => {
      if (
        !homeForm ||
        !awayForm
      ) {
        return null;
      }

      const homeScore =
        homeForm.ppg +
        homeForm.goalDiff * 0.25;

      const awayScore =
        awayForm.ppg +
        awayForm.goalDiff * 0.25;

      const homeAdjusted =
        homeScore + 0.35;

      const drawBase =
        1.15;

      const totalPositive =
        Math.max(homeAdjusted, 0.05) +
        Math.max(awayScore, 0.05);

      let home =
        homeAdjusted /
        (totalPositive + drawBase);

      let away =
        Math.max(awayScore, 0.05) /
        (totalPositive + drawBase);

      let draw =
        drawBase /
        (totalPositive + drawBase);

      const total =
        home + draw + away;

      return {
        home: home / total,
        draw: draw / total,
        away: away / total
      };
    };

    const formSignal =
      buildFormSignal();

    // ============================================================
    // SIGNAL 5
    // xG / EXPECTED GOALS
    // ============================================================

    const teamStatsXG =
      buildXGFromTeamStats();

    const normalizedXG =
      getNormalizedXG();

    const apiPredictedGoals =
      apiSignal?.predictedGoals;

    let xGSignalData =
      normalizedXG ||
      (
        apiPredictedGoals?.home != null &&
        apiPredictedGoals?.away != null
          ? {
              home:
                apiPredictedGoals.home,
              away:
                apiPredictedGoals.away
            }
          : null
      ) ||
      teamStatsXG;

    const poissonProbability = (
      lambda,
      k
    ) => {
      let factorial = 1;

      for (let i = 2; i <= k; i++) {
        factorial *= i;
      }

      return (
        Math.exp(-lambda) *
        Math.pow(lambda, k) /
        factorial
      );
    };

    const buildPoissonSignal = (
      xg
    ) => {
      if (!xg) {
        return null;
      }

      let homeWin = 0;
      let draw = 0;
      let awayWin = 0;

      // 0-10 goal range gives a stable
      // approximation for normal football scores.
      for (let h = 0; h <= 10; h++) {
        for (let a = 0; a <= 10; a++) {
          const probability =
            poissonProbability(
              xg.home,
              h
            ) *
            poissonProbability(
              xg.away,
              a
            );

          if (h > a) {
            homeWin += probability;
          } else if (h === a) {
            draw += probability;
          } else {
            awayWin += probability;
          }
        }
      }

      const total =
        homeWin +
        draw +
        awayWin;

      if (total <= 0) {
        return null;
      }

      return {
        home: homeWin / total,
        draw: draw / total,
        away: awayWin / total
      };
    };

    const xGSignal =
      buildPoissonSignal(
        xGSignalData
      );

    // ============================================================
    // SIGNAL 6
    // H2H
    // ============================================================

    const buildH2HSignal = () => {
      if (!h2hFixtures.length) {
        return null;
      }

      let homeWins = 0;
      let draws = 0;
      let awayWins = 0;

      for (const game of h2hFixtures) {
        const hId =
          game?.teams?.home?.id;

        const aId =
          game?.teams?.away?.id;

        const hg =
          numeric(
            game?.goals?.home
          );

        const ag =
          numeric(
            game?.goals?.away
          );

        if (
          hg == null ||
          ag == null
        ) {
          continue;
        }

        const homeWasTarget =
          hId === homeTeamId;

        const targetGoals =
          homeWasTarget
            ? hg
            : ag;

        const opponentGoals =
          homeWasTarget
            ? ag
            : hg;

        if (
          targetGoals >
          opponentGoals
        ) {
          homeWins++;
        } else if (
          targetGoals ===
          opponentGoals
        ) {
          draws++;
        } else {
          awayWins++;
        }
      }

      const total =
        homeWins +
        draws +
        awayWins;

      if (!total) {
        return null;
      }

      // H2H is deliberately weak.
      return {
        home:
          homeWins / total,
        draw:
          draws / total,
        away:
          awayWins / total
      };
    };

    const h2hSignal =
      buildH2HSignal();

    // ============================================================
    // SIGNAL 7
    // INJURIES / AVAILABILITY
    // ============================================================

    const buildInjuryAdjustment = () => {
      let homeCount = 0;
      let awayCount = 0;

      for (const item of injuries) {
        const teamId =
          item?.team?.id;

        if (teamId === homeTeamId) {
          homeCount++;
        }

        if (teamId === awayTeamId) {
          awayCount++;
        }
      }

      const structuredHome =
        numeric(
          normalized?.injuries
            ?.homeImpact
        ) ??
        numeric(
          normalized?.injuryImpact
            ?.home
        ) ??
        numeric(
          normalized?.availability
            ?.homeImpact
        );

      const structuredAway =
        numeric(
          normalized?.injuries
            ?.awayImpact
        ) ??
        numeric(
          normalized?.injuryImpact
            ?.away
        ) ??
        numeric(
          normalized?.availability
            ?.awayImpact
        );

      return {
        homeCount,
        awayCount,

        homeImpact:
          structuredHome != null
            ? clamp(
                structuredHome,
                0,
                0.15
              )
            : clamp(
                homeCount * 0.008,
                0,
                0.045
              ),

        awayImpact:
          structuredAway != null
            ? clamp(
                structuredAway,
                0,
                0.15
              )
            : clamp(
                awayCount * 0.008,
                0,
                0.045
              )
      };
    };

    const injuryAdjustment =
      buildInjuryAdjustment();

    // ============================================================
    // SIGNAL 8
    // CONGESTION / REST
    // ============================================================

    const getRestInformation = (
      fixtures,
      targetDate
    ) => {
      const target =
        parseDate(targetDate);

      if (!target) {
        return {
          lastMatch: null,
          restDays: null,
          congestionMatches: 0
        };
      }

      const completed =
        fixtures
          .map((f) => ({
            date: parseDate(
              f?.fixture?.date
            ),
            fixture: f
          }))
          .filter(
            (x) =>
              x.date &&
              x.date < target
          )
          .sort(
            (a, b) =>
              b.date - a.date
          );

      if (!completed.length) {
        return {
          lastMatch: null,
          restDays: null,
          congestionMatches: 0
        };
      }

      const lastMatch =
        completed[0].date;

      const restDays =
        Math.max(
          0,
          (
            target.getTime() -
            lastMatch.getTime()
          ) /
            (1000 * 60 * 60 * 24)
        );

      const sevenDaysAgo =
        new Date(
          target.getTime() -
            7 *
              24 *
              60 *
              60 *
              1000
        );

      const congestionMatches =
        completed.filter(
          (x) =>
            x.date >= sevenDaysAgo
        ).length;

      return {
        lastMatch:
          lastMatch.toISOString(),

        restDays:
          round(restDays, 1),

        congestionMatches
      };
    };

    const homeRest =
      getRestInformation(
        homeRecent,
        matchDate || fixture?.fixture?.date
      );

    const awayRest =
      getRestInformation(
        awayRecent,
        matchDate || fixture?.fixture?.date
      );

    const buildCongestionAdjustment = () => {
      let home = 0;
      let away = 0;

      if (
        homeRest.restDays != null &&
        awayRest.restDays != null
      ) {
        if (
          homeRest.restDays -
            awayRest.restDays >=
          2
        ) {
          home += 0.015;
        }

        if (
          awayRest.restDays -
            homeRest.restDays >=
          2
        ) {
          away += 0.015;
        }
      }

      if (
        homeRest.congestionMatches >= 4
      ) {
        home -= 0.015;
      }

      if (
        awayRest.congestionMatches >= 4
      ) {
        away -= 0.015;
      }

      return {
        home,
        away
      };
    };

    const congestionAdjustment =
      buildCongestionAdjustment();

    // ============================================================
    // SIGNAL 9
    // LINEUP AVAILABILITY
    // ============================================================

    const getLineupForTeam = (
      teamId
    ) => {
      return (
        lineups.find(
          (item) =>
            item?.team?.id === teamId
        ) || null
      );
    };

    const homeLineup =
      getLineupForTeam(
        homeTeamId
      );

    const awayLineup =
      getLineupForTeam(
        awayTeamId
      );

    const lineupSignal = {
      available:
        Boolean(
          homeLineup ||
          awayLineup
        ),

      home: homeLineup
        ? {
            formation:
              homeLineup.formation ||
              null,

            starters:
              safeArray(
                homeLineup.startXI
              ).length,

            substitutes:
              safeArray(
                homeLineup.substitutes
              ).length
          }
        : null,

      away: awayLineup
        ? {
            formation:
              awayLineup.formation ||
              null,

            starters:
              safeArray(
                awayLineup.startXI
              ).length,

            substitutes:
              safeArray(
                awayLineup.substitutes
              ).length
          }
        : null
    };

    // ============================================================
    // CONTEXT / WEB EVIDENCE
    // ============================================================

    const contextualSignal =
      normalized?.contextProbability ||
      normalized?.contextProbabilities ||
      normalized?.context?.probabilities ||
      normalized?.motivation?.probabilities ||
      normalized?.webProbabilities ||
      normalized?.evidence?.probabilities ||
      null;

    const parseContextSignal = () => {
      if (
        contextualSignal &&
        numeric(
          contextualSignal.home
        ) != null &&
        numeric(
          contextualSignal.draw
        ) != null &&
        numeric(
          contextualSignal.away
        ) != null
      ) {
        const h =
          numeric(
            contextualSignal.home
          );

        const d =
          numeric(
            contextualSignal.draw
          );

        const a =
          numeric(
            contextualSignal.away
          );

        const total = h + d + a;

        if (total > 0) {
          return {
            home: h / total,
            draw: d / total,
            away: a / total
          };
        }
      }

      return null;
    };

    const contextSignal =
      parseContextSignal();

    // ============================================================
    // ENSEMBLE
    // ============================================================

    const signals = [];

    const addSignal = (
      name,
      probabilities,
      weight
    ) => {
      if (
        probabilities &&
        Number.isFinite(
          probabilities.home
        ) &&
        Number.isFinite(
          probabilities.draw
        ) &&
        Number.isFinite(
          probabilities.away
        )
      ) {
        signals.push({
          name,
          probabilities,
          weight
        });
      }
    };

    // Primary model
    addSignal(
      "api_football_prediction",
      apiSignal,
      0.25
    );

    // Market
    addSignal(
      "market_probability",
      marketSignal,
      0.18
    );

    // Recent form
    addSignal(
      "recent_form",
      formSignal,
      0.12
    );

    // xG
    addSignal(
      "expected_goals",
      xGSignal,
      0.15
    );

    // H2H deliberately low weight
    addSignal(
      "h2h",
      h2hSignal,
      0.05
    );

    // Context/web
    addSignal(
      "contextual_evidence",
      contextSignal,
      0.05
    );

    // Season statistics
    const statsXGSignal =
      buildPoissonSignal(
        teamStatsXG
      );

    addSignal(
      "season_home_away_strength",
      statsXGSignal,
      0.20
    );

    // ------------------------------------------------------------
    // Weighted ensemble
    // ------------------------------------------------------------

    const combineSignals = (
      signalList
    ) => {
      if (!signalList.length) {
        return null;
      }

      const totalWeight =
        signalList.reduce(
          (sum, signal) =>
            sum + signal.weight,
          0
        );

      if (totalWeight <= 0) {
        return null;
      }

      const result = {
        home: 0,
        draw: 0,
        away: 0
      };

      for (const signal of signalList) {
        const weight =
          signal.weight /
          totalWeight;

        result.home +=
          signal.probabilities.home *
          weight;

        result.draw +=
          signal.probabilities.draw *
          weight;

        result.away +=
          signal.probabilities.away *
          weight;
      }

      const total =
        result.home +
        result.draw +
        result.away;

      return {
        home:
          result.home / total,
        draw:
          result.draw / total,
        away:
          result.away / total
      };
    };

    let finalProbabilities =
      combineSignals(signals);

    // ============================================================
    // APPLY AVAILABILITY + CONGESTION
    // ============================================================

    const applyAdjustments = (
      probabilities
    ) => {
      if (!probabilities) {
        return null;
      }

      let home =
        probabilities.home;

      let draw =
        probabilities.draw;

      let away =
        probabilities.away;

      // Injury effect
      home -=
        injuryAdjustment.homeImpact *
        0.50;

      away -=
        injuryAdjustment.awayImpact *
        0.50;

      // Congestion/rest
      home +=
        congestionAdjustment.home;

      away +=
        congestionAdjustment.away;

      // Keep draw within reasonable range
      draw =
        clamp(draw, 0.05, 0.50);

      home =
        clamp(home, 0.05, 0.90);

      away =
        clamp(away, 0.05, 0.90);

      const total =
        home + draw + away;

      return {
        home: home / total,
        draw: draw / total,
        away: away / total
      };
    };

    finalProbabilities =
      applyAdjustments(
        finalProbabilities
      );

    // ============================================================
    // PREDICTION SELECTION
    // ============================================================

    const choosePrediction = (
      probabilities
    ) => {
      if (!probabilities) {
        return {
          prediction: "No Prediction",
          probability: 0
        };
      }

      const options = [
        {
          name: "Home Win",
          value:
            probabilities.home
        },
        {
          name: "Draw",
          value:
            probabilities.draw
        },
        {
          name: "Away Win",
          value:
            probabilities.away
        }
      ];

      options.sort(
        (a, b) =>
          b.value - a.value
      );

      return {
        prediction:
          options[0].name,

        probability:
          Math.round(
            options[0].value * 100
          )
      };
    };

    const final =
      choosePrediction(
        finalProbabilities
      );

    // ============================================================
    // SIGNAL REPORT
    // ============================================================

    const signalsUsed =
      signals.map(
        (signal) => signal.name
      );

    const signalWeights =
      {};

    for (const signal of signals) {
      signalWeights[
        signal.name
      ] = signal.weight;
    }

    // ============================================================
    // FINAL RESPONSE
    // ============================================================

    return res.status(200).json({
      success: true,

      version:
        "Prediction Engine V3.1",

      prediction:
        final.prediction,

      probability:
        final.probability,

      status:
        signals.length >= 5
          ? "ENSEMBLE_COMPLETE"
          : "PARTIAL_DATA",

      match: {
        home: homeName,
        away: awayName,
        date:
          matchDate ||
          fixture?.fixture?.date ||
          null
      },

      internalAnalysis: {
        fixtureId,
        leagueId,
        season,

        signalsUsed,

        signalWeights,

        rawSignalCount:
          signals.length,

        probabilities:
          finalProbabilities,

        apiPrediction: {
          available:
            Boolean(apiSignal),

          probabilities:
            apiSignal
              ? {
                  home:
                    round(
                      apiSignal.home
                    ),
                  draw:
                    round(
                      apiSignal.draw
                    ),
                  away:
                    round(
                      apiSignal.away
                    )
                }
              : null,

          predictedGoals:
            apiSignal?.predictedGoals ||
            null,

          winner:
            apiSignal?.winner ||
            null,

          advice:
            apiSignal?.advice ||
            null,

          underOver:
            apiSignal?.underOver ||
            null
        },

        market: {
          available:
            Boolean(marketSignal),

          probabilities:
            marketSignal
              ? {
                  home:
                    round(
                      marketSignal.home
                    ),
                  draw:
                    round(
                      marketSignal.draw
                    ),
                  away:
                    round(
                      marketSignal.away
                    )
                }
              : null,

          bookmakerCount:
            odds.length
        },

        teamStatistics: {
          available:
            Boolean(
              homeStats &&
              awayStats
            ),

          home:
            homeStats
              ? {
                  form:
                    homeStats.form ||
                    null,

                  homeGoalsFor:
                    getStatAverage(
                      homeStats,
                      "for",
                      "home"
                    ),

                  homeGoalsAgainst:
                    getStatAverage(
                      homeStats,
                      "against",
                      "home"
                    )
                }
              : null,

          away:
            awayStats
              ? {
                  form:
                    awayStats.form ||
                    null,

                  awayGoalsFor:
                    getStatAverage(
                      awayStats,
                      "for",
                      "away"
                    ),

                  awayGoalsAgainst:
                    getStatAverage(
                      awayStats,
                      "against",
                      "away"
                    )
                }
              : null
        },

        recentForm: {
          home: homeForm,
          away: awayForm
        },

        xG: {
          source:
            normalizedXG
              ? "normalized_web"
              : apiPredictedGoals?.home !=
                    null &&
                  apiPredictedGoals?.away !=
                    null
                ? "api_football_prediction"
                : teamStatsXG
                  ? "team_statistics"
                  : null,

          expectedGoals:
            xGSignalData,

          probabilities:
            xGSignal
              ? {
                  home:
                    round(
                      xGSignal.home
                    ),
                  draw:
                    round(
                      xGSignal.draw
                    ),
                  away:
                    round(
                      xGSignal.away
                    )
                }
              : null
        },

        h2h: {
          matches:
            h2hFixtures.length,

          probabilities:
            h2hSignal
              ? {
                  home:
                    round(
                      h2hSignal.home
                    ),
                  draw:
                    round(
                      h2hSignal.draw
                    ),
                  away:
                    round(
                      h2hSignal.away
                    )
                }
              : null
        },

        injuries: {
          total:
            injuries.length,

          home:
            injuryAdjustment.homeCount,

          away:
            injuryAdjustment.awayCount,

          homeImpact:
            round(
              injuryAdjustment.homeImpact,
              4
            ),

          awayImpact:
            round(
              injuryAdjustment.awayImpact,
              4
            )
        },

        congestion: {
          home:
            homeRest,

          away:
            awayRest,

          adjustment:
            congestionAdjustment
        },

        lineups: lineupSignal,

        contextual: {
          available:
            Boolean(contextSignal),

          probabilities:
            contextSignal
              ? {
                  home:
                    round(
                      contextSignal.home
                    ),
                  draw:
                    round(
                      contextSignal.draw
                    ),
                  away:
                    round(
                      contextSignal.away
                    )
                }
              : null
        }
      }
    });

  } catch (error) {
    console.error(
      "Prediction Engine V3.1 error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Prediction engine failed.",
      details:
        error.message
    });
  }
}
