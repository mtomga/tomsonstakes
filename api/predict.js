// /api/predict.js
// ============================================================
// TOMSONSTAKES GLOBAL FOOTBALL PREDICTION ENGINE
// Prediction Engine V3.2
//
// Frontend contract:
//   prediction
//   probability
//
// Engine combines:
//   1. API-Football prediction
//   2. Bookmaker market probability
//   3. Season team statistics
//   4. Home/Away strength
//   5. Recent last-5 form
//   6. xG / expected goals
//   7. Poisson probability model
//   8. H2H
//   9. Injuries
//  10. Lineups
//  11. Rest / congestion
//  12. Normalized web/context evidence
//
// V3.2 HARDENING:
//   - Guaranteed JSON responses
//   - Safe request-body parsing
//   - API timeout protection
//   - API-Football response validation
//   - Individual API failures do not kill the engine
//   - Fixture resolution fallback
//   - Probability normalization
//   - Safe numeric handling
//   - Detailed internal diagnostics
// ============================================================

export default async function handler(req, res) {

  // ------------------------------------------------------------
  // GLOBAL JSON RESPONSE HEADER
  // ------------------------------------------------------------

  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  } catch (_) {
    // Ignore header errors.
  }

  // ------------------------------------------------------------
  // METHOD
  // ------------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      version: "Prediction Engine V3.2",
      error: "Method not allowed. Use POST."
    });
  }

  // ------------------------------------------------------------
  // MAIN ENGINE
  // ------------------------------------------------------------

  try {

    // ==========================================================
    // ENVIRONMENT
    // ==========================================================

    const API_KEY =
      process.env.APIFOOTBALL_KEY;

    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        version: "Prediction Engine V3.2",
        error:
          "APIFOOTBALL_KEY is not configured."
      });
    }

    // ==========================================================
    // REQUEST BODY
    // ==========================================================

    let body = req.body;

    // Some deployments can provide body as a string.
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {
        return res.status(400).json({
          success: false,
          version: "Prediction Engine V3.2",
          error:
            "Request body contains invalid JSON."
        });
      }
    }

    body = body || {};

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
        version: "Prediction Engine V3.2",
        error:
          "Home and away team names are required."
      });
    }

    // ==========================================================
    // HELPERS
    // ==========================================================

    const clamp = (
      value,
      min,
      max
    ) => {
      const n = Number(value);

      if (!Number.isFinite(n)) {
        return min;
      }

      return Math.max(
        min,
        Math.min(max, n)
      );
    };

    const round = (
      value,
      decimals = 3
    ) => {
      if (!Number.isFinite(value)) {
        return null;
      }

      const factor =
        Math.pow(10, decimals);

      return (
        Math.round(
          value * factor
        ) / factor
      );
    };

    const numeric = (
      value
    ) => {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return null;
      }

      const n =
        Number(value);

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

      const date =
        new Date(value);

      return Number.isNaN(
        date.getTime()
      )
        ? null
        : date;
    };

    // ----------------------------------------------------------
    // PROBABILITY NORMALIZATION
    // ----------------------------------------------------------

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

      const h =
        Math.max(0, home);

      const d =
        Math.max(0, draw);

      const a =
        Math.max(0, away);

      const total =
        h + d + a;

      if (total <= 0) {
        return null;
      }

      return {
        home: h / total,
        draw: d / total,
        away: a / total
      };
    };

    // ==========================================================
    // API-Football REQUEST WRAPPER
    // ==========================================================

    const API_BASE =
      "https://v3.football.api-sports.io";

    const api = async (
      endpoint,
      timeoutMs = 12000
    ) => {

      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () => {
            try {
              controller.abort();
            } catch (_) {}
          },
          timeoutMs
        );

      try {

        const response =
          await fetch(
            `${API_BASE}${endpoint}`,
            {
              method: "GET",
              headers: {
                "x-apisports-key":
                  API_KEY,
                Accept:
                  "application/json"
              },
              signal:
                controller.signal
            }
          );

        const text =
          await response.text();

        let data = {};

        if (text) {
          try {
            data =
              JSON.parse(text);
          } catch (_) {
            return {
              ok: false,
              status:
                response.status,
              data: {},
              error:
                "API returned non-JSON response.",
              raw:
                text.slice(0, 500)
            };
          }
        }

        const apiErrors =
          safeArray(
            data?.errors
          );

        return {
          ok:
            response.ok &&
            !apiErrors.length,
          status:
            response.status,
          data,
          error:
            apiErrors.length
              ? JSON.stringify(
                  apiErrors
                )
              : null
        };

      } catch (error) {

        return {
          ok: false,
          status: 0,
          data: {},
          error:
            error?.name ===
            "AbortError"
              ? "API request timed out."
              : (
                  error?.message ||
                  "API request failed."
                )
        };

      } finally {
        clearTimeout(timeout);
      }
    };

    // ==========================================================
    // FIXTURE RESOLUTION
    // ==========================================================

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

    // ----------------------------------------------------------
    // FIND FIXTURE FROM DATE
    // ----------------------------------------------------------

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
          (item) => {

            const h =
              normalizeName(
                item?.teams
                  ?.home?.name
              );

            const a =
              normalizeName(
                item?.teams
                  ?.away?.name
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
            (item) => {

              const h =
                normalizeName(
                  item?.teams
                    ?.home?.name
                );

              const a =
                normalizeName(
                  item?.teams
                    ?.away?.name
                );

              return (
                (
                  h.includes(
                    targetHome
                  ) ||
                  targetHome.includes(
                    h
                  )
                ) &&
                (
                  a.includes(
                    targetAway
                  ) ||
                  targetAway.includes(
                    a
                  )
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

    // ==========================================================
    // NORMALIZED XG
    // ==========================================================

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
            normalized?.expectedGoals
              ?.home
          ) ??
          numeric(
            normalized
              ?.expected_goals
              ?.home
          ) ??
          numeric(
            normalized?.homeXG
          ) ??
          numeric(
            normalized?.homeXg
          ) ??
          numeric(
            normalized?.goals
              ?.xG?.home
          ) ??
          numeric(
            normalized?.statistics
              ?.xG?.home
          );

        const away =
          numeric(
            normalized?.xG?.away
          ) ??
          numeric(
            normalized?.xg?.away
          ) ??
          numeric(
            normalized?.expectedGoals
              ?.away
          ) ??
          numeric(
            normalized
              ?.expected_goals
              ?.away
          ) ??
          numeric(
            normalized?.awayXG
          ) ??
          numeric(
            normalized?.awayXg
          ) ??
          numeric(
            normalized?.goals
              ?.xG?.away
          ) ??
          numeric(
            normalized?.statistics
              ?.xG?.away
          );

        if (
          home == null ||
          away == null
        ) {
          return null;
        }

        return {
          home:
            clamp(
              home,
              0.05,
              8
            ),

          away:
            clamp(
              away,
              0.05,
              8
            )
        };
      };

    // ==========================================================
    // FALLBACK XG PROBABILITY
    // ==========================================================

    const fallbackFromXG =
      (xg) => {

        if (!xg) {
          return {
            home: 0.38,
            draw: 0.30,
            away: 0.32
          };
        }

        const homeStrength =
          Math.max(
            xg.home,
            0.10
          );

        const awayStrength =
          Math.max(
            xg.away,
            0.10
          );

        const totalStrength =
          homeStrength +
          awayStrength;

        let home =
          0.20 +
          (
            homeStrength /
            totalStrength
          ) * 0.50;

        let away =
          0.20 +
          (
            awayStrength /
            totalStrength
          ) * 0.40;

        let draw =
          1 -
          home -
          away;

        if (draw < 0.15) {

          draw = 0.15;

          const remaining =
            0.85;

          const ratio =
            homeStrength /
            totalStrength;

          home =
            remaining * ratio;

          away =
            remaining *
            (1 - ratio);
        }

        return normalizeProbabilities({
          home,
          draw,
          away
        });
      };

    // ==========================================================
    // FALLBACK WHEN FIXTURE IS UNKNOWN
    // ==========================================================

    if (
      !fixtureId ||
      !homeTeamId ||
      !awayTeamId
    ) {

      const fallbackXG =
        getNormalizedXG();

      const fallbackProbabilities =
        fallbackFromXG(
          fallbackXG
        );

      const options = [
        {
          name: "Home Win",
          value:
            fallbackProbabilities.home
        },
        {
          name: "Draw",
          value:
            fallbackProbabilities.draw
        },
        {
          name: "Away Win",
          value:
            fallbackProbabilities.away
        }
      ];

      options.sort(
        (a, b) =>
          b.value -
          a.value
      );

      return res.status(200).json({
        success: true,
        version:
          "Prediction Engine V3.2",

        prediction:
          options[0].name,

        probability:
          Math.round(
            options[0].value *
            100
          ),

        status:
          "FALLBACK",

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

          probabilities:
            fallbackProbabilities,

          xG:
            fallbackXG
        }
      });
    }

    // ==========================================================
    // PARALLEL DATA COLLECTION
    // ==========================================================

    const requests =
      await Promise.all([

        // API prediction
        api(
          `/predictions?fixture=${fixtureId}`
        ),

        // Home season statistics
        leagueId && season
          ? api(
              `/teams/statistics?league=${leagueId}&season=${season}&team=${homeTeamId}`
            )
          : Promise.resolve({
              ok: false,
              data: {}
            }),

        // Away season statistics
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

    // ==========================================================
    // EXTRACT RESPONSES
    // ==========================================================

    const apiPrediction =
      predictionResponse
        ?.data?.response?.[0] ||
      null;

    const homeStats =
      homeStatsResponse
        ?.data?.response?.[0] ||
      null;

    const awayStats =
      awayStatsResponse
        ?.data?.response?.[0] ||
      null;

    const h2hFixtures =
      safeArray(
        h2hResponse
          ?.data?.response
      );

    const injuries =
      safeArray(
        injuryResponse
          ?.data?.response
      );

    const odds =
      safeArray(
        oddsResponse
          ?.data?.response
      );

    const homeRecent =
      safeArray(
        homeRecentResponse
          ?.data?.response
      );

    const awayRecent =
      safeArray(
        awayRecentResponse
          ?.data?.response
      );

    const lineups =
      safeArray(
        lineupResponse
          ?.data?.response
      );

    // ==========================================================
    // SIGNAL 1 — API FOOTBALL PREDICTION
    // ==========================================================

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
          normalizeProbabilities({
            home:
              percent.home,
            draw:
              percent.draw,
            away:
              percent.away
          });

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

    // ==========================================================
    // SIGNAL 2 — BOOKMAKER MARKET
    // ==========================================================

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
                bet?.name || ""
              )
                .toLowerCase();

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
                )
                  .toLowerCase();

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

              const normalized =
                normalizeProbabilities({
                  home: h,
                  draw: d,
                  away: a
                });

              if (normalized) {
                probabilities.push(
                  normalized
                );
              }
            }
          }
        }

        if (
          probabilities.length
        ) {

          const count =
            probabilities.length;

          return normalizeProbabilities({
            home:
              probabilities.reduce(
                (
                  sum,
                  p
                ) =>
                  sum + p.home,
                0
              ) / count,

            draw:
              probabilities.reduce(
                (
                  sum,
                  p
                ) =>
                  sum + p.draw,
                0
              ) / count,

            away:
              probabilities.reduce(
                (
                  sum,
                  p
                ) =>
                  sum + p.away,
                0
              ) / count
          });
        }

        // Normalized fallback
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

        if (!market) {
          return null;
        }

        return normalizeProbabilities({
          home:
            market.home,
          draw:
            market.draw,
          away:
            market.away
        });
      };

    const marketSignal =
      parseMarketProbabilities();

    // ==========================================================
    // SIGNAL 3 — TEAM STATISTICS
    // ==========================================================

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

        return {
          home:
            clamp(
              (
                homeAttack +
                awayDefense
              ) / 2,
              0.05,
              5
            ),

          away:
            clamp(
              (
                awayAttack +
                homeDefense
              ) / 2,
              0.05,
              5
            )
        };
      };

    const teamStatsXG =
      buildXGFromTeamStats();

    // ==========================================================
    // SIGNAL 4 — LAST 5 FORM
    // ==========================================================

    const getResultForTeam =
      (
        fixtureItem,
        teamId
      ) => {

        const homeId =
          fixtureItem
            ?.teams?.home?.id;

        const awayId =
          fixtureItem
            ?.teams?.away?.id;

        const homeGoals =
          numeric(
            fixtureItem
              ?.goals?.home
          );

        const awayGoals =
          numeric(
            fixtureItem
              ?.goals?.away
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
              ?.fixture?.date ||
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
              (item) =>
                getResultForTeam(
                  item,
                  teamId
                )
            )
            .filter(Boolean);

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

        return {
          results,

          points,

          ppg,

          goalDiff,

          wins:
            results.filter(
              (r) =>
                r.result === "W"
            ).length,

          draws:
            results.filter(
              (r) =>
                r.result === "D"
            ).length,

          losses:
            results.filter(
              (r) =>
                r.result === "L"
            ).length,

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

    const buildFormSignal =
      () => {

        if (
          !homeForm ||
          !awayForm
        ) {
          return null;
        }

        const homeScore =
          homeForm.ppg +
          homeForm.goalDiff *
            0.25;

        const awayScore =
          awayForm.ppg +
          awayForm.goalDiff *
            0.25;

        const homeAdjusted =
          homeScore +
          0.35;

        const drawBase =
          1.15;

        const totalPositive =
          Math.max(
            homeAdjusted,
            0.05
          ) +
          Math.max(
            awayScore,
            0.05
          );

        return normalizeProbabilities({
          home:
            Math.max(
              homeAdjusted,
              0.05
            ),

          draw:
            drawBase,

          away:
            Math.max(
              awayScore,
              0.05
            )
        });
      };

    const formSignal =
      buildFormSignal();

    // ==========================================================
    // SIGNAL 5 — POISSON / XG
    // ==========================================================

    const normalizedXG =
      getNormalizedXG();

    const apiPredictedGoals =
      apiSignal
        ?.predictedGoals;

    const xGSignalData =
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

    const poissonProbability =
      (
        lambda,
        k
      ) => {

        let factorial =
          1;

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

            if (
              h > a
            ) {
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

        return normalizeProbabilities({
          home: homeWin,
          draw,
          away: awayWin
        });
      };

    const xGSignal =
      buildPoissonSignal(
        xGSignalData
      );

    // ==========================================================
    // SIGNAL 6 — H2H
    // ==========================================================

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
              ?.teams?.home?.id;

          const aId =
            game
              ?.teams?.away?.id;

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

        return normalizeProbabilities({
          home: homeWins,
          draw: draws,
          away: awayWins
        });
      };

    const h2hSignal =
      buildH2HSignal();

    // ==========================================================
    // SIGNAL 7 — INJURIES
    // ==========================================================

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
            teamId === homeTeamId
          ) {
            homeCount++;
          }

          if (
            teamId === awayTeamId
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

    // ==========================================================
    // SIGNAL 8 — REST / CONGESTION
    // ==========================================================

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
                      ?.fixture?.date
                  ),

                fixture:
                  item
              })
            )
            .filter(
              (item) =>
                item.date &&
                item.date < target
            )
            .sort(
              (a, b) =>
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
          completed[0].date;

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

    const effectiveMatchDate =
      matchDate ||
      fixture
        ?.fixture?.date ||
      null;

    const homeRest =
      getRestInformation(
        homeRecent,
        effectiveMatchDate
      );

    const awayRest =
      getRestInformation(
        awayRecent,
        effectiveMatchDate
      );

    const buildCongestionAdjustment =
      () => {

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
          homeRest.congestionMatches >=
          4
        ) {
          home -= 0.015;
        }

        if (
          awayRest.congestionMatches >=
          4
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

    // ==========================================================
    // SIGNAL 9 — LINEUPS
    // ==========================================================

    const getLineupForTeam =
      (teamId) => {

        return (
          lineups.find(
            (item) =>
              item?.team?.id ===
              teamId
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

    // ==========================================================
    // SIGNAL 10 — CONTEXT / WEB EVIDENCE
    // ==========================================================

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

    const parseContextSignal =
      () => {

        if (
          !contextualSignal
        ) {
          return null;
        }

        return normalizeProbabilities({
          home:
            contextualSignal.home,

          draw:
            contextualSignal.draw,

          away:
            contextualSignal.away
        });
      };

    const contextSignal =
      parseContextSignal();

    // ==========================================================
    // ENSEMBLE
    // ==========================================================

    const signals = [];

    const addSignal =
      (
        name,
        probabilities,
        weight
      ) => {

        const normalizedProbability =
          normalizeProbabilities(
            probabilities
          );

        if (
          normalizedProbability &&
          Number.isFinite(
            weight
          ) &&
          weight > 0
        ) {

          signals.push({
            name,

            probabilities:
              normalizedProbability,

            weight
          });
        }
      };

    // ----------------------------------------------------------
    // V3 WEIGHTS
    // ----------------------------------------------------------

    addSignal(
      "api_football_prediction",
      apiSignal,
      0.25
    );

    addSignal(
      "market_probability",
      marketSignal,
      0.18
    );

    addSignal(
      "recent_form",
      formSignal,
      0.12
    );

    addSignal(
      "expected_goals",
      xGSignal,
      0.15
    );

    // H2H intentionally weak
    addSignal(
      "h2h",
      h2hSignal,
      0.05
    );

    addSignal(
      "contextual_evidence",
      contextSignal,
      0.05
    );

    const statsXGSignal =
      buildPoissonSignal(
        teamStatsXG
      );

    addSignal(
      "season_home_away_strength",
      statsXGSignal,
      0.20
    );

    // ==========================================================
    // COMBINE SIGNALS
    // ==========================================================

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

        let home = 0;
        let draw = 0;
        let away = 0;

        for (
          const signal
          of signalList
        ) {

          const weight =
            signal.weight /
            totalWeight;

          home +=
            signal
              .probabilities
              .home *
            weight;

          draw +=
            signal
              .probabilities
              .draw *
            weight;

          away +=
            signal
              .probabilities
              .away *
            weight;
        }

        return normalizeProbabilities({
          home,
          draw,
          away
        });
      };

    let finalProbabilities =
      combineSignals(
        signals
      );

    // ==========================================================
    // IF ALL LIVE SIGNALS FAILED
    // ==========================================================

    if (
      !finalProbabilities
    ) {

      const fallbackXG =
        getNormalizedXG();

      finalProbabilities =
        fallbackFromXG(
          fallbackXG
        );
    }

    // ==========================================================
    // AVAILABILITY + CONGESTION
    // ==========================================================

    const applyAdjustments =
      (probabilities) => {

        if (!probabilities) {
          return null;
        }

        let home =
          probabilities.home;

        let draw =
          probabilities.draw;

        let away =
          probabilities.away;

        // ------------------------------------------------------
        // Injuries
        // ------------------------------------------------------

        home -=
          injuryAdjustment
            .homeImpact *
          0.50;

        away -=
          injuryAdjustment
            .awayImpact *
          0.50;

        // ------------------------------------------------------
        // Rest / congestion
        // ------------------------------------------------------

        home +=
          congestionAdjustment.home;

        away +=
          congestionAdjustment.away;

        // ------------------------------------------------------
        // Safety limits
        // ------------------------------------------------------

        home =
          clamp(
            home,
            0.05,
            0.90
          );

        draw =
          clamp(
            draw,
            0.05,
            0.50
          );

        away =
          clamp(
            away,
            0.05,
            0.90
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

    // ==========================================================
    // FINAL PREDICTION
    // ==========================================================

    const choosePrediction =
      (probabilities) => {

        if (!probabilities) {
          return {
            prediction:
              "No Prediction",

            probability:
              0
          };
        }

        const options = [
          {
            name:
              "Home Win",

            value:
              probabilities.home
          },

          {
            name:
              "Draw",

            value:
              probabilities.draw
          },

          {
            name:
              "Away Win",

            value:
              probabilities.away
          }
        ];

        options.sort(
          (a, b) =>
            b.value -
            a.value
        );

        return {
          prediction:
            options[0].name,

          probability:
            Math.round(
              options[0].value *
              100
            )
        };
      };

    const final =
      choosePrediction(
        finalProbabilities
      );

    // ==========================================================
    // SIGNAL REPORT
    // ==========================================================

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

    // ==========================================================
    // API HEALTH
    // ==========================================================

    const apiHealth = {

      prediction:
        Boolean(
          predictionResponse?.ok
        ),

      homeStatistics:
        Boolean(
          homeStatsResponse?.ok
        ),

      awayStatistics:
        Boolean(
          awayStatsResponse?.ok
        ),

      h2h:
        Boolean(
          h2hResponse?.ok
        ),

      injuries:
        Boolean(
          injuryResponse?.ok
        ),

      odds:
        Boolean(
          oddsResponse?.ok
        ),

      homeRecent:
        Boolean(
          homeRecentResponse?.ok
        ),

      awayRecent:
        Boolean(
          awayRecentResponse?.ok
        ),

      lineups:
        Boolean(
          lineupResponse?.ok
        )
    };

    // ==========================================================
    // FINAL JSON
    // ==========================================================

    return res.status(200).json({

      success: true,

      version:
        "Prediction Engine V3.2",

      prediction:
        final.prediction,

      probability:
        final.probability,

      status:
        signals.length >= 5
          ? "ENSEMBLE_COMPLETE"
          : signals.length >= 3
            ? "PARTIAL_DATA"
            : "LIMITED_DATA",

      match: {

        home:
          homeName,

        away:
          awayName,

        date:
          effectiveMatchDate
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

        apiHealth,

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

          home:
            homeForm,

          away:
            awayForm
        },

        xG: {

          source:
            normalizedXG
              ? "normalized_web"
              : (
                  apiPredictedGoals
                    ?.home != null &&
                  apiPredictedGoals
                    ?.away != null
                )
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

        congestion: {

          home:
            homeRest,

          away:
            awayRest,

          adjustment:
            congestionAdjustment
        },

        lineups:
          lineupSignal,

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
        }
      }
    });

  } catch (error) {

    // ==========================================================
    // GUARANTEED JSON ERROR
    // ==========================================================

    console.error(
      "TomsonStakes Prediction Engine V3.2:",
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
