// /api/fixtures.js
// ============================================================
// TOMSONSTAKES FIXTURE DISCOVERY ENGINE
// Version 4.0
//
// Purpose:
// - Retrieve fixtures for a specific date
// - Normalize API-Football fixture data
// - Provide reliable home/away team IDs
// - Provide league and season information
// - Provide fixture IDs for api/predict.js V4.0
//
// IMPORTANT:
// - This endpoint does NOT make predictions.
// - This endpoint does NOT calculate probabilities.
// - This endpoint does NOT use injuries.
// - This endpoint does NOT use lineups.
// - It is a clean fixture-discovery layer.
// ============================================================

export default async function handler(req, res) {
  try {
    // ==========================================================
    // METHOD
    // ==========================================================

    if (req.method !== "GET") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed. Use GET."
      });
    }

    // ==========================================================
    // REQUEST
    // ==========================================================

    const {
      date,
      league,
      season,
      timezone
    } = req.query;

    // ==========================================================
    // VALIDATION
    // ==========================================================

    if (!date) {
      return res.status(400).json({
        success: false,
        error:
          "Date is required. Use YYYY-MM-DD."
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
    // API-FOOTBALL URL
    // ==========================================================

    let url =
      "https://v3.football.api-sports.io/fixtures";

    const params =
      new URLSearchParams();

    params.set(
      "date",
      String(date)
    );

    // ==========================================================
    // TIMEZONE
    //
    // Nigeria/WAT is the default because the frontend is
    // designed around Nigerian kickoff times.
    // ==========================================================

    params.set(
      "timezone",
      timezone ||
        "Africa/Lagos"
    );

    // ==========================================================
    // OPTIONAL LEAGUE
    // ==========================================================

    if (league) {
      params.set(
        "league",
        String(league)
      );
    }

    // ==========================================================
    // OPTIONAL SEASON
    // ==========================================================

    if (season) {
      params.set(
        "season",
        String(season)
      );
    }

    url +=
      `?${params.toString()}`;

    // ==========================================================
    // FETCH API-FOOTBALL
    // ==========================================================

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

    // ==========================================================
    // READ RESPONSE
    // ==========================================================

    const data =
      await response
        .json()
        .catch(() => ({}));

    // ==========================================================
    // API ERROR
    // ==========================================================

    if (!response.ok) {
      return res.status(
        response.status
      ).json({
        success: false,

        error:
          "API-Football fixture request failed.",

        apiStatus:
          response.status,

        response: data
      });
    }

    // ==========================================================
    // RAW FIXTURES
    // ==========================================================

    const rawFixtures =
      Array.isArray(
        data?.response
      )
        ? data.response
        : [];

    // ==========================================================
    // HELPERS
    // ==========================================================

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

      const number =
        Number(value);

      return Number.isFinite(
        number
      )
        ? number
        : null;
    };

    const safeString = (
      value
    ) => {
      if (
        value === null ||
        value === undefined
      ) {
        return null;
      }

      return String(value);
    };

    // ==========================================================
    // NORMALIZE FIXTURES
    // ==========================================================

    const fixtures =
      rawFixtures
        .map(
          (fixture) => {

            const fixtureId =
              numeric(
                fixture
                  ?.fixture
                  ?.id
              );

            const homeId =
              numeric(
                fixture
                  ?.teams
                  ?.home
                  ?.id
              );

            const awayId =
              numeric(
                fixture
                  ?.teams
                  ?.away
                  ?.id
              );

            const leagueId =
              numeric(
                fixture
                  ?.league
                  ?.id
              );

            const seasonValue =
              numeric(
                fixture
                  ?.league
                  ?.season
              );

            return {
              // =================================================
              // FIXTURE
              // =================================================

              fixture: {
                id:
                  fixtureId,

                date:
                  safeString(
                    fixture
                      ?.fixture
                      ?.date
                  ),

                timestamp:
                  numeric(
                    fixture
                      ?.fixture
                      ?.timestamp
                  ),

                timezone:
                  safeString(
                    fixture
                      ?.fixture
                      ?.timezone
                  ),

                status: {
                  long:
                    safeString(
                      fixture
                        ?.fixture
                        ?.status
                        ?.long
                    ),

                  short:
                    safeString(
                      fixture
                        ?.fixture
                        ?.status
                        ?.short
                    ),

                  elapsed:
                    numeric(
                      fixture
                        ?.fixture
                        ?.status
                        ?.elapsed
                    )
                },

                venue: {
                  id:
                    numeric(
                      fixture
                        ?.fixture
                        ?.venue
                        ?.id
                    ),

                  name:
                    safeString(
                      fixture
                        ?.fixture
                        ?.venue
                        ?.name
                    ),

                  city:
                    safeString(
                      fixture
                        ?.fixture
                        ?.venue
                        ?.city
                    )
                }
              },

              // =================================================
              // LEAGUE
              // =================================================

              league: {
                id:
                  leagueId,

                name:
                  safeString(
                    fixture
                      ?.league
                      ?.name
                  ),

                country:
                  safeString(
                    fixture
                      ?.league
                      ?.country
                  ),

                logo:
                  safeString(
                    fixture
                      ?.league
                      ?.logo
                  ),

                flag:
                  safeString(
                    fixture
                      ?.league
                      ?.flag
                  ),

                season:
                  seasonValue,

                round:
                  safeString(
                    fixture
                      ?.league
                      ?.round
                  ),

                standings:
                  Boolean(
                    fixture
                      ?.league
                      ?.standings
                  )
              },

              // =================================================
              // HOME TEAM
              // =================================================

              home: {
                id:
                  homeId,

                name:
                  safeString(
                    fixture
                      ?.teams
                      ?.home
                      ?.name
                  ),

                logo:
                  safeString(
                    fixture
                      ?.teams
                      ?.home
                      ?.logo
                  ),

                winner:
                  fixture
                    ?.teams
                    ?.home
                    ?.winner ??
                  null
              },

              // =================================================
              // AWAY TEAM
              // =================================================

              away: {
                id:
                  awayId,

                name:
                  safeString(
                    fixture
                      ?.teams
                      ?.away
                      ?.name
                  ),

                logo:
                  safeString(
                    fixture
                      ?.teams
                      ?.away
                      ?.logo
                  ),

                winner:
                  fixture
                    ?.teams
                    ?.away
                    ?.winner ??
                  null
              },

              // =================================================
              // SCORE
              // =================================================

              score: {
                halftime: {
                  home:
                    numeric(
                      fixture
                        ?.score
                        ?.halftime
                        ?.home
                    ),

                  away:
                    numeric(
                      fixture
                        ?.score
                        ?.halftime
                        ?.away
                    )
                },

                fulltime: {
                  home:
                    numeric(
                      fixture
                        ?.score
                        ?.fulltime
                        ?.home
                    ),

                  away:
                    numeric(
                      fixture
                        ?.score
                        ?.fulltime
                        ?.away
                    )
                },

                extratime: {
                  home:
                    numeric(
                      fixture
                        ?.score
                        ?.extratime
                        ?.home
                    ),

                  away:
                    numeric(
                      fixture
                        ?.score
                        ?.extratime
                        ?.away
                    )
                },

                penalty: {
                  home:
                    numeric(
                      fixture
                        ?.score
                        ?.penalty
                        ?.home
                    ),

                  away:
                    numeric(
                      fixture
                        ?.score
                        ?.penalty
                        ?.away
                    )
                }
              },

              // =================================================
              // EASY ACCESS FIELDS
              //
              // These make it easier for the frontend and
              // predict.js to consume fixture information.
              // =================================================

              fixtureId,

              homeTeamId:
                homeId,

              awayTeamId:
                awayId,

              homeTeam:
                safeString(
                  fixture
                    ?.teams
                    ?.home
                    ?.name
                ),

              awayTeam:
                safeString(
                  fixture
                    ?.teams
                    ?.away
                    ?.name
                ),

              leagueId,

              leagueName:
                safeString(
                  fixture
                    ?.league
                    ?.name
                ),

              country:
                safeString(
                  fixture
                    ?.league
                    ?.country
                ),

              season:
                seasonValue,

              round:
                safeString(
                  fixture
                    ?.league
                    ?.round
                ),

              kickoff:
                safeString(
                  fixture
                    ?.fixture
                    ?.date
                )
            };
          }
        )
        .filter(
          (fixture) =>
            fixture.fixtureId &&
            fixture.homeTeamId &&
            fixture.awayTeamId
        );

    // ==========================================================
    // SORT BY KICKOFF
    // ==========================================================

    fixtures.sort(
      (a, b) => {

        const timeA =
          new Date(
            a.kickoff
          ).getTime();

        const timeB =
          new Date(
            b.kickoff
          ).getTime();

        return timeA - timeB;
      }
    );

    // ==========================================================
    // COUNTERS
    // ==========================================================

    const completedStatuses =
      new Set([
        "FT",
        "AET",
        "PEN"
      ]);

    const scheduledStatuses =
      new Set([
        "NS",
        "TBD"
      ]);

    const completed =
      fixtures.filter(
        (fixture) =>
          completedStatuses.has(
            fixture
              ?.fixture
              ?.status
              ?.short
          )
      ).length;

    const scheduled =
      fixtures.filter(
        (fixture) =>
          scheduledStatuses.has(
            fixture
              ?.fixture
              ?.status
              ?.short
          )
      ).length;

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(200).json({
      success: true,

      version:
        "Fixture Discovery V4.0",

      query: {
        date:
          String(date),

        league:
          league
            ? String(league)
            : null,

        season:
          season
            ? String(season)
            : null,

        timezone:
          timezone ||
          "Africa/Lagos"
      },

      count:
        fixtures.length,

      completed,

      scheduled,

      fixtures
    });

  } catch (error) {

    console.error(
      "Fixture Discovery V4.0 error:",
      error
    );

    return res.status(500).json({
      success: false,

      version:
        "Fixture Discovery V4.0",

      error:
        "Unable to retrieve football fixtures.",

      details:
        error?.message ||
        "Unknown server error."
    });
  }
}
