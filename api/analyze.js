// /api/analyze.js
// ============================================================
// TOMSONSTAKES TEAM ANALYSIS ENGINE
// Version 4.1
//
// PURPOSE
// ------------------------------------------------------------
// Provides structured team data for api/predict.js V4.0.
//
// CORE PREDICTION MODEL
// ------------------------------------------------------------
// Last 5 matches — recency weighted       45%
// Current league standings                 30%
// Season home/away strength                 5%
// Expected goals / goal model              10%
// Recent home/away venue form                5%
// Last 5 H2H                                5%
//
// TOTAL                                   100%
//
// IMPORTANT
// ------------------------------------------------------------
// Injuries are NOT prediction inputs.
// Lineups are NOT prediction inputs.
// This endpoint does NOT make the final prediction.
// api/predict.js performs the final H/D/A calculation.
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
      league,
      opponent
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
        error: "APIFOOTBALL_KEY is not configured."
      });
    }

    // ==========================================================
    // API HELPER
    // ==========================================================

    const api = async (url) => {
      try {
        const response = await fetch(url, {
          headers: {
            "x-apisports-key": apiKey,
            "Accept": "application/json"
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

    const clamp = (
      value,
      min,
      max
    ) => {
      return Math.max(
        min,
        Math.min(
          max,
          value
        )
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
    // API ENDPOINTS
    // ==========================================================

    const fixturesUrl =
      "https://v3.football.api-sports.io/fixtures";

    const standingsUrl =
      "https://v3.football.api-sports.io/standings";

    // ==========================================================
    // REQUEST LAST 5 MATCHES
    // ==========================================================

    const lastFiveUrl =
      `${fixturesUrl}?team=${encodeURIComponent(
        team
      )}&last=5`;

    // ==========================================================
    // REQUEST SEASON FIXTURES
    // ==========================================================

    let rangeFixtures = [];

    if (from && to) {
      let rangeUrl =
        `${fixturesUrl}?team=${encodeURIComponent(
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
    // REQUEST CURRENT STANDINGS
    //
    // THIS IS REQUIRED FOR THE 30% STANDINGS SIGNAL.
    // ==========================================================

    let standingsResponse = {
      ok: false,
      status: 0,
      data: {}
    };

    if (league) {
      standingsResponse =
        await api(
          `${standingsUrl}?league=${encodeURIComponent(
            league
          )}&season=${encodeURIComponent(
            season
          )}`
        );
    }

    const standingsGroups =
      safeArray(
        standingsResponse
          .data?.response
      );

    // ==========================================================
    // FLATTEN STANDINGS
    // ==========================================================

    const standings = [];

    for (
      const group
      of standingsGroups
    ) {
      const leagueStandings =
        safeArray(
          group?.league?.standings
        );

      for (
        const table
        of leagueStandings
      ) {
        for (
          const row
          of safeArray(table)
        ) {
          standings.push(row);
        }
      }
    }

    // ==========================================================
    // FIND THIS TEAM'S STANDING
    // ==========================================================

    const teamStanding =
      standings.find(
        (row) =>
          Number(
            row?.team?.id
          ) ===
          Number(team)
      ) || null;

    // ==========================================================
    // FIND OPPONENT STANDING
    // ==========================================================

    let opponentStanding =
      null;

    if (opponent) {
      opponentStanding =
        standings.find(
          (row) =>
            Number(
              row?.team?.id
            ) ===
            Number(opponent)
        ) || null;
    }

    // ==========================================================
    // DETERMINE TEAM NAME
    // ==========================================================

    let teamName =
      teamStanding
        ?.team
        ?.name ||
      null;

    // ==========================================================
    // LAST FIVE RESPONSE
    // ==========================================================

    const lastFiveResponse =
      await api(lastFiveUrl);

    const lastFiveFixtures =
      safeArray(
        lastFiveResponse
          .data?.response
      );

    // ==========================================================
    // CHOOSE FIXTURE DATASET
    // ==========================================================

    const allFixtures =
      rangeFixtures.length
        ? rangeFixtures
        : lastFiveFixtures;

    // ==========================================================
    // COMPLETED MATCH STATUS
    // ==========================================================

    const completedStatuses =
      new Set([
        "FT",
        "AET",
        "PEN"
      ]);

    const completedFixtures =
      allFixtures
        .filter(
          (fixture) =>
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
      completedFixtures.slice(
        0,
        5
      );

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

        let result = "D";

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
    // BUILD LAST FIVE RESULTS
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

    const points =
      results.reduce(
        (total, item) =>
          total +
          item.points,
        0
      );

    const goalsFor =
      results.reduce(
        (total, item) =>
          total +
          item.goalsFor,
        0
      );

    const goalsAgainst =
      results.reduce(
        (total, item) =>
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
    // Newest = 5
    // 2nd    = 4
    // 3rd    = 3
    // 4th    = 2
    // 5th    = 1
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
            (total, item) =>
              total +
              item.points,
            0
          );

        const venueGF =
          venueResults.reduce(
            (total, item) =>
              total +
              item.goalsFor,
            0
          );

        const venueGA =
          venueResults.reduce(
            (total, item) =>
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
    // Standardized 0-1 team form indicator.
    //
    // Used by predict.js as part of the 45% form signal.
    // ==========================================================

    const calculateFormScore =
      () => {

        if (!results.length) {
          return 0.5;
        }

        const ppgComponent =
          clamp(
            recencyWeightedPPG /
              3,
            0,
            1
          );

        const gdComponent =
          clamp(
            0.5 +
              recencyWeightedGD /
                4,
            0,
            1
          );

        const winComponent =
          clamp(
            wins /
              Math.max(
                totalMatches,
                1
              ),
            0,
            1
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
    // STANDINGS DATA
    // ==========================================================

    const standingsData =
      teamStanding
        ? {
            available: true,

            rank:
              numeric(
                teamStanding.rank
              ),

            points:
              numeric(
                teamStanding.points
              ),

            goalsDiff:
              numeric(
                teamStanding.goalsDiff
              ),

            goalsFor:
              numeric(
                teamStanding.goalsFor
              ),

            goalsAgainst:
              numeric(
                teamStanding.goalsAgainst
              ),

            played:
              numeric(
                teamStanding.all
                  ?.played
              ),

            wins:
              numeric(
                teamStanding.all
                  ?.win
              ),

            draws:
              numeric(
                teamStanding.all
                  ?.draw
              ),

            losses:
              numeric(
                teamStanding.all
                  ?.lose
              ),

            form:
              teamStanding.form ||
              null,

            description:
              teamStanding.description ||
              null,

            home: {
              played:
                numeric(
                  teamStanding.home
                    ?.played
                ),

              wins:
                numeric(
                  teamStanding.home
                    ?.win
                ),

              draws:
                numeric(
                  teamStanding.home
                    ?.draw
                ),

              losses:
                numeric(
                  teamStanding.home
                    ?.lose
                ),

              goalsFor:
                numeric(
                  teamStanding.home
                    ?.goals
                    ?.for
                ),

              goalsAgainst:
                numeric(
                  teamStanding.home
                    ?.goals
                    ?.against
                )
            },

            away: {
              played:
                numeric(
                  teamStanding.away
                    ?.played
                ),

              wins:
                numeric(
                  teamStanding.away
                    ?.win
                ),

              draws:
                numeric(
                  teamStanding.away
                    ?.draw
                ),

              losses:
                numeric(
                  teamStanding.away
                    ?.lose
                ),

              goalsFor:
                numeric(
                  teamStanding.away
                    ?.goals
                    ?.for
                ),

              goalsAgainst:
                numeric(
                  teamStanding.away
                    ?.goals
                    ?.against
                )
            }
          }
        : {
            available: false
          };

    // ==========================================================
    // STANDINGS STRENGTH SCORE
    //
    // This is NOT the final prediction.
    //
    // Higher points / rank / GD / league performance
    // produce a stronger standardized team score.
    // ==========================================================

    const calculateStandingScore =
      () => {

        if (!teamStanding) {
          return 0.5;
        }

        const tableSize =
          standings.length;

        const rank =
          numeric(
            teamStanding.rank
          );

        const points =
          numeric(
            teamStanding.points
          ) || 0;

        const goalsDiff =
          numeric(
            teamStanding.goalsDiff
          ) || 0;

        const played =
          numeric(
            teamStanding.all
              ?.played
          ) || 0;

        // ------------------------------------------------------
        // Rank component
        // ------------------------------------------------------

        let rankScore =
          0.5;

        if (
          rank != null &&
          tableSize > 1
        ) {
          rankScore =
            1 -
            (
              (rank - 1) /
              (tableSize - 1)
            );

          rankScore =
            clamp(
              rankScore,
              0,
              1
            );
        }

        // ------------------------------------------------------
        // Points-per-game component
        // ------------------------------------------------------

        const ppg =
          played > 0
            ? points /
              played
            : 0;

        const ppgScore =
          clamp(
            ppg / 3,
            0,
            1
          );

        // ------------------------------------------------------
        // Goal difference component
        //
        // Converts negative/positive GD into 0-1 range.
        // ------------------------------------------------------

        const gdScore =
          clamp(
            0.5 +
              goalsDiff /
                30,
            0,
            1
          );

        // ------------------------------------------------------
        // Combined standing score
        // ------------------------------------------------------

        return (
          rankScore *
            0.45 +
          ppgScore *
            0.35 +
          gdScore *
            0.20
        );
      };

    const standingScore =
      calculateStandingScore();

    // ==========================================================
    // SEASON HOME / AWAY STRENGTH
    // ==========================================================

    const calculateVenueStrength =
      () => {

        if (!teamStanding) {
          return 0.5;
        }

        const isHomeContext =
          true;

        const venue =
          isHomeContext
            ? teamStanding.home
            : teamStanding.away;

        if (!venue) {
          return 0.5;
        }

        const played =
          numeric(
            venue.played
          ) || 0;

        const wins =
          numeric(
            venue.win
          ) || 0;

        const draws =
          numeric(
            venue.draw
          ) || 0;

        const losses =
          numeric(
            venue.lose
          ) || 0;

        if (!played) {
          return 0.5;
        }

        const points =
          (
            wins * 3 +
            draws
          );

        const ppg =
          points /
          played;

        const winRate =
          wins /
          played;

        const score =
          (
            clamp(
              ppg / 3,
              0,
              1
            ) *
            0.60
          ) +
          (
            clamp(
              winRate,
              0,
              1
            ) *
            0.40
          );

        return clamp(
          score,
          0,
          1
        );
      };

    const seasonVenueStrength =
      calculateVenueStrength();

    // ==========================================================
    // EXPECTED GOALS / GOAL MODEL INPUTS
    // ==========================================================

    const seasonGoalsFor =
      numeric(
        teamStanding
          ?.all
          ?.goals
          ?.for
      );

    const seasonGoalsAgainst =
      numeric(
        teamStanding
          ?.all
          ?.goals
          ?.against
      );

    const seasonPlayed =
      numeric(
        teamStanding
          ?.all
          ?.played
      );

    const seasonGFPerGame =
      seasonPlayed
        ? seasonGoalsFor /
          seasonPlayed
        : null;

    const seasonGAPerGame =
      seasonPlayed
        ? seasonGoalsAgainst /
          seasonPlayed
        : null;

    const expectedGoalsInput = {
      available:
        seasonGFPerGame != null &&
        seasonGAPerGame != null,

      goalsForPerGame:
        seasonGFPerGame,

      goalsAgainstPerGame:
        seasonGAPerGame,

      recentGoalsForPerGame:
        totalMatches
          ? goalsFor /
            totalMatches
          : null,

      recentGoalsAgainstPerGame:
        totalMatches
          ? goalsAgainst /
            totalMatches
          : null
    };

    // ==========================================================
    // H2H
    //
    // We deliberately retrieve only the last 5 meetings.
    // ==========================================================

    let h2hFixtures = [];

    if (opponent) {

      const h2hUrl =
        `${fixturesUrl}/headtohead` +
        `?h2h=${encodeURIComponent(
          team
        )}-${encodeURIComponent(
          opponent
        )}` +
        `&last=5`;

      const h2hResponse =
        await api(h2hUrl);

      h2hFixtures =
        safeArray(
          h2hResponse
            .data?.response
        );
    }

    // ==========================================================
    // H2H RESULT CALCULATION
    // ==========================================================

    const h2hResults = [];

    for (
      const fixture
      of h2hFixtures
    ) {

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
        homeGoals == null ||
        awayGoals == null
      ) {
        continue;
      }

      const teamWasHome =
        Number(homeId) ===
        Number(team);

      const teamGoals =
        teamWasHome
          ? homeGoals
          : awayGoals;

      const opponentGoals =
        teamWasHome
          ? awayGoals
          : homeGoals;

      let result = "D";

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

      h2hResults.push({
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

        opponent:
          teamWasHome
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

        venue:
          teamWasHome
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
      });
    }

    // ==========================================================
    // H2H SUMMARY
    // ==========================================================

    const h2hWins =
      h2hResults.filter(
        (item) =>
          item.result ===
          "W"
      ).length;

    const h2hDraws =
      h2hResults.filter(
        (item) =>
          item.result ===
          "D"
      ).length;

    const h2hLosses =
      h2hResults.filter(
        (item) =>
          item.result ===
          "L"
      ).length;

    const h2hPoints =
      h2hResults.reduce(
        (total, item) =>
          total +
          item.points,
        0
      );

    const h2hFormScore =
      h2hResults.length
        ? h2hPoints /
          (
            h2hResults.length *
            3
          )
        : 0.5;

    // ==========================================================
    // ENGINE INFORMATION
    // ==========================================================

    const intendedWeights = {
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
    };

    // ==========================================================
    // DATA QUALITY
    // ==========================================================

    const dataAvailability = {
      last5:
        results.length > 0,

      standings:
        Boolean(
          teamStanding
        ),

      seasonVenueStrength:
        Boolean(
          teamStanding
        ),

      expectedGoals:
        expectedGoalsInput.available,

      venueForm:
        homeResults.length > 0 ||
        awayResults.length > 0,

      h2h:
        h2hResults.length > 0
    };

    const availableSignals =
      Object.values(
        dataAvailability
      ).filter(Boolean)
        .length;

    const dataCompleteness =
      Math.round(
        (
          availableSignals /
          6
        ) *
        100
      );

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(200).json({

      success: true,

      version:
        "Team Analysis V4.1",

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
            : null,

        opponent:
          opponent
            ? Number(opponent)
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
            recencyWeights.slice(
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
      // CURRENT LEAGUE STANDINGS
      // ========================================================

      standings: {

        available:
          Boolean(
            teamStanding
          ),

        tableSize:
          standings.length,

        team:
          standingsData,

        opponent:
          opponentStanding
            ? {
                id:
                  Number(
                    opponentStanding
                      ?.team
                      ?.id
                  ),

                name:
                  opponentStanding
                    ?.team
                    ?.name ||
                  null,

                rank:
                  numeric(
                    opponentStanding
                      ?.rank
                  ),

                points:
                  numeric(
                    opponentStanding
                      ?.points
                  ),

                goalsDiff:
                  numeric(
                    opponentStanding
                      ?.goalsDiff
                  ),

                form:
                  opponentStanding
                    ?.form ||
                  null
              }
            : null,

        teamScore:
          round(
            standingScore,
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
      // SEASON HOME/AWAY STRENGTH
      // ========================================================

      seasonHomeAwayStrength: {

        available:
          Boolean(
            teamStanding
          ),

        score:
          round(
            seasonVenueStrength,
            4
          ),

        home:
          standingsData.home,

        away:
          standingsData.away
      },

      // ========================================================
      // EXPECTED GOALS / GOAL MODEL
      // ========================================================

      expectedGoals:
        expectedGoalsInput,

      // ========================================================
      // H2H
      // ========================================================

      h2h: {

        available:
          h2hResults.length > 0,

        requested:
          5,

        matches:
          h2hResults.length,

        wins:
          h2hWins,

        draws:
          h2hDraws,

        losses:
          h2hLosses,

        points:
          h2hPoints,

        formScore:
          round(
            h2hFormScore,
            4
          ),

        results:
          h2hResults
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
      // DATA QUALITY
      // ========================================================

      dataAvailability,

      dataCompleteness,

      // ========================================================
      // ENGINE INFORMATION
      // ========================================================

      engine: {

        version:
          "4.1",

        intendedWeights,

        excludedFromPrediction: [
          "injuries",
          "lineups"
        ],

        predictionSource:
          "api/predict.js",

        notes: [
          "Last five matches receive the largest weight.",
          "Most recent matches receive greater recency weight.",
          "Current league standings are explicitly retrieved.",
          "Season venue strength is separated from recent venue form.",
          "H2H is limited to the last five meetings.",
          "Injuries do not affect prediction probabilities.",
          "Lineups do not affect prediction probabilities."
        ]
      }
    });

  } catch (error) {

    console.error(
      "Team Analysis V4.1 error:",
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
