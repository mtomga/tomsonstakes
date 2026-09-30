export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed. Use POST."
            });
        }

        const body = req.body || {};

        /*
         * ------------------------------------------------------------
         * INPUT COMPATIBILITY
         * ------------------------------------------------------------
         *
         * Expected:
         * {
         *   match: {...},
         *   searches: [...],
         *   allResults: [...]
         * }
         *
         * We also retain the compatibility fallbacks used by V3.1.
         */

        const inputMatch =
            body.match ||
            (body.data && body.data.match) ||
            (body.normalized && body.normalized.match);

        if (
            !inputMatch ||
            !inputMatch.home ||
            !inputMatch.away ||
            !inputMatch.date
        ) {
            return res.status(400).json({
                error:
                    "match.home, match.away and match.date are required."
            });
        }

        const match = {
            home: String(inputMatch.home).trim(),
            away: String(inputMatch.away).trim(),
            date: normalizeISODate(inputMatch.date),
            year:
                inputMatch.year ||
                getYearFromDate(inputMatch.date)
        };

        if (!match.date) {
            return res.status(400).json({
                error: "Invalid match.date."
            });
        }

        /*
         * ------------------------------------------------------------
         * COLLECT RAW SEARCH RESULTS
         * ------------------------------------------------------------
         */

        const searches = Array.isArray(body.searches)
            ? body.searches
            : [];

        const allResults = Array.isArray(body.allResults)
            ? body.allResults
            : flattenSearches(searches);

        const rawSources = [];

        for (const search of searches) {
            const type = search && search.type
                ? String(search.type).toLowerCase()
                : "unknown";

            const results =
                Array.isArray(search.results)
                    ? search.results
                    : [];

            for (const item of results) {
                rawSources.push({
                    type,
                    source: item.title || "",
                    url: item.link || "",
                    snippet: item.snippet || "",
                    date: item.date || null
                });
            }
        }

        /*
         * If searches[] was unavailable, use allResults[].
         */

        if (rawSources.length === 0) {
            for (const item of allResults) {
                rawSources.push({
                    type: item.type || "unknown",
                    source: item.title || item.source || "",
                    url: item.link || item.url || "",
                    snippet: item.snippet || "",
                    date: item.date || null
                });
            }
        }

        /*
         * ------------------------------------------------------------
         * NORMALIZED CONTAINERS
         * ------------------------------------------------------------
         */

        const normalized = {
            match,

            form: {
                home: [],
                away: []
            },

            formEvidence: {
                home: [],
                away: []
            },

            h2h: [],

            goals: {
                home: null,
                away: null
            },

            xg: {
                home: null,
                away: null,
                total: null
            },

            btts: {
                home: null,
                away: null,
                h2h: null
            },

            overUnder: {
                over15: null,
                over25: null,
                over35: null,
                under25: null,
                under35: null
            },

            statsEvidence: [],
            undatedStatsEvidence: [],

            injuries: {
                home: [],
                away: [],
                unknown: []
            },

            lineups: {
                home: null,
                away: null,
                matchEvidence: [],
                unknown: []
            },

            odds: {
                home: null,
                draw: null,
                away: null,
                over25: null,
                under25: null,
                bttsYes: null,
                bttsNo: null
            },

            oddsEvidence: [],
            undatedOddsEvidence: [],

            sources: [],

            warnings: []
        };

        /*
         * ------------------------------------------------------------
         * SOURCE CLASSIFICATION
         * ------------------------------------------------------------
         */

        for (const raw of rawSources) {
            const classified = classifySource(
                raw,
                match
            );

            normalized.sources.push(classified);

            /*
             * --------------------------------------------------------
             * H2H
             * --------------------------------------------------------
             */

            if (
                raw.type === "h2h" ||
                isH2HSource(raw)
            ) {
                if (isActualH2HSource(raw)) {
                    normalized.h2h.push({
                        source: raw.source,
                        url: raw.url,
                        snippet: raw.snippet,
                        relevance:
                            classified.eventDate === match.date
                                ? "CURRENT_MATCH"
                                : "HISTORICAL",
                        dataRelevance: "HISTORICAL_H2H",
                        eventDate:
                            classified.eventDate || null,
                        publishedDate:
                            classified.publishedDate || null
                    });
                }

                continue;
            }

            /*
             * --------------------------------------------------------
             * FORM
             * --------------------------------------------------------
             */

            if (raw.type === "form") {
                processFormSource(
                    raw,
                    classified,
                    match,
                    normalized
                );

                continue;
            }

            /*
             * --------------------------------------------------------
             * STATS
             * --------------------------------------------------------
             */

            if (raw.type === "stats") {
                processStatsSource(
                    raw,
                    classified,
                    match,
                    normalized
                );

                continue;
            }

            /*
             * --------------------------------------------------------
             * INJURIES
             * --------------------------------------------------------
             */

            if (raw.type === "injuries") {
                processInjurySource(
                    raw,
                    classified,
                    match,
                    normalized
                );

                continue;
            }

            /*
             * --------------------------------------------------------
             * LINEUPS
             * --------------------------------------------------------
             */

            if (raw.type === "lineups") {
                processLineupSource(
                    raw,
                    classified,
                    match,
                    normalized
                );

                continue;
            }

            /*
             * --------------------------------------------------------
             * ODDS
             * --------------------------------------------------------
             */

            if (raw.type === "odds") {
                processOddsSource(
                    raw,
                    classified,
                    match,
                    normalized
                );

                continue;
            }
        }

        /*
         * ------------------------------------------------------------
         * NUMERICAL DEDUPLICATION
         * ------------------------------------------------------------
         */

        normalized.h2h =
            removeDuplicateEvidence(
                normalized.h2h
            );

        normalized.statsEvidence =
            removeDuplicateEvidence(
                normalized.statsEvidence
            );

        normalized.undatedStatsEvidence =
            removeDuplicateEvidence(
                normalized.undatedStatsEvidence
            );

        normalized.oddsEvidence =
            removeDuplicateEvidence(
                normalized.oddsEvidence
            );

        normalized.undatedOddsEvidence =
            removeDuplicateEvidence(
                normalized.undatedOddsEvidence
            );

        normalized.formEvidence.home =
            removeDuplicateEvidence(
                normalized.formEvidence.home
            );

        normalized.formEvidence.away =
            removeDuplicateEvidence(
                normalized.formEvidence.away
            );

        normalized.injuries.home =
            removeDuplicateEvidence(
                normalized.injuries.home
            );

        normalized.injuries.away =
            removeDuplicateEvidence(
                normalized.injuries.away
            );

        normalized.injuries.unknown =
            removeDuplicateEvidence(
                normalized.injuries.unknown
            );

        normalized.lineups.matchEvidence =
            removeDuplicateEvidence(
                normalized.lineups.matchEvidence
            );

        /*
         * ------------------------------------------------------------
         * SAFETY CLEANUP
         * ------------------------------------------------------------
         *
         * Remove obviously unsafe odds values.
         */

        validateOdds(normalized);

        /*
         * ------------------------------------------------------------
         * WARNINGS
         * ------------------------------------------------------------
         */

        addWarnings(
            normalized,
            match
        );

        /*
         * ------------------------------------------------------------
         * QUALITY
         * ------------------------------------------------------------
         */

        const quality = buildQuality(
            normalized
        );

        /*
         * ------------------------------------------------------------
         * DATA AVAILABILITY
         * ------------------------------------------------------------
         */

        const dataAvailability =
            buildDataAvailability(
                normalized,
                quality
            );

        /*
         * ------------------------------------------------------------
         * ANALYSIS READY
         * ------------------------------------------------------------
         */

        const analysisReady = {
            exactMatchEvidence:
                quality.currentMatchSources > 0,

            recentEvidence:
                quality.formEvidence > 0,

            h2hEvidence:
                quality.h2hSources > 0,

            formEvidence:
                quality.formEvidence > 0,

            injuryEvidence:
                quality.injuryEvidence > 0,

            lineupEvidence:
                quality.lineupEvidence > 0,

            statsEvidence:
                quality.statsEvidence > 0,

            oddsEvidence:
                quality.oddsEvidence > 0,

            structuredOdds:
                dataAvailability.odds.structured1X2,

            actualLineups:
                dataAvailability.lineups.playersAvailable
        };

        /*
         * ------------------------------------------------------------
         * RESPONSE
         * ------------------------------------------------------------
         */

        return res.status(200).json({
            success: true,

            normalized,

            quality,

            dataAvailability,

            analysisReady
        });

    } catch (error) {
        console.error(
            "normalize-web error:",
            error
        );

        return res.status(500).json({
            error:
                "Web data normalization failed.",

            details:
                error.message
        });
    }
}


/* ================================================================
   BASIC HELPERS
   ================================================================ */

function flattenSearches(searches) {
    const output = [];

    for (const search of searches || []) {
        const type =
            search && search.type
                ? search.type
                : "unknown";

        for (const item of search.results || []) {
            output.push({
                type,
                title:
                    item.title || "",
                link:
                    item.link || "",
                snippet:
                    item.snippet || "",
                date:
                    item.date || null
            });
        }
    }

    return output;
}


function getYearFromDate(value) {
    const date = parseDateValue(value);

    if (!date) {
        return null;
    }

    return date.getUTCFullYear();
}


function normalizeISODate(value) {
    const date = parseDateValue(value);

    if (!date) {
        return null;
    }

    return formatDateUTC(date);
}


function formatDateUTC(date) {
    const y =
        date.getUTCFullYear();

    const m =
        String(
            date.getUTCMonth() + 1
        ).padStart(2, "0");

    const d =
        String(
            date.getUTCDate()
        ).padStart(2, "0");

    return `${y}-${m}-${d}`;
}


/* ================================================================
   DATE PARSER
   ================================================================ */

function parseDateValue(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return isNaN(value.getTime())
            ? null
            : value;
    }

    const text =
        String(value)
            .replace(/\u00a0/g, " ")
            .trim();

    if (!text) {
        return null;
    }

    /*
     * ISO:
     * 2026-09-30
     * 2026-09-30T23:00:00Z
     */

    let match =
        text.match(
            /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/
        );

    if (match) {
        return makeUTCDate(
            Number(match[1]),
            Number(match[2]),
            Number(match[3])
        );
    }

    /*
     * Month-name formats:
     *
     * Sep 30, 2026
     * September 30, 2026
     * 30 Sep 2026
     * 30 September 2026
     * Wed, Sep 30, 2026
     */

    const months = {
        jan: 1,
        january: 1,
        feb: 2,
        february: 2,
        mar: 3,
        march: 3,
        apr: 4,
        april: 4,
        may: 5,
        jun: 6,
        june: 6,
        jul: 7,
        july: 7,
        aug: 8,
        august: 8,
        sep: 9,
        sept: 9,
        september: 9,
        oct: 10,
        october: 10,
        nov: 11,
        november: 11,
        dec: 12,
        december: 12
    };

    match =
        text.match(
            /\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?[,]?\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i
        );

    if (match) {
        const month =
            months[
                match[1].toLowerCase()
            ];

        if (month) {
            return makeUTCDate(
                Number(match[3]),
                month,
                Number(match[2])
            );
        }
    }

    match =
        text.match(
            /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i
        );

    if (match) {
        const month =
            months[
                match[1].toLowerCase()
            ];

        if (month) {
            return makeUTCDate(
                Number(match[3]),
                month,
                Number(match[2])
            );
        }
    }

    match =
        text.match(
            /\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b/i
        );

    if (match) {
        const month =
            months[
                match[2].toLowerCase()
            ];

        if (month) {
            return makeUTCDate(
                Number(match[3]),
                month,
                Number(match[1])
            );
        }
    }

    /*
     * Numeric dates.
     *
     * When the year is 2026 and the first number > 12,
     * it is safely DD/MM/YYYY.
     *
     * When both are <= 12, preserve both possibilities
     * internally and choose the one supported by context
     * elsewhere. Here we default to DD/MM/YYYY because
     * football sources commonly use that format.
     */

    match =
        text.match(
            /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/
        );

    if (match) {
        const first =
            Number(match[1]);

        const second =
            Number(match[2]);

        const year =
            Number(match[3]);

        let day;
        let month;

        if (first > 12) {
            day = first;
            month = second;
        } else if (second > 12) {
            month = first;
            day = second;
        } else {
            /*
             * Football/web-data default:
             * DD/MM/YYYY
             */
            day = first;
            month = second;
        }

        return makeUTCDate(
            year,
            month,
            day
        );
    }

    /*
     * Native parser fallback.
     */

    const parsed =
        new Date(text);

    if (
        !isNaN(
            parsed.getTime()
        )
    ) {
        return parsed;
    }

    return null;
}


function makeUTCDate(
    year,
    month,
    day
) {
    const date =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
}


/* ================================================================
   DATE EXTRACTION
   ================================================================ */

function extractDatesFromText(text) {
    if (!text) {
        return [];
    }

    const dates = [];

    const patterns = [
        /\b20\d{2}-\d{1,2}-\d{1,2}\b/g,

        /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?[,]?\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2}\b/gi,

        /\b[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2}\b/gi,

        /\b\d{1,2}\s+[A-Za-z]+\s+20\d{2}\b/gi,

        /\b\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2}\b/g
    ];

    for (const pattern of patterns) {
        const matches =
            text.match(pattern) || [];

        for (const item of matches) {
            const parsed =
                parseDateValue(item);

            if (parsed) {
                dates.push(parsed);
            }
        }
    }

    return uniqueDates(dates);
}


function uniqueDates(dates) {
    const seen =
        new Set();

    const output = [];

    for (const date of dates || []) {
        if (!(date instanceof Date)) {
            continue;
        }

        if (isNaN(date.getTime())) {
            continue;
        }

        const key =
            date.getTime();

        if (!seen.has(key)) {
            seen.add(key);
            output.push(date);
        }
    }

    return output;
}


/* ================================================================
   TEAM MATCHING
   ================================================================ */

function normalizeTeamName(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[.'’`]/g, "")
        .replace(/[-_/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function teamAliases(team) {
    const normalized =
        normalizeTeamName(team);

    const aliases =
        new Set([
            normalized
        ]);

    if (
        normalized.includes(
            "concepcion"
        )
    ) {
        aliases.add(
            "deportes concepcion"
        );

        aliases.add(
            "universidad de concepcion"
        );

        aliases.add(
            "univ de concepcion"
        );

        aliases.add(
            "u de concepcion"
        );

        aliases.add(
            "d concepcion"
        );
    }

    if (
        normalized.includes(
            "ohiggins"
        )
    ) {
        aliases.add(
            "o higgins"
        );

        aliases.add(
            "o'higgins"
        );

        aliases.add(
            "ohiggins"
        );
    }

    return Array.from(
        aliases
    );
}


function containsTeam(
    text,
    team
) {
    const normalized =
        normalizeTeamName(text);

    const aliases =
        teamAliases(team);

    return aliases.some(
        alias =>
            alias &&
            normalized.includes(alias)
    );
}


function containsBothTeams(
    text,
    match
) {
    return (
        containsTeam(
            text,
            match.home
        ) &&
        containsTeam(
            text,
            match.away
        )
    );
}


/* ================================================================
   SOURCE CLASSIFICATION
   ================================================================ */

function classifySource(
    raw,
    match
) {
    const text =
        `${raw.source || ""} ${raw.snippet || ""}`;

    const dates =
        extractDatesFromText(text);

    const publishedDate =
        parseDateValue(
            raw.date
        );

    let eventDate = null;

    /*
     * Prefer an exact target-date match.
     */

    const targetDate =
        parseDateValue(
            match.date
        );

    const targetTime =
        targetDate
            ? targetDate.getTime()
            : null;

    const exactTargetDate =
        dates.find(
            date =>
                date.getTime() ===
                targetTime
        );

    if (exactTargetDate) {
        eventDate =
            exactTargetDate;
    } else if (dates.length > 0) {
        /*
         * If this looks like a match-specific source,
         * use the first relevant date.
         */

        eventDate =
            chooseLikelyEventDate(
                dates,
                text,
                targetDate
            );
    }

    /*
     * A search-result publication date is kept separately.
     */

    let relevance =
        "UNDATED_TEAM_SOURCE";

    if (
        eventDate &&
        eventDate.getTime() === targetTime
    ) {
        relevance =
            "CURRENT_MATCH";
    } else if (
        eventDate &&
        eventDate.getTime() > targetTime
    ) {
        relevance =
            "FUTURE";
    } else if (
        eventDate &&
        eventDate.getTime() < targetTime
    ) {
        relevance =
            "HISTORICAL";
    } else if (
        publishedDate &&
        daysBetween(
            publishedDate,
            targetDate
        ) <= 30 &&
        daysBetween(
            publishedDate,
            targetDate
        ) >= 0
    ) {
        relevance =
            "RECENT";
    }

    /*
     * Determine date basis.
     */

    let dateBasis = null;

    if (eventDate) {
        dateBasis =
            "TEXT_DATE";
    } else if (publishedDate) {
        dateBasis =
            "PUBLICATION_DATE";
    }

    /*
     * Stronger irrelevant detection.
     */

    if (
        !containsBothTeams(
            text,
            match
        )
    ) {
        relevance =
            "IRRELEVANT";
    }

    return {
        type:
            raw.type || "unknown",

        source:
            raw.source || "",

        url:
            raw.url || "",

        snippet:
            raw.snippet || "",

        relevance,

        eventDate:
            eventDate
                ? formatDateUTC(eventDate)
                : null,

        publishedDate:
            publishedDate
                ? formatDateUTC(
                    publishedDate
                )
                : null,

        dateBasis
    };
}


function chooseLikelyEventDate(
    dates,
    text,
    targetDate
) {
    if (!dates.length) {
        return null;
    }

    /*
     * Prefer dates near the target date.
     */

    const sorted =
        dates
            .slice()
            .sort(
                (a, b) =>
                    Math.abs(
                        a.getTime() -
                        targetDate.getTime()
                    ) -
                    Math.abs(
                        b.getTime() -
                        targetDate.getTime()
                    )
            );

    /*
     * Match-related sources should generally use
     * their nearest explicit date.
     */

    return sorted[0];
}


/* ================================================================
   H2H
   ================================================================ */

function isH2HSource(raw) {
    const text =
        `${raw.source || ""} ${raw.snippet || ""}`
            .toLowerCase();

    return (
        /\bh2h\b/.test(text) ||
        /head[- ]to[- ]head/.test(text) ||
        /head to head/.test(text) ||
        /past h2h/.test(text) ||
        /previous meetings/.test(text) ||
        /past meetings/.test(text)
    );
}


function isActualH2HSource(raw) {
    const text =
        `${raw.source || ""} ${raw.snippet || ""}`
            .toLowerCase();

    if (
        !isH2HSource(raw)
    ) {
        return false;
    }

    return (
        /past/.test(text) ||
        /previous/.test(text) ||
        /meetings/.test(text) ||
        /h2h/.test(text) ||
        /head[- ]to[- ]head/.test(text) ||
        /history/.test(text) ||
        /results/.test(text)
    );
}


/* ================================================================
   FORM
   ================================================================ */

function processFormSource(
    raw,
    classified,
    match,
    normalized
) {
    /*
     * Do not accept undated team pages as actual form.
     */

    if (
        classified.relevance ===
            "IRRELEVANT" ||
        classified.relevance ===
            "FUTURE" ||
        classified.relevance ===
            "UNDATED_TEAM_SOURCE"
    ) {
        return;
    }

    /*
     * A historical match page can be form evidence
     * if it contains an actual result.
     */

    if (
        classified.relevance !==
        "HISTORICAL"
    ) {
        return;
    }

    const text =
        raw.snippet || "";

    const result =
        extractResult(
            text,
            match
        );

    if (!result) {
        return;
    }

    const evidence = {
        source:
            raw.source,

        url:
            raw.url,

        snippet:
            raw.snippet,

        relevance:
            classified.relevance,

        eventDate:
            classified.eventDate,

        result
    };

    const homeMention =
        containsTeam(
            text,
            match.home
        );

    const awayMention =
        containsTeam(
            text,
            match.away
        );

    if (
        homeMention &&
        !awayMention
    ) {
        normalized.formEvidence.home.push(
            evidence
        );

        normalized.form.home.push(
            result
        );
    } else if (
        awayMention &&
        !homeMention
    ) {
        normalized.formEvidence.away.push(
            evidence
        );

        normalized.form.away.push(
            result
        );
    }
}


/* ================================================================
   RESULT EXTRACTION
   ================================================================ */

function extractResult(
    text,
    match
) {
    if (!text) {
        return null;
    }

    const scoreMatch =
        text.match(
            /\b(\d+)\s*[-:]\s*(\d+)\b/
        );

    if (!scoreMatch) {
        return null;
    }

    const first =
        Number(scoreMatch[1]);

    const second =
        Number(scoreMatch[2]);

    if (
        !Number.isFinite(first) ||
        !Number.isFinite(second)
    ) {
        return null;
    }

    const home =
        containsTeam(
            text,
            match.home
        );

    const away =
        containsTeam(
            text,
            match.away
        );

    if (!home && !away) {
        return null;
    }

    return {
        homeGoals:
            first,

        awayGoals:
            second
    };
}


/* ================================================================
   STATS
   ================================================================ */

function processStatsSource(
    raw,
    classified,
    match,
    normalized
) {
    if (
        classified.relevance ===
        "IRRELEVANT"
    ) {
        return;
    }

    const evidence = {
        source:
            raw.source,

        url:
            raw.url,

        snippet:
            raw.snippet,

        relevance:
            classified.relevance,

        eventDate:
            classified.eventDate,

        publishedDate:
            classified.publishedDate,

        dateBasis:
            classified.dateBasis
    };

    /*
     * Only date-qualified current-match stats
     * enter statsEvidence.
     */

    if (
        classified.relevance ===
        "CURRENT_MATCH"
    ) {
        normalized.statsEvidence.push(
            evidence
        );

        extractCurrentStats(
            raw.snippet,
            normalized
        );

        return;
    }

    /*
     * Historical stats remain historical.
     */

    if (
        classified.relevance ===
        "HISTORICAL"
    ) {
        return;
    }

    /*
     * Undated team statistics are preserved
     * separately.
     */

    if (
        classified.relevance ===
        "UNDATED_TEAM_SOURCE"
    ) {
        normalized.undatedStatsEvidence.push(
            evidence
        );
    }
}


function extractCurrentStats(
    text,
    normalized
) {
    if (!text) {
        return;
    }

    /*
     * xG extraction is intentionally strict.
     *
     * Examples accepted:
     * "Concepcion xG 1.24"
     * "O'Higgins xG 0.91"
     */

    const homeXG =
        extractLabeledNumber(
            text,
            /(?:concepcion|deportes concepcion|universidad de concepcion)[^.\n]{0,50}?\bxg\b\s*[:=]?\s*(\d+(?:\.\d+)?)/i
        );

    const awayXG =
        extractLabeledNumber(
            text,
            /(?:o['’]?higgins|ohiggins)[^.\n]{0,50}?\bxg\b\s*[:=]?\s*(\d+(?:\.\d+)?)/i
        );

    if (
        homeXG !== null
    ) {
        normalized.xg.home =
            homeXG;
    }

    if (
        awayXG !== null
    ) {
        normalized.xg.away =
            awayXG;
    }

    if (
        normalized.xg.home !== null &&
        normalized.xg.away !== null
    ) {
        normalized.xg.total =
            Number(
                (
                    normalized.xg.home +
                    normalized.xg.away
                ).toFixed(2)
            );
    }
}


function extractLabeledNumber(
    text,
    pattern
) {
    const match =
        text.match(pattern);

    if (!match) {
        return null;
    }

    const value =
        Number(
            match[1]
        );

    return Number.isFinite(value)
        ? value
        : null;
}


/* ================================================================
   INJURIES
   ================================================================ */

function processInjurySource(
    raw,
    classified,
    match,
    normalized
) {
    if (
        classified.relevance ===
        "IRRELEVANT" ||
        classified.relevance ===
        "HISTORICAL" ||
        classified.relevance ===
        "FUTURE"
    ) {
        return;
    }

    /*
     * Only current-match or explicitly recent
     * injury information can enter the injury
     * evidence layer.
     */

    const text =
        raw.snippet || "";

    const sentences =
        splitSentences(
            text
        );

    let found =
        false;

    for (const sentence of sentences) {
        const home =
            containsTeam(
                sentence,
                match.home
            );

        const away =
            containsTeam(
                sentence,
                match.away
            );

        if (
            !home &&
            !away
        ) {
            continue;
        }

        const injuryTerms =
            /\binjur(?:y|ed|ies)\b|\bsuspend(?:ed|sion)\b|\bdoubtful\b|\bunavailable\b|\bmissing\b|\bsidelined\b/i;

        if (
            !injuryTerms.test(
                sentence
            )
        ) {
            continue;
        }

        const evidence = {
            source:
                raw.source,

            url:
                raw.url,

            snippet:
                sentence,

            relevance:
                classified.relevance,

            eventDate:
                classified.eventDate,

            publishedDate:
                classified.publishedDate
        };

        if (
            classified.relevance ===
            "CURRENT_MATCH"
        ) {
            if (
                home &&
                !away
            ) {
                normalized.injuries.home.push(
                    evidence
                );

                found = true;
            } else if (
                away &&
                !home
            ) {
                normalized.injuries.away.push(
                    evidence
                );

                found = true;
            } else {
                normalized.injuries.unknown.push(
                    evidence
                );

                found = true;
            }
        } else if (
            classified.relevance ===
            "UNDATED_TEAM_SOURCE"
        ) {
            /*
             * Keep ambiguous recent injury information
             * out of the current injury arrays.
             *
             * It is intentionally not promoted.
             */
        }
    }

    /*
     * A source can sometimes say:
     *
     * "Universidad de Concepción has no unavailable
     * players. O'Higgins: Player X injured..."
     *
     * The sentence-level extraction above prevents
     * the O'Higgins injury from being copied to
     * Concepcion.
     */

    return found;
}


function splitSentences(text) {
    return String(text || "")
        .split(
            /(?<=[.!?])\s+/
        )
        .map(
            value =>
                value.trim()
        )
        .filter(Boolean);
}


/* ================================================================
   LINEUPS
   ================================================================ */

function processLineupSource(
    raw,
    classified,
    match,
    normalized
) {
    if (
        classified.relevance ===
        "IRRELEVANT" ||
        classified.relevance ===
        "HISTORICAL" ||
        classified.relevance ===
        "FUTURE"
    ) {
        return;
    }

    /*
     * A current-match lineup source is evidence that
     * a lineup page exists.
     *
     * It does NOT mean actual player names were extracted.
     */

    if (
        classified.relevance ===
        "CURRENT_MATCH"
    ) {
        const evidence = {
            source:
                raw.source,

            url:
                raw.url,

            snippet:
                raw.snippet,

            relevance:
                "CURRENT_MATCH",

            eventDate:
                classified.eventDate,

            publishedDate:
                classified.publishedDate,

            playersAvailable:
                extractPlayerNames(
                    raw.snippet
                ).length > 0,

            confirmed:
                containsConfirmedLineup(
                    raw.snippet
                )
        };

        normalized.lineups.matchEvidence.push(
            evidence
        );

        const players =
            extractPlayerNames(
                raw.snippet
            );

        /*
         * Only assign players when the source
         * clearly identifies them.
         *
         * We do not infer an entire XI from
         * a generic lineup page.
         */

        if (
            players.length > 0
        ) {
            const homeMention =
                containsTeam(
                    raw.snippet,
                    match.home
                );

            const awayMention =
                containsTeam(
                    raw.snippet,
                    match.away
                );

            if (
                homeMention &&
                !awayMention
            ) {
                normalized.lineups.home =
                    players;
            } else if (
                awayMention &&
                !homeMention
            ) {
                normalized.lineups.away =
                    players;
            }
        }
    }
}


function extractPlayerNames(text) {
    /*
     * Deliberately conservative.
     *
     * A search snippet rarely gives enough structure
     * to safely reconstruct an XI.
     */

    if (!text) {
        return [];
    }

    return [];
}


function containsConfirmedLineup(
    text
) {
    return /\bconfirmed lineups?\b|\bconfirmed starting xi\b|\bstarting xi confirmed\b|\blineups confirmed\b/i
        .test(
            String(text || "")
        );
}


/* ================================================================
   ODDS
   ================================================================ */

function processOddsSource(
    raw,
    classified,
    match,
    normalized
) {
    if (
        classified.relevance ===
        "IRRELEVANT" ||
        classified.relevance ===
        "HISTORICAL" ||
        classified.relevance ===
        "FUTURE"
    ) {
        return;
    }

    const evidence = {
        source:
            raw.source,

        url:
            raw.url,

        snippet:
            raw.snippet,

        relevance:
            classified.relevance,

        eventDate:
            classified.eventDate,

        publishedDate:
            classified.publishedDate,

        dateBasis:
            classified.dateBasis,

        structured1X2:
            false,

        structuredTotals:
            false,

        structuredBTTS:
            false
    };

    /*
     * Strictly extract labelled odds.
     */

    const extracted =
        extractOdds(
            raw.snippet,
            match
        );

    if (
        classified.relevance ===
        "CURRENT_MATCH"
    ) {
        if (
            extracted.home !== null ||
            extracted.draw !== null ||
            extracted.away !== null
        ) {
            normalized.oddsEvidence.push(
                {
                    ...evidence,
                    structured1X2:
                        extracted.home !== null &&
                        extracted.draw !== null &&
                        extracted.away !== null
                }
            );

            if (
                extracted.home !== null
            ) {
                normalized.odds.home =
                    extracted.home;
            }

            if (
                extracted.draw !== null
            ) {
                normalized.odds.draw =
                    extracted.draw;
            }

            if (
                extracted.away !== null
            ) {
                normalized.odds.away =
                    extracted.away;
            }
        } else {
            /*
             * Current odds page exists, but its snippet
             * does not contain safely structured odds.
             *
             * Preserve the source without inventing
             * numerical odds.
             */

            normalized.oddsEvidence.push(
                evidence
            );
        }

        if (
            extracted.over25 !== null
        ) {
            normalized.odds.over25 =
                extracted.over25;
        }

        if (
            extracted.under25 !== null
        ) {
            normalized.odds.under25 =
                extracted.under25;
        }

        if (
            extracted.bttsYes !== null
        ) {
            normalized.odds.bttsYes =
                extracted.bttsYes;
        }

        if (
            extracted.bttsNo !== null
        ) {
            normalized.odds.bttsNo =
                extracted.bttsNo;
        }

        return;
    }

    /*
     * Undated odds are preserved but never promoted
     * into current numerical odds.
     */

    if (
        classified.relevance ===
        "UNDATED_TEAM_SOURCE"
    ) {
        normalized.undatedOddsEvidence.push(
            evidence
        );
    }
}


function extractOdds(
    text,
    match
) {
    const output = {
        home: null,
        draw: null,
        away: null,
        over25: null,
        under25: null,
        bttsYes: null,
        bttsNo: null
    };

    if (!text) {
        return output;
    }

    /*
     * ------------------------------------------------------------
     * 1X2
     * ------------------------------------------------------------
     *
     * Accepted examples:
     *
     * Home 5.00
     * Draw 3.80
     * Away 1.60
     *
     * 1 5.00
     * X 3.80
     * 2 1.60
     *
     * We deliberately DO NOT extract arbitrary numbers.
     */

    const homePattern =
        new RegExp(
            "(?:home|1)\\s*(?:win)?\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)",
            "i"
        );

    const drawPattern =
        /(?:draw|tie|x)\s*[:=]?\s*(\d+(?:\.\d+)?)/i;

    const awayPattern =
        new RegExp(
            "(?:away|2)\\s*(?:win)?\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)",
            "i"
        );

    const homeMatch =
        text.match(
            homePattern
        );

    const drawMatch =
        text.match(
            drawPattern
        );

    const awayMatch =
        text.match(
            awayPattern
        );

    if (homeMatch) {
        output.home =
            safeOdds(
                homeMatch[1]
            );
    }

    if (drawMatch) {
        output.draw =
            safeOdds(
                drawMatch[1]
            );
    }

    if (awayMatch) {
        output.away =
            safeOdds(
                awayMatch[1]
            );
    }

    /*
     * ------------------------------------------------------------
     * OVER / UNDER 2.5
     * ------------------------------------------------------------
     */

    const over25 =
        text.match(
            /over\s*2\.5(?:\s*goals?)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i
        );

    const under25 =
        text.match(
            /under\s*2\.5(?:\s*goals?)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i
        );

    if (over25) {
        output.over25 =
            safeOdds(
                over25[1]
            );
    }

    if (under25) {
        output.under25 =
            safeOdds(
                under25[1]
            );
    }

    /*
     * ------------------------------------------------------------
     * BTTS
     * ------------------------------------------------------------
     */

    const bttsYes =
        text.match(
            /(?:btts|both teams to score)[^.\n]{0,20}?(?:yes)\s*[:=]?\s*(\d+(?:\.\d+)?)/i
        );

    const bttsNo =
        text.match(
            /(?:btts|both teams to score)[^.\n]{0,20}?(?:no)\s*[:=]?\s*(\d+(?:\.\d+)?)/i
        );

    if (bttsYes) {
        output.bttsYes =
            safeOdds(
                bttsYes[1]
            );
    }

    if (bttsNo) {
        output.bttsNo =
            safeOdds(
                bttsNo[1]
            );
    }

    return output;
}


function safeOdds(value) {
    const number =
        Number(value);

    /*
     * Decimal football odds should normally be
     * greater than 1.
     *
     * Extremely large values are rejected because
     * they are usually percentages, IDs, dates,
     * rankings or unrelated numbers.
     */

    if (
        !Number.isFinite(number) ||
        number < 1.01 ||
        number > 100
    ) {
        return null;
    }

    return number;
}


/* ================================================================
   ODDS VALIDATION
   ================================================================ */

function validateOdds(normalized) {
    const odds =
        normalized.odds;

    for (const key of Object.keys(odds)) {
        const value =
            odds[key];

        if (
            value === null ||
            value === undefined
        ) {
            continue;
        }

        if (
            !Number.isFinite(
                Number(value)
            ) ||
            Number(value) < 1.01 ||
            Number(value) > 100
        ) {
            odds[key] = null;
        }
    }

    /*
     * Do not allow an incomplete 1X2 set to be treated
     * as structured 1X2 odds.
     *
     * We keep individual labelled values if present,
     * but the dataAvailability flag will remain false
     * unless all three exist.
     */
}


/* ================================================================
   DATA AVAILABILITY
   ================================================================ */

function buildDataAvailability(
    normalized,
    quality
) {
    const structured1X2 =
        normalized.odds.home !== null &&
        normalized.odds.draw !== null &&
        normalized.odds.away !== null;

    const actualLineups =
        Array.isArray(
            normalized.lineups.home
        ) &&
        normalized.lineups.home.length > 0
        ||
        Array.isArray(
            normalized.lineups.away
        ) &&
        normalized.lineups.away.length > 0;

    const currentLineupSource =
        normalized.lineups.matchEvidence
            .some(
                item =>
                    item.relevance ===
                    "CURRENT_MATCH"
            );

    const currentInjuries =
        normalized.injuries.home.length > 0 ||
        normalized.injuries.away.length > 0;

    const currentStats =
        normalized.statsEvidence.length > 0;

    const currentOddsSource =
        normalized.oddsEvidence.length > 0;

    return {
        fixture: {
            available:
                quality.currentMatchSources > 0,

            confidence:
                quality.currentMatchSources > 0
                    ? "HIGH"
                    : "NONE"
        },

        form: {
            available:
                quality.formEvidence > 0,

            confidence:
                quality.formEvidence > 0
                    ? "MEDIUM"
                    : "NONE",

            reason:
                quality.formEvidence > 0
                    ? null
                    : "No date-qualified recent results extracted"
        },

        h2h: {
            available:
                quality.h2hSources > 0,

            confidence:
                quality.h2hSources > 0
                    ? "MEDIUM"
                    : "NONE"
        },

        injuries: {
            available:
                currentInjuries,

            confidence:
                currentInjuries
                    ? "MEDIUM"
                    : "NONE",

            sourceAvailable:
                quality.injurySources > 0,

            currentEvidence:
                currentInjuries
        },

        lineups: {
            sourceAvailable:
                currentLineupSource,

            playersAvailable:
                actualLineups,

            confirmed:
                normalized.lineups.matchEvidence
                    .some(
                        item =>
                            item.confirmed === true
                    )
        },

        stats: {
            available:
                currentStats,

            confidence:
                currentStats
                    ? "MEDIUM"
                    : "NONE",

            undatedAvailable:
                normalized.undatedStatsEvidence.length > 0
        },

        xg: {
            available:
                normalized.xg.home !== null &&
                normalized.xg.away !== null,

            confidence:
                normalized.xg.home !== null &&
                normalized.xg.away !== null
                    ? "MEDIUM"
                    : "NONE"
        },

        odds: {
            sourceAvailable:
                currentOddsSource,

            structured1X2,

            confidence:
                structured1X2
                    ? "MEDIUM"
                    : currentOddsSource
                        ? "LOW"
                        : "NONE",

            undatedAvailable:
                normalized.undatedOddsEvidence.length > 0
        }
    };
}


/* ================================================================
   QUALITY
   ================================================================ */

function buildQuality(
    normalized
) {
    const sources =
        normalized.sources;

    return {
        totalSources:
            sources.length,

        currentMatchSources:
            sources.filter(
                item =>
                    item.relevance ===
                    "CURRENT_MATCH"
            ).length,

        recentSources:
            sources.filter(
                item =>
                    item.relevance ===
                    "RECENT"
            ).length,

        historicalSources:
            sources.filter(
                item =>
                    item.relevance ===
                    "HISTORICAL"
            ).length,

        futureSources:
            sources.filter(
                item =>
                    item.relevance ===
                    "FUTURE"
            ).length,

        undatedTeamSources:
            sources.filter(
                item =>
                    item.relevance ===
                    "UNDATED_TEAM_SOURCE"
            ).length,

        irrelevantSources:
            sources.filter(
                item =>
                    item.relevance ===
                    "IRRELEVANT"
            ).length,

        h2hSources:
            normalized.h2h.length,

        formEvidence:
            normalized.formEvidence.home.length +
            normalized.formEvidence.away.length,

        statsEvidence:
            normalized.statsEvidence.length,

        undatedStatsEvidence:
            normalized.undatedStatsEvidence.length,

        injuryEvidence:
            normalized.injuries.home.length +
            normalized.injuries.away.length,

        injurySources:
            sources.filter(
                item =>
                    item.type ===
                    "injuries"
            ).length,

        lineupEvidence:
            normalized.lineups.matchEvidence.length,

        oddsEvidence:
            normalized.oddsEvidence.length,

        undatedOddsEvidence:
            normalized.undatedOddsEvidence.length
    };
}


/* ================================================================
   WARNINGS
   ================================================================ */

function addWarnings(
    normalized,
    match
) {
    const sources =
        normalized.sources;

    if (
        sources.some(
            item =>
                item.relevance ===
                "HISTORICAL"
        )
    ) {
        normalized.warnings.push(
            "Historical evidence was detected and must not be treated as current-match information."
        );
    }

    if (
        sources.some(
            item =>
                item.relevance ===
                "FUTURE"
        )
    ) {
        normalized.warnings.push(
            "Future fixture or future-dated information was detected and excluded from current-match evidence."
        );
    }

    if (
        sources.some(
            item =>
                item.relevance ===
                "UNDATED_TEAM_SOURCE"
        )
    ) {
        normalized.warnings.push(
            "Some team-related sources had no reliable event date and were kept separately instead of being treated as recent."
        );
    }

    if (
        normalized.statsEvidence.length === 0
    ) {
        normalized.warnings.push(
            "No date-qualified statistical evidence was found."
        );
    }

    if (
        normalized.injuries.home.length === 0 &&
        normalized.injuries.away.length === 0
    ) {
        normalized.warnings.push(
            "No current-match injury evidence was confidently attributed."
        );
    }

    if (
        normalized.lineups.matchEvidence.length > 0 &&
        !(
            Array.isArray(
                normalized.lineups.home
            ) &&
            normalized.lineups.home.length > 0
        ) &&
        !(
            Array.isArray(
                normalized.lineups.away
            ) &&
            normalized.lineups.away.length > 0
        )
    ) {
        normalized.warnings.push(
            "A current-match lineup source was found, but actual player names were not safely extracted."
        );
    }

    if (
        normalized.oddsEvidence.length > 0 &&
        !(
            normalized.odds.home !== null &&
            normalized.odds.draw !== null &&
            normalized.odds.away !== null
        )
    ) {
        normalized.warnings.push(
            "A current-match odds source was found, but complete structured 1X2 odds were not safely extracted."
        );
    }

    if (
        normalized.undatedStatsEvidence.length > 0
    ) {
        normalized.warnings.push(
            "Undated statistical sources were retained separately and must not be treated as current-match statistics."
        );
    }

    if (
        normalized.undatedOddsEvidence.length > 0
    ) {
        normalized.warnings.push(
            "Undated odds sources were retained separately and must not be treated as current-match odds."
        );
    }
}


/* ================================================================
   DUPLICATES
   ================================================================ */

function removeDuplicateEvidence(
    items
) {
    const seen =
        new Set();

    const output = [];

    for (const item of items || []) {
        const key =
            [
                item.source || "",
                item.url || "",
                item.eventDate || "",
                item.relevance || "",
                item.snippet || ""
            ].join("|");

        if (
            seen.has(key)
        ) {
            continue;
        }

        seen.add(key);

        output.push(item);
    }

    return output;
}


/* ================================================================
   DATE DISTANCE
   ================================================================ */

function daysBetween(
    first,
    second
) {
    if (
        !first ||
        !second
    ) {
        return Infinity;
    }

    const milliseconds =
        Math.abs(
            first.getTime() -
            second.getTime()
        );

    return (
        milliseconds /
        86400000
    );
}
