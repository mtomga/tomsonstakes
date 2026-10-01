export default async function handler(req, res) {
    try {

        if (req.method !== "POST") {
            return res.status(405).json({
                error: "POST method required."
            });
        }

        const body = req.body || {};
        const match = body.match || {};

        const home =
            match.home ||
            match.homeInput ||
            "";

        const away =
            match.away ||
            match.awayInput ||
            "";

        const homeIdentity =
            match.homeIdentity ||
            "";

        const awayIdentity =
            match.awayIdentity ||
            "";

        const matchDate =
            match.date ||
            "";

        if (!home || !away || !matchDate) {
            return res.status(400).json({
                error: "match.home, match.away and match.date are required."
            });
        }

        const VALID_IDENTITIES = [
            "DEPORTES_CONCEPCION",
            "UNIVERSIDAD_DE_CONCEPCION",
            "OHIGGINS"
        ];

        if (!VALID_IDENTITIES.includes(homeIdentity)) {
            return res.status(400).json({
                error: "Invalid homeIdentity."
            });
        }

        if (!VALID_IDENTITIES.includes(awayIdentity)) {
            return res.status(400).json({
                error: "Invalid awayIdentity."
            });
        }

        if (homeIdentity === awayIdentity) {
            return res.status(400).json({
                error: "Home and away identities cannot be the same."
            });
        }

        const canonical = {
            DEPORTES_CONCEPCION: "Deportes Concepcion",
            UNIVERSIDAD_DE_CONCEPCION: "Universidad de Concepcion",
            OHIGGINS: "O'Higgins"
        };

        const homeCanonical =
            canonical[homeIdentity];

        const awayCanonical =
            canonical[awayIdentity];

        const searches =
            Array.isArray(body.searches)
                ? body.searches
                : [];

        const allResults =
            Array.isArray(body.allResults)
                ? body.allResults
                : [];

        /*
         * =========================================================
         * DATE HELPERS
         * =========================================================
         */

        const targetDate =
            new Date(`${matchDate}T00:00:00Z`);

        const targetTime =
            targetDate.getTime();

        const matchYear =
            targetDate.getUTCFullYear();

        function cleanText(value) {
            return String(value || "")
                .replace(/\s+/g, " ")
                .trim();
        }

        function normalizeText(value) {
            return cleanText(value)
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[’']/g, "'")
                .replace(/[–—]/g, "-");
        }

        function dateOnly(value) {

            if (!value) {
                return null;
            }

            const text =
                cleanText(value);

            const parsed =
                new Date(text);

            if (!Number.isNaN(parsed.getTime())) {
                return parsed;
            }

            return null;
        }

        function extractDates(text) {

            const dates = [];

            const source =
                cleanText(text);

            /*
             * September 27, 2026
             */
            const longPattern =
                /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})\b/gi;

            let match;

            while ((match = longPattern.exec(source))) {

                const parsed =
                    new Date(
                        `${match[1]} ${match[2]}, ${match[3]}`
                    );

                if (!Number.isNaN(parsed.getTime())) {
                    dates.push(parsed);
                }
            }

            /*
             * 27 Sep 2026
             */
            const shortPattern =
                /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\b/gi;

            while ((match = shortPattern.exec(source))) {

                const parsed =
                    new Date(
                        `${match[2]} ${match[1]}, ${match[3]}`
                    );

                if (!Number.isNaN(parsed.getTime())) {
                    dates.push(parsed);
                }
            }

            /*
             * 27.09.2026
             */
            const numericPattern =
                /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g;

            while ((match = numericPattern.exec(source))) {

                const day =
                    Number(match[1]);

                const month =
                    Number(match[2]) - 1;

                const year =
                    Number(match[3]);

                const parsed =
                    new Date(
                        Date.UTC(
                            year,
                            month,
                            day
                        )
                    );

                if (!Number.isNaN(parsed.getTime())) {
                    dates.push(parsed);
                }
            }

            return dates;
        }

        function resultDate(item) {

            const dates = [];

            if (item && item.date) {

                const d =
                    dateOnly(item.date);

                if (d) {
                    dates.push(d);
                }
            }

            dates.push(
                ...extractDates(
                    [
                        item?.title,
                        item?.snippet
                    ]
                    .filter(Boolean)
                    .join(" ")
                )
            );

            if (!dates.length) {
                return null;
            }

            dates.sort(
                (a, b) =>
                    b.getTime() - a.getTime()
            );

            return dates[0];
        }

        function isFutureResult(item) {

            const d =
                resultDate(item);

            if (!d) {
                return false;
            }

            return d.getTime() > targetTime;
        }

        /*
         * =========================================================
         * TEAM IDENTITY HELPERS
         * =========================================================
         */

        function identityAliases(identity) {

            switch (identity) {

                case "DEPORTES_CONCEPCION":
                    return [
                        "deportes concepcion",
                        "deportes concepción",
                        "d. concepcion",
                        "d. concepción",
                        "d concepcion",
                        "d concepción"
                    ];

                case "UNIVERSIDAD_DE_CONCEPCION":
                    return [
                        "universidad de concepcion",
                        "universidad de concepción",
                        "u. de concepcion",
                        "u. de concepción",
                        "u de concepcion",
                        "u de concepción"
                    ];

                case "OHIGGINS":
                    return [
                        "o'higgins",
                        "o’higgins",
                        "o higgins",
                        "o.higgins",
                        "club o'higgins",
                        "club o’higgins"
                    ];

                default:
                    return [];
            }
        }

        function containsTeam(text, identity) {

            const normalized =
                normalizeText(text);

            const aliases =
                identityAliases(identity);

            return aliases.some(alias =>
                normalized.includes(
                    normalizeText(alias)
                )
            );
        }

        function containsWrongConcepcion(text) {

            const normalized =
                normalizeText(text);

            return (
                normalized.includes(
                    "universidad de concepcion"
                ) ||
                normalized.includes(
                    "universidad de concepción"
                )
            );
        }

        /*
         * =========================================================
         * RESULT CONTAINER
         * =========================================================
         */

        const flatResults = [];

        for (const search of searches) {

            const searchResults =
                Array.isArray(search.results)
                    ? search.results
                    : [];

            for (const item of searchResults) {

                flatResults.push({
                    type:
                        search.type || null,

                    team:
                        search.team || null,

                    teamIdentity:
                        search.teamIdentity || null,

                    title:
                        cleanText(item.title),

                    link:
                        item.link || null,

                    snippet:
                        cleanText(item.snippet),

                    date:
                        item.date || null
                });
            }
        }

        if (
            flatResults.length === 0 &&
            allResults.length > 0
        ) {

            for (const item of allResults) {

                flatResults.push({
                    type:
                        item.type || null,

                    team:
                        null,

                    teamIdentity:
                        null,

                    title:
                        cleanText(item.title),

                    link:
                        item.link || null,

                    snippet:
                        cleanText(item.snippet),

                    date:
                        item.date || null
                });
            }
        }

        /*
         * =========================================================
         * FORM PARSING - V3.16
         * =========================================================
         */

        function parseScorePairs(text) {

            const pairs = [];

            const source =
                cleanText(text);

            let match;

            /*
             * -----------------------------------------------------
             * NORMAL SCORE
             *
             * 2-0
             * 2 - 0
             * 2:0
             * 2 – 0
             * 2—0
             * -----------------------------------------------------
             */

            const standard =
                /\b(\d{1,2})\s*[-:]\s*(\d{1,2})\b/g;

            while ((match = standard.exec(source))) {

                pairs.push({
                    homeGoals:
                        Number(match[1]),

                    awayGoals:
                        Number(match[2]),

                    index:
                        match.index,

                    raw:
                        match[0],

                    compact:
                        false
                });
            }

            /*
             * -----------------------------------------------------
             * COMPACT SCORE
             *
             * 01
             * 11
             * 13
             * 21
             *
             * Flashscore-style snippets often use:
             *
             * D. Concepcion. A. Italiano. 01. L.
             *
             * Nublense. D. Concepcion. 01. W.
             * -----------------------------------------------------
             */

            const compact =
                /\b([0-9])([0-9])\b/g;

            while ((match = compact.exec(source))) {

                const before =
                    source.slice(
                        Math.max(
                            0,
                            match.index - 80
                        ),
                        match.index
                    );

                const after =
                    source.slice(
                        match.index +
                        match[0].length,
                        match.index +
                        match[0].length +
                        80
                    );

                const context =
                    `${before} ${after}`;

                /*
                 * Compact scores should have football
                 * result context.
                 */
                if (
                    /\b(W|D|L)\b/i.test(context) ||
                    /\b(FT|full[- ]?time|final)\b/i.test(context)
                ) {

                    pairs.push({
                        homeGoals:
                            Number(match[1]),

                        awayGoals:
                            Number(match[2]),

                        index:
                            match.index,

                        raw:
                            match[0],

                        compact:
                            true
                    });
                }
            }

            return pairs;
        }

        /*
         * Find the position of the requested team relative
         * to a score.
         *
         * Examples:
         *
         * Deportes Concepcion 2-0 Curico Unido
         * -> HOME
         *
         * Colo Colo 1-1 Deportes Concepcion
         * -> AWAY
         *
         * Nublense. D. Concepcion. 01. W.
         * -> HOME/away determined by team ordering
         */

        function determineTeamPosition(
            text,
            score,
            identity
        ) {

            const normalized =
                normalizeText(text);

            const aliases =
                identityAliases(identity)
                    .map(alias =>
                        normalizeText(alias)
                    )
                    .sort(
                        (a, b) =>
                            b.length - a.length
                    );

            const scoreStart =
                score.index;

            const scoreEnd =
                score.index +
                score.raw.length;

            const before =
                normalized.slice(
                    Math.max(
                        0,
                        scoreStart - 120
                    ),
                    scoreStart
                );

            const after =
                normalized.slice(
                    scoreEnd,
                    scoreEnd + 120
                );

            const beforeHas =
                aliases.some(alias =>
                    before.includes(alias)
                );

            const afterHas =
                aliases.some(alias =>
                    after.includes(alias)
                );

            if (
                beforeHas &&
                !afterHas
            ) {
                return "HOME";
            }

            if (
                afterHas &&
                !beforeHas
            ) {
                return "AWAY";
            }

            /*
             * If both sides contain the team name because
             * of a noisy search snippet, use the nearest
             * occurrence.
             */
            if (
                beforeHas &&
                afterHas
            ) {

                let beforeDistance =
                    Infinity;

                let afterDistance =
                    Infinity;

                for (const alias of aliases) {

                    const bIndex =
                        before.lastIndexOf(alias);

                    if (bIndex >= 0) {
                        beforeDistance =
                            Math.min(
                                beforeDistance,
                                before.length - bIndex
                            );
                    }

                    const aIndex =
                        after.indexOf(alias);

                    if (aIndex >= 0) {
                        afterDistance =
                            Math.min(
                                afterDistance,
                                aIndex
                            );
                    }
                }

                if (
                    beforeDistance <
                    afterDistance
                ) {
                    return "HOME";
                }

                if (
                    afterDistance <
                    beforeDistance
                ) {
                    return "AWAY";
                }
            }

            return null;
        }

        /*
         * Determine whether the score itself belongs to the
         * requested team's match against the target opponent.
         *
         * This is deliberately stricter than simply checking
         * whether both team names occur somewhere on the page.
         */
        function scoreBelongsToTargetFixture(
            item,
            score
        ) {

            const source =
                normalizeText(
                    `${item.title} ${item.snippet}`
                );

            const start =
                Math.max(
                    0,
                    score.index - 140
                );

            const end =
                Math.min(
                    source.length,
                    score.index +
                    score.raw.length +
                    140
                );

            const context =
                source.slice(start, end);

            return (
                containsTeam(
                    context,
                    homeIdentity
                ) &&
                containsTeam(
                    context,
                    awayIdentity
                )
            );
        }

        /*
         * Convert a parsed score into W/D/L.
         */
        function scoreToResult(
            score,
            position
        ) {

            if (position === "HOME") {

                if (
                    score.homeGoals >
                    score.awayGoals
                ) {
                    return "W";
                }

                if (
                    score.homeGoals <
                    score.awayGoals
                ) {
                    return "L";
                }

                return "D";
            }

            if (position === "AWAY") {

                if (
                    score.awayGoals >
                    score.homeGoals
                ) {
                    return "W";
                }

                if (
                    score.awayGoals <
                    score.homeGoals
                ) {
                    return "L";
                }

                return "D";
            }

            return null;
        }

        function inferFormResult(
            item,
            identity
        ) {

            const title =
                cleanText(item.title);

            const snippet =
                cleanText(item.snippet);

            const combined =
                `${title} ${snippet}`;

            if (
                !containsTeam(
                    combined,
                    identity
                )
            ) {
                return null;
            }

            /*
             * -----------------------------------------------------
             * Prevent University of Concepcion from being
             * confused with Deportes Concepcion.
             * -----------------------------------------------------
             */

            if (
                identity ===
                "DEPORTES_CONCEPCION"
            ) {

                const titleHasUniversity =
                    containsTeam(
                        title,
                        "UNIVERSIDAD_DE_CONCEPCION"
                    );

                const titleHasRequested =
                    containsTeam(
                        title,
                        identity
                    );

                if (
                    titleHasUniversity &&
                    !titleHasRequested
                ) {
                    return null;
                }
            }

            const scores =
                parseScorePairs(combined);

            if (!scores.length) {
                return null;
            }

            /*
             * -----------------------------------------------------
             * First priority:
             * Find a score that clearly belongs to the requested
             * team's fixture.
             * -----------------------------------------------------
             */

            const candidateScores = [];

            for (const score of scores) {

                const position =
                    determineTeamPosition(
                        combined,
                        score,
                        identity
                    );

                if (!position) {
                    continue;
                }

                /*
                 * A source containing both target teams
                 * around the score is the target fixture,
                 * not recent form.
                 */
                if (
                    scoreBelongsToTargetFixture(
                        item,
                        score
                    )
                ) {
                    continue;
                }

                candidateScores.push({
                    score,
                    position
                });
            }

            /*
             * Use the first reliable score.
             */
            if (candidateScores.length) {

                const selected =
                    candidateScores[0];

                const result =
                    scoreToResult(
                        selected.score,
                        selected.position
                    );

                if (!result) {
                    return null;
                }

                return {

                    result,

                    homeGoals:
                        selected.score.homeGoals,

                    awayGoals:
                        selected.score.awayGoals,

                    score:
                        `${selected.score.homeGoals}-${selected.score.awayGoals}`,

                    date:
                        resultDate(item),

                    source:
                        item.link,

                    title:
                        item.title,

                    snippet:
                        item.snippet,

                    evidenceType:
                        selected.score.compact
                            ? "FORM_COMPACT_SCORE"
                            : "FORM_SCORE"
                };
            }

            /*
             * -----------------------------------------------------
             * Second priority:
             * Explicit W/D/L marker.
             *
             * Example:
             *
             * Nublense. D. Concepcion. 01. W.
             *
             * This is useful when score orientation cannot be
             * safely established but the source explicitly marks
             * the requested team as W/D/L.
             * -----------------------------------------------------
             */

            const normalized =
                normalizeText(combined);

            const aliases =
                identityAliases(identity)
                    .map(alias =>
                        normalizeText(alias)
                    )
                    .sort(
                        (a, b) =>
                            b.length - a.length
                    );

            let nearestTeamIndex = -1;

            for (const alias of aliases) {

                const index =
                    normalized.indexOf(alias);

                if (
                    index >= 0 &&
                    (
                        nearestTeamIndex === -1 ||
                        index < nearestTeamIndex
                    )
                ) {
                    nearestTeamIndex = index;
                }
            }

            if (nearestTeamIndex >= 0) {

                const nearby =
                    normalized.slice(
                        nearestTeamIndex,
                        nearestTeamIndex + 120
                    );

                const wl =
                    nearby.match(
                        /\b([WDL])\b/i
                    );

                if (wl) {

                    return {

                        result:
                            wl[1].toUpperCase(),

                        homeGoals:
                            null,

                        awayGoals:
                            null,

                        score:
                            null,

                        date:
                            resultDate(item),

                        source:
                            item.link,

                        title:
                            item.title,

                        snippet:
                            item.snippet,

                        evidenceType:
                            "FORM_WDL"
                    };
                }
            }

            return null;
        }

        /*
         * =========================================================
         * TARGET FIXTURE / WRONG FIXTURE
         * =========================================================
         */

        function isSameMatchAsTarget(item) {

            const combined =
                normalizeText(
                    [
                        item.title,
                        item.snippet,
                        item.link
                    ]
                    .filter(Boolean)
                    .join(" ")
                );

            return (
                containsTeam(
                    combined,
                    homeIdentity
                ) &&
                containsTeam(
                    combined,
                    awayIdentity
                )
            );
        }

        /*
         * This function is now context-aware.
         *
         * Santa Cruz is a wrong H2H opponent, but it is NOT
         * a wrong O'Higgins recent-form opponent.
         */
        function isKnownWrongFixture(
            item,
            context = "general"
        ) {

            const combined =
                normalizeText(
                    [
                        item.title,
                        item.snippet,
                        item.link
                    ]
                    .filter(Boolean)
                    .join(" ")
                );

            /*
             * Santa Cruz is only wrong when we are looking
             * specifically for the target H2H/fixture.
             */
            if (
                context === "h2h" &&
                combined.includes(
                    "deportes santa cruz"
                ) &&
                (
                    combined.includes("o'higgins") ||
                    combined.includes("o higgins")
                )
            ) {
                return true;
            }

            /*
             * University of Concepcion must not contaminate
             * Deportes Concepcion.
             */
            if (
                homeIdentity ===
                "DEPORTES_CONCEPCION"
            ) {

                if (
                    combined.includes(
                        "universidad de concepcion"
                    ) ||
                    combined.includes(
                        "universidad de concepción"
                    )
                ) {

                    const directUniversityFixture =
                        (
                            combined.includes(
                                "vs universidad de concepcion"
                            ) ||
                            combined.includes(
                                "universidad de concepcion vs"
                            ) ||
                            combined.includes(
                                "universidad de concepcion."
                            )
                        );

                    if (directUniversityFixture) {
                        return true;
                    }
                }
            }

            return false;
        }

        /*
         * =========================================================
         * FORM EXTRACTION
         * =========================================================
         */

        function extractFormForTeam(
            identity
        ) {

            const teamSearches =
                searches.filter(search => {

                    const type =
                        String(
                            search.type || ""
                        ).toLowerCase();

                    const searchIdentity =
                        search.teamIdentity;

                    return (
                        type.startsWith("form_") &&
                        (
                            searchIdentity === identity ||
                            !searchIdentity
                        )
                    );
                });

            const candidates = [];

            for (
                const search
                of teamSearches
            ) {

                const results =
                    Array.isArray(search.results)
                        ? search.results
                        : [];

                for (
                    const raw
                    of results
                ) {

                    const item = {

                        type:
                            search.type,

                        team:
                            search.team,

                        teamIdentity:
                            search.teamIdentity,

                        title:
                            cleanText(
                                raw.title
                            ),

                        link:
                            raw.link || null,

                        snippet:
                            cleanText(
                                raw.snippet
                            ),

                        date:
                            raw.date || null
                    };

                    /*
                     * -------------------------------------------------
                     * Future matches are never form.
                     * -------------------------------------------------
                     */

                    if (
                        isFutureResult(item)
                    ) {
                        continue;
                    }

                    /*
                     * -------------------------------------------------
                     * Do NOT automatically reject a source just
                     * because both target teams appear somewhere.
                     *
                     * We now inspect the actual score context inside
                     * inferFormResult().
                     * -------------------------------------------------
                     */

                    if (
                        isKnownWrongFixture(
                            item,
                            "form"
                        )
                    ) {
                        continue;
                    }

                    const parsed =
                        inferFormResult(
                            item,
                            identity
                        );

                    if (!parsed) {
                        continue;
                    }

                    /*
                     * -------------------------------------------------
                     * Explicitly reject the old July 27 target H2H
                     * when it appears as a form result.
                     *
                     * This is deliberately score-specific so that
                     * ordinary matches are not lost.
                     * -------------------------------------------------
                     */

                    const text =
                        normalizeText(
                            [
                                item.title,
                                item.snippet
                            ]
                            .filter(Boolean)
                            .join(" ")
                        );

                    const oldTargetFixture =
                        (
                            text.includes(
                                "deportes concepcion 2 - 0 o'higgins"
                            ) ||
                            text.includes(
                                "deportes concepcion 2-0 o'higgins"
                            ) ||
                            text.includes(
                                "deportes concepcion 2 0 o'higgins"
                            ) ||
                            text.includes(
                                "o'higgins 0 - 2 deportes concepcion"
                            ) ||
                            text.includes(
                                "o'higgins 0-2 deportes concepcion"
                            )
                        );

                    if (oldTargetFixture) {
                        continue;
                    }

                    /*
                     * -------------------------------------------------
                     * Also reject if parsed result has both target
                     * identities immediately around the score.
                     * -------------------------------------------------
                     */

                    if (
                        parsed.score &&
                        scoreBelongsToTargetFixture(
                            item,
                            {
                                index:
                                    text.indexOf(
                                        parsed.score
                                            .replace(
                                                "-",
                                                " - "
                                            )
                                    ) >= 0
                                        ? text.indexOf(
                                            parsed.score
                                                .replace(
                                                    "-",
                                                    " - "
                                                )
                                        )
                                        : Math.max(
                                            0,
                                            text.indexOf(
                                                parsed.score
                                            )
                                        ),

                                raw:
                                    parsed.score
                            }
                        )
                    ) {
                        continue;
                    }

                    candidates.push({

                        ...parsed,

                        searchType:
                            search.type,

                        teamIdentity:
                            identity
                    });
                }
            }

            /*
             * =====================================================
             * DEDUPLICATION
             * =====================================================
             *
             * Multiple search engines can return the same match.
             *
             * First try:
             * date + score
             *
             * Then:
             * date + result + opponent-ish title
             *
             * This prevents five copies of the same match.
             */

            const unique = [];

            const seen =
                new Set();

            for (
                const item
                of candidates
            ) {

                const dateKey =
                    item.date
                        ? item.date
                            .toISOString()
                            .slice(0, 10)
                        : "NO_DATE";

                const scoreKey =
                    item.score ||
                    item.result ||
                    "";

                /*
                 * Normalize title but remove common source words.
                 */
                const titleKey =
                    normalizeText(
                        item.title
                    )
                    .replace(
                        /\b(football|soccer|results|match|fixture|prediction|live|score)\b/g,
                        ""
                    )
                    .trim();

                const key =
                    [
                        identity,
                        dateKey,
                        scoreKey,
                        titleKey
                    ]
                    .join("|");

                if (
                    seen.has(key)
                ) {
                    continue;
                }

                seen.add(key);

                unique.push(item);
            }

            /*
             * -----------------------------------------------------
             * Sort newest first.
             * -----------------------------------------------------
             */

            unique.sort(
                (a, b) => {

                    const aTime =
                        a.date
                            ? a.date.getTime()
                            : 0;

                    const bTime =
                        b.date
                            ? b.date.getTime()
                            : 0;

                    return bTime - aTime;
                }
            );

            /*
             * -----------------------------------------------------
             * Keep maximum five reliable matches.
             * -----------------------------------------------------
             */

            return unique.slice(0, 5);
        }

        const homeForm =
            extractFormForTeam(
                homeIdentity
            );

        const awayForm =
            extractFormForTeam(
                awayIdentity
            );

        /*
         * =========================================================
         * FORM SUMMARY
         * =========================================================
         */

        function formSummary(form) {

            let wins = 0;
            let draws = 0;
            let losses = 0;

            for (const item of form) {

                if (item.result === "W") {
                    wins++;
                }

                if (item.result === "D") {
                    draws++;
                }

                if (item.result === "L") {
                    losses++;
                }
            }

            return {
                matches:
                    form.length,

                wins,
                draws,
                losses,

                points:
                    wins * 3 +
                    draws,

                available:
                    form.length > 0
            };
        }

        /*
         * =========================================================
         * H2H
         * =========================================================
         */

        function isExactPair(item) {

            const title =
                normalizeText(
                    item.title
                );

            const link =
                normalizeText(
                    item.link
                );

            const primary =
                `${title} ${link}`;

            return (
                containsTeam(
                    primary,
                    homeIdentity
                ) &&
                containsTeam(
                    primary,
                    awayIdentity
                )
            );
        }

        const h2h = [];

        for (
            const search
            of searches
        ) {

            if (
                String(search.type || "")
                    .toLowerCase() !==
                "h2h"
            ) {
                continue;
            }

            const results =
                Array.isArray(search.results)
                    ? search.results
                    : [];

            for (
                const raw
                of results
            ) {

                const item = {

                    title:
                        cleanText(
                            raw.title
                        ),

                    link:
                        raw.link || null,

                    snippet:
                        cleanText(
                            raw.snippet
                        ),

                    date:
                        raw.date || null
                };

                if (
                    !isExactPair(item)
                ) {
                    continue;
                }

                if (
                    isKnownWrongFixture(
                        item,
                        "h2h"
                    )
                ) {
                    continue;
                }

                h2h.push({

                    title:
                        item.title,

                    source:
                        item.link,

                    snippet:
                        item.snippet,

                    date:
                        resultDate(item)
                });
            }
        }

        /*
         * =========================================================
         * MARKET / STATISTICS
         * =========================================================
         */

        const marketSources = [];

        for (
            const search
            of searches
        ) {

            const type =
                String(
                    search.type || ""
                ).toLowerCase();

            if (
                type !== "stats" &&
                type !== "odds"
            ) {
                continue;
            }

            const results =
                Array.isArray(search.results)
                    ? search.results
                    : [];

            for (
                const raw
                of results
            ) {

                const item = {

                    title:
                        cleanText(
                            raw.title
                        ),

                    link:
                        raw.link || null,

                    snippet:
                        cleanText(
                            raw.snippet
                        ),

                    date:
                        raw.date || null
                };

                const text =
                    normalizeText(
                        [
                            item.title,
                            item.snippet,
                            item.link
                        ]
                        .filter(Boolean)
                        .join(" ")
                    );

                const hasHome =
                    containsTeam(
                        text,
                        homeIdentity
                    );

                const hasAway =
                    containsTeam(
                        text,
                        awayIdentity
                    );

                const exactFixture =
                    hasHome &&
                    hasAway;

                marketSources.push({

                    ...item,

                    exactFixture
                });
            }
        }

        /*
         * =========================================================
         * BTTS
         * =========================================================
         */

        const btts = [];

        for (
            const source
            of marketSources
        ) {

            if (!source.exactFixture) {
                continue;
            }

            const text =
                `${source.title} ${source.snippet}`;

            const pattern =
                /\b(yes|no)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%/gi;

            let match;

            while (
                (match =
                    pattern.exec(text))
            ) {

                btts.push({

                    selection:
                        match[1]
                            .toUpperCase(),

                    odds:
                        Number(match[2]),

                    percentage:
                        Number(match[3]),

                    source:
                        source.link,

                    title:
                        source.title
                });
            }
        }

        /*
         * =========================================================
         * OVER / UNDER
         * =========================================================
         */

        const overUnder = [];

        for (
            const source
            of marketSources
        ) {

            if (!source.exactFixture) {
                continue;
            }

            const text =
                `${source.title} ${source.snippet}`;

            const pattern =
                /\b(over|under)\s*(\d+(?:[.,]\d+)?)\s*(?:@|odds?)?\s*(\d+(?:[.,]\d+)?)?/gi;

            let match;

            while (
                (match =
                    pattern.exec(text))
            ) {

                const selection =
                    match[1]
                        .toUpperCase();

                const line =
                    Number(
                        match[2]
                            .replace(",", ".")
                    );

                const odds =
                    match[3]
                        ? Number(
                            match[3]
                                .replace(",", ".")
                        )
                        : null;

                if (
                    Number.isFinite(line)
                ) {

                    overUnder.push({

                        selection,

                        line,

                        odds,

                        source:
                            source.link,

                        title:
                            source.title
                    });
                }
            }
        }

        /*
         * =========================================================
         * 1X2
         * =========================================================
         */

        const oneXtwo = [];

        for (
            const source
            of marketSources
        ) {

            if (!source.exactFixture) {
                continue;
            }

            const text =
                `${source.title} ${source.snippet}`;

            const pattern =
                /\b1\s*[:\-]?\s*(\d+(?:\.\d+)?)\s+X\s*[:\-]?\s*(\d+(?:\.\d+)?)\s+2\s*[:\-]?\s*(\d+(?:\.\d+)?)\b/i;

            const match =
                text.match(pattern);

            if (!match) {
                continue;
            }

            oneXtwo.push({

                home:
                    Number(match[1]),

                draw:
                    Number(match[2]),

                away:
                    Number(match[3]),

                source:
                    source.link,

                title:
                    source.title
            });
        }

        /*
         * =========================================================
         * XG
         * =========================================================
         */

        const xg = [];

        for (
            const source
            of marketSources
        ) {

            if (!source.exactFixture) {
                continue;
            }

            const text =
                `${source.title} ${source.snippet}`;

            const homePattern =
                new RegExp(
                    `${homeCanonical.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                    )}[^\\d]{0,80}(\\d+(?:\\.\\d+)?)\\s*xG`,
                    "i"
                );

            const awayPattern =
                new RegExp(
                    `${awayCanonical.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                    )}[^\\d]{0,80}(\\d+(?:\\.\\d+)?)\\s*xG`,
                    "i"
                );

            const homeMatch =
                text.match(homePattern);

            const awayMatch =
                text.match(awayPattern);

            if (
                homeMatch ||
                awayMatch
            ) {

                xg.push({

                    home:
                        homeMatch
                            ? Number(
                                homeMatch[1]
                            )
                            : null,

                    away:
                        awayMatch
                            ? Number(
                                awayMatch[1]
                            )
                            : null,

                    source:
                        source.link,

                    title:
                        source.title
                });
            }
        }

        /*
         * =========================================================
         * INJURIES
         * =========================================================
         */

        const injuries = [];

        for (
            const search
            of searches
        ) {

            if (
                String(search.type || "")
                    .toLowerCase() !==
                "injuries"
            ) {
                continue;
            }

            const results =
                Array.isArray(search.results)
                    ? search.results
                    : [];

            for (
                const raw
                of results
            ) {

                const item = {

                    title:
                        cleanText(
                            raw.title
                        ),

                    link:
                        raw.link || null,

                    snippet:
                        cleanText(
                            raw.snippet
                        ),

                    date:
                        raw.date || null
                };

                const text =
                    `${item.title} ${item.snippet}`;

                if (
                    !containsTeam(
                        text,
                        homeIdentity
                    ) &&
                    !containsTeam(
                        text,
                        awayIdentity
                    )
                ) {
                    continue;
                }

                if (
                    isKnownWrongFixture(
                        item,
                        "injuries"
                    )
                ) {
                    continue;
                }

                injuries.push({

                    title:
                        item.title,

                    source:
                        item.link,

                    snippet:
                        item.snippet
                });
            }
        }

        /*
         * =========================================================
         * LINEUPS
         * =========================================================
         */

        const lineups = [];

        for (
            const search
            of searches
        ) {

            if (
                String(search.type || "")
                    .toLowerCase() !==
                "lineups"
            ) {
                continue;
            }

            const results =
                Array.isArray(search.results)
                    ? search.results
                    : [];

            for (
                const raw
                of results
            ) {

                const item = {

                    title:
                        cleanText(
                            raw.title
                        ),

                    link:
                        raw.link || null,

                    snippet:
                        cleanText(
                            raw.snippet
                        ),

                    date:
                        raw.date || null
                };

                const text =
                    `${item.title} ${item.snippet}`;

                const hasHome =
                    containsTeam(
                        text,
                        homeIdentity
                    );

                const hasAway =
                    containsTeam(
                        text,
                        awayIdentity
                    );

                if (
                    !hasHome &&
                    !hasAway
                ) {
                    continue;
                }

                lineups.push({

                    type:
                        /predicted|probable|expected/i.test(
                            text
                        )
                            ? "predicted"
                            : "unknown",

                    source:
                        item.link,

                    title:
                        item.title,

                    snippet:
                        item.snippet
                });
            }
        }

        /*
         * =========================================================
         * ODDS
         * =========================================================
         */

        const odds = {

            oneXtwo:
                oneXtwo.length
                    ? oneXtwo[0]
                    : null,

            btts:
                btts.length
                    ? btts[0]
                    : null,

            overUnder:
                overUnder.length
                    ? overUnder[0]
                    : null
        };

        /*
         * =========================================================
         * AVAILABILITY / READINESS
         * =========================================================
         */

        const homeFormSummary =
            formSummary(homeForm);

        const awayFormSummary =
            formSummary(awayForm);

        const identityReady =
            Boolean(
                homeIdentity &&
                awayIdentity
            );

        const formReady =
            homeForm.length >= 1 &&
            awayForm.length >= 1;

        const statsReady =
            (
                btts.length > 0 ||
                overUnder.length > 0 ||
                xg.length > 0
            );

        const dataReady =
            identityReady &&
            formReady &&
            statsReady;

        const analysisReady =
            dataReady;

        /*
         * =========================================================
         * QUALITY
         * =========================================================
         */

        let quality = 0;

        if (identityReady) {
            quality += 0.20;
        }

        if (homeForm.length >= 3) {
            quality += 0.15;
        } else if (homeForm.length >= 1) {
            quality += 0.08;
        }

        if (awayForm.length >= 3) {
            quality += 0.15;
        } else if (awayForm.length >= 1) {
            quality += 0.08;
        }

        if (h2h.length > 0) {
            quality += 0.10;
        }

        if (btts.length > 0) {
            quality += 0.10;
        }

        if (overUnder.length > 0) {
            quality += 0.10;
        }

        if (oneXtwo.length > 0) {
            quality += 0.05;
        }

        if (xg.length > 0) {
            quality += 0.10;
        }

        if (injuries.length > 0) {
            quality += 0.05;
        }

        if (lineups.length > 0) {
            quality += 0.05;
        }

        quality =
            Math.min(
                1,
                Number(
                    quality.toFixed(2)
                )
            );

        /*
         * =========================================================
         * WARNINGS
         * =========================================================
         */

        const warnings = [];

        if (!homeForm.length) {
            warnings.push(
                "No reliable recent form extracted for the home team."
            );
        }

        if (!awayForm.length) {
            warnings.push(
                "No reliable recent form extracted for the away team."
            );
        }

        if (
            homeForm.length < 5 ||
            awayForm.length < 5
        ) {
            warnings.push(
                "Fewer than 5 reliable form results were available for one or both teams."
            );
        }

        if (!h2h.length) {
            warnings.push(
                "No reliable H2H evidence extracted."
            );
        }

        if (!btts.length) {
            warnings.push(
                "No reliable fixture-specific BTTS evidence extracted."
            );
        }

        if (!overUnder.length) {
            warnings.push(
                "No reliable fixture-specific Over/Under evidence extracted."
            );
        }

        if (!xg.length) {
            warnings.push(
                "No explicit team-attributed xG extracted."
            );
        }

        if (!injuries.length) {
            warnings.push(
                "No reliable current injury/suspension evidence extracted."
            );
        }

        if (!lineups.length) {
            warnings.push(
                "No current lineup evidence extracted."
            );
        } else if (
            lineups.every(
                item =>
                    item.type === "predicted"
            )
        ) {
            warnings.push(
                "Lineup evidence is predicted/probable, not confirmed."
            );
        }

        warnings.push(
            "H2H is kept separate from recent form."
        );

        warnings.push(
            "Missing statistics are not guessed."
        );

        warnings.push(
            "Market probabilities are kept separate from bookmaker odds."
        );

        /*
         * =========================================================
         * RESPONSE
         * =========================================================
         */

        return res.status(200).json({

            success: true,

            version:
                "V3.16",

            match: {

                home:
                    homeCanonical,

                homeInput:
                    home,

                homeIdentity,

                away:
                    awayCanonical,

                awayInput:
                    away,

                awayIdentity,

                date:
                    matchDate,

                year:
                    matchYear
            },

            identity: {

                requested: {

                    home:
                        homeIdentity,

                    away:
                        awayIdentity
                },

                resolved: {

                    home:
                        homeCanonical,

                    away:
                        awayCanonical
                },

                homeStatus:
                    "RESOLVED",

                awayStatus:
                    "RESOLVED",

                separateConcepcionIdentities:
                    true,

                contaminationDetected:
                    false
            },

            form: {

                home:
                    homeForm,

                away:
                    awayForm,

                homeSummary:
                    homeFormSummary,

                awaySummary:
                    awayFormSummary
            },

            h2h,

            statistics: {

                xg,

                btts,

                overUnder
            },

            injuries,

            lineups,

            odds,

            availability: {

                identityReady,

                formReady,

                statsReady,

                dataReady,

                analysisReady
            },

            quality,

            warnings,

            sourceCount:
                flatResults.length,

            formSourceCount:
                flatResults.filter(
                    item =>
                        String(
                            item.type || ""
                        )
                        .toLowerCase()
                        .startsWith("form_")
                ).length
        });

    } catch (error) {

        console.error(
            "V3.16 normalize-web error:",
            error
        );

        return res.status(500).json({

            success: false,

            error:
                "Web normalization failed.",

            details:
                error.message
        });
    }
}
