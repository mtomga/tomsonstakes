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

        const body =
            req.body || {};

        const match =
            body.match || {};

        const normalized =
            body.normalized || {};


        if (
            !match.home ||
            !match.away
        ) {

            return res.status(400).json({
                success: false,
                error:
                    "match.home and match.away are required."
            });

        }


        // =====================================================
        // HELPERS
        // =====================================================

        function number(value) {

            const n =
                Number(value);

            return Number.isFinite(n)
                ? n
                : null;

        }


        function clamp(
            value,
            min,
            max
        ) {

            return Math.max(
                min,
                Math.min(
                    max,
                    value
                )
            );

        }


        function round(
            value,
            decimals = 2
        ) {

            const n =
                Number(value);

            if (
                !Number.isFinite(n)
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
                    n * factor
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

            if (
                !valid.length
            ) {
                return null;
            }

            return (
                valid.reduce(
                    (a, b) =>
                        a + b,
                    0
                ) /
                valid.length
            );

        }


        function impliedProbability(
            odds
        ) {

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


        function normalizeProbabilities(
            values
        ) {

            const entries =
                Object.entries(
                    values
                ).filter(
                    ([_, value]) =>
                        value !== null &&
                        Number.isFinite(
                            Number(value)
                        )
                );


            if (
                !entries.length
            ) {
                return values;
            }


            const total =
                entries.reduce(
                    (
                        sum,
                        [_, value]
                    ) =>
                        sum +
                        Number(value),
                    0
                );


            if (
                total <= 0
            ) {
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


        // =====================================================
        // DATA
        // =====================================================

        const data =
            normalized || {};


        const form =
            data.form || {};


        const statistics =
            data.statistics || {};


        const oddsData =
            data.odds || {};


        // =====================================================
        // FORM
        // =====================================================

        function formScore(
            matches
        ) {

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
                                item.result ||
                                item.outcome ||
                                ""
                            )
                            .toUpperCase();


                        if (
                            result === "W"
                        ) {
                            return 3;
                        }


                        if (
                            result === "D"
                        ) {
                            return 1;
                        }


                        if (
                            result === "L"
                        ) {
                            return 0;
                        }


                        return null;

                    })
                    .filter(
                        value =>
                            value !== null
                    );


            if (
                !points.length
            ) {
                return null;
            }


            return (
                points.reduce(
                    (a, b) =>
                        a + b,
                    0
                ) /
                (
                    points.length *
                    3
                )
            ) * 100;

        }


        const homeForm =
            Array.isArray(
                form.home
            )
                ? form.home
                : [];


        const awayForm =
            Array.isArray(
                form.away
            )
                ? form.away
                : [];


        const homeFormScore =
            formScore(
                homeForm
            );


        const awayFormScore =
            formScore(
                awayForm
            );


        // =====================================================
        // 1X2 MARKET DATA
        // =====================================================

        const marketOdds = {

            home:
                number(
                    oddsData.home
                ),

            draw:
                number(
                    oddsData.draw
                ),

            away:
                number(
                    oddsData.away
                )

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
        // 1X2 MODEL
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


        /*
         * If both teams have form,
         * allow form to influence 1X2.
         */

        if (
            homeFormScore !== null &&
            awayFormScore !== null
        ) {

            /*
             * If bookmaker 1X2 probabilities
             * are unavailable, create a neutral
             * baseline from form.
             */

            if (
                modelProbability.home === null ||
                modelProbability.draw === null ||
                modelProbability.away === null
            ) {

                const homeStrength =
                    homeFormScore + 8;

                const awayStrength =
                    awayFormScore;

                const drawStrength =
                    35;


                const total =
                    homeStrength +
                    awayStrength +
                    drawStrength;


                modelProbability = {

                    home:
                        (
                            homeStrength /
                            total
                        ) * 100,

                    draw:
                        (
                            drawStrength /
                            total
                        ) * 100,

                    away:
                        (
                            awayStrength /
                            total
                        ) * 100

                };

            } else {

                /*
                 * Form difference is deliberately
                 * kept moderate.
                 */

                const difference =
                    (
                        homeFormScore -
                        awayFormScore
                    ) / 100;


                const adjustment =
                    difference * 12;


                let home =
                    modelProbability.home +
                    adjustment;


                let away =
                    modelProbability.away -
                    adjustment;


                let draw =
                    modelProbability.draw;


                home =
                    clamp(
                        home,
                        5,
                        85
                    );


                away =
                    clamp(
                        away,
                        5,
                        85
                    );


                draw =
                    clamp(
                        draw,
                        5,
                        60
                    );


                const total =
                    home +
                    draw +
                    away;


                modelProbability = {

                    home:
                        (
                            home /
                            total
                        ) * 100,

                    draw:
                        (
                            draw /
                            total
                        ) * 100,

                    away:
                        (
                            away /
                            total
                        ) * 100

                };

            }

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
        // xG
        // =====================================================

        const xg =
            statistics.xg ||
            data.xg ||
            {};


        let homeXG = null;
        let awayXG = null;


        if (
            Array.isArray(
                xg.home
            )
        ) {

            homeXG =
                average(
                    xg.home.map(
                        item =>
                            item.value ??
                            item.xG ??
                            item
                    )
                );

        } else {

            homeXG =
                number(
                    xg.home
                );

        }


        if (
            Array.isArray(
                xg.away
            )
        ) {

            awayXG =
                average(
                    xg.away.map(
                        item =>
                            item.value ??
                            item.xG ??
                            item
                    )
                );

        } else {

            awayXG =
                number(
                    xg.away
                );

        }


        const totalXG =
            homeXG !== null &&
            awayXG !== null
                ? homeXG + awayXG
                : null;


        // =====================================================
        // POISSON
        // =====================================================

        function factorial(n) {

            if (
                n <= 1
            ) {
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


        function poisson(
            lambda,
            k
        ) {

            if (
                lambda === null ||
                lambda < 0
            ) {
                return null;
            }


            return (
                Math.exp(-lambda) *
                Math.pow(
                    lambda,
                    k
                ) /
                factorial(k)
            );

        }


        function over25Probability(
            lambda
        ) {

            if (
                lambda === null ||
                lambda <= 0
            ) {
                return null;
            }


            let underTwoPointFive =
                0;


            for (
                let k = 0;
                k <= 2;
                k++
            ) {

                underTwoPointFive +=
                    poisson(
                        lambda,
                        k
                    );

            }


            return clamp(
                (
                    1 -
                    underTwoPointFive
                ) * 100,
                1,
                99
            );

        }


        let modelOver25 =
            null;


        let modelUnder25 =
            null;


        if (
            totalXG !== null
        ) {

            modelOver25 =
                round(
                    over25Probability(
                        totalXG
                    )
                );


            if (
                modelOver25 !== null
            ) {

                modelUnder25 =
                    round(
                        100 -
                        modelOver25
                    );

            }

        }


        // =====================================================
        // OVER / UNDER SOURCE DATA
        // =====================================================

        const overUnder =
            Array.isArray(
                statistics.overUnder
            )
                ? statistics.overUnder
                : Array.isArray(
                    data.overUnder
                )
                    ? data.overUnder
                    : [];


        let actualOver25 = null;
        let actualUnder25 = null;


        for (
            const item
            of overUnder
        ) {

            const line =
                number(
                    item.line
                );


            const selection =
                String(
                    item.selection ||
                    item.answer ||
                    ""
                )
                .toUpperCase();


            const probability =
                number(
                    item.percentage ??
                    item.probability
                );


            if (
                line === 2.5 &&
                probability !== null
            ) {

                if (
                    selection === "OVER"
                ) {

                    actualOver25 =
                        probability;

                }


                if (
                    selection === "UNDER"
                ) {

                    actualUnder25 =
                        probability;

                }

            }

        }


        const finalOver25 =
            actualOver25 !== null
                ? actualOver25
                : modelOver25;


        const finalUnder25 =
            actualUnder25 !== null
                ? actualUnder25
                : modelUnder25;


        // =====================================================
        // BTTS
        // =====================================================

        const btts =
            statistics.btts ||
            data.btts ||
            {};


        let bttsYes =
            number(
                btts.probability ??
                btts.percentage
            );


        /*
         * Support the normalized array format.
         */

        if (
            bttsYes === null &&
            Array.isArray(btts)
        ) {

            const yes =
                btts.find(
                    item =>
                        String(
                            item.selection ||
                            item.answer ||
                            ""
                        )
                        .toUpperCase() ===
                        "YES"
                );


            if (yes) {

                bttsYes =
                    number(
                        yes.percentage ??
                        yes.probability
                    );

            }

        }


        let bttsNo =
            bttsYes !== null
                ? 100 - bttsYes
                : null;


        if (
            bttsYes !== null
        ) {

            bttsYes =
                clamp(
                    bttsYes,
                    1,
                    99
                );


            bttsNo =
                round(
                    100 -
                    bttsYes
                );

        }


        // =====================================================
        // MARKET ELIGIBILITY
        // =====================================================

        /*
         * IMPORTANT:
         *
         * We do NOT allow every mathematical
         * probability to compete equally.
         *
         * The engine first decides whether a
         * market is sufficiently supported.
         */


        const candidates = [];


        function addCandidate(
            prediction,
            probability,
            market,
            priority,
            minimumProbability,
            reason
        ) {

            const p =
                number(
                    probability
                );


            if (
                p === null
            ) {
                return;
            }


            if (
                p < minimumProbability
            ) {
                return;
            }


            candidates.push({

                prediction,

                probability:
                    round(p),

                market,

                priority,

                reason

            });

        }


        // =====================================================
        // 1X2 ELIGIBILITY
        // =====================================================

        /*
         * A 1X2 result must have:
         *
         * - both teams' form, OR
         * - complete 1X2 market information.
         *
         * This prevents a weak single-source
         * probability from becoming the final pick.
         */


        const formReady =
            homeForm.length >= 3 &&
            awayForm.length >= 3;


        const marketReady =
            marketProbability.home !== null &&
            marketProbability.draw !== null &&
            marketProbability.away !== null;


        const oneXtwoReady =
            formReady ||
            marketReady;


        if (
            oneXtwoReady
        ) {

            addCandidate(
                "Home",
                modelProbability.home,
                "1X2",
                100,
                50,
                "Home win"
            );


            addCandidate(
                "Draw",
                modelProbability.draw,
                "1X2",
                100,
                50,
                "Draw"
            );


            addCandidate(
                "Away",
                modelProbability.away,
                "1X2",
                100,
                50,
                "Away win"
            );

        }


        // =====================================================
        // OVER 2.5 ELIGIBILITY
        // =====================================================

        /*
         * Over 2.5 requires either:
         *
         * - fixture-specific probability
         * - or xG from BOTH teams.
         */


        const over25Ready =
            actualOver25 !== null ||
            (
                homeXG !== null &&
                awayXG !== null
            );


        if (
            over25Ready
        ) {

            addCandidate(
                "Over 2.5",
                finalOver25,
                "TOTAL_GOALS",
                100,
                55,
                "Over 2.5"
            );

        }


        // =====================================================
        // UNDER 2.5 ELIGIBILITY
        // =====================================================

        const under25Ready =
            actualUnder25 !== null ||
            (
                homeXG !== null &&
                awayXG !== null
            );


        if (
            under25Ready
        ) {

            addCandidate(
                "Under 2.5",
                finalUnder25,
                "TOTAL_GOALS",
                100,
                55,
                "Under 2.5"
            );

        }


        // =====================================================
        // BTTS ELIGIBILITY
        // =====================================================

        /*
         * BTTS is allowed only when the system
         * has an actual BTTS probability.
         */


        const bttsReady =
            bttsYes !== null;


        if (
            bttsReady
        ) {

            addCandidate(
                "BTTS Yes",
                bttsYes,
                "BTTS",
                95,
                55,
                "Both teams to score"
            );


            addCandidate(
                "BTTS No",
                bttsNo,
                "BTTS",
                95,
                55,
                "Both teams not to score"
            );

        }


        // =====================================================
        // DOUBLE CHANCE
        // =====================================================

        /*
         * Double Chance is deliberately NOT included
         * in the primary prediction competition.
         *
         * This is important because:
         *
         * Home + Draw can naturally produce a
         * probability around 65–80%.
         *
         * That does not necessarily mean it should
         * replace a stronger specific market.
         *
         * Therefore Double Chance is only a fallback.
         */


        const doubleChanceCandidates = [];


        if (
            doubleChance.homeOrDraw !== null
        ) {

            doubleChanceCandidates.push({

                prediction:
                    "Home or Draw",

                probability:
                    doubleChance.homeOrDraw

            });

        }


        if (
            doubleChance.awayOrDraw !== null
        ) {

            doubleChanceCandidates.push({

                prediction:
                    "Away or Draw",

                probability:
                    doubleChance.awayOrDraw

            });

        }


        // =====================================================
        // PRIMARY SELECTION
        // =====================================================

        /*
         * First choose among the specific markets.
         *
         * We do NOT simply use raw mathematical
         * probability across unrelated markets.
         */


        candidates.sort(
            (
                a,
                b
            ) =>
                b.probability -
                a.probability
        );


        let selected =
            candidates.length
                ? candidates[0]
                : null;


        // =====================================================
        // DOUBLE CHANCE FALLBACK
        // =====================================================

        /*
         * Double Chance can only be used if:
         *
         * 1. There is no sufficiently supported
         *    specific prediction, OR
         *
         * 2. Its probability is exceptionally high.
         *
         * This prevents broad markets from dominating.
         */


        if (
            selected === null &&
            doubleChanceCandidates.length
        ) {

            const dc =
                doubleChanceCandidates
                    .sort(
                        (
                            a,
                            b
                        ) =>
                            b.probability -
                            a.probability
                    )[0];


            if (
                dc.probability >= 70
            ) {

                selected = {

                    prediction:
                        dc.prediction,

                    probability:
                        round(
                            dc.probability
                        ),

                    market:
                        "DOUBLE_CHANCE",

                    reason:
                        "Fallback Double Chance prediction."

                };

            }

        }


        // =====================================================
        // FINAL RESULT
        // =====================================================

        let prediction =
            selected
                ? selected.prediction
                : null;


        let probability =
            selected
                ? selected.probability
                : null;


        /*
         * If there is no sufficiently supported
         * prediction, don't manufacture one.
         */


        const success =
            Boolean(
                prediction &&
                probability !== null
            );


        // =====================================================
        // FINAL RESPONSE
        // =====================================================

        /*
         * IMPORTANT:
         *
         * The frontend does NOT need:
         *
         * - Match Analysis
         * - xG
         * - form
         * - odds
         * - warnings
         * - raw data
         * - candidate markets
         * - internal calculations
         *
         * Only the final prediction and probability
         * are returned.
         */


        return res.status(200).json({

            success,

            prediction,

            probability

        });


    } catch (error) {

        console.error(
            "Prediction Engine error:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                "Prediction engine failed."

        });

    }

}
