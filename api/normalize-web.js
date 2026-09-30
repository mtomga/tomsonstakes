export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Only POST requests are allowed."
            });
        }

        const {
            home,
            away,
            date,
            webData
        } = req.body || {};

        if (!home || !away || !date || !webData) {
            return res.status(400).json({
                error: "home, away, date and webData are required."
            });
        }

        const targetDate = parseInputDate(date);

        if (!targetDate) {
            return res.status(400).json({
                error: "Invalid match date."
            });
        }

        const normalized = {
            match: {
                home,
                away,
                date,
                year: targetDate.getUTCFullYear()
            },

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

            sources: [],

            warnings: []
        };

        const searches =
            Array.isArray(webData.searches)
                ? webData.searches
                : [];

        const homeAliases =
            buildTeamAliases(home);

        const awayAliases =
            buildTeamAliases(away);

        for (const search of searches) {

            const type =
                search.type || "unknown";

            const results =
                Array.isArray(search.results)
                    ? search.results
                    : [];

            for (const item of results) {

                const title =
                    item.title || "";

                const snippet =
                    item.snippet || "";

                const link =
                    item.link || "";

                const publishedDate =
                    parseItemDate(item.date);

                const combinedText = [
                    title,
                    snippet
                ].join(" ");

                const text =
                    normalizeText(combinedText);

                const homeMatch =
                    containsAnyAlias(
                        text,
                        homeAliases
                    );

                const awayMatch =
                    containsAnyAlias(
                        text,
                        awayAliases
                    );

                /*
                 * IMPORTANT:
                 * Separate publication date from
                 * actual fixture/event date.
                 */
                const detectedDates =
                    extractDates(combinedText);

                const eventDates =
                    extractLikelyEventDates(
                        combinedText,
                        targetDate
                    );

                const eventDate =
                    chooseEventDate(
                        eventDates,
                        targetDate
                    );

                const exactTargetDate =
                    eventDate
                        ? sameUTCDate(
                              eventDate,
                              targetDate
                          )
                        : false;

                const classification =
                    classifyEvidence({
                        type,
                        text,
                        title,
                        homeMatch,
                        awayMatch,
                        targetDate,
                        eventDate,
                        publishedDate,
                        exactTargetDate
                    });

                const sourceRecord = {
                    type,
                    title,
                    url: link,
                    snippet,

                    publishedDate:
                        publishedDate
                            ? formatUTCDate(
                                  publishedDate
                              )
                            : null,

                    eventDate:
                        eventDate
                            ? formatUTCDate(
                                  eventDate
                              )
                            : null,

                    detectedDates:
                        detectedDates.map(
                            d =>
                                formatUTCDate(d)
                        ),

                    relevance:
                        classification.relevance,

                    relevanceScore:
                        classification.score,

                    dateBasis:
                        classification.dateBasis,

                    teamsMentioned: {
                        home: homeMatch,
                        away: awayMatch
                    }
                };

                normalized.sources.push(
                    sourceRecord
                );

                /*
                 * H2H
                 *
                 * Do not classify every article
                 * mentioning both teams as H2H.
                 */
                if (
                    type === "h2h" &&
                    homeMatch &&
                    awayMatch &&
                    isActualH2HSource(
                        title,
                        snippet,
                        link
                    )
                ) {

                    normalized.h2h.push({
                        source: title,
                        url: link,
                        snippet,
                        relevance: "HISTORICAL"
                    });
                }

                /*
                 * FORM
                 *
                 * Form requires actual match/result
                 * dates. Publication date alone is not
                 * enough.
                 */
                if (
                    type === "form" &&
                    (
                        classification.relevance ===
                            "CURRENT_MATCH" ||
                        classification.relevance ===
                            "RECENT"
                    )
                ) {

                    const hasResultEvidence =
                        hasMatchResultEvidence(
                            text
                        );

                    const formDate =
                        eventDate ||
                        extractResultDate(
                            combinedText
                        );

                    if (
                        hasResultEvidence &&
                        formDate
                    ) {

                        const daysAgo =
                            daysBetween(
                                formDate,
                                targetDate
                            );

                        if (
                            daysAgo >= 0 &&
                            daysAgo <= 60
                        ) {

                            if (homeMatch) {

                                normalized.formEvidence.home.push({
                                    source: title,
                                    url: link,
                                    snippet,
                                    relevance:
                                        classification.relevance
                                });
                            }

                            if (awayMatch) {

                                normalized.formEvidence.away.push({
                                    source: title,
                                    url: link,
                                    snippet,
                                    relevance:
                                        classification.relevance
                                });
                            }
                        }
                    }
                }

                /*
                 * INJURIES
                 */
                if (
                    type === "injuries" &&
                    (
                        classification.relevance ===
                            "CURRENT_MATCH" ||
                        classification.relevance ===
                            "RECENT"
                    )
                ) {

                    const injuryWords = [
                        "injury",
                        "injured",
                        "injuries",
                        "suspended",
                        "suspension",
                        "unavailable",
                        "doubtful",
                        "ruled out",
                        "missing",
                        "absent"
                    ];

                    const hasInjuryInformation =
                        injuryWords.some(
                            word =>
                                text.includes(word)
                        );

                    if (
                        hasInjuryInformation
                    ) {

                        const records =
                            extractInjuryEvidence(
                                combinedText,
                                title,
                                link,
                                classification.relevance,
                                homeAliases,
                                awayAliases
                            );

                        for (
                            const record of records
                        ) {

                            if (
                                record.team ===
                                    "home"
                            ) {

                                normalized.injuries.home.push(
                                    record
                                );
                            }

                            else if (
                                record.team ===
                                    "away"
                            ) {

                                normalized.injuries.away.push(
                                    record
                                );
                            }

                            else {

                                normalized.injuries.unknown.push(
                                    record
                                );
                            }
                        }
                    }
                }

                /*
                 * LINEUPS
                 */
                if (
                    type === "lineups" &&
                    classification.relevance ===
                        "CURRENT_MATCH"
                ) {

                    const attribution =
                        inferLineupAttribution(
                            text,
                            homeAliases,
                            awayAliases,
                            homeMatch,
                            awayMatch
                        );

                    const lineupRecord = {
                        source: title,
                        url: link,
                        snippet,
                        relevance:
                            classification.relevance,
                        team: attribution
                    };

                    if (
                        attribution === "home"
                    ) {

                        normalized.lineups.home =
                            lineupRecord;
                    }

                    else if (
                        attribution === "away"
                    ) {

                        normalized.lineups.away =
                            lineupRecord;
                    }

                    else if (
                        attribution === "match"
                    ) {

                        normalized.lineups.matchEvidence.push(
                            lineupRecord
                        );
                    }

                    else {

                        normalized.lineups.unknown.push(
                            lineupRecord
                        );
                    }
                }

                /*
                 * STATS
                 */
                if (
                    type === "stats" &&
                    (
                        classification.relevance ===
                            "CURRENT_MATCH" ||
                        classification.relevance ===
                            "RECENT"
                    )
                ) {

                    normalized.statsEvidence.push({
                        source: title,
                        url: link,
                        snippet,
                        relevance:
                            classification.relevance
                    });
                }

                /*
                 * ODDS
                 */
                if (
                    type === "odds" &&
                    (
                        classification.relevance ===
                            "CURRENT_MATCH" ||
                        classification.relevance ===
                            "RECENT"
                    )
                ) {

                    normalized.oddsEvidence.push({
                        source: title,
                        url: link,
                        snippet,
                        relevance:
                            classification.relevance
                    });
                }
            }
        }

        /*
         * Remove duplicate evidence.
         */
        normalized.sources =
            removeDuplicates(
                normalized.sources,
                "url"
            );

        normalized.h2h =
            removeDuplicates(
                normalized.h2h,
                "url"
            );

        normalized.formEvidence.home =
            removeDuplicates(
                normalized.formEvidence.home,
                "url"
            );

        normalized.formEvidence.away =
            removeDuplicates(
                normalized.formEvidence.away,
                "url"
            );

        normalized.statsEvidence =
            removeDuplicates(
                normalized.statsEvidence,
                "url"
            );

        normalized.oddsEvidence =
            removeDuplicates(
                normalized.oddsEvidence,
                "url"
            );

        normalized.injuries.home =
            removeDuplicates(
                normalized.injuries.home,
                "url"
            );

        normalized.injuries.away =
            removeDuplicates(
                normalized.injuries.away,
                "url"
            );

        normalized.injuries.unknown =
            removeDuplicates(
                normalized.injuries.unknown,
                "url"
            );

        normalized.lineups.matchEvidence =
            removeDuplicates(
                normalized.lineups.matchEvidence,
                "url"
            );

        normalized.lineups.unknown =
            removeDuplicates(
                normalized.lineups.unknown,
                "url"
            );

        /*
         * Quality buckets.
         */
        const currentMatchSources =
            normalized.sources.filter(
                s =>
                    s.relevance ===
                    "CURRENT_MATCH"
            );

        const recentSources =
            normalized.sources.filter(
                s =>
                    s.relevance ===
                    "RECENT"
            );

        const historicalSources =
            normalized.sources.filter(
                s =>
                    s.relevance ===
                    "HISTORICAL"
            );

        const futureSources =
            normalized.sources.filter(
                s =>
                    s.relevance ===
                    "FUTURE"
            );

        const irrelevantSources =
            normalized.sources.filter(
                s =>
                    s.relevance ===
                    "IRRELEVANT"
            );

        /*
         * Warnings.
         */
        if (
            currentMatchSources.length === 0
        ) {

            normalized.warnings.push(
                "No source was confidently matched to the exact target match date."
            );
        }

        if (
            recentSources.length > 0
        ) {

            normalized.warnings.push(
                "Recent evidence was detected and separated from exact-match evidence."
            );
        }

        if (
            historicalSources.length > 0
        ) {

            normalized.warnings.push(
                "Historical evidence was detected and must not be treated as current-match information."
            );
        }

        if (
            futureSources.length > 0
        ) {

            normalized.warnings.push(
                "Future fixture or future-dated information was detected and excluded from current-match evidence."
            );
        }

        if (
            normalized.lineups.matchEvidence.length >
            0
        ) {

            normalized.warnings.push(
                "Some lineup sources describe the whole match rather than one team and were stored as match-level evidence."
            );
        }

        if (
            normalized.injuries.unknown.length >
            0
        ) {

            normalized.warnings.push(
                "Some injury information could not be confidently attributed to one team."
            );
        }

        normalized.warnings.push(
            "Numerical statistics are not guessed when source evidence is unclear."
        );

        normalized.warnings.push(
            "Numerical odds remain null until reliable odds extraction is implemented."
        );

        /*
         * Final response.
         */
        return res.status(200).json({

            success: true,

            normalized,

            quality: {

                totalSources:
                    normalized.sources.length,

                currentMatchSources:
                    currentMatchSources.length,

                recentSources:
                    recentSources.length,

                historicalSources:
                    historicalSources.length,

                futureSources:
                    futureSources.length,

                irrelevantSources:
                    irrelevantSources.length,

                h2hSources:
                    normalized.h2h.length,

                formEvidence:
                    normalized.formEvidence.home.length +
                    normalized.formEvidence.away.length,

                statsEvidence:
                    normalized.statsEvidence.length,

                injuryEvidence:
                    normalized.injuries.home.length +
                    normalized.injuries.away.length +
                    normalized.injuries.unknown.length,

                lineupEvidence:
                    (
                        normalized.lineups.home
                            ? 1
                            : 0
                    ) +
                    (
                        normalized.lineups.away
                            ? 1
                            : 0
                    ) +
                    normalized.lineups.matchEvidence.length +
                    normalized.lineups.unknown.length,

                oddsEvidence:
                    normalized.oddsEvidence.length
            },

            analysisReady: {

                exactMatchEvidence:
                    currentMatchSources.length >
                    0,

                recentEvidence:
                    recentSources.length >
                    0,

                h2hEvidence:
                    normalized.h2h.length >
                    0,

                formEvidence:
                    normalized.formEvidence.home.length >
                        0 ||
                    normalized.formEvidence.away.length >
                        0,

                injuryEvidence:
                    normalized.injuries.home.length >
                        0 ||
                    normalized.injuries.away.length >
                        0,

                lineupEvidence:
                    !!normalized.lineups.home ||
                    !!normalized.lineups.away ||
                    normalized.lineups.matchEvidence.length >
                        0,

                statsEvidence:
                    normalized.statsEvidence.length >
                    0,

                oddsEvidence:
                    normalized.oddsEvidence.length >
                    0
            }
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Web data normalization failed.",
            details: error.message
        });
    }
}


/* =========================================================
   DATE FUNCTIONS
   ========================================================= */

function parseInputDate(value) {

    if (!value) {
        return null;
    }

    const date =
        new Date(value);

    if (!isNaN(date.getTime())) {
        return date;
    }

    return null;
}


function parseItemDate(value) {

    if (!value) {
        return null;
    }

    const date =
        new Date(value);

    if (!isNaN(date.getTime())) {
        return date;
    }

    const dates =
        extractDates(String(value));

    return dates.length
        ? dates[0]
        : null;
}


function extractDates(text) {

    const dates = [];

    if (!text) {
        return dates;
    }

    let match;

    const isoRegex =
        /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;

    while (
        (match = isoRegex.exec(text)) !== null
    ) {

        const date =
            createUTCDate(
                Number(match[1]),
                Number(match[2]),
                Number(match[3])
            );

        if (date) {
            dates.push(date);
        }
    }

    const numericRegex =
        /\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/g;

    while (
        (match = numericRegex.exec(text)) !== null
    ) {

        const date =
            createUTCDate(
                Number(match[3]),
                Number(match[2]),
                Number(match[1])
            );

        if (date) {
            dates.push(date);
        }
    }

    const monthNames =
        "January|February|March|April|May|June|July|August|September|October|November|December";

    const monthShortNames =
        "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

    const forwardRegex =
        new RegExp(
            "\\b(" +
            monthNames +
            "|" +
            monthShortNames +
            ")\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b",
            "gi"
        );

    while (
        (match = forwardRegex.exec(text)) !== null
    ) {

        const date =
            createUTCDate(
                Number(match[3]),
                monthNumber(match[1]),
                Number(match[2])
            );

        if (date) {
            dates.push(date);
        }
    }

    const reverseRegex =
        new RegExp(
            "\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" +
            monthNames +
            "|" +
            monthShortNames +
            ")[,]?\\s+(20\\d{2})\\b",
            "gi"
        );

    while (
        (match = reverseRegex.exec(text)) !== null
    ) {

        const date =
            createUTCDate(
                Number(match[3]),
                monthNumber(match[2]),
                Number(match[1])
            );

        if (date) {
            dates.push(date);
        }
    }

    return uniqueDates(dates);
}


function extractLikelyEventDates(
    text,
    targetDate
) {

    const dates =
        extractDates(text);

    if (!dates.length) {
        return [];
    }

    const lower =
        normalizeText(text);

    const eventDates = [];

    for (const date of dates) {

        const formatted =
            formatUTCDate(date);

        if (
            lower.includes(
                formatted
            )
        ) {
            eventDates.push(date);
            continue;
        }

        const monthName =
            fullMonthName(
                date.getUTCMonth() + 1
            );

        const day =
            date.getUTCDate();

        const year =
            date.getUTCFullYear();

        const patterns = [
            monthName.toLowerCase() +
                " " +
                day +
                " " +
                year,

            day +
                " " +
                monthName.toLowerCase() +
                " " +
                year
        ];

        if (
            patterns.some(
                p =>
                    lower.includes(p)
            )
        ) {
            eventDates.push(date);
            continue;
        }

        /*
         * Football fixture phrases.
         */
        const dayText =
            String(day);

        const yearText =
            String(year);

        const dateIndex =
            lower.indexOf(
                dayText
            );

        if (
            dateIndex !== -1 &&
            lower.includes(
                yearText,
                dateIndex
            )
        ) {

            const nearby =
                lower.substring(
                    Math.max(
                        0,
                        dateIndex - 80
                    ),
                    Math.min(
                        lower.length,
                        dateIndex + 100
                    )
                );

            if (
                nearby.includes("vs") ||
                nearby.includes("v ") ||
                nearby.includes("match") ||
                nearby.includes("fixture") ||
                nearby.includes("kick off") ||
                nearby.includes("kickoff") ||
                nearby.includes("prediction")
            ) {

                eventDates.push(date);
            }
        }
    }

    return uniqueDates(
        eventDates
    );
}


function chooseEventDate(
    dates,
    targetDate
) {

    if (!dates.length) {
        return null;
    }

    for (const date of dates) {

        if (
            sameUTCDate(
                date,
                targetDate
            )
        ) {
            return date;
        }
    }

    /*
     * If there is one clearly identified
     * event date, use it.
     */
    if (dates.length === 1) {
        return dates[0];
    }

    /*
     * Otherwise choose the closest date,
     * but only among event dates.
     */
    return getNearestDate(
        dates,
        targetDate
    );
}


function extractResultDate(text) {

    const dates =
        extractDates(text);

    return dates.length
        ? dates[0]
        : null;
}


function createUTCDate(
    year,
    month,
    day
) {

    if (
        !year ||
        !month ||
        !day
    ) {
        return null;
    }

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


function sameUTCDate(
    a,
    b
) {

    return (
        a.getUTCFullYear() ===
            b.getUTCFullYear() &&
        a.getUTCMonth() ===
            b.getUTCMonth() &&
        a.getUTCDate() ===
            b.getUTCDate()
    );
}


function formatUTCDate(date) {

    return (
        date.getUTCFullYear() +
        "-" +
        String(
            date.getUTCMonth() + 1
        ).padStart(2, "0") +
        "-" +
        String(
            date.getUTCDate()
        ).padStart(2, "0")
    );
}


function daysBetween(
    older,
    newer
) {

    return Math.round(
        (
            newer.getTime() -
            older.getTime()
        ) /
        86400000
    );
}


function getNearestDate(
    dates,
    targetDate
) {

    let nearest = null;
    let distance = Infinity;

    for (const date of dates) {

        const d =
            Math.abs(
                date.getTime() -
                targetDate.getTime()
            );

        if (d < distance) {

            distance = d;
            nearest = date;
        }
    }

    return nearest;
}


function fullMonthName(month) {

    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ];

    return months[month - 1];
}


function monthNumber(name) {

    const value =
        String(name)
            .toLowerCase()
            .replace(".", "");

    const months = {
        january: 1,
        jan: 1,
        february: 2,
        feb: 2,
        march: 3,
        mar: 3,
        april: 4,
        apr: 4,
        may: 5,
        june: 6,
        jun: 6,
        july: 7,
        jul: 7,
        august: 8,
        aug: 8,
        september: 9,
        sep: 9,
        sept: 9,
        october: 10,
        oct: 10,
        november: 11,
        nov: 11,
        december: 12,
        dec: 12
    };

    return months[value] || null;
}


/* =========================================================
   TEXT / TEAM FUNCTIONS
   ========================================================= */

function normalizeText(value) {

    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /[’‘`]/g,
            "'"
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}


function buildTeamAliases(team) {

    const original =
        normalizeText(team);

    const aliases = new Set();

    if (original) {
        aliases.add(original);
    }

    const simplified =
        original
            .replace(
                /[^a-z0-9\s']/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    if (simplified) {
        aliases.add(simplified);
    }

    const noSpaces =
        simplified.replace(
            /\s+/g,
            ""
        );

    if (noSpaces) {
        aliases.add(noSpaces);
    }

    if (
        simplified.includes(
            "concepcion"
        )
    ) {

        aliases.add(
            "deportes concepcion"
        );

        aliases.add(
            "d concepcion"
        );

        aliases.add(
            "d. concepcion"
        );
    }

    if (
        simplified.includes(
            "o higgins"
        ) ||
        simplified.includes(
            "ohiggins"
        ) ||
        simplified.includes(
            "o'higgins"
        )
    ) {

        aliases.add(
            "o higgins"
        );

        aliases.add(
            "ohiggins"
        );

        aliases.add(
            "o'higgins"
        );
    }

    return Array.from(
        aliases
    );
}


function containsAnyAlias(
    text,
    aliases
) {

    return aliases.some(
        alias =>
            alias &&
            text.includes(alias)
    );
}


/* =========================================================
   CLASSIFICATION
   ========================================================= */

function classifyEvidence({
    type,
    text,
    title,
    homeMatch,
    awayMatch,
    targetDate,
    eventDate,
    publishedDate,
    exactTargetDate
}) {

    let score = 0;

    if (homeMatch) {
        score += 30;
    }

    if (awayMatch) {
        score += 30;
    }

    /*
     * H2H is historical by definition.
     */
    if (type === "h2h") {

        if (
            homeMatch &&
            awayMatch
        ) {

            return {
                relevance: "HISTORICAL",
                score: 70,
                dateBasis: "H2H"
            };
        }

        return {
            relevance: "IRRELEVANT",
            score: 0,
            dateBasis: "NONE"
        };
    }

    /*
     * Actual event date takes priority over
     * publication date.
     */
    if (
        eventDate &&
        homeMatch &&
        awayMatch
    ) {

        if (
            sameUTCDate(
                eventDate,
                targetDate
            )
        ) {

            return {
                relevance: "CURRENT_MATCH",
                score: score + 40,
                dateBasis: "EVENT_DATE"
            };
        }

        if (
            eventDate.getTime() >
            targetDate.getTime()
        ) {

            return {
                relevance: "FUTURE",
                score,
                dateBasis: "EVENT_DATE"
            };
        }

        const days =
            daysBetween(
                eventDate,
                targetDate
            );

        if (
            days >= 0 &&
            days <= 45
        ) {

            return {
                relevance: "RECENT",
                score: score + 20,
                dateBasis: "EVENT_DATE"
            };
        }

        return {
            relevance: "HISTORICAL",
            score,
            dateBasis: "EVENT_DATE"
        };
    }

    /*
     * For injuries/news/lineups, publication date
     * can establish recency if no event date exists.
     */
    if (
        publishedDate &&
        (
            type === "injuries" ||
            type === "lineups"
        )
    ) {

        const days =
            daysBetween(
                publishedDate,
                targetDate
            );

        if (
            days >= 0 &&
            days <= 30 &&
            (
                homeMatch ||
                awayMatch
            )
        ) {

            return {
                relevance:
                    exactTargetDate
                        ? "CURRENT_MATCH"
                        : "RECENT",
                score: score + 20,
                dateBasis:
                    "PUBLICATION_DATE"
            };
        }

        if (
            days > 30
        ) {

            return {
                relevance: "HISTORICAL",
                score,
                dateBasis:
                    "PUBLICATION_DATE"
            };
        }

        if (
            days < 0
        ) {

            return {
                relevance: "FUTURE",
                score,
                dateBasis:
                    "PUBLICATION_DATE"
            };
        }
    }

    /*
     * Form requires an actual event/result date.
     * Publication date must not create form evidence.
     */
    if (
        type === "form"
    ) {

        return {
            relevance:
                homeMatch ||
                awayMatch
                    ? "IRRELEVANT"
                    : "IRRELEVANT",
            score,
            dateBasis: "NO_RESULT_DATE"
        };
    }

    /*
     * Stats / odds without explicit event date:
     * don't automatically call them current.
     */
    if (
        type === "stats" ||
        type === "odds"
    ) {

        if (
            exactTargetDate &&
            homeMatch &&
            awayMatch
        ) {

            return {
                relevance: "CURRENT_MATCH",
                score: score + 40,
                dateBasis: "EXACT_DATE"
            };
        }

        if (
            homeMatch &&
            awayMatch
        ) {

            return {
                relevance: "RECENT",
                score: score + 10,
                dateBasis: "TEAM_MATCH"
            };
        }
    }

    if (
        homeMatch &&
        awayMatch &&
        exactTargetDate
    ) {

        return {
            relevance: "CURRENT_MATCH",
            score: score + 40,
            dateBasis: "EXACT_DATE"
        };
    }

    if (
        !homeMatch &&
        !awayMatch
    ) {

        return {
            relevance: "IRRELEVANT",
            score: 0,
            dateBasis: "NONE"
        };
    }

    return {
        relevance: "IRRELEVANT",
        score,
        dateBasis: "INSUFFICIENT_DATE"
    };
}


/* =========================================================
   H2H
   ========================================================= */

function isActualH2HSource(
    title,
    snippet,
    link
) {

    const text =
        normalizeText(
            [
                title,
                snippet,
                link
            ].join(" ")
        );

    const h2hWords = [
        "h2h",
        "head to head",
        "head-to-head",
        "past meetings",
        "previous meetings",
        "previous encounters",
        "past encounters",
        "meetings between",
        "last meetings"
    ];

    return h2hWords.some(
        word =>
            text.includes(word)
    );
}


/* =========================================================
   FORM
   ========================================================= */

function hasMatchResultEvidence(
    text
) {

    const resultWords = [
        "won",
        "win",
        "lost",
        "loss",
        "draw",
        "drew",
        "result",
        "final score",
        "full time",
        "ft ",
        "2-0",
        "1-0",
        "0-0",
        "2-1",
        "1-1"
    ];

    return resultWords.some(
        word =>
            text.includes(word)
    );
}


/* =========================================================
   INJURIES
   ========================================================= */

function extractInjuryEvidence(
    text,
    title,
    url,
    relevance,
    homeAliases,
    awayAliases
) {

    const records = [];

    const sentences =
        splitEvidenceSentences(
            text
        );

    for (
        const sentence of sentences
    ) {

        const lower =
            normalizeText(
                sentence
            );

        const injuryWords = [
            "injury",
            "injured",
            "injuries",
            "suspended",
            "suspension",
            "unavailable",
            "doubtful",
            "ruled out",
            "missing",
            "absent"
        ];

        if (
            !injuryWords.some(
                word =>
                    lower.includes(word)
            )
        ) {
            continue;
        }

        /*
         * Explicit negative statements.
         * Example:
         * "Universidad de Concepcion does not
         * have any unavailable players."
         */
        const negative =
            isNegativeAvailabilitySentence(
                lower
            );

        const home =
            containsAnyAlias(
                lower,
                homeAliases
            );

        const away =
            containsAnyAlias(
                lower,
                awayAliases
            );

        let team =
            "unknown";

        if (
            home &&
            !away
        ) {
            team = "home";
        }

        else if (
            away &&
            !home
        ) {
            team = "away";
        }

        else if (
            home &&
            away
        ) {

            team =
                inferFromExplicitPatterns(
                    lower,
                    homeAliases,
                    awayAliases
                );
        }

        records.push({
            source: title,
            url,
            snippet: sentence.trim(),
            relevance,
            team,
            negative
        });
    }

    return records;
}


function isNegativeAvailabilitySentence(
    text
) {

    return (
        text.includes(
            "does not have"
        ) ||
        text.includes(
            "no unavailable"
        ) ||
        text.includes(
            "no injuries"
        ) ||
        text.includes(
            "none injured"
        ) ||
        text.includes(
            "none suspended"
        ) ||
        text.includes(
            "no players unavailable"
        )
    );
}


function inferFromExplicitPatterns(
    text,
    homeAliases,
    awayAliases
) {

    const homePatterns =
        buildExplicitTeamPatterns(
            homeAliases
        );

    const awayPatterns =
        buildExplicitTeamPatterns(
            awayAliases
        );

    const homeFound =
        homePatterns.some(
            p =>
                text.includes(p)
        );

    const awayFound =
        awayPatterns.some(
            p =>
                text.includes(p)
        );

    if (
        homeFound &&
        !awayFound
    ) {
        return "home";
    }

    if (
        awayFound &&
        !homeFound
    ) {
        return "away";
    }

    return "unknown";
}


function buildExplicitTeamPatterns(
    aliases
) {

    const patterns = [];

    for (
        const alias of aliases
    ) {

        patterns.push(
            alias +
                " has"
        );

        patterns.push(
            alias +
                " unavailable"
        );

        patterns.push(
            "unavailable players for " +
                alias
        );

        patterns.push(
            "injured players for " +
                alias
        );

        patterns.push(
            "injuries for " +
                alias
        );

        patterns.push(
            alias +
                " suspended"
        );

        patterns.push(
            alias +
                " suspension"
        );

        patterns.push(
            alias +
                " doubtful"
        );

        patterns.push(
            alias +
                " ruled out"
        );
    }

    return patterns;
}


/* =========================================================
   LINEUPS
   ========================================================= */

function inferLineupAttribution(
    text,
    homeAliases,
    awayAliases,
    homeMatch,
    awayMatch
) {

    const lineupWords = [
        "lineup",
        "starting xi",
        "starting eleven",
        "predicted xi",
        "predicted lineup",
        "formation"
    ];

    const hasLineup =
        lineupWords.some(
            word =>
                text.includes(word)
        );

    if (!hasLineup) {
        return "unknown";
    }

    /*
     * If both teams are mentioned in a
     * match-level lineup page, preserve it
     * as match evidence.
     */
    if (
        homeMatch &&
        awayMatch
    ) {
        return "match";
    }

    if (homeMatch) {
        return "home";
    }

    if (awayMatch) {
        return "away";
    }

    return "unknown";
}


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function splitEvidenceSentences(
    text
) {

    return String(text || "")
        .split(
            /[.!?]+/
        )
        .map(
            s =>
                s.trim()
        )
        .filter(
            s =>
                s.length > 0
        );
}


function removeDuplicates(
    items,
    property
) {

    const seen =
        new Set();

    return items.filter(
        item => {

            const value =
                item[property];

            if (!value) {
                return true;
            }

            if (
                seen.has(value)
            ) {
                return false;
            }

            seen.add(value);

            return true;
        }
    );
}
