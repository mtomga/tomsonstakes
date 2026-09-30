export default async function handler(req, res) {
    try {

        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed. Use POST."
            });
        }

        const body = req.body || {};

        const {
            match,
            searches = [],
            allResults = []
        } = body;

        if (!match || !match.home || !match.away || !match.date) {
            return res.status(400).json({
                error: "match.home, match.away and match.date are required."
            });
        }

        const home = String(match.home).trim();
        const away = String(match.away).trim();
        const targetDate = parseDateSafe(match.date);

        if (!targetDate) {
            return res.status(400).json({
                error: "Invalid match date."
            });
        }

        const year = targetDate.getUTCFullYear();

        const normalized = {
            match: {
                home,
                away,
                date: formatISODate(targetDate),
                year
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
        ============================================================
        BUILD SOURCE LIST
        ============================================================
        */

        const sourceItems = [];

        if (Array.isArray(searches)) {

            for (const search of searches) {

                if (!search || !Array.isArray(search.results)) {
                    continue;
                }

                for (const item of search.results) {

                    sourceItems.push({
                        type: search.type || "unknown",
                        title: item.title || "",
                        link: item.link || "",
                        snippet: item.snippet || "",
                        publishedDate: item.date || null,
                        position: item.position || null
                    });
                }
            }
        }

        /*
        Some callers may only send allResults.
        */

        if (
            sourceItems.length === 0 &&
            Array.isArray(allResults)
        ) {

            for (const item of allResults) {

                sourceItems.push({
                    type: item.type || "unknown",
                    title: item.title || "",
                    link: item.link || "",
                    snippet: item.snippet || "",
                    publishedDate: item.date || null,
                    position: item.position || null
                });
            }
        }


        /*
        ============================================================
        PROCESS SOURCES
        ============================================================
        */

        const processedSources = [];

        for (const source of sourceItems) {

            const processed =
                processSource(
                    source,
                    home,
                    away,
                    targetDate
                );

            if (!processed) {
                continue;
            }

            processedSources.push(processed);

            normalized.sources.push({
                type: processed.type,
                source: processed.title,
                url: processed.link,
                snippet: processed.snippet,
                relevance: processed.relevance,
                eventDate: processed.eventDate
                    ? formatISODate(processed.eventDate)
                    : null,
                publishedDate: processed.publishedDate
                    ? formatISODate(processed.publishedDate)
                    : null,
                dateBasis: processed.dateBasis || null
            });


            /*
            ========================================================
            H2H
            ========================================================
            */

            if (
                processed.type === "h2h" &&
                isActualH2HSource(processed)
            ) {

                normalized.h2h.push({
                    source: processed.title,
                    url: processed.link,
                    snippet: processed.snippet,
                    relevance: processed.relevance
                });
            }


            /*
            ========================================================
            FORM
            ========================================================
            */

            if (
                processed.type === "form" &&
                (
                    processed.relevance === "CURRENT_MATCH" ||
                    processed.relevance === "RECENT"
                )
            ) {

                addFormEvidence(
                    normalized,
                    processed,
                    home,
                    away
                );
            }


            /*
            ========================================================
            STATS
            ========================================================
            */

            if (processed.type === "stats") {

                if (
                    processed.relevance === "CURRENT_MATCH" ||
                    processed.relevance === "RECENT"
                ) {

                    normalized.statsEvidence.push({
                        source: processed.title,
                        url: processed.link,
                        snippet: processed.snippet,
                        relevance: processed.relevance
                    });

                    extractStats(
                        normalized,
                        processed.snippet,
                        home,
                        away
                    );

                } else if (
                    processed.relevance === "UNDATED_TEAM_SOURCE"
                ) {

                    normalized.undatedStatsEvidence.push({
                        source: processed.title,
                        url: processed.link,
                        snippet: processed.snippet,
                        relevance: processed.relevance
                    });
                }
            }


            /*
            ========================================================
            INJURIES
            ========================================================
            */

            if (
                processed.type === "injuries" &&
                processed.relevance === "CURRENT_MATCH"
            ) {

                extractInjuryEvidence(
                    normalized,
                    processed,
                    home,
                    away
                );
            }


            /*
            ========================================================
            LINEUPS
            ========================================================
            */

            if (
                processed.type === "lineups" &&
                processed.relevance === "CURRENT_MATCH"
            ) {

                extractLineupEvidence(
                    normalized,
                    processed,
                    home,
                    away
                );
            }


            /*
            ========================================================
            ODDS
            ========================================================
            */

            if (processed.type === "odds") {

                if (
                    processed.relevance === "CURRENT_MATCH" ||
                    processed.relevance === "RECENT"
                ) {

                    normalized.oddsEvidence.push({
                        source: processed.title,
                        url: processed.link,
                        snippet: processed.snippet,
                        relevance: processed.relevance
                    });

                    extractOdds(
                        normalized,
                        processed.snippet
                    );

                } else if (
                    processed.relevance === "UNDATED_TEAM_SOURCE"
                ) {

                    normalized.undatedOddsEvidence.push({
                        source: processed.title,
                        url: processed.link,
                        snippet: processed.snippet,
                        relevance: processed.relevance
                    });
                }
            }
        }


        /*
        ============================================================
        REMOVE DUPLICATES
        ============================================================
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
            removeDuplicateStrings(
                normalized.injuries.home
            );

        normalized.injuries.away =
            removeDuplicateStrings(
                normalized.injuries.away
            );

        normalized.injuries.unknown =
            removeDuplicateStrings(
                normalized.injuries.unknown
            );


        /*
        ============================================================
        QUALITY / WARNINGS
        ============================================================
        */

        const quality = {
            totalSources: processedSources.length,

            currentMatchSources:
                processedSources.filter(
                    s => s.relevance === "CURRENT_MATCH"
                ).length,

            recentSources:
                processedSources.filter(
                    s => s.relevance === "RECENT"
                ).length,

            historicalSources:
                processedSources.filter(
                    s => s.relevance === "HISTORICAL"
                ).length,

            futureSources:
                processedSources.filter(
                    s => s.relevance === "FUTURE"
                ).length,

            undatedTeamSources:
                processedSources.filter(
                    s => s.relevance === "UNDATED_TEAM_SOURCE"
                ).length,

            irrelevantSources:
                processedSources.filter(
                    s => s.relevance === "IRRELEVANT"
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

            lineupEvidence:
                normalized.lineups.matchEvidence.length,

            oddsEvidence:
                normalized.oddsEvidence.length,

            undatedOddsEvidence:
                normalized.undatedOddsEvidence.length
        };


        if (quality.recentSources > 0) {

            normalized.warnings.push(
                "Recent evidence was detected and separated from exact-match evidence."
            );
        }

        if (quality.historicalSources > 0) {

            normalized.warnings.push(
                "Historical evidence was detected and must not be treated as current-match information."
            );
        }

        if (quality.futureSources > 0) {

            normalized.warnings.push(
                "Future fixture or future-dated information was detected and excluded from current-match evidence."
            );
        }

        if (quality.undatedTeamSources > 0) {

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
            normalized.lineups.matchEvidence.length === 0
        ) {

            normalized.warnings.push(
                "No current-match lineup evidence was confidently identified."
            );
        }

        if (
            normalized.odds.home === null &&
            normalized.odds.draw === null &&
            normalized.odds.away === null &&
            normalized.oddsEvidence.length === 0
        ) {

            normalized.warnings.push(
                "No date-qualified odds evidence was found."
            );
        }


        /*
        ============================================================
        ANALYSIS READY
        ============================================================
        */

        const analysisReady = {

            exactMatchEvidence:
                quality.currentMatchSources > 0,

            recentEvidence:
                quality.recentSources > 0,

            h2hEvidence:
                normalized.h2h.length > 0,

            formEvidence:
                quality.formEvidence > 0,

            injuryEvidence:
                quality.injuryEvidence > 0,

            lineupEvidence:
                quality.lineupEvidence > 0,

            statsEvidence:
                quality.statsEvidence > 0,

            oddsEvidence:
                quality.oddsEvidence > 0
        };


        return res.status(200).json({

            success: true,

            normalized,

            quality,

            analysisReady
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
====================================================================
SOURCE PROCESSING
====================================================================
*/

function processSource(
    source,
    home,
    away,
    targetDate
) {

    const type =
        String(source.type || "unknown")
            .toLowerCase();

    const title =
        String(source.title || "");

    const snippet =
        String(source.snippet || "");

    const link =
        String(source.link || "");

    const publishedDate =
        parseDateSafe(source.publishedDate);

    const combined =
        `${title} ${snippet}`;

    const homeMatch =
        containsTeam(combined, home);

    const awayMatch =
        containsTeam(combined, away);

    if (!homeMatch && !awayMatch) {
        return {
            ...source,
            type,
            title,
            snippet,
            link,
            publishedDate,
            eventDate: null,
            dateBasis: null,
            relevance: "IRRELEVANT"
        };
    }


    /*
    ---------------------------------------------------------------
    Extract event dates.
    ---------------------------------------------------------------
    */

    const dateInfo =
        extractLikelyEventDates(
            title,
            snippet,
            link,
            home,
            away
        );

    const eventDates =
        dateInfo.dates;

    const eventDate =
        chooseEventDate(
            eventDates,
            targetDate
        );


    /*
    ---------------------------------------------------------------
    Current match.
    
    Exact target date + both teams is strong evidence.
    ---------------------------------------------------------------
    */

    const exactTargetDate =
        eventDates.some(
            d => sameDate(d, targetDate)
        );

    if (
        exactTargetDate &&
        homeMatch &&
        awayMatch
    ) {

        return {
            ...source,
            type,
            title,
            snippet,
            link,
            publishedDate,
            eventDate: targetDate,
            dateBasis: dateInfo.basis || "EVENT_DATE",
            relevance: "CURRENT_MATCH"
        };
    }


    /*
    ---------------------------------------------------------------
    Future date.
    ---------------------------------------------------------------
    */

    if (
        eventDate &&
        eventDate > targetDate
    ) {

        return {
            ...source,
            type,
            title,
            snippet,
            link,
            publishedDate,
            eventDate,
            dateBasis: dateInfo.basis || "EVENT_DATE",
            relevance: "FUTURE"
        };
    }


    /*
    ---------------------------------------------------------------
    Historical event.
    ---------------------------------------------------------------
    */

    if (
        eventDate &&
        eventDate < targetDate
    ) {

        return {
            ...source,
            type,
            title,
            snippet,
            link,
            publishedDate,
            eventDate,
            dateBasis: dateInfo.basis || "EVENT_DATE",
            relevance: "HISTORICAL"
        };
    }


    /*
    ---------------------------------------------------------------
    H2H pages are inherently historical evidence.
    ---------------------------------------------------------------
    */

    if (
        type === "h2h" &&
        isActualH2HText(combined)
    ) {

        return {
            ...source,
            type,
            title,
            snippet,
            link,
            publishedDate,
            eventDate,
            dateBasis: dateInfo.basis || null,
            relevance: "HISTORICAL"
        };
    }


    /*
    ---------------------------------------------------------------
    If publication date is known, determine whether source is recent.
    ---------------------------------------------------------------
    */

    if (publishedDate) {

        const ageDays =
            daysBetween(
                publishedDate,
                targetDate
            );

        if (
            ageDays >= 0 &&
            ageDays <= 30
        ) {

            return {
                ...source,
                type,
                title,
                snippet,
                link,
                publishedDate,
                eventDate: null,
                dateBasis: "PUBLICATION_DATE",
                relevance: "RECENT"
            };
        }

        if (ageDays > 30) {

            return {
                ...source,
                type,
                title,
                snippet,
                link,
                publishedDate,
                eventDate: null,
                dateBasis: "PUBLICATION_DATE",
                relevance: "HISTORICAL"
            };
        }
    }


    /*
    ---------------------------------------------------------------
    Team source with no reliable date.
    
    IMPORTANT:
    Do NOT call this RECENT.
    ---------------------------------------------------------------
    */

    if (
        homeMatch ||
        awayMatch
    ) {

        return {
            ...source,
            type,
            title,
            snippet,
            link,
            publishedDate,
            eventDate: null,
            dateBasis: null,
            relevance: "UNDATED_TEAM_SOURCE"
        };
    }


    return {
        ...source,
        type,
        title,
        snippet,
        link,
        publishedDate,
        eventDate: null,
        dateBasis: null,
        relevance: "IRRELEVANT"
    };
}


/*
====================================================================
DATE EXTRACTION
====================================================================
*/

function extractLikelyEventDates(
    title,
    snippet,
    link,
    home,
    away
) {

    const text =
        `${title} ${snippet}`;

    const dates = [];

    const fullTextDates =
        extractDates(text);

    for (const d of fullTextDates) {
        dates.push(d);
    }


    /*
    URLs can contain useful explicit fixture dates,
    but we treat URL dates separately.
    */

    const urlDates =
        extractDatesFromUrl(link);

    for (const d of urlDates) {
        dates.push(d);
    }


    /*
    If both teams are mentioned and an exact date exists,
    that date is strong event evidence.

    This specifically fixes pages such as:

    "Wed, Sep 30, 2026, 23:00 UTC"
    */

    const hasBothTeams =
        containsTeam(text, home) &&
        containsTeam(text, away);

    if (hasBothTeams) {

        const targetLikeDates =
            extractDates(text);

        for (const d of targetLikeDates) {
            dates.push(d);
        }
    }


    const unique =
        uniqueDates(dates);

    let basis = null;

    if (unique.length > 0) {
        basis = "TEXT_DATE";
    }

    if (
        unique.length === 0 &&
        urlDates.length > 0
    ) {
        basis = "URL_DATE";
    }

    return {
        dates: unique,
        basis
    };
}


function extractDates(text) {

    const dates = [];

    if (!text) {
        return dates;
    }


    /*
    ---------------------------------------------------------------
    YYYY-MM-DD
    ---------------------------------------------------------------
    */

    const isoRegex =
        /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;

    let match;

    while (
        (match = isoRegex.exec(text)) !== null
    ) {

        const date =
            makeUTCDate(
                Number(match[1]),
                Number(match[2]),
                Number(match[3])
            );

        if (date) {
            dates.push(date);
        }
    }


    /*
    ---------------------------------------------------------------
    Month names:
    
    September 30, 2026
    Sep 30, 2026
    30 September 2026
    30 Sep 2026
    Wed, Sep 30, 2026
    ---------------------------------------------------------------
    */

    const monthNames = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12
    };

    const monthShort = {
        jan: 1,
        feb: 2,
        mar: 3,
        apr: 4,
        may: 5,
        jun: 6,
        jul: 7,
        aug: 8,
        sep: 9,
        oct: 10,
        nov: 11,
        dec: 12
    };


    /*
    Month Day, Year
    */

    const monthDayRegex =
        /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/gi;

    while (
        (match = monthDayRegex.exec(text)) !== null
    ) {

        const monthName =
            match[1].toLowerCase();

        const month =
            monthNames[monthName] ||
            monthShort[monthName];

        const day =
            Number(match[2]);

        const year =
            Number(match[3]);

        const date =
            makeUTCDate(
                year,
                month,
                day
            );

        if (date) {
            dates.push(date);
        }
    }


    /*
    Day Month Year
    */

    const dayMonthRegex =
        /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[,]?\s+(20\d{2})\b/gi;

    while (
        (match = dayMonthRegex.exec(text)) !== null
    ) {

        const day =
            Number(match[1]);

        const monthName =
            match[2].toLowerCase();

        const month =
            monthNames[monthName] ||
            monthShort[monthName];

        const year =
            Number(match[3]);

        const date =
            makeUTCDate(
                year,
                month,
                day
            );

        if (date) {
            dates.push(date);
        }
    }


    /*
    ---------------------------------------------------------------
    Numeric dates.
    
    Handles:
    
    30/09/2026
    30-09-2026
    07/26/2026
    07-26-2026
    
    If second number > 12, assume MM/DD.
    If first number > 12, assume DD/MM.
    ---------------------------------------------------------------
    */

    const numericRegex =
        /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/g;

    while (
        (match = numericRegex.exec(text)) !== null
    ) {

        const first =
            Number(match[1]);

        const second =
            Number(match[2]);

        const year =
            Number(match[3]);

        let day;
        let month;


        if (first > 12) {

            /*
            DD/MM/YYYY
            */

            day = first;
            month = second;

        } else if (second > 12) {

            /*
            MM/DD/YYYY
            */

            month = first;
            day = second;

        } else {

            /*
            Ambiguous.
            Default to DD/MM because football
            sources commonly use that convention.
            */

            day = first;
            month = second;
        }


        const date =
            makeUTCDate(
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


function extractDatesFromUrl(url) {

    if (!url) {
        return [];
    }

    return extractDates(url);
}


/*
====================================================================
DATE HELPERS
====================================================================
*/

function makeUTCDate(
    year,
    month,
    day
) {

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day)
    ) {
        return null;
    }

    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
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


function parseDateSafe(value) {

    if (!value) {
        return null;
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate()
        )
    );
}


function formatISODate(date) {

    if (!date) {
        return null;
    }

    return date
        .toISOString()
        .slice(0, 10);
}


function sameDate(
    a,
    b
) {

    if (!a || !b) {
        return false;
    }

    return (
        a.getUTCFullYear() ===
            b.getUTCFullYear() &&

        a.getUTCMonth() ===
            b.getUTCMonth() &&

        a.getUTCDate() ===
            b.getUTCDate()
    );
}


function daysBetween(
    older,
    newer
) {

    const diff =
        newer.getTime() -
        older.getTime();

    return Math.floor(
        diff / 86400000
    );
}


function chooseEventDate(
    dates,
    targetDate
) {

    if (
        !Array.isArray(dates) ||
        dates.length === 0
    ) {
        return null;
    }

    for (const date of dates) {

        if (
            sameDate(
                date,
                targetDate
            )
        ) {
            return date;
        }
    }

    /*
    Prefer the date closest to target.
    */

    let best = null;
    let bestDistance = Infinity;

    for (const date of dates) {

        const distance =
            Math.abs(
                date.getTime() -
                targetDate.getTime()
            );

        if (
            distance <
            bestDistance
        ) {

            best = date;
            bestDistance = distance;
        }
    }

    return best;
}


function uniqueDates(
    dates
) {

    const seen =
        new Set();

    const output = [];

    for (const date of dates) {

        if (
            !(date instanceof Date) ||
            Number.isNaN(
                date.getTime()
            )
        ) {
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


/*
====================================================================
TEAM MATCHING
====================================================================
*/

function containsTeam(
    text,
    team
) {

    if (!text || !team) {
        return false;
    }

    const normalizedText =
        normalizeTeamName(text);

    const normalizedTeam =
        normalizeTeamName(team);

    if (!normalizedTeam) {
        return false;
    }

    return normalizedText.includes(
        normalizedTeam
    );
}


function normalizeTeamName(
    value
) {

    return String(value || "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^\p{L}\p{N}]+/gu, "")
        .replace(
            /footballclub|fc|cf|club|deportes|cd/g,
            ""
        );
}


/*
====================================================================
H2H
====================================================================
*/

function isActualH2HSource(
    source
) {

    return isActualH2HText(
        `${source.title} ${source.snippet}`
    );
}


function isActualH2HText(
    text
) {

    const lower =
        String(text || "")
            .toLowerCase();

    const h2hTerms = [
        "head to head",
        "head-to-head",
        "h2h",
        "previous meetings",
        "past meetings",
        "past 5 meetings",
        "last 5 head",
        "recent head-to-head",
        "h2h stats",
        "head to head record"
    ];

    return h2hTerms.some(
        term =>
            lower.includes(term)
    );
}


/*
====================================================================
FORM
====================================================================
*/

function addFormEvidence(
    normalized,
    processed,
    home,
    away
) {

    const text =
        `${processed.title} ${processed.snippet}`;

    const lower =
        text.toLowerCase();

    const homePresent =
        containsTeam(text, home);

    const awayPresent =
        containsTeam(text, away);

    /*
    Do not manufacture form records.
    Only preserve evidence.
    */

    const evidence = {
        source: processed.title,
        url: processed.link,
        snippet: processed.snippet,
        relevance: processed.relevance
    };

    if (
        homePresent &&
        !awayPresent
    ) {

        normalized.formEvidence.home.push(
            evidence
        );

    } else if (
        awayPresent &&
        !homePresent
    ) {

        normalized.formEvidence.away.push(
            evidence
        );

    } else if (
        lower.includes("recent form") &&
        homePresent &&
        awayPresent
    ) {

        /*
        Match-level form page.
        Do not assign the same evidence to both teams.
        */

        normalized.formEvidence.home.push({
            ...evidence,
            attribution: "MATCH_LEVEL"
        });

        normalized.formEvidence.away.push({
            ...evidence,
            attribution: "MATCH_LEVEL"
        });
    }
}


/*
====================================================================
INJURIES
====================================================================
*/

function extractInjuryEvidence(
    normalized,
    processed,
    home,
    away
) {

    const text =
        processed.snippet || "";

    const sentences =
        splitSentences(text);

    let found = false;

    for (const sentence of sentences) {

        const lower =
            sentence.toLowerCase();

        const injuryWords = [
            "injured",
            "injury",
            "injuries",
            "unavailable",
            "suspended",
            "suspension",
            "doubt",
            "doubtful",
            "miss",
            "missing",
            "out",
            "ruled out",
            "absent"
        ];

        const hasInjuryWord =
            injuryWords.some(
                word =>
                    lower.includes(word)
            );

        if (!hasInjuryWord) {
            continue;
        }

        const homeMention =
            containsTeam(
                sentence,
                home
            );

        const awayMention =
            containsTeam(
                sentence,
                away
            );


        if (
            homeMention &&
            !awayMention
        ) {

            normalized.injuries.home.push(
                sentence.trim()
            );

            found = true;

        } else if (
            awayMention &&
            !homeMention
        ) {

            normalized.injuries.away.push(
                sentence.trim()
            );

            found = true;

        } else {

            normalized.injuries.unknown.push(
                sentence.trim()
            );

            found = true;
        }
    }


    /*
    Some pages name a team once, then list players
    in subsequent sentences. Keep ambiguous evidence
    in unknown instead of guessing.
    */

    if (!found) {

        const lower =
            text.toLowerCase();

        if (
            lower.includes("injur") ||
            lower.includes("suspend") ||
            lower.includes("unavailable")
        ) {

            normalized.injuries.unknown.push(
                text.trim()
            );
        }
    }
}


/*
====================================================================
LINEUPS
====================================================================
*/

function extractLineupEvidence(
    normalized,
    processed,
    home,
    away
) {

    const evidence = {
        source: processed.title,
        url: processed.link,
        snippet: processed.snippet,
        relevance: processed.relevance
    };

    const text =
        `${processed.title} ${processed.snippet}`;

    const homePresent =
        containsTeam(text, home);

    const awayPresent =
        containsTeam(text, away);

    /*
    Current match page naming both teams:
    keep as match-level evidence.
    */

    if (
        homePresent &&
        awayPresent
    ) {

        normalized.lineups.matchEvidence.push(
            evidence
        );

        return;
    }


    if (homePresent) {

        normalized.lineups.home = evidence;

        return;
    }


    if (awayPresent) {

        normalized.lineups.away = evidence;

        return;
    }


    normalized.lineups.unknown.push(
        evidence
    );
}


/*
====================================================================
STATISTICS
====================================================================
*/

function extractStats(
    normalized,
    text,
    home,
    away
) {

    if (!text) {
        return;
    }

    /*
    IMPORTANT:
    Only extract very explicit numbers.
    Never invent missing statistics.
    */

    const lower =
        text.toLowerCase();


    /*
    Goals
    */

    const homeGoals =
        extractExplicitTeamAverage(
            text,
            home,
            [
                "goals per match",
                "goals per game"
            ]
        );

    const awayGoals =
        extractExplicitTeamAverage(
            text,
            away,
            [
                "goals per match",
                "goals per game"
            ]
        );

    if (homeGoals !== null) {

        normalized.goals.home =
            homeGoals;
    }

    if (awayGoals !== null) {

        normalized.goals.away =
            awayGoals;
    }


    /*
    xG
    */

    const xgMatches =
        text.match(
            /\b(?:xg|expected goals)\s*[:=]?\s*(\d+(?:\.\d+)?)/gi
        );

    if (
        xgMatches &&
        xgMatches.length === 1
    ) {

        const value =
            parseFloat(
                xgMatches[0]
                    .match(
                        /\d+(?:\.\d+)/
                    )[0]
            );

        /*
        A single xG number cannot safely be
        assigned to home or away.
        Therefore leave fields null.
        */
        void value;
    }


    /*
    Over 2.5
    */

    const over25 =
        extractPercentageNear(
            text,
            [
                "over 2.5",
                "over2.5",
                "over 2,5"
            ]
        );

    if (over25 !== null) {

        normalized.overUnder.over25 =
            over25;
    }


    /*
    BTTS
    */

    const btts =
        extractPercentageNear(
            text,
            [
                "btts",
                "both teams to score"
            ]
        );

    if (btts !== null) {

        normalized.btts.h2h =
            btts;
    }
}


function extractExplicitTeamAverage(
    text,
    team,
    phrases
) {

    const normalizedText =
        String(text || "");

    const teamName =
        String(team || "");

    if (
        !teamName ||
        !containsTeam(
            normalizedText,
            teamName
        )
    ) {
        return null;
    }

    for (const phrase of phrases) {

        const regex =
            new RegExp(
                `${escapeRegex(teamName)}[\\s\\S]{0,100}?${escapeRegex(phrase)}[^0-9]{0,20}(\\d+(?:\\.\\d+)?)`,
                "i"
            );

        const match =
            normalizedText.match(
                regex
            );

        if (match) {

            return parseFloat(
                match[1]
            );
        }
    }

    return null;
}


function extractPercentageNear(
    text,
    phrases
) {

    for (const phrase of phrases) {

        const regex =
            new RegExp(
                escapeRegex(phrase) +
                "[^0-9]{0,30}(\\d+(?:\\.\\d+)?)\\s*%",
                "i"
            );

        const match =
            text.match(regex);

        if (match) {

            return parseFloat(
                match[1]
            );
        }
    }

    return null;
}


/*
====================================================================
ODDS
====================================================================
*/

function extractOdds(
    normalized,
    text
) {

    if (!text) {
        return;
    }


    /*
    Decimal 1X2 pattern:
    
    Home 2.10
    Draw 3.20
    Away 3.40
    
    Only extract when labels are close
    to the number.
    */

    const home =
        extractDecimalAfterLabel(
            text,
            [
                "home",
                "1"
            ]
        );

    const draw =
        extractDecimalAfterLabel(
            text,
            [
                "draw",
                "x"
            ]
        );

    const away =
        extractDecimalAfterLabel(
            text,
            [
                "away",
                "2"
            ]
        );

    /*
    We deliberately do not accept bare numbers
    as 1X2 odds because that creates false positives.
    */

    if (
        home !== null &&
        home >= 1 &&
        home <= 100
    ) {
        normalized.odds.home =
            home;
    }

    if (
        draw !== null &&
        draw >= 1 &&
        draw <= 100
    ) {
        normalized.odds.draw =
            draw;
    }

    if (
        away !== null &&
        away >= 1 &&
        away <= 100
    ) {
        normalized.odds.away =
            away;
    }


    const over25 =
        extractDecimalAfterLabel(
            text,
            [
                "over 2.5",
                "over 2,5",
                "over2.5"
            ]
        );

    const under25 =
        extractDecimalAfterLabel(
            text,
            [
                "under 2.5",
                "under 2,5",
                "under2.5"
            ]
        );

    if (over25 !== null) {

        normalized.odds.over25 =
            over25;
    }

    if (under25 !== null) {

        normalized.odds.under25 =
            under25;
    }
}


function extractDecimalAfterLabel(
    text,
    labels
) {

    for (const label of labels) {

        const regex =
            new RegExp(
                escapeRegex(label) +
                "[^0-9]{0,20}(\\d+(?:\\.\\d+)?)",
                "i"
            );

        const match =
            text.match(regex);

        if (match) {

            return parseFloat(
                match[1]
            );
        }
    }

    return null;
}


/*
====================================================================
STRING HELPERS
====================================================================
*/

function splitSentences(
    text
) {

    return String(text || "")
        .split(/[.!?]+/)
        .map(
            sentence =>
                sentence.trim()
        )
        .filter(Boolean);
}


function escapeRegex(
    value
) {

    return String(value || "")
        .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
}


function removeDuplicateStrings(
    items
) {

    return [
        ...new Set(
            items.filter(Boolean)
        )
    ];
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


function removeDuplicateEvidence(
    items
) {

    const seen =
        new Set();

    return items.filter(
        item => {

            const key =
                `${item.source}|${item.url}|${item.snippet}`;

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);

            return true;
        }
    );
}
