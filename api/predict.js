// /api/predict.js
// ============================================================
// TOMSONSTAKES PREDICTION ENGINE
// Version 4.0
//
// SIGNAL WEIGHTS
//
// 1. Last 5 matches — recency weighted       45%
// 2. Current league standings                30%
// 3. Season home/away strength                5%
// 4. Expected goals / goal model             10%
// 5. Recent home/away venue form              5%
// 6. Last 5 H2H                               5%
//
// TOTAL                                      100%
//
// IMPORTANT
// ------------------------------------------------------------
// This endpoint produces the final prediction.
// It does NOT use injuries or lineups.
//
// Required team information:
// - home team ID
// - away team ID
//
// These can be supplied directly in the request or
// inside normalized data.
//
// ============================================================


export default async function handler(req, res) {

    try {

        // ======================================================
        // REQUEST
        // ======================================================

        if (req.method !== "POST") {

            return res.status(405).json({
                success: false,
                error: "Method not allowed. Use POST."
            });

        }


        const body =
            req.body || {};


        const match =
            body.match || {};


        const normalized =
            body.normalized || {};


        // ======================================================
        // SAFE HELPERS
        // ======================================================

        const safeNumber = (value, fallback = null) => {

            if (
                value === null ||
                value === undefined ||
                value === ""
            ) {
                return fallback;
            }

            const n =
                Number(
                    String(value)
                        .replace("%", "")
                        .replace(",", "")
                        .trim()
                );

            return Number.isFinite(n)
                ? n
                : fallback;

        };


        const clamp = (
            value,
            min = 0,
            max = 1
        ) => {

            const n =
                safeNumber(
                    value,
                    min
                );

            return Math.max(
                min,
                Math.min(
                    max,
                    n
                )
            );

        };


        const round = (
            value,
            decimals = 4
        ) => {

            if (
                value === null ||
                value === undefined ||
                !Number.isFinite(
                    Number(value)
                )
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
                    Number(value) *
                    factor
                ) / factor
            );

        };


        const safeArray = (value) =>
            Array.isArray(value)
                ? value
                : [];


        // ======================================================
        // EXTRACT TEAM IDS
        //
        // Accept multiple possible locations so that the
        // frontend/normalize endpoint can evolve without
        // breaking predict.js.
        // ======================================================

        const homeId =
            safeNumber(
                match.homeId ??
                match.homeTeamId ??
                normalized.homeId ??
                normalized.homeTeamId ??
                normalized.match?.homeId ??
                normalized.match?.homeTeamId ??
                normalized.teams?.home?.id ??
                normalized.home?.id ??
                normalized.homeTeam?.id
            );


        const awayId =
            safeNumber(
                match.awayId ??
                match.awayTeamId ??
                normalized.awayId ??
                normalized.awayTeamId ??
                normalized.match?.awayId ??
                normalized.match?.awayTeamId ??
                normalized.teams?.away?.id ??
                normalized.away?.id ??
                normalized.awayTeam?.id
            );


        // ======================================================
        // TEAM NAMES
        // ======================================================

        const homeName =
            match.home ||
            normalized.home?.name ||
            normalized.teams?.home?.name ||
            "Home Team";


        const awayName =
            match.away ||
            normalized.away?.name ||
            normalized.teams?.away?.name ||
            "Away Team";


        // ======================================================
        // VALIDATE TEAM IDS
        // ======================================================

        if (!homeId || !awayId) {

            return res.status(400).json({

                success: false,

                version:
                    "Prediction Engine V4.0",

                error:
                    "Home and away team IDs are required.",

                details: {
                    homeId:
                        homeId || null,

                    awayId:
                        awayId || null,

                    message:
                        "Pass homeId and awayId in match or normalized data."
                }

            });

        }


        // ======================================================
        // API KEY
        // ======================================================

        const apiKey =
            process.env.APIFOOTBALL_KEY;


        if (!apiKey) {

            return res.status(500).json({

                success: false,

                version:
                    "Prediction Engine V4.0",

                error:
                    "APIFOOTBALL_KEY is not configured."

            });

        }


        // ======================================================
        // API HELPER
        // ======================================================

        const api = async (
            endpoint,
            params = {}
        ) => {

            try {

                const url =
                    new URL(
                        `https://v3.football.api-sports.io/${endpoint}`
                    );


                Object.entries(
                    params
                ).forEach(
                    ([key, value]) => {

                        if (
                            value !== null &&
                            value !== undefined &&
                            value !== ""
                        ) {

                            url.searchParams.set(
                                key,
                                String(value)
                            );

                        }

                    }
                );


                const response =
                    await fetch(
                        url.toString(),
                        {
                            headers: {

                                "x-apisports-key":
                                    apiKey,

                                "Accept":
                                    "application/json"

                            }
                        }
                    );


                const data =
                    await response
                        .json()
                        .catch(
                            () => ({})
                        );


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
                        "API request failed."

                };

            }

        };


        // ======================================================
        // LEAGUE / SEASON INFORMATION
        // ======================================================

        const leagueId =
            safeNumber(
                match.leagueId ??
                normalized.leagueId ??
                normalized.match?.leagueId ??
                normalized.league?.id
            );


        const season =
            safeNumber(
                match.season ??
                normalized.season ??
                normalized.match?.season
            );


        // ======================================================
        // SIGNAL OBJECT
        // ======================================================

        const signals = {

            last5: {

                weight: 0.45,

                home: null,

                away: null,

                difference: null

            },

            standings: {

                weight: 0.30,

                home: null,

                away: null,

                difference: null

            },

            seasonHomeAway: {

                weight: 0.05,

                home: null,

                away: null,

                difference: null

            },

            expectedGoals: {

                weight: 0.10,

                home: null,

                away: null,

                difference: null

            },

            venueForm: {

                weight: 0.05,

                home: null,

                away: null,

                difference: null

            },

            h2h: {

                weight: 0.05,

                home: null,

                away: null,

                difference: null

            }

        };


        // ======================================================
        // NORMALIZED LAST-5 DATA
        //
        // Prefer the data already calculated by analyze.js.
        // ======================================================

        const normalizedHome =
            normalized.homeAnalysis ||
            normalized.home ||
            normalized.teams?.home ||
            {};


        const normalizedAway =
            normalized.awayAnalysis ||
            normalized.away ||
            normalized.teams?.away ||
            {};


        const homeLast5 =
            normalizedHome.lastFive ||
            normalizedHome.form ||
            normalized.form?.home ||
            null;


        const awayLast5 =
            normalizedAway.lastFive ||
            normalizedAway.form ||
            normalized.form?.away ||
            null;


        // ======================================================
        // LAST 5 FORM SCORE
        //
        // analyze.js already calculates formScore.
        // If available, use it directly.
        //
        // Otherwise calculate from results.
        // ======================================================

        const getFormScore =
            (data) => {

                if (!data) {
                    return null;
                }


                const direct =
                    safeNumber(
                        data.formScore ??
                        data.recencyWeighted?.formScore
                    );


                if (
                    direct !== null
                ) {

                    return clamp(
                        direct
                    );

                }


                const results =
                    safeArray(
                        data.results
                    );


                if (!results.length) {
                    return null;
                }


                const weights =
                    [5, 4, 3, 2, 1];


                let weighted =
                    0;

                let total =
                    0;


                results
                    .slice(0, 5)
                    .forEach(
                        (
                            item,
                            index
                        ) => {

                            const weight =
                                weights[index] ||
                                1;


                            let value =
                                0.333;


                            if (
                                item.result ===
                                "W"
                            ) {
                                value = 1;
                            }

                            else if (
                                item.result ===
                                "D"
                            ) {
                                value =
                                    0.5;
                            }

                            else if (
                                item.result ===
                                "L"
                            ) {
                                value = 0;
                            }


                            weighted +=
                                value *
                                weight;

                            total +=
                                weight;

                        }
                    );


                return total
                    ? clamp(
                        weighted /
                        total
                    )
                    : null;

            };


        signals.last5.home =
            getFormScore(
                homeLast5
            );


        signals.last5.away =
            getFormScore(
                awayLast5
            );


        // ======================================================
        // FALLBACK LAST-5 DATA FROM NORMALIZED FORM
        // ======================================================

        if (
            signals.last5.home === null
        ) {

            signals.last5.home =
                getFormScore(
                    normalized.form?.home
                );

        }


        if (
            signals.last5.away === null
        ) {

            signals.last5.away =
                getFormScore(
                    normalized.form?.away
                );

        }


        // ======================================================
        // FETCH STANDINGS
        //
        // API-Football:
        // /standings?league=...&season=...
        //
        // Standings contain rank, points, goal difference and
        // home/away records.
        // ======================================================

        let standings = [];


        if (
            leagueId &&
            season
        ) {

            const standingResponse =
                await api(
                    "standings",
                    {
                        league:
                            leagueId,

                        season:
                            season
                    }
                );


            standings =
                safeArray(
                    standingResponse
                        .data
                        ?.response?.[0]
                        ?.league
                        ?.standings?.[0]
                );

        }


        const findStanding =
            (teamId) => {

                return standings.find(
                    item =>
                        Number(
                            item?.team?.id
                        ) ===
                        Number(teamId)
                ) || null;

            };


        const homeStanding =
            findStanding(
                homeId
            );


        const awayStanding =
            findStanding(
                awayId
            );


        // ======================================================
        // STANDINGS SCORE
        //
        // Higher position / points / GD = stronger score.
        //
        // We calculate a relative score between the two teams
        // so the signal cannot automatically become 100%.
        // ======================================================

        const standingsStrength =
            (standing) => {

                if (!standing) {
                    return null;
                }


                const points =
                    safeNumber(
                        standing.points,
                        0
                    );


                const goalDiff =
                    safeNumber(
                        standing.goalsDiff,
                        0
                    );


                const rank =
                    safeNumber(
                        standing.rank
                    );


                const totalTeams =
                    Math.max(
                        standings.length,
                        2
                    );


                const rankScore =
                    rank !== null
                        ?
                        clamp(
                            1 -
                            (
                                (rank - 1) /
                                (totalTeams - 1)
                            )
                        )
                        :
                        0.5;


                const pointMax =
                    Math.max(
                        ...standings.map(
                            item =>
                                safeNumber(
                                    item.points,
                                    0
                                )
                        ),
                        1
                    );


                const pointScore =
                    clamp(
                        points /
                        pointMax
                    );


                const gdValues =
                    standings.map(
                        item =>
                            safeNumber(
                                item.goalsDiff,
                                0
                            )
                    );


                const gdMin =
                    Math.min(
                        ...gdValues
                    );


                const gdMax =
                    Math.max(
                        ...gdValues
                    );


                const gdScore =
                    gdMax === gdMin
                        ?
                        0.5
                        :
                        clamp(
                            (
                                goalDiff -
                                gdMin
                            ) /
                            (
                                gdMax -
                                gdMin
                            )
                        );


                return (
                    rankScore *
                        0.40 +

                    pointScore *
                        0.40 +

                    gdScore *
                        0.20
                );

            };


        signals.standings.home =
            standingsStrength(
                homeStanding
            );


        signals.standings.away =
            standingsStrength(
                awayStanding
            );


        // ======================================================
        // FETCH TEAM SEASON STATISTICS
        //
        // Used for:
        // - season home/away strength
        // - goal model
        //
        // API-Football documents /teams/statistics as requiring
        // league, season and team.
        // ======================================================

        let homeSeasonStats =
            null;

        let awaySeasonStats =
            null;


        if (
            leagueId &&
            season
        ) {

            const [
                homeStatsResponse,
                awayStatsResponse
            ] =
                await Promise.all([
                    api(
                        "teams/statistics",
                        {
                            league:
                                leagueId,

                            season:
                                season,

                            team:
                                homeId
                        }
                    ),

                    api(
                        "teams/statistics",
                        {
                            league:
                                leagueId,

                            season:
                                season,

                            team:
                                awayId
                        }
                    )
                ]);


            homeSeasonStats =
                homeStatsResponse
                    .data
                    ?.response ||
                null;


            awaySeasonStats =
                awayStatsResponse
                    .data
                    ?.response ||
                null;

        }


        // ======================================================
        // SEASON HOME/AWAY STRENGTH
        // ======================================================

        const getVenueStrength =
            (
                stats,
                venue
            ) => {

                if (!stats) {
                    return null;
                }


                const fixtureData =
                    stats.fixtures?.played?.[
                        venue
                    ];


                const wins =
                    safeNumber(
                        stats.fixtures?.wins?.[
                            venue
                        ],
                        0
                    );


                const draws =
                    safeNumber(
                        stats.fixtures?.draws?.[
                            venue
                        ],
                        0
                    );


                const losses =
                    safeNumber(
                        stats.fixtures?.loses?.[
                            venue
                        ],
                        0
                    );


                const played =
                    safeNumber(
                        fixtureData,
                        wins +
                        draws +
                        losses
                    );


                if (!played) {
                    return null;
                }


                const points =
                    (
                        wins * 3
                    ) +
                    draws;


                const ppg =
                    points /
                    (
                        played * 3
                    );


                return clamp(
                    ppg
                );

            };


        signals.seasonHomeAway.home =
            getVenueStrength(
                homeSeasonStats,
                "home"
            );


        signals.seasonHomeAway.away =
            getVenueStrength(
                awaySeasonStats,
                "away"
            );


        // ======================================================
        // EXPECTED GOALS / GOAL MODEL
        //
        // Prefer explicit xG values if available.
        //
        // If xG is unavailable, use goals-per-game and
        // goals-against-per-game as a goal-model fallback.
        // ======================================================

        const getGoalModel =
            (stats) => {

                if (!stats) {
                    return null;
                }


                const explicitXG =
                    safeNumber(
                        stats.goals?.for?.average?.total ??
                        stats.xg?.for ??
                        stats.expectedGoals
                    );


                const explicitXGA =
                    safeNumber(
                        stats.goals?.against?.average?.total ??
                        stats.xg?.against
                    );


                if (
                    explicitXG !== null
                ) {

                    const attacking =
                        clamp(
                            explicitXG /
                            3
                        );


                    const defensive =
                        explicitXGA !== null
                            ?
                            clamp(
                                1 -
                                (
                                    explicitXGA /
                                    3
                                )
                            )
                            :
                            0.5;


                    return clamp(
                        (
                            attacking *
                            0.70
                        ) +
                        (
                            defensive *
                            0.30
                        )
                    );

                }


                const gf =
                    safeNumber(
                        stats.goals
                            ?.for
                            ?.average
                            ?.total
                    );


                const ga =
                    safeNumber(
                        stats.goals
                            ?.against
                            ?.average
                            ?.total
                    );


                if (
                    gf === null &&
                    ga === null
                ) {
                    return null;
                }


                const attack =
                    gf !== null
                        ?
                        clamp(
                            gf / 3
                        )
                        :
                        0.5;


                const defence =
                    ga !== null
                        ?
                        clamp(
                            1 -
                            (
                                ga / 3
                            )
                        )
                        :
                        0.5;


                return clamp(
                    attack *
                    0.70 +
                    defence *
                    0.30
                );

            };


        signals.expectedGoals.home =
            getGoalModel(
                homeSeasonStats
            );


        signals.expectedGoals.away =
            getGoalModel(
                awaySeasonStats
            );


        // ======================================================
        // RECENT VENUE FORM
        //
        // Uses the venue form already generated by analyze.js.
        // ======================================================

        const getRecentVenueScore =
            (
                data,
                venue
            ) => {

                if (!data) {
                    return null;
                }


                const venueData =
                    data.venueForm?.[
                        venue
                    ];


                if (!venueData) {
                    return null;
                }


                const ppg =
                    safeNumber(
                        venueData.pointsPerGame
                    );


                if (
                    ppg !== null
                ) {

                    return clamp(
                        ppg / 3
                    );

                }


                const matches =
                    safeNumber(
                        venueData.matches,
                        0
                    );


                const wins =
                    safeNumber(
                        venueData.wins,
                        0
                    );


                const draws =
                    safeNumber(
                        venueData.draws,
                        0
                    );


                if (!matches) {
                    return null;
                }


                return clamp(
                    (
                        wins * 3 +
                        draws
                    ) /
                    (
                        matches * 3
                    )
                );

            };


        signals.venueForm.home =
            getRecentVenueScore(
                normalizedHome,
                "home"
            );


        signals.venueForm.away =
            getRecentVenueScore(
                normalizedAway,
                "away"
            );


        // ======================================================
        // H2H — LAST FIVE
        // ======================================================

        let h2hFixtures = [];


        const normalizedH2H =
            safeArray(
                normalized.h2h ||
                normalized.headToHead ||
                normalized.head2head?.fixtures
            );


        if (
            normalizedH2H.length
        ) {

            h2hFixtures =
                normalizedH2H.slice(
                    0,
                    5
                );

        }

        else {

            const h2hResponse =
                await api(
                    "fixtures/headtohead",
                    {
                        h2h:
                            `${homeId}-${awayId}`,

                        last:
                            5
                    }
                );


            h2hFixtures =
                safeArray(
                    h2hResponse
                        .data
                        ?.response
                )
                .slice(
                    0,
                    5
                );

        }


        // ======================================================
        // H2H SCORE
        // ======================================================

        let h2hHomePoints =
            0;

        let h2hAwayPoints =
            0;

        let h2hTotalWeight =
            0;


        const h2hWeights =
            [5, 4, 3, 2, 1];


        h2hFixtures.forEach(
            (
                fixture,
                index
            ) => {

                const homeGoals =
                    safeNumber(
                        fixture.goals?.home
                    );


                const awayGoals =
                    safeNumber(
                        fixture.goals?.away
                    );


                const fixtureHomeId =
                    safeNumber(
                        fixture.teams
                            ?.home
                            ?.id
                    );


                const fixtureAwayId =
                    safeNumber(
                        fixture.teams
                            ?.away
                            ?.id
                    );


                if (
                    homeGoals === null ||
                    awayGoals === null
                ) {
                    return;
                }


                const weight =
                    h2hWeights[index] ||
                    1;


                if (
                    homeGoals >
                    awayGoals
                ) {

                    if (
                        fixtureHomeId ===
                        homeId
                    ) {

                        h2hHomePoints +=
                            3 * weight;

                    }

                    else {

                        h2hAwayPoints +=
                            3 * weight;

                    }

                }

                else if (
                    homeGoals <
                    awayGoals
                ) {

                    if (
                        fixtureAwayId ===
                        homeId
                    ) {

                        h2hHomePoints +=
                            3 * weight;

                    }

                    else {

                        h2hAwayPoints +=
                            3 * weight;

                    }

                }

                else {

                    h2hHomePoints +=
                        1 * weight;

                    h2hAwayPoints +=
                        1 * weight;

                }


                h2hTotalWeight +=
                    3 * weight;

            }
        );


        if (
            h2hTotalWeight
        ) {

            signals.h2h.home =
                clamp(
                    h2hHomePoints /
                    h2hTotalWeight
                );


            signals.h2h.away =
                clamp(
                    h2hAwayPoints /
                    h2hTotalWeight
                );

        }


        // ======================================================
        // CALCULATE SIGNAL DIFFERENCES
        // ======================================================

        Object.keys(
            signals
        ).forEach(
            key => {

                const signal =
                    signals[key];


                if (
                    signal.home !== null &&
                    signal.away !== null
                ) {

                    signal.difference =
                        signal.home -
                        signal.away;

                }

            }
        );


        // ======================================================
        // HANDLE MISSING SIGNALS
        //
        // If a signal cannot be calculated, do not simply give
        // one team an advantage.
        //
        // The available signal weights are renormalized.
        // ======================================================

        const validSignals =
            Object.values(
                signals
            ).filter(
                signal =>
                    signal.home !== null &&
                    signal.away !== null
            );


        if (!validSignals.length) {

            return res.status(200).json({

                success: false,

                version:
                    "Prediction Engine V4.0",

                error:
                    "Insufficient data to calculate prediction.",

                prediction: null

            });

        }


        // ======================================================
        // NORMALIZED WEIGHTS
        // ======================================================

        const validWeightTotal =
            validSignals.reduce(
                (
                    total,
                    signal
                ) =>
                    total +
                    signal.weight,
                0
            );


        validSignals.forEach(
            signal => {

                signal.normalizedWeight =
                    signal.weight /
                    validWeightTotal;

            }
        );


        // ======================================================
        // FINAL HOME / AWAY MODEL SCORES
        // ======================================================

        let homeScore =
            0;

        let awayScore =
            0;


        validSignals.forEach(
            signal => {

                homeScore +=
                    signal.home *
                    signal.normalizedWeight;


                awayScore +=
                    signal.away *
                    signal.normalizedWeight;

            }
        );


        homeScore =
            clamp(
                homeScore
            );


        awayScore =
            clamp(
                awayScore
            );


        // ======================================================
        // DRAW MODEL
        //
        // A draw becomes more plausible when the two teams'
        // aggregate scores are close.
        // ======================================================

        const difference =
            Math.abs(
                homeScore -
                awayScore
            );


        const drawProbability =
            clamp(
                0.34 -
                (
                    difference *
                    0.50
                ),
                0.08,
                0.34
            );


        // ======================================================
        // WIN PROBABILITY
        //
        // Allocate the remaining probability between home
        // and away according to their relative model scores.
        // ======================================================

        const nonDraw =
            1 -
            drawProbability;


        const scoreTotal =
            homeScore +
            awayScore;


        let homeProbability =
            0.5;

        let awayProbability =
            0.5;


        if (
            scoreTotal > 0
        ) {

            homeProbability =
                homeScore /
                scoreTotal;

            awayProbability =
                awayScore /
                scoreTotal;

        }


        homeProbability =
            homeProbability *
            nonDraw;


        awayProbability =
            awayProbability *
            nonDraw;


        // ======================================================
        // FINAL PREDICTION
        // ======================================================

        let prediction =
            "DRAW";


        let probability =
            drawProbability;


        if (
            homeProbability >
            awayProbability &&
            homeProbability >
            drawProbability
        ) {

            prediction =
                homeName;

            probability =
                homeProbability;

        }

        else if (
            awayProbability >
            homeProbability &&
            awayProbability >
            drawProbability
        ) {

            prediction =
                awayName;

            probability =
                awayProbability;

        }


        // ======================================================
        // CONFIDENCE LEVEL
        // ======================================================

        let confidence =
            "LOW";


        if (
            probability >=
            0.80
        ) {

            confidence =
                "HIGH";

        }

        else if (
            probability >=
            0.60
        ) {

            confidence =
                "MEDIUM";

        }


        // ======================================================
        // SIGNAL CONTRIBUTIONS
        // ======================================================

        const contributions =
            {};


        Object.entries(
            signals
        ).forEach(
            (
                [key, signal]
            ) => {

                if (
                    signal.home === null ||
                    signal.away === null
                ) {

                    contributions[key] =
                        null;

                    return;

                }


                const normalizedDifference =
                    signal.home -
                    signal.away;


                contributions[key] = {

                    configuredWeight:
                        signal.weight,

                    normalizedWeight:
                        signal.normalizedWeight,

                    home:
                        round(
                            signal.home,
                            4
                        ),

                    away:
                        round(
                            signal.away,
                            4
                        ),

                    difference:
                        round(
                            normalizedDifference,
                            4
                        )

                };

            }
        );


        // ======================================================
        // MODEL SCORE
        // ======================================================

        const modelScore =
            Math.max(
                homeScore,
                awayScore
            );


        // ======================================================
        // RESPONSE
        // ======================================================

        return res.status(200).json({

            success: true,

            version:
                "Prediction Engine V4.0",

            match: {

                home: {

                    id:
                        homeId,

                    name:
                        homeName

                },

                away: {

                    id:
                        awayId,

                    name:
                        awayName

                },

                leagueId:
                    leagueId,

                season:
                    season

            },


            prediction: {

                selection:
                    prediction,

                predictionType:
                    prediction ===
                    "DRAW"
                        ? "DRAW"
                        : "MATCH_WINNER",

                probability:
                    round(
                        probability,
                        4
                    ),

                probabilityPercent:
                    Math.round(
                        probability *
                        100
                    ),

                confidence:

                    confidence,

                modelScore:
                    round(
                        modelScore,
                        4
                    )

            },


            probabilities: {

                home:
                    round(
                        homeProbability,
                        4
                    ),

                draw:
                    round(
                        drawProbability,
                        4
                    ),

                away:
                    round(
                        awayProbability,
                        4
                    )

            },


            model: {

                homeScore:
                    round(
                        homeScore,
                        4
                    ),

                awayScore:
                    round(
                        awayScore,
                        4
                    ),

                absoluteDifference:
                    round(
                        difference,
                        4
                    ),

                availableSignals:
                    validSignals.length,

                totalSignals:
                    Object.keys(
                        signals
                    ).length

            },


            signals: {

                last5RecencyWeighted: {

                    weight:
                        0.45,

                    home:
                        round(
                            signals.last5.home,
                            4
                        ),

                    away:
                        round(
                            signals.last5.away,
                            4
                        ),

                    difference:
                        round(
                            signals.last5.difference,
                            4
                        )

                },


                leagueStandings: {

                    weight:
                        0.30,

                    home:
                        round(
                            signals.standings.home,
                            4
                        ),

                    away:
                        round(
                            signals.standings.away,
                            4
                        ),

                    difference:
                        round(
                            signals.standings.difference,
                            4
                        )

                },


                seasonHomeAwayStrength: {

                    weight:
                        0.05,

                    home:
                        round(
                            signals.seasonHomeAway.home,
                            4
                        ),

                    away:
                        round(
                            signals.seasonHomeAway.away,
                            4
                        ),

                    difference:
                        round(
                            signals.seasonHomeAway.difference,
                            4
                        )

                },


                expectedGoals: {

                    weight:
                        0.10,

                    home:
                        round(
                            signals.expectedGoals.home,
                            4
                        ),

                    away:
                        round(
                            signals.expectedGoals.away,
                            4
                        ),

                    difference:
                        round(
                            signals.expectedGoals.difference,
                            4
                        )

                },


                recentVenueForm: {

                    weight:
                        0.05,

                    home:
                        round(
                            signals.venueForm.home,
                            4
                        ),

                    away:
                        round(
                            signals.venueForm.away,
                            4
                        ),

                    difference:
                        round(
                            signals.venueForm.difference,
                            4
                        )

                },


                last5H2H: {

                    weight:
                        0.05,

                    home:
                        round(
                            signals.h2h.home,
                            4
                        ),

                    away:
                        round(
                            signals.h2h.away,
                            4
                        ),

                    difference:
                        round(
                            signals.h2h.difference,
                            4
                        ),

                    meetings:
                        h2hFixtures.length

                }

            },


            configuredWeights: {

                last5RecencyWeighted:
                    "45%",

                leagueStandings:
                    "30%",

                seasonHomeAwayStrength:
                    "5%",

                expectedGoals:
                    "10%",

                recentVenueForm:
                    "5%",

                last5H2H:
                    "5%",

                total:
                    "100%"

            },


            dataAvailability: {

                standings:
                    Boolean(
                        signals.standings.home !== null &&
                        signals.standings.away !== null
                    ),

                seasonHomeAway:
                    Boolean(
                        signals.seasonHomeAway.home !== null &&
                        signals.seasonHomeAway.away !== null
                    ),

                expectedGoals:
                    Boolean(
                        signals.expectedGoals.home !== null &&
                        signals.expectedGoals.away !== null
                    ),

                recentVenueForm:
                    Boolean(
                        signals.venueForm.home !== null &&
                        signals.venueForm.away !== null
                    ),

                h2h:
                    Boolean(
                        signals.h2h.home !== null &&
                        signals.h2h.away !== null
                    )

            },


            excludedFromModel: [

                "injuries",

                "lineups",

                "odds",

                "external bookmaker predictions"

            ]

        });


    }

    catch (error) {

        console.error(
            "Prediction Engine V4.0 error:",
            error
        );


        return res.status(500).json({

            success: false,

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
