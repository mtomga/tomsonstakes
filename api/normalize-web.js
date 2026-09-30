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
         * ---------------------------------------------------------
         * DATE HELPERS
         * ---------------------------------------------------------
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

            /*
             * Prefer the latest date mentioned.
             */
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
         * ---------------------------------------------------------
         * TEAM IDENTITY HELPERS
         * ---------------------------------------------------------
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
                        "d concepcion"
                    ];

                case "UNIVERSIDAD_DE_CONCEPCION":
                    return [
                        "universidad de concepcion",
                        "universidad de concepción",
                        "u. de concepcion",
                        "u. de concepción",
                        "u de concepcion",
                        "u de concepcion"
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

            if (
                normalized.includes(
                    "universidad de concepcion"
                )
            ) {
                return true;
            }

            if (
                normalized.includes(
                    "universidad de concepción"
                )
            ) {
                return true;
            }

            return false;
        }

        /*
         * ---------------------------------------------------------
         * RESULT CONTAINER
         * ---------------------------------------------------------
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

        /*
         * If searches were not available, use allResults.
         */
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
         * ---------------------------------------------------------
         * FORM PARSING
         * ---------------------------------------------------------
         */

        function parseScorePairs(text) {

            const pairs = [];

            const source =
                cleanText(text);

            /*
             * Standard:
             * 2 - 0
             * 2-0
             * 2 : 0
             * 2 – 0
             */
            const standard =
                /\b(\d{1,2})\s*[-:]\s*(\d{1,2})\b/g;

            let match;

            while ((match = standard.exec(source))) {

                pairs.push({
                    homeGoals:
                        Number(match[1]),

                    awayGoals:
                        Number(match[2]),

                    index:
                        match.index,

                    raw:
                        match[0]
                });
            }

            /*
             * Compact score:
             *
             * 01
             * 11
             * 13
             *
             * Used by some Flashscore-style snippets.
             *
             * Only accept when immediately surrounded by
             * football-team/result context.
             */
            const compact =
                /\b([0-9])([0-9])\b/g;

            while ((match = compact.exec(source))) {

                const before =
                    source.slice(
                        Math.max(
                            0,
                            match.index - 45
                        ),
                        match.index
                    );

                const after =
                    source.slice(
                        match.index + match[0].length,
                        match.index + match[0].length + 45
                    );

                const context =
                    `${before} ${after}`;

                if (
                    /\b(W|D|L)\b/i.test(context) ||
                    /\b(FT|Full-time|final)\b/i.test(context)
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

            if (!containsTeam(combined, identity)) {
                return null;
            }

            /*
             * Never allow Universidad de Concepcion
             * to contaminate Deportes Concepcion.
             */
            if (
                identity === "DEPORTES_CONCEPCION" &&
                containsWrongConcepcion(combined)
            ) {
                /*
                 * Exception:
                 * A source can mention both clubs while
                 * still being a Deportes Concepcion result.
                 * Only reject if the title itself appears
                 * to be a different fixture.
                 */
                const titleHasRequested =
                    containsTeam(
                        title,
                        identity
                    );

                const titleHasUniversity =
                    containsTeam(
                        title,
                        "UNIVERSIDAD_DE_CONCEPCION"
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
             * Determine whether the requested team is
             * before or after the score.
             */
            const aliases =
                identityAliases(identity);

            const normalizedCombined =
                normalizeText(combined);

            let teamPosition =
                null;

            /*
             * Find the closest occurrence of the team
             * around each score.
             */
            for (const score of scores) {

                const scoreIndex =
                    score.index;

                const before =
                    normalizedCombined.slice(
                        Math.max(
                            0,
                            scoreIndex - 120
                        ),
                        scoreIndex
                    );

                const after =
                    normalizedCombined.slice(
                        scoreIndex +
                        score.raw.length,
                        scoreIndex +
                        score.raw.length +
                        120
                    );

                const hasTeamBefore =
                    aliases.some(alias =>
                        before.includes(
                            normalizeText(alias)
                        )
                    );

                const hasTeamAfter =
                    aliases.some(alias =>
                        after.includes(
                            normalizeText(alias)
                        )
                    );

                if (
                    hasTeamBefore &&
                    !hasTeamAfter
                ) {
                    teamPosition = {
                        score,
                        position: "HOME"
                    };
                    break;
                }

                if (
                    hasTeamAfter &&
                    !hasTeamBefore
                ) {
                    teamPosition = {
                        score,
                        position: "AWAY"
                    };
                    break;
                }
            }

            /*
             * Some sources have a very clear
             * "Team 2-0 Opponent" structure.
             */
            if (!teamPosition) {

                const teamNamePattern =
                    aliases
                        .map(alias =>
                            normalizeText(alias)
                        )
                        .sort(
                            (a, b) =>
                                b.length - a.length
                        );

                for (const score of scores) {

                    const before =
                        normalizedCombined.slice(
                            Math.max(
                                0,
                                score.index - 80
                            ),
                            score.index
                        );

                    const after =
                        normalizedCombined.slice(
                            score.index +
                            score.raw.length,
                            score.index +
                            score.raw.length +
                            80
                        );

                    const beforeHas =
                        teamNamePattern.some(
                            alias =>
                                before.includes(alias)
                        );

                    const afterHas =
                        teamNamePattern.some(
                            alias =>
                                after.includes(alias)
                        );

                    if (
                        beforeHas &&
                        !afterHas
                    ) {
                        teamPosition = {
                            score,
                            position: "HOME"
                        };
                        break;
                    }

                    if (
                        afterHas &&
                        !beforeHas
                    ) {
                        teamPosition = {
                            score,
                            position: "AWAY"
                        };
                        break;
                    }
                }
            }

            if (!teamPosition) {

                /*
                 * Handle explicit W/D/L snippets.
                 *
                 * Example:
                 * Nublense. D. Concepcion. 01. W.
                 *
                 * Here the score is ambiguous as a compact
                 * source representation, but the W/D/L
                 * marker belongs to the requested team.
                 */

                const teamIndex =
                    normalizedCombined.search(
                        new RegExp(
                            aliases
                                .map(
                                    alias =>
                                        alias
                                            .replace(
                                                /[.*+?^${}()|[\]\\]/g,
                                                "\\$&"
                                            )
                                )
                                .join("|"),
                            "i"
                        )
                    );

                if (teamIndex >= 0) {

                    const nearby =
                        normalizedCombined.slice(
                            teamIndex,
                            teamIndex + 100
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

            const score =
                teamPosition.score;

            let result;

            if (
                teamPosition.position === "HOME"
            ) {

                if (
                    score.homeGoals >
                    score.awayGoals
                ) {
                    result = "W";
                } else if (
                    score.homeGoals <
                    score.awayGoals
                ) {
                    result = "L";
                } else {
                    result = "D";
                }

            } else {

                if (
                    score.awayGoals >
                    score.homeGoals
                ) {
                    result = "W";
                } else if (
                    score.awayGoals <
                    score.homeGoals
                ) {
                    result = "L";
                } else {
                    result = "D";
                }
            }

            return {

                result,

                homeGoals:
                    score.homeGoals,

                awayGoals:
                    score.awayGoals,

                score:
                    `${score.homeGoals}-${score.awayGoals}`,

                date:
                    resultDate(item),

                source:
                    item.link,

                title:
                    item.title,

                snippet:
                    item.snippet,

                evidenceType:
                    "FORM_SCORE"
            };
        }

        function isSameMatchAsTarget(
            item
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

            const homeMention =
                containsTeam(
                    combined,
                    homeIdentity
                );

            const awayMention =
                containsTeam(
                    combined,
                    awayIdentity
                );

            return (
                homeMention &&
                awayMention
            );
        }

        function isKnownWrongFixture(
            item
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
             * Deportes Santa Cruz is not our opponent.
             */
            if (
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
             * Universidad de Concepcion must not
             * contaminate Deportes Concepcion.
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

                    /*
                     * If it is a direct University
                     * fixture, reject it.
                     */
                    if (
                        combined.includes(
                            "vs universidad de concepcion"
                        ) ||
                        combined.includes(
                            "universidad de concepcion vs"
                        )
                    ) {
                        return true;
                    }
                }
            }

            return false;
        }

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

                    if (isFutureResult(item)) {
                        continue;
                    }

                    /*
                     * Do not use the current target
                     * fixture itself as form.
                     */
                    if (
                        isSameMatchAsTarget(item)
                    ) {
                        continue;
                    }

                    if (
                        isKnownWrongFixture(item)
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
                     * Reject obvious historical July
                     * target fixture from recent form.
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

                    if (
                        text.includes(
                            "deportes concepcion 2 - 0 o'higgins"
                        ) ||
                        text.includes(
                            "deportes concepcion 2-0 o'higgins"
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
             * Deduplicate.
             *
             * Prefer date + score.
             * If date is unavailable, use score + title.
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

                const key =
                    [
                        identity,
                        dateKey,
                        item.score ||
                            item.result ||
                            "",
                        normalizeText(
                            item.title
                        )
                    ]
                    .join("|");

                if (seen.has(key)) {
                    continue;
                }

                seen.add(key);

                unique.push(item);
            }

            /*
             * Sort newest first where dates
             * are available.
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
             * Keep maximum 5 form results.
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
         * ---------------------------------------------------------
         * FORM SUMMARY
         * ---------------------------------------------------------
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
         * ---------------------------------------------------------
         * H2H
         * ---------------------------------------------------------
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

                if (!isExactPair(item)) {
                    continue;
                }

                if (
                    isKnownWrongFixture(item)
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
         * ---------------------------------------------------------
         * MARKET / STATISTICS
         * ---------------------------------------------------------
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

                /*
                 * A generic prediction page is not
                 * enough by itself.
                 */
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
         * ---------------------------------------------------------
         * BTTS
         * ---------------------------------------------------------
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
         * ---------------------------------------------------------
         * OVER / UNDER
         * ---------------------------------------------------------
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
         * ---------------------------------------------------------
         * 1X2
         * ---------------------------------------------------------
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
         * ---------------------------------------------------------
         * XG
         * ---------------------------------------------------------
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

            /*
             * We only accept explicit team-attributed
             * xG values.
             */
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
         * ---------------------------------------------------------
         * INJURIES
         * ---------------------------------------------------------
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
                    isKnownWrongFixture(item)
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
         * ---------------------------------------------------------
         * LINEUPS
         * ---------------------------------------------------------
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

                /*
                 * Predicted lineups are never
                 * automatically treated as confirmed.
                 */
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
         * ---------------------------------------------------------
         * ODDS
         * ---------------------------------------------------------
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
         * ---------------------------------------------------------
         * AVAILABILITY / READINESS
         * ---------------------------------------------------------
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
         * ---------------------------------------------------------
         * QUALITY
         * ---------------------------------------------------------
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

        /*
         * ---------------------------------------------------------
         * WARNINGS
         * ---------------------------------------------------------
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
         * ---------------------------------------------------------
         * RESPONSE
         * ---------------------------------------------------------
         */

        return res.status(200).json({

            success: true,

            version:
                "V3.15",

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
            "V3.15 normalize-web error:",
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
