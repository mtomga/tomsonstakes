// /api/predict.js
// ============================================================
// TOMSONSTAKES GLOBAL FOOTBALL PREDICTION ENGINE
// Prediction Engine V3.2
//
// Frontend contract:
//   prediction
//   probability
//
// Extended frontend-safe response:
//   probabilities.home
//   probabilities.draw
//   probabilities.away
//   confidence
//   agreement
//
// Backend signals:
//   1. API-Football prediction
//   2. Bookmaker market probability
//   3. Season team statistics
//   4. Recent last-5 form
//   5. Home/Away strength
//   6. xG / expected-goal model
//   7. H2H
//   8. Injuries / availability
//   9. Lineups when available
//   10. Rest / congestion
//   11. Normalized contextual/web probabilities
//
// IMPORTANT:
// - No artificial home +0.35 bias
// - No hardcoded Home Win selection
// - Highest final H/D/A probability ALWAYS wins
// - Prediction and confidence are separate concepts
// ============================================================

export default async function handler(req, res) {
  // ============================================================
  // METHOD CHECK
  // ============================================================

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    // ============================================================
    // ENVIRONMENT
    // ============================================================

    const API_KEY =
      process.env.APIFOOTBALL_KEY;

    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        error:
          "APIFOOTBALL_KEY is not configured."
      });
    }

    // ============================================================
    // REQUEST DATA
    // ============================================================

    const body = req.body || {};

    const match =
      body.match || {};

    const normalized =
      body.normalized || {};

    const homeName =
      match.home;

    const awayName =
      match.away;

    const matchDate =
      match.date || null;

    if (!homeName || !awayName) {
      return res.status(400).json({
        success: false,
        error:
          "Home and away team names are required."
      });
    }

    // ============================================================
    // API-Football helper
    // ============================================================

    const api = async (endpoint) => {
      try {
        const response = await fetch(
          `https://v3.football.api-sports.io${endpoint}`,
          {
            headers: {
              "x-apisports-key":
                API_KEY
            }
          }
        );

        const data =
          await response
            .json()
            .catch(() => ({}));

        return {
          ok: response.ok,
          status: response.status,
          data
        };
      } catch (error) {
        return {
          ok: false,
          status: 0,
          data: {},
          error:
            error?.message || null
        };
      }
    };

    // ============================================================
    // HELPERS
    // ============================================================

    const clamp = (
      value,
      min,
      max
    ) =>
      Math.max(
        min,
        Math.min(max, value)
      );

    const round = (
      value,
      decimals = 3
    ) => {
      if (
        !Number.isFinite(value)
      ) {
        return null;
      }

      const factor =
        Math.pow(
          10,
          decimals
        );

      return (
        Math.round(
          value * factor
        ) / factor
      );
    };

    const numeric = (value) => {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return null;
      }

      const cleaned =
        String(value)
          .replace("%", "")
          .replace(",", "")
          .trim();

      const n =
        Number(cleaned);

      return Number.isFinite(n)
        ? n
        : null;
    };

    const safeArray = (
      value
    ) =>
      Array.isArray(value)
        ? value
        : [];

    const normalizeName = (
      name
    ) => {
      return String(name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .replace(
          /[^a-z0-9]/g,
          ""
        );
    };

    const parseDate = (
      value
    ) => {
      if (!value) {
        return null;
      }

      const d =
        new Date(value);

      return Number.isNaN(
        d.getTime()
      )
        ? null
        : d;
    };

    const normalizeProbabilities = (
      probabilities
    ) => {
      if (!probabilities) {
        return null;
      }

      const home =
        numeric(
          probabilities.home
        );

      const draw =
        numeric(
          probabilities.draw
        );

      const away =
        numeric(
          probabilities.away
        );

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

      return {
        home:
          home / total,
        draw:
          draw / total,
        away:
          away / total
      };
    };

    // ============================================================
    // FIXTURE RESOLUTION
    // ============================================================

    let fixture =
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

    // ============================================================
    // RESOLVE FIXTURE FROM DATE
    // ============================================================

    if (
      !fixtureId &&
      matchDate
    ) {
      const dateOnly =
        String(matchDate)
          .slice(0, 10);

      const fixtureResponse =
        await api(
          `/fixtures?date=${encodeURIComponent(
            dateOnly
          )}&timezone=Africa%2FLagos`
        );

      const fixtures =
        safeArray(
          fixtureResponse
            .data?.response
        );

      const targetHome =
        normalizeName(
          homeName
        );

      const targetAway =
        normalizeName(
          awayName
        );

      // Exact match
      fixture =
        fixtures.find(
          (f) => {
            const h =
              normalizeName(
                f?.teams?.home?.name
              );

            const a =
              normalizeName(
                f?.teams?.away?.name
              );

            return (
              h === targetHome &&
              a === targetAway
            );
          }
        ) || null;

      // Fuzzy match
      if (!fixture) {
        fixture =
          fixtures.find(
            (f) => {
              const h =
                normalizeName(
                  f?.teams?.home?.name
                );

              const a =
                normalizeName(
                  f?.teams?.away?.name
                );

              return (
                (
                  h.includes(
                    targetHome
                  ) ||
                  targetHome.includes(h)
                ) &&
                (
                  a.includes(
                    targetAway
                  ) ||
                  targetAway.includes(a)
                )
              );
            }
          ) || null;
      }

      if (fixture) {
        fixtureId =
          fixture.fixture?.id ||
          null;

        leagueId =
          fixture.league?.id ||
          null;

        season =
          fixture.league?.season ||
          null;

        homeTeamId =
          fixture.teams?.home?.id ||
          null;

        awayTeamId =
          fixture.teams?.away?.id ||
          null;
      }
    }

    // ============================================================
    // NORMALIZED PROBABILITY FALLBACK
    // ============================================================

    const getNormalizedProbability =
      () => {
        const candidates = [
          normalized.probabilities,
          normalized.predictions,
          normalized.marketProbability,
          normalized.marketProbabilities,
          normalized.oddsProbability,
          normalized.odds?.probabilities,
          normalized.contextProbability,
          normalized.contextProbabilities,
          normalized.context?.probabilities,
          normalized.motivation?.probabilities,
          normalized.webProbabilities,
          normalized.evidence?.probabilities
        ];

        for (
          const candidate
          of candidates
        ) {
          const result =
            normalizeProbabilities(
              candidate
            );

          if (result) {
            return result;
          }
        }

        return null;
      };

    // ============================================================
    // NORMALIZED XG
    // ============================================================

    const getNormalizedXG =
      () => {
        const home =
          numeric(
            normalized?.xG?.home
          ) ??
          numeric(
            normalized?.xg?.home
          ) ??
          numeric(
            normalized?.expectedGoals?.home
          ) ??
          numeric(
            normalized?.expected_goals?.home
          ) ??
          numeric(
            normalized?.homeXG
          ) ??
          numeric(
            normalized?.homeXg
          );

        const away =
          numeric(
            normalized?.xG?.away
          ) ??
          numeric(
            normalized?.xg?.away
          ) ??
          numeric(
            normalized?.expectedGoals?.away
          ) ??
          numeric(
            normalized?.expected_goals?.away
          ) ??
          numeric(
            normalized?.awayXG
          ) ??
          numeric(
            normalized?.awayXg
          );

        if (
          home == null ||
          away == null
        ) {
          return null;
        }

        return {
          home: clamp(
            home,
            0.05,
            6
          ),
          away: clamp(
            away,
            0.05,
            6
          )
        };
      };

    // ============================================================
    // POISSON
    // ============================================================

    const poissonProbability =
      (
        lambda,
        k
      ) => {
        if (
          !Number.isFinite(
            lambda
          ) ||
          lambda < 0
        ) {
          return 0;
        }

        let factorial = 1;

        for (
          let i = 2;
          i <= k;
          i++
        ) {
          factorial *= i;
        }

        return (
          Math.exp(-lambda) *
          Math.pow(
            lambda,
            k
          ) /
          factorial
        );
      };

    const buildPoissonSignal =
      (xg) => {
        if (!xg) {
          return null;
        }

        let homeWin = 0;
        let draw = 0;
        let awayWin = 0;

        for (
          let h = 0;
          h <= 10;
          h++
        ) {
          for (
            let a = 0;
            a <= 10;
            a++
          ) {
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
              homeWin +=
                probability;
            } else if (
              h === a
            ) {
              draw +=
                probability;
            } else {
              awayWin +=
                probability;
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
          home:
            homeWin / total,
          draw:
            draw / total,
          away:
            awayWin / total
        };
      };
    
    // ============================================================
    // FALLBACK FROM XG
    // ============================================================

    const fallbackFromXG =
      (xg) => {
        if (!xg) {
          return {
            home: 0.333333,
            draw: 0.333333,
            away: 0.333334
          };
        }

        const poisson =
          buildPoissonSignal(
            xg
          );

        return (
          poisson || {
            home: 0.333333,
            draw: 0.333333,
            away: 0.333334
          }
        );
      };

    // ============================================================
    // IF FIXTURE CANNOT BE IDENTIFIED
    // ============================================================

    if (
      !fixtureId ||
      !homeTeamId ||
      !awayTeamId
    ) {
      const normalizedProbability =
        getNormalizedProbability();

      const fallbackXG =
        getNormalizedXG();

      const fallbackProbabilities =
        normalizedProbability ||
        fallbackFromXG(
          fallbackXG
        );

      const fallbackFinal =
        choosePrediction(
          fallbackProbabilities
        );

      return res.status(200).json({
        success: true,

        version:
          "Prediction Engine V3.2",

        prediction:
          fallbackFinal.prediction,

        probability:
          fallbackFinal.probability,

        probabilities:
          fallbackFinal.probabilities,

        confidence:
          calculateConfidence(
            fallbackProbabilities,
            1,
            0.5
          ),

        agreement:
          50,

        status:
          "FALLBACK",

        match: {
          home: homeName,
          away: awayName,
          date: matchDate
        },

        internalAnalysis: {
          fixtureId: null,

          signalsUsed:
            normalizedProbability
              ? [
                  "normalized_probability"
                ]
              : [
                  "normalized_xg"
                ],

          probabilities:
            fallbackProbabilities,

          xG:
            fallbackXG
        }
      });
    }

    // ============================================================
    // PARALLEL API DATA COLLECTION
    // ============================================================

    const requests =
      await Promise.all([
        // 1. API-Football prediction
        api(
          `/predictions?fixture=${fixtureId}`
        ),

        // 2. Home statistics
        leagueId && season
          ? api(
              `/teams/statistics?league=${leagueId}&season=${season}&team=${homeTeamId}`
            )
          : Promise.resolve({
              ok: false,
              data: {}
            }),

        // 3. Away statistics
        leagueId && season
          ? api(
              `/teams/statistics?league=${leagueId}&season=${season}&team=${awayTeamId}`
            )
          : Promise.resolve({
              ok: false,
              data: {}
            }),

        // 4. H2H
        api(
          `/fixtures/headtohead?h2h=${homeTeamId}-${awayTeamId}&last=10`
        ),

        // 5. Injuries
        api(
          `/injuries?fixture=${fixtureId}`
        ),

        // 6. Odds
        api(
          `/odds?fixture=${fixtureId}`
        ),

        // 7. Home last 5
        api(
          `/fixtures?team=${homeTeamId}&last=5`
        ),

        // 8. Away last 5
        api(
          `/fixtures?team=${awayTeamId}&last=5`
        ),

        // 9. Lineups
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
      predictionResponse
        .data?.response?.[0] ||
      null;

    const homeStats =
      homeStatsResponse
        .data?.response?.[0] ||
      null;

    const awayStats =
      awayStatsResponse
        .data?.response?.[0] ||
      null;

    const h2hFixtures =
      safeArray(
        h2hResponse
          .data?.response
      );

    const injuries =
      safeArray(
        injuryResponse
          .data?.response
      );

    const odds =
      safeArray(
        oddsResponse
          .data?.response
      );

    const homeRecent =
      safeArray(
        homeRecentResponse
          .data?.response
      );

    const awayRecent =
      safeArray(
        awayRecentResponse
          .data?.response
      );

    const lineups =
      safeArray(
        lineupResponse
          .data?.response
      );

    // ============================================================
    // SIGNAL 1
    // API-FOOTBALL PREDICTION
    // ============================================================

    const parseApiPrediction =
      () => {
        const percent =
          apiPrediction
            ?.predictions
            ?.percent;

        if (!percent) {
          return null;
        }

        const probabilities =
          normalizeProbabilities(
            percent
          );

        if (!probabilities) {
          return null;
        }

        const goals =
          apiPrediction
            ?.predictions
            ?.goals ||
          {};

        return {
          ...probabilities,

          predictedGoals: {
            home:
              numeric(
                goals.home
              ),
            away:
              numeric(
                goals.away
              )
          },

          winner:
            apiPrediction
              ?.predictions
              ?.winner
              ?.name ||
            null,

          advice:
            apiPrediction
              ?.predictions
              ?.advice ||
            null,

          underOver:
            apiPrediction
              ?.predictions
              ?.under_over ||
            null
        };
      };

    const apiSignal =
      parseApiPrediction();

    // ============================================================
    // SIGNAL 2
    // BOOKMAKER MARKET PROBABILITY
    // ============================================================

    const parseMarketProbabilities =
      () => {
        const probabilities =
          [];

        for (
          const bookmaker
          of odds
        ) {
          const bets =
            safeArray(
              bookmaker
                ?.bookmaker
                ?.bets
            );

          for (
            const bet
            of bets
          ) {
            const betName =
              String(
                bet?.name ||
                ""
              ).toLowerCase();

            const isMatchWinner =
              betName.includes(
                "match winner"
              ) ||
              betName.includes(
                "1x2"
              ) ||
              String(
                bet?.id
              ) === "1";

            if (
              !isMatchWinner
            ) {
              continue;
            }

            let homeOdd =
              null;

            let drawOdd =
              null;

            let awayOdd =
              null;

            for (
              const value
              of safeArray(
                bet?.values
              )
            ) {
              const label =
                String(
                  value?.value ||
                  ""
                ).toLowerCase();

              const odd =
                numeric(
                  value?.odd
                );

              if (
                odd == null ||
                odd <= 1
              ) {
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
              const h =
                1 / homeOdd;

              const d =
                1 / drawOdd;

              const a =
                1 / awayOdd;

              const total =
                h + d + a;

              if (total > 0) {
                probabilities.push({
                  home:
                    h / total,
                  draw:
                    d / total,
                  away:
                    a / total
                });
              }
            }
          }
        }

        if (
          probabilities.length
        ) {
          const count =
            probabilities.length;

          return {
            home:
              probabilities.reduce(
                (
                  sum,
                  item
                ) =>
                  sum +
                  item.home,
                0
              ) / count,

            draw:
              probabilities.reduce(
                (
                  sum,
                  item
                ) =>
                  sum +
                  item.draw,
                0
              ) / count,

            away:
              probabilities.reduce(
                (
                  sum,
                  item
                ) =>
                  sum +
                  item.away,
                0
              ) / count
          };
        }

        // Normalized market fallback
        const market =
          normalized
            ?.marketProbability ||
          normalized
            ?.marketProbabilities ||
          normalized
            ?.oddsProbability ||
          normalized
            ?.odds
            ?.probabilities ||
          null;

        return normalizeProbabilities(
          market
        );
      };

    const marketSignal =
      parseMarketProbabilities();

    // ============================================================
    // SIGNAL 3
    // SEASON HOME/AWAY STATISTICS
    // ============================================================

    const getStatAverage =
      (
        stats,
        type,
        venue
      ) => {
        return numeric(
          stats
            ?.goals
            ?.[type]
            ?.average
            ?.[venue]
        );
      };

    const buildXGFromTeamStats =
      () => {
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

        // No artificial home bonus.
        const homeXG =
          (
            homeAttack +
            awayDefense
          ) / 2;

        const awayXG =
          (
            awayAttack +
            homeDefense
          ) / 2;

        return {
          home:
            clamp(
              homeXG,
              0.05,
              5
            ),

          away:
            clamp(
              awayXG,
              0.05,
              5
            )
        };
      };

    const teamStatsXG =
      buildXGFromTeamStats();

    // ============================================================
    // SIGNAL 4
    // RECENT FORM
    // ============================================================

    const getResultForTeam =
      (
        fixtureItem,
        teamId
      ) => {
        const homeId =
          fixtureItem
            ?.teams
            ?.home
            ?.id;

        const awayId =
          fixtureItem
            ?.teams
            ?.away
            ?.id;

        const homeGoals =
          numeric(
            fixtureItem
              ?.goals
              ?.home
          );

        const awayGoals =
          numeric(
            fixtureItem
              ?.goals
              ?.away
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

        let result =
          "D";

        if (
          teamGoals >
          opponentGoals
        ) {
          result = "W";
        } else if (
          teamGoals <
          opponentGoals
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

          goalsFor:
            teamGoals,

          goalsAgainst:
            opponentGoals,

          date:
            fixtureItem
              ?.fixture
              ?.date ||
            null
        };
      };

    const buildRecentForm =
      (
        fixtures,
        teamId
      ) => {
        const results =
          fixtures
            .map(
              (
                fixtureItem
              ) =>
                getResultForTeam(
                  fixtureItem,
                  teamId
                )
            )
            .filter(
              Boolean
            )
            .slice(0, 5);

        if (
          !results.length
        ) {
          return null;
        }

        const points =
          results.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.points,
            0
          );

        const goalsFor =
          results.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.goalsFor,
            0
          );

        const goalsAgainst =
          results.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.goalsAgainst,
            0
          );

        const ppg =
          points /
          results.length;

        const goalDiff =
          (
            goalsFor -
            goalsAgainst
          ) /
          results.length;

        const wins =
          results.filter(
            (r) =>
              r.result ===
              "W"
          ).length;

        const draws =
          results.filter(
            (r) =>
              r.result ===
              "D"
          ).length;

        const losses =
          results.filter(
            (r) =>
              r.result ===
              "L"
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

    // ============================================================
    // FORM SIGNAL
    // ============================================================

    const buildFormSignal =
      () => {
        if (
          !homeForm ||
          !awayForm
        ) {
          return null;
        }

        // Symmetrical scoring.
        const homeScore =
          homeForm.ppg +
          homeForm.goalDiff *
            0.20;

        const awayScore =
          awayForm.ppg +
          awayForm.goalDiff *
            0.20;

        const homePositive =
          Math.max(
            homeScore,
            0.05
          );

        const awayPositive =
          Math.max(
            awayScore,
            0.05
          );

        // Draw remains a genuine third outcome.
        const drawBase =
          1.10;

        const total =
          homePositive +
          awayPositive +
          drawBase;

        return {
          home:
            homePositive /
            total,

          draw:
            drawBase /
            total,

          away:
            awayPositive /
            total
        };
      };

    const formSignal =
      buildFormSignal();

    // ============================================================
    // SIGNAL 5
    // EXPECTED GOALS
    // ============================================================

    const normalizedXG =
      getNormalizedXG();

    const apiPredictedGoals =
      apiSignal
        ?.predictedGoals;

    let xGSignalData =
      normalizedXG ||
      (
        apiPredictedGoals
          ?.home != null &&
        apiPredictedGoals
          ?.away != null
          ? {
              home:
                apiPredictedGoals
                  .home,

              away:
                apiPredictedGoals
                  .away
            }
          : null
      ) ||
      teamStatsXG;

    const xGSource =
      normalizedXG
        ? "normalized_xg"
        : (
            apiPredictedGoals
              ?.home != null &&
            apiPredictedGoals
              ?.away != null
          )
          ? "api_football_predicted_goals"
          : teamStatsXG
            ? "team_home_away_goal_rates"
            : null;

    const xGSignal =
      buildPoissonSignal(
        xGSignalData
      );

    // ============================================================
    // SIGNAL 6
    // H2H
    // ============================================================

    const buildH2HSignal =
      () => {
        if (
          !h2hFixtures.length
        ) {
          return null;
        }

        let homeWins = 0;
        let draws = 0;
        let awayWins = 0;

        for (
          const game
          of h2hFixtures
        ) {
          const hId =
            game
              ?.teams
              ?.home
              ?.id;

          const aId =
            game
              ?.teams
              ?.away
              ?.id;

          const hg =
            numeric(
              game
                ?.goals
                ?.home
            );

          const ag =
            numeric(
              game
                ?.goals
                ?.away
            );

          if (
            hg == null ||
            ag == null
          ) {
            continue;
          }

          const homeWasTarget =
            hId ===
            homeTeamId;

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
    // INJURIES
    // ============================================================

    const buildInjuryAdjustment =
      () => {
        let homeCount = 0;
        let awayCount = 0;

        for (
          const item
          of injuries
        ) {
          const teamId =
            item?.team?.id;

          if (
            teamId ===
            homeTeamId
          ) {
            homeCount++;
          }

          if (
            teamId ===
            awayTeamId
          ) {
            awayCount++;
          }
        }

        const structuredHome =
          numeric(
            normalized
              ?.injuries
              ?.homeImpact
          ) ??
          numeric(
            normalized
              ?.injuryImpact
              ?.home
          ) ??
          numeric(
            normalized
              ?.availability
              ?.homeImpact
          );

        const structuredAway =
          numeric(
            normalized
              ?.injuries
              ?.awayImpact
          ) ??
          numeric(
            normalized
              ?.injuryImpact
              ?.away
          ) ??
          numeric(
            normalized
              ?.availability
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
                  homeCount *
                    0.008,
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
                  awayCount *
                    0.008,
                  0,
                  0.045
                )
        };
      };

    const injuryAdjustment =
      buildInjuryAdjustment();

    // ============================================================
    // SIGNAL 8
    // REST / CONGESTION
    // ============================================================

    const getRestInformation =
      (
        fixtures,
        targetDate
      ) => {
        const target =
          parseDate(
            targetDate
          );

        if (!target) {
          return {
            lastMatch: null,
            restDays: null,
            congestionMatches: 0
          };
        }

        const completed =
          fixtures
            .map(
              (item) => ({
                date:
                  parseDate(
                    item
                      ?.fixture
                      ?.date
                  ),
                fixture:
                  item
              })
            )
            .filter(
              (item) =>
                item.date &&
                item.date <
                  target
            )
            .sort(
              (
                a,
                b
              ) =>
                b.date -
                a.date
            );

        if (
          !completed.length
        ) {
          return {
            lastMatch: null,
            restDays: null,
            congestionMatches: 0
          };
        }

        const lastMatch =
          completed[0]
            .date;

        const restDays =
          Math.max(
            0,
            (
              target.getTime() -
              lastMatch.getTime()
            ) /
              (
                1000 *
                60 *
                60 *
                24
              )
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
            (item) =>
              item.date >=
              sevenDaysAgo
          ).length;

        return {
          lastMatch:
            lastMatch.toISOString(),

          restDays:
            round(
              restDays,
              1
            ),

          congestionMatches
        };
      };

    const targetMatchDate =
      matchDate ||
      fixture
        ?.fixture
        ?.date;

    const homeRest =
      getRestInformation(
        homeRecent,
        targetMatchDate
      );

    const awayRest =
      getRestInformation(
        awayRecent,
        targetMatchDate
      );

    const buildCongestionAdjustment =
      () => {
        let home = 0;
        let away = 0;

        if (
          homeRest.restDays !=
            null &&
          awayRest.restDays !=
            null
        ) {
          if (
            homeRest.restDays -
              awayRest.restDays >=
            2
          ) {
            home +=
              0.015;
          }

          if (
            awayRest.restDays -
              homeRest.restDays >=
            2
          ) {
            away +=
              0.015;
          }
        }

        if (
          homeRest.congestionMatches >=
          4
        ) {
          home -=
            0.015;
        }

        if (
          awayRest.congestionMatches >=
          4
        ) {
          away -=
            0.015;
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
    // LINEUPS
    // ============================================================

    const getLineupForTeam =
      (teamId) =>
        lineups.find(
          (item) =>
            item
              ?.team
              ?.id ===
            teamId
        ) || null;

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

      home:
        homeLineup
          ? {
              formation:
                homeLineup
                  .formation ||
                null,

              starters:
                safeArray(
                  homeLineup
                    .startXI
                ).length,

              substitutes:
                safeArray(
                  homeLineup
                    .substitutes
                ).length
            }
          : null,

      away:
        awayLineup
          ? {
              formation:
                awayLineup
                  .formation ||
                null,

              starters:
                safeArray(
                  awayLineup
                    .startXI
                ).length,

              substitutes:
                safeArray(
                  awayLineup
                    .substitutes
                ).length
            }
          : null
    };

    // ============================================================
    // SIGNAL 10
    // CONTEXT / WEB EVIDENCE
    // ============================================================

    const contextualSignal =
      normalized
        ?.contextProbability ||
      normalized
        ?.contextProbabilities ||
      normalized
        ?.context
        ?.probabilities ||
      normalized
        ?.motivation
        ?.probabilities ||
      normalized
        ?.webProbabilities ||
      normalized
        ?.evidence
        ?.probabilities ||
      null;

    const contextSignal =
      normalizeProbabilities(
        contextualSignal
      );

    // ============================================================
    // ENSEMBLE
    // ============================================================

    const signals = [];

    const addSignal =
      (
        name,
        probabilities,
        weight
      ) => {
        if (
          !probabilities
        ) {
          return;
        }

        const normalized =
          normalizeProbabilities(
            probabilities
          );

        if (
          !normalized
        ) {
          return;
        }

        signals.push({
          name,
          probabilities:
            normalized,
          weight
        });
      };

    // ------------------------------------------------------------
    // V3.2 WEIGHTS
    //
    // Sum = 1.00
    // ------------------------------------------------------------

    addSignal(
      "api_football_prediction",
      apiSignal,
      0.24
    );

    addSignal(
      "market_probability",
      marketSignal,
      0.18
    );

    addSignal(
      "recent_form",
      formSignal,
      0.14
    );

    addSignal(
      "expected_goals",
      xGSignal,
      0.16
    );

    addSignal(
      "h2h",
      h2hSignal,
      0.04
    );

    addSignal(
      "contextual_evidence",
      contextSignal,
      0.06
    );

    const seasonStrengthSignal =
      buildPoissonSignal(
        teamStatsXG
      );

    addSignal(
      "season_home_away_strength",
      seasonStrengthSignal,
      0.18
    );

    // ============================================================
    // WEIGHTED ENSEMBLE
    // ============================================================

    const combineSignals =
      (signalList) => {
        if (
          !signalList.length
        ) {
          return null;
        }

        const totalWeight =
          signalList.reduce(
            (
              sum,
              signal
            ) =>
              sum +
              signal.weight,
            0
          );

        if (
          totalWeight <= 0
        ) {
          return null;
        }

        const result = {
          home: 0,
          draw: 0,
          away: 0
        };

        for (
          const signal
          of signalList
        ) {
          const weight =
            signal.weight /
            totalWeight;

          result.home +=
            signal
              .probabilities
              .home *
            weight;

          result.draw +=
            signal
              .probabilities
              .draw *
            weight;

          result.away +=
            signal
              .probabilities
              .away *
            weight;
        }

        return normalizeProbabilities(
          result
        );
      };

    let finalProbabilities =
      combineSignals(
        signals
      );

    // ============================================================
    // AVAILABILITY / REST ADJUSTMENTS
    // ============================================================

    const applyAdjustments =
      (probabilities) => {
        if (
          !probabilities
        ) {
          return null;
        }

        let home =
          probabilities.home;

        let draw =
          probabilities.draw;

        let away =
          probabilities.away;

        // --------------------------------------------------------
        // INJURY EFFECT
        //
        // Injuries reduce the corresponding team's probability.
        // They do NOT directly transfer all lost probability
        // to the opponent.
        // --------------------------------------------------------

        home -=
          injuryAdjustment
            .homeImpact *
          0.50;

        away -=
          injuryAdjustment
            .awayImpact *
          0.50;

        // --------------------------------------------------------
        // REST / CONGESTION
        // --------------------------------------------------------

        home +=
          congestionAdjustment.home;

        away +=
          congestionAdjustment.away;

        // --------------------------------------------------------
        // Safety clamps
        // --------------------------------------------------------

        home =
          clamp(
            home,
            0.02,
            0.95
          );

        draw =
          clamp(
            draw,
            0.02,
            0.70
          );

        away =
          clamp(
            away,
            0.02,
            0.95
          );

        return normalizeProbabilities({
          home,
          draw,
          away
        });
      };

    finalProbabilities =
      applyAdjustments(
        finalProbabilities
      );

    // ============================================================
    // SIGNAL AGREEMENT
    // ============================================================

    const calculateAgreement =
      (signalList) => {
        if (
          signalList.length <
          2
        ) {
          return 50;
        }

        let totalDistance =
          0;

        let comparisons =
          0;

        for (
          let i = 0;
          i <
          signalList.length;
          i++
        ) {
          for (
            let j = i + 1;
            j <
            signalList.length;
            j++
          ) {
            const a =
              signalList[i]
                .probabilities;

            const b =
              signalList[j]
                .probabilities;

            // Total variation distance
            const distance =
              0.5 *
              (
                Math.abs(
                  a.home -
                  b.home
                ) +
                Math.abs(
                  a.draw -
                  b.draw
                ) +
                Math.abs(
                  a.away -
                  b.away
                )
              );

            totalDistance +=
              distance;

            comparisons++;
          }
        }

        if (
          comparisons === 0
        ) {
          return 50;
        }

        const averageDistance =
          totalDistance /
          comparisons;

        return Math.round(
          clamp(
            (
              1 -
              averageDistance
            ) * 100,
            0,
            100
          )
        );
      };

    const agreement =
      calculateAgreement(
        signals
      );

    // ============================================================
    // DATA COMPLETENESS
    // ============================================================

    const calculateDataCompleteness =
      () => {
        const checks = [
          Boolean(
            apiSignal
          ),
          Boolean(
            marketSignal
          ),
          Boolean(
            homeStats &&
            awayStats
          ),
          Boolean(
            homeForm &&
            awayForm
          ),
          Boolean(
            xGSignal
          ),
          Boolean(
            h2hSignal
          ),
          Boolean(
            injuries.length
          ),
          Boolean(
            homeRest &&
            awayRest
          ),
          Boolean(
            contextSignal
          )
        ];

        const available =
          checks.filter(
            Boolean
          ).length;

        return Math.round(
          (
            available /
            checks.length
          ) * 100
        );
      };

    const dataCompleteness =
      calculateDataCompleteness();

    // ============================================================
    // CONFIDENCE
    // ============================================================

    const calculateConfidence =
      (
        probabilities,
        agreementScore,
        completeness
      ) => {
        if (
          !probabilities
        ) {
          return "LOW";
        }

        const values = [
          probabilities.home,
          probabilities.draw,
          probabilities.away
        ].sort(
          (a, b) =>
            b - a
        );

        const highest =
          values[0];

        const second =
          values[1];

        const margin =
          highest -
          second;

        // Confidence is NOT prediction probability.
        //
        // It considers:
        // 1. highest probability
        // 2. distance from second choice
        // 3. signal agreement
        // 4. data completeness

        const score =
          highest * 100 * 0.40 +
          margin * 100 * 0.25 +
          agreementScore * 0.20 +
          completeness * 0.15;

        if (
          score >= 62
        ) {
          return "HIGH";
        }

        if (
          score >= 48
        ) {
          return "MEDIUM";
        }

        return "LOW";
      };

    // ============================================================
    // FINAL PREDICTION
    // ============================================================

    const choosePrediction =
      (probabilities) => {
        if (
          !probabilities
        ) {
          return {
            prediction:
              "No Prediction",

            probability:
              0,

            probabilities: {
              home: 0,
              draw: 0,
              away: 0
            },

            selectedKey:
              null
          };
        }

        const home =
          Number(
            probabilities.home
          ) || 0;

        const draw =
          Number(
            probabilities.draw
          ) || 0;

        const away =
          Number(
            probabilities.away
          ) || 0;

        const options = [
          {
            key: "home",
            name: "Home Win",
            value: home
          },
          {
            key: "draw",
            name: "Draw",
            value: draw
          },
          {
            key: "away",
            name: "Away Win",
            value: away
          }
        ];

        // ========================================================
        // CRITICAL:
        //
        // TRUE MAXIMUM SELECTION.
        //
        // No home preference.
        // No API-Football winner override.
        // No frontend decision.
        // ========================================================

        const highest =
          options.reduce(
            (
              best,
              current
            ) =>
              current.value >
              best.value
                ? current
                : best,
            options[0]
          );

        return {
          prediction:
            highest.name,

          probability:
            Math.round(
              highest.value *
              100
            ),

          probabilities: {
            home:
              Math.round(
                home * 100
              ),

            draw:
              Math.round(
                draw * 100
              ),

            away:
              Math.round(
                away * 100
              )
          },

          selectedKey:
            highest.key
        };
      };

    const final =
      choosePrediction(
        finalProbabilities
      );

    const confidence =
      calculateConfidence(
        finalProbabilities,
        agreement,
        dataCompleteness
      );

    // ============================================================
    // SIGNAL REPORT
    // ============================================================

    const signalsUsed =
      signals.map(
        (signal) =>
          signal.name
      );

    const signalWeights =
      {};

    for (
      const signal
      of signals
    ) {
      signalWeights[
        signal.name
      ] =
        signal.weight;
    }

    // ============================================================
    // FINAL RESPONSE
    // ============================================================

    return res.status(200).json({
      success: true,

      version:
        "Prediction Engine V3.2",

      // ----------------------------------------------------------
      // ORIGINAL FRONTEND CONTRACT
      // ----------------------------------------------------------

      prediction:
        final.prediction,

      probability:
        final.probability,

      // ----------------------------------------------------------
      // NEW FRONTEND-SAFE DATA
      // ----------------------------------------------------------

      probabilities:
        final.probabilities,

      confidence,

      agreement,

      dataCompleteness,

      status:
        signals.length >= 5
          ? "ENSEMBLE_COMPLETE"
          : "PARTIAL_DATA",

      match: {
        home:
          homeName,

        away:
          awayName,

        date:
          matchDate ||
          fixture
            ?.fixture
            ?.date ||
          null
      },

      // ==========================================================
      // INTERNAL ANALYSIS
      // ==========================================================

      internalAnalysis: {
        fixtureId,

        leagueId,

        season,

        signalsUsed,

        signalWeights,

        rawSignalCount:
          signals.length,

        finalProbabilities,

        confidence,

        agreement,

        dataCompleteness,

        // --------------------------------------------------------
        // API-FOOTBALL
        // --------------------------------------------------------

        apiPrediction: {
          available:
            Boolean(
              apiSignal
            ),

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
            apiSignal
              ?.predictedGoals ||
            null,

          winner:
            apiSignal
              ?.winner ||
            null,

          advice:
            apiSignal
              ?.advice ||
            null,

          underOver:
            apiSignal
              ?.underOver ||
            null
        },

        // --------------------------------------------------------
        // MARKET
        // --------------------------------------------------------

        market: {
          available:
            Boolean(
              marketSignal
            ),

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

        // --------------------------------------------------------
        // TEAM STATISTICS
        // --------------------------------------------------------

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
                    homeStats
                      .form ||
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
                    awayStats
                      .form ||
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

        // --------------------------------------------------------
        // RECENT FORM
        // --------------------------------------------------------

        recentForm: {
          home:
            homeForm,

          away:
            awayForm
        },

        // --------------------------------------------------------
        // XG / GOAL MODEL
        // --------------------------------------------------------

        xG: {
          source:
            xGSource,

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

        // --------------------------------------------------------
        // H2H
        // --------------------------------------------------------

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

        // --------------------------------------------------------
        // INJURIES
        // --------------------------------------------------------

        injuries: {
          total:
            injuries.length,

          home:
            injuryAdjustment
              .homeCount,

          away:
            injuryAdjustment
              .awayCount,

          homeImpact:
            round(
              injuryAdjustment
                .homeImpact,
              4
            ),

          awayImpact:
            round(
              injuryAdjustment
                .awayImpact,
              4
            )
        },

        // --------------------------------------------------------
        // REST / CONGESTION
        // --------------------------------------------------------

        congestion: {
          home:
            homeRest,

          away:
            awayRest,

          adjustment:
            congestionAdjustment
        },

        // --------------------------------------------------------
        // LINEUPS
        // --------------------------------------------------------

        lineups:
          lineupSignal,

        // --------------------------------------------------------
        // CONTEXT
        // --------------------------------------------------------

        contextual: {
          available:
            Boolean(
              contextSignal
            ),

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
        },

        // --------------------------------------------------------
        // INDIVIDUAL SIGNALS
        // --------------------------------------------------------

        individualSignals:
          signals.map(
            (signal) => ({
              name:
                signal.name,

              weight:
                signal.weight,

              home:
                round(
                  signal
                    .probabilities
                    .home
                ),

              draw:
                round(
                  signal
                    .probabilities
                    .draw
                ),

              away:
                round(
                  signal
                    .probabilities
                    .away
                )
            })
          )
      }
    });
  } catch (error) {
    console.error(
      "Prediction Engine V3.2 error:",
      error
    );

    return res.status(500).json({
      success: false,

      version:
        "Prediction Engine V3.2",

      error:
        "Prediction engine failed.",

      details:
        error?.message ||
        "Unknown server error."
    });
  }
}
