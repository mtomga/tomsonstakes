export default async function handler(req, res) {

    try {

        if (req.method !== "POST") {
            return res.status(405).json({
                success: false,
                error: "POST method required."
            });
        }

        const body =
            req.body || {};

        const match =
            body.match || {};

        const home =
            String(
                match.home ||
                match.homeInput ||
                ""
            ).trim();

        const away =
            String(
                match.away ||
                match.awayInput ||
                ""
            ).trim();

        const homeIdentity =
            String(
                match.homeIdentity ||
                ""
            ).trim();

        const awayIdentity =
            String(
                match.awayIdentity ||
                ""
            ).trim();

        const matchDate =
            String(
                match.date ||
                ""
            ).trim();

        // =====================================================
        // BASIC VALIDATION
        // =====================================================

        if (
            !home ||
            !away ||
            !matchDate
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "match.home, match.away and match.date are required."
            });
        }

        // =====================================================
        // GLOBAL TEAM IDENTITY
        // =====================================================

        function createIdentity(name) {

            return String(name || "")
                .trim()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[’']/g, "")
                .replace(/&/g, " AND ")
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
        }

        const expectedHomeIdentity =
            createIdentity(home);

        const expectedAwayIdentity =
            createIdentity(away);

        // =====================================================
        // VERIFY TEAM IDENTITIES
        // =====================================================

        if (
            !expectedHomeIdentity ||
            !expectedAwayIdentity
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Unable to generate team identities."
            });
        }

        if (
            homeIdentity !==
                expectedHomeIdentity
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Invalid homeIdentity.",

                details: {
                    supplied:
                        homeIdentity,

                    expected:
                        expectedHomeIdentity,

                    team:
                        home
                }
            });
        }

        if (
            awayIdentity !==
                expectedAwayIdentity
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Invalid awayIdentity.",

                details: {
                    supplied:
                        awayIdentity,

                    expected:
                        expectedAwayIdentity,

                    team:
                        away
                }
            });
        }

        if (
            homeIdentity ===
            awayIdentity
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Home and away identities cannot be the same."
            });
        }

        // =====================================================
        // CANONICAL NAMES
        //
        // No fixed team list.
        // API-Football's team names are authoritative here.
        // =====================================================

        const homeCanonical =
            home;

        const awayCanonical =
            away;

        // =====================================================
        // SEARCH DATA
        // =====================================================

        const searches =
            Array.isArray(body.searches)
                ? body.searches
                : [];

        const allResults =
            Array.isArray(body.allResults)
                ? body.allResults
                : [];

        // =====================================================
        // DATE HELPERS
        // =====================================================

        const targetDate =
            new Date(
                `${matchDate}T00:00:00Z`
            );

        if (
            Number.isNaN(
                targetDate.getTime()
            )
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Invalid match date."
            });
        }

        const targetTime =
            targetDate.getTime();

        const matchYear =
            targetDate.getUTCFullYear();

        function cleanText(value) {

            return String(
                value || ""
            )
                .replace(/\s+/g, " ")
                .trim();
        }

        function normalizeText(value) {

            return cleanText(value)
                .toLowerCase()
                .normalize("NFD")
                .replace(
                    /[\u0300-\u036f]/g,
                    ""
                )
                .replace(
                    /[’']/g,
                    "'"
                )
                .replace(
                    /[–—]/g,
                    "-"
                );
        }

        // =====================================================
        // TEAM TEXT NORMALIZATION
        // =====================================================

        function teamTextVariants(
            teamName
        ) {

            const original =
                cleanText(teamName);

            const withoutApostrophe =
                original.replace(
                    /[’']/g,
                    ""
                );

            const normalized =
                original
                    .normalize("NFD")
                    .replace(
                        /[\u0300-\u036f]/g,
                        ""
                    )
                    .replace(
                        /[’']/g,
                        ""
                    );

            const lowerOriginal =
                normalizeText(
                    original
                );

            const variants = [

                original,

                withoutApostrophe,

                normalized,

                lowerOriginal

            ];

            /*
             * Add a simple initial form where useful:
             *
             * "Manchester United"
             * -> "m united"
             *
             * "Deportes Concepcion"
             * -> "d concepcion"
             *
             * This is deliberately conservative.
             */

            const words =
                normalized
                    .split(/\s+/)
                    .filter(Boolean);

            if (
                words.length >= 2
            ) {

                const firstInitial =
                    words[0].charAt(0);

                const remainder =
                    words
                        .slice(1)
                        .join(" ");

                if (
                    firstInitial &&
                    remainder
                ) {
                    variants.push(
                        `${firstInitial} ${remainder}`
                    );
                }
            }

            return [
                ...new Set(
                    variants
                        .map(
                            value =>
                                normalizeText(
                                    value
                                )
                        )
                        .filter(Boolean)
                )
            ];
        }

        const homeAliases =
            teamTextVariants(
                homeCanonical
            );

        const awayAliases =
            teamTextVariants(
                awayCanonical
            );

        function containsTeam(
            text,
            aliases
        ) {

            const normalized =
                normalizeText(text);

            return aliases.some(
                alias =>
                    normalized.includes(
                        alias
                    )
            );
        }

        function containsHome(
            text
        ) {
            return containsTeam(
                text,
                homeAliases
            );
        }

        function containsAway(
            text
        ) {
            return containsTeam(
                text,
                awayAliases
            );
        }

        // =====================================================
        // DATE PARSING
        // =====================================================

        function dateOnly(value) {

            if (!value) {
                return null;
            }

            const text =
                cleanText(value);

            const parsed =
                new Date(text);

            if (
                !Number.isNaN(
                    parsed.getTime()
                )
            ) {
                return parsed;
            }

            return null;
        }

        function extractDates(
            text
        ) {

            const dates = [];

            const source =
                cleanText(text);

            let match;

            // September 27, 2026
            const longPattern =
                /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})\b/gi;

            while (
                (match =
                    longPattern.exec(
                        source
                    ))
            ) {

                const parsed =
                    new Date(
                        `${match[1]} ${match[2]}, ${match[3]}`
                    );

                if (
                    !Number.isNaN(
                        parsed.getTime()
                    )
                ) {
                    dates.push(parsed);
                }
            }

            // 27 Sep 2026
            const shortPattern =
                /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\b/gi;

            while (
                (match =
                    shortPattern.exec(
                        source
                    ))
            ) {

                const parsed =
                    new Date(
                        `${match[2]} ${match[1]}, ${match[3]}`
                    );

                if (
                    !Number.isNaN(
                        parsed.getTime()
                    )
                ) {
                    dates.push(parsed);
                }
            }

            // 27.09.2026
            const numericPattern =
                /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g;

            while (
                (match =
                    numericPattern.exec(
                        source
                    ))
            ) {

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

                if (
                    !Number.isNaN(
                        parsed.getTime()
                    )
                ) {
                    dates.push(parsed);
                }
            }

            return dates;
        }

        function resultDate(
            item
        ) {

            const dates = [];

            if (
                item &&
                item.date
            ) {

                const d =
                    dateOnly(
                        item.date
                    );

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

            if (
                !dates.length
            ) {
                return null;
            }

            dates.sort(
                (a, b) =>
                    b.getTime() -
                    a.getTime()
            );

            return dates[0];
        }

        function isFutureResult(
            item
        ) {

            const d =
                resultDate(item);

            if (!d) {
                return false;
            }

            return (
                d.getTime() >
                targetTime
            );
        }

        // =====================================================
        // FLATTEN SEARCH RESULTS
        // =====================================================

        const flatResults = [];

        for (
            const search
            of searches
        ) {

            const searchResults =
                Array.isArray(
                    search.results
                )
                    ? search.results
                    : [];

            for (
                const item
                of searchResults
            ) {

                flatResults.push({

                    type:
                        search.type ||
                        null,

                    team:
                        search.team ||
                        null,

                    teamIdentity:
                        search.teamIdentity ||
                        null,

                    title:
                        cleanText(
                            item.title
                        ),

                    link:
                        item.link ||
                        null,

                    snippet:
                        cleanText(
                            item.snippet
                        ),

                    date:
                        item.date ||
                        null
                });
            }
        }

        /*
         * Fallback when only allResults is available.
         */

        if (
            flatResults.length === 0 &&
            allResults.length > 0
        ) {

            for (
                const item
                of allResults
            ) {

                flatResults.push({

                    type:
                        item.type ||
                        null,

                    team:
                        item.team ||
                        null,

                    teamIdentity:
                        item.teamIdentity ||
                        null,

                    title:
                        cleanText(
                            item.title
                        ),

                    link:
                        item.link ||
                        null,

                    snippet:
                        cleanText(
                            item.snippet
                        ),

                    date:
                        item.date ||
                        null
                });
            }
        }

        // =====================================================
        // SCORE PARSER
        // =====================================================

        function parseScorePairs(
            text
        ) {

            const pairs = [];

            const source =
                cleanText(text);

            let match;

            // Normal scores:
            // 2-0
            // 2:0
            // 2 – 0

            const standard =
                /\b(\d{1,2})\s*[-:]\s*(\d{1,2})\b/g;

            while (
                (match =
                    standard.exec(
                        source
                    ))
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
                        false
                });
            }

            /*
             * Compact scores:
             * 01, 11, 20, 21 etc.
             *
             * Only accept when there is explicit football
             * result context.
             */

            const compact =
                /\b([0-9])([0-9])\b/g;

            while (
                (match =
                    compact.exec(
                        source
                    ))
            ) {

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

                if (
                    /\b(W|D|L)\b/i.test(
                        context
                    ) ||
                    /\b(FT|full[- ]?time|final)\b/i.test(
                        context
                    )
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

        // =====================================================
        // SCORE TEAM POSITION
        // =====================================================

        function determineTeamPosition(
            text,
            score,
            aliases
        ) {

            const normalized =
                normalizeText(text);

            const sortedAliases =
                [...aliases].sort(
                    (a, b) =>
                        b.length -
                        a.length
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
                        scoreStart - 140
                    ),
                    scoreStart
                );

            const after =
                normalized.slice(
                    scoreEnd,
                    scoreEnd + 140
                );

            const beforeHas =
                sortedAliases.some(
                    alias =>
                        before.includes(
                            alias
                        )
                );

            const afterHas =
                sortedAliases.some(
                    alias =>
                        after.includes(
                            alias
                        )
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
             * If both sides contain an alias,
             * determine which occurrence is nearest.
             */

            if (
                beforeHas &&
                afterHas
            ) {

                let beforeDistance =
                    Infinity;

                let afterDistance =
                    Infinity;

                for (
                    const alias
                    of sortedAliases
                ) {

                    const beforeIndex =
                        before.lastIndexOf(
                            alias
                        );

                    if (
                        beforeIndex >= 0
                    ) {

                        beforeDistance =
                            Math.min(
                                beforeDistance,

                                before.length -
                                beforeIndex
                            );
                    }

                    const afterIndex =
                        after.indexOf(
                            alias
                        );

                    if (
                        afterIndex >= 0
                    ) {

                        afterDistance =
                            Math.min(
                                afterDistance,
                                afterIndex
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

        // =====================================================
        // SCORE → W/D/L
        // =====================================================

        function scoreToResult(
            score,
            position
        ) {

            if (
                position ===
                "HOME"
            ) {

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

            if (
                position ===
                "AWAY"
            ) {

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

        // =====================================================
        // TARGET MATCH DETECTION
        // =====================================================

        function isTargetFixture(
            item
        ) {

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

            return (
                containsHome(text) &&
                containsAway(text)
            );
        }

        // =====================================================
        // EXTRACT FORM FOR ONE TEAM
        // =====================================================

        function extractFormForTeam(
            identity,
            aliases
        ) {

            const candidates = [];

            /*
             * Only form searches.
             *
             * Because /api/web-data now tags each form
             * search with the correct teamIdentity, we prefer
             * that information.
             */

            const teamSearches =
                searches.filter(
                    search => {

                        const type =
                            String(
                                search.type ||
                                ""
                            ).toLowerCase();

                        const searchIdentity =
                            String(
                                search.teamIdentity ||
                                ""
                            );

                        return (
                            type.startsWith(
                                identity ===
                                    homeIdentity
                                    ? "form_home"
                                    : "form_away"
                            ) &&
                            (
                                !searchIdentity ||
                                searchIdentity ===
                                    identity
                            )
                        );
                    }
                );

            for (
                const search
                of teamSearches
            ) {

                const results =
                    Array.isArray(
                        search.results
                    )
                        ? search.results
                        : [];

                for (
                    const raw
                    of results
                ) {

                    const item = {

                        type:
                            search.type ||
                            null,

                        team:
                            search.team ||
                            null,

                        teamIdentity:
                            search.teamIdentity ||
                            null,

                        title:
                            cleanText(
                                raw.title
                            ),

                        link:
                            raw.link ||
                            null,

                        snippet:
                            cleanText(
                                raw.snippet
                            ),

                        date:
                            raw.date ||
                            null
                    };

                    if (
                        isFutureResult(
                            item
                        )
                    ) {
                        continue;
                    }

                    const combined =
                        `${item.title} ${item.snippet}`;

                    /*
                     * The requested team must actually occur
                     * in the result.
                     */

                    if (
                        !containsTeam(
                            combined,
                            aliases
                        )
                    ) {
                        continue;
                    }

                    const scores =
                        parseScorePairs(
                            combined
                        );

                    if (
                        !scores.length
                    ) {
                        /*
                         * Try explicit W/D/L evidence.
                         */
                        const normalized =
                            normalizeText(
                                combined
                            );

                        const nearby =
                            normalized.slice(
                                0,
                                220
                            );

                        const wdl =
                            nearby.match(
                                /\b([WDL])\b/i
                            );

                        if (wdl) {

                            candidates.push({

                                result:
                                    wdl[1]
                                        .toUpperCase(),

                                homeGoals:
                                    null,

                                awayGoals:
                                    null,

                                score:
                                    null,

                                date:
                                    resultDate(
                                        item
                                    ),

                                source:
                                    item.link,

                                title:
                                    item.title,

                                snippet:
                                    item.snippet,

                                evidenceType:
                                    "FORM_WDL",

                                searchType:
                                    search.type,

                                teamIdentity:
                                    identity
                            });
                        }

                        continue;
                    }

                    /*
                     * Try each score.
                     */

                    for (
                        const score
                        of scores
                    ) {

                        const position =
                            determineTeamPosition(
                                combined,
                                score,
                                aliases
                            );

                        if (
                            !position
                        ) {
                            continue;
                        }

                        const result =
                            scoreToResult(
                                score,
                                position
                            );

                        if (
                            !result
                        ) {
                            continue;
                        }

                        /*
                         * If the result is actually the current
                         * target fixture, don't use it as recent
                         * form.
                         */

                        if (
                            isTargetFixture(
                                item
                            )
                        ) {
                            continue;
                        }

                        candidates.push({

                            result,

                            homeGoals:
                                score.homeGoals,

                            awayGoals:
                                score.awayGoals,

                            score:
                                `${score.homeGoals}-${score.awayGoals}`,

                            date:
                                resultDate(
                                    item
                                ),

                            source:
                                item.link,

                            title:
                                item.title,

                            snippet:
                                item.snippet,

                            evidenceType:
                                score.compact
                                    ? "FORM_COMPACT_SCORE"
                                    : "FORM_SCORE",

                            searchType:
                                search.type,

                            teamIdentity:
                                identity
                        });

                        /*
                         * One result per source item.
                         */

                        break;
                    }
                }
            }

            // =================================================
            // DEDUPLICATE
            // =================================================

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
                            .slice(
                                0,
                                10
                            )
                        : "NO_DATE";

                const scoreKey =
                    item.score ||
                    item.result ||
                    "";

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
                    ].join("|");

                if (
                    seen.has(key)
                ) {
                    continue;
                }

                seen.add(key);

                unique.push(item);
            }

            // =================================================
            // SORT NEWEST FIRST
            // =================================================

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

                    return (
                        bTime -
                        aTime
                    );
                }
            );

            return unique.slice(
                0,
                5
            );
        }

        const homeForm =
            extractFormForTeam(
                homeIdentity,
                homeAliases
            );

        const awayForm =
            extractFormForTeam(
                awayIdentity,
                awayAliases
            );

        // =====================================================
        // FORM SUMMARY
        // =====================================================

        function formSummary(
            form
        ) {

            let wins = 0;
            let draws = 0;
            let losses = 0;

            for (
                const item
                of form
            ) {

                if (
                    item.result ===
                    "W"
                ) {
                    wins++;
                }

                if (
                    item.result ===
                    "D"
                ) {
                    draws++;
                }

                if (
                    item.result ===
                    "L"
                ) {
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

        // =====================================================
        // H2H
        // =====================================================

        const h2h = [];

        for (
            const search
            of searches
        ) {

            if (
                String(
                    search.type || ""
                ).toLowerCase() !==
                "h2h"
            ) {
                continue;
            }

            const results =
                Array.isArray(
                    search.results
                )
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
                        raw.link ||
                        null,

                    snippet:
                        cleanText(
                            raw.snippet
                        ),

                    date:
                        raw.date ||
                        null
                };

                const text =
                    `${item.title} ${item.snippet}`;

                if (
                    !containsHome(text) ||
                    !containsAway(text)
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

        // =====================================================
        // MARKET / STATISTICS SOURCES
        // =====================================================

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
                Array.isArray(
                    search.results
                )
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
                        raw.link ||
                        null,

                    snippet:
                        cleanText(
                            raw.snippet
                        ),

                    date:
                        raw.date ||
                        null
                };

                const text =
                    [
                        item.title,
                        item.snippet,
                        item.link
                    ]
                        .filter(Boolean)
                        .join(" ");

                const hasHome =
                    containsHome(text);

                const hasAway =
                    containsAway(text);

                marketSources.push({

                    ...item,

                    exactFixture:
                        hasHome &&
                        hasAway
                });
            }
        }

        // =====================================================
        // BTTS
        // =====================================================

        const btts = [];

        for (
            const source
            of marketSources
        ) {

            if (
                !source.exactFixture
            ) {
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
                        Number(
                            match[2]
                        ),

                    percentage:
                        Number(
                            match[3]
                        ),

                    source:
                        source.link,

                    title:
                        source.title
                });
            }
        }

        // =====================================================
        // OVER / UNDER
        // =====================================================

        const overUnder = [];

        for (
            const source
            of marketSources
        ) {

            if (
                !source.exactFixture
            ) {
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
                            .replace(
                                ",",
                                "."
                            )
                    );

                const odds =
                    match[3]
                        ? Number(
                            match[3]
                                .replace(
                                    ",",
                                    "."
                                )
                        )
                        : null;

                if (
                    Number.isFinite(
                        line
                    )
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

        // =====================================================
        // 1X2
        // =====================================================

        const oneXtwo = [];

        for (
            const source
            of marketSources
        ) {

            if (
                !source.exactFixture
            ) {
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

        // =====================================================
        // xG
        // =====================================================

        const xg = [];

        function escapeRegex(
            value
        ) {

            return String(
                value || ""
            ).replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );
        }

        for (
            const source
            of marketSources
        ) {

            if (
                !source.exactFixture
            ) {
                continue;
            }

            const text =
                `${source.title} ${source.snippet}`;

            const homePattern =
                new RegExp(
                    `${escapeRegex(
                        homeCanonical
                    )}[^\\d]{0,80}(\\d+(?:\\.\\d+)?)\\s*xG`,
                    "i"
                );

            const awayPattern =
                new RegExp(
                    `${escapeRegex(
                        awayCanonical
                    )}[^\\d]{0,80}(\\d+(?:\\.\\d+)?)\\s*xG`,
                    "i"
                );

            const homeMatch =
                text.match(
                    homePattern
                );

            const awayMatch =
                text.match(
                    awayPattern
                );

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

        // =====================================================
        // INJURIES
        // =====================================================

        const injuries = [];

        for (
            const search
            of searches
        ) {

            if (
                String(
                    search.type || ""
                ).toLowerCase() !==
                "injuries"
            ) {
                continue;
            }

            const results =
                Array.isArray(
                    search.results
                )
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
                        raw.link ||
                        null,

                    snippet:
                        cleanText(
                            raw.snippet
                        ),

                    date:
                        raw.date ||
                        null
                };

                const text =
                    `${item.title} ${item.snippet}`;

                if (
                    !containsHome(text) &&
                    !containsAway(text)
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

        // =====================================================
        // LINEUPS
        // =====================================================

        const lineups = [];

        for (
            const search
            of searches
        ) {

            if (
                String(
                    search.type || ""
                ).toLowerCase() !==
                "lineups"
            ) {
                continue;
            }

            const results =
                Array.isArray(
                    search.results
                )
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
                        raw.link ||
                        null,

                    snippet:
                        cleanText(
                            raw.snippet
                        ),

                    date:
                        raw.date ||
                        null
                };

                const text =
                    `${item.title} ${item.snippet}`;

                const hasHome =
                    containsHome(text);

                const hasAway =
                    containsAway(text);

                if (
                    !hasHome &&
                    !hasAway
                ) {
                    continue;
                }

                lineups.push({

                    type:
                        /predicted|probable|expected/i
                            .test(text)
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

        // =====================================================
        // ODDS
        // =====================================================

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

        // =====================================================
        // READINESS
        // =====================================================

        const homeFormSummary =
            formSummary(
                homeForm
            );

        const awayFormSummary =
            formSummary(
                awayForm
            );

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
                xg.length > 0 ||
                oneXtwo.length > 0
            );

        const dataReady =
            identityReady &&
            formReady &&
            statsReady;

        const analysisReady =
            dataReady;

        // =====================================================
        // QUALITY
        // =====================================================

        let quality = 0;

        if (
            identityReady
        ) {
            quality += 0.20;
        }

        if (
            homeForm.length >= 3
        ) {
            quality += 0.15;
        } else if (
            homeForm.length >= 1
        ) {
            quality += 0.08;
        }

        if (
            awayForm.length >= 3
        ) {
            quality += 0.15;
        } else if (
            awayForm.length >= 1
        ) {
            quality += 0.08;
        }

        if (
            h2h.length > 0
        ) {
            quality += 0.10;
        }

        if (
            btts.length > 0
        ) {
            quality += 0.10;
        }

        if (
            overUnder.length > 0
        ) {
            quality += 0.10;
        }

        if (
            oneXtwo.length > 0
        ) {
            quality += 0.05;
        }

        if (
            xg.length > 0
        ) {
            quality += 0.10;
        }

        if (
            injuries.length > 0
        ) {
            quality += 0.05;
        }

        if (
            lineups.length > 0
        ) {
            quality += 0.05;
        }

        quality =
            Math.min(
                1,
                Number(
                    quality.toFixed(2)
                )
            );

        // =====================================================
        // WARNINGS
        // =====================================================

        const warnings = [];

        if (
            !homeForm.length
        ) {
            warnings.push(
                "No reliable recent form extracted for the home team."
            );
        }

        if (
            !awayForm.length
        ) {
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

        if (
            !h2h.length
        ) {
            warnings.push(
                "No reliable H2H evidence extracted."
            );
        }

        if (
            !btts.length
        ) {
            warnings.push(
                "No reliable fixture-specific BTTS evidence extracted."
            );
        }

        if (
            !overUnder.length
        ) {
            warnings.push(
                "No reliable fixture-specific Over/Under evidence extracted."
            );
        }

        if (
            !xg.length
        ) {
            warnings.push(
                "No explicit team-attributed xG extracted."
            );
        }

        if (
            !injuries.length
        ) {
            warnings.push(
                "No reliable current injury/suspension evidence extracted."
            );
        }

        if (
            !lineups.length
        ) {
            warnings.push(
                "No current lineup evidence extracted."
            );
        } else if (
            lineups.every(
                item =>
                    item.type ===
                    "predicted"
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

        // =====================================================
        // RESPONSE
        // =====================================================

        return res.status(200).json({

            success:
                true,

            version:
                "V4.0-GLOBAL",

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

                separateTeamIdentities:
                    true
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
                            item.type ||
                            ""
                        )
                            .toLowerCase()
                            .startsWith(
                                "form_"
                            )
                ).length
        });

    } catch (error) {

        console.error(
            "normalize-web error:",
            error
        );

        return res.status(500).json({

            success:
                false,

            error:
                "Web normalization failed.",

            details:
                error.message
        });
    }
}
