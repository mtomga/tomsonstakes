// /api/web-data.js
// ============================================================
// TOMSONSTAKES WEB DATA ENGINE
// Version 4.0
//
// Purpose:
// - Collect external football evidence
// - Resolve team identities
// - Resolve API-Football team IDs when possible
// - Collect web evidence for:
//      * form
//      * standings
//      * statistics
//      * H2H
//      * injuries
//      * lineups
//      * xG / goal model information
//      * odds when publicly indexed
// - Return structured raw evidence
//
// IMPORTANT:
// - This endpoint DOES NOT make predictions.
// - This endpoint DOES NOT calculate the final score.
// - normalize-web.js converts this payload into structured data.
// - predict.js V4.0 consumes the normalized data.
//
// ENGINE WEIGHTS USED DOWNSTREAM:
//
// Last 5 matches — recency weighted       45%
// Current league standings                30%
// Season home/away strength                5%
// Expected goals / goal model             10%
// Recent home/away venue form               5%
// Last 5 H2H                               5%
// TOTAL                                  100%
// ============================================================

export default async function handler(req, res) {

  const startedAt = Date.now();

  try {

    // ==========================================================
    // REQUEST PARAMETERS
    // ==========================================================

    const {
      home,
      away,
      homeIdentity,
      awayIdentity,
      date
    } = req.query;


    // ==========================================================
    // VALIDATION
    // ==========================================================

    if (!home || !away) {

      return res.status(400).json({
        success: false,
        version: "Web Data V4.0",
        error: "Home and away team names are required."
      });

    }


    if (!date) {

      return res.status(400).json({
        success: false,
        version: "Web Data V4.0",
        error: "Match date is required. Use YYYY-MM-DD."
      });

    }


    // ==========================================================
    // API KEYS
    // ==========================================================

    const apiFootballKey =
      process.env.APIFOOTBALL_KEY || "";

    const serperKey =
      process.env.SERPER_API_KEY || "";


    // ==========================================================
    // HELPERS
    // ==========================================================

    const safeArray = (value) =>
      Array.isArray(value)
        ? value
        : [];


    const cleanString = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();


    const normalizeIdentity = (value) =>
      cleanString(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’']/g, "")
        .replace(/&/g, " AND ")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");


    const parseNumber = (value) => {

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


    const truncate = (
      value,
      max = 1200
    ) => {

      const text =
        cleanString(value);

      if (text.length <= max) {
        return text;
      }

      return text.slice(0, max) + "...";

    };


    // ==========================================================
    // GENERIC FETCH JSON
    // ==========================================================

    const fetchJSON = async (
      url,
      options = {}
    ) => {

      try {

        const response =
          await fetch(
            url,
            {
              ...options
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

          data = {
            raw: truncate(
              text,
              3000
            )
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
          data: {},
          error:
            error?.message ||
            "Request failed."
        };

      }

    };


    // ==========================================================
    // API-FOOTBALL REQUEST
    // ==========================================================

    const apiFootball =
      async (
        endpoint,
        params = {}
      ) => {

        if (!apiFootballKey) {

          return {
            enabled: false,
            ok: false,
            status: 0,
            data: {},
            error:
              "APIFOOTBALL_KEY is not configured."
          };

        }


        const query =
          new URLSearchParams();


        Object.entries(params)
          .forEach(
            ([key, value]) => {

              if (
                value !== undefined &&
                value !== null &&
                value !== ""
              ) {

                query.set(
                  key,
                  String(value)
                );

              }

            }
          );


        const url =
          `https://v3.football.api-sports.io/${endpoint}?${query.toString()}`;


        const result =
          await fetchJSON(
            url,
            {
              headers: {
                "x-apisports-key":
                  apiFootballKey,

                "Accept":
                  "application/json"
              }
            }
          );


        return {
          enabled: true,
          ...result
        };

      };


    // ==========================================================
    // TEAM ID RESOLUTION
    //
    // This is important because predict/analyze require
    // numeric API-Football team IDs.
    // ==========================================================

    const resolveTeam =
      async (teamName) => {

        const response =
          await apiFootball(
            "teams",
            {
              search:
                teamName
            }
          );


        const teams =
          safeArray(
            response
              ?.data
              ?.response
          );


        if (!teams.length) {

          return {
            requestedName:
              teamName,

            resolved:
              false,

            teamId:
              null,

            name:
              null,

            country:
              null,

            logo:
              null,

            candidates: [],

            apiAvailable:
              response.enabled === true,

            error:
              response.error ||
              null
          };

        }


        const normalizedRequested =
          normalizeIdentity(
            teamName
          );


        const scored =
          teams.map(
            item => {

              const candidate =
                item?.team;

              const candidateName =
                candidate?.name ||
                "";

              const candidateIdentity =
                normalizeIdentity(
                  candidateName
                );


              let score = 0;


              if (
                candidateIdentity ===
                normalizedRequested
              ) {

                score += 100;

              }


              if (
                candidateIdentity.includes(
                  normalizedRequested
                )
              ) {

                score += 50;

              }


              if (
                normalizedRequested.includes(
                  candidateIdentity
                )
              ) {

                score += 40;

              }


              const requestedWords =
                normalizedRequested
                  .split("_")
                  .filter(Boolean);


              const candidateWords =
                candidateIdentity
                  .split("_")
                  .filter(Boolean);


              requestedWords.forEach(
                word => {

                  if (
                    candidateWords.includes(
                      word
                    )
                  ) {

                    score += 10;

                  }

                }
              );


              return {
                item,
                score
              };

            }
          )
          .sort(
            (a, b) =>
              b.score -
              a.score
          );


        const best =
          scored[0];


        const bestTeam =
          best?.item?.team ||
          null;


        return {

          requestedName:
            teamName,

          resolved:
            Boolean(
              bestTeam?.id
            ),

          teamId:
            bestTeam?.id
              ? Number(bestTeam.id)
              : null,

          name:
            bestTeam?.name ||
            null,

          country:
            bestTeam?.country ||
            null,

          code:
            bestTeam?.code ||
            null,

          logo:
            bestTeam?.logo ||
            null,

          candidates:
            scored
              .slice(0, 5)
              .map(
                candidate => ({

                  id:
                    candidate
                      ?.item
                      ?.team
                      ?.id ||
                    null,

                  name:
                    candidate
                      ?.item
                      ?.team
                      ?.name ||
                    null,

                  country:
                    candidate
                      ?.item
                      ?.team
                      ?.country ||
                    null,

                  score:
                    candidate.score

                })
              ),

          apiAvailable:
            response.enabled === true

        };

      };


    // ==========================================================
    // SERPER WEB SEARCH
    // ==========================================================

    const webSearch =
      async (
        query,
        category
      ) => {

        if (!serperKey) {

          return {

            enabled: false,

            category,

            query,

            status: 0,

            success: false,

            results: [],

            error:
              "SERPER_API_KEY is not configured."

          };

        }


        const response =
          await fetchJSON(
            "https://google.serper.dev/search",
            {
              method: "POST",

              headers: {
                "X-API-KEY":
                  serperKey,

                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({

                  q:
                    query,

                  gl:
                    "ng",

                  hl:
                    "en",

                  num:
                    10

                })

            }
          );


        const organic =
          safeArray(
            response
              ?.data
              ?.organic
          );


        const knowledgeGraph =
          response
            ?.data
            ?.knowledgeGraph ||
          null;


        const results =
          organic.map(
            item => ({

              title:
                truncate(
                  item?.title ||
                  "",
                  300
                ),

              link:
                item?.link ||
                "",

              snippet:
                truncate(
                  item?.snippet ||
                  "",
                  1000
                ),

              date:
                item?.date ||
                null

            })
          );


        return {

          enabled: true,

          category,

          query,

          status:
            response.status,

          success:
            response.ok,

          results,

          knowledgeGraph,

          error:
            response.ok
              ? null
              : (
                  response
                    ?.data
                    ?.message ||
                  response
                    ?.data
                    ?.error ||
                  response.error ||
                  "Search request failed."
                )

        };

      };


    // ==========================================================
    // RESOLVE TEAM IDENTITIES
    // ==========================================================

    const homeTeam =
      await resolveTeam(
        home
      );


    const awayTeam =
      await resolveTeam(
        away
      );


    // ==========================================================
    // SEARCH QUERIES
    //
    // These are intentionally separated by signal.
    // normalize-web.js can later decide whether evidence
    // supports the signal.
    // ==========================================================

    const homeSearchName =
      homeTeam.name ||
      home;


    const awaySearchName =
      awayTeam.name ||
      away;


    const matchPhrase =
      `"${homeSearchName}" vs "${awaySearchName}"`;


    const searches = {};


    // ==========================================================
    // FORM
    // ==========================================================

    searches.form =
      await webSearch(
        `${matchPhrase} recent form last 5 matches ${date}`,
        "form"
      );


    // ==========================================================
    // STANDINGS
    // ==========================================================

    searches.standings =
      await webSearch(
        `${matchPhrase} league standings table ${date}`,
        "standings"
      );


    // ==========================================================
    // HOME / AWAY STRENGTH
    // ==========================================================

    searches.homeAway =
      await webSearch(
        `${homeSearchName} home record ${date} football`,
        "homeAway"
      );


    searches.awayStrength =
      await webSearch(
        `${awaySearchName} away record ${date} football`,
        "awayStrength"
      );


    // ==========================================================
    // EXPECTED GOALS / GOAL MODEL
    // ==========================================================

    searches.xg =
      await webSearch(
        `${matchPhrase} xG expected goals statistics ${date}`,
        "xg"
      );


    searches.goals =
      await webSearch(
        `${matchPhrase} goals statistics over under BTTS ${date}`,
        "goals"
      );


    // ==========================================================
    // RECENT VENUE FORM
    // ==========================================================

    searches.venue =
      await webSearch(
        `${homeSearchName} home form last 5 ${date}`,
        "venue"
      );


    searches.awayVenue =
      await webSearch(
        `${awaySearchName} away form last 5 ${date}`,
        "awayVenue"
      );


    // ==========================================================
    // H2H
    // ==========================================================

    searches.h2h =
      await webSearch(
        `${matchPhrase} head to head H2H last 5`,
        "h2h"
      );


    // ==========================================================
    // INJURIES
    // ==========================================================

    searches.injuries =
      await webSearch(
        `${matchPhrase} injuries suspended players ${date}`,
        "injuries"
      );


    // ==========================================================
    // LINEUPS
    // ==========================================================

    searches.lineups =
      await webSearch(
        `${matchPhrase} predicted lineups team news ${date}`,
        "lineups"
      );


    // ==========================================================
    // ODDS
    // ==========================================================

    searches.odds =
      await webSearch(
        `${matchPhrase} odds 1X2 over under ${date}`,
        "odds"
      );


    // ==========================================================
    // API-FOOTBALL DIRECT DATA
    //
    // These requests are optional.
    // If the API plan/season does not provide something,
    // the endpoint still returns successfully.
    // ==========================================================

    const apiData = {

      homeTeam: null,

      awayTeam: null,

      homeLastFive: null,

      awayLastFive: null,

      homeH2H: null,

      awayH2H: null

    };


    // ==========================================================
    // TEAM DETAILS
    // ==========================================================

    if (
      homeTeam.teamId
    ) {

      apiData.homeTeam =
        await apiFootball(
          "teams",
          {
            id:
              homeTeam.teamId
          }
        );

    }


    if (
      awayTeam.teamId
    ) {

      apiData.awayTeam =
        await apiFootball(
          "teams",
          {
            id:
              awayTeam.teamId
          }
        );

    }


    // ==========================================================
    // LAST FIVE HOME TEAM
    // ==========================================================

    if (
      homeTeam.teamId
    ) {

      apiData.homeLastFive =
        await apiFootball(
          "fixtures",
          {
            team:
              homeTeam.teamId,

            last:
              5
          }
        );

    }


    // ==========================================================
    // LAST FIVE AWAY TEAM
    // ==========================================================

    if (
      awayTeam.teamId
    ) {

      apiData.awayLastFive =
        await apiFootball(
          "fixtures",
          {
            team:
              awayTeam.teamId,

            last:
              5
          }
        );

    }


    // ==========================================================
    // H2H
    // ==========================================================

    if (
      homeTeam.teamId &&
      awayTeam.teamId
    ) {

      apiData.homeH2H =
        await apiFootball(
          "fixtures/headtohead",
          {
            h2h:
              `${homeTeam.teamId}-${awayTeam.teamId}`,

            last:
              5
          }
        );

    }


    // ==========================================================
    // SEARCH SUMMARY
    // ==========================================================

    const searchCategories =
      Object.keys(
        searches
      );


    const successfulSearches =
      searchCategories.filter(
        category =>
          searches[
            category
          ]?.success === true
      );


    const failedSearches =
      searchCategories.filter(
        category =>
          searches[
            category
          ]?.success !== true
      );


    // ==========================================================
    // RAW EVIDENCE COUNTS
    // ==========================================================

    const evidenceCounts = {};


    searchCategories.forEach(
      category => {

        evidenceCounts[
          category
        ] =
          safeArray(
            searches[
              category
            ]?.results
          ).length;

      }
    );


    // ==========================================================
    // TEAM ID WARNING
    // ==========================================================

    const identityWarnings = [];


    if (
      !homeTeam.resolved
    ) {

      identityWarnings.push(
        `Unable to reliably resolve API-Football ID for ${home}.`
      );

    }


    if (
      !awayTeam.resolved
    ) {

      identityWarnings.push(
        `Unable to reliably resolve API-Football ID for ${away}.`
      );

    }


    if (
      homeTeam.resolved &&
      awayTeam.resolved &&
      Number(homeTeam.teamId) ===
      Number(awayTeam.teamId)
    ) {

      identityWarnings.push(
        "Home and away teams resolved to the same team ID."
      );

    }


    // ==========================================================
    // ENGINE SIGNAL MAP
    //
    // This tells normalize-web.js and predict.js exactly
    // which evidence belongs to which prediction signal.
    // ==========================================================

    const signalMap = {

      last5RecencyWeighted: {

        weight:
          0.45,

        sources: [
          "api.homeLastFive",
          "api.awayLastFive",
          "searches.form"
        ]

      },

      leagueStandings: {

        weight:
          0.30,

        sources: [
          "searches.standings"
        ]

      },

      seasonHomeAwayStrength: {

        weight:
          0.05,

        sources: [
          "searches.homeAway",
          "searches.awayStrength"
        ]

      },

      expectedGoals: {

        weight:
          0.10,

        sources: [
          "searches.xg",
          "searches.goals"
        ]

      },

      recentVenueForm: {

        weight:
          0.05,

        sources: [
          "searches.venue",
          "searches.awayVenue"
        ]

      },

      last5H2H: {

        weight:
          0.05,

        sources: [
          "api.homeH2H",
          "searches.h2h"
        ]

      }

    };


    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(200).json({

      success: true,

      version:
        "Web Data V4.0",

      searchedAt:
        new Date()
          .toISOString(),

      durationMs:
        Date.now() -
        startedAt,


      // ========================================================
      // MATCH
      // ========================================================

      match: {

        home:
          home,

        homeIdentity:
          homeIdentity ||
          normalizeIdentity(home),

        away:
          away,

        awayIdentity:
          awayIdentity ||
          normalizeIdentity(away),

        date:
          date

      },


      // ========================================================
      // RESOLVED TEAMS
      // ========================================================

      teams: {

        home:
          homeTeam,

        away:
          awayTeam

      },


      // ========================================================
      // API DATA
      // ========================================================

      api: {

        provider:
          "API-Football",

        available:
          Boolean(apiFootballKey),

        homeTeam:
          apiData.homeTeam,

        awayTeam:
          apiData.awayTeam,

        homeLastFive:
          apiData.homeLastFive,

        awayLastFive:
          apiData.awayLastFive,

        h2h:
          apiData.homeH2H

      },


      // ========================================================
      // WEB SEARCH DATA
      // ========================================================

      searches,


      // ========================================================
      // EVIDENCE
      // ========================================================

      evidence: {

        categories:
          searchCategories,

        successfulSearches:
          successfulSearches.length,

        failedSearches:
          failedSearches.length,

        totalSearchResults:
          Object.values(
            evidenceCounts
          ).reduce(
            (
              total,
              count
            ) =>
              total + count,
            0
          ),

        counts:
          evidenceCounts

      },


      // ========================================================
      // SIGNAL MAP
      // ========================================================

      signalMap,


      // ========================================================
      // WARNINGS
      // ========================================================

      warnings:
        identityWarnings,


      // ========================================================
      // DOWNSTREAM STATUS
      // ========================================================

      downstream: {

        normalizationRequired:
          true,

        predictionReady:
          false,

        predictionEndpoint:
          "/api/predict",

        normalizationEndpoint:
          "/api/normalize-web"

      },


      // ========================================================
      // ENGINE RULES
      // ========================================================

      engine: {

        version:
          "Prediction Engine V4.0",

        weights: {

          last5RecencyWeighted:
            45,

          leagueStandings:
            30,

          seasonHomeAwayStrength:
            5,

          expectedGoals:
            10,

          recentVenueForm:
            5,

          last5H2H:
            5

        },

        totalWeight:
          100,

        excludedFromCoreScore: [
          "injuries",
          "lineups",
          "odds"
        ],

        note:
          "Injuries, lineups and odds are collected as contextual evidence but are not part of the six-signal 100% core score."

      }

    });


  } catch (error) {

    console.error(
      "Web Data V4.0 error:",
      error
    );


    return res.status(500).json({

      success: false,

      version:
        "Web Data V4.0",

      error:
        "Unable to collect football web data.",

      details:
        error?.message ||
        "Unknown server error."

    });

  }

}
