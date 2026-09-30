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

        const targetYear = targetDate.getUTCFullYear();

        /*
        -------------------------------------------------------
        NORMALIZED OUTPUT
        -------------------------------------------------------
        */

        const normalized = {
            match: {
                home,
                away,
                date,
                year: targetYear
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

        const searches = Array.isArray(webData.searches)
            ? webData.searches
            : [];

        /*
        -------------------------------------------------------
        TEAM ALIASES
        -------------------------------------------------------
        */

        const homeAliases = buildTeamAliases(home);
        const awayAliases = buildTeamAliases(away);

        /*
        -------------------------------------------------------
        PROCESS EVERY SEARCH RESULT
        -------------------------------------------------------
        */

        for (const search of searches) {

            const type = search.type || "unknown";

            const results = Array.isArray(search.results)
                ? search.results
                : [];

            for (const item of results) {

                const title = item.title || "";
                const snippet = item.snippet || "";
                const link = item.link || "";
                const itemDate = item.date || "";

                const combinedText = [
                    title,
                    snippet,
                    itemDate
                ].join(" ");

                const text = normalizeText(combinedText);

                const homeMatch =
                    containsAnyAlias(text, homeAliases);

                const awayMatch =
                    containsAnyAlias(text, awayAliases);

                /*
                ------------------------------------------------
                DATE DETECTION
                ------------------------------------------------
                */

                const detectedDates =
                    extractDates(combinedText);

                const exactTargetDate =
                    detectedDates.some(
                        d => sameUTCDate(d, targetDate)
                    );

                const nearestDate =
                    getNearestRelevantDate(
                        detectedDates,
                        targetDate
                    );

                /*
                ------------------------------------------------
                RELEVANCE CLASSIFICATION
                ------------------------------------------------
                */

                const classification =
                    classifyEvidence({
                        type,
                        text,
                        title,
                        homeMatch,
                        awayMatch,
                        exactTargetDate,
                        nearestDate,
                        targetDate
                    });

                const relevance =
                    classification.relevance;

                const relevanceScore =
                    classification.score;

                /*
                ------------------------------------------------
                SOURCE RECORD
                ------------------------------------------------
                */

                const sourceRecord = {
                    type,
                    title,
                    url: link,
                    snippet,
                    date: itemDate || null,

                    detectedDates:
                        detectedDates.map(
                            d => formatUTCDate(d)
                        ),

                    relevance,
                    relevanceScore,

                    teamsMentioned: {
                        home: homeMatch,
                        away: awayMatch
                    }
                };

                normalized.sources.push(sourceRecord);

                /*
                ------------------------------------------------
                H2H
                ------------------------------------------------
                */

                if (
                    type === "h2h" &&
                    homeMatch &&
                    awayMatch
                ) {

                    normalized.h2h.push({
                        source: title,
                        url: link,
                        snippet,
                        relevance
                    });
                }

                /*
                ------------------------------------------------
                FORM EVIDENCE
                ------------------------------------------------
                */

                if (
                    type === "form" &&
                    (
                        relevance === "CURRENT_MATCH" ||
                        relevance === "RECENT"
                    )
                ) {

                    if (homeMatch) {

                        normalized.formEvidence.home.push({
                            source: title,
                            url: link,
                            snippet,
                            relevance
                        });
                    }

                    if (awayMatch) {

                        normalized.formEvidence.away.push({
                            source: title,
                            url: link,
                            snippet,
                            relevance
                        });
                    }
                }

                /*
                ------------------------------------------------
                INJURIES
                ------------------------------------------------
                */

                if (type === "injuries") {

                    const injuryWords = [
                        "injury",
                        "injured",
                        "injuries",
                        "suspended",
                        "suspension",
                        "unavailable",
                        "doubtful",
                        "out",
                        "missing",
                        "ruled out"
                    ];

                    const hasInjuryInformation =
                        injuryWords.some(
                            word => text.includes(word)
                        );

                    if (hasInjuryInformation) {

                        const attribution =
                            inferTeamAttribution({
                                text,
                                title,
                                homeAliases,
                                awayAliases,
                                homeMatch,
                                awayMatch,
                                type
                            });

                        const injuryRecord = {
                            source: title,
                            url: link,
                            snippet,
                            relevance,
                            team: attribution
                        };

                        if (
                            attribution === "home"
                        ) {

                            normalized.injuries.home.push(
                                injuryRecord
                            );
                        }

                        else if (
                            attribution === "away"
                        ) {

                            normalized.injuries.away.push(
                                injuryRecord
                            );
                        }

                        else if (
                            attribution === "both"
                        ) {

                            normalized.injuries.home.push(
                                injuryRecord
                            );

                            normalized.injuries.away.push(
                                injuryRecord
                            );
                        }

                        else {

                            normalized.injuries.unknown.push(
                                injuryRecord
                            );
                        }
                    }
                }

                /*
                ------------------------------------------------
                LINEUPS
                ------------------------------------------------
                */

                if (type === "lineups") {

                    /*
                    We only trust lineup evidence when it is
                    connected to the target fixture or recent
                    relevant information.
                    */

                    if (
                        relevance === "CURRENT_MATCH"
                    ) {

                        const attribution =
                            inferTeamAttribution({
                                text,
                                title,
                                homeAliases,
                                awayAliases,
                                homeMatch,
                                awayMatch,
                                type
                            });

                        const lineupRecord = {
                            source: title,
                            url: link,
                            snippet,
                            relevance,
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

                        else {

                            normalized.lineups.unknown.push(
                                lineupRecord
                            );
                        }
                    }
                }

                /*
                ------------------------------------------------
                STATISTICS EVIDENCE
                ------------------------------------------------
                */

                if (
                    type === "stats" &&
                    (
                        relevance === "CURRENT_MATCH" ||
                        relevance === "RECENT"
                    )
                ) {

                    normalized.statsEvidence.push({
                        source: title,
                        url: link,
                        snippet,
                        relevance
                    });
                }

                /*
                ------------------------------------------------
                ODDS EVIDENCE
                ------------------------------------------------
                */

                if (type === "odds") {

                    /*
                    Do NOT guess numerical odds.

                    We only retain the source evidence here.
                    Actual odds extraction will be implemented
                    separately when we build the odds parser.
                    */

                    if (
                        relevance === "CURRENT_MATCH" ||
                        relevance === "RECENT"
                    ) {

                        normalized.oddsEvidence.push({
                            source: title,
                            url: link,
                            snippet,
                            relevance
                        });
                    }
                }
            }
        }

        /*
        -------------------------------------------------------
        REMOVE DUPLICATES
        -------------------------------------------------------
        */

        normalized.h2h =
            removeDuplicates(
                normalized.h2h,
                "url"
            );

        normalized.sources =
            removeDuplicates(
                normalized.sources,
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

        /*
        -------------------------------------------------------
        QUALITY COUNTS
        -------------------------------------------------------
        */

        const currentMatchSources =
            normalized.sources.filter(
                source =>
                    source.relevance === "CURRENT_MATCH"
            );

        const recentSources =
            normalized.sources.filter(
                source =>
                    source.relevance === "RECENT"
            );

        const historicalSources =
            normalized.sources.filter(
                source =>
                    source.relevance === "HISTORICAL"
            );

        const futureSources =
            normalized.sources.filter(
                source =>
                    source.relevance === "FUTURE"
            );

        const irrelevantSources =
            normalized.sources.filter(
                source =>
                    source.relevance === "IRRELEVANT"
            );

        /*
        -------------------------------------------------------
        WARNINGS
        -------------------------------------------------------
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
                "Recent evidence was detected. Recent team information is separated from exact-match evidence."
            );
        }

        if (
            historicalSources.length > 0
        ) {

            normalized.warnings.push(
                "Historical information was detected. Historical evidence must not be treated as current-match information."
            );
        }

        if (
            futureSources.length > 0
        ) {

            normalized.warnings.push(
                "Future-dated information was detected and excluded from current-match evidence."
            );
        }

        if (
            normalized.injuries.unknown.length > 0
        ) {

            normalized.warnings.push(
                "Some injury sources could not be confidently attributed to one team."
            );
        }

        if (
            normalized.lineups.unknown.length > 0
        ) {

            normalized.warnings.push(
                "Some lineup sources could not be confidently attributed to one team."
            );
        }

        normalized.warnings.push(
            "Numerical statistics are not inferred when the source evidence is unclear."
        );

        normalized.warnings.push(
            "Odds are retained as evidence only until reliable numerical odds extraction is implemented."
        );

        /*
        -------------------------------------------------------
        FINAL RESPONSE
        -------------------------------------------------------
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
                    normalized.lineups.unknown.length,

                oddsEvidence:
                    normalized.oddsEvidence.length
            },

            analysisReady: {

                exactMatchEvidence:
                    currentMatchSources.length > 0,

                recentEvidence:
                    recentSources.length > 0,

                h2hEvidence:
                    normalized.h2h.length > 0,

                formEvidence:
                    normalized.formEvidence.home.length > 0 ||
                    normalized.formEvidence.away.length > 0,

                injuryEvidence:
                    normalized.injuries.home.length > 0 ||
                    normalized.injuries.away.length > 0,

                lineupEvidence:
                    !!normalized.lineups.home ||
                    !!normalized.lineups.away,

                statsEvidence:
                    normalized.statsEvidence.length > 0,

                oddsEvidence:
                    normalized.oddsEvidence.length > 0
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


/*
===============================================================
DATE FUNCTIONS
===============================================================
*/

function parseInputDate(value) {

    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (
        !isNaN(date.getTime())
    ) {
        return date;
    }

    return null;
}


function extractDates(text) {

    const dates = [];

    if (!text) {
        return dates;
    }

    /*
    -----------------------------------------------------------
    ISO DATE
    2026-09-30
    -----------------------------------------------------------
    */

    const isoRegex =
        /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;

    let match;

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

    /*
    -----------------------------------------------------------
    SLASH / DASH DATE
    30/09/2026
    30-09-2026
    -----------------------------------------------------------
    */

    const numericRegex =
        /\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/g;

    while (
        (match = numericRegex.exec(text)) !== null
    ) {

        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);

        const date =
            createUTCDate(
                year,
                month,
                day
            );

        if (date) {
            dates.push(date);
        }
    }

    /*
    -----------------------------------------------------------
    ENGLISH MONTH DATE

    September 30, 2026
    Sep 30, 2026
    30 September 2026
    30 Sep 2026
    -----------------------------------------------------------
    */

    const monthNames =
        "January|February|March|April|May|June|July|August|September|October|November|December";

    const monthShortNames =
        "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

    const monthRegex =
        new RegExp(
            "\\b(" +
            monthNames +
            "|" +
            monthShortNames +
            ")\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b",
            "gi"
        );

    while (
        (match = monthRegex.exec(text)) !== null
    ) {

        const month =
            monthNumber(match[1]);

        const day =
            Number(match[2]);

        const year =
            Number(match[3]);

        const date =
            createUTCDate(
                year,
                month,
                day
            );

        if (date) {
            dates.push(date);
        }
    }

    /*
    -----------------------------------------------------------
    REVERSE ENGLISH FORMAT

    30 September 2026
    30 Sep 2026
    -----------------------------------------------------------
    */

    const reverseMonthRegex =
        new RegExp(
            "\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" +
            monthNames +
            "|" +
            monthShortNames +
            ")[,]?\\s+(20\\d{2})\\b",
            "gi"
        );

    while (
        (match = reverseMonthRegex.exec(text)) !== null
    ) {

        const day =
            Number(match[1]);

        const month =
            monthNumber(match[2]);

        const year =
            Number(match[3]);

        const date =
            createUTCDate(
                year,
                month,
                day
            );

        if (date) {
            dates.push(date);
        }
    }

    return uniqueDates(dates);
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
    dateA,
    dateB
) {

    return (
        dateA.getUTCFullYear() ===
            dateB.getUTCFullYear() &&

        dateA.getUTCMonth() ===
            dateB.getUTCMonth() &&

        dateA.getUTCDate() ===
            dateB.getUTCDate()
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


function uniqueDates(dates) {

    const seen = new Set();

    const output = [];

    for (const date of dates) {

        const key =
            date.getTime();

        if (!seen.has(key)) {

            seen.add(key);

            output.push(date);
        }
    }

    return output;
}


function getNearestRelevantDate(
    dates,
    targetDate
) {

    if (
        !dates ||
        dates.length === 0
    ) {
        return null;
    }

    let nearest = null;

    let nearestDistance =
        Infinity;

    for (const date of dates) {

        const distance =
            Math.abs(
                date.getTime() -
                targetDate.getTime()
            );

        if (
            distance <
            nearestDistance
        ) {

            nearestDistance =
                distance;

            nearest =
                date;
        }
    }

    return nearest;
}


/*
===============================================================
TEXT / TEAM FUNCTIONS
===============================================================
*/

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

    /*
    Remove punctuation.
    */

    const simplified =
        original
            .replace(
                /[^a-z0-9\s]/g,
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

    /*
    O'Higgins -> o higgins
    */

    const noSpaces =
        simplified.replace(
            /\s+/g,
            ""
        );

    if (noSpaces) {
        aliases.add(noSpaces);
    }

    /*
    Common Deportes Concepcion naming variation.
    Only add it when the supplied team itself contains
    Concepcion, so we do not create unrelated aliases.
    */

    if (
        simplified.includes("concepcion")
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

    /*
    O'Higgins variations.
    */

    if (
        simplified.includes("o higgins") ||
        simplified.includes("ohiggins")
    ) {

        aliases.add(
            "o'higgins"
        );

        aliases.add(
            "o higgins"
        );

        aliases.add(
            "ohiggins"
        );
    }

    return Array.from(aliases);
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


/*
===============================================================
RELEVANCE CLASSIFICATION
===============================================================
*/

function classifyEvidence({
    type,
    text,
    title,
    homeMatch,
    awayMatch,
    exactTargetDate,
    nearestDate,
    targetDate
}) {

    let score = 0;

    /*
    -----------------------------------------------------------
    H2H IS HISTORICAL BY DEFAULT
    -----------------------------------------------------------
    */

    if (type === "h2h") {

        if (
            homeMatch &&
            awayMatch
        ) {

            return {
                relevance: "HISTORICAL",
                score: 70
            };
        }

        return {
            relevance: "IRRELEVANT",
            score: 0
        };
    }

    /*
    -----------------------------------------------------------
    BOTH TEAMS
    -----------------------------------------------------------
    */

    if (homeMatch) {
        score += 30;
    }

    if (awayMatch) {
        score += 30;
    }

    /*
    -----------------------------------------------------------
    EXACT TARGET DATE
    -----------------------------------------------------------
    */

    if (
        exactTargetDate &&
        homeMatch &&
        awayMatch
    ) {

        score += 40;

        return {
            relevance: "CURRENT_MATCH",
            score
        };
    }

    /*
    -----------------------------------------------------------
    NO DATE
    -----------------------------------------------------------
    */

    if (!nearestDate) {

        if (
            homeMatch ||
            awayMatch
        ) {

            /*
            Without a real date, we do not call it current.
            */

            return {
                relevance:
                    type === "h2h"
                        ? "HISTORICAL"
                        : "IRRELEVANT",
                score
            };
        }

        return {
            relevance: "IRRELEVANT",
            score: 0
        };
    }

    /*
    -----------------------------------------------------------
    DAYS FROM TARGET
    -----------------------------------------------------------
    */

    const diffDays =
        Math.round(
            (
                nearestDate.getTime() -
                targetDate.getTime()
            ) /
            (
                1000 *
                60 *
                60 *
                24
            )
        );

    /*
    -----------------------------------------------------------
    FUTURE
    -----------------------------------------------------------
    */

    if (
        diffDays > 0
    ) {

        return {
            relevance: "FUTURE",
            score
        };
    }

    /*
    -----------------------------------------------------------
    RECENT
    -----------------------------------------------------------

    45 days before the match is treated as recent evidence.
    */

    if (
        diffDays >= -45
    ) {

        if (
            homeMatch ||
            awayMatch
        ) {

            score += 20;

            return {
                relevance: "RECENT",
                score
            };
        }
    }

    /*
    -----------------------------------------------------------
    HISTORICAL
    -----------------------------------------------------------
    */

    if (
        diffDays < -45 &&
        (
            homeMatch ||
            awayMatch
        )
    ) {

        return {
            relevance: "HISTORICAL",
            score
        };
    }

    /*
    -----------------------------------------------------------
    DEFAULT
    -----------------------------------------------------------
    */

    return {
        relevance: "IRRELEVANT",
        score
    };
}


/*
===============================================================
TEAM ATTRIBUTION
===============================================================
*/

function inferTeamAttribution({
    text,
    title,
    homeAliases,
    awayAliases,
    homeMatch,
    awayMatch,
    type
}) {

    const homeScore =
        teamEvidenceScore(
            text,
            homeAliases
        );

    const awayScore =
        teamEvidenceScore(
            text,
            awayAliases
        );

    /*
    If only one team appears.
    */

    if (
        homeMatch &&
        !awayMatch
    ) {
        return "home";
    }

    if (
        awayMatch &&
        !homeMatch
    ) {
        return "away";
    }

    /*
    If both appear, compare their proximity
    to injury/lineup words.
    */

    const homeNear =
        hasTeamNearEvidenceWord(
            text,
            homeAliases
        );

    const awayNear =
        hasTeamNearEvidenceWord(
            text,
            awayAliases
        );

    if (
        homeNear &&
        !awayNear
    ) {
        return "home";
    }

    if (
        awayNear &&
        !homeNear
    ) {
        return "away";
    }

    /*
    If both have strong evidence, mark both.
    */

    if (
        homeNear &&
        awayNear
    ) {
        return "both";
    }

    /*
    If only one has a stronger textual presence.
    */

    if (
        homeScore >
        awayScore
    ) {
        return "home";
    }

    if (
        awayScore >
        homeScore
    ) {
        return "away";
    }

    /*
    Cannot safely attribute.
    */

    return "unknown";
}


function teamEvidenceScore(
    text,
    aliases
) {

    let score = 0;

    for (const alias of aliases) {

        if (!alias) {
            continue;
        }

        let index =
            text.indexOf(alias);

        while (index !== -1) {

            score++;

            index =
                text.indexOf(
                    alias,
                    index + alias.length
                );
        }
    }

    return score;
}


function hasTeamNearEvidenceWord(
    text,
    aliases
) {

    const evidenceWords = [
        "injury",
        "injured",
        "injuries",
        "suspended",
        "suspension",
        "unavailable",
        "doubtful",
        "out",
        "missing",
        "ruled out",
        "lineup",
        "starting xi",
        "starting eleven",
        "predicted lineup"
    ];

    for (const alias of aliases) {

        if (!alias) {
            continue;
        }

        let startIndex =
            text.indexOf(alias);

        while (
            startIndex !== -1
        ) {

            const start =
                Math.max(
                    0,
                    startIndex - 100
                );

            const end =
                Math.min(
                    text.length,
                    startIndex +
                    alias.length +
                    100
                );

            const nearby =
                text.substring(
                    start,
                    end
                );

            const hasEvidence =
                evidenceWords.some(
                    word =>
                        nearby.includes(word)
                );

            if (hasEvidence) {
                return true;
            }

            startIndex =
                text.indexOf(
                    alias,
                    startIndex + alias.length
                );
        }
    }

    return false;
}


/*
===============================================================
DEDUPLICATION
===============================================================
*/

function removeDuplicates(
    items,
    property
) {

    const seen = new Set();

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
