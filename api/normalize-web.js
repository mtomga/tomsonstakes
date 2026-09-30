export default async function handler(req, res) {
    try {

        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed. Use POST."
            });
        }

        /*
        ============================================================
        TOMSONSTAKES
        WEB DATA NORMALIZER V3.2
        ============================================================

        PURPOSE
        -------
        Converts raw Serper/web-data results into structured,
        date-aware football evidence.

        IMPORTANT PRINCIPLES
        --------------------
        1. Current-match evidence must refer to THIS fixture.
        2. Historical H2H is allowed, but never becomes current data.
        3. Future fixtures are excluded from current analysis.
        4. Generic team pages are NOT automatically current.
        5. Publication date and event date are stored separately.
        6. Universidad de Concepcion is NOT the same as
           Deportes Concepcion.
        7. Missing statistics are null, never guessed.
        8. Prediction percentages from websites are not automatically
           treated as TomsonStakes model probabilities.
        9. Lineups and injuries require stronger attribution.
        ============================================================
        */


        // =========================================================
        // 1. READ REQUEST BODY
        // =========================================================

        let body = req.body;

        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch (error) {
                return res.status(400).json({
                    error: "Request body must contain valid JSON."
                });
            }
        }

        if (!body || typeof body !== "object") {
            return res.status(400).json({
                error: "Request body is missing or invalid."
            });
        }


        /*
        ------------------------------------------------------------
        The test page sends the entire /api/web-data response.

        Expected:
        {
            match: {
                home,
                away,
                date
            },
            searches: [...]
        }

        We also support:
        {
            home,
            away,
            date,
            searches: [...]
        }
        ------------------------------------------------------------
        */

        const inputMatch =
            body.match || {};

        const home =
            cleanString(
                inputMatch.home ||
                body.home
            );

        const away =
            cleanString(
                inputMatch.away ||
                body.away
            );

        const targetDate =
            normalizeISODate(
                inputMatch.date ||
                body.date
            );


        if (!home || !away || !targetDate) {
            return res.status(400).json({
                error:
                    "match.home, match.away and match.date are required."
            });
        }


        const targetYear =
            Number(
                targetDate.substring(0, 4)
            );


        // =========================================================
        // 2. COLLECT RAW SEARCH RESULTS
        // =========================================================

        const rawSearches =
            Array.isArray(body.searches)
                ? body.searches
                : [];

        const rawAllResults =
            Array.isArray(body.allResults)
                ? body.allResults
                : [];


        let rawSources = [];


        /*
        ------------------------------------------------------------
        Prefer searches because they retain the search type.

        If searches are absent, fall back to allResults.
        ------------------------------------------------------------
        */

        for (const search of rawSearches) {

            const type =
                cleanString(
                    search.type
                ) || "unknown";

            const results =
                Array.isArray(search.results)
                    ? search.results
                    : [];

            for (const item of results) {

                rawSources.push({
                    type,
                    source:
                        cleanString(
                            item.title
                        ),

                    url:
                        cleanString(
                            item.link
                        ),

                    snippet:
                        cleanString(
                            item.snippet
                        ),

                    date:
                        cleanString(
                            item.date
                        ),

                    position:
                        item.position ||
                        null
                });
            }
        }


        /*
        ------------------------------------------------------------
        If searches produced nothing, use allResults.
        ------------------------------------------------------------
        */

        if (rawSources.length === 0) {

            for (const item of rawAllResults) {

                rawSources.push({
                    type:
                        cleanString(
                            item.type
                        ) || "unknown",

                    source:
                        cleanString(
                            item.title
                        ),

                    url:
                        cleanString(
                            item.link
                        ),

                    snippet:
                        cleanString(
                            item.snippet
                        ),

                    date:
                        cleanString(
                            item.date
                        ),

                    position:
                        item.position ||
                        null
                });
            }
        }


        // =========================================================
        // 3. TEAM IDENTITY
        // =========================================================

        /*
        ------------------------------------------------------------
        IMPORTANT:

        "Concepcion" can represent Deportes Concepcion.

        BUT:

        "Universidad de Concepcion"

        is a DIFFERENT club and must NOT automatically be treated
        as Deportes Concepcion.
        ------------------------------------------------------------
        */

        const homeIdentity =
            buildTeamIdentity(
                home,
                "home"
            );

        const awayIdentity =
            buildTeamIdentity(
                away,
                "away"
            );


        // =========================================================
        // 4. NORMALIZE SOURCES
        // =========================================================

        const normalizedSources = [];


        for (const raw of rawSources) {

            const normalized =
                normalizeSource(
                    raw,
                    homeIdentity,
                    awayIdentity,
                    targetDate
                );

            if (normalized) {
                normalizedSources.push(
                    normalized
                );
            }
        }


        // =========================================================
        // 5. DEDUPLICATE SOURCES
        // =========================================================

        const sources =
            removeDuplicateEvidence(
                normalizedSources
            );


        // =========================================================
        // 6. CONTAINERS
        // =========================================================

        const formEvidence = {
            home: [],
            away: []
        };

        const h2h = [];

        const statsEvidence = [];

        const undatedStatsEvidence = [];

        const injuries = {
            home: [],
            away: [],
            unknown: []
        };

        const lineups = {
            home: null,
            away: null,
            matchEvidence: [],
            unknown: []
        };

        const oddsEvidence = [];

        const undatedOddsEvidence = [];


        // =========================================================
        // 7. PROCESS EACH SOURCE
        // =========================================================

        for (const item of sources) {

            const type =
                item.type;

            /*
            --------------------------------------------------------
            H2H
            --------------------------------------------------------
            */

            if (
                type === "h2h" &&
                isActualH2HSource(item)
            ) {

                /*
                Current fixture pages containing H2H language
                are NOT themselves historical H2H evidence.

                They can describe past H2H, but we keep them as
                H2H source context rather than a historical result.
                */

                h2h.push({
                    source: item.source,
                    url: item.url,
                    snippet: item.snippet,
                    relevance:
                        item.relevance,
                    dataRelevance:
                        item.eventDate &&
                        item.eventDate < targetDate
                            ? "HISTORICAL_H2H"
                            : "H2H_CONTEXT",
                    eventDate:
                        item.eventDate,
                    publishedDate:
                        item.publishedDate
                });

                continue;
            }


            /*
            --------------------------------------------------------
            FORM
            --------------------------------------------------------
            */

            if (
                type === "form" ||
                type === "stats"
            ) {

                const formMatches =
                    extractFormResults(
                        item,
                        homeIdentity,
                        awayIdentity,
                        targetDate
                    );


                for (const result of formMatches) {

                    if (
                        result.team === "home"
                    ) {
                        formEvidence.home.push(
                            result
                        );
                    }

                    if (
                        result.team === "away"
                    ) {
                        formEvidence.away.push(
                            result
                        );
                    }
                }
            }


            /*
            --------------------------------------------------------
            STATISTICS
            --------------------------------------------------------
            */

            if (type === "stats") {

                if (
                    item.relevance ===
                    "CURRENT_MATCH"
                ) {

                    if (
                        isStrongCurrentStatsSource(
                            item,
                            homeIdentity,
                            awayIdentity
                        )
                    ) {

                        statsEvidence.push(
                            item
                        );
                    }

                } else if (
                    item.relevance ===
                    "UNDATED_TEAM_SOURCE"
                ) {

                    if (
                        isUsefulUndatedStatsSource(
                            item,
                            homeIdentity,
                            awayIdentity
                        )
                    ) {

                        undatedStatsEvidence.push(
                            item
                        );
                    }
                }
            }


            /*
            --------------------------------------------------------
            INJURIES
            --------------------------------------------------------
            */

            if (type === "injuries") {

                const injuryEvidence =
                    extractCurrentInjuries(
                        item,
                        homeIdentity,
                        awayIdentity,
                        targetDate
                    );


                for (
                    const injury
                    of injuryEvidence
                ) {

                    if (
                        injury.team === "home"
                    ) {

                        injuries.home.push(
                            injury
                        );

                    } else if (
                        injury.team === "away"
                    ) {

                        injuries.away.push(
                            injury
                        );

                    } else {

                        injuries.unknown.push(
                            injury
                        );
                    }
                }
            }


            /*
            --------------------------------------------------------
            LINEUPS
            --------------------------------------------------------
            */

            if (type === "lineups") {

                if (
                    isStrongCurrentLineupSource(
                        item,
                        homeIdentity,
                        awayIdentity
                    )
                ) {

                    lineups.matchEvidence.push(
                        item
                    );
                }
            }


            /*
            --------------------------------------------------------
            ODDS
            --------------------------------------------------------
            */

            if (type === "odds") {

                if (
                    item.relevance ===
                    "CURRENT_MATCH"
                ) {

                    if (
                        isStrongCurrentOddsSource(
                            item,
                            homeIdentity,
                            awayIdentity
                        )
                    ) {

                        oddsEvidence.push(
                            item
                        );
                    }

                } else if (
                    item.relevance ===
                    "UNDATED_TEAM_SOURCE"
                ) {

                    if (
                        isUsefulUndatedOddsSource(
                            item,
                            homeIdentity,
                            awayIdentity
                        )
                    ) {

                        undatedOddsEvidence.push(
                            item
                        );
                    }
                }
            }
        }


        // =========================================================
        // 8. DEDUPLICATE EVIDENCE
        // =========================================================

        formEvidence.home =
            removeDuplicateEvidence(
                formEvidence.home
            );

        formEvidence.away =
            removeDuplicateEvidence(
                formEvidence.away
            );

        const cleanH2H =
            removeDuplicateEvidence(
                h2h
            );

        const cleanStats =
            removeDuplicateEvidence(
                statsEvidence
            );

        const cleanUndatedStats =
            removeDuplicateEvidence(
                undatedStatsEvidence
            );

        injuries.home =
            removeDuplicateEvidence(
                injuries.home
            );

        injuries.away =
            removeDuplicateEvidence(
                injuries.away
            );

        injuries.unknown =
            removeDuplicateEvidence(
                injuries.unknown
            );

        lineups.matchEvidence =
            removeDuplicateEvidence(
                lineups.matchEvidence
            );

        const cleanOdds =
            removeDuplicateEvidence(
                oddsEvidence
            );

        const cleanUndatedOdds =
            removeDuplicateEvidence(
                undatedOddsEvidence
            );


        // =========================================================
        // 9. STRUCTURED STAT EXTRACTION
        // =========================================================

        const extractedStats =
            extractStructuredStats(
                cleanStats,
                homeIdentity,
                awayIdentity
            );


        // =========================================================
        // 10. STRUCTURED ODDS EXTRACTION
        // =========================================================

        const extractedOdds =
            extractStructuredOdds(
                cleanOdds,
                homeIdentity,
                awayIdentity
            );


        // =========================================================
        // 11. CURRENT LINEUP EXTRACTION
        // =========================================================

        const lineupResult =
            extractLineupEvidence(
                lineups.matchEvidence,
                homeIdentity,
                awayIdentity
            );


        lineups.home =
            lineupResult.home;

        lineups.away =
            lineupResult.away;

        lineups.matchEvidence =
            lineupResult.matchEvidence;

        lineups.unknown =
            lineupResult.unknown;


        // =========================================================
        // 12. BUILD WARNINGS
        // =========================================================

        const warnings = [];


        const historicalCount =
            sources.filter(
                item =>
                    item.relevance ===
                    "HISTORICAL"
            ).length;


        const futureCount =
            sources.filter(
                item =>
                    item.relevance ===
                    "FUTURE"
            ).length;


        const undatedCount =
            sources.filter(
                item =>
                    item.relevance ===
                    "UNDATED_TEAM_SOURCE"
            ).length;


        if (historicalCount > 0) {

            warnings.push(
                "Historical evidence was detected and must not be treated as current-match information."
            );
        }


        if (futureCount > 0) {

            warnings.push(
                "Future fixture or future-dated information was detected and excluded from current-match evidence."
            );
        }


        if (undatedCount > 0) {

            warnings.push(
                "Some team-related sources had no reliable event date and were kept separately instead of being treated as recent."
            );
        }


        if (
            cleanStats.length === 0
        ) {

            warnings.push(
                "No date-qualified statistical evidence was found."
            );
        }


        if (
            injuries.home.length === 0 &&
            injuries.away.length === 0
        ) {

            warnings.push(
                "No current-match injury evidence was confidently attributed."
            );
        }


        if (
            lineups.home === null &&
            lineups.away === null &&
            lineups.matchEvidence.length === 0
        ) {

            warnings.push(
                "No current-match lineup evidence was confidently identified."
            );
        }


        if (
            cleanUndatedStats.length > 0
        ) {

            warnings.push(
                "Undated statistical sources were retained separately and must not be treated as current-match statistics."
            );
        }


        if (
            cleanOdds.length === 0
        ) {

            warnings.push(
                "No date-qualified current-match odds source was confidently identified."
            );
        }


        // =========================================================
        // 13. DATA AVAILABILITY
        // =========================================================

        const fixtureAvailable =
            sources.some(
                item =>
                    item.relevance ===
                    "CURRENT_MATCH"
            );


        const formAvailable =
            formEvidence.home.length > 0 ||
            formEvidence.away.length > 0;


        const injuryAvailable =
            injuries.home.length > 0 ||
            injuries.away.length > 0;


        const lineupAvailable =
            lineups.home !== null ||
            lineups.away !== null ||
            lineups.matchEvidence.length > 0;


        const statsAvailable =
            cleanStats.length > 0;


        const oddsAvailable =
            cleanOdds.length > 0;


        // =========================================================
        // 14. FINAL NORMALIZED OBJECT
        // =========================================================

        const normalized = {

            match: {
                home,
                away,
                date: targetDate,
                year: targetYear
            },


            form: {
                home:
                    buildFormSummary(
                        formEvidence.home
                    ),

                away:
                    buildFormSummary(
                        formEvidence.away
                    )
            },


            formEvidence: {
                home:
                    formEvidence.home,

                away:
                    formEvidence.away
            },


            h2h:
                cleanH2H,


            goals: {
                home:
                    extractedStats.goals.home,

                away:
                    extractedStats.goals.away
            },


            xg: {
                home:
                    extractedStats.xg.home,

                away:
                    extractedStats.xg.away,

                total:
                    extractedStats.xg.total
            },


            btts: {
                home:
                    extractedStats.btts.home,

                away:
                    extractedStats.btts.away,

                h2h:
                    extractedStats.btts.h2h
            },


            overUnder: {
                over15:
                    extractedStats.overUnder.over15,

                over25:
                    extractedStats.overUnder.over25,

                over35:
                    extractedStats.overUnder.over35,

                under25:
                    extractedStats.overUnder.under25,

                under35:
                    extractedStats.overUnder.under35
            },


            statsEvidence:
                cleanStats,


            undatedStatsEvidence:
                cleanUndatedStats,


            injuries: {
                home:
                    injuries.home,

                away:
                    injuries.away,

                unknown:
                    injuries.unknown
            },


            lineups: {
                home:
                    lineups.home,

                away:
                    lineups.away,

                matchEvidence:
                    lineups.matchEvidence,

                unknown:
                    lineups.unknown
            },


            odds: {
                home:
                    extractedOdds.home,

                draw:
                    extractedOdds.draw,

                away:
                    extractedOdds.away,

                over25:
                    extractedOdds.over25,

                under25:
                    extractedOdds.under25,

                bttsYes:
                    extractedOdds.bttsYes,

                bttsNo:
                    extractedOdds.bttsNo
            },


            oddsEvidence:
                cleanOdds,


            undatedOddsEvidence:
                cleanUndatedOdds,


            sources,


            warnings
        };


        // =========================================================
        // 15. QUALITY COUNTS
        // =========================================================

        const quality = {

            totalSources:
                sources.length,

            currentMatchSources:
                countRelevance(
                    sources,
                    "CURRENT_MATCH"
                ),

            recentSources:
                countRelevance(
                    sources,
                    "RECENT"
                ),

            historicalSources:
                countRelevance(
                    sources,
                    "HISTORICAL"
                ),

            futureSources:
                countRelevance(
                    sources,
                    "FUTURE"
                ),

            undatedTeamSources:
                countRelevance(
                    sources,
                    "UNDATED_TEAM_SOURCE"
                ),

            irrelevantSources:
                countRelevance(
                    sources,
                    "IRRELEVANT"
                ),

            h2hSources:
                cleanH2H.length,

            formEvidence:
                formEvidence.home.length +
                formEvidence.away.length,

            statsEvidence:
                cleanStats.length,

            undatedStatsEvidence:
                cleanUndatedStats.length,

            injuryEvidence:
                injuries.home.length +
                injuries.away.length,

            injurySources:
                sources.filter(
                    item =>
                        item.type ===
                        "injuries"
                ).length,

            lineupEvidence:
                lineups.matchEvidence.length,

            oddsEvidence:
                cleanOdds.length,

            undatedOddsEvidence:
                cleanUndatedOdds.length
        };


        // =========================================================
        // 16. ANALYSIS READINESS
        // =========================================================

        const analysisReady = {

            exactMatchEvidence:
                fixtureAvailable,

            recentEvidence:
                formAvailable,

            h2hEvidence:
                cleanH2H.length > 0,

            formEvidence:
                formAvailable,

            injuryEvidence:
                injuryAvailable,

            lineupEvidence:
                lineupAvailable,

            statsEvidence:
                statsAvailable,

            oddsEvidence:
                oddsAvailable,

            structuredOdds:
                extractedOdds.home !== null ||
                extractedOdds.draw !== null ||
                extractedOdds.away !== null,

            actualLineups:
                lineupAvailable
        };


        // =========================================================
        // 17. DATA AVAILABILITY
        // =========================================================

        const dataAvailability = {

            fixture: {
                available:
                    fixtureAvailable,

                confidence:
                    fixtureAvailable
                        ? "HIGH"
                        : "NONE"
            },


            form: {
                available:
                    formAvailable,

                confidence:
                    formAvailable
                        ? "MEDIUM"
                        : "NONE",

                reason:
                    formAvailable
                        ? "Date-qualified previous results were found."
                        : "No date-qualified recent results extracted."
            },


            h2h: {
                available:
                    cleanH2H.length > 0,

                confidence:
                    cleanH2H.length >= 2
                        ? "MEDIUM"
                        : cleanH2H.length === 1
                            ? "LOW"
                            : "NONE"
            },


            injuries: {
                available:
                    injuryAvailable,

                confidence:
                    injuryAvailable
                        ? "MEDIUM"
                        : "NONE",

                sourceAvailable:
                    sources.some(
                        item =>
                            item.type ===
                            "injuries"
                    ),

                currentEvidence:
                    injuryAvailable
            },


            lineups: {
                sourceAvailable:
                    lineups.matchEvidence.length > 0,

                playersAvailable:
                    lineupAvailable,

                confirmed:
                    false
            },


            stats: {
                available:
                    statsAvailable,

                confidence:
                    statsAvailable
                        ? "MEDIUM"
                        : "NONE",

                undatedAvailable:
                    cleanUndatedStats.length > 0
            },


            xg: {
                available:
                    extractedStats.xg.home !== null ||
                    extractedStats.xg.away !== null,

                confidence:
                    extractedStats.xg.home !== null ||
                    extractedStats.xg.away !== null
                        ? "MEDIUM"
                        : "NONE"
            },


            odds: {
                sourceAvailable:
                    cleanOdds.length > 0,

                structured1X2:
                    extractedOdds.home !== null ||
                    extractedOdds.draw !== null ||
                    extractedOdds.away !== null,

                confidence:
                    cleanOdds.length > 0
                        ? "MEDIUM"
                        : "NONE",

                undatedAvailable:
                    cleanUndatedOdds.length > 0
            }
        };


        // =========================================================
        // 18. RESPONSE
        // =========================================================

        return res.status(200).json({

            success: true,

            version:
                "V3.2",

            normalized,

            quality,

            dataAvailability,

            analysisReady
        });


    } catch (error) {

        console.error(
            "V3.2 normalization error:",
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


// ================================================================
// HELPER FUNCTIONS
// ================================================================


// ---------------------------------------------------------------
// CLEAN STRING
// ---------------------------------------------------------------

function cleanString(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/\s+/g, " ")
        .trim();
}


// ---------------------------------------------------------------
// NORMALIZE ISO DATE
// ---------------------------------------------------------------

function normalizeISODate(value) {

    if (!value) {
        return null;
    }

    const text =
        cleanString(value);

    let match;


    // YYYY-MM-DD
    match =
        text.match(
            /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/
        );

    if (match) {

        return makeISODate(
            Number(match[1]),
            Number(match[2]),
            Number(match[3])
        );
    }


    // September 30, 2026
    match =
        text.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i
        );

    if (match) {

        return makeISODate(
            Number(match[3]),
            monthNumber(match[1]),
            Number(match[2])
        );
    }


    // 30 September 2026
    match =
        text.match(
            /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i
        );

    if (match) {

        return makeISODate(
            Number(match[3]),
            monthNumber(match[2]),
            Number(match[1])
        );
    }


    // Sep 30, 2026
    match =
        text.match(
            /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i
        );

    if (match) {

        return makeISODate(
            Number(match[3]),
            monthNumber(match[1]),
            Number(match[2])
        );
    }


    // 30 Sep 2026
    match =
        text.match(
            /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i
        );

    if (match) {

        return makeISODate(
            Number(match[3]),
            monthNumber(match[2]),
            Number(match[1])
        );
    }


    // DD/MM/YYYY or MM/DD/YYYY
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


        /*
        If one component is >12, interpretation is obvious.
        Otherwise use contextual heuristics.
        */

        if (first > 12) {

            return makeISODate(
                year,
                second,
                first
            );
        }

        if (second > 12) {

            return makeISODate(
                year,
                first,
                second
            );
        }


        /*
        For ambiguous numeric dates we use DD/MM first because
        most football sources outside the US use that convention.
        */

        return makeISODate(
            year,
            second,
            first
        );
    }


    return null;
}


// ---------------------------------------------------------------
// MAKE ISO DATE
// ---------------------------------------------------------------

function makeISODate(
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


    return date
        .toISOString()
        .slice(0, 10);
}


// ---------------------------------------------------------------
// MONTH NUMBER
// ---------------------------------------------------------------

function monthNumber(value) {

    const month =
        cleanString(value)
            .toLowerCase()
            .slice(0, 3);


    const months = {
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


    return months[month] || null;
}


// ---------------------------------------------------------------
// TEAM IDENTITY
// ---------------------------------------------------------------

function buildTeamIdentity(
    team,
    side
) {

    const original =
        cleanString(team);


    const normalized =
        normalizeTeamName(
            original
        );


    const aliases =
        new Set();


    aliases.add(
        normalized
    );


    /*
    Deportes Concepcion handling.

    "Concepcion" from API-Football can refer to
    Deportes Concepcion.

    We allow the generic Concepcion form.

    We DO NOT add Universidad de Concepcion.
    */

    if (
        normalized ===
        "concepcion" ||
        normalized ===
        "deportes concepcion"
    ) {

        aliases.add(
            "concepcion"
        );

        aliases.add(
            "deportes concepcion"
        );
    }


    /*
    O'Higgins spelling variations.
    */

    if (
        normalized ===
        "ohiggins"
    ) {

        aliases.add(
            "o higgins"
        );

        aliases.add(
            "ohiggins"
        );
    }


    return {
        original,
        normalized,
        side,
        aliases:
            Array.from(
                aliases
            )
    };
}


// ---------------------------------------------------------------
// NORMALIZE TEAM NAME
// ---------------------------------------------------------------

function normalizeTeamName(
    value
) {

    return cleanString(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /['’`]/g,
            ""
        )
        .replace(
            /[^a-z0-9]+/g,
            " "
        )
        .replace(
            /\b(cd|fc|cf|club)\b/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}


// ---------------------------------------------------------------
// TEXT TEAM MATCH
// ---------------------------------------------------------------

function textContainsTeam(
    text,
    identity
) {

    if (!text) {
        return false;
    }

    const normalizedText =
        normalizeTeamName(
            text
        );


    return identity.aliases.some(
        alias => {

            if (!alias) {
                return false;
            }

            return normalizedText
                .includes(alias);
        }
    );
}


// ---------------------------------------------------------------
// BOTH TEAMS
// ---------------------------------------------------------------

function containsBothTeams(
    text,
    homeIdentity,
    awayIdentity
) {

    return (
        textContainsTeam(
            text,
            homeIdentity
        ) &&
        textContainsTeam(
            text,
            awayIdentity
        )
    );
}


// ---------------------------------------------------------------
// SOURCE NORMALIZATION
// ---------------------------------------------------------------

function normalizeSource(
    raw,
    homeIdentity,
    awayIdentity,
    targetDate
) {

    const source =
        cleanString(
            raw.source
        );

    const url =
        cleanString(
            raw.url
        );

    const snippet =
        cleanString(
            raw.snippet
        );

    const publishedDate =
        normalizeISODate(
            raw.date
        );


    const combined =
        [
            source,
            url,
            snippet
        ]
        .filter(Boolean)
        .join(" ");


    if (!combined) {
        return null;
    }


    const eventDate =
        extractBestEventDate(
            combined,
            targetDate
        );


    const bothTeams =
        containsBothTeams(
            combined,
            homeIdentity,
            awayIdentity
        );


    const hasHome =
        textContainsTeam(
            combined,
            homeIdentity
        );


    const hasAway =
        textContainsTeam(
            combined,
            awayIdentity
        );


    const type =
        normalizeSourceType(
            raw.type
        );


    let relevance =
        "IRRELEVANT";


    /*
    =============================================================
    CURRENT MATCH
    =============================================================
    */

    const exactTargetDate =
        eventDate === targetDate;


    const explicitCurrentMatch =
        isExplicitCurrentMatch(
            combined,
            source,
            url,
            homeIdentity,
            awayIdentity,
            targetDate
        );


    /*
    H2H pages should not become current-match evidence simply
    because they mention the target date.
    */

    const h2hPage =
        isH2HText(
            combined
        );


    if (
        exactTargetDate &&
        bothTeams &&
        !h2hPage
    ) {

        relevance =
            "CURRENT_MATCH";
    }

    /*
    A matchup-specific page with no detectable event date can
    still be considered current for lineups/injury/odds context,
    but we DO NOT mark it globally CURRENT_MATCH unless there
    is stronger evidence.
    */

    else if (
        explicitCurrentMatch &&
        bothTeams &&
        !h2hPage
    ) {

        relevance =
            "CURRENT_MATCH";
    }


    /*
    =============================================================
    FUTURE
    =============================================================
    */

    else if (
        eventDate &&
        eventDate > targetDate &&
        bothTeams
    ) {

        relevance =
            "FUTURE";
    }


    /*
    =============================================================
    HISTORICAL
    =============================================================
    */

    else if (
        eventDate &&
        eventDate < targetDate &&
        bothTeams
    ) {

        relevance =
            "HISTORICAL";
    }


    /*
    H2H pages without an event date remain historical/contextual,
    not current.
    */

    else if (
        h2hPage &&
        bothTeams
    ) {

        relevance =
            "HISTORICAL";
    }


    /*
    =============================================================
    RECENT
    =============================================================
    */

    else if (
        publishedDate &&
        isWithinPrevious30Days(
            publishedDate,
            targetDate
        ) &&
        (hasHome || hasAway)
    ) {

        relevance =
            "RECENT";
    }


    /*
    =============================================================
    UNDATED TEAM SOURCE
    =============================================================
    */

    else if (
        (hasHome || hasAway) &&
        !eventDate &&
        !publishedDate
    ) {

        relevance =
            "UNDATED_TEAM_SOURCE";
    }


    /*
    =============================================================
    OTHERWISE IRRELEVANT
    =============================================================
    */

    else {

        relevance =
            "IRRELEVANT";
    }


    /*
    Date basis
    */

    let dateBasis =
        null;


    if (eventDate) {

        dateBasis =
            "TEXT_DATE";

    } else if (publishedDate) {

        dateBasis =
            "PUBLICATION_DATE";
    }


    return {

        type,

        source,

        url,

        snippet,

        relevance,

        eventDate,

        publishedDate,

        dateBasis
    };
}


// ---------------------------------------------------------------
// SOURCE TYPE
// ---------------------------------------------------------------

function normalizeSourceType(
    type
) {

    const value =
        cleanString(
            type
        ).toLowerCase();


    if (
        value.includes("injur")
    ) {
        return "injuries";
    }

    if (
        value.includes("lineup")
    ) {
        return "lineups";
    }

    if (
        value.includes("odd")
    ) {
        return "odds";
    }

    if (
        value.includes("stat")
    ) {
        return "stats";
    }

    if (
        value.includes("h2h")
    ) {
        return "h2h";
    }

    if (
        value.includes("form")
    ) {
        return "form";
    }

    return value || "unknown";
}


// ---------------------------------------------------------------
// BEST EVENT DATE
// ---------------------------------------------------------------

function extractBestEventDate(
    text,
    targetDate
) {

    if (!text) {
        return null;
    }


    const candidates = [];


    /*
    Find all common date formats.
    */

    const patterns = [

        /\b20\d{2}-\d{1,2}-\d{1,2}\b/g,

        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2}\b/gi,

        /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/gi,

        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2}\b/gi,

        /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}\b/gi,

        /\b\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2}\b/g
    ];


    for (
        const pattern
        of patterns
    ) {

        const matches =
            text.match(pattern) || [];


        for (
            const value
            of matches
        ) {

            const parsed =
                normalizeISODate(
                    value
                );


            if (parsed) {
                candidates.push(
                    parsed
                );
            }
        }
    }


    const unique =
        Array.from(
            new Set(candidates)
        );


    if (unique.length === 0) {
        return null;
    }


    /*
    Prefer target date when explicitly present.
    */

    if (
        unique.includes(
            targetDate
        )
    ) {

        return targetDate;
    }


    /*
    Prefer dates in the target year.
    */

    const targetYear =
        Number(
            targetDate.slice(0, 4)
        );


    const sameYear =
        unique.filter(
            date =>
                Number(
                    date.slice(0, 4)
                ) === targetYear
        );


    if (
        sameYear.length > 0
    ) {

        /*
        Return the first same-year date.
        */
        return sameYear[0];
    }


    return unique[0];
}


// ---------------------------------------------------------------
// EXPLICIT CURRENT MATCH
// ---------------------------------------------------------------

function isExplicitCurrentMatch(
    combined,
    source,
    url,
    homeIdentity,
    awayIdentity,
    targetDate
) {

    const text =
        combined.toLowerCase();


    if (
        !containsBothTeams(
            combined,
            homeIdentity,
            awayIdentity
        )
    ) {
        return false;
    }


    /*
    Current fixture indicators.
    */

    const currentTerms = [

        "live score",

        "upcoming",

        "fixture",

        "match preview",

        "match preview & prediction",

        "predicted lineups",

        "predicted lineup",

        "starting xi",

        "starting 11",

        "starting eleven",

        "lineups",

        "lineup",

        "team news",

        "injuries",

        "suspended",

        "unavailable players",

        "match odds",

        "1x2 odds",

        "over/under",

        "both teams to score"
    ];


    const hasCurrentTerm =
        currentTerms.some(
            term =>
                text.includes(term)
        );


    /*
    Do NOT allow H2H-only pages.
    */

    if (
        isH2HText(
            combined
        ) &&
        !hasCurrentTerm
    ) {

        return false;
    }


    /*
    A source that explicitly contains the target date
    is strong current evidence.
    */

    if (
        text.includes(
            targetDate
        )
    ) {

        return true;
    }


    /*
    For pages with matchup-specific URLs/titles, allow current
    context even if the date is absent.

    This is particularly useful for predicted lineups and
    current team-news pages.
    */

    return hasCurrentTerm;
}


// ---------------------------------------------------------------
// H2H DETECTION
// ---------------------------------------------------------------

function isH2HText(
    text
) {

    const value =
        cleanString(
            text
        ).toLowerCase();


    return (

        value.includes("head to head") ||

        value.includes("head-to-head") ||

        value.includes("h2h") ||

        value.includes("past h2h") ||

        value.includes("previous meetings") ||

        value.includes("past meetings") ||

        value.includes("last meetings") ||

        value.includes("previous encounters") ||

        value.includes("recent head-to-head")
    );
}


// ---------------------------------------------------------------
// ACTUAL H2H SOURCE
// ---------------------------------------------------------------

function isActualH2HSource(
    item
) {

    const combined =
        [
            item.source,
            item.url,
            item.snippet
        ]
        .filter(Boolean)
        .join(" ");


    return (
        item.type === "h2h" ||
        isH2HText(
            combined
        )
    );
}


// ---------------------------------------------------------------
// PREVIOUS 30 DAYS
// ---------------------------------------------------------------

function isWithinPrevious30Days(
    publishedDate,
    targetDate
) {

    const pub =
        dateToUTC(
            publishedDate
        );

    const target =
        dateToUTC(
            targetDate
        );


    if (
        !pub ||
        !target
    ) {
        return false;
    }


    const difference =
        target - pub;


    const thirtyDays =
        30 *
        24 *
        60 *
        60 *
        1000;


    return (
        difference >= 0 &&
        difference <= thirtyDays
    );
}


// ---------------------------------------------------------------
// DATE TO UTC
// ---------------------------------------------------------------

function dateToUTC(
    iso
) {

    if (!iso) {
        return null;
    }


    const parts =
        iso.split("-")
            .map(Number);


    if (
        parts.length !== 3 ||
        parts.some(
            Number.isNaN
        )
    ) {
        return null;
    }


    return Date.UTC(
        parts[0],
        parts[1] - 1,
        parts[2]
    );
}


// ---------------------------------------------------------------
// STRONG CURRENT STATS SOURCE
// ---------------------------------------------------------------

function isStrongCurrentStatsSource(
    item,
    homeIdentity,
    awayIdentity
) {

    const combined =
        [
            item.source,
            item.url,
            item.snippet
        ]
        .filter(Boolean)
        .join(" ");


    if (
        item.relevance !==
        "CURRENT_MATCH"
    ) {
        return false;
    }


    if (
        !containsBothTeams(
            combined,
            homeIdentity,
            awayIdentity
        )
    ) {
        return false;
    }


    /*
    Reject H2H-only statistics pages.
    */

    if (
        isH2HText(
            combined
        ) &&
        !hasDirectMatchStatsLanguage(
            combined
        )
    ) {

        return false;
    }


    return hasDirectMatchStatsLanguage(
        combined
    );
}


// ---------------------------------------------------------------
// DIRECT MATCH STATS LANGUAGE
// ---------------------------------------------------------------

function hasDirectMatchStatsLanguage(
    text
) {

    const value =
        text.toLowerCase();


    const terms = [

        "match statistics",

        "match stats",

        "team stats",

        "match statistics and data",

        "possession",

        "shots on target",

        "shots",

        "corners",

        "xg",

        "expected goals",

        "goals per match",

        "over 2.5",

        "under 2.5",

        "btts"
    ];


    return terms.some(
        term =>
            value.includes(term)
    );
}


// ---------------------------------------------------------------
// UNDATED STATS
// ---------------------------------------------------------------

function isUsefulUndatedStatsSource(
    item,
    homeIdentity,
    awayIdentity
) {

    const combined =
        [
            item.source,
            item.url,
            item.snippet
        ]
        .filter(Boolean)
        .join(" ");


    if (
        !(
            textContainsTeam(
                combined,
                homeIdentity
            ) ||
            textContainsTeam(
                combined,
                awayIdentity
            )
        )
    ) {
        return false;
    }


    return hasDirectMatchStatsLanguage(
        combined
    );
}


// ---------------------------------------------------------------
// EXTRACT FORM RESULTS
// ---------------------------------------------------------------

function extractFormResults(
    item,
    homeIdentity,
    awayIdentity,
    targetDate
) {

    const results = [];


    if (
        !item ||
        !item.snippet
    ) {
        return results;
    }


    if (
        item.relevance !== "HISTORICAL" &&
        item.relevance !== "RECENT" &&
        item.relevance !== "CURRENT_MATCH"
    ) {
        return results;
    }


    const text =
        item.snippet;


    /*
    ------------------------------------------------------------
    Basic result pattern:

    Team 2 - 1 Opponent
    Team 1: 0-1
    Team 1 2-0
    ------------------------------------------------------------
    */

    const scorePattern =
        /([A-Za-zÀ-ÿ0-9'.&() -]{2,50})\s+(\d{1,2})\s*[-:]\s*(\d{1,2})\s+([A-Za-zÀ-ÿ0-9'.&() -]{2,50})/g;


    let match;


    while (
        (match =
            scorePattern.exec(
                text
            )) !== null
    ) {

        const teamA =
            cleanString(
                match[1]
            );

        const scoreA =
            Number(
                match[2]
            );

        const scoreB =
            Number(
                match[3]
            );

        const teamB =
            cleanString(
                match[4]
            );


        const aHome =
            textContainsTeam(
                teamA,
                homeIdentity
            );


        const aAway =
            textContainsTeam(
                teamA,
                awayIdentity
            );


        const bHome =
            textContainsTeam(
                teamB,
                homeIdentity
            );


        const bAway =
            textContainsTeam(
                teamB,
                awayIdentity
            );


        if (
            aHome &&
            !aAway
        ) {

            results.push({

                team: "home",

                opponent:
                    teamB,

                goalsFor:
                    scoreA,

                goalsAgainst:
                    scoreB,

                result:
                    scoreA > scoreB
                        ? "W"
                        : scoreA < scoreB
                            ? "L"
                            : "D",

                eventDate:
                    item.eventDate,

                source:
                    item.source,

                url:
                    item.url
            });
        }


        if (
            aAway &&
            !aHome
        ) {

            results.push({

                team: "away",

                opponent:
                    teamB,

                goalsFor:
                    scoreA,

                goalsAgainst:
                    scoreB,

                result:
                    scoreA > scoreB
                        ? "W"
                        : scoreA < scoreB
                            ? "L"
                            : "D",

                eventDate:
                    item.eventDate,

                source:
                    item.source,

                url:
                    item.url
            });
        }


        if (
            bHome &&
            !bAway
        ) {

            results.push({

                team: "home",

                opponent:
                    teamA,

                goalsFor:
                    scoreB,

                goalsAgainst:
                    scoreA,

                result:
                    scoreB > scoreA
                        ? "W"
                        : scoreB < scoreA
                            ? "L"
                            : "D",

                eventDate:
                    item.eventDate,

                source:
                    item.source,

                url:
                    item.url
            });
        }


        if (
            bAway &&
            !bHome
        ) {

            results.push({

                team: "away",

                opponent:
                    teamA,

                goalsFor:
                    scoreB,

                goalsAgainst:
                    scoreA,

                result:
                    scoreB > scoreA
                        ? "W"
                        : scoreB < scoreA
                            ? "L"
                            : "D",

                eventDate:
                    item.eventDate,

                source:
                    item.source,

                url:
                    item.url
            });
        }
    }


    /*
    Never use the current fixture itself as previous form.
    */

    return results.filter(
        item =>
            !item.eventDate ||
            item.eventDate < targetDate
    );
}


// ---------------------------------------------------------------
// FORM SUMMARY
// ---------------------------------------------------------------

function buildFormSummary(
    evidence
) {

    if (
        !Array.isArray(evidence) ||
        evidence.length === 0
    ) {
        return [];
    }


    return evidence.map(
        item => ({
            result:
                item.result,

            goalsFor:
                item.goalsFor,

            goalsAgainst:
                item.goalsAgainst,

            eventDate:
                item.eventDate
        })
    );
}


// ---------------------------------------------------------------
// CURRENT INJURIES
// ---------------------------------------------------------------

function extractCurrentInjuries(
    item,
    homeIdentity,
    awayIdentity,
    targetDate
) {

    const results = [];


    if (!item) {
        return results;
    }


    const combined =
        [
            item.source,
            item.url,
            item.snippet
        ]
        .filter(Boolean)
        .join(" ");


    /*
    Historical match pages cannot be used for current injuries.
    */

    if (
        item.relevance ===
        "HISTORICAL"
    ) {
        return results;
    }


    /*
    If an explicit event date exists and it is before the
    requested fixture, don't use it as current injury evidence.
    */

    if (
        item.eventDate &&
        item.eventDate < targetDate
    ) {
        return results;
    }


    /*
    Current injury terms.
    */

    const injuryTerms = [

        "injured",

        "injury",

        "injuries",

        "unavailable",

        "suspended",

        "suspension",

        "doubtful",

        "ruled out",

        "out",

        "missing"
    ];


    const hasInjuryLanguage =
        injuryTerms.some(
            term =>
                combined
                    .toLowerCase()
                    .includes(term)
        );


    if (!hasInjuryLanguage) {
        return results;
    }


    /*
    ------------------------------------------------------------
    HOME-SPECIFIC SENTENCES
    ------------------------------------------------------------
    */

    const homeSentences =
        extractTeamSpecificSentences(
            combined,
            homeIdentity
        );


    for (
        const sentence
        of homeSentences
    ) {

        if (
            injuryTerms.some(
                term =>
                    sentence
                        .toLowerCase()
                        .includes(term)
            )
        ) {

            results.push({

                team: "home",

                text:
                    sentence,

                source:
                    item.source,

                url:
                    item.url,

                eventDate:
                    item.eventDate,

                publishedDate:
                    item.publishedDate
            });
        }
    }


    /*
    ------------------------------------------------------------
    AWAY-SPECIFIC SENTENCES
    ------------------------------------------------------------
    */

    const awaySentences =
        extractTeamSpecificSentences(
            combined,
            awayIdentity
        );


    for (
        const sentence
        of awaySentences
    ) {

        if (
            injuryTerms.some(
                term =>
                    sentence
                        .toLowerCase()
                        .includes(term)
            )
        ) {

            results.push({

                team: "away",

                text:
                    sentence,

                source:
                    item.source,

                url:
                    item.url,

                eventDate:
                    item.eventDate,

                publishedDate:
                    item.publishedDate
            });
        }
    }


    /*
    ------------------------------------------------------------
    If exact attribution cannot be established, don't assign
    it to either team.
    ------------------------------------------------------------
    */

    if (
        results.length === 0 &&
        hasInjuryLanguage &&
        containsBothTeams(
            combined,
            homeIdentity,
            awayIdentity
        )
    ) {

        results.push({

            team: "unknown",

            text:
                item.snippet,

            source:
                item.source,

            url:
                item.url,

            eventDate:
                item.eventDate,

            publishedDate:
                item.publishedDate
        });
    }


    return results;
}


// ---------------------------------------------------------------
// TEAM-SPECIFIC SENTENCES
// ---------------------------------------------------------------

function extractTeamSpecificSentences(
    text,
    identity
) {

    const sentences =
        text.split(
            /(?<=[.!?])\s+/
        );


    return sentences.filter(
        sentence =>
            textContainsTeam(
                sentence,
                identity
            )
    );
}


// ---------------------------------------------------------------
// CURRENT LINEUP SOURCE
// ---------------------------------------------------------------

function isStrongCurrentLineupSource(
    item,
    homeIdentity,
    awayIdentity
) {

    const combined =
        [
            item.source,
            item.url,
            item.snippet
        ]
        .filter(Boolean)
        .join(" ");


    if (
        item.type !==
        "lineups"
    ) {
        return false;
    }


    if (
        !containsBothTeams(
            combined,
            homeIdentity,
            awayIdentity
        )
    ) {
        return false;
    }


    if (
        item.relevance ===
        "HISTORICAL"
    ) {
        return false;
    }


    /*
    Reject known H2H/archive pages.
    */

    if (
        isH2HText(
            combined
        ) &&
        !hasLineupLanguage(
            combined
        )
    ) {
        return false;
    }


    return hasLineupLanguage(
        combined
    );
}


// ---------------------------------------------------------------
// LINEUP LANGUAGE
// ---------------------------------------------------------------

function hasLineupLanguage(
    text
) {

    const value =
        text.toLowerCase();


    const terms = [

        "predicted lineup",

        "predicted lineups",

        "predicted xi",

        "starting xi",

        "starting 11",

        "starting eleven",

        "lineups",

        "lineup",

        "players",

        "goalkeeper",

        "defenders",

        "midfielders",

        "forwards"
    ];


    return terms.some(
        term =>
            value.includes(term)
    );
}


// ---------------------------------------------------------------
// EXTRACT LINEUPS
// ---------------------------------------------------------------

function extractLineupEvidence(
    evidence,
    homeIdentity,
    awayIdentity
) {

    const result = {

        home: null,

        away: null,

        matchEvidence:
            evidence,

        unknown: []
    };


    for (
        const item
        of evidence
    ) {

        const combined =
            [
                item.source,
                item.snippet,
                item.url
            ]
            .filter(Boolean)
            .join(" ");


        /*
        If the source only describes both teams without
        assigning player groups, keep it as match evidence.
        */

        if (
            containsBothTeams(
                combined,
                homeIdentity,
                awayIdentity
            )
        ) {

            if (
                result.home === null
            ) {

                result.home = {

                    source:
                        item.source,

                    url:
                        item.url,

                    snippet:
                        item.snippet,

                    confirmed:
                        false
                };
            }


            if (
                result.away === null
            ) {

                result.away = {

                    source:
                        item.source,

                    url:
                        item.url,

                    snippet:
                        item.snippet,

                    confirmed:
                        false
                };
            }
        }
    }


    return result;
}


// ---------------------------------------------------------------
// CURRENT ODDS SOURCE
// ---------------------------------------------------------------

function isStrongCurrentOddsSource(
    item,
    homeIdentity,
    awayIdentity
) {

    const combined =
        [
            item.source,
            item.url,
            item.snippet
        ]
        .filter(Boolean)
        .join(" ");


    if (
        item.type !==
        "odds"
    ) {
        return false;
    }


    if (
        item.relevance !==
        "CURRENT_MATCH"
    ) {
        return false;
    }


    if (
        !containsBothTeams(
            combined,
            homeIdentity,
            awayIdentity
        )
    ) {
        return false;
    }


    if (
        isH2HText(
            combined
        )
    ) {
        return false;
    }


    return hasOddsLanguage(
        combined
    );
}


// ---------------------------------------------------------------
// ODDS LANGUAGE
// ---------------------------------------------------------------

function hasOddsLanguage(
    text
) {

    const value =
        text.toLowerCase();


    const terms = [

        "odds",

        "1x2",

        "moneyline",

        "home win",

        "draw",

        "away win",

        "over 2.5",

        "under 2.5",

        "btts",

        "both teams to score",

        "bet365",

        "betway",

        "bookmaker"
    ];


    return terms.some(
        term =>
            value.includes(term)
    );
}


// ---------------------------------------------------------------
// UNDATED ODDS
// ---------------------------------------------------------------

function isUsefulUndatedOddsSource(
    item,
    homeIdentity,
    awayIdentity
) {

    const combined =
        [
            item.source,
            item.url,
            item.snippet
        ]
        .filter(Boolean)
        .join(" ");


    return (

        containsBothTeams(
            combined,
            homeIdentity,
            awayIdentity
        ) &&

        hasOddsLanguage(
            combined
        )
    );
}


// ---------------------------------------------------------------
// STRUCTURED STATS
// ---------------------------------------------------------------

function extractStructuredStats(
    evidence,
    homeIdentity,
    awayIdentity
) {

    const output = {

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
        }
    };


    /*
    ------------------------------------------------------------
    IMPORTANT:

    We only extract numbers from CURRENT_MATCH evidence.

    We do NOT infer a statistic merely because a page mentions
    the teams.
    ------------------------------------------------------------
    */

    for (
        const item
        of evidence
    ) {

        const text =
            item.snippet || "";


        /*
        XG
        */

        const xgMatches =
            text.match(
                /xg\s*[:=]?\s*(\d+(?:\.\d+)?)/gi
            );


        if (
            xgMatches &&
            xgMatches.length >= 2
        ) {

            const values =
                xgMatches
                    .map(
                        value =>
                            Number(
                                value.match(
                                    /(\d+(?:\.\d+)?)/)[1]
                            )
                    );


            if (
                output.xg.home === null
            ) {

                output.xg.home =
                    values[0];
            }


            if (
                output.xg.away === null
            ) {

                output.xg.away =
                    values[1];
            }


            if (
                output.xg.home !== null &&
                output.xg.away !== null
            ) {

                output.xg.total =
                    Number(
                        (
                            output.xg.home +
                            output.xg.away
                        ).toFixed(2)
                    );
            }
        }


        /*
        BTTS percentages
        */

        const bttsMatch =
            text.match(
                /btts[^0-9]*(\d+(?:\.\d+)?)%/i
            );


        if (
            bttsMatch &&
            output.btts.h2h === null
        ) {

            output.btts.h2h =
                Number(
                    bttsMatch[1]
                );
        }


        /*
        Over 2.5
        */

        const over25Match =
            text.match(
                /over\s*2\.5[^0-9]*(\d+(?:\.\d+)?)%/i
            );


        if (
            over25Match &&
            output.overUnder.over25 === null
        ) {

            output.overUnder.over25 =
                Number(
                    over25Match[1]
                );
        }


        /*
        Under 2.5
        */

        const under25Match =
            text.match(
                /under\s*2\.5[^0-9]*(\d+(?:\.\d+)?)%/i
            );


        if (
            under25Match &&
            output.overUnder.under25 === null
        ) {

            output.overUnder.under25 =
                Number(
                    under25Match[1]
                );
        }
    }


    return output;
}


// ---------------------------------------------------------------
// STRUCTURED ODDS
// ---------------------------------------------------------------

function extractStructuredOdds(
    evidence,
    homeIdentity,
    awayIdentity
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


    for (
        const item
        of evidence
    ) {

        const text =
            item.snippet || "";


        /*
        --------------------------------------------------------
        Home / Draw / Away decimal odds
        --------------------------------------------------------
        */

        const homeMatch =
            text.match(
                /(?:home win|home)\D{0,20}(\d+(?:\.\d{1,2})?)/i
            );


        const drawMatch =
            text.match(
                /(?:draw)\D{0,20}(\d+(?:\.\d{1,2})?)/i
            );


        const awayMatch =
            text.match(
                /(?:away win|away)\D{0,20}(\d+(?:\.\d{1,2})?)/i
            );


        if (
            homeMatch &&
            output.home === null
        ) {

            output.home =
                Number(
                    homeMatch[1]
                );
        }


        if (
            drawMatch &&
            output.draw === null
        ) {

            output.draw =
                Number(
                    drawMatch[1]
                );
        }


        if (
            awayMatch &&
            output.away === null
        ) {

            output.away =
                Number(
                    awayMatch[1]
                );
        }


        /*
        --------------------------------------------------------
        Over / Under 2.5
        --------------------------------------------------------
        */

        const overMatch =
            text.match(
                /over\s*2\.5\D{0,20}(\d+(?:\.\d{1,2})?)/i
            );


        const underMatch =
            text.match(
                /under\s*2\.5\D{0,20}(\d+(?:\.\d{1,2})?)/i
            );


        if (
            overMatch &&
            output.over25 === null
        ) {

            output.over25 =
                Number(
                    overMatch[1]
                );
        }


        if (
            underMatch &&
            output.under25 === null
        ) {

            output.under25 =
                Number(
                    underMatch[1]
                );
        }


        /*
        --------------------------------------------------------
        BTTS
        --------------------------------------------------------
        */

        const bttsYesMatch =
            text.match(
                /btts(?:\s+yes)?\D{0,20}(\d+(?:\.\d{1,2})?)/i
            );


        const bttsNoMatch =
            text.match(
                /btts\s+no\D{0,20}(\d+(?:\.\d{1,2})?)/i
            );


        if (
            bttsYesMatch &&
            output.bttsYes === null
        ) {

            output.bttsYes =
                Number(
                    bttsYesMatch[1]
                );
        }


        if (
            bttsNoMatch &&
            output.bttsNo === null
        ) {

            output.bttsNo =
                Number(
                    bttsNoMatch[1]
                );
        }
    }


    /*
    ------------------------------------------------------------
    Sanity-check decimal odds.

    Ignore percentages and obviously invalid values.
    ------------------------------------------------------------
    */

    for (
        const key
        of [
            "home",
            "draw",
            "away",
            "over25",
            "under25",
            "bttsYes",
            "bttsNo"
        ]
    ) {

        if (
            output[key] !== null &&
            (
                output[key] < 1.01 ||
                output[key] > 100
            )
        ) {

            output[key] = null;
        }
    }


    return output;
}


// ---------------------------------------------------------------
// REMOVE DUPLICATES
// ---------------------------------------------------------------

function removeDuplicateEvidence(
    items
) {

    const seen =
        new Set();


    return items.filter(
        item => {

            const key =
                [
                    item.type || "",
                    item.source || "",
                    item.url || "",
                    item.snippet || "",
                    item.eventDate || "",
                    item.publishedDate || ""
                ]
                .join("|")
                .toLowerCase();


            if (
                seen.has(key)
            ) {
                return false;
            }


            seen.add(
                key
            );


            return true;
        }
    );
}


// ---------------------------------------------------------------
// COUNT RELEVANCE
// ---------------------------------------------------------------

function countRelevance(
    sources,
    relevance
) {

    return sources.filter(
        item =>
            item.relevance ===
            relevance
    ).length;
}
