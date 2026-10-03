// /api/predict.js
// ============================================================
// TOMSONSTAKES PREDICTION ENGINE
// Version 4.1
//
// PURPOSE
// ------------------------------------------------------------
// Combines the six approved prediction signals:
//
// 1. Last 5 recency-weighted form       45%
// 2. Current league standings           30%
// 3. Season home/away strength           5%
// 4. Expected goals / goal model        10%
// 5. Recent home/away venue form          5%
// 6. Last 5 H2H                            5%
//
// TOTAL                                  100%
//
// IMPORTANT
// ------------------------------------------------------------
// NOT USED:
// - Injuries
// - Lineups
// - Bookmaker odds
// - API-Football prediction endpoint
// - Artificial home advantage
// - Fixed home-win fallback
//
// The highest calculated probability wins.
// ============================================================

const API_BASE = "https://v3.football.api-sports.io";

const WEIGHTS = {
    recentForm: 0.45,
    standings: 0.30,
    seasonVenue: 0.05,
    expectedGoals: 0.10,
    recentVenueForm: 0.05,
    h2h: 0.05
};


// ============================================================
// BASIC HELPERS
// ============================================================

function num(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }

    const n = Number(value);

    return Number.isFinite(n) ? n : fallback;
}


function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}


function normalizeTeamId(value) {
    const id = Number(value);

    return Number.isInteger(id) && id > 0 ? id : null;
}


function safeDivide(a, b, fallback = 0) {
    if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b)) || Number(b) === 0) {
        return fallback;
    }

    return Number(a) / Number(b);
}


function average(values) {
    const valid = values
        .map(Number)
        .filter(Number.isFinite);

    if (!valid.length) return 0;

    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}


function weightedAverage(values, weights) {
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < values.length; i++) {
        const value = Number(values[i]);
        const weight = Number(weights[i]);

        if (!Number.isFinite(value) || !Number.isFinite(weight)) {
            continue;
        }

        numerator += value * weight;
        denominator += weight;
    }

    return denominator ? numerator / denominator : 0;
}


// ============================================================
// API-FOOTBALL REQUEST
// ============================================================

async function apiFootball(endpoint, params, apiKey) {

    const url = new URL(`${API_BASE}${endpoint}`);

    Object.entries(params || {}).forEach(([key, value]) => {

        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            url.searchParams.set(key, String(value));
        }

    });

    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            "x-apisports-key": apiKey,
            "Accept": "application/json"
        }
    });

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch (error) {
        throw new Error(
            `API-Football returned invalid JSON from ${endpoint}: ${text.slice(0, 300)}`
        );
    }

    if (!response.ok) {
        throw new Error(
            `API-Football HTTP ${response.status}: ${
                JSON.stringify(data.errors || data)
            }`
        );
    }

    if (data.errors && Object.keys(data.errors).length > 0) {
        throw new Error(
            `API-Football error from ${endpoint}: ${
                JSON.stringify(data.errors)
            }`
        );
    }

    return data;
}


// ============================================================
// FIXTURE
// ============================================================

async function getFixture(fixtureId, apiKey) {

    const data = await apiFootball(
        "/fixtures",
        {
            id: fixtureId
        },
        apiKey
    );

    const fixture = data.response?.[0];

    if (!fixture) {
        throw new Error(
            `Fixture ${fixtureId} was not found.`
        );
    }

    return fixture;
}


// ============================================================
// ANALYZE ENDPOINT
//
// The V4.1 analyze endpoint is responsible for calculating
// team-level data.
//
// We call it twice:
//
// HOME TEAM
// AWAY TEAM
// ============================================================

function getApplicationBaseUrl(req) {

    // Explicit application URL takes priority.
    if (process.env.APP_URL) {
        return process.env.APP_URL.replace(/\/$/, "");
    }

    // Vercel deployment URL.
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }

    // Local development.
    const protocol =
        req.headers["x-forwarded-proto"] ||
        "http";

    const host =
        req.headers.host ||
        "localhost:3000";

    return `${protocol}://${host}`;
}


async function callAnalyze({
    req,
    teamId,
    opponentId,
    league,
    season,
    from,
    to
}) {

    const baseUrl = getApplicationBaseUrl(req);

    const url = new URL(
        `${baseUrl}/api/analyze`
    );

    url.searchParams.set(
        "team",
        String(teamId)
    );

    url.searchParams.set(
        "opponent",
        String(opponentId)
    );

    if (league) {
        url.searchParams.set(
            "league",
            String(league)
        );
    }

    if (season) {
        url.searchParams.set(
            "season",
            String(season)
        );
    }

    if (from) {
        url.searchParams.set(
            "from",
            String(from)
        );
    }

    if (to) {
        url.searchParams.set(
            "to",
            String(to)
        );
    }

    const response = await fetch(
        url.toString(),
        {
            method: "GET",
            headers: {
                "Accept": "application/json"
            }
        }
    );

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch (error) {
        throw new Error(
            `Analyze endpoint returned invalid JSON: ${text.slice(0, 300)}`
        );
    }

    if (!response.ok) {

        throw new Error(
            data.error ||
            `Analyze endpoint returned HTTP ${response.status}.`
        );

    }

    return data;
}


// ============================================================
// EXTRACT LAST-5 FORM
// ============================================================
//
// Converts results into a 0-1 team strength score.
//
// W = 3 points
// D = 1 point
// L = 0 points
//
// Recency weights:
//
// Match 1 = 5
// Match 2 = 4
// Match 3 = 3
// Match 4 = 2
// Match 5 = 1
//
// The analyze endpoint should already expose a recency score.
// We support multiple field names so the prediction engine
// remains compatible with V4.0/V4.1 analyze responses.
// ============================================================

function extractRecentFormScore(analysis) {

    const directCandidates = [
        analysis?.recentForm?.score,
        analysis?.recentForm?.formScore,
        analysis?.recencyWeightedForm,
        analysis?.recencyWeightedFormScore,
        analysis?.form?.recencyWeightedScore,
        analysis?.form?.formScore,
        analysis?.formScore
    ];

    for (const value of directCandidates) {

        const n = Number(value);

        if (Number.isFinite(n)) {

            // If already 0-1.
            if (n >= 0 && n <= 1) {
                return n;
            }

            // If percentage.
            if (n > 1 && n <= 100) {
                return n / 100;
            }
        }
    }


    // --------------------------------------------------------
    // Fallback: calculate from lastFive
    // --------------------------------------------------------

    const matches =
        analysis?.lastFive ||
        analysis?.recentMatches ||
        analysis?.form?.lastFive ||
        [];

    if (!Array.isArray(matches) || !matches.length) {
        return 0.5;
    }


    const weights = [5, 4, 3, 2, 1];

    let points = 0;
    let maxPoints = 0;

    for (let i = 0; i < matches.length && i < 5; i++) {

        const match = matches[i];

        const result =
            String(
                match?.result ||
                match?.outcome ||
                match?.form ||
                ""
            ).toUpperCase();

        let matchPoints = 0;

        if (result === "W") {
            matchPoints = 3;
        } else if (result === "D") {
            matchPoints = 1;
        } else {
            matchPoints = 0;
        }

        const weight = weights[i] || 1;

        points += matchPoints * weight;
        maxPoints += 3 * weight;
    }

    if (!maxPoints) {
        return 0.5;
    }

    return clamp(points / maxPoints);
}


// ============================================================
// STANDINGS SCORE
// ============================================================

function extractStandingsScore(analysis) {

    const directCandidates = [
        analysis?.standings?.score,
        analysis?.standings?.standingScore,
        analysis?.standingsScore,
        analysis?.tableScore,
        analysis?.leaguePositionScore
    ];

    for (const value of directCandidates) {

        const n = Number(value);

        if (Number.isFinite(n)) {

            if (n >= 0 && n <= 1) {
                return n;
            }

            if (n > 1 && n <= 100) {
                return n / 100;
            }
        }
    }


    const standing =
        analysis?.standings?.team ||
        analysis?.standings ||
        analysis?.standing ||
        null;

    const rank = num(
        standing?.rank ??
        standing?.position,
        0
    );

    const totalTeams = num(
        analysis?.standings?.totalTeams ??
        analysis?.standings?.tableSize ??
        analysis?.tableSize,
        0
    );

    if (rank > 0 && totalTeams > 1) {

        return clamp(
            1 - ((rank - 1) / (totalTeams - 1))
        );

    }

    return 0.5;
}


// ============================================================
// SEASON HOME/AWAY STRENGTH
// ============================================================

function extractSeasonVenueScore(analysis, venue) {

    const season =
        analysis?.seasonStrength ||
        analysis?.seasonVenueStrength ||
        analysis?.venueStrength ||
        analysis?.seasonStats ||
        {};


    const directScore =
        venue === "home"
            ? season?.home?.score
            : season?.away?.score;

    const directNumber = Number(directScore);

    if (Number.isFinite(directNumber)) {

        if (directNumber >= 0 && directNumber <= 1) {
            return directNumber;
        }

        if (directNumber > 1 && directNumber <= 100) {
            return directNumber / 100;
        }

    }


    const venueData =
        venue === "home"
            ? season?.home
            : season?.away;


    if (venueData) {

        const wins = num(venueData.wins);
        const draws = num(venueData.draws);
        const losses = num(venueData.losses);

        const played =
            num(venueData.played) ||
            (wins + draws + losses);

        if (played > 0) {

            const ppg =
                ((wins * 3) + draws) /
                played;

            return clamp(
                ppg / 3
            );

        }
    }


    return 0.5;
}


// ============================================================
// RECENT VENUE FORM
// ============================================================

function extractRecentVenueScore(
    analysis,
    venue
) {

    const venueForm =
        analysis?.venueForm ||
        analysis?.recentVenueForm ||
        analysis?.recentHomeAwayForm ||
        {};


    const data =
        venue === "home"
            ? venueForm?.home
            : venueForm?.away;


    if (!data) {
        return 0.5;
    }


    const directCandidates = [
        data.score,
        data.formScore,
        data.recentScore,
        data.ppgScore
    ];


    for (const value of directCandidates) {

        const n = Number(value);

        if (Number.isFinite(n)) {

            if (n >= 0 && n <= 1) {
                return n;
            }

            if (n > 1 && n <= 100) {
                return n / 100;
            }
        }
    }


    const wins = num(data.wins);
    const draws = num(data.draws);
    const losses = num(data.losses);

    const played =
        num(data.played) ||
        (wins + draws + losses);


    if (played > 0) {

        return clamp(
            ((wins * 3) + draws) /
            (played * 3)
        );

    }


    return 0.5;
}


// ============================================================
// GOAL MODEL
// ============================================================
//
// Returns expected-goal advantage for HOME.
//
// The analyze endpoint can provide a prepared xG / goal model.
//
// If not available, use season venue goal averages:
//
// Home expected goals:
//   average(home attack, away defence)
//
// Away expected goals:
//   average(away attack, home defence)
//
// This is intentionally a goal-model signal rather than
// simply choosing the team with more goals scored.
// ============================================================

function extractGoalModel(
    homeAnalysis,
    awayAnalysis
) {

    const homeModel =
        homeAnalysis?.expectedGoalsModel ||
        homeAnalysis?.goalModel ||
        homeAnalysis?.xGModel ||
        {};

    const awayModel =
        awayAnalysis?.expectedGoalsModel ||
        awayAnalysis?.goalModel ||
        awayAnalysis?.xGModel ||
        {};


    let homeXG = Number(
        homeModel?.for ??
        homeModel?.expectedGoals ??
        homeModel?.xG ??
        homeModel?.homeXG
    );


    let awayXG = Number(
        awayModel?.for ??
        awayModel?.expectedGoals ??
        awayModel?.xG ??
        awayModel?.awayXG
    );


    // --------------------------------------------------------
    // Fallback to season venue goal averages
    // --------------------------------------------------------

    if (!Number.isFinite(homeXG)) {

        const homeSeason =
            homeAnalysis?.seasonStrength ||
            homeAnalysis?.seasonVenueStrength ||
            homeAnalysis?.seasonStats ||
            {};

        const awaySeason =
            awayAnalysis?.seasonStrength ||
            awayAnalysis?.seasonVenueStrength ||
            awayAnalysis?.seasonStats ||
            {};

        const homeVenue =
            homeSeason?.home ||
            {};

        const awayVenue =
            awaySeason?.away ||
            {};

        const homeAttack = num(
            homeVenue.goalsForAvg ??
            homeVenue.gfAvg ??
            homeVenue.averageGoalsFor,
            1.0
        );

        const awayDefence = num(
            awayVenue.goalsAgainstAvg ??
            awayVenue.gaAvg ??
            awayVenue.averageGoalsAgainst,
            1.0
        );

        homeXG =
            (homeAttack + awayDefence) / 2;
    }


    if (!Number.isFinite(awayXG)) {

        const homeSeason =
            homeAnalysis?.seasonStrength ||
            homeAnalysis?.seasonVenueStrength ||
            homeAnalysis?.seasonStats ||
            {};

        const awaySeason =
            awayAnalysis?.seasonStrength ||
            awayAnalysis?.seasonVenueStrength ||
            awayAnalysis?.seasonStats ||
            {};

        const homeVenue =
            homeSeason?.home ||
            {};

        const awayVenue =
            awaySeason?.away ||
            {};

        const awayAttack = num(
            awayVenue.goalsForAvg ??
            awayVenue.gfAvg ??
            awayVenue.averageGoalsFor,
            1.0
        );

        const homeDefence = num(
            homeVenue.goalsAgainstAvg ??
            homeVenue.gaAvg ??
            homeVenue.averageGoalsAgainst,
            1.0
        );

        awayXG =
            (awayAttack + homeDefence) / 2;
    }


    homeXG = Math.max(0.05, homeXG);
    awayXG = Math.max(0.05, awayXG);


    // --------------------------------------------------------
    // Convert expected goals into a 0-1 advantage.
    //
    // This is NOT yet the final match probability.
    // --------------------------------------------------------

    const total =
        homeXG + awayXG;

    if (!total) {

        return {
            homeXG,
            awayXG,
            homeScore: 0.5
        };

    }


    const homeShare =
        homeXG / total;


    return {
        homeXG,
        awayXG,
        homeScore: clamp(homeShare)
    };
}


// ============================================================
// H2H SCORE
// ============================================================

function extractH2HScore(
    homeAnalysis,
    awayAnalysis
) {

    const homeH2H =
        homeAnalysis?.h2h ||
        homeAnalysis?.headToHead ||
        {};

    const direct =
        homeH2H?.score ??
        homeH2H?.homeScore ??
        homeH2H?.teamScore ??
        homeH2H?.advantage;


    const directNumber = Number(direct);

    if (Number.isFinite(directNumber)) {

        if (directNumber >= 0 && directNumber <= 1) {
            return directNumber;
        }

        if (directNumber > 1 && directNumber <= 100) {
            return directNumber / 100;
        }

    }


    // --------------------------------------------------------
    // Try to calculate from last-five H2H.
    // --------------------------------------------------------

    const matches =
        homeH2H?.lastFive ||
        homeH2H?.matches ||
        homeH2H?.fixtures ||
        [];


    if (!Array.isArray(matches) || !matches.length) {
        return 0.5;
    }


    let points = 0;
    let maxPoints = 0;


    for (const match of matches.slice(0, 5)) {

        const homeTeamId =
            normalizeTeamId(
                match?.teams?.home?.id ??
                match?.homeTeamId
            );

        const awayTeamId =
            normalizeTeamId(
                match?.teams?.away?.id ??
                match?.awayTeamId
            );

        const homeGoals =
            num(
                match?.goals?.home ??
                match?.score?.fulltime?.home,
                NaN
            );

        const awayGoals =
            num(
                match?.goals?.away ??
                match?.score?.fulltime?.away,
                NaN
            );


        if (
            !Number.isFinite(homeGoals) ||
            !Number.isFinite(awayGoals)
        ) {
            continue;
        }


        const weight = 1;

        maxPoints += 3 * weight;


        const homeIsTarget =
            homeTeamId &&
            homeTeamId === normalizeTeamId(
                homeAnalysis?.team?.id ??
                homeAnalysis?.teamId
            );


        const awayIsTarget =
            awayTeamId &&
            awayTeamId === normalizeTeamId(
                homeAnalysis?.team?.id ??
                homeAnalysis?.teamId
            );


        if (homeIsTarget) {

            if (homeGoals > awayGoals) {
                points += 3 * weight;
            } else if (homeGoals === awayGoals) {
                points += 1 * weight;
            }

        } else if (awayIsTarget) {

            if (awayGoals > homeGoals) {
                points += 3 * weight;
            } else if (awayGoals === homeGoals) {
                points += 1 * weight;
            }

        }

    }


    if (!maxPoints) {
        return 0.5;
    }


    return clamp(points / maxPoints);
}


// ============================================================
// SIGNAL EXTRACTION
// ============================================================

function buildSignals(
    homeAnalysis,
    awayAnalysis
) {

    const recentHome =
        extractRecentFormScore(
            homeAnalysis
        );

    const recentAway =
        extractRecentFormScore(
            awayAnalysis
        );


    const standingHome =
        extractStandingsScore(
            homeAnalysis
        );

    const standingAway =
        extractStandingsScore(
            awayAnalysis
        );


    const seasonHome =
        extractSeasonVenueScore(
            homeAnalysis,
            "home"
        );

    const seasonAway =
        extractSeasonVenueScore(
            awayAnalysis,
            "away"
        );


    const recentVenueHome =
        extractRecentVenueScore(
            homeAnalysis,
            "home"
        );

    const recentVenueAway =
        extractRecentVenueScore(
            awayAnalysis,
            "away"
        );


    const goalModel =
        extractGoalModel(
            homeAnalysis,
            awayAnalysis
        );


    const h2hHome =
        extractH2HScore(
            homeAnalysis,
            awayAnalysis
        );


    const h2hAway =
        1 - h2hHome;


    return {

        recentForm: {
            home: recentHome,
            away: recentAway
        },

        standings: {
            home: standingHome,
            away: standingAway
        },

        seasonVenue: {
            home: seasonHome,
            away: seasonAway
        },

        expectedGoals: {
            home: goalModel.homeScore,
            away: 1 - goalModel.homeScore,
            homeXG: goalModel.homeXG,
            awayXG: goalModel.awayXG
        },

        recentVenueForm: {
            home: recentVenueHome,
            away: recentVenueAway
        },

        h2h: {
            home: h2hHome,
            away: h2hAway
        }

    };
}


// ============================================================
// CONVERT TEAM SCORES TO MATCH PROBABILITY
// ============================================================
//
// Every signal gives us a relative strength:
//
// homeStrength
// awayStrength
//
// We convert those into a normalized home/away share.
//
// Draw probability is calculated separately from:
//
// 1. similarity between the teams
// 2. expected-goal total
//
// This prevents every match from becoming H/A only.
// ============================================================

function normalizeTwoWay(home, away) {

    home = clamp(home);
    away = clamp(away);

    const total = home + away;

    if (total <= 0) {
        return {
            home: 0.5,
            away: 0.5
        };
    }

    return {
        home: home / total,
        away: away / total
    };
}


// ============================================================
// DRAW MODEL
// ============================================================

function calculateDrawProbability(
    signals,
    homeXG,
    awayXG
) {

    const closenessValues = [
        Math.abs(
            signals.recentForm.home -
            signals.recentForm.away
        ),

        Math.abs(
            signals.standings.home -
            signals.standings.away
        ),

        Math.abs(
            signals.seasonVenue.home -
            signals.seasonVenue.away
        ),

        Math.abs(
            signals.expectedGoals.home -
            signals.expectedGoals.away
        ),

        Math.abs(
            signals.recentVenueForm.home -
            signals.recentVenueForm.away
        ),

        Math.abs(
            signals.h2h.home -
            signals.h2h.away
        )
    ];


    const closeness =
        1 - average(closenessValues);


    const totalXG =
        Math.max(
            0,
            num(homeXG) +
            num(awayXG)
        );


    // Lower expected total generally increases
    // the possibility of a draw.
    const goalDrawFactor =
        clamp(
            1 -
            ((totalXG - 1.8) / 2.5)
        );


    // Balanced teams + lower scoring environment.
    let draw =
        0.18 +
        (closeness * 0.16) +
        (goalDrawFactor * 0.08);


    return clamp(
        draw,
        0.12,
        0.38
    );
}


// ============================================================
// FINAL PROBABILITY ENGINE
// ============================================================

function calculateProbabilities(
    signals,
    homeXG,
    awayXG
) {

    let homeStrength =
        (signals.recentForm.home *
            WEIGHTS.recentForm) +

        (signals.standings.home *
            WEIGHTS.standings) +

        (signals.seasonVenue.home *
            WEIGHTS.seasonVenue) +

        (signals.expectedGoals.home *
            WEIGHTS.expectedGoals) +

        (signals.recentVenueForm.home *
            WEIGHTS.recentVenueForm) +

        (signals.h2h.home *
            WEIGHTS.h2h);


    let awayStrength =
        (signals.recentForm.away *
            WEIGHTS.recentForm) +

        (signals.standings.away *
            WEIGHTS.standings) +

        (signals.seasonVenue.away *
            WEIGHTS.seasonVenue) +

        (signals.expectedGoals.away *
            WEIGHTS.expectedGoals) +

        (signals.recentVenueForm.away *
            WEIGHTS.recentVenueForm) +

        (signals.h2h.away *
            WEIGHTS.h2h);


    const twoWay =
        normalizeTwoWay(
            homeStrength,
            awayStrength
        );


    const drawProbability =
        calculateDrawProbability(
            signals,
            homeXG,
            awayXG
        );


    // Remaining probability is divided between H/A
    // according to the six-signal strength calculation.
    const nonDraw =
        1 - drawProbability;


    let homeProbability =
        twoWay.home * nonDraw;

    let awayProbability =
        twoWay.away * nonDraw;


    // --------------------------------------------------------
    // Final normalization
    // --------------------------------------------------------

    const total =
        homeProbability +
        drawProbability +
        awayProbability;


    homeProbability =
        homeProbability / total;

    awayProbability =
        awayProbability / total;


    const finalDraw =
        drawProbability / total;


    return {

        home:
            clamp(homeProbability),

        draw:
            clamp(finalDraw),

        away:
            clamp(awayProbability),

        rawStrength: {
            home: homeStrength,
            away: awayStrength
        }

    };
}


// ============================================================
// PREDICTION LABEL
// ============================================================

function getPredictionLabel(
    probabilities,
    homeName,
    awayName
) {

    const candidates = [
        {
            key: "home",
            probability: probabilities.home,
            label: homeName,
            market: "HOME WIN"
        },
        {
            key: "draw",
            probability: probabilities.draw,
            label: "Draw",
            market: "DRAW"
        },
        {
            key: "away",
            probability: probabilities.away,
            label: awayName,
            market: "AWAY WIN"
        }
    ];


    candidates.sort(
        (a, b) =>
            b.probability -
            a.probability
    );


    const winner =
        candidates[0];


    return {
        result: winner.key,
        market: winner.market,
        team: winner.label,
        probability: winner.probability
    };
}


// ============================================================
// CONFIDENCE
// ============================================================
//
// This is NOT a prediction probability.
// It describes the separation between the highest and
// second-highest outcome.
//
// No "guaranteed" language.
// ============================================================

function calculateConfidence(
    probabilities
) {

    const values = [
        probabilities.home,
        probabilities.draw,
        probabilities.away
    ].sort(
        (a, b) => b - a
    );


    const separation =
        values[0] - values[1];


    if (separation >= 0.30) {
        return "HIGH";
    }

    if (separation >= 0.15) {
        return "MEDIUM";
    }

    return "LOW";
}


// ============================================================
// FORMAT PERCENTAGE
// ============================================================

function percentage(value) {

    return Number(
        (clamp(value) * 100).toFixed(2)
    );

}


// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(req, res) {

    try {

        const apiKey =
            process.env.APIFOOTBALL_KEY;


        if (!apiKey) {

            return res.status(500).json({
                error:
                    "API key is not configured."
            });

        }


        // ----------------------------------------------------
        // ACCEPTED INPUTS
        //
        // Preferred:
        // ?fixture=123456
        //
        // Also supported:
        // ?homeTeam=123&awayTeam=456&league=39&season=2026
        //
        // ----------------------------------------------------

        const {
            fixture,
            homeTeam,
            awayTeam,
            league,
            season,
            from,
            to
        } = req.query;


        let fixtureId =
            fixture
                ? Number(fixture)
                : null;


        let homeTeamId =
            normalizeTeamId(
                homeTeam
            );


        let awayTeamId =
            normalizeTeamId(
                awayTeam
            );


        let resolvedLeague =
            league
                ? Number(league)
                : null;


        let resolvedSeason =
            season
                ? Number(season)
                : null;


        let homeName =
            "Home Team";

        let awayName =
            "Away Team";


        // ----------------------------------------------------
        // IF FIXTURE ID WAS PROVIDED, RESOLVE THE MATCH.
        // ----------------------------------------------------

        if (fixtureId) {

            if (
                !Number.isInteger(fixtureId) ||
                fixtureId <= 0
            ) {

                return res.status(400).json({
                    error:
                        "Invalid fixture ID."
                });

            }


            const match =
                await getFixture(
                    fixtureId,
                    apiKey
                );


            homeTeamId =
                homeTeamId ||
                normalizeTeamId(
                    match?.teams?.home?.id
                );


            awayTeamId =
                awayTeamId ||
                normalizeTeamId(
                    match?.teams?.away?.id
                );


            homeName =
                match?.teams?.home?.name ||
                homeName;


            awayName =
                match?.teams?.away?.name ||
                awayName;


            resolvedLeague =
                resolvedLeague ||
                num(
                    match?.league?.id,
                    null
                );


            resolvedSeason =
                resolvedSeason ||
                num(
                    match?.league?.season,
                    null
                );

        }


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (!homeTeamId) {

            return res.status(400).json({
                error:
                    "Home team ID is required."
            });

        }


        if (!awayTeamId) {

            return res.status(400).json({
                error:
                    "Away team ID is required."
            });

        }


        if (!resolvedLeague) {

            return res.status(400).json({
                error:
                    "League ID is required. Provide ?league=ID or a valid fixture ID."
            });

        }


        if (!resolvedSeason) {

            return res.status(400).json({
                error:
                    "Season is required. Provide ?season=YYYY or a valid fixture ID."
            });

        }


        // ----------------------------------------------------
        // ANALYZE BOTH TEAMS
        // ----------------------------------------------------

        const [
            homeAnalysis,
            awayAnalysis
        ] = await Promise.all([

            callAnalyze({
                req,
                teamId: homeTeamId,
                opponentId: awayTeamId,
                league: resolvedLeague,
                season: resolvedSeason,
                from,
                to
            }),

            callAnalyze({
                req,
                teamId: awayTeamId,
                opponentId: homeTeamId,
                league: resolvedLeague,
                season: resolvedSeason,
                from,
                to
            })

        ]);


        // ----------------------------------------------------
        // BUILD SIX SIGNALS
        // ----------------------------------------------------

        const signals =
            buildSignals(
                homeAnalysis,
                awayAnalysis
            );


        // ----------------------------------------------------
        // CALCULATE FINAL PROBABILITIES
        // ----------------------------------------------------

        const goalModel =
            signals.expectedGoals;


        const probabilities =
            calculateProbabilities(
                signals,
                goalModel.homeXG,
                goalModel.awayXG
            );


        // ----------------------------------------------------
        // FINAL PREDICTION
        // ----------------------------------------------------

        const prediction =
            getPredictionLabel(
                probabilities,
                homeName,
                awayName
            );


        const confidence =
            calculateConfidence(
                probabilities
            );


        // ----------------------------------------------------
        // OPTIONAL SIMPLE SCORE ESTIMATE
        //
        // This is only a display estimate based on xG.
        // It does NOT influence the 1X2 calculation.
        // ----------------------------------------------------

        const estimatedHomeGoals =
            Math.max(
                0,
                Math.round(
                    goalModel.homeXG
                )
            );


        const estimatedAwayGoals =
            Math.max(
                0,
                Math.round(
                    goalModel.awayXG
                )
            );


        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------

        return res.status(200).json({

            success: true,

            engine: {
                name:
                    "TOMSONSTAKES GLOBAL FOOTBALL PREDICTION ENGINE",

                version:
                    "V4.1",

                method:
                    "Six-signal weighted probability model",

                injuriesUsed:
                    false,

                lineupsUsed:
                    false,

                bookmakerOddsUsed:
                    false,

                apiFootballPredictionUsed:
                    false,

                artificialHomeBias:
                    false
            },


            fixture: {
                id:
                    fixtureId,

                league:
                    resolvedLeague,

                season:
                    resolvedSeason
            },


            match: {

                home: {
                    id:
                        homeTeamId,

                    name:
                        homeName
                },

                away: {
                    id:
                        awayTeamId,

                    name:
                        awayName
                }

            },


            weights: {

                recentForm:
                    WEIGHTS.recentForm,

                standings:
                    WEIGHTS.standings,

                seasonVenue:
                    WEIGHTS.seasonVenue,

                expectedGoals:
                    WEIGHTS.expectedGoals,

                recentVenueForm:
                    WEIGHTS.recentVenueForm,

                h2h:
                    WEIGHTS.h2h

            },


            signals: {

                recentForm: {
                    home:
                        Number(
                            signals.recentForm.home.toFixed(4)
                        ),

                    away:
                        Number(
                            signals.recentForm.away.toFixed(4)
                        )
                },


                standings: {
                    home:
                        Number(
                            signals.standings.home.toFixed(4)
                        ),

                    away:
                        Number(
                            signals.standings.away.toFixed(4)
                        )
                },


                seasonVenue: {
                    home:
                        Number(
                            signals.seasonVenue.home.toFixed(4)
                        ),

                    away:
                        Number(
                            signals.seasonVenue.away.toFixed(4)
                        )
                },


                expectedGoals: {
                    home:
                        Number(
                            signals.expectedGoals.home.toFixed(4)
                        ),

                    away:
                        Number(
                            signals.expectedGoals.away.toFixed(4)
                        ),

                    homeXG:
                        Number(
                            signals.expectedGoals.homeXG.toFixed(2)
                        ),

                    awayXG:
                        Number(
                            signals.expectedGoals.awayXG.toFixed(2)
                        )
                },


                recentVenueForm: {
                    home:
                        Number(
                            signals.recentVenueForm.home.toFixed(4)
                        ),

                    away:
                        Number(
                            signals.recentVenueForm.away.toFixed(4)
                        )
                },


                h2h: {
                    home:
                        Number(
                            signals.h2h.home.toFixed(4)
                        ),

                    away:
                        Number(
                            signals.h2h.away.toFixed(4)
                        )
                }

            },


            probability: {

                home:
                    percentage(
                        probabilities.home
                    ),

                draw:
                    percentage(
                        probabilities.draw
                    ),

                away:
                    percentage(
                        probabilities.away
                    )

            },


            prediction: {

                result:
                    prediction.result,

                market:
                    prediction.market,

                team:
                    prediction.team,

                probability:
                    percentage(
                        prediction.probability
                    ),

                confidence

            },


            estimatedScore: {

                home:
                    estimatedHomeGoals,

                away:
                    estimatedAwayGoals

            },


            rawStrength: {

                home:
                    Number(
                        probabilities.rawStrength.home.toFixed(4)
                    ),

                away:
                    Number(
                        probabilities.rawStrength.away.toFixed(4)
                    )

            },


            generatedAt:
                new Date().toISOString()

        });


    } catch (error) {

        console.error(
            "TOMSONSTAKES predict error:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                error?.message ||
                "Prediction engine failed.",

            engine:
                "TOMSONSTAKES V4.1"

        });

    }

}
