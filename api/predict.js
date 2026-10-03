// ============================================================
// TOMSONSTAKES GLOBAL FOOTBALL PREDICTION ENGINE
// api/predict.js
// VERSION 4.0
// ============================================================
//
// MODEL WEIGHTS
//
// Last 5 matches — recency weighted       45%
// Current league standings                30%
// Season home/away strength                5%
// Expected goals / goal model             10%
// Recent home/away venue form              5%
// Last 5 H2H                               5%
// ---------------------------------------------
// TOTAL                                  100%
//
// IMPORTANT
// - No artificial home-win bias.
// - No hardcoded Home Win.
// - API-Football's /predictions endpoint is NOT used
//   as a probability signal.
// - Injuries do NOT affect probabilities.
// - Lineups do NOT affect probabilities.
// - The highest calculated H/D/A probability wins.
// - Missing signals are neutral, not artificially forced.
// - Team IDs can be resolved from the fixture/date/team names.
//
// Environment variable required:
//
// APIFOOTBALL_KEY
//
// API base:
// https://v3.football.api-sports.io
//
// ============================================================

const API_BASE = "https://v3.football.api-sports.io";
const TIMEZONE = "Africa/Lagos";

// ------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------

const WEIGHTS = {
    form: 0.45,
    standings: 0.30,
    seasonStrength: 0.05,
    xg: 0.10,
    venueForm: 0.05,
    h2h: 0.05
};

const RECENCY_WEIGHTS = [
    0.10, // oldest
    0.15,
    0.20,
    0.25,
    0.30  // newest
];

const FINISHED_STATUSES = new Set([
    "FT",
    "AET",
    "PEN"
]);

const EXCLUDED_STATUSES = new Set([
    "NS",
    "TBD",
    "PST",
    "CANC",
    "ABD",
    "SUSP"
]);

// ------------------------------------------------------------
// BASIC HELPERS
// ------------------------------------------------------------

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round((safeNumber(value) + Number.EPSILON) * factor) / factor;
}

function sum(values) {
    return values.reduce((a, b) => a + safeNumber(b), 0);
}

function average(values, fallback = 0) {
    const valid = values
        .map(Number)
        .filter(Number.isFinite);

    if (!valid.length) return fallback;

    return sum(valid) / valid.length;
}

function normalizeProbabilityObject(home, draw, away) {
    let h = Math.max(0, safeNumber(home));
    let d = Math.max(0, safeNumber(draw));
    let a = Math.max(0, safeNumber(away));

    const total = h + d + a;

    if (total <= 0) {
        return {
            home: 33.33,
            draw: 33.34,
            away: 33.33
        };
    }

    h = (h / total) * 100;
    d = (d / total) * 100;
    a = (a / total) * 100;

    return {
        home: round(h, 2),
        draw: round(d, 2),
        away: round(a, 2)
    };
}

function blendProbabilitySignals(signals) {
    let home = 0;
    let draw = 0;
    let away = 0;
    let totalWeight = 0;

    for (const signal of signals) {
        if (!signal) continue;

        const weight = safeNumber(signal.weight);

        if (weight <= 0) continue;

        const p = signal.probabilities || {};

        home += safeNumber(p.home, 33.3333) * weight;
        draw += safeNumber(p.draw, 33.3333) * weight;
        away += safeNumber(p.away, 33.3333) * weight;

        totalWeight += weight;
    }

    if (totalWeight <= 0) {
        return normalizeProbabilityObject(33.33, 33.34, 33.33);
    }

    return normalizeProbabilityObject(
        home / totalWeight,
        draw / totalWeight,
        away / totalWeight
    );
}

function getHighestOutcome(probabilities) {
    const entries = [
        ["Home Win", safeNumber(probabilities.home)],
        ["Draw", safeNumber(probabilities.draw)],
        ["Away Win", safeNumber(probabilities.away)]
    ];

    entries.sort((a, b) => b[1] - a[1]);

    return {
        prediction: entries[0][0],
        probability: round(entries[0][1], 2)
    };
}

function confidenceFromProbability(probability) {
    const p = safeNumber(probability);

    if (p < 60) return "AVOID";
    if (p <= 80) return "MEDIUM";
    return "HIGH";
}

function outcomeCodeForFixture(fixture, teamId) {
    if (!fixture || !fixture.teams || !fixture.goals) return null;

    const homeId = safeNumber(fixture.teams.home?.id);
    const awayId = safeNumber(fixture.teams.away?.id);

    const homeGoals = safeNumber(fixture.goals.home, NaN);
    const awayGoals = safeNumber(fixture.goals.away, NaN);

    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) {
        return null;
    }

    const id = safeNumber(teamId);

    if (id === homeId) {
        if (homeGoals > awayGoals) return "W";
        if (homeGoals < awayGoals) return "L";
        return "D";
    }

    if (id === awayId) {
        if (awayGoals > homeGoals) return "W";
        if (awayGoals < homeGoals) return "L";
        return "D";
    }

    return null;
}

function fixtureDateValue(fixture) {
    if (fixture?.fixture?.timestamp) {
        return safeNumber(fixture.fixture.timestamp);
    }

    if (fixture?.fixture?.date) {
        const t = Date.parse(fixture.fixture.date);
        if (Number.isFinite(t)) return t / 1000;
    }

    return 0;
}

function isFinishedFixture(fixture) {
    const status = fixture?.fixture?.status?.short;

    if (FINISHED_STATUSES.has(status)) return true;
    if (EXCLUDED_STATUSES.has(status)) return false;

    return false;
}

function cleanTeamName(name) {
    return String(name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\b(fc|cf|sc|afc|ac|club|de|cd)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function teamNameScore(a, b) {
    const x = cleanTeamName(a);
    const y = cleanTeamName(b);

    if (!x || !y) return 0;

    if (x === y) return 1;

    if (x.includes(y) || y.includes(x)) {
        return 0.92;
    }

    const ax = new Set(x.split(" "));
    const by = new Set(y.split(" "));

    let common = 0;

    for (const word of ax) {
        if (by.has(word)) common++;
    }

    const denominator = Math.max(ax.size, by.size);

    return denominator ? common / denominator : 0;
}

// ------------------------------------------------------------
// API REQUEST
// ------------------------------------------------------------

async function apiGet(endpoint, params = {}) {
    const key = process.env.APIFOOTBALL_KEY;

    if (!key) {
        throw new Error(
            "APIFOOTBALL_KEY environment variable is missing."
        );
    }

    const url = new URL(`${API_BASE}${endpoint}`);

    for (const [keyName, value] of Object.entries(params)) {
        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        ) {
            url.searchParams.set(keyName, String(value));
        }
    }

    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            "x-apisports-key": key
        }
    });

    let data;

    try {
        data = await response.json();
    } catch (error) {
        throw new Error(
            `API-Football returned invalid JSON (${response.status}).`
        );
    }

    if (!response.ok) {
        const apiErrors = data?.errors
            ? JSON.stringify(data.errors)
            : `HTTP ${response.status}`;

        throw new Error(apiErrors);
    }

    if (Array.isArray(data?.errors) && data.errors.length > 0) {
        throw new Error(JSON.stringify(data.errors));
    }

    if (data?.errors && typeof data.errors === "object") {
        const errorValues = Object.values(data.errors);

        if (errorValues.length) {
            throw new Error(errorValues.join("; "));
        }
    }

    return data;
}

// ------------------------------------------------------------
// RESPONSE EXTRACTION
// ------------------------------------------------------------

function apiResponse(data) {
    return Array.isArray(data?.response)
        ? data.response
        : [];
}

// ------------------------------------------------------------
// INPUT EXTRACTION
// ------------------------------------------------------------

function extractInput(body) {
    const match = body?.match || {};
    const normalized = body?.normalized || {};

    const homeTeamId =
        safeNumber(
            match.homeTeamId ??
            match.home_id ??
            match.homeTeam?.id ??
            normalized.homeTeamId ??
            normalized.home?.id ??
            normalized.fixture?.teams?.home?.id,
            0
        ) || null;

    const awayTeamId =
        safeNumber(
            match.awayTeamId ??
            match.away_id ??
            match.awayTeam?.id ??
            normalized.awayTeamId ??
            normalized.away?.id ??
            normalized.fixture?.teams?.away?.id,
            0
        ) || null;

    const fixtureId =
        safeNumber(
            match.fixtureId ??
            match.fixture_id ??
            match.id ??
            normalized.fixtureId ??
            normalized.fixture?.fixture?.id ??
            normalized.fixture?.id,
            0
        ) || null;

    const homeName =
        match.homeTeamName ??
        match.homeTeam ??
        match.home ??
        normalized.homeTeamName ??
        normalized.home?.name ??
        normalized.fixture?.teams?.home?.name ??
        "";

    const awayName =
        match.awayTeamName ??
        match.awayTeam ??
        match.away ??
        normalized.awayTeamName ??
        normalized.away?.name ??
        normalized.fixture?.teams?.away?.name ??
        "";

    const date =
        match.date ??
        match.matchDate ??
        normalized.date ??
        normalized.fixture?.fixture?.date ??
        normalized.fixture?.date ??
        null;

    return {
        fixtureId,
        homeTeamId,
        awayTeamId,
        homeName: typeof homeName === "object"
            ? homeName.name || ""
            : String(homeName || ""),
        awayName: typeof awayName === "object"
            ? awayName.name || ""
            : String(awayName || ""),
        date
    };
}

// ------------------------------------------------------------
// FIXTURE RESOLUTION
// ------------------------------------------------------------

async function getFixtureById(fixtureId) {
    if (!fixtureId) return null;

    try {
        const data = await apiGet("/fixtures", {
            id: fixtureId,
            timezone: TIMEZONE
        });

        return apiResponse(data)[0] || null;
    } catch (error) {
        return null;
    }
}

function dateOnly(dateValue) {
    if (!dateValue) return null;

    const value = String(dateValue);

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) return null;

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(parsed);
}

function fixtureDateInLagos(fixture) {
    if (!fixture?.fixture?.date) return null;

    return dateOnly(fixture.fixture.date);
}

function findBestFixture(fixtures, homeName, awayName) {
    if (!Array.isArray(fixtures) || !fixtures.length) {
        return null;
    }

    let best = null;
    let bestScore = -1;

    for (const fixture of fixtures) {
        if (!fixture?.teams?.home || !fixture?.teams?.away) {
            continue;
        }

        const homeScore = teamNameScore(
            homeName,
            fixture.teams.home.name
        );

        const awayScore = teamNameScore(
            awayName,
            fixture.teams.away.name
        );

        const directScore =
            (homeScore * 0.5) +
            (awayScore * 0.5);

        if (directScore > bestScore) {
            bestScore = directScore;

            best = {
                fixture,
                score: directScore
            };
        }
    }

    return best && best.score >= 0.45
        ? best.fixture
        : null;
}

async function resolveFixture(input) {
    let fixture = null;

    // --------------------------------------------------------
    // 1. Direct fixture ID
    // --------------------------------------------------------

    if (input.fixtureId) {
        fixture = await getFixtureById(input.fixtureId);

        if (fixture) {
            return fixture;
        }
    }

    // --------------------------------------------------------
    // 2. Search fixture by date and team names
    // --------------------------------------------------------

    const requestedDate =
        dateOnly(input.date) ||
        dateOnly(new Date());

    if (requestedDate) {
        try {
            const data = await apiGet("/fixtures", {
                date: requestedDate,
                timezone: TIMEZONE
            });

            const fixtures = apiResponse(data);

            fixture = findBestFixture(
                fixtures,
                input.homeName,
                input.awayName
            );

            if (fixture) {
                return fixture;
            }
        } catch (error) {
            // Continue to fallback resolution.
        }
    }

    // --------------------------------------------------------
    // 3. Search teams individually if fixture lookup failed
    // --------------------------------------------------------

    let homeTeamId = input.homeTeamId;
    let awayTeamId = input.awayTeamId;

    if (!homeTeamId && input.homeName) {
        homeTeamId = await resolveTeamId(input.homeName);
    }

    if (!awayTeamId && input.awayName) {
        awayTeamId = await resolveTeamId(input.awayName);
    }

    // --------------------------------------------------------
    // 4. If IDs are available, search fixtures by both teams
    // --------------------------------------------------------

    if (homeTeamId && awayTeamId) {
        try {
            const teamFixtures = await apiGet("/fixtures", {
                team: homeTeamId,
                last: 20,
                timezone: TIMEZONE
            });

            const fixtures = apiResponse(teamFixtures);

            const candidate = fixtures.find((f) => {
                const h = safeNumber(f?.teams?.home?.id);
                const a = safeNumber(f?.teams?.away?.id);

                return (
                    (h === homeTeamId && a === awayTeamId) ||
                    (h === awayTeamId && a === homeTeamId)
                );
            });

            if (candidate) {
                return candidate;
            }
        } catch (error) {
            // Continue.
        }
    }

    return null;
}

// ------------------------------------------------------------
// TEAM ID RESOLUTION
// ------------------------------------------------------------

async function resolveTeamId(teamName) {
    if (!teamName) return null;

    try {
        const data = await apiGet("/teams", {
            search: teamName
        });

        const teams = apiResponse(data);

        if (!teams.length) return null;

        let best = null;
        let bestScore = 0;

        for (const item of teams) {
            const team = item?.team || item;

            const score = teamNameScore(
                teamName,
                team?.name
            );

            if (score > bestScore) {
                bestScore = score;

                best = safeNumber(team?.id, 0) || null;
            }
        }

        return best;
    } catch (error) {
        return null;
    }
}

// ------------------------------------------------------------
// RECENT FIXTURES
// ------------------------------------------------------------

async function getRecentFixtures(teamId, count = 5) {
    if (!teamId) return [];

    try {
        const data = await apiGet("/fixtures", {
            team: teamId,
            last: count,
            timezone: TIMEZONE
        });

        const fixtures = apiResponse(data)
            .filter(isFinishedFixture)
            .sort(
                (a, b) =>
                    fixtureDateValue(a) -
                    fixtureDateValue(b)
            );

        return fixtures.slice(-count);
    } catch (error) {
        return [];
    }
}

// ------------------------------------------------------------
// STANDINGS
// ------------------------------------------------------------

function flattenStandings(response) {
    const result = [];

    for (const group of response || []) {
        if (Array.isArray(group)) {
            result.push(...group);
            continue;
        }

        if (Array.isArray(group?.league?.standings)) {
            for (const table of group.league.standings) {
                if (Array.isArray(table)) {
                    result.push(...table);
                }
            }
        }
    }

    return result;
}

async function getStandings(leagueId, season) {
    if (!leagueId || !season) {
        return [];
    }

    try {
        const data = await apiGet("/standings", {
            league: leagueId,
            season
        });

        return flattenStandings(apiResponse(data));
    } catch (error) {
        return [];
    }
}

function findStanding(standings, teamId) {
    return standings.find(
        (row) =>
            safeNumber(row?.team?.id) ===
            safeNumber(teamId)
    ) || null;
}

// ------------------------------------------------------------
// TEAM SEASON STATISTICS
// ------------------------------------------------------------

async function getTeamStatistics(leagueId, season, teamId) {
    if (!leagueId || !season || !teamId) {
        return null;
    }

    try {
        const data = await apiGet("/teams/statistics", {
            league: leagueId,
            season,
            team: teamId
        });

        return apiResponse(data)[0] || null;
    } catch (error) {
        return null;
    }
}

// ------------------------------------------------------------
// H2H
// ------------------------------------------------------------

async function getH2H(homeTeamId, awayTeamId) {
    if (!homeTeamId || !awayTeamId) {
        return [];
    }

    try {
        const data = await apiGet(
            "/fixtures/headtohead",
            {
                h2h: `${homeTeamId}-${awayTeamId}`,
                last: 5,
                timezone: TIMEZONE
            }
        );

        return apiResponse(data)
            .filter(isFinishedFixture)
            .sort(
                (a, b) =>
                    fixtureDateValue(a) -
                    fixtureDateValue(b)
            )
            .slice(-5);
    } catch (error) {
        return [];
    }
}

// ------------------------------------------------------------
// SIGNAL 1
// LAST 5 MATCHES — 45%
//
// Recency:
// oldest  10%
// second   15%
// third    20%
// fourth   25%
// newest   30%
//
// The form rating combines:
// - points
// - goal difference
// - goals scored
// - goals conceded
//
// No home advantage is added here.
// ------------------------------------------------------------

function calculateFormRating(fixtures, teamId) {
    if (!fixtures.length) {
        return null;
    }

    let weightedPoints = 0;
    let weightedGD = 0;
    let weightedGF = 0;
    let weightedGA = 0;
    let totalWeight = 0;

    fixtures.forEach((fixture, index) => {
        const homeId = safeNumber(
            fixture?.teams?.home?.id
        );

        const awayId = safeNumber(
            fixture?.teams?.away?.id
        );

        const homeGoals = safeNumber(
            fixture?.goals?.home,
            NaN
        );

        const awayGoals = safeNumber(
            fixture?.goals?.away,
            NaN
        );

        if (
            !Number.isFinite(homeGoals) ||
            !Number.isFinite(awayGoals)
        ) {
            return;
        }

        const isHome = homeId === safeNumber(teamId);

        const gf = isHome
            ? homeGoals
            : awayGoals;

        const ga = isHome
            ? awayGoals
            : homeGoals;

        let points = 0;

        if (gf > ga) points = 3;
        else if (gf === ga) points = 1;

        const gd = gf - ga;

        const weight =
            RECENCY_WEIGHTS[
                Math.min(
                    index,
                    RECENCY_WEIGHTS.length - 1
                )
            ];

        weightedPoints += points * weight;
        weightedGD += clamp(gd, -4, 4) * weight;
        weightedGF += clamp(gf, 0, 5) * weight;
        weightedGA += clamp(ga, 0, 5) * weight;

        totalWeight += weight;
    });

    if (!totalWeight) return null;

    weightedPoints /= totalWeight;
    weightedGD /= totalWeight;
    weightedGF /= totalWeight;
    weightedGA /= totalWeight;

    // 70% result points
    // 20% goal difference
    // 10% attacking/defensive output
    const resultComponent =
        (weightedPoints / 3) * 0.70;

    const gdComponent =
        ((weightedGD + 4) / 8) * 0.20;

    const goalComponent =
        clamp(
            ((weightedGF - weightedGA) + 5) / 10,
            0,
            1
        ) * 0.10;

    const rating =
        resultComponent +
        gdComponent +
        goalComponent;

    return {
        rating,
        weightedPoints,
        weightedGD,
        weightedGF,
        weightedGA,
        matches: fixtures.length
    };
}

function formSignal(homeFixtures, awayFixtures) {
    const home = calculateFormRating(
        homeFixtures,
        homeFixtures[0]?.teams?.home?.id ||
        homeFixtures[0]?.teams?.away?.id
    );

    const away = calculateFormRating(
        awayFixtures,
        awayFixtures[0]?.teams?.home?.id ||
        awayFixtures[0]?.teams?.away?.id
    );

    if (!home || !away) {
        return {
            probabilities: normalizeProbabilityObject(
                33.33,
                33.34,
                33.33
            ),
            available: false,
            explanation: "Insufficient last-five-match data."
        };
    }

    return {
        probabilities: ratingDifferenceToProbabilities(
            home.rating - away.rating
        ),
        available: true,
        homeRating: home.rating,
        awayRating: away.rating,
        homeDetails: home,
        awayDetails: away
    };
}

// ------------------------------------------------------------
// Generic rating → H/D/A probability
//
// IMPORTANT:
// There is NO home advantage in this function.
//
// Positive difference = home stronger.
// Negative difference = away stronger.
// ------------------------------------------------------------

function ratingDifferenceToProbabilities(difference) {
    const d = clamp(
        safeNumber(difference),
        -1.5,
        1.5
    );

    const scale = 0.55;

    const homeRaw = Math.exp(d / scale);
    const awayRaw = Math.exp(-d / scale);

    // Neutral draw component.
    const drawRaw = 1;

    return normalizeProbabilityObject(
        homeRaw,
        drawRaw,
        awayRaw
    );
}

// ------------------------------------------------------------
// SIGNAL 2
// CURRENT LEAGUE STANDINGS — 30%
// ------------------------------------------------------------

function standingStrength(row) {
    if (!row) return null;

    const rank = safeNumber(row.rank, 0);
    const points = safeNumber(row.points, 0);
    const goalDiff = safeNumber(row.goalsDiff, 0);

    const played = Math.max(
        1,
        safeNumber(
            row.all?.played ??
            row.all?.games ??
            row.all?.played,
            1
        )
    );

    const pointsPerGame =
        points / played;

    const gdPerGame =
        goalDiff / played;

    return {
        rank,
        points,
        pointsPerGame,
        goalDiff,
        gdPerGame
    };
}

function standingsSignal(
    homeStanding,
    awayStanding
) {
    const home = standingStrength(
        homeStanding
    );

    const away = standingStrength(
        awayStanding
    );

    if (!home || !away) {
        return {
            probabilities: normalizeProbabilityObject(
                33.33,
                33.34,
                33.33
            ),
            available: false,
            explanation:
                "Current league standings unavailable."
        };
    }

    // Points per game is primary.
    // Goal difference per game provides secondary separation.
    const ppgDifference =
        clamp(
            home.pointsPerGame -
            away.pointsPerGame,
            -3,
            3
        );

    const gdDifference =
        clamp(
            home.gdPerGame -
            away.gdPerGame,
            -3,
            3
        );

    const rankDifference =
        clamp(
            away.rank - home.rank,
            -20,
            20
        );

    const rating =
        (ppgDifference / 3) * 0.60 +
        (gdDifference / 3) * 0.25 +
        (rankDifference / 20) * 0.15;

    return {
        probabilities:
            ratingDifferenceToProbabilities(
                rating
            ),
        available: true,
        home: home,
        away: away,
        rating
    };
}

// ------------------------------------------------------------
// SIGNAL 3
// SEASON HOME/AWAY STRENGTH — 5%
// ------------------------------------------------------------

function splitStrength(row, side) {
    if (!row) return null;

    const source = row[side];

    if (!source) return null;

    const played = Math.max(
        1,
        safeNumber(
            source.played ??
            source.games,
            1
        )
    );

    const wins = safeNumber(
        source.win ??
        source.wins,
        0
    );

    const draws = safeNumber(
        source.draw ??
        source.draws,
        0
    );

    const losses = safeNumber(
        source.lose ??
        source.losses,
        0
    );

    const gf = safeNumber(
        source.goals?.for ??
        source.goals?.for?.total ??
        0
    );

    const ga = safeNumber(
        source.goals?.against ??
        source.goals?.against?.total ??
        0
    );

    const points =
        wins * 3 +
        draws;

    const ppg =
        points / played;

    const gd =
        (gf - ga) / played;

    const winRate =
        wins / played;

    return {
        played,
        wins,
        draws,
        losses,
        gf,
        ga,
        ppg,
        gd,
        winRate
    };
}

function seasonStrengthSignal(
    homeStanding,
    awayStanding,
    homeStats,
    awayStats
) {
    let homeSplit =
        splitStrength(
            homeStanding,
            "home"
        );

    let awaySplit =
        splitStrength(
            awayStanding,
            "away"
        );

    // Fallback to team statistics if standings split
    // is unavailable.
    if (!homeSplit && homeStats) {
        homeSplit =
            statisticsSplitStrength(
                homeStats,
                "home"
            );
    }

    if (!awaySplit && awayStats) {
        awaySplit =
            statisticsSplitStrength(
                awayStats,
                "away"
            );
    }

    if (!homeSplit || !awaySplit) {
        return {
            probabilities:
                normalizeProbabilityObject(
                    33.33,
                    33.34,
                    33.33
                ),
            available: false
        };
    }

    const ppgDifference =
        clamp(
            homeSplit.ppg -
            awaySplit.ppg,
            -3,
            3
        );

    const gdDifference =
        clamp(
            homeSplit.gd -
            awaySplit.gd,
            -3,
            3
        );

    const winRateDifference =
        clamp(
            homeSplit.winRate -
            awaySplit.winRate,
            -1,
            1
        );

    const rating =
        (ppgDifference / 3) * 0.55 +
        (gdDifference / 3) * 0.25 +
        winRateDifference * 0.20;

    return {
        probabilities:
            ratingDifferenceToProbabilities(
                rating
            ),
        available: true,
        home: homeSplit,
        away: awaySplit,
        rating
    };
}

function statisticsSplitStrength(
    stats,
    side
) {
    const fixtures =
        stats?.fixtures?.played?.[side];

    const wins =
        stats?.fixtures?.wins?.[side];

    const draws =
        stats?.fixtures?.draws?.[side];

    const losses =
        stats?.fixtures?.loses?.[side];

    const gf =
        stats?.goals?.for?.average?.[side];

    const ga =
        stats?.goals?.against?.average?.[side];

    const played = Math.max(
        1,
        safeNumber(fixtures, 1)
    );

    const w = safeNumber(wins, 0);
    const d = safeNumber(draws, 0);
    const l = safeNumber(losses, 0);

    const points =
        w * 3 + d;

    const ppg =
        points / played;

    const avgGF =
        safeNumber(gf, 0);

    const avgGA =
        safeNumber(ga, 0);

    return {
        played,
        wins: w,
        draws: d,
        losses: l,
        gf: avgGF * played,
        ga: avgGA * played,
        ppg,
        gd: avgGF - avgGA,
        winRate: w / played
    };
}

// ------------------------------------------------------------
// SIGNAL 4
// EXPECTED GOALS / GOAL MODEL — 10%
//
// Uses Poisson distribution.
// ------------------------------------------------------------

function extractGoalAverage(stats, type, side) {
    if (!stats) return null;

    const value =
        stats?.goals?.[type]?.average?.[side];

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : null;
}

function recentGoalAverage(
    fixtures,
    teamId
) {
    if (!fixtures.length) {
        return null;
    }

    const gf = [];
    const ga = [];

    for (const fixture of fixtures) {
        const homeId =
            safeNumber(
                fixture?.teams?.home?.id
            );

        const awayId =
            safeNumber(
                fixture?.teams?.away?.id
            );

        const homeGoals =
            safeNumber(
                fixture?.goals?.home,
                NaN
            );

        const awayGoals =
            safeNumber(
                fixture?.goals?.away,
                NaN
            );

        if (
            !Number.isFinite(homeGoals) ||
            !Number.isFinite(awayGoals)
        ) {
            continue;
        }

        if (homeId === safeNumber(teamId)) {
            gf.push(homeGoals);
            ga.push(awayGoals);
        } else if (
            awayId === safeNumber(teamId)
        ) {
            gf.push(awayGoals);
            ga.push(homeGoals);
        }
    }

    if (!gf.length) return null;

    return {
        gf: average(gf),
        ga: average(ga)
    };
}

function poissonProbability(
    lambda,
    goals
) {
    if (
        lambda < 0 ||
        !Number.isFinite(lambda)
    ) {
        return 0;
    }

    let factorial = 1;

    for (let i = 2; i <= goals; i++) {
        factorial *= i;
    }

    return (
        Math.exp(-lambda) *
        Math.pow(lambda, goals) /
        factorial
    );
}

function poissonOutcomeProbabilities(
    homeXG,
    awayXG
) {
    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;

    for (let hg = 0; hg <= 8; hg++) {
        for (let ag = 0; ag <= 8; ag++) {
            const probability =
                poissonProbability(
                    homeXG,
                    hg
                ) *
                poissonProbability(
                    awayXG,
                    ag
                );

            if (hg > ag) {
                homeWin += probability;
            } else if (hg === ag) {
                draw += probability;
            } else {
                awayWin += probability;
            }
        }
    }

    return normalizeProbabilityObject(
        homeWin,
        draw,
        awayWin
    );
}

function calculateExpectedGoals(
    homeStats,
    awayStats,
    homeRecent,
    awayRecent
) {
    const homeAttack =
        extractGoalAverage(
            homeStats,
            "for",
            "home"
        );

    const homeDefense =
        extractGoalAverage(
            homeStats,
            "against",
            "home"
        );

    const awayAttack =
        extractGoalAverage(
            awayStats,
            "for",
            "away"
        );

    const awayDefense =
        extractGoalAverage(
            awayStats,
            "against",
            "away"
        );

    let homeXG = null;
    let awayXG = null;

    if (
        Number.isFinite(homeAttack) &&
        Number.isFinite(awayDefense)
    ) {
        homeXG =
            (homeAttack + awayDefense) / 2;
    }

    if (
        Number.isFinite(awayAttack) &&
        Number.isFinite(homeDefense)
    ) {
        awayXG =
            (awayAttack + homeDefense) / 2;
    }

    // Recent form goal data can stabilize sparse
    // season data.
    if (
        Number.isFinite(homeXG) &&
        homeRecent
    ) {
        homeXG =
            (homeXG * 0.75) +
            (homeRecent.gf * 0.25);
    }

    if (
        Number.isFinite(awayXG) &&
        awayRecent
    ) {
        awayXG =
            (awayXG * 0.75) +
            (awayRecent.gf * 0.25);
    }

    if (!Number.isFinite(homeXG)) {
        homeXG =
            homeRecent?.gf ?? 1.2;
    }

    if (!Number.isFinite(awayXG)) {
        awayXG =
            awayRecent?.gf ?? 1.0;
    }

    // Keep model in a realistic range.
    homeXG = clamp(homeXG, 0.15, 4.5);
    awayXG = clamp(awayXG, 0.15, 4.5);

    return {
        homeXG,
        awayXG,
        probabilities:
            poissonOutcomeProbabilities(
                homeXG,
                awayXG
            )
    };
}

// ------------------------------------------------------------
// SIGNAL 5
// RECENT HOME/AWAY VENUE FORM — 5%
//
// Home team's last matches specifically at home.
// Away team's last matches specifically away.
// ------------------------------------------------------------

function venueFixtures(
    fixtures,
    teamId,
    venue
) {
    return fixtures.filter((fixture) => {
        const homeId =
            safeNumber(
                fixture?.teams?.home?.id
            );

        const awayId =
            safeNumber(
                fixture?.teams?.away?.id
            );

        if (venue === "home") {
            return homeId === safeNumber(teamId);
        }

        if (venue === "away") {
            return awayId === safeNumber(teamId);
        }

        return false;
    });
}

function venueRating(
    fixtures,
    teamId
) {
    if (!fixtures.length) return null;

    let points = 0;
    let gd = 0;
    let count = 0;

    for (const fixture of fixtures) {
        const homeId =
            safeNumber(
                fixture?.teams?.home?.id
            );

        const awayId =
            safeNumber(
                fixture?.teams?.away?.id
            );

        const hg =
            safeNumber(
                fixture?.goals?.home,
                NaN
            );

        const ag =
            safeNumber(
                fixture?.goals?.away,
                NaN
            );

        if (
            !Number.isFinite(hg) ||
            !Number.isFinite(ag)
        ) {
            continue;
        }

        let gf;
        let ga;

        if (homeId === safeNumber(teamId)) {
            gf = hg;
            ga = ag;
        } else if (
            awayId === safeNumber(teamId)
        ) {
            gf = ag;
            ga = hg;
        } else {
            continue;
        }

        if (gf > ga) points += 3;
        else if (gf === ga) points += 1;

        gd += clamp(gf - ga, -4, 4);

        count++;
    }

    if (!count) return null;

    const ppg = points / count;
    const gdPerGame = gd / count;

    return (
        (ppg / 3) * 0.70 +
        ((gdPerGame + 4) / 8) * 0.30
    );
}

function venueFormSignal(
    homeFixtures,
    awayFixtures,
    homeTeamId,
    awayTeamId
) {
    const homeVenue =
        venueFixtures(
            homeFixtures,
            homeTeamId,
            "home"
        );

    const awayVenue =
        venueFixtures(
            awayFixtures,
            awayTeamId,
            "away"
        );

    const homeRating =
        venueRating(
            homeVenue,
            homeTeamId
        );

    const awayRating =
        venueRating(
            awayVenue,
            awayTeamId
        );

    if (
        homeRating === null ||
        awayRating === null
    ) {
        return {
            probabilities:
                normalizeProbabilityObject(
                    33.33,
                    33.34,
                    33.33
                ),
            available: false,
            homeMatches: homeVenue.length,
            awayMatches: awayVenue.length
        };
    }

    const difference =
        homeRating - awayRating;

    return {
        probabilities:
            ratingDifferenceToProbabilities(
                difference
            ),
        available: true,
        homeRating,
        awayRating,
        homeMatches: homeVenue.length,
        awayMatches: awayVenue.length
    };
}

// ------------------------------------------------------------
// SIGNAL 6
// LAST 5 H2H — 5%
//
// H2H is deliberately kept low at 5% so old rivalry history
// cannot overpower current form and standings.
// ------------------------------------------------------------

function h2hSignal(
    fixtures,
    homeTeamId,
    awayTeamId
) {
    if (!fixtures.length) {
        return {
            probabilities:
                normalizeProbabilityObject(
                    33.33,
                    33.34,
                    33.33
                ),
            available: false
        };
    }

    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;

    const weights = [
        0.10,
        0.15,
        0.20,
        0.25,
        0.30
    ];

    let totalWeight = 0;

    fixtures.forEach((fixture, index) => {
        const homeId =
            safeNumber(
                fixture?.teams?.home?.id
            );

        const awayId =
            safeNumber(
                fixture?.teams?.away?.id
            );

        const hg =
            safeNumber(
                fixture?.goals?.home,
                NaN
            );

        const ag =
            safeNumber(
                fixture?.goals?.away,
                NaN
            );

        if (
            !Number.isFinite(hg) ||
            !Number.isFinite(ag)
        ) {
            return;
        }

        const weight =
            weights[
                Math.min(
                    index,
                    weights.length - 1
                )
            ];

        let outcome = null;

        // Outcome is always from the perspective of
        // the current home team.
        if (homeId === safeNumber(homeTeamId)) {
            if (hg > ag) outcome = "H";
            else if (hg === ag) outcome = "D";
            else outcome = "A";
        } else if (
            awayId === safeNumber(homeTeamId)
        ) {
            if (ag > hg) outcome = "H";
            else if (ag === hg) outcome = "D";
            else outcome = "A";
        }

        if (outcome === "H") homeWins += weight;
        if (outcome === "D") draws += weight;
        if (outcome === "A") awayWins += weight;

        totalWeight += weight;
    });

    if (!totalWeight) {
        return {
            probabilities:
                normalizeProbabilityObject(
                    33.33,
                    33.34,
                    33.33
                ),
            available: false
        };
    }

    return {
        probabilities:
            normalizeProbabilityObject(
                homeWins,
                draws,
                awayWins
            ),
        available: true,
        matches: fixtures.length,
        homeWins: round(
            homeWins / totalWeight * 100,
            2
        ),
        draws: round(
            draws / totalWeight * 100,
            2
        ),
        awayWins: round(
            awayWins / totalWeight * 100,
            2
        )
    };
}

// ------------------------------------------------------------
// DATA QUALITY
// ------------------------------------------------------------

function calculateDataCoverage(signals) {
    const entries = [
        signals.form,
        signals.standings,
        signals.seasonStrength,
        signals.xg,
        signals.venueForm,
        signals.h2h
    ];

    const available = entries.filter(
        (signal) =>
            signal &&
            signal.available !== false
    ).length;

    return {
        available,
        total: entries.length,
        percentage:
            round(
                available /
                entries.length *
                100,
                1
            )
    };
}

// ------------------------------------------------------------
// SIGNAL EXPLANATION
// ------------------------------------------------------------

function signalWinner(probabilities) {
    const winner =
        getHighestOutcome(probabilities);

    return {
        outcome: winner.prediction,
        probability: winner.probability
    };
}

function buildSignalSummary(signals) {
    return {
        form: {
            weight: 45,
            winner:
                signalWinner(
                    signals.form.probabilities
                ),
            probabilities:
                signals.form.probabilities,
            available:
                signals.form.available
        },

        standings: {
            weight: 30,
            winner:
                signalWinner(
                    signals.standings.probabilities
                ),
            probabilities:
                signals.standings.probabilities,
            available:
                signals.standings.available
        },

        seasonStrength: {
            weight: 5,
            winner:
                signalWinner(
                    signals.seasonStrength.probabilities
                ),
            probabilities:
                signals.seasonStrength.probabilities,
            available:
                signals.seasonStrength.available
        },

        xg: {
            weight: 10,
            winner:
                signalWinner(
                    signals.xg.probabilities
                ),
            probabilities:
                signals.xg.probabilities,
            available:
                signals.xg.available
        },

        venueForm: {
            weight: 5,
            winner:
                signalWinner(
                    signals.venueForm.probabilities
                ),
            probabilities:
                signals.venueForm.probabilities,
            available:
                signals.venueForm.available
        },

        h2h: {
            weight: 5,
            winner:
                signalWinner(
                    signals.h2h.probabilities
                ),
            probabilities:
                signals.h2h.probabilities,
            available:
                signals.h2h.available
        }
    };
}

// ------------------------------------------------------------
// MAIN PREDICTION
// ------------------------------------------------------------

async function buildPrediction(body) {
    const input = extractInput(body);

    // --------------------------------------------------------
    // Resolve fixture
    // --------------------------------------------------------

    const fixture =
        await resolveFixture(input);

    if (!fixture) {
        throw new Error(
            "Could not resolve the fixture. Provide a valid fixture ID or home/away team names with the match date."
        );
    }

    const fixtureId =
        safeNumber(
            fixture?.fixture?.id,
            input.fixtureId
        );

    const homeTeam =
        fixture?.teams?.home;

    const awayTeam =
        fixture?.teams?.away;

    const homeTeamId =
        safeNumber(
            homeTeam?.id,
            input.homeTeamId
        );

    const awayTeamId =
        safeNumber(
            awayTeam?.id,
            input.awayTeamId
        );

    if (!homeTeamId || !awayTeamId) {
        throw new Error(
            "Home and away team IDs could not be resolved from the fixture."
        );
    }

    const leagueId =
        safeNumber(
            fixture?.league?.id,
            body?.match?.leagueId
        );

    const season =
        safeNumber(
            fixture?.league?.season,
            body?.match?.season
        );

    const homeName =
        homeTeam?.name ||
        input.homeName ||
        "Home Team";

    const awayName =
        awayTeam?.name ||
        input.awayName ||
        "Away Team";

    // --------------------------------------------------------
    // Collect data
    //
    // We intentionally DO NOT request injuries or lineups
    // because V4.0 does not allow those variables to affect
    // the prediction.
    // --------------------------------------------------------

    const [
        homeFixtures,
        awayFixtures,
        standings,
        homeStats,
        awayStats,
        h2h
    ] = await Promise.all([
        getRecentFixtures(
            homeTeamId,
            5
        ),

        getRecentFixtures(
            awayTeamId,
            5
        ),

        getStandings(
            leagueId,
            season
        ),

        getTeamStatistics(
            leagueId,
            season,
            homeTeamId
        ),

        getTeamStatistics(
            leagueId,
            season,
            awayTeamId
        ),

        getH2H(
            homeTeamId,
            awayTeamId
        )
    ]);

    // --------------------------------------------------------
    // Standings rows
    // --------------------------------------------------------

    const homeStanding =
        findStanding(
            standings,
            homeTeamId
        );

    const awayStanding =
        findStanding(
            standings,
            awayTeamId
        );

    // --------------------------------------------------------
    // Recent goals
    // --------------------------------------------------------

    const homeRecentGoals =
        recentGoalAverage(
            homeFixtures,
            homeTeamId
        );

    const awayRecentGoals =
        recentGoalAverage(
            awayFixtures,
            awayTeamId
        );

    // --------------------------------------------------------
    // Calculate each signal
    // --------------------------------------------------------

    const form = formSignal(
        homeFixtures,
        awayFixtures
    );

    // formSignal needs team IDs, but the fixtures are already
    // resolved. Recalculate explicitly to guarantee correct
    // team perspective.
    const homeFormRating =
        calculateFormRating(
            homeFixtures,
            homeTeamId
        );

    const awayFormRating =
        calculateFormRating(
            awayFixtures,
            awayTeamId
        );

    const formSignalFinal =
        (
            homeFormRating &&
            awayFormRating
        )
            ? {
                probabilities:
                    ratingDifferenceToProbabilities(
                        homeFormRating.rating -
                        awayFormRating.rating
                    ),
                available: true,
                homeRating:
                    homeFormRating.rating,
                awayRating:
                    awayFormRating.rating,
                homeDetails:
                    homeFormRating,
                awayDetails:
                    awayFormRating
            }
            : form;

    const standingsResult =
        standingsSignal(
            homeStanding,
            awayStanding
        );

    const seasonStrength =
        seasonStrengthSignal(
            homeStanding,
            awayStanding,
            homeStats,
            awayStats
        );

    const xgResult =
        calculateExpectedGoals(
            homeStats,
            awayStats,
            homeRecentGoals,
            awayRecentGoals
        );

    const xgSignal = {
        probabilities:
            xgResult.probabilities,
        available:
            xgResult.homeXG !== null &&
            xgResult.awayXG !== null,
        homeXG:
            xgResult.homeXG,
        awayXG:
            xgResult.awayXG
    };

    const venueForm =
        venueFormSignal(
            homeFixtures,
            awayFixtures,
            homeTeamId,
            awayTeamId
        );

    const h2hSignalResult =
        h2hSignal(
            h2h,
            homeTeamId,
            awayTeamId
        );

    // --------------------------------------------------------
    // FINAL SIGNAL COLLECTION
    // --------------------------------------------------------

    const signals = {
        form: formSignalFinal,
        standings: standingsResult,
        seasonStrength,
        xg: xgSignal,
        venueForm,
        h2h: h2hSignalResult
    };

    // --------------------------------------------------------
    // FINAL 100% MODEL
    // --------------------------------------------------------

    const finalProbabilities =
        blendProbabilitySignals([
            {
                weight: WEIGHTS.form,
                probabilities:
                    signals.form.probabilities
            },
            {
                weight: WEIGHTS.standings,
                probabilities:
                    signals.standings.probabilities
            },
            {
                weight: WEIGHTS.seasonStrength,
                probabilities:
                    signals.seasonStrength.probabilities
            },
            {
                weight: WEIGHTS.xg,
                probabilities:
                    signals.xg.probabilities
            },
            {
                weight: WEIGHTS.venueForm,
                probabilities:
                    signals.venueForm.probabilities
            },
            {
                weight: WEIGHTS.h2h,
                probabilities:
                    signals.h2h.probabilities
            }
        ]);

    // --------------------------------------------------------
    // SELECT HIGHEST PROBABILITY
    // --------------------------------------------------------

    const result =
        getHighestOutcome(
            finalProbabilities
        );

    const confidence =
        confidenceFromProbability(
            result.probability
        );

    // --------------------------------------------------------
    // Probability agreement
    //
    // Measures how many weighted signals support the final
    // selected outcome.
    // --------------------------------------------------------

    const signalList = [
        signals.form,
        signals.standings,
        signals.seasonStrength,
        signals.xg,
        signals.venueForm,
        signals.h2h
    ];

    let supportingWeight = 0;
    let totalSignalWeight = 0;

    const selectedCode =
        result.prediction === "Home Win"
            ? "home"
            : result.prediction === "Draw"
                ? "draw"
                : "away";

    for (let i = 0; i < signalList.length; i++) {
        const signal = signalList[i];

        const weight =
            Object.values(WEIGHTS)[i];

        totalSignalWeight += weight;

        if (
            signal &&
            signal.probabilities &&
            signalWinner(
                signal.probabilities
            ).outcome === result.prediction
        ) {
            supportingWeight += weight;
        }
    }

    const agreement =
        totalSignalWeight > 0
            ? round(
                supportingWeight /
                totalSignalWeight *
                100,
                1
            )
            : 0;

    // --------------------------------------------------------
    // DATA COVERAGE
    // --------------------------------------------------------

    const coverage =
        calculateDataCoverage(
            signals
        );

    // --------------------------------------------------------
    // STANDINGS DISPLAY
    // --------------------------------------------------------

    const standingsOutput = {
        available:
            Boolean(
                homeStanding &&
                awayStanding
            ),

        home: homeStanding
            ? {
                position:
                    homeStanding.rank ?? null,
                points:
                    homeStanding.points ?? null,
                played:
                    homeStanding.all?.played ??
                    null,
                goalDifference:
                    homeStanding.goalsDiff ??
                    null,
                form:
                    homeStanding.form ??
                    null
            }
            : null,

        away: awayStanding
            ? {
                position:
                    awayStanding.rank ?? null,
                points:
                    awayStanding.points ?? null,
                played:
                    awayStanding.all?.played ??
                    null,
                goalDifference:
                    awayStanding.goalsDiff ??
                    null,
                form:
                    awayStanding.form ??
                    null
            }
            : null
    };

    // --------------------------------------------------------
    // FORM DISPLAY
    // --------------------------------------------------------

    function simpleForm(
        fixtures,
        teamId
    ) {
        return fixtures.map(
            (fixture) =>
                outcomeCodeForFixture(
                    fixture,
                    teamId
                )
        );
    }

    // --------------------------------------------------------
    // FINAL RESPONSE
    // --------------------------------------------------------

    return {
        success: true,

        version: "V4.0",

        engine: "TOMSONSTAKES GLOBAL FOOTBALL PREDICTION ENGINE",

        fixture: {
            id: fixtureId,
            date:
                fixture?.fixture?.date ||
                null,

            timestamp:
                fixture?.fixture?.timestamp ||
                null,

            timezone: TIMEZONE,

            venue:
                fixture?.fixture?.venue?.name ||
                null,

            city:
                fixture?.fixture?.venue?.city ||
                null,

            status:
                fixture?.fixture?.status?.short ||
                null
        },

        league: {
            id: leagueId || null,
            name:
                fixture?.league?.name ||
                null,
            country:
                fixture?.league?.country ||
                null,
            season:
                season || null,
            round:
                fixture?.league?.round ||
                null
        },

        teams: {
            home: {
                id: homeTeamId,
                name: homeName,
                logo:
                    homeTeam?.logo ||
                    null,

                recentForm:
                    simpleForm(
                        homeFixtures,
                        homeTeamId
                    )
            },

            away: {
                id: awayTeamId,
                name: awayName,
                logo:
                    awayTeam?.logo ||
                    null,

                recentForm:
                    simpleForm(
                        awayFixtures,
                        awayTeamId
                    )
            }
        },

        prediction: result.prediction,

        probability: result.probability,

        confidence,

        probabilities: {
            home:
                finalProbabilities.home,

            draw:
                finalProbabilities.draw,

            away:
                finalProbabilities.away
        },

        // Compatibility aliases for different frontend versions.
        homeProbability:
            finalProbabilities.home,

        drawProbability:
            finalProbabilities.draw,

        awayProbability:
            finalProbabilities.away,

        agreement,

        dataCoverage: coverage,

        model: {
            weights: {
                last5RecencyWeighted: 45,
                currentLeagueStandings: 30,
                seasonHomeAwayStrength: 5,
                expectedGoalsGoalModel: 10,
                recentVenueForm: 5,
                last5H2H: 5
            },

            totalWeight: 100,

            rules: {
                artificialHomeBias: false,
                apiPredictionSignal: false,
                injuriesAffectPrediction: false,
                lineupsAffectPrediction: false,
                highestProbabilitySelected: true
            }
        },

        signals: buildSignalSummary(
            signals
        ),

        formAnalysis: {
            home: {
                matches:
                    homeFixtures.length,
                rating:
                    homeFormRating
                        ? round(
                            homeFormRating.rating,
                            4
                        )
                        : null,

                weightedPoints:
                    homeFormRating
                        ? round(
                            homeFormRating.weightedPoints,
                            3
                        )
                        : null,

                weightedGoalDifference:
                    homeFormRating
                        ? round(
                            homeFormRating.weightedGD,
                            3
                        )
                        : null,

                weightedGoalsFor:
                    homeFormRating
                        ? round(
                            homeFormRating.weightedGF,
                            3
                        )
                        : null,

                weightedGoalsAgainst:
                    homeFormRating
                        ? round(
                            homeFormRating.weightedGA,
                            3
                        )
                        : null
            },

            away: {
                matches:
                    awayFixtures.length,

                rating:
                    awayFormRating
                        ? round(
                            awayFormRating.rating,
                            4
                        )
                        : null,

                weightedPoints:
                    awayFormRating
                        ? round(
                            awayFormRating.weightedPoints,
                            3
                        )
                        : null,

                weightedGoalDifference:
                    awayFormRating
                        ? round(
                            awayFormRating.weightedGD,
                            3
                        )
                        : null,

                weightedGoalsFor:
                    awayFormRating
                        ? round(
                            awayFormRating.weightedGF,
                            3
                        )
                        : null,

                weightedGoalsAgainst:
                    awayFormRating
                        ? round(
                            awayFormRating.weightedGA,
                            3
                        )
                        : null
            },

            recencyWeights: {
                oldest: 10,
                secondOldest: 15,
                middle: 20,
                secondNewest: 25,
                newest: 30
            }
        },

        standings: standingsOutput,

        expectedGoals: {
            home:
                round(
                    xgResult.homeXG,
                    2
                ),

            away:
                round(
                    xgResult.awayXG,
                    2
                ),

            available:
                xgSignal.available
        },

        venueForm: {
            homeRating:
                venueForm.homeRating ??
                null,

            awayRating:
                venueForm.awayRating ??
                null,

            homeMatches:
                venueForm.homeMatches ??
                0,

            awayMatches:
                venueForm.awayMatches ??
                0,

            available:
                venueForm.available
        },

        h2h: {
            matches:
                h2h.length,

            available:
                h2hSignalResult.available,

            probabilities:
                h2hSignalResult.probabilities
        },

        // These are deliberately INFORMATION ONLY.
        // They do not affect the model.
        context: {
            injuriesUsedInPrediction: false,
            lineupsUsedInPrediction: false,
            injuriesNote:
                "Injuries are not included in V4.0 probability calculations.",
            lineupsNote:
                "Lineups are not included in V4.0 probability calculations."
        }
    };
}

// ------------------------------------------------------------
// VERCEL HANDLER
// ------------------------------------------------------------

export default async function handler(req, res) {
    // --------------------------------------------------------
    // CORS
    // --------------------------------------------------------

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    // --------------------------------------------------------
    // OPTIONS
    // --------------------------------------------------------

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    // --------------------------------------------------------
    // METHOD
    // --------------------------------------------------------

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error:
                "Method not allowed. Use POST."
        });
    }

    try {
        // ----------------------------------------------------
        // BODY
        // ----------------------------------------------------

        let body = req.body;

        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Request body contains invalid JSON."
                });
            }
        }

        if (!body || typeof body !== "object") {
            return res.status(400).json({
                success: false,
                error:
                    "Request body is required."
            });
        }

        // ----------------------------------------------------
        // BUILD MODEL
        // ----------------------------------------------------

        const result =
            await buildPrediction(body);

        // ----------------------------------------------------
        // RETURN
        // ----------------------------------------------------

        return res.status(200).json(result);

    } catch (error) {

        console.error(
            "TomsonStakes V4.0 error:",
            error
        );

        return res.status(500).json({
            success: false,

            version: "V4.0",

            error:
                error?.message ||
                "Analysis failed.",

            prediction: null,

            probability: null,

            probabilities: {
                home: null,
                draw: null,
                away: null
            },

            confidence: "AVOID"
        });
    }
}
