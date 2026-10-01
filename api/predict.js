export default async function handler(req, res) {

    try {

        // =====================================================
        // METHOD
        // =====================================================

        if (req.method !== "POST") {
            return res.status(405).json({
                success: false,
                error: "POST method required."
            });
        }

        // =====================================================
        // INPUT
        // =====================================================

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

            return Number.isFinite(n)
                ? n
                : null;
        }

        function clamp(value, min, max) {

            return Math.max(
                min,
                Math.min(max, value)
            );
        }

        function round(value, decimals = 2) {

            if (
                value === null ||
                value === undefined ||
                !Number.isFinite(Number(value))
            ) {
                return null;
            }

            const factor =
                Math.pow(10, decimals);

            return (
                Math.round(
                    Number(value) * factor
                ) / factor
            );
        }

        function average(values) {

            const valid =
                values
                    .map(number)
                    .filter(
                        value =>
                            value !== null
                    );

            if (!valid.length) {
                return null;
            }

            return (
                valid.reduce(
                    (a, b) => a + b,
                    0
                ) / valid.length
            );
        }

        function impliedProbability(odds) {

            const value =
                number(odds);

            if (
                value === null ||
                value <= 1
            ) {
                return null;
            }

            return (
                1 / value
            ) * 100;
        }

        function normalizeProbabilities(values) {

            const entries =
                Object.entries(values)
                    .filter(
                        ([_, value]) =>
                            value !== null &&
                            Number.isFinite(
                                Number(value)
                            )
                    );

            if (!entries.length) {
                return values;
            }

            const total =
                entries.reduce(
                    (sum, [_, value]) =>
                        sum + Number(value),
                    0
                );

            if (total <= 0) {
                return values;
            }

            const result = {};

            for (
                const [key, value]
                of entries
            ) {

                result[key] =
                    (
                        Number(value) /
                        total
                    ) * 100;
            }

            return result;
        }

        function calculateValue(
            probability,
            odds
        ) {

            const p =
                number(probability);

            const o =
                number(odds);

            if (
                p === null ||
                o === null ||
                o <= 1
            ) {
                return null;
            }

            return (
                (p / 100) * o
            );
        }

        function calculateEdge(
            probability,
            odds
        ) {

            const p =
                number(probability);

            const o =
                number(odds);

            if (
                p === null ||
                o === null ||
                o <= 1
            ) {
                return null;
            }

            return (
                p -
                ((1 / o) * 100)
            );
        }

        // =====================================================
        // NORMALIZED DATA
        // =====================================================

        const data =
            normalized || {};

        const form =
            data.form || {};

        const h2h =
            data.h2h || {};

        const btts =
            data.btts || {};

        const overUnder =
            data.overUnder || {};

        const xg =
            data.xg || {};

        const oddsData =
            data.odds || {};

        // =====================================================
        // FORM
        // =====================================================

        function formScore(matches) {

            if (
                !Array.isArray(matches) ||
                !matches.length
            ) {
                return null;
            }

            const points =
                matches
                    .map(item => {

                        const result =
                            String(
                                item.result || ""
                            ).toUpperCase();

                        if (result === "W") {
                            return 3;
                        }

                        if (result === "D") {
                            return 1;
                        }

                        if (result === "L") {
                            return 0;
                        }

                        return null;

                    })
                    .filter(
                        value =>
                            value !== null
                    );

            if (!points.length) {
                return null;
            }

            return round(
                (
                    points.reduce(
                        (a, b) =>
                            a + b,
                        0
                    ) /
                    (points.length * 3)
                ) * 100
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
            formScore(
                homeFormMatches
            );

        const awayFormScore =
            formScore(
                awayFormMatches
            );

        // =====================================================
        // 1X2 MARKET
        // =====================================================

        const marketOdds = {

            home:
                number(oddsData.home),

            draw:
                number(oddsData.draw),

            away:
                number(oddsData.away)
        };

        const rawImplied = {

            home:
                impliedProbability(
                    marketOdds.home
                ),

            draw:
                impliedProbability(
                    marketOdds.draw
                ),

            away:
                impliedProbability(
                    marketOdds.away
                )
        };

        const marketProbability =
            normalizeProbabilities(
                rawImplied
            );

        // =====================================================
        // INDEPENDENT 1X2 MODEL
        // =====================================================

        let modelProbability = {

            home:
                marketProbability.home ??
                null,

            draw:
                marketProbability.draw ??
                null,

            away:
                marketProbability.away ??
                null
        };

        let modelMethod =
            "MARKET_BASELINE";

        /*
         * Form must exist for BOTH teams before
         * it can influence the 1X2 model.
         */

        if (
            homeFormScore !== null &&
            awayFormScore !== null &&
            marketProbability.home !== null &&
            marketProbability.draw !== null &&
            marketProbability.away !== null
        ) {

            /*
             * Convert form into a relative strength
             * adjustment.
             */

            const formDifference =
                (
                    homeFormScore -
                    awayFormScore
                ) / 100;

            /*
             * Home advantage component.
             */

            const homeAdjustment =
                formDifference * 12;

            const awayAdjustment =
                -formDifference * 12;

            let adjustedHome =
                marketProbability.home +
                homeAdjustment;

            let adjustedAway =
                marketProbability.away +
                awayAdjustment;

            let adjustedDraw =
                marketProbability.draw;

            /*
             * Prevent extreme distortion.
             */

            adjustedHome =
                clamp(
                    adjustedHome,
                    5,
                    85
                );

            adjustedAway =
                clamp(
                    adjustedAway,
                    5,
                    85
                );

            adjustedDraw =
                clamp(
                    adjustedDraw,
                    5,
                    60
                );

            const total =
                adjustedHome +
                adjustedDraw +
                adjustedAway;

            modelProbability = {

                home:
                    (
                        adjustedHome /
                        total
                    ) * 100,

                draw:
                    (
                        adjustedDraw /
                        total
                    ) * 100,

                away:
                    (
                        adjustedAway /
                        total
                    ) * 100
            };

            modelMethod =
                "MARKET_PLUS_FORM";
        }

        modelProbability.home =
            round(
                modelProbability.home
            );

        modelProbability.draw =
            round(
                modelProbability.draw
            );

        modelProbability.away =
            round(
                modelProbability.away
            );

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

        const drawNoBet = {

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
                        (
                            modelProbability.home /
                            nonDraw
                        ) * 100
                    );

                drawNoBet.away =
                    round(
                        (
                            modelProbability.away /
                            nonDraw
                        ) * 100
                    );
            }
        }

        // =====================================================
        // xG
        // =====================================================

        const homeXG =
            Array.isArray(xg.home)
                ? average(
                    xg.home.map(
                        item =>
                            item.value
                    )
                )
                : null;

        const awayXG =
            Array.isArray(xg.away)
                ? average(
                    xg.away.map(
                        item =>
                            item.value
                    )
                )
                : null;

        /*
         * If xG is available for both teams,
         * calculate total expected goals.
         */

        const totalXG =
            homeXG !== null &&
            awayXG !== null
                ? round(
                    homeXG +
                    awayXG
                )
                : null;

        // =====================================================
        // BTTS
        // =====================================================

        const bttsProbability =
            number(
                btts.probability
            );

        const bttsOdds =
            Array.isArray(
                btts.odds
            )
                ? btts.odds
                : [];

        const bttsAssessments =
            bttsOdds.map(item => {

                const odds =
                    number(item.value);

                const probability =
                    number(
                        item.percentage
                    );

                return {

                    answer:
                        item.answer ||
                        null,

                    odds,

                    sourceProbability:
                        probability,

                    impliedProbability:
                        odds !== null
                            ? round(
                                impliedProbability(
                                    odds
                                )
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
                        item.source ||
                        null,

                    title:
                        item.title ||
                        null
                };
            });

        // =====================================================
        // OVER / UNDER
        // =====================================================

        const overUnderOdds =
            Array.isArray(
                overUnder.odds
            )
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
                        item.selection ||
                        null,

                    line:
                        number(item.line),

                    odds,

                    sourceProbability:
                        probability,

                    impliedProbability:
                        odds !== null
                            ? round(
                                impliedProbability(
                                    odds
                                )
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
                        item.source ||
                        null,

                    title:
                        item.title ||
                        null
                };
            });

        // =====================================================
        // GOALS MARKET PROBABILITY
        // =====================================================

        /*
         * We don't invent probabilities.
         *
         * If a source already supplied a probability,
         * use it.
         *
         * If total xG is available but no market
         * probability exists, estimate only the
         * standard 2.5 goal line using Poisson.
         */

        function factorial(n) {

            if (n <= 1) {
                return 1;
            }

            let result = 1;

            for (
                let i = 2;
                i <= n;
                i++
            ) {
                result *= i;
            }

            return result;
        }

        function poisson(lambda, k) {

            if (
                lambda === null ||
                lambda < 0
            ) {
                return null;
            }

            return (
                Math.exp(-lambda) *
                Math.pow(lambda, k) /
                factorial(k)
            );
        }

        function over25Probability(lambda) {

            if (
                lambda === null ||
                lambda <= 0
            ) {
                return null;
            }

            let underOrEqualTwo = 0;

            for (
                let k = 0;
                k <= 2;
                k++
            ) {

                underOrEqualTwo +=
                    poisson(
                        lambda,
                        k
                    );
            }

            return clamp(
                (
                    1 -
                    underOrEqualTwo
                ) * 100,
                1,
                99
            );
        }

        let over25ProbabilityModel =
            null;

        let under25ProbabilityModel =
            null;

        if (
            totalXG !== null
        ) {

            over25ProbabilityModel =
                round(
                    over25Probability(
                        totalXG
                    )
                );

            if (
                over25ProbabilityModel !== null
            ) {

                under25ProbabilityModel =
                    round(
                        100 -
                        over25ProbabilityModel
                    );
            }
        }

        // =====================================================
        // INDEPENDENT MODEL READINESS
        // =====================================================

        const formReady =
            homeFormMatches.length > 0 &&
            awayFormMatches.length > 0;

        const xGReady =
            homeXG !== null &&
            awayXG !== null;

        const bttsReady =
            bttsProbability !== null;

        const overUnderReady =
            overUnderAssessments.length > 0;

        const independentModelReady =
            formReady ||
            xGReady ||
            bttsReady ||
            overUnderReady;

        // =====================================================
        // CANDIDATE MARKETS
        // =====================================================

        const candidates = [];

        function addCandidate(
            prediction,
            probability,
            market,
            strength,
            reason
        ) {

            const p =
                number(probability);

            if (
                p === null ||
                p <= 0 ||
                p > 100
            ) {
                return;
            }

            candidates.push({

                prediction,

                probability:
                    round(p),

                market,

                strength,

                reason
            });
        }

        // =====================================================
        // PRIMARY 1X2
        // =====================================================

        if (
            modelProbability.home !== null
        ) {

            addCandidate(
                "Home",
                modelProbability.home,
                "1X2",
                1.00,
                "Home win probability from the 1X2 model."
            );
        }

        if (
            modelProbability.draw !== null
        ) {

            addCandidate(
                "Draw",
                modelProbability.draw,
                "1X2",
                1.00,
                "Draw probability from the 1X2 model."
            );
        }

        if (
            modelProbability.away !== null
        ) {

            addCandidate(
                "Away",
                modelProbability.away,
                "1X2",
                1.00,
                "Away win probability from the 1X2 model."
            );
        }

        // =====================================================
        // OVER / UNDER 2.5
        // =====================================================

        /*
         * Prefer actual fixture-specific probability
         * when available.
         *
         * Otherwise use xG-derived probability.
         */

        let actualOver25 = null;
        let actualUnder25 = null;

        for (
            const item
            of overUnderAssessments
        ) {

            if (
                number(item.line) !== 2.5
            ) {
                continue;
            }

            const selection =
                String(
                    item.selection ||
                    ""
                ).toUpperCase();

            if (
                selection === "OVER" &&
                item.sourceProbability !== null
            ) {

                actualOver25 =
                    number(
                        item.sourceProbability
                    );
            }

            if (
                selection === "UNDER" &&
                item.sourceProbability !== null
            ) {

                actualUnder25 =
                    number(
                        item.sourceProbability
                    );
            }
        }

        const finalOver25 =
            actualOver25 !== null
                ? actualOver25
                : over25ProbabilityModel;

        const finalUnder25 =
            actualUnder25 !== null
                ? actualUnder25
                : under25ProbabilityModel;

        if (
            finalOver25 !== null
        ) {

            addCandidate(
                "Over 2.5",
                finalOver25,
                "TOTAL_GOALS",
                0.96,
                actualOver25 !== null
                    ? "Fixture-specific Over 2.5 probability."
                    : "Over 2.5 probability derived from team xG."
            );
        }

        if (
            finalUnder25 !== null
        ) {

            addCandidate(
                "Under 2.5",
                finalUnder25,
                "TOTAL_GOALS",
                0.96,
                actualUnder25 !== null
                    ? "Fixture-specific Under 2.5 probability."
                    : "Under 2.5 probability derived from team xG."
            );
        }

        // =====================================================
        // BTTS
        // =====================================================

        if (
            bttsProbability !== null
        ) {

            /*
             * btts.probability is treated as the
             * probability of BTTS Yes.
             */

            const yes =
                clamp(
                    bttsProbability,
                    1,
                    99
                );

            const no =
                100 - yes;

            addCandidate(
                "BTTS Yes",
                yes,
                "BTTS",
                0.94,
                "Fixture-specific BTTS probability."
            );

            addCandidate(
                "BTTS No",
                no,
                "BTTS",
                0.94,
                "Complement of fixture-specific BTTS probability."
            );
        }

        // =====================================================
        // SECONDARY MARKETS
        // =====================================================

        /*
         * Double Chance is deliberately given a lower
         * market priority.
         *
         * It can qualify, but it cannot automatically
         * dominate the primary markets.
         */

        if (
            doubleChance.homeOrDraw !== null
        ) {

            addCandidate(
                "Home or Draw",
                doubleChance.homeOrDraw,
                "DOUBLE_CHANCE",
                0.78,
                "Double Chance probability."
            );
        }

        if (
            doubleChance.awayOrDraw !== null
        ) {

            addCandidate(
                "Away or Draw",
                doubleChance.awayOrDraw,
                "DOUBLE_CHANCE",
                0.78,
                "Double Chance probability."
            );
        }

        // =====================================================
        // CANDIDATE FILTER
        // =====================================================

        /*
         * Remove weak candidates.
         */

        const eligibleCandidates =
            candidates.filter(
                candidate => {

                    /*
                     * Require at least 50%.
                     */

                    if (
                        candidate.probability < 50
                    ) {
                        return false;
                    }

                    /*
                     * A secondary market must have
                     * stronger probability to compensate
                     * for its lower market strength.
                     */

                    if (
                        candidate.market ===
                        "DOUBLE_CHANCE" &&
                        candidate.probability < 70
                    ) {
                        return false;
                    }

                    return true;
                }
            );

        // =====================================================
        // MARKET PRIORITY
        // =====================================================

        /*
         * We do not simply sort by probability.
         *
         * Score =
         *
         * probability × market strength
         *
         * This prevents an 85% broad Double Chance
         * probability from automatically defeating a
         * meaningful 60% primary-market signal.
         */

        for (
            const candidate
            of eligibleCandidates
        ) {

            candidate.selectionScore =
                round(
                    candidate.probability *
                    candidate.strength,
                    3
                );
        }

        eligibleCandidates.sort(
            (a, b) => {

                if (
                    b.selectionScore !==
                    a.selectionScore
                ) {

                    return (
                        b.selectionScore -
                        a.selectionScore
                    );
                }

                return (
                    b.probability -
                    a.probability
                );
            }
        );

        // =====================================================
        // FINAL PREDICTION
        // =====================================================

        let finalPrediction = null;

        let finalProbability = null;

        let finalMarket = null;

        let finalReason = null;

        if (
            eligibleCandidates.length > 0
        ) {

            const selected =
                eligibleCandidates[0];

            finalPrediction =
                selected.prediction;

            finalProbability =
                selected.probability;

            finalMarket =
                selected.market;

            finalReason =
                selected.reason;
        }

        // =====================================================
        // CONFIDENCE
        // =====================================================

        let confidence = 0;

        if (
            match.home &&
            match.away
        ) {
            confidence += 15;
        }

        if (
            formReady
        ) {
            confidence += 25;
        }

        if (
            xGReady
        ) {
            confidence += 20;
        }

        if (
            bttsReady
        ) {
            confidence += 10;
        }

        if (
            overUnderReady
        ) {
            confidence += 10;
        }

        if (
            marketOdds.home !== null &&
            marketOdds.draw !== null &&
            marketOdds.away !== null
        ) {
            confidence += 10;
        }

        if (
            Array.isArray(
                h2h.evidence
            ) &&
            h2h.evidence.length > 0
        ) {
            confidence += 5;
        }

        if (
            Array.isArray(
                data.injuries?.evidence
            ) &&
            data.injuries.evidence.length > 0
        ) {
            confidence += 5;
        }

        confidence =
            clamp(
                confidence,
                0,
                100
            );

        // =====================================================
        // STATUS
        // =====================================================

        let status =
            "INSUFFICIENT_DATA";

        if (
            finalPrediction !== null &&
            independentModelReady
        ) {

            status =
                "ANALYSIS_READY";

        } else if (
            finalPrediction !== null
        ) {

            status =
                "PARTIAL_ANALYSIS";
        }

        // =====================================================
        // RESPONSE
        // =====================================================

        /*
         * IMPORTANT:
         *
         * The frontend only needs:
         *
         * prediction
         * probability
         *
         * The remaining information is returned under
         * internalAnalysis for debugging/backend use.
         */

        return res.status(200).json({

            success: true,

            version:
                "Prediction Engine V2.0",

            prediction:
                finalPrediction,

            probability:
                finalProbability,

            status,

            match: {

                home:
                    match.home,

                away:
                    match.away,

                date:
                    match.date || null
            },

            internalAnalysis: {

                market:
                    finalMarket,

                reason:
                    finalReason,

                confidence,

                modelMethod,

                modelProbability,

                marketProbability,

                doubleChance,

                drawNoBet,

                xg: {

                    home:
                        round(homeXG),

                    away:
                        round(awayXG),

                    total:
                        totalXG
                },

                btts: {

                    probability:
                        bttsProbability,

                    assessments:
                        bttsAssessments
                },

                overUnder:
                    overUnderAssessments,

                candidates:
                    eligibleCandidates,

                allCandidates:
                    candidates,

                readiness: {

                    formReady,

                    xGReady,

                    bttsReady,

                    overUnderReady,

                    independentModelReady,

                    availability
                }
            }

        });

    } catch (error) {

        console.error(
            "Prediction Engine V2 error:",
            error
        );

        return res.status(500).json({

            success: false,

            error:
                "Prediction engine failed.",

            details:
                error.message
        });
    }
}
