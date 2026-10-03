// /api/analyze.js
// ============================================================
// TOMSONSTAKES TEAM ANALYSIS ENGINE
// Version 4.1
//
// PURPOSE
// ------------------------------------------------------------
// - Retrieve a team's season fixture history
// - Identify the latest 5 completed matches
// - Apply recency weighting
// - Calculate basic form
// - Calculate home/away venue form
// - Calculate season-level home/away performance
// - Provide structured data to api/predict.js V4.0
//
// PREDICTION MODEL WEIGHTS
// ------------------------------------------------------------
// Last 5 matches - recency weighted     45%
// Current league standings              30%
// Season home/away strength              5%
// Expected goals / goal model           10%
// Recent home/away venue form             5%
// Last 5 H2H                              5%
// ------------------------------------------
// TOTAL                                 100%
//
// IMPORTANT
// ------------------------------------------------------------
// This endpoint does NOT make the final prediction.
//
// It does NOT handle:
// - injuries
// - lineups
// - odds
// - H2H prediction
// - league standings prediction
// - final market selection
//
// api/predict.js remains responsible for combining
// the signals.
// ============================================================


export default async function handler(req, res) {

  try {

    // ==========================================================
    // METHOD
    // ==========================================================

    if (req.method !== "GET") {

      return res.status(405).json({

        success: false,

        error:
          "Method not allowed. Use GET."

      });

    }


    // ==========================================================
    // REQUEST PARAMETERS
    // ==========================================================

    const {
      team,
      from,
      to,
      season,
      league
    } = req.query;


    // ==========================================================
    // VALIDATION
    // ==========================================================

    if (!team) {

      return res.status(400).json({

        success: false,

        error:
          "Team ID is required."

      });

    }


    if (!season) {

      return res.status(400).json({

        success: false,

        error:
          "Season is required."

      });

    }


    const teamId =
      Number(team);


    const seasonId =
      Number(season);


    if (
      !Number.isInteger(teamId) ||
      teamId <= 0
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Invalid team ID."

      });

    }


    if (
      !Number.isInteger(seasonId) ||
      seasonId < 2000 ||
      seasonId > 2100
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Invalid season."

      });

    }


    // ==========================================================
    // API KEY
    // ==========================================================

    const apiKey =
      process.env.APIFOOTBALL_KEY;


    if (!apiKey) {

      return res.status(500).json({

        success: false,

        error:
          "APIFOOTBALL_KEY is not configured."

      });

    }


    // ==========================================================
    // API HELPER
    // ==========================================================

    const api =
      async (url) => {

        try {

          const response =
            await fetch(
              url,
              {
                method: "GET",

                headers: {

                  "x-apisports-key":
                    apiKey,

                  "Accept":
                    "application/json"

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

          } catch {

            return {

              ok: false,

              status:
                response.status,

              data: {},

              error:
                "Football provider returned invalid JSON."

            };

          }


          return {

            ok:
              response.ok,

            status:
              response.status,

            data

          };

        }

        catch (error) {

          return {

            ok: false,

            status: 0,

            data: {},

            error:
              error?.message ||
              "Football API request failed."

          };

        }

      };


    // ==========================================================
    // HELPERS
    // ==========================================================

    const safeArray =
      value =>
        Array.isArray(value)
          ? value
          : [];


    const numeric =
      value => {

        if (
          value === null ||
          value === undefined ||
          value === ""
        ) {

          return null;

        }


        const number =
          Number(
            String(value)
              .replace("%", "")
              .replace(",", "")
              .trim()
          );


        return Number.isFinite(number)
          ? number
          : null;

      };


    const round =
      (
        value,
        decimals = 4
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


    const parseDate =
      value => {

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


    // ==========================================================
    // COMPLETED STATUS
    // ==========================================================

    const completedStatuses =
      new Set([

        "FT",
        "AET",
        "PEN"

      ]);


    // ==========================================================
    // BUILD FIXTURE URL
    //
    // We intentionally use season fixtures rather than relying
    // on ?last=5 because the current project must remain
    // compatible with API plans/configurations where that
    // shortcut may not be available.
    // ==========================================================

    const baseUrl =
      "https://v3.football.api-sports.io/fixtures";


    let fixturesUrl =
      `${baseUrl}` +
      `?team=${encodeURIComponent(teamId)}` +
      `&season=${encodeURIComponent(seasonId)}`;


    if (league) {

      const leagueId =
        Number(league);


      if (
        Number.isInteger(leagueId) &&
        leagueId > 0
      ) {

        fixturesUrl +=
          `&league=${encodeURIComponent(
            leagueId
          )}`;

      }

    }


    // ==========================================================
    // OPTIONAL DATE RANGE
    //
    // If from/to are supplied, use them to reduce the amount
    // of data retrieved.
    //
    // Otherwise retrieve the season fixture list.
    // ==========================================================

    if (from && to) {

      fixturesUrl +=
        `&from=${encodeURIComponent(
          String(from)
        )}` +
        `&to=${encodeURIComponent(
          String(to)
        )}`;

    }


    // ==========================================================
    // REQUEST FIXTURES
    // ==========================================================

    const fixtureResponse =
      await api(
        fixturesUrl
      );


    if (
      !fixtureResponse.ok
    ) {

      return res.status(
        fixtureResponse.status >= 400
          ? fixtureResponse.status
          : 502
      ).json({

        success: false,

        version:
          "Team Analysis V4.1",

        error:
          "Unable to retrieve team fixtures.",

        details:
          fixtureResponse.error ||
          fixtureResponse.data?.message ||
          fixtureResponse.data?.errors ||
          null

      });

    }


    if (
      fixtureResponse.data?.errors &&
      Object.keys(
        fixtureResponse.data.errors
      ).length > 0
    ) {

      return res.status(502).json({

        success: false,

        version:
          "Team Analysis V4.1",

        error:
          "Football provider returned an error.",

        providerErrors:
          fixtureResponse.data.errors

      });

    }


    const allFixtures =
      safeArray(
        fixtureResponse
          .data
          ?.response
      );


    // ==========================================================
    // FILTER COMPLETED MATCHES
    // ==========================================================

    const completedFixtures =
      allFixtures
        .filter(
          fixture =>
            completedStatuses.has(
              String(
                fixture
                  ?.fixture
                  ?.status
                  ?.short ||
                ""
              ).toUpperCase()
            )
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
              (
                dateB?.getTime() ||
                0
              ) -
              (
                dateA?.getTime() ||
                0
              )
            );

          }
        );


    // ==========================================================
    // LAST FIVE
    // ==========================================================

    const recentFive =
      completedFixtures
        .slice(
          0,
          5
        );


    // ==========================================================
    // RESULT EXTRACTION
    // ==========================================================

    const getResult =
      fixture => {

        const homeId =
          Number(
            fixture
              ?.teams
              ?.home
              ?.id
          );


        const awayId =
          Number(
            fixture
              ?.teams
              ?.away
              ?.id
          );


        const homeGoals =
          numeric(
            fixture
              ?.goals
              ?.home
          );


        const awayGoals =
          numeric(
            fixture
              ?.goals
              ?.away
          );


        if (
          homeGoals === null ||
          awayGoals === null
        ) {

          return null;

        }


        const isHome =
          homeId ===
          teamId;


        const isAway =
          awayId ===
          teamId;


        if (
          !isHome &&
          !isAway
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

          result =
            "W";

        }

        else if (
          teamGoals <
          opponentGoals
        ) {

          result =
            "L";

        }


        return {

          fixtureId:
            fixture
              ?.fixture
              ?.id ||
            null,

          date:
            fixture
              ?.fixture
              ?.date ||
            null,

          timestamp:
            fixture
              ?.fixture
              ?.timestamp ||
            null,

          leagueId:
            fixture
              ?.league
              ?.id ||
            null,

          leagueName:
            fixture
              ?.league
              ?.name ||
            null,

          country:
            fixture
              ?.league
              ?.country ||
            null,

          round:
            fixture
              ?.league
              ?.round ||
            null,

          opponent:
            isHome
              ? fixture
                  ?.teams
                  ?.away
                  ?.name ||
                null
              : fixture
                  ?.teams
                  ?.home
                  ?.name ||
                null,

          opponentId:
            isHome
              ? fixture
                  ?.teams
                  ?.away
                  ?.id ||
                null
              : fixture
                  ?.teams
                  ?.home
                  ?.id ||
                null,

          venue:
            isHome
              ? "HOME"
              : "AWAY",

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

          goalDifference:
            teamGoals -
            opponentGoals

        };

      };


    // ==========================================================
    // BUILD RESULT ARRAY
    // ==========================================================

    const results =
      recentFive
        .map(
          getResult
        )
        .filter(
          Boolean
        );


    // ==========================================================
    // BASIC FORM
    // ==========================================================

    const totalMatches =
      results.length;


    const wins =
      results.filter(
        item =>
          item.result === "W"
      ).length;


    const draws =
      results.filter(
        item =>
          item.result === "D"
      ).length;


    const losses =
      results.filter(
        item =>
          item.result === "L"
      ).length;


    const points =
      results.reduce(
        (
          total,
          item
        ) =>
          total +
          item.points,
        0
      );


    const goalsFor =
      results.reduce(
        (
          total,
          item
        ) =>
          total +
          item.goalsFor,
        0
      );


    const goalsAgainst =
      results.reduce(
        (
          total,
          item
        ) =>
          total +
          item.goalsAgainst,
        0
      );


    const goalDifference =
      goalsFor -
      goalsAgainst;


    const pointsPerGame =
      totalMatches
        ? points /
          totalMatches
        : 0;


    const winRate =
      totalMatches
        ? wins /
          totalMatches
        : 0;


    // ==========================================================
    // RECENCY WEIGHTS
    //
    // Most recent = 5
    // Second       = 4
    // Third        = 3
    // Fourth       = 2
    // Fifth        = 1
    // ==========================================================

    const recencyWeights =
      [5, 4, 3, 2, 1];


    let weightedPoints = 0;

    let weightedGoalsFor = 0;

    let weightedGoalsAgainst = 0;

    let weightedGoalDifference = 0;

    let totalWeight = 0;


    results.forEach(
      (
        result,
        index
      ) => {

        const weight =
          recencyWeights[index] ||
          1;


        weightedPoints +=
          result.points *
          weight;


        weightedGoalsFor +=
          result.goalsFor *
          weight;


        weightedGoalsAgainst +=
          result.goalsAgainst *
          weight;


        weightedGoalDifference +=
          result.goalDifference *
          weight;


        totalWeight +=
          weight;

      }
    );


    const recencyWeightedPPG =
      totalWeight
        ? weightedPoints /
          totalWeight
        : 0;


    const recencyWeightedGF =
      totalWeight
        ? weightedGoalsFor /
          totalWeight
        : 0;


    const recencyWeightedGA =
      totalWeight
        ? weightedGoalsAgainst /
          totalWeight
        : 0;


    const recencyWeightedGD =
      totalWeight
        ? weightedGoalDifference /
          totalWeight
        : 0;


    // ==========================================================
    // HOME / AWAY FORM
    // ==========================================================

    const homeResults =
      results.filter(
        item =>
          item.venue ===
          "HOME"
      );


    const awayResults =
      results.filter(
        item =>
          item.venue ===
          "AWAY"
      );


    const buildVenueStats =
      venueResults => {

        const matches =
          venueResults.length;


        const venueWins =
          venueResults.filter(
            item =>
              item.result ===
              "W"
          ).length;


        const venueDraws =
          venueResults.filter(
            item =>
              item.result ===
              "D"
          ).length;


        const venueLosses =
          venueResults.filter(
            item =>
              item.result ===
              "L"
          ).length;


        const venuePoints =
          venueResults.reduce(
            (
              total,
              item
            ) =>
              total +
              item.points,
            0
          );


        const venueGF =
          venueResults.reduce(
            (
              total,
              item
            ) =>
              total +
              item.goalsFor,
            0
          );


        const venueGA =
          venueResults.reduce(
            (
              total,
              item
            ) =>
              total +
              item.goalsAgainst,
            0
          );


        return {

          matches,

          wins:
            venueWins,

          draws:
            venueDraws,

          losses:
            venueLosses,

          points:
            venuePoints,

          pointsPerGame:
            matches
              ? venuePoints /
                matches
              : 0,

          goalsFor:
            venueGF,

          goalsAgainst:
            venueGA,

          goalDifference:
            venueGF -
            venueGA

        };

      };


    const recentHome =
      buildVenueStats(
        homeResults
      );


    const recentAway =
      buildVenueStats(
        awayResults
      );


    // ==========================================================
    // SEASON HOME / AWAY STRENGTH
    //
    // This is separate from recent venue form.
    //
    // Recent venue form:
    //     uses LAST 5 overall matches.
    //
    // Season home/away strength:
    //     uses the complete available season history.
    // ==========================================================

    const seasonResults =
      completedFixtures
        .map(
          getResult
        )
        .filter(
          Boolean
        );


    const seasonHomeResults =
      seasonResults.filter(
        item =>
          item.venue ===
          "HOME"
      );


    const seasonAwayResults =
      seasonResults.filter(
        item =>
          item.venue ===
          "AWAY"
      );


    const seasonHome =
      buildVenueStats(
        seasonHomeResults
      );


    const seasonAway =
      buildVenueStats(
        seasonAwayResults
      );


    // ==========================================================
    // FORM STRING
    // ==========================================================

    const form =
      results
        .map(
          item =>
            item.result
        )
        .join("");


    // ==========================================================
    // STANDARDIZED FORM SCORE
    //
    // 0 = weak
    // 0.5 = neutral
    // 1 = strong
    //
    // This is only the TEAM FORM SIGNAL.
    // It is NOT the final prediction probability.
    // ==========================================================

    let formScore =
      0.5;


    if (
      results.length
    ) {

      const ppgComponent =
        Math.min(
          recencyWeightedPPG /
          3,
          1
        );


      const gdComponent =
        Math.max(
          0,
          Math.min(
            1,
            0.5 +
            (
              recencyWeightedGD /
              4
            )
          )
        );


      const winComponent =
        Math.max(
          0,
          Math.min(
            1,
            wins /
            totalMatches
          )
        );


      formScore =
        (
          ppgComponent *
          0.50
        ) +
        (
          gdComponent *
          0.30
        ) +
        (
          winComponent *
          0.20
        );

    }


    // ==========================================================
    // TEAM NAME
    // ==========================================================

    let teamName =
      null;


    const firstTeamFixture =
      allFixtures[0] ||
      null;


    if (
      Number(
        firstTeamFixture
          ?.teams
          ?.home
          ?.id
      ) === teamId
    ) {

      teamName =
        firstTeamFixture
          ?.teams
          ?.home
          ?.name ||
        null;

    }

    else if (
      Number(
        firstTeamFixture
          ?.teams
          ?.away
          ?.id
      ) === teamId
    ) {

      teamName =
        firstTeamFixture
          ?.teams
          ?.away
          ?.name ||
        null;

    }


    // ==========================================================
    // DATA AVAILABILITY
    // ==========================================================

    const dataAvailability = {

      fixtures:
        allFixtures.length > 0,

      lastFive:
        results.length >= 5,

      recentForm:
        results.length > 0,

      recentVenue:
        results.length > 0,

      seasonHome:
        seasonHome.matches > 0,

      seasonAway:
        seasonAway.matches > 0

    };


    // ==========================================================
    // RESPONSE
    // ==========================================================

    res.setHeader(
      "Cache-Control",
      "no-store"
    );


    return res.status(200).json({

      success: true,

      version:
        "Team Analysis V4.1",

      team: {

        id:
          teamId,

        name:
          teamName,

        season:
          seasonId,

        league:
          league
            ? Number(league)
            : null

      },


      // ========================================================
      // DATA AVAILABILITY
      // ========================================================

      dataAvailability,


      // ========================================================
      // LAST FIVE
      // ========================================================

      lastFive: {

        available:
          results.length > 0,

        complete:
          results.length === 5,

        count:
          results.length,

        form,

        results,

        wins,

        draws,

        losses,

        points,

        pointsPerGame:
          round(
            pointsPerGame
          ),

        goalsFor,

        goalsAgainst,

        goalDifference,

        winRate:
          round(
            winRate
          ),

        recencyWeighted: {

          weights:
            recencyWeights
              .slice(
                0,
                results.length
              ),

          totalWeight,

          pointsPerGame:
            round(
              recencyWeightedPPG
            ),

          goalsFor:
            round(
              recencyWeightedGF
            ),

          goalsAgainst:
            round(
              recencyWeightedGA
            ),

          goalDifference:
            round(
              recencyWeightedGD
            )

        },

        formScore:
          round(
            formScore
          )

      },


      // ========================================================
      // RECENT VENUE FORM
      // ========================================================

      recentVenueForm: {

        home:
          recentHome,

        away:
          recentAway

      },


      // ========================================================
      // SEASON HOME / AWAY STRENGTH
      // ========================================================

      seasonHomeAwayStrength: {

        home:
          seasonHome,

        away:
          seasonAway

      },


      // ========================================================
      // COMPLETE FIXTURE SUMMARY
      // ========================================================

      fixtures: {

        requested:
          allFixtures.length,

        completed:
          completedFixtures.length,

        lastFive:
          results

      },


      // ========================================================
      // PREDICTION ENGINE CONTRACT
      // ========================================================

      engine: {

        version:
          "Prediction Engine V4.0",

        intendedWeights: {

          last5RecencyWeighted:
            0.45,

          leagueStandings:
            0.30,

          seasonHomeAwayStrength:
            0.05,

          expectedGoals:
            0.10,

          recentVenueForm:
            0.05,

          last5H2H:
            0.05

        },

        thisEndpointProvides: [

          "last5RecencyWeighted",

          "seasonHomeAwayStrength",

          "recentVenueForm"

        ],

        suppliedElsewhere: [

          "leagueStandings",

          "expectedGoals",

          "last5H2H"

        ],

        excluded:

          [

            "injuries",

            "lineups"

          ]

      }

    });

  }


  catch (error) {

    console.error(
      "TEAM ANALYSIS V4.1 ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      version:
        "Team Analysis V4.1",

      error:
        "Unable to retrieve team analysis.",

      details:
        error?.message ||
        "Unknown server error."

    });

  }

}
