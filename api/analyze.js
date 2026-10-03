// /api/analyze.js
// ============================================================
// TOMSONSTAKES TEAM ANALYSIS ENGINE
// Version 4.0
//
// Purpose:
// - Retrieve team fixture history
// - Retrieve last 5 completed matches
// - Calculate current form
// - Calculate recency-weighted form
// - Calculate home/away venue form
// - Provide structured data for api/predict.js V4.0
//
// IMPORTANT:
// - Injuries are NOT used here.
// - Lineups are NOT used here.
// - This endpoint does NOT make the final prediction.
// - api/predict.js V4.0 consumes this data.
// ============================================================

export default async function handler(req, res) {
  try {
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
        error: "Team ID is required."
      });
    }

    if (!season) {
      return res.status(400).json({
        success: false,
        error: "Team ID and season are required."
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

    const api = async (url) => {
      try {
        const response =
          await fetch(url, {
            headers: {
              "x-apisports-key":
                apiKey,

              "Accept":
                "application/json"
            }
          });

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
            error?.message ||
            "API request failed."
        };
      }
    };

    // ==========================================================
    // HELPERS
    // ==========================================================

    const safeArray = (value) =>
      Array.isArray(value)
        ? value
        : [];

    const numeric = (value) => {
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

    const parseDate = (value) => {
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
    // BUILD URL
    // ==========================================================

    const baseUrl =
      "https://v3.football.api-sports.io/fixtures";

    // ==========================================================
    // REQUEST LAST 5
    //
    // API-Football supports:
    // fixtures?team=TEAM_ID&last=5
    //
    // This is the primary form dataset.
    // ==========================================================

    const lastFiveUrl =
      `${baseUrl}?team=${encodeURIComponent(
        team
      )}&last=5`;

    const lastFiveResponse =
      await api(lastFiveUrl);

    const lastFiveFixtures =
      safeArray(
        lastFiveResponse
          .data?.response
      );

    // ==========================================================
    // REQUEST BROADER DATE RANGE
    //
    // This is useful for:
    // - venue form
    // - historical calculations
    // - debugging
    //
    // Only request when from/to exist.
    // ==========================================================

    let rangeFixtures = [];

    if (from && to) {
      let rangeUrl =
        `${baseUrl}?team=${encodeURIComponent(
          team
        )}` +
        `&season=${encodeURIComponent(
          season
        )}` +
        `&from=${encodeURIComponent(
          from
        )}` +
        `&to=${encodeURIComponent(
          to
        )}`;

      if (league) {
        rangeUrl +=
          `&league=${encodeURIComponent(
            league
          )}`;
      }

      const rangeResponse =
        await api(rangeUrl);

      rangeFixtures =
        safeArray(
          rangeResponse
            .data?.response
        );
    }

    // ==========================================================
    // CHOOSE FIXTURES
    // ==========================================================

    const allFixtures =
      rangeFixtures.length
        ? rangeFixtures
        : lastFiveFixtures;

    // ==========================================================
    // ONLY COMPLETED MATCHES
    // ==========================================================

    const completedStatuses =
      new Set([
        "FT",
        "AET",
        "PEN"
      ]);

    const completedFixtures =
      allFixtures
        .filter((fixture) =>
          completedStatuses.has(
            fixture
              ?.fixture
              ?.status
              ?.short
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
              (dateB?.getTime() || 0) -
              (dateA?.getTime() || 0)
            );
          }
        );

    // ==========================================================
    // LAST FIVE COMPLETED
    // ==========================================================

    const recentFive =
      completedFixtures
        .slice(0, 5);

    // ==========================================================
    // RESULT EXTRACTION
    // ==========================================================

    const getResult =
      (fixture) => {
        const homeId =
          fixture
            ?.teams
            ?.home
            ?.id;

        const awayId =
          fixture
            ?.teams
            ?.away
            ?.id;

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
          Number(homeId) ===
          Number(team);

        const isAway =
          Number(awayId) ===
          Number(team);

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
          result = "W";
        }

        if (
          teamGoals <
          opponentGoals
        ) {
          result = "L";
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
    // BUILD RESULTS
    // ==========================================================

    const results =
      recentFive
        .map(getResult)
        .filter(Boolean);

    // ==========================================================
    // BASIC FORM
    // ==========================================================

    const totalMatches =
      results.length;

    const wins =
      results.filter(
        (item) =>
          item.result ===
          "W"
      ).length;

    const draws =
      results.filter(
        (item) =>
          item.result ===
          "D"
      ).length;

    const losses =
      results.filter(
        (item) =>
          item.result ===
          "L"
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
    // RECENCY-WEIGHTED FORM
    //
    // Match #1 = most recent
    //
    // Weights:
    // Most recent: 5
    // 2nd: 4
    // 3rd: 3
    // 4th: 2
    // 5th: 1
    //
    // This produces the strongest influence from the
    // most recent matches.
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
          recencyWeights[
            index
          ] || 1;

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
    // HOME / AWAY VENUE FORM
    // ==========================================================

    const homeResults =
      results.filter(
        (item) =>
          item.venue ===
          "HOME"
      );

    const awayResults =
      results.filter(
        (item) =>
          item.venue ===
          "AWAY"
      );

    const buildVenueStats =
      (venueResults) => {
        const matches =
          venueResults.length;

        const venueWins =
          venueResults.filter(
            (item) =>
              item.result ===
              "W"
          ).length;

        const venueDraws =
          venueResults.filter(
            (item) =>
              item.result ===
              "D"
          ).length;

        const venueLosses =
          venueResults.filter(
            (item) =>
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

    const homeVenue =
      buildVenueStats(
        homeResults
      );

    const awayVenue =
      buildVenueStats(
        awayResults
      );

    // ==========================================================
    // FORM STRING
    // ==========================================================

    const formString =
      results
        .map(
          (item) =>
            item.result
        )
        .join("");

    // ==========================================================
    // FORM SCORE
    //
    // This is NOT the final prediction.
    //
    // It gives predict.js a standardized number between
    // approximately 0 and 1 for comparing teams.
    // ==========================================================

    const calculateFormScore =
      () => {
        if (!results.length) {
          return 0.5;
        }

        // PPG component
        const ppgComponent =
          Math.min(
            recencyWeightedPPG /
              3,
            1
          );

        // Goal difference component
        const gdComponent =
          Math.max(
            0,
            Math.min(
              1,
              0.5 +
                recencyWeightedGD /
                  4
            )
          );

        // Win component
        const winComponent =
          Math.max(
            0,
            Math.min(
              1,
              wins /
                Math.max(
                  totalMatches,
                  1
                )
          );

        return (
          ppgComponent *
            0.50 +
          gdComponent *
            0.30 +
          winComponent *
            0.20
        );
      };

    const formScore =
      calculateFormScore();

    // ==========================================================
    // TEAM INFORMATION
    // ==========================================================

    const firstFixture =
      allFixtures[0] ||
      null;

    const teamName =
      firstFixture
        ?.teams
        ?.home
        ?.id ===
        Number(team)
        ? firstFixture
            ?.teams
            ?.home
            ?.name
        : firstFixture
            ?.teams
            ?.away
            ?.name ||
          null;

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(200).json({
      success: true,

      version:
        "Team Analysis V4.0",

      team: {
        id:
          Number(team),

        name:
          teamName,

        season:
          Number(season),

        league:
          league
            ? Number(league)
            : null
      },

      // ========================================================
      // LAST FIVE
      // ========================================================

      lastFive: {
        available:
          results.length > 0,

        count:
          results.length,

        form:
          formString,

        results,

        wins,

        draws,

        losses,

        points,

        pointsPerGame:
          round(
            pointsPerGame,
            3
          ),

        goalsFor,

        goalsAgainst,

        goalDifference,

        winRate:
          round(
            winRate,
            3
          ),

        recencyWeighted: {
          weights:
            recencyWeights
              .slice(
                0,
                results.length
              ),

          pointsPerGame:
            round(
              recencyWeightedPPG,
              3
            ),

          goalsFor:
            round(
              recencyWeightedGF,
              3
            ),

          goalsAgainst:
            round(
              recencyWeightedGA,
              3
            ),

          goalDifference:
            round(
              recencyWeightedGD,
              3
            )
        },

        formScore:
          round(
            formScore,
            4
          )
      },

      // ========================================================
      // VENUE FORM
      // ========================================================

      venueForm: {
        home:
          homeVenue,

        away:
          awayVenue
      },

      // ========================================================
      // FIXTURE DATA
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
      // ENGINE INFORMATION
      // ========================================================

      engine: {
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

        excludedFromPrediction: [
          "injuries",
          "lineups"
        ]
      }
    });

  } catch (error) {

    console.error(
      "Team Analysis V4.0 error:",
      error
    );

    return res.status(500).json({
      success: false,

      version:
        "Team Analysis V4.0",

      error:
        "Unable to retrieve team analysis.",

      details:
        error?.message ||
        "Unknown server error."
    });
  }
}
