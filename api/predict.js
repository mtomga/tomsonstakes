export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                success: false,
                error: "Method not allowed. Use POST."
            });
        }

        const body = req.body || {};

        if (!body.match || !body.normalized) {
            return res.status(400).json({
                success: false,
                error: "match and normalized data are required."
            });
        }

        const match = body.match;
        const data = body.normalized;
        const readiness = body.readiness || {};
        const availability = body.availability || {};

        /*
         * ---------------------------------------------------------
         * BASIC HELPERS
         * ---------------------------------------------------------
         */

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

            return (
                valid.reduce((sum, value) => sum + value, 0) /
                valid.length
            );
        }

        function round(value, decimals = 2) {
            if (value === null || value === undefined) {
                return null;
            }

            return Number(Number(value).toFixed(decimals));
        }

        /*
         * ---------------------------------------------------------
         * FORM ANALYSIS
         * ---------------------------------------------------------
         */

        function formScore(form) {
            if (!Array.isArray(form) || !form.length) {
                return null;
            }

            let score = 0;

            for (const item of form) {
                if (item.result === "W") score += 3;
                if (item.result === "D") score += 1;
                if (item.result === "L") score += 0;
            }

            return round(
                score / (form.length * 3) * 100,
                1
            );
        }

        const homeForm =
            Array.isArray(data.form?.home)
                ? data.form.home
                : [];

        const awayForm =
            Array.isArray(data.form?.away)
                ? data.form.away
                : [];

        const homeFormScore =
            formScore(homeForm);

        const awayFormScore =
            formScore(awayForm);

        /*
         * ---------------------------------------------------------
         * 1X2 ODDS
         * ---------------------------------------------------------
         */

        const homeOdds =
            number(data.odds?.home);

        const drawOdds =
            number(data.odds?.draw);

        const awayOdds =
            number(data.odds?.away);

        function impliedProbability(odds) {
            if (!odds || odds <= 1) return null;

            return 1 / odds;
        }

        const marketHomeProbability =
            impliedProbability(homeOdds);

        const marketDrawProbability =
            impliedProbability(drawOdds);

        const marketAwayProbability =
            impliedProbability(awayOdds);

        const marketTotal =
            [
                marketHomeProbability,
                marketDrawProbability,
                marketAwayProbability
            ]
                .filter(v => v !== null)
                .reduce(
                    (sum, value) => sum + value,
                    0
                );

        function normalizedMarketProbability(value) {
            if (
                value === null ||
                marketTotal <= 0
            ) {
                return null;
            }

            return (
                value / marketTotal
            ) * 100;
        }

        const marketProbabilities = {
            home:
                normalizedMarketProbability(
                    marketHomeProbability
                ),

            draw:
                normalizedMarketProbability(
                    marketDrawProbability
                ),

            away:
                normalizedMarketProbability(
                    marketAwayProbability
                )
        };

        /*
         * ---------------------------------------------------------
         * FORM-BASED SIGNAL
         * ---------------------------------------------------------
         */

        let formHomeWeight = 0;
        let formAwayWeight = 0;

        if (
            homeFormScore !== null &&
            awayFormScore !== null
        ) {
            const total =
                homeFormScore +
                awayFormScore;

            if (total > 0) {
                formHomeWeight =
                    homeFormScore / total * 100;

                formAwayWeight =
                    awayFormScore / total * 100;
            }
        }

        /*
         * ---------------------------------------------------------
         * BTTS
         * ---------------------------------------------------------
         */

        const bttsProbability =
            number(data.btts?.probability);

        const bttsOdds =
            Array.isArray(data.btts?.odds)
                ? data.btts.odds
                : [];

        /*
         * ---------------------------------------------------------
         * OVER / UNDER
         * ---------------------------------------------------------
         */

        const overUnderOdds =
            Array.isArray(data.overUnder?.odds)
                ? data.overUnder.odds
                : [];

        /*
         * ---------------------------------------------------------
         * XG
         * ---------------------------------------------------------
         */

        const homeXGValues =
            Array.isArray(data.xg?.home)
                ? data.xg.home
                    .map(item => number(item.value))
                    .filter(v => v !== null)
                : [];

        const awayXGValues =
            Array.isArray(data.xg?.away)
                ? data.xg.away
                    .map(item => number(item.value))
                    .filter(v => v !== null)
                : [];

        const homeXG =
            average(homeXGValues);

        const awayXG =
            average(awayXGValues);

        /*
         * ---------------------------------------------------------
         * EVIDENCE COUNTS
         * ---------------------------------------------------------
         */

        const evidence = {
            homeFormMatches:
                homeForm.length,

            awayFormMatches:
                awayForm.length,

            h2hSources:
                Array.isArray(data.h2h?.evidence)
                    ? data.h2h.evidence.length
                    : 0,

            bttsEvidence:
                Array.isArray(data.btts?.evidence)
                    ? data.btts.evidence.length
                    : 0,

            overUnderEvidence:
                Array.isArray(data.overUnder?.evidence)
                    ? data.overUnder.evidence.length
                    : 0,

            oneXTwoEvidence:
                Array.isArray(data.odds?.evidence)
                    ? data.odds.evidence.length
                    : 0,

            injuryEvidence:
                (
                    Array.isArray(data.injuries?.home)
                        ? data.injuries.home.length
                        : 0
                ) +
                (
                    Array.isArray(data.injuries?.away)
                        ? data.injuries.away.length
                        : 0
                ),

            lineupEvidence:
                Array.isArray(data.lineups?.evidence)
                    ? data.lineups.evidence.length
                    : 0
        };

        /*
         * ---------------------------------------------------------
         * 1X2 MODEL
         *
         * This is intentionally conservative.
         *
         * Market probabilities are used only when actual odds
         * exist.
         *
         * Form is used only when BOTH teams have form.
         * ---------------------------------------------------------
         */

        let modelHome = null;
        let modelDraw = null;
        let modelAway = null;

        if (
            marketProbabilities.home !== null &&
            marketProbabilities.draw !== null &&
            marketProbabilities.away !== null
        ) {

            modelHome =
                marketProbabilities.home;

            modelDraw =
                marketProbabilities.draw;

            modelAway =
                marketProbabilities.away;

            /*
             * Add a modest form adjustment only when form exists
             * for BOTH teams.
             */

            if (
                formHomeWeight > 0 ||
                formAwayWeight > 0
            ) {
                modelHome =
                    modelHome * 0.75 +
                    formHomeWeight * 0.25;

                modelAway =
                    modelAway * 0.75 +
                    formAwayWeight * 0.25;

                modelDraw =
                    modelDraw * 0.90;
            }

            const total =
                modelHome +
                modelDraw +
                modelAway;

            if (total > 0) {
                modelHome =
                    modelHome / total * 100;

                modelDraw =
                    modelDraw / total * 100;

                modelAway =
                    modelAway / total * 100;
            }
        }

        /*
         * ---------------------------------------------------------
         * VALUE
         * ---------------------------------------------------------
         */

        function valueFor(probability, odds) {
            if (
                probability === null ||
                odds === null ||
                odds <= 1
            ) {
                return null;
            }

            return round(
                (probability / 100) * odds,
                3
            );
        }

        const value = {
            home:
                valueFor(modelHome, homeOdds),

            draw:
                valueFor(modelDraw, drawOdds),

            away:
                valueFor(modelAway, awayOdds)
        };

        /*
         * ---------------------------------------------------------
         * DOUBLE CHANCE
         * ---------------------------------------------------------
         */

        const doubleChance = {
            homeOrDraw:
                modelHome !== null &&
                modelDraw !== null
                    ? round(
                        modelHome + modelDraw,
                        1
                    )
                    : null,

            awayOrDraw:
                modelAway !== null &&
                modelDraw !== null
                    ? round(
                        modelAway + modelDraw,
                        1
                    )
                    : null,

            homeOrAway:
                modelHome !== null &&
                modelAway !== null
                    ? round(
                        modelHome + modelAway,
                        1
                    )
                    : null
        };

        /*
         * ---------------------------------------------------------
         * DRAW NO BET
         * ---------------------------------------------------------
         */

        const dnb = {
            home:
                modelHome !== null &&
                modelAway !== null
                    ? round(
                        modelHome /
                        (
                            modelHome +
                            modelAway
                        ) * 100,
                        1
                    )
                    : null,

            away:
                modelHome !== null &&
                modelAway !== null
                    ? round(
                        modelAway /
                        (
                            modelHome +
                            modelAway
                        ) * 100,
                        1
                    )
                    : null
        };

        /*
         * ---------------------------------------------------------
         * CONFIDENCE
         * ---------------------------------------------------------
         */

        let confidence = 0;

        if (
            readiness.identityReady
        ) {
            confidence += 15;
        }

        if (
            readiness.formReady
        ) {
            confidence += 25;
        }

        if (
            readiness.statsReady
        ) {
            confidence += 20;
        }

        if (
            evidence.oneXTwoEvidence > 0
        ) {
            confidence += 15;
        }

        if (
            evidence.bttsEvidence > 0
        ) {
            confidence += 5;
        }

        if (
            evidence.overUnderEvidence > 0
        ) {
            confidence += 5;
        }

        if (
            evidence.h2hSources > 0
        ) {
            confidence += 5;
        }

        if (
            evidence.injuryEvidence > 0
        ) {
            confidence += 5;
        }

        confidence =
            clamp(confidence, 0, 100);

        /*
         * ---------------------------------------------------------
         * DATA STATUS
         * ---------------------------------------------------------
         */

        let status = "INSUFFICIENT_DATA";

        if (
            readiness.identityReady &&
            readiness.statsReady
        ) {
            status = "PARTIAL_ANALYSIS";
        }

        if (
            readiness.identityReady &&
            readiness.formReady &&
            readiness.statsReady
        ) {
            status = "ANALYSIS_READY";
        }

        /*
         * ---------------------------------------------------------
         * FINAL RESPONSE
         * ---------------------------------------------------------
         */

        return res.status(200).json({

            success: true,

            version: "Prediction Engine V1.0",

            match: {
                home: match.home,
                away: match.away,
                date: match.date
            },

            status,

            confidence,

            form: {
                home: {
                    matches:
                        homeForm.length,

                    score:
                        homeFormScore
                },

                away: {
                    matches:
                        awayForm.length,

                    score:
                        awayFormScore
                }
            },

            model: {

                oneXTwo: {
                    home:
                        round(modelHome, 1),

                    draw:
                        round(modelDraw, 1),

                    away:
                        round(modelAway, 1)
                },

                doubleChance,

                drawNoBet: dnb,

                btts: {
                    probability:
                        bttsProbability,

                    odds:
                        bttsOdds
                },

                overUnder: {
                    odds:
                        overUnderOdds
                },

                xg: {
                    home:
                        round(homeXG, 2),

                    away:
                        round(awayXG, 2)
                }
            },

            market: {
                odds: {
                    home: homeOdds,
                    draw: drawOdds,
                    away: awayOdds
                },

                impliedProbability:
                    marketProbabilities
            },

            value,

            evidence,

            rules: {
                h2hWeight:
                    "H2H is supporting evidence only and is not allowed to dominate the model.",

                missingData:
                    "Missing data is not guessed.",

                lineupRule:
                    "Predicted lineups are not treated as confirmed.",

                identityRule:
                    "Deportes Concepcion and Universidad de Concepcion are separate clubs.",

                oddsRule:
                    "Probability and bookmaker odds are kept separate."
            }
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            version: "Prediction Engine V1.0",
            error: "Prediction engine failed.",
            details: error.message
        });
    }
}
