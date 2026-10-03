// /api/normalize-web.js
// ============================================================
// TOMSONSTAKES WEB DATA NORMALIZER
// Version 4.0
//
// Purpose:
// - Normalize /api/web-data V4.0
// - Preserve API-Football data
// - Normalize web-search evidence
// - Extract usable numeric signals
// - Prepare clean data for /api/predict.js V4.0
//
// MODEL SIGNALS:
//
// 45% - Last 5 matches, recency weighted
// 30% - Current league standings
//  5% - Season home/away strength
// 10% - Expected goals / goal model
//  5% - Recent home/away venue form
//  5% - Last 5 H2H
//
// EXCLUDED:
// - Injuries
// - Lineups
//
// This endpoint DOES NOT make predictions.
// ============================================================

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "POST method required."
      });
    }

    const body = req.body || {};

    const match = body.match || {};

    const home =
      match.home ||
      body.home ||
      body.homeTeam ||
      "";

    const away =
      match.away ||
      body.away ||
      body.awayTeam ||
      "";

    const date =
      match.date ||
      body.date ||
      null;

    if (!home || !away) {
      return res.status(400).json({
        success: false,
        version: "Web Normalizer V4.0",
        error: "Home and away team names are required."
      });
    }

    // ========================================================
    // HELPERS
    // ========================================================

    const safeArray = value =>
      Array.isArray(value) ? value : [];

    const safeObject = value =>
      value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};

    const cleanText = value => {
      if (value === null || value === undefined) return "";

      return String(value)
        .replace(/\s+/g, " ")
        .trim();
    };

    const numeric = value => {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return null;
      }

      if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
      }

      const text = String(value)
        .replace(/,/g, "")
        .replace(/%/g, "")
        .trim();

      const number = Number(text);

      return Number.isFinite(number)
        ? number
        : null;
    };

    const clamp = (value, min, max) => {
      if (!Number.isFinite(value)) return null;

      return Math.max(min, Math.min(max, value));
    };

    const round = (value, decimals = 4) => {
      if (!Number.isFinite(value)) return null;

      const factor = Math.pow(10, decimals);

      return Math.round(value * factor) / factor;
    };

    const normalizeName = value => {
      return cleanText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const containsTeam = (text, team) => {
      const a = normalizeName(text);
      const b = normalizeName(team);

      if (!a || !b) return false;

      return (
        a === b ||
        a.includes(b) ||
        b.includes(a)
      );
    };

    const parsePercent = value => {
      const number = numeric(value);

      if (number === null) return null;

      if (number > 1) {
        return clamp(number / 100, 0, 1);
      }

      return clamp(number, 0, 1);
    };

    const parseProbability = value => {
      const number = numeric(value);

      if (number === null) return null;

      if (number > 1) {
        return clamp(number / 100, 0, 1);
      }

      return clamp(number, 0, 1);
    };

    // ========================================================
    // SOURCE DATA
    // ========================================================

    const apiFootball =
      safeObject(body.apiFootball);

    const web =
      safeObject(body.web);

    const searches =
      safeObject(body.searches);

    // ========================================================
    // TEAM IDENTITIES
    // ========================================================

    const homeTeamId =
      numeric(
        match.homeTeamId ||
        body.homeTeamId ||
        apiFootball?.teamResolution?.home?.id ||
        apiFootball?.match?.homeTeamId
      );

    const awayTeamId =
      numeric(
        match.awayTeamId ||
        body.awayTeamId ||
        apiFootball?.teamResolution?.away?.id ||
        apiFootball?.match?.awayTeamId
      );

    const fixtureId =
      numeric(
        match.fixtureId ||
        body.fixtureId ||
        apiFootball?.fixture?.id ||
        apiFootball?.match?.fixtureId
      );

    const leagueId =
      numeric(
        match.leagueId ||
        body.leagueId ||
        apiFootball?.fixture?.league?.id ||
        apiFootball?.match?.leagueId
      );

    const season =
      numeric(
        match.season ||
        body.season ||
        apiFootball?.fixture?.league?.season ||
        apiFootball?.match?.season
      );

    const leagueName =
      cleanText(
        match.leagueName ||
        body.leagueName ||
        apiFootball?.fixture?.league?.name ||
        apiFootball?.match?.leagueName
      ) || null;

    const country =
      cleanText(
        match.country ||
        body.country ||
        apiFootball?.fixture?.league?.country ||
        apiFootball?.match?.country
      ) || null;

    const round =
      cleanText(
        match.round ||
        body.round ||
        apiFootball?.fixture?.league?.round ||
        apiFootball?.match?.round
      ) || null;

    // ========================================================
    // FIXTURE NORMALIZATION
    // ========================================================

    const fixtureSource =
      safeObject(apiFootball.fixture);

    const normalizedFixture = {
      id: fixtureId,
      date:
        fixtureSource.date ||
        match.kickoff ||
        null,

      timestamp:
        numeric(fixtureSource.timestamp) ||
        null,

      timezone:
        fixtureSource.timezone ||
        null,

      venue:
        safeObject(fixtureSource.venue),

      status:
        safeObject(fixtureSource.status),

      league: {
        id: leagueId,
        name: leagueName,
        country,
        season,
        round
      }
    };

    // ========================================================
    // STANDINGS
    // ========================================================

    const standingsSource =
      safeObject(apiFootball.standings);

    const flattenStandings = source => {
      const rows = [];

      if (Array.isArray(source)) {
        for (const group of source) {
          if (Array.isArray(group)) {
            rows.push(...group);
          } else if (group && typeof group === "object") {
            rows.push(group);
          }
        }
      }

      return rows;
    };

    let standingsTable =
      flattenStandings(
        standingsSource.table
      );

    if (!standingsTable.length) {
      standingsTable =
        flattenStandings(
          standingsSource.standings
        );
    }

    if (!standingsTable.length) {
      const leagueStandings =
        apiFootball?.standings?.league?.standings;

      standingsTable =
        flattenStandings(leagueStandings);
    }

    const findStanding = teamName => {
      if (!teamName) return null;

      return (
        standingsTable.find(row => {
          const rowName =
            row?.team?.name ||
            row?.name ||
            "";

          return normalizeName(rowName) ===
            normalizeName(teamName);
        }) ||
        standingsTable.find(row => {
          const rowName =
            row?.team?.name ||
            row?.name ||
            "";

          return containsTeam(rowName, teamName);
        }) ||
        null
      );
    };

    const normalizeStandingRow = row => {
      if (!row) return null;

      const all =
        safeObject(row.all);

      const homeRecord =
        safeObject(row.home);

      const awayRecord =
        safeObject(row.away);

      return {
        rank: numeric(row.rank),

        team: {
          id: numeric(row?.team?.id),
          name:
            row?.team?.name ||
            row?.name ||
            null
        },

        points: numeric(row.points),

        goalsDiff:
          numeric(row.goalsDiff),

        form:
          cleanText(row.form) || null,

        status:
          row.status || null,

        description:
          row.description || null,

        group:
          row.group || null,

        all: {
          played: numeric(all.played),
          win: numeric(all.win),
          draw: numeric(all.draw),
          lose: numeric(all.lose),
          goals: {
            for: numeric(all?.goals?.for),
            against: numeric(all?.goals?.against)
          }
        },

        home: {
          played: numeric(homeRecord.played),
          win: numeric(homeRecord.win),
          draw: numeric(homeRecord.draw),
          lose: numeric(homeRecord.lose),
          goals: {
            for: numeric(homeRecord?.goals?.for),
            against: numeric(homeRecord?.goals?.against)
          }
        },

        away: {
          played: numeric(awayRecord.played),
          win: numeric(awayRecord.win),
          draw: numeric(awayRecord.draw),
          lose: numeric(awayRecord.lose),
          goals: {
            for: numeric(awayRecord?.goals?.for),
            against: numeric(awayRecord?.goals?.against)
          }
        }
      };
    };

    const homeStanding =
      normalizeStandingRow(
        findStanding(home)
      );

    const awayStanding =
      normalizeStandingRow(
        findStanding(away)
      );

    // ========================================================
    // SEASON TEAM STATISTICS
    // ========================================================

    const seasonStatsSource =
      safeObject(apiFootball.seasonStats);

    const getTeamStats = teamSide => {
      const source =
        safeObject(
          seasonStatsSource?.[teamSide]
        );

      // Some versions may return:
      // { response: {...} }

      const response =
        source?.response ||
        source;

      return safeObject(response);
    };

    const homeSeasonStats =
      getTeamStats("home");

    const awaySeasonStats =
      getTeamStats("away");

    // ========================================================
    // GOAL / EXPECTED GOAL MODEL
    // ========================================================

    const extractGoalAverage = (
      stats,
      venue,
      type
    ) => {
      const goals =
        safeObject(stats?.goals);

      const venueData =
        safeObject(goals?.[venue]);

      const average =
        venueData?.average;

      if (typeof average === "object") {
        return numeric(
          average?.[type]
        );
      }

      return numeric(average);
    };

    const homeVenue =
      "home";

    const awayVenue =
      "away";

    const homeGoalsFor =
      extractGoalAverage(
        homeSeasonStats,
        homeVenue,
        "for"
      );

    const homeGoalsAgainst =
      extractGoalAverage(
        homeSeasonStats,
        homeVenue,
        "against"
      );

    const awayGoalsFor =
      extractGoalAverage(
        awaySeasonStats,
        awayVenue,
        "for"
      );

    const awayGoalsAgainst =
      extractGoalAverage(
        awaySeasonStats,
        awayVenue,
        "against"
      );

    let expectedHomeGoals = null;
    let expectedAwayGoals = null;

    if (
      homeGoalsFor !== null &&
      awayGoalsAgainst !== null
    ) {
      expectedHomeGoals =
        (
          homeGoalsFor +
          awayGoalsAgainst
        ) / 2;
    }

    if (
      awayGoalsFor !== null &&
      homeGoalsAgainst !== null
    ) {
      expectedAwayGoals =
        (
          awayGoalsFor +
          homeGoalsAgainst
        ) / 2;
    }

    // ========================================================
    // H2H NORMALIZATION
    // ========================================================

    const h2hSource =
      apiFootball.h2h ||
      web.h2h ||
      searches.h2h ||
      {};

    let h2hRaw = [];

    if (Array.isArray(h2hSource)) {
      h2hRaw = h2hSource;
    } else if (
      Array.isArray(h2hSource?.results)
    ) {
      h2hRaw = h2hSource.results;
    } else if (
      Array.isArray(h2hSource?.response)
    ) {
      h2hRaw = h2hSource.response;
    }

    const completedStatuses =
      new Set([
        "FT",
        "AET",
        "PEN",
        "finished",
        "completed"
      ]);

    const normalizeH2H = fixture => {
      if (!fixture) return null;

      // API-Football format
      if (fixture.teams) {
        const homeGoals =
          numeric(fixture?.goals?.home);

        const awayGoals =
          numeric(fixture?.goals?.away);

        if (
          homeGoals === null ||
          awayGoals === null
        ) {
          return null;
        }

        const homeName =
          fixture?.teams?.home?.name ||
          null;

        const awayName =
          fixture?.teams?.away?.name ||
          null;

        let result = "DRAW";

        if (homeGoals > awayGoals) {
          result = "HOME_WIN";
        } else if (awayGoals > homeGoals) {
          result = "AWAY_WIN";
        }

        return {
          fixtureId:
            numeric(fixture?.fixture?.id),

          date:
            fixture?.fixture?.date ||
            null,

          home:
            homeName,

          away:
            awayName,

          homeTeamId:
            numeric(fixture?.teams?.home?.id),

          awayTeamId:
            numeric(fixture?.teams?.away?.id),

          homeGoals,
          awayGoals,

          result
        };
      }

      // Generic web-search result
      return {
        title:
          cleanText(
            fixture.title
          ) || null,

        snippet:
          cleanText(
            fixture.snippet
          ) || null,

        link:
          cleanText(
            fixture.link
          ) || null
      };
    };

    const normalizedH2H =
      h2hRaw
        .map(normalizeH2H)
        .filter(Boolean)
        .slice(0, 5);

    // ========================================================
    // H2H TEAM-SPECIFIC SUMMARY
    // ========================================================

    let h2hHomeWins = 0;
    let h2hDraws = 0;
    let h2hAwayWins = 0;

    let h2hHomeGoals = 0;
    let h2hAwayGoals = 0;

    for (const item of normalizedH2H) {
      if (
        item.homeTeamId !== null &&
        item.awayTeamId !== null
      ) {
        const apiHomeIsRequestedHome =
          Number(item.homeTeamId) ===
          Number(homeTeamId);

        const apiAwayIsRequestedHome =
          Number(item.awayTeamId) ===
          Number(homeTeamId);

        if (item.result === "DRAW") {
          h2hDraws++;
        }

        if (
          item.result === "HOME_WIN"
        ) {
          if (apiHomeIsRequestedHome) {
            h2hHomeWins++;
          } else {
            h2hAwayWins++;
          }
        }

        if (
          item.result === "AWAY_WIN"
        ) {
          if (apiAwayIsRequestedHome) {
            h2hHomeWins++;
          } else {
            h2hAwayWins++;
          }
        }

        if (
          Number.isFinite(item.homeGoals)
        ) {
          if (apiHomeIsRequestedHome) {
            h2hHomeGoals +=
              item.homeGoals;
          } else {
            h2hAwayGoals +=
              item.homeGoals;
          }
        }

        if (
          Number.isFinite(item.awayGoals)
        ) {
          if (apiAwayIsRequestedHome) {
            h2hHomeGoals +=
              item.awayGoals;
          } else {
            h2hAwayGoals +=
              item.awayGoals;
          }
        }
      }
    }

    const h2hCount =
      normalizedH2H.filter(
        item =>
          item.homeTeamId !== null &&
          item.awayTeamId !== null
      ).length;

    // ========================================================
    // WEB SEARCH NORMALIZATION
    // ========================================================

    const normalizeSearchResults = source => {
      let results = [];

      if (Array.isArray(source)) {
        results = source;
      } else if (
        Array.isArray(source?.results)
      ) {
        results = source.results;
      } else if (
        Array.isArray(source?.organic)
      ) {
        results = source.organic;
      }

      return results
        .map(item => ({
          title:
            cleanText(
              item?.title ||
              item?.name
            ),

          link:
            cleanText(
              item?.link ||
              item?.url
            ),

          snippet:
            cleanText(
              item?.snippet ||
              item?.description
            ),

          date:
            cleanText(
              item?.date
            ) || null
        }))
        .filter(item =>
          item.title ||
          item.snippet
        )
        .slice(0, 8);
    };

    const normalizeSearchCategory = (
      source
    ) => {
      const results =
        normalizeSearchResults(source);

      return {
        available: results.length > 0,
        count: results.length,
        results
      };
    };

    const normalizedWeb = {
      form:
        normalizeSearchCategory(
          web.form ||
          searches.form
        ),

      h2h:
        normalizeSearchCategory(
          web.h2h ||
          searches.h2h
        ),

      stats:
        normalizeSearchCategory(
          web.stats ||
          searches.stats
        ),

      xg:
        normalizeSearchCategory(
          web.xg ||
          searches.xg
        )
    };

    // ========================================================
    // EXTRACT WEB XG NUMBERS
    // ========================================================

    const extractNumbersFromText = text => {
      if (!text) return [];

      const matches =
        String(text).match(
          /\b\d+(?:\.\d+)?\b/g
        );

      return matches
        ? matches
            .map(Number)
            .filter(
              number =>
                Number.isFinite(number) &&
                number >= 0 &&
                number <= 10
            )
        : [];
    };

    const xgEvidence = [];

    for (
      const item of normalizedWeb.xg.results
    ) {
      const text =
        `${item.title} ${item.snippet}`;

      const numbers =
        extractNumbersFromText(text);

      if (numbers.length) {
        xgEvidence.push({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          numbers
        });
      }
    }

    // ========================================================
    // RECENT FORM EVIDENCE
    // ========================================================

    const formEvidence =
      normalizedWeb.form.results.map(
        item => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet
        })
      );

    // ========================================================
    // STATS EVIDENCE
    // ========================================================

    const statsEvidence =
      normalizedWeb.stats.results.map(
        item => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet
        })
      );

    // ========================================================
    // NORMALIZED SIGNALS
    // ========================================================

    const standingsSignal = {
      available:
        !!homeStanding ||
        !!awayStanding,

      home: homeStanding,
      away: awayStanding,

      tableSize:
        standingsTable.length,

      homeRank:
        numeric(homeStanding?.rank),

      awayRank:
        numeric(awayStanding?.rank),

      homePoints:
        numeric(homeStanding?.points),

      awayPoints:
        numeric(awayStanding?.points),

      rankDifference:
        (
          numeric(homeStanding?.rank) !== null &&
          numeric(awayStanding?.rank) !== null
        )
          ? numeric(awayStanding.rank) -
            numeric(homeStanding.rank)
          : null
    };

    const seasonHomeAwaySignal = {
      available:
        !!homeStanding ||
        !!awayStanding ||
        !!homeSeasonStats ||
        !!awaySeasonStats,

      home: {
        standing:
          homeStanding?.home || null,

        seasonStats:
          homeSeasonStats || null
      },

      away: {
        standing:
          awayStanding?.away || null,

        seasonStats:
          awaySeasonStats || null
      }
    };

    const expectedGoalsSignal = {
      available:
        expectedHomeGoals !== null ||
        expectedAwayGoals !== null,

      home:
        round(expectedHomeGoals, 3),

      away:
        round(expectedAwayGoals, 3),

      total:
        (
          expectedHomeGoals !== null &&
          expectedAwayGoals !== null
        )
          ? round(
              expectedHomeGoals +
              expectedAwayGoals,
              3
            )
          : null,

      source:
        (
          expectedHomeGoals !== null ||
          expectedAwayGoals !== null
        )
          ? "API-Football season goal averages"
          : null,

      webEvidence:
        xgEvidence
    };

    const h2hSignal = {
      available:
        h2hCount > 0,

      count:
        h2hCount,

      matches:
        normalizedH2H,

      homeWins:
        h2hHomeWins,

      draws:
        h2hDraws,

      awayWins:
        h2hAwayWins,

      homeGoals:
        h2hHomeGoals,

      awayGoals:
        h2hAwayGoals,

      homeWinRate:
        h2hCount
          ? round(
              h2hHomeWins /
              h2hCount,
              3
            )
          : null,

      drawRate:
        h2hCount
          ? round(
              h2hDraws /
              h2hCount,
              3
            )
          : null,

      awayWinRate:
        h2hCount
          ? round(
              h2hAwayWins /
              h2hCount,
              3
            )
          : null
    };

    // ========================================================
    // DATA QUALITY
    // ========================================================

    const availability = {
      fixture:
        fixtureId !== null,

      teamIds:
        homeTeamId !== null &&
        awayTeamId !== null,

      standings:
        standingsSignal.available,

      seasonHomeAway:
        seasonHomeAwaySignal.available,

      expectedGoals:
        expectedGoalsSignal.available,

      h2h:
        h2hSignal.available,

      webForm:
        normalizedWeb.form.available,

      webStats:
        normalizedWeb.stats.available,

      webXg:
        normalizedWeb.xg.available
    };

    const availableSignals =
      Object.values(
        availability
      ).filter(Boolean).length;

    const totalSignals =
      Object.keys(
        availability
      ).length;

    const coverage =
      totalSignals
        ? round(
            availableSignals /
            totalSignals,
            3
          )
        : 0;

    // ========================================================
    // FINAL NORMALIZED PAYLOAD
    // ========================================================

    return res.status(200).json({
      success: true,

      version:
        "Web Normalizer V4.0",

      normalizedAt:
        new Date().toISOString(),

      match: {
        home,
        away,
        date,

        homeIdentity:
          match.homeIdentity ||
          body.homeIdentity ||
          null,

        awayIdentity:
          match.awayIdentity ||
          body.awayIdentity ||
          null,

        homeTeamId,
        awayTeamId,

        fixtureId,
        leagueId,
        leagueName,
        country,
        round,
        season,

        kickoff:
          normalizedFixture.date
      },

      fixture:
        normalizedFixture,

      teams: {
        home: {
          id: homeTeamId,
          name: home
        },

        away: {
          id: awayTeamId,
          name: away
        }
      },

      standings:
        standingsSignal,

      seasonHomeAway:
        seasonHomeAwaySignal,

      expectedGoals:
        expectedGoalsSignal,

      h2h:
        h2hSignal,

      web: {
        form:
          normalizedWeb.form,

        h2h:
          normalizedWeb.h2h,

        stats:
          normalizedWeb.stats,

        xg:
          normalizedWeb.xg
      },

      evidence: {
        form:
          formEvidence,

        stats:
          statsEvidence,

        xg:
          xgEvidence
      },

      availability,

      dataQuality: {
        availableSignals,
        totalSignals,
        coverage,
        coveragePercent:
          round(
            coverage * 100,
            1
          )
      },

      // ======================================================
      // PREDICTION CONTRACT
      // ======================================================

      predictionInputs: {
        last5RecencyWeighted: {
          weight: 0.45,
          source:
            "api/analyze.js"
        },

        leagueStandings: {
          weight: 0.30,
          source:
            "API-Football standings"
        },

        seasonHomeAwayStrength: {
          weight: 0.05,
          source:
            "standings + team season statistics"
        },

        expectedGoals: {
          weight: 0.10,
          source:
            "season goal averages + web xG evidence"
        },

        recentVenueForm: {
          weight: 0.05,
          source:
            "api/analyze.js"
        },

        last5H2H: {
          weight: 0.05,
          source:
            "API-Football H2H"
        }
      },

      excludedFromPrediction: [
        "injuries",
        "lineups"
      ],

      warnings: [
        ...(homeTeamId === null ||
        awayTeamId === null
          ? [
              "API-Football team IDs were not resolved."
            ]
          : []),

        ...(!standingsSignal.available
          ? [
              "League standings unavailable."
            ]
          : []),

        ...(!expectedGoalsSignal.available
          ? [
              "Expected-goals/goal-average data unavailable."
            ]
          : []),

        ...(!h2hSignal.available
          ? [
              "H2H data unavailable."
            ]
          : [])
      ]
    });

  } catch (error) {
    console.error(
      "TomsonStakes Normalize V4.0 error:",
      error
    );

    return res.status(500).json({
      success: false,
      version:
        "Web Normalizer V4.0",
      error:
        "Unable to normalize web data.",
      details:
        error?.message ||
        "Unknown server error."
    });
  }
}
