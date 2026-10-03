// /api/predict.js
// ============================================================
// TOMSONSTAKES GLOBAL FOOTBALL PREDICTION ENGINE
// Prediction Engine V4.0
//
// PRIMARY MODEL:
//
// 35%  Recent Last-5 Form
// 20%  League/Table Strength
// 15%  Home/Away Season Strength
// 15%  Goals + xG Strength
// 10%  Recent Venue Form
// 05%  Recent H2H
//
// EXCLUDED FROM CALCULATION:
//
// Injuries      = 0%
// Lineups       = 0%
// Bookmaker     = 0%
// API prediction= 0%
//
// IMPORTANT:
// - No artificial 45% home probability
// - No home selection bias
// - Highest calculated probability wins
// - Recent form is the dominant signal
// - League/table position is explicitly compared
// - Home/away strength is explicitly compared
// - Draw remains a genuine third outcome
// ============================================================

export default async function handler(req, res) {

  // ============================================================
  // METHOD
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
        error: "APIFOOTBALL_KEY is not configured."
      });
    }

    // ============================================================
    // REQUEST
    // ============================================================

    const body = req.body || {};

    const match =
      body.match || {};

    const normalized =
      body.normalized || {};

    const homeName =
      match.home || "";

    const awayName =
      match.away || "";

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
    // API HELPER
    // ============================================================

    const api = async (endpoint) => {

      try {

        const response =
          await fetch(
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

    const clamp =
      (value, min, max) =>
        Math.max(
          min,
          Math.min(max, value)
        );

    const numeric =
      (value) => {

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

        const number =
          Number(cleaned);

        return Number.isFinite(number)
          ? number
          : null;
      };

    const round =
      (value, decimals = 3) => {

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

    const safeArray =
      (value) =>
        Array.isArray(value)
          ? value
          : [];

    const normalizeName =
      (name) =>
        String(name || "")
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

    const parseDate =
      (value) => {

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

    const normalizeProbabilities =
      (probabilities) => {

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
          home +
          draw +
          away;

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
    // FINISHED MATCH STATUS
    // ============================================================

    const FINISHED =
      [
        "FT",
        "AET",
        "PEN",
        "AWD",
        "WO"
      ];

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
    // RESOLVE FIXTURE
    // ============================================================

    if (
      !fixtureId &&
      matchDate
    ) {

      const dateOnly =
        String(matchDate)
          .slice(0, 10);

      const response =
        await api(
          `/fixtures?date=${encodeURIComponent(
            dateOnly
          )}&timezone=Africa%2FLagos`
        );

      const fixtures =
        safeArray(
          response
            .data
            ?.response
        );

      const targetHome =
        normalizeName(
          homeName
        );

      const targetAway =
        normalizeName(
          awayName
        );

      fixture =
        fixtures.find(
          (item) => {

            const home =
              normalizeName(
                item
                  ?.teams
                  ?.home
                  ?.name
              );

            const away =
              normalizeName(
                item
                  ?.teams
                  ?.away
                  ?.name
              );

            return (
              home === targetHome &&
              away === targetAway
            );
          }
        ) || null;

      if (!fixture) {

        fixture =
          fixtures.find(
            (item) => {

              const home =
                normalizeName(
                  item
                    ?.teams
                    ?.home
                    ?.name
                );

              const away =
                normalizeName(
                  item
                    ?.teams
                    ?.away
                    ?.name
                );

              return (
                (
                  home.includes(
                    targetHome
                  ) ||
                  targetHome.includes(
                    home
                  )
                ) &&
                (
                  away.includes(
                    targetAway
                  ) ||
                  targetAway.includes(
                    away
                  )
                )
              );
            }
          ) || null;
      }

      if (fixture) {

        fixtureId =
          fixture
            ?.fixture
            ?.id ||
          null;

        leagueId =
          fixture
            ?.league
            ?.id ||
          null;

        season =
          fixture
            ?.league
            ?.season ||
          null;

        homeTeamId =
          fixture
            ?.teams
            ?.home
            ?.id ||
          null;

        awayTeamId =
          fixture
            ?.teams
            ?.away
            ?.id ||
          null;
      }
    }

    // ============================================================
    // IF FIXTURE CANNOT BE RESOLVED
    // ============================================================

    if (
      !fixtureId ||
      !homeTeamId ||
      !awayTeamId
    ) {

      return res.status(200).json({

        success: true,

        version:
          "Prediction Engine V4.0",

        prediction:
          "No Prediction",

        probability:
          0,

        probabilities: {
          home: 0,
          draw: 0,
          away: 0
        },

        confidence:
          "LOW",

        agreement:
          0,

        dataCompleteness:
          0,

        status:
          "INSUFFICIENT_FIXTURE_DATA",

        match: {
          home:
            homeName,

          away:
            awayName,

          date:
            matchDate
        },

        internalAnalysis: {
          fixtureId:
            null,

          reason:
            "Fixture, league or team IDs could not be resolved."
        }
      });
    }

    // ============================================================
    // DATA COLLECTION
    //
    // IMPORTANT:
    // We intentionally DO NOT request:
    // - injuries
    // - lineups
    // - bookmaker odds
    //
    // They have ZERO influence on this model.
    // ============================================================

    const responses =
      await Promise.all([

        // --------------------------------------------------------
        // 1. HOME SEASON STATISTICS
        // --------------------------------------------------------

        leagueId && season
          ? api(
              `/teams/statistics?league=${leagueId}&season=${season}&team=${homeTeamId}`
            )
          : Promise.resolve({
              data: {}
            }),

        // --------------------------------------------------------
        // 2. AWAY SEASON STATISTICS
        // --------------------------------------------------------

        leagueId && season
          ? api(
              `/teams/statistics?league=${leagueId}&season=${season}&team=${awayTeamId}`
            )
          : Promise.resolve({
              data: {}
            }),

        // --------------------------------------------------------
        // 3. HOME LAST FIVE
        // --------------------------------------------------------

        api(
          `/fixtures?team=${homeTeamId}&last=5`
        ),

        // --------------------------------------------------------
        // 4. AWAY LAST FIVE
        // --------------------------------------------------------

        api(
          `/fixtures?team=${awayTeamId}&last=5`
        ),

        // --------------------------------------------------------
        // 5. STANDINGS
        // --------------------------------------------------------

        leagueId && season
          ? api(
              `/standings?league=${leagueId}&season=${season}`
            )
          : Promise.resolve({
              data: {}
            }),

        // --------------------------------------------------------
        // 6. H2H
        // --------------------------------------------------------

        api(
          `/fixtures/headtohead?h2h=${homeTeamId}-${awayTeamId}&last=5`
        )
      ]);

    const [
      homeStatsResponse,
      awayStatsResponse,
      homeRecentResponse,
      awayRecentResponse,
      standingsResponse,
      h2hResponse
    ] =
      responses;

    const homeStats =
      homeStatsResponse
        ?.data
        ?.response
        ?.[0] ||
      null;

    const awayStats =
      awayStatsResponse
        ?.data
        ?.response
        ?.[0] ||
      null;

    const rawHomeRecent =
      safeArray(
        homeRecentResponse
          ?.data
          ?.response
      );

    const rawAwayRecent =
      safeArray(
        awayRecentResponse
          ?.data
          ?.response
      );

    const h2hFixtures =
      safeArray(
        h2hResponse
          ?.data
          ?.response
      );

    // ============================================================
    // TARGET MATCH DATE
    // ============================================================

    const targetDate =
      parseDate(
        fixture
          ?.fixture
          ?.date
      ) ||
      parseDate(
        matchDate
      );

    // ============================================================
    // SORT LAST FIVE PROPERLY
    // ============================================================

    const prepareRecentFixtures =
      (
        fixtures,
        teamId
      ) => {

        return fixtures
          .filter(
            (item) => {

              const status =
                String(
                  item
                    ?.fixture
                    ?.status
                    ?.short ||
                  ""
                ).toUpperCase();

              const date =
                parseDate(
                  item
                    ?.fixture
                    ?.date
                );

              if (
                !date
              ) {
                return false;
              }

              // Must already have been played.
              if (
                !FINISHED.includes(
                  status
                )
              ) {
                return false;
              }

              // Never use the future.
              if (
                targetDate &&
                date >= targetDate
              ) {
                return false;
              }

              // Must actually involve the team.
              const homeId =
                item
                  ?.teams
                  ?.home
                  ?.id;

              const awayId =
                item
                  ?.teams
                  ?.away
                  ?.id;

              return (
                homeId === teamId ||
                awayId === teamId
              );
            }
          )
          .sort(
            (a, b) => {

              const dateA =
                parseDate(
                  a
                    ?.fixture
                    ?.date
                );

              const dateB =
                parseDate(
                  b
                    ?.fixture
                    ?.date
                );

              return (
                dateB -
                dateA
              );
            }
          )
          .slice(0, 5);
      };

    const homeRecent =
      prepareRecentFixtures(
        rawHomeRecent,
        homeTeamId
      );

    const awayRecent =
      prepareRecentFixtures(
        rawAwayRecent,
        awayTeamId
      );

    // ============================================================
    // MATCH RESULT EXTRACTION
    // ============================================================

    const getResult =
      (
        item,
        teamId
      ) => {

        const homeId =
          item
            ?.teams
            ?.home
            ?.id;

        const awayId =
          item
            ?.teams
            ?.away
            ?.id;

        const homeGoals =
          numeric(
            item
              ?.goals
              ?.home
          );

        const awayGoals =
          numeric(
            item
              ?.goals
              ?.away
          );

        if (
          homeGoals == null ||
          awayGoals == null
        ) {
          return null;
        }

        const teamIsHome =
          homeId === teamId;

        if (
          !teamIsHome &&
          awayId !== teamId
        ) {
          return null;
        }

        const goalsFor =
          teamIsHome
            ? homeGoals
            : awayGoals;

        const goalsAgainst =
          teamIsHome
            ? awayGoals
            : homeGoals;

        let result =
          "D";

        if (
          goalsFor >
          goalsAgainst
        ) {
          result =
            "W";
        } else if (
          goalsFor <
          goalsAgainst
        ) {
          result =
            "L";
        }

        return {
          result,

          points:
            result === "W"
              ? 3
              : result === "D"
                ? 1
                : 0,

          goalsFor,

          goalsAgainst,

          goalDifference:
            goalsFor -
            goalsAgainst,

          date:
            item
              ?.fixture
              ?.date ||
            null,

          venue:
            teamIsHome
              ? "home"
              : "away"
        };
      };

    // ============================================================
    // RECENT FORM MODEL
    // ============================================================

    const buildRecentForm =
      (
        fixtures,
        teamId
      ) => {

        const results =
          fixtures
            .map(
              (item) =>
                getResult(
                  item,
                  teamId
                )
            )
            .filter(
              Boolean
            );

        if (
          !results.length
        ) {
          return null;
        }

        // --------------------------------------------------------
        // RECENCY WEIGHTS
        //
        // newest = 30%
        // second = 25%
        // third = 20%
        // fourth = 15%
        // fifth = 10%
        // --------------------------------------------------------

        const weights =
          [
            0.30,
            0.25,
            0.20,
            0.15,
            0.10
          ];

        let weightedResult =
          0;

        let weightTotal =
          0;

        results.forEach(
          (item, index) => {

            const weight =
              weights[index] ||
              0.10;

            const resultValue =
              item.result === "W"
                ? 1
                : item.result === "D"
                  ? 0.5
                  : 0;

            weightedResult +=
              resultValue *
              weight;

            weightTotal +=
              weight;
          }
        );

        weightedResult =
          weightTotal > 0
            ? weightedResult /
              weightTotal
            : 0.5;

        const points =
          results.reduce(
            (sum, item) =>
              sum +
              item.points,
            0
          );

        const goalsFor =
          results.reduce(
            (sum, item) =>
              sum +
              item.goalsFor,
            0
          );

        const goalsAgainst =
          results.reduce(
            (sum, item) =>
              sum +
              item.goalsAgainst,
            0
          );

        const goalDifference =
          goalsFor -
          goalsAgainst;

        const goalsForPerGame =
          goalsFor /
          results.length;

        const goalsAgainstPerGame =
          goalsAgainst /
          results.length;

        const goalDiffPerGame =
          goalDifference /
          results.length;

        const wins =
          results.filter(
            (item) =>
              item.result === "W"
          ).length;

        const draws =
          results.filter(
            (item) =>
              item.result === "D"
          ).length;

        const losses =
          results.filter(
            (item) =>
              item.result === "L"
          ).length;

        const cleanSheets =
          results.filter(
            (item) =>
              item.goalsAgainst === 0
          ).length;

        const failedToScore =
          results.filter(
            (item) =>
              item.goalsFor === 0
          ).length;

        // --------------------------------------------------------
        // COMPONENT SCORES
        // --------------------------------------------------------

        const resultScore =
          clamp(
            weightedResult,
            0,
            1
          );

        const goalDiffScore =
          clamp(
            0.5 +
            goalDiffPerGame /
              4,
            0,
            1
          );

        const attackScore =
          clamp(
            goalsForPerGame /
              3,
            0,
            1
          );

        const defenseScore =
          clamp(
            1 -
            goalsAgainstPerGame /
              3,
            0,
            1
          );

        // --------------------------------------------------------
        // FINAL FORM STRENGTH
        // --------------------------------------------------------

        const strength =
          (
            resultScore *
            0.55
          ) +
          (
            goalDiffScore *
            0.20
          ) +
          (
            attackScore *
            0.10
          ) +
          (
            defenseScore *
            0.15
          );

        return {

          matches:
            results.length,

          results:
            results.map(
              (item) =>
                item.result
            ),

          detailedResults:
            results,

          points,

          pointsPerGame:
            points /
            results.length,

          weightedResult:
            round(
              weightedResult,
              4
            ),

          wins,

          draws,

          losses,

          goalsFor,

          goalsAgainst,

          goalDifference,

          goalsForPerGame:
            round(
              goalsForPerGame,
              3
            ),

          goalsAgainstPerGame:
            round(
              goalsAgainstPerGame,
              3
            ),

          goalDiffPerGame:
            round(
              goalDiffPerGame,
              3
            ),

          cleanSheets,

          failedToScore,

          strength:
            round(
              strength,
              4
            )
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
    // VENUE FORM
    // ============================================================

    const buildVenueForm =
      (
        fixtures,
        teamId,
        venue
      ) => {

        const venueResults =
          fixtures
            .map(
              (item) =>
                getResult(
                  item,
                  teamId
                )
            )
            .filter(
              (item) =>
                item &&
                item.venue ===
                  venue
            );

        if (
          !venueResults.length
        ) {
          return null;
        }

        const points =
          venueResults.reduce(
            (sum, item) =>
              sum +
              item.points,
            0
          );

        const goalsFor =
          venueResults.reduce(
            (sum, item) =>
              sum +
              item.goalsFor,
            0
          );

        const goalsAgainst =
          venueResults.reduce(
            (sum, item) =>
              sum +
              item.goalsAgainst,
            0
          );

        const ppg =
          points /
          venueResults.length;

        const gdpg =
          (
            goalsFor -
            goalsAgainst
          ) /
          venueResults.length;

        const strength =
          clamp(
            (
              (ppg / 3) *
              0.65
            ) +
            (
              clamp(
                0.5 +
                gdpg / 4,
                0,
                1
              ) *
              0.35
            ),
            0,
            1
          );

        return {
          matches:
            venueResults.length,

          points,

          ppg:
            round(
              ppg,
              3
            ),

          goalsFor,

          goalsAgainst,

          goalDifference:
            goalsFor -
            goalsAgainst,

          strength:
            round(
              strength,
              4
            )
        };
      };

    const homeVenueForm =
      buildVenueForm(
        homeRecent,
        homeTeamId,
        "home"
      );

    const awayVenueForm =
      buildVenueForm(
        awayRecent,
        awayTeamId,
        "away"
      );

    // ============================================================
    // SEASON STATISTICS
    // ============================================================

    const getStat =
      (
        stats,
        path
      ) => {

        let current =
          stats;

        for (
          const key of path
        ) {

          if (
            current == null
          ) {
            return null;
          }

          current =
            current[key];
        }

        return numeric(
          current
        );
      };

    const buildSeasonVenueStrength =
      (
        stats,
        venue
      ) => {

        if (!stats) {
          return null;
        }

        const played =
          getStat(
            stats,
            [
              "fixtures",
              "played",
              venue
            ]
          );

        const wins =
          getStat(
            stats,
            [
              "fixtures",
              "wins",
              venue
            ]
          );

        const draws =
          getStat(
            stats,
            [
              "fixtures",
              "draws",
              venue
            ]
          );

        const goalsFor =
          getStat(
            stats,
            [
              "goals",
              "for",
              "average",
              venue
            ]
          );

        const goalsAgainst =
          getStat(
            stats,
            [
              "goals",
              "against",
              "average",
              venue
            ]
          );

        if (
          played == null ||
          played <= 0
        ) {
          return null;
        }

        const ppg =
          (
            (
              (wins || 0) *
              3
            ) +
            (
              (draws || 0) *
              1
            )
          ) /
          played;

        const resultScore =
          clamp(
            ppg / 3,
            0,
            1
          );

        const attackScore =
          goalsFor == null
            ? 0.5
            : clamp(
                goalsFor / 3,
                0,
                1
              );

        const defenseScore =
          goalsAgainst == null
            ? 0.5
            : clamp(
                1 -
                goalsAgainst / 3,
                0,
                1
              );

        const strength =
          (
            resultScore *
            0.55
          ) +
          (
            attackScore *
            0.20
          ) +
          (
            defenseScore *
            0.25
          );

        return {

          played,

          wins:
            wins || 0,

          draws:
            draws || 0,

          ppg:
            round(
              ppg,
              3
            ),

          goalsFor:
            goalsFor,

          goalsAgainst:
            goalsAgainst,

          strength:
            round(
              strength,
              4
            )
        };
      };

    const homeSeasonVenue =
      buildSeasonVenueStrength(
        homeStats,
        "home"
      );

    const awaySeasonVenue =
      buildSeasonVenueStrength(
        awayStats,
        "away"
      );

    // ============================================================
    // STANDINGS
    // ============================================================

    const extractStandingRows =
      (response) => {

        const output = [];

        const groups =
          safeArray(
            response
              ?.data
              ?.response
          );

        for (
          const leagueBlock
          of groups
        ) {

          const standings =
            safeArray(
              leagueBlock
                ?.league
                ?.standings
            );

          for (
            const group
            of standings
          ) {

            if (
              Array.isArray(group)
            ) {

              for (
                const row
                of group
              ) {
                output.push(
                  row
                );
              }

            } else if (
              group &&
              typeof group ===
                "object"
            ) {

              output.push(
                group
              );
            }
          }
        }

        return output;
      };

    const standingRows =
      extractStandingRows(
        standingsResponse
      );

    const homeStanding =
      standingRows.find(
        (row) =>
          Number(
            row
              ?.team
              ?.id
          ) ===
          Number(homeTeamId)
      ) || null;

    const awayStanding =
      standingRows.find(
        (row) =>
          Number(
            row
              ?.team
              ?.id
          ) ===
          Number(awayTeamId)
      ) || null;

    // ============================================================
    // STANDING STRENGTH
    // ============================================================

    const standingStrength =
      (row) => {

        if (!row) {
          return null;
        }

        const rank =
          numeric(
            row.rank
          );

        const points =
          numeric(
            row.points
          );

        const goalsDiff =
          numeric(
            row.goalsDiff
          );

        const played =
          numeric(
            row
              ?.all
              ?.played
          );

        if (
          rank == null
        ) {
          return null;
        }

        // --------------------------------------------------------
        // Rank score
        // --------------------------------------------------------

        const tableSize =
          Math.max(
            standingRows.length,
            2
          );

        const rankScore =
          clamp(
            (
              tableSize -
              rank
            ) /
            (
              tableSize -
              1
            ),
            0,
            1
          );

        // --------------------------------------------------------
        // Points per game
        // --------------------------------------------------------

        const ppg =
          played &&
          played > 0 &&
          points != null
            ? points /
              played
            : null;

        const pointsScore =
          ppg == null
            ? 0.5
            : clamp(
                ppg / 3,
                0,
                1
              );

        // --------------------------------------------------------
        // Goal difference
        // --------------------------------------------------------

        const gdpg =
          played &&
          played > 0 &&
          goalsDiff != null
            ? goalsDiff /
              played
            : null;

        const gdScore =
          gdpg == null
            ? 0.5
            : clamp(
                0.5 +
                gdpg / 4,
                0,
                1
              );

        // --------------------------------------------------------
        // Combined table strength
        // --------------------------------------------------------

        const strength =
          (
            rankScore *
            0.25
          ) +
          (
            pointsScore *
            0.50
          ) +
          (
            gdScore *
            0.25
          );

        return {

          rank,

          points,

          played,

          goalsDiff,

          ppg:
            ppg == null
              ? null
              : round(
                  ppg,
                  3
                ),

          gdpg:
            gdpg == null
              ? null
              : round(
                  gdpg,
                  3
                ),

          form:
            row.form ||
            null,

          strength:
            round(
              strength,
              4
            )
        };
      };

    const homeTable =
      standingStrength(
        homeStanding
      );

    const awayTable =
      standingStrength(
        awayStanding
      );

    // ============================================================
    // PAIRWISE PROBABILITY CONVERTER
    // ============================================================

    const pairToProbabilities =
      (
        homeStrength,
        awayStrength,
        drawBase = 0.25
      ) => {

        let home =
          clamp(
            numeric(
              homeStrength
            ) ?? 0.5,
            0,
            1
          );

        let away =
          clamp(
            numeric(
              awayStrength
            ) ?? 0.5,
            0,
            1
          );

        const total =
          home +
          away;

        if (
          total <= 0
        ) {
          home = 0.5;
          away = 0.5;
        }

        const homeShare =
          total > 0
            ? home / total
            : 0.5;

        const edge =
          Math.abs(
            home -
            away
          );

        // Draw becomes slightly less likely
        // when the strength gap is larger.
        const draw =
          clamp(
            drawBase -
            edge * 0.10,
            0.16,
            0.30
          );

        const remaining =
          1 -
          draw;

        return normalizeProbabilities({
          home:
            remaining *
            homeShare,

          draw,

          away:
            remaining *
            (
              1 -
              homeShare
            )
        });
      };

    // ============================================================
    // SIGNAL 1 — LAST FIVE FORM
    // ============================================================

    const formSignal =
      homeForm &&
      awayForm
        ? pairToProbabilities(
            homeForm.strength,
            awayForm.strength,
            0.25
          )
        : null;

    // ============================================================
    // SIGNAL 2 — TABLE / STANDINGS
    // ============================================================

    const standingsSignal =
      homeTable &&
      awayTable
        ? pairToProbabilities(
            homeTable.strength,
            awayTable.strength,
            0.25
          )
        : null;

    // ============================================================
    // SIGNAL 3 — HOME/AWAY SEASON STRENGTH
    // ============================================================

    const seasonVenueSignal =
      homeSeasonVenue &&
      awaySeasonVenue
        ? pairToProbabilities(
            homeSeasonVenue.strength,
            awaySeasonVenue.strength,
            0.24
          )
        : null;

    // ============================================================
    // SIGNAL 4 — RECENT VENUE FORM
    // ============================================================

    const venueSignal =
      homeVenueForm &&
      awayVenueForm
        ? pairToProbabilities(
            homeVenueForm.strength,
            awayVenueForm.strength,
            0.24
          )
        : null;

    // ============================================================
    // XG / GOAL MODEL
    // ============================================================

    const getNormalizedXG =
      () => {

        const home =
          numeric(
            normalized
              ?.xG
              ?.home
          ) ??
          numeric(
            normalized
              ?.xg
              ?.home
          ) ??
          numeric(
            normalized
              ?.expectedGoals
              ?.home
          ) ??
          numeric(
            normalized
              ?.homeXG
          );

        const away =
          numeric(
            normalized
              ?.xG
              ?.away
          ) ??
          numeric(
            normalized
              ?.xg
              ?.away
          ) ??
          numeric(
            normalized
              ?.expectedGoals
              ?.away
          ) ??
          numeric(
            normalized
              ?.awayXG
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
              5
            ),

          away:
            clamp(
              away,
              0.05,
              5
            )
        };
      };

    const teamStatsXG =
      homeSeasonVenue &&
      awaySeasonVenue &&
      homeSeasonVenue.goalsFor !=
        null &&
      homeSeasonVenue.goalsAgainst !=
        null &&
      awaySeasonVenue.goalsFor !=
        null &&
      awaySeasonVenue.goalsAgainst !=
        null
        ? {
            home:
              clamp(
                (
                  homeSeasonVenue
                    .goalsFor +
                  awaySeasonVenue
                    .goalsAgainst
                ) / 2,
                0.05,
                5
              ),

            away:
              clamp(
                (
                  awaySeasonVenue
                    .goalsFor +
                  homeSeasonVenue
                    .goalsAgainst
                ) / 2,
                0.05,
                5
              )
          }
        : null;

    const xG =
      getNormalizedXG() ||
      teamStatsXG ||
      null;

    // ------------------------------------------------------------
    // POISSON
    // ------------------------------------------------------------

    const poisson =
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

        let homeWin =
          0;

        let draw =
          0;

        let awayWin =
          0;

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
              poisson(
                xg.home,
                h
              ) *
              poisson(
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
          home:
            homeWin,

          draw,

          away:
            awayWin
        });
      };

    const xGSignal =
      buildPoissonSignal(
        xG
      );

    // ============================================================
    // SIGNAL 5 — H2H
    // ============================================================

    const buildH2H =
      () => {

        if (
          !h2hFixtures.length
        ) {
          return null;
        }

        const matches =
          h2hFixtures
            .filter(
              (game) => {

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

                return (
                  hg != null &&
                  ag != null
                );
              }
            )
            .sort(
              (a, b) => {

                const dateA =
                  parseDate(
                    a
                      ?.fixture
                      ?.date
                  );

                const dateB =
                  parseDate(
                    b
                      ?.fixture
                      ?.date
                  );

                return (
                  dateB -
                  dateA
                );
              }
            )
            .slice(0, 5);

        if (
          !matches.length
        ) {
          return null;
        }

        const weights =
          [
            0.30,
            0.25,
            0.20,
            0.15,
            0.10
          ];

        let homeScore =
          0;

        let awayScore =
          0;

        let drawScore =
          0;

        let weightTotal =
          0;

        matches.forEach(
          (game, index) => {

            const weight =
              weights[index] ||
              0.10;

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

            const homeIsTarget =
              Number(
                game
                  ?.teams
                  ?.home
                  ?.id
              ) ===
              Number(
                homeTeamId
              );

            if (
              hg === ag
            ) {

              drawScore +=
                weight;

            } else if (
              homeIsTarget
                ? hg > ag
                : ag > hg
            ) {

              homeScore +=
                weight;

            } else {

              awayScore +=
                weight;
            }

            weightTotal +=
              weight;
          }
        );

        if (
          weightTotal <= 0
        ) {
          return null;
        }

        return normalizeProbabilities({
          home:
            homeScore,

          draw:
            drawScore,

          away:
            awayScore
        });
      };

    const h2hSignal =
      buildH2H();

    // ============================================================
    // WEIGHTED MODEL
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

        const normalizedSignal =
          normalizeProbabilities(
            probabilities
          );

        if (
          !normalizedSignal
        ) {
          return;
        }

        signals.push({
          name,

          probabilities:
            normalizedSignal,

          weight
        });
      };

    // ============================================================
    // TOMSONSTAKES V4 WEIGHTS
    // ============================================================

    addSignal(
      "last_5_form",
      formSignal,
      0.35
    );

    addSignal(
      "league_standings",
      standingsSignal,
      0.20
    );

    addSignal(
      "home_away_season_strength",
      seasonVenueSignal,
      0.15
    );

    addSignal(
      "goals_xg_model",
      xGSignal,
      0.15
    );

    addSignal(
      "recent_venue_form",
      venueSignal,
      0.10
    );

    addSignal(
      "recent_h2h",
      h2hSignal,
      0.05
    );

    // ============================================================
    // COMBINE
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
            (sum, signal) =>
              sum +
              signal.weight,
            0
          );

        if (
          totalWeight <= 0
        ) {
          return null;
        }

        const output = {
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

          output.home +=
            signal
              .probabilities
              .home *
            weight;

          output.draw +=
            signal
              .probabilities
              .draw *
            weight;

          output.away +=
            signal
              .probabilities
              .away *
            weight;
        }

        return normalizeProbabilities(
          output
        );
      };

    let finalProbabilities =
      combineSignals(
        signals
      );

    // ============================================================
    // FALLBACK
    // ============================================================

    if (
      !finalProbabilities
    ) {

      finalProbabilities =
        {
          home:
            0.333333,

          draw:
            0.333333,

          away:
            0.333334
        };
    }

    // ============================================================
    // PREDICTION
    // ============================================================

    const choosePrediction =
      (probabilities) => {

        const options = [

          {
            key:
              "home",

            name:
              "Home Win",

            value:
              probabilities.home
          },

          {
            key:
              "draw",

            name:
              "Draw",

            value:
              probabilities.draw
          },

          {
            key:
              "away",

            name:
              "Away Win",

            value:
              probabilities.away
          }
        ];

        const highest =
          options.reduce(
            (best, current) =>
              current.value >
              best.value
                ? current
                : best,
            options[0]
          );

        return {

          prediction:
            highest.name,

          selectedKey:
            highest.key,

          probability:
            Math.round(
              highest.value *
              100
            ),

          probabilities: {

            home:
              Math.round(
                probabilities.home *
                100
              ),

            draw:
              Math.round(
                probabilities.draw *
                100
              ),

            away:
              Math.round(
                probabilities.away *
                100
              )
          }
        };
      };

    const final =
      choosePrediction(
        finalProbabilities
      );

    // ============================================================
    // DATA COMPLETENESS
    // ============================================================

    const completenessChecks = [

      Boolean(
        homeForm &&
        awayForm
      ),

      Boolean(
        homeTable &&
        awayTable
      ),

      Boolean(
        homeSeasonVenue &&
        awaySeasonVenue
      ),

      Boolean(
        xGSignal
      ),

      Boolean(
        homeVenueForm &&
        awayVenueForm
      ),

      Boolean(
        h2hSignal
      )
    ];

    const available =
      completenessChecks
        .filter(
          Boolean
        )
        .length;

    const dataCompleteness =
      Math.round(
        (
          available /
          completenessChecks.length
        ) *
        100
      );

    // ============================================================
    // AGREEMENT
    // ============================================================

    const calculateAgreement =
      (signalList) => {

        if (
          signalList.length <
          2
        ) {
          return 50;
        }

        let distanceTotal =
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

            distanceTotal +=
              distance;

            comparisons++;
          }
        }

        if (
          comparisons === 0
        ) {
          return 50;
        }

        const average =
          distanceTotal /
          comparisons;

        return Math.round(
          clamp(
            (
              1 -
              average
            ) *
            100,
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
    // CONFIDENCE
    // ============================================================

    const calculateConfidence =
      (
        probabilities,
        agreementScore,
        completeness
      ) => {

        const values =
          [
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

        const score =
          (
            highest *
            100 *
            0.45
          ) +
          (
            margin *
            100 *
            0.25
          ) +
          (
            agreementScore *
            0.15
          ) +
          (
            completeness *
            0.15
          );

        if (
          score >= 65
        ) {
          return "HIGH";
        }

        if (
          score >= 50
        ) {
          return "MEDIUM";
        }

        return "LOW";
      };

    const confidence =
      calculateConfidence(
        finalProbabilities,
        agreement,
        dataCompleteness
      );

    // ============================================================
    // SIGNAL WEIGHTS REPORT
    // ============================================================

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

      success:
        true,

      version:
        "Prediction Engine V4.0",

      // ----------------------------------------------------------
      // FRONTEND CONTRACT
      // ----------------------------------------------------------

      prediction:
        final.prediction,

      probability:
        final.probability,

      probabilities:
        final.probabilities,

      confidence,

      agreement,

      dataCompleteness,

      status:
        signals.length >= 4
          ? "FORM_TABLE_MODEL"
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

        model:

          "Recent-form-first statistical ensemble",

        signalsUsed:
          signals.map(
            (signal) =>
              signal.name
          ),

        signalWeights,

        rawSignalCount:
          signals.length,

        finalProbabilities,

        selectedOutcome:
          final.prediction,

        selectedProbability:
          final.probability,

        confidence,

        agreement,

        dataCompleteness,

        // --------------------------------------------------------
        // LAST FIVE FORM
        // --------------------------------------------------------

        recentForm: {

          home:
            homeForm,

          away:
            awayForm,

          comparison: {

            homeStrength:
              homeForm
                ?.strength ??
              null,

            awayStrength:
              awayForm
                ?.strength ??
              null,

            strongerRecentForm:
              homeForm &&
              awayForm
                ? (
                    homeForm.strength >
                    awayForm.strength
                      ? homeName
                      : awayForm.strength >
                        homeForm.strength
                        ? awayName
                        : "EVEN"
                  )
                : null
          }
        },

        // --------------------------------------------------------
        // STANDINGS
        // --------------------------------------------------------

        standings: {

          available:
            Boolean(
              homeTable &&
              awayTable
            ),

          home:
            homeTable,

          away:
            awayTable,

          comparison: {

            homeRank:
              homeTable
                ?.rank ??
              null,

            awayRank:
              awayTable
                ?.rank ??
              null,

            homePoints:
              homeTable
                ?.points ??
              null,

            awayPoints:
              awayTable
                ?.points ??
              null,

            strongerTablePosition:
              homeTable &&
              awayTable
                ? (
                    homeTable.strength >
                    awayTable.strength
                      ? homeName
                      : awayTable.strength >
                        homeTable.strength
                        ? awayName
                        : "EVEN"
                  )
                : null
          }
        },

        // --------------------------------------------------------
        // HOME / AWAY SEASON STRENGTH
        // --------------------------------------------------------

        homeAwayStrength: {

          home:
            homeSeasonVenue,

          away:
            awaySeasonVenue,

          stronger:
            homeSeasonVenue &&
            awaySeasonVenue
              ? (
                  homeSeasonVenue.strength >
                  awaySeasonVenue.strength
                    ? homeName
                    : awaySeasonVenue.strength >
                      homeSeasonVenue.strength
                      ? awayName
                      : "EVEN"
                )
              : null
        },

        // --------------------------------------------------------
        // VENUE FORM
        // --------------------------------------------------------

        venueForm: {

          home:
            homeVenueForm,

          away:
            awayVenueForm
        },

        // --------------------------------------------------------
        // XG
        // --------------------------------------------------------

        xG: {

          available:
            Boolean(
              xG
            ),

          expectedGoals:
            xG,

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
          ),

        // --------------------------------------------------------
        // EXPLICITLY EXCLUDED
        // --------------------------------------------------------

        excludedFactors: {

          injuries:
            {
              influence:
                0,

              reason:
                "Excluded from prediction calculation by design."
            },

          lineups:
            {
              influence:
                0,

              reason:
                "Excluded from prediction calculation by design."
            },

          bookmakerOdds:
            {
              influence:
                0,

              reason:
                "Excluded from prediction calculation by design."
            },

          apiFootballPrediction:
            {
              influence:
                0,

              reason:
                "Excluded from prediction calculation by design."
            }
        }
      }
    });

  } catch (error) {

    console.error(
      "Prediction Engine V4.0 error:",
      error
    );

    return res.status(500).json({

      success:
        false,

      version:
        "Prediction Engine V4.0",

      error:
        "Prediction engine failed.",

      details:
        error?.message ||
        "Unknown server error."
    });
  }
}
