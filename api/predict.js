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
        const normalized = body.normalized || {};
        const readiness = body.readiness || {};
        const availability = body.availability || {};

        if (!match.home || !match.away) {
            return res.status(400).json({
                success: false,
                error: "match.home and match.away are required."
            });
        }

        // =====================================================
        // HELPERS
        // =====================================================

        function number(value) {
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        }

        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function average(values) {
            const valid = values
                .map(number)
                .filter(v => v !== null);

            if (!valid.length) return null;

            return valid.reduce((a, b) => a + b, 0) / valid.length;
        }

        function round(value, decimals = 2) {
            if (value === null || value === undefined) {
                return null;
            }

            const factor = Math.pow(10, decimals);

            return Math.round(value * factor) / factor;
        }

        function impliedProbability(odds) {

            const value = number(odds);

            if (value === null || value <= 1) {
                return null;
            }

            return 1 / value;
        }

        function normalizeProbabilities(values) {

            const entries = Object.entries(values)
                .filter(([_, value]) => value !== null);

            const total = entries.reduce(
                (sum, [_, value]) => sum + value,
                0
            );

            if (!total) {
                return values;
            }

            const result = {};

            for (const [key, value] of entries) {
                result[key] = (value / total) * 100;
            }

            return result;
        }

        function calculateValue(probability, odds) {

            const p = number(probability);
            const o = number(odds);

            if (
                p === null ||
                o === null ||
                o <= 1
            ) {
                return null;
            }

            return (p / 100) * o;
        }

        function calculateEdge(probability, odds) {

            const p = number(probability);
            const o = number(odds);

            if (
                p === null ||
                o === null ||
                o <= 1
            ) {
                return null;
            }

            const implied = (1 / o) * 100;

            return p - implied;
        }

        // =====================================================
        // NORMALIZED DATA
        // =====================================================

        const data = normalized;

        const form = data.form || {};
        const h2h = data.h2h || {};
        const btts = data.btts || {};
        const overUnder = data.overUnder || {};
        const xg = data.xg || {};
        const oddsData = data.odds || {};

        // =====================================================
        // FORM
        // =====================================================

        function formScore(matches) {

            if (!Array.isArray(matches) || !matches.length) {
                return null;
            }

            const points = matches.map(match => {

                const result = String(
                    match.result || ""
                ).toUpperCase();

                if (result === "W") return 3;
                if (result === "D") return 1;
                if (result === "L") return 0;

                return null;

            }).filter(v => v !== null);

            if (!points.length) {
                return null;
            }

            return round(
                (points.reduce((a, b) => a + b, 0) /
                (points.length * 3)) * 100
            );
        }

        const homeFormMatches =
            Array.isArray(form.home)
                ? form.home
                : [];

        const awayFormMatches =
            Array.isArray(form.away)
                ? form.away
                : [];

        const homeFormScore =
            formScore(homeFormMatches);

        const awayFormScore =
            formScore(awayFormMatches);

        // =====================================================
        // 1X2 MARKET
        // =====================================================

        const marketOdds = {
            home: number(oddsData.home),
            draw: number(oddsData.draw),
            away: number(oddsData.away)
        };

        const rawImplied = {
            home: impliedProbability(marketOdds.home),
            draw: impliedProbability(marketOdds.draw),
            away: impliedProbability(marketOdds.away)
        };

        const marketProbability =
            normalizeProbabilities(rawImplied);

        // =====================================================
        // MODEL PROBABILITY
        //
        // V1.1:
        // Market remains baseline.
        //
        // Form is only applied when BOTH teams have
        // usable form data.
        // =====================================================

        let modelProbability = {
            home: marketProbability.home ?? null,
            draw: marketProbability.draw ?? null,
            away: marketProbability.away ?? null
        };

        let modelMethod = "MARKET_BASELINE";

        if (
            homeFormScore !== null &&
            awayFormScore !== null &&
            marketProbability.home !== null &&
            marketProbability.draw !== null &&
            marketProbability.away !== null
        ) {

            const homeFormWeight =
                homeFormScore;

            const awayFormWeight =
                awayFormScore;

            const adjustedHome =
                (marketProbability.home * 0.75) +
                (homeFormWeight * 0.25);

            const adjustedAway =
                (marketProbability.away * 0.75) +
                (awayFormWeight * 0.25);

            const adjustedDraw =
                marketProbability.draw * 0.90;

            const total =
                adjustedHome +
                adjustedDraw +
                adjustedAway;

            modelProbability = {
                home: (adjustedHome / total) * 100,
                draw: (adjustedDraw / total) * 100,
                away: (adjustedAway / total) * 100
            };

            modelMethod = "MARKET_PLUS_FORM";

        }

        modelProbability.home =
            round(modelProbability.home);

        modelProbability.draw =
            round(modelProbability.draw);

        modelProbability.away =
            round(modelProbability.away);

        // =====================================================
        // DOUBLE CHANCE
        // =====================================================

        const doubleChance = {

            homeOrDraw:
                modelProbability.home !== null &&
                modelProbability.draw !== null
                    ? round(
                        modelProbability.home +
                        modelProbability.draw
                    )
                    : null,

            awayOrDraw:
                modelProbability.away !== null &&
                modelProbability.draw !== null
                    ? round(
                        modelProbability.away +
                        modelProbability.draw
                    )
                    : null,

            homeOrAway:
                modelProbability.home !== null &&
                modelProbability.away !== null
                    ? round(
                        modelProbability.home +
                        modelProbability.away
                    )
                    : null
        };

        // =====================================================
        // DRAW NO BET
        // =====================================================

        let drawNoBet = {
            home: null,
            away: null
        };

        if (
            modelProbability.home !== null &&
            modelProbability.away !== null
        ) {

            const nonDraw =
                modelProbability.home +
                modelProbability.away;

            if (nonDraw > 0) {

                drawNoBet.home =
                    round(
                        (modelProbability.home /
                        nonDraw) * 100
                    );

                drawNoBet.away =
                    round(
                        (modelProbability.away /
                        nonDraw) * 100
                    );
            }
        }

        // =====================================================
        // BTTS
        // =====================================================

        const bttsProbability =
            number(btts.probability);

        const bttsOdds =
            Array.isArray(btts.odds)
                ? btts.odds
                : [];

        const bttsAssessments =
            bttsOdds.map(item => {

                const odds =
                    number(item.value);

                const probability =
                    number(item.percentage);

                return {
                    answer:
                        item.answer || null,

                    odds,

                    sourceProbability:
                        probability,

                    impliedProbability:
                        odds !== null
                            ? round(
                                (1 / odds) * 100
                            )
                            : null,

                    edge:
                        probability !== null &&
                        odds !== null
                            ? round(
                                calculateEdge(
                                    probability,
                                    odds
                                )
                            )
                            : null,

                    value:
                        probability !== null &&
                        odds !== null
                            ? round(
                                calculateValue(
                                    probability,
                                    odds
                                ),
                                3
                            )
                            : null,

                    source:
                        item.source || null,

                    title:
                        item.title || null
                };

            });

        // =====================================================
        // OVER / UNDER
        // =====================================================

        const overUnderOdds =
            Array.isArray(overUnder.odds)
                ? overUnder.odds
                : [];

        const overUnderAssessments =
            overUnderOdds.map(item => {

                const odds =
                    number(item.value);

                const probability =
                    number(item.percentage);

                return {
                    selection:
                        item.selection || null,

                    line:
                        number(item.line),

                    odds,

                    sourceProbability:
                        probability,

                    impliedProbability:
                        odds !== null
                            ? round(
                                (1 / odds) * 100
                            )
                            : null,

                    edge:
                        probability !== null &&
                        odds !== null
                            ? round(
                                calculateEdge(
                                    probability,
                                    odds
                                )
                            )
                            : null,

                    value:
                        probability !== null &&
                        odds !== null
                            ? round(
                                calculateValue(
                                    probability,
                                    odds
                                ),
                                3
                            )
                            : null,

                    source:
                        item.source || null,

                    title:
                        item.title || null
                };

            });

        // =====================================================
        // xG
        // =====================================================

        const homeXG =
            Array.isArray(xg.home)
                ? average(
                    xg.home.map(item => item.value)
                )
                : null;

        const awayXG =
            Array.isArray(xg.away)
                ? average(
                    xg.away.map(item => item.value)
                )
                : null;

        // =====================================================
        // 1X2 VALUE
        //
        // IMPORTANT:
        // Do NOT calculate value from bookmaker's own
        // implied probability.
        //
        // Value requires an independent model probability.
        //
        // Therefore:
        // - with form/model: calculate value
        // - market-only baseline: value = null
        // =====================================================

        let oneXTwoValue = {
            home: null,
            draw: null,
            away: null
        };

        if (modelMethod !== "MARKET_BASELINE") {

            oneXTwoValue = {
                home:
                    round(
                        calculateValue(
                            modelProbability.home,
                            marketOdds.home
                        ),
                        3
                    ),

                draw:
                    round(
                        calculateValue(
                            modelProbability.draw,
                            marketOdds.draw
                        ),
                        3
                    ),

                away:
                    round(
                        calculateValue(
                            modelProbability.away,
                            marketOdds.away
                        ),
                        3
                    )
            };
        }

        // =====================================================
        // MARKET BASELINE
        // =====================================================

        const marketBaseline = {

            home:
                marketProbability.home,

            draw:
                marketProbability.draw,

            away:
                marketProbability.away,

            note:
                "These probabilities are derived from bookmaker odds and are not independent model probabilities."
        };

        // =====================================================
        // EVIDENCE COUNTS
        // =====================================================

        const evidence = {

            homeFormMatches:
                homeFormMatches.length,

            awayFormMatches:
                awayFormMatches.length,

            h2hSources:
                Array.isArray(h2h.evidence)
                    ? h2h.evidence.length
                    : 0,

            bttsEvidence:
                Array.isArray(btts.evidence)
                    ? btts.evidence.length
                    : 0,

            overUnderEvidence:
                Array.isArray(overUnder.evidence)
                    ? overUnder.evidence.length
                    : 0,

            oneXTwoEvidence:
                Array.isArray(oddsData.evidence)
                    ? oddsData.evidence.length
                    : 0,

            injuryEvidence:
                Array.isArray(data.injuries?.evidence)
                    ? data.injuries.evidence.length
                    : 0,

            lineupEvidence:
                Array.isArray(data.lineups?.evidence)
                    ? data.lineups.evidence.length
                    : 0
        };

        // =====================================================
        // READINESS
        // =====================================================

        const identityReady =
            readiness.identityReady === true ||
            (
                !!match.home &&
                !!match.away
            );

        const formReady =
            homeFormMatches.length > 0 &&
            awayFormMatches.length > 0;

        const statsReady =
            bttsProbability !== null ||
            overUnderOdds.length > 0 ||
            homeXG !== null ||
            awayXG !== null;

        const independentModelReady =
            formReady ||
            homeXG !== null ||
            awayXG !== null;

        let status;

        if (
            identityReady &&
            independentModelReady &&
            statsReady
        ) {

            status = "ANALYSIS_READY";

        } else if (
            identityReady &&
            (
                bttsProbability !== null ||
                marketOdds.home !== null ||
                marketOdds.away !== null
            )
        ) {

            status = "PARTIAL_ANALYSIS";

        } else {

            status = "INSUFFICIENT_DATA";
        }

        // =====================================================
        // CONFIDENCE
        // =====================================================

        let confidence = 0;

        if (identityReady) {
            confidence += 15;
        }

        if (formReady) {
            confidence += 25;
        }

        if (statsReady) {
            confidence += 20;
        }

        if (
            marketOdds.home !== null &&
            marketOdds.draw !== null &&
            marketOdds.away !== null
        ) {
            confidence += 15;
        }

        if (bttsProbability !== null) {
            confidence += 5;
        }

        if (overUnderOdds.length > 0) {
            confidence += 5;
        }

        if (evidence.h2hSources > 0) {
            confidence += 5;
        }

        if (evidence.injuryEvidence > 0) {
            confidence += 5;
        }

        confidence = clamp(
            confidence,
            0,
            100
        );

        // =====================================================
        // RESPONSE
        // =====================================================

        return res.status(200).json({

            success: true,

            version:
                "Prediction Engine V1.1",

            match: {
                home: match.home,
                away: match.away,
                date: match.date || null
            },

            status,

            confidence,

            modelMethod,

            form: {

                home: {
                    matches:
                        homeFormMatches.length,

                    score:
                        homeFormScore
                },

                away: {
                    matches:
                        awayFormMatches.length,

                    score:
                        awayFormScore
                }
            },

            model: {

                oneXTwo: {
                    home:
                        modelProbability.home,

                    draw:
                        modelProbability.draw,

                    away:
                        modelProbability.away
                },

                doubleChance,

                drawNoBet,

                btts: {
                    probability:
                        bttsProbability,

                    odds:
                        bttsOdds,

                    assessment:
                        bttsAssessments
                },

                overUnder: {
                    odds:
                        overUnderOdds,

                    assessment:
                        overUnderAssessments
                },

                xg: {
                    home:
                        round(homeXG),

                    away:
                        round(awayXG)
                }
            },

            market: {

                odds: marketOdds,

                impliedProbability:
                    marketProbability,

                baseline:
                    marketBaseline
            },

            value: {

                oneXTwo:
                    oneXTwoValue,

                btts:
                    bttsAssessments,

                overUnder:
                    overUnderAssessments
            },

            evidence,

            rules: {

                h2hWeight:
                    "H2H is supporting evidence only and is not allowed to dominate the model.",

                missingData:
                    "Missing data is not guessed.",

                marketBaseline:
                    "Bookmaker implied probabilities are not treated as independent model probabilities.",

                valueRule:
                    "1X2 value is calculated only when an independent model probability exists.",

                lineupRule:
                    "Predicted lineups are not treated as confirmed.",

                identityRule:
                    "Deportes Concepcion and Universidad de Concepcion are separate clubs.",

                oddsRule:
                    "Probability and bookmaker odds are kept separate.",

                bttsRule:
                    "BTTS probability and BTTS bookmaker odds are kept separate.",

                overUnderRule:
                    "Over/Under probability and bookmaker odds are kept separate."
            }

        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            error: "Prediction engine failed.",
            details: error.message
        });
    }
}
