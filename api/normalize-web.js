// api/normalize-web.js
//
// TomsonStakes
// Web Data -> Normalize
// Version: V3.3
//
// Main fixes:
// 1. Strict team/entity matching.
// 2. "Concepcion" NEVER matches "Universidad de Concepcion".
// 3. Event date takes precedence over publication date.
// 4. Current fixture H2H pages are not treated as completed H2H results.
// 5. Historical lineups/injuries cannot become current.
// 6. Predicted lineups are separated from confirmed lineups.
// 7. Current odds evidence is separated from undated odds.
// 8. Structured odds extraction.
// 9. Current-match statistics from another club are rejected.
// 10. Historical/future evidence remains available for audit but cannot
//     silently enter current-match analysis.

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                success: false,
                error: "POST method required."
            });
        }

        let body = req.body;

        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: "Request body is not valid JSON."
                });
            }
        }

        if (!body || typeof body !== "object") {
            return res.status(400).json({
                success: false,
                error: "JSON request body is required."
            });
        }

        const input =
            body.normalized && typeof body.normalized === "object"
                ? body.normalized
                : body;

        if (!input.match) {
            return res.status(400).json({
                success: false,
                error: "match object is required."
            });
        }

        const home = String(input.match.home || "").trim();
        const away = String(input.match.away || "").trim();
        const targetDate = String(input.match.date || "").trim();

        if (!home || !away || !targetDate) {
            return res.status(400).json({
                success: false,
                error: "match.home, match.away and match.date are required."
            });
        }

        const target = parseISODate(targetDate);

        if (!target) {
            return res.status(400).json({
                success: false,
                error: "Invalid match date. Expected YYYY-MM-DD."
            });
        }

        const rawSources = collectSources(input);

        const identity = buildTeamIdentity(home, away);

        const normalizedSources = [];

        for (const raw of rawSources) {
            const normalized = normalizeSource(
                raw,
                identity,
                target
            );

            if (normalized) {
                normalizedSources.push(normalized);
            }
        }

        const usefulSources = normalizedSources.filter(
            source => source.teamRelation !== "IRRELEVANT"
        );

        const currentSources = usefulSources.filter(
            source =>
                source.relevance === "CURRENT_MATCH"
        );

        const historicalSources = usefulSources.filter(
            source =>
                source.relevance === "HISTORICAL"
        );

        const futureSources = usefulSources.filter(
            source =>
                source.relevance === "FUTURE"
        );

        const undatedSources = usefulSources.filter(
            source =>
                source.relevance === "UNDATED_TEAM_SOURCE" ||
                source.relevance === "MATCH_SPECIFIC_UNDATED"
        );

        const recentSources = usefulSources.filter(
            source =>
                source.relevance === "RECENT"
        );

        // ------------------------------------------------------------
        // H2H
        // ------------------------------------------------------------

        const h2hSources = normalizedSources
            .filter(source =>
                source.teamRelation === "EXACT_PAIR" &&
                source.type === "h2h" &&
                (
                    source.isH2H === true ||
                    source.h2hScore > 0
                )
            )
            .filter(source =>
                source.relevance !== "FUTURE"
            )
            .map(source => {
                let dataRelevance = "H2H_CONTEXT";

                if (
                    source.relevance === "CURRENT_MATCH"
                ) {
                    dataRelevance =
                        "CURRENT_MATCH_H2H_PAGE";
                }

                return {
                    source: source.source,
                    url: source.url,
                    snippet: source.snippet,
                    relevance: source.relevance,
                    dataRelevance,
                    eventDate: source.eventDate,
                    publishedDate: source.publishedDate
                };
            });

        const historicalH2H = h2hSources.filter(
            item =>
                item.dataRelevance === "H2H_CONTEXT" &&
                item.relevance === "HISTORICAL"
        );

        // Remove duplicate H2H URLs.
        const cleanH2H = dedupeByUrl(h2hSources).slice(0, 8);

        // ------------------------------------------------------------
        // FORM
        // ------------------------------------------------------------

        const formEvidence = {
            home: [],
            away: []
        };

        for (const source of normalizedSources) {
            if (
                source.type !== "form" &&
                !containsFormTerms(source.text)
            ) {
                continue;
            }

            // Never use historical/current fixture pages as recent form.
            if (
                source.relevance !== "RECENT"
            ) {
                continue;
            }

            const sides = determineMentionedSides(
                source.text,
                identity
            );

            if (sides.home) {
                formEvidence.home.push({
                    source: source.source,
                    url: source.url,
                    snippet: source.snippet,
                    relevance: source.relevance,
                    eventDate: source.eventDate,
                    publishedDate: source.publishedDate
                });
            }

            if (sides.away) {
                formEvidence.away.push({
                    source: source.source,
                    url: source.url,
                    snippet: source.snippet,
                    relevance: source.relevance,
                    eventDate: source.eventDate,
                    publishedDate: source.publishedDate
                });
            }
        }

        // ------------------------------------------------------------
        // STATS
        // ------------------------------------------------------------

        const statsEvidence = normalizedSources
            .filter(source =>
                source.type === "stats" &&
                source.teamRelation === "EXACT_PAIR" &&
                source.relevance === "CURRENT_MATCH"
            )
            .filter(source =>
                !source.isWrongClub
            )
            .map(source => ({
                type: "stats",
                source: source.source,
                url: source.url,
                snippet: source.snippet,
                relevance: source.relevance,
                eventDate: source.eventDate,
                publishedDate: source.publishedDate,
                dateBasis: source.dateBasis
            }));

        const undatedStatsEvidence = normalizedSources
            .filter(source =>
                source.type === "stats" &&
                source.teamRelation === "EXACT_PAIR" &&
                (
                    source.relevance === "UNDATED_TEAM_SOURCE" ||
                    source.relevance === "MATCH_SPECIFIC_UNDATED"
                )
            )
            .map(source => ({
                type: "stats",
                source: source.source,
                url: source.url,
                snippet: source.snippet,
                relevance: source.relevance,
                eventDate: source.eventDate,
                publishedDate: source.publishedDate,
                dateBasis: source.dateBasis
            }));

        // ------------------------------------------------------------
        // STAT EXTRACTION
        // ------------------------------------------------------------

        const statValues = extractCurrentStats(
            statsEvidence,
            identity
        );

        // ------------------------------------------------------------
        // INJURIES
        // ------------------------------------------------------------

        const injuries = {
            home: [],
            away: [],
            unknown: []
        };

        const injurySources = normalizedSources.filter(
            source =>
                source.type === "injuries" &&
                source.teamRelation === "EXACT_PAIR"
        );

        for (const source of injurySources) {
            if (
                source.relevance !== "CURRENT_MATCH"
            ) {
                continue;
            }

            const extracted = extractInjurySentences(
                source,
                identity
            );

            injuries.home.push(...extracted.home);
            injuries.away.push(...extracted.away);
            injuries.unknown.push(...extracted.unknown);
        }

        const cleanInjuries = {
            home: dedupeEvidence(injuries.home),
            away: dedupeEvidence(injuries.away),
            unknown: dedupeEvidence(injuries.unknown)
        };

        // ------------------------------------------------------------
        // LINEUPS
        // ------------------------------------------------------------

        const lineupSources = normalizedSources.filter(
            source =>
                source.type === "lineups" &&
                source.teamRelation === "EXACT_PAIR"
        );

        const predictedLineups = [];
        const confirmedLineups = [];
        const lineupMatchEvidence = [];

        for (const source of lineupSources) {
            if (
                source.relevance !== "CURRENT_MATCH" &&
                source.relevance !== "MATCH_SPECIFIC_UNDATED"
            ) {
                continue;
            }

            const status = detectLineupStatus(source.text);

            const evidence = {
                type: "lineups",
                source: source.source,
                url: source.url,
                snippet: source.snippet,
                relevance: source.relevance,
                eventDate: source.eventDate,
                publishedDate: source.publishedDate,
                dateBasis: source.dateBasis,
                status
            };

            lineupMatchEvidence.push(evidence);

            if (status === "CONFIRMED") {
                confirmedLineups.push(evidence);
            } else {
                predictedLineups.push(evidence);
            }
        }

        // ------------------------------------------------------------
        // ODDS
        // ------------------------------------------------------------

        const oddsEvidence = normalizedSources
            .filter(source =>
                source.type === "odds" &&
                source.teamRelation === "EXACT_PAIR" &&
                source.relevance === "CURRENT_MATCH"
            )
            .map(source => ({
                type: "odds",
                source: source.source,
                url: source.url,
                snippet: source.snippet,
                relevance: source.relevance,
                eventDate: source.eventDate,
                publishedDate: source.publishedDate,
                dateBasis: source.dateBasis
            }));

        const undatedOddsEvidence = normalizedSources
            .filter(source =>
                source.type === "odds" &&
                source.teamRelation === "EXACT_PAIR" &&
                (
                    source.relevance === "UNDATED_TEAM_SOURCE" ||
                    source.relevance === "MATCH_SPECIFIC_UNDATED"
                )
            )
            .map(source => ({
                type: "odds",
                source: source.source,
                url: source.url,
                snippet: source.snippet,
                relevance: source.relevance,
                eventDate: source.eventDate,
                publishedDate: source.publishedDate,
                dateBasis: source.dateBasis
            }));

        const odds = extractCurrentOdds(
            oddsEvidence
        );

        // ------------------------------------------------------------
        // QUALITY
        // ------------------------------------------------------------

        const currentMatchSources =
            currentSources.length;

        const quality = {
            totalSources:
                normalizedSources.length,

            currentMatchSources,

            recentSources:
                recentSources.length,

            historicalSources:
                historicalSources.length,

            futureSources:
                futureSources.length,

            undatedTeamSources:
                undatedSources.length,

            irrelevantSources:
                normalizedSources.filter(
                    source =>
                        source.teamRelation === "IRRELEVANT"
                ).length,

            h2hSources:
                cleanH2H.length,

            formEvidence:
                formEvidence.home.length +
                formEvidence.away.length,

            statsEvidence:
                statsEvidence.length,

            undatedStatsEvidence:
                undatedStatsEvidence.length,

            injuryEvidence:
                cleanInjuries.home.length +
                cleanInjuries.away.length,

            injurySources:
                injurySources.length,

            lineupEvidence:
                lineupMatchEvidence.length,

            confirmedLineupEvidence:
                confirmedLineups.length,

            predictedLineupEvidence:
                predictedLineups.length,

            oddsEvidence:
                oddsEvidence.length,

            undatedOddsEvidence:
                undatedOddsEvidence.length
        };

        // ------------------------------------------------------------
        // WARNINGS
        // ------------------------------------------------------------

        const warnings = [];

        if (historicalSources.length > 0) {
            warnings.push(
                "Historical evidence was detected and must not be treated as current-match information."
            );
        }

        if (futureSources.length > 0) {
            warnings.push(
                "Future fixture or future-dated information was detected and excluded from current-match evidence."
            );
        }

        if (undatedSources.length > 0) {
            warnings.push(
                "Some team-related sources had no reliable event date and were kept separately."
            );
        }

        if (
            undatedStatsEvidence.length > 0
        ) {
            warnings.push(
                "Undated statistical sources were retained separately and must not be treated as date-qualified current-match statistics."
            );
        }

        if (
            statsEvidence.length === 0
        ) {
            warnings.push(
                "No date-qualified current-match statistical source was confidently identified."
            );
        }

        if (
            cleanInjuries.home.length === 0 &&
            cleanInjuries.away.length === 0
        ) {
            warnings.push(
                "No current-match injury evidence was confidently attributed to the correct two clubs."
            );
        }

        if (
            predictedLineups.length > 0 &&
            confirmedLineups.length === 0
        ) {
            warnings.push(
                "Predicted lineup evidence exists, but no confirmed starting XI was identified."
            );
        }

        if (
            oddsEvidence.length === 0
        ) {
            warnings.push(
                "No date-qualified current-match odds source was confidently identified."
            );
        }

        if (
            oddsEvidence.length > 0 &&
            !oddsHasStructuredMarket(odds)
        ) {
            warnings.push(
                "Current odds source exists, but structured market extraction is incomplete."
            );
        }

        // ------------------------------------------------------------
        // AVAILABILITY
        // ------------------------------------------------------------

        const dataAvailability = {
            fixture: {
                available: true,
                confidence: currentMatchSources > 0
                    ? "HIGH"
                    : "MEDIUM"
            },

            form: {
                available:
                    formEvidence.home.length > 0 ||
                    formEvidence.away.length > 0,

                confidence:
                    formEvidence.home.length > 0 &&
                    formEvidence.away.length > 0
                        ? "MEDIUM"
                        : "NONE",

                reason:
                    formEvidence.home.length > 0 ||
                    formEvidence.away.length > 0
                        ? null
                        : "No date-qualified recent results extracted."
            },

            h2h: {
                available:
                    historicalH2H.length > 0,

                confidence:
                    historicalH2H.length >= 3
                        ? "MEDIUM"
                        : historicalH2H.length > 0
                            ? "LOW"
                            : "NONE"
            },

            injuries: {
                available:
                    cleanInjuries.home.length > 0 ||
                    cleanInjuries.away.length > 0,

                confidence:
                    cleanInjuries.home.length > 0 &&
                    cleanInjuries.away.length > 0
                        ? "HIGH"
                        : cleanInjuries.home.length > 0 ||
                          cleanInjuries.away.length > 0
                            ? "MEDIUM"
                            : "NONE",

                sourceAvailable:
                    injurySources.length > 0,

                currentEvidence:
                    cleanInjuries.home.length > 0 ||
                    cleanInjuries.away.length > 0
            },

            lineups: {
                sourceAvailable:
                    lineupMatchEvidence.length > 0,

                playersAvailable:
                    lineupMatchEvidence.length > 0,

                confirmed:
                    confirmedLineups.length > 0,

                predicted:
                    predictedLineups.length > 0
            },

            stats: {
                available:
                    statsEvidence.length > 0,

                confidence:
                    statsEvidence.length > 0
                        ? "MEDIUM"
                        : "NONE",

                undatedAvailable:
                    undatedStatsEvidence.length > 0
            },

            xg: {
                available:
                    statValues.xg.home !== null ||
                    statValues.xg.away !== null,

                confidence:
                    statValues.xg.home !== null ||
                    statValues.xg.away !== null
                        ? "MEDIUM"
                        : "NONE"
            },

            odds: {
                sourceAvailable:
                    oddsEvidence.length > 0,

                structured1X2:
                    odds.home !== null ||
                    odds.draw !== null ||
                    odds.away !== null,

                confidence:
                    oddsEvidence.length > 0
                        ? "MEDIUM"
                        : "NONE",

                undatedAvailable:
                    undatedOddsEvidence.length > 0
            }
        };

        // ------------------------------------------------------------
        // FINAL ANALYSIS FLAGS
        // ------------------------------------------------------------

        const analysisReady = {
            exactMatchEvidence:
                currentMatchSources > 0,

            recentEvidence:
                formEvidence.home.length > 0 &&
                formEvidence.away.length > 0,

            h2hEvidence:
                historicalH2H.length > 0,

            formEvidence:
                formEvidence.home.length > 0 ||
                formEvidence.away.length > 0,

            injuryEvidence:
                cleanInjuries.home.length > 0 ||
                cleanInjuries.away.length > 0,

            lineupEvidence:
                lineupMatchEvidence.length > 0,

            statsEvidence:
                statsEvidence.length > 0,

            oddsEvidence:
                oddsEvidence.length > 0,

            structuredOdds:
                oddsHasStructuredMarket(odds),

            actualLineups:
                confirmedLineups.length > 0
        };

        // ------------------------------------------------------------
        // FORM OUTPUT
        // ------------------------------------------------------------

        const form = {
            home: extractFormObjects(
                formEvidence.home
            ),

            away: extractFormObjects(
                formEvidence.away
            )
        };

        // ------------------------------------------------------------
        // FINAL RESPONSE
        // ------------------------------------------------------------

        return res.status(200).json({
            success: true,
            version: "V3.3",

            normalized: {
                match: {
                    home,
                    away,
                    date: targetDate,
                    year: target.getUTCFullYear()
                },

                form,

                formEvidence,

                h2h: cleanH2H,

                goals: {
                    home:
                        statValues.goals.home,
                    away:
                        statValues.goals.away
                },

                xg: {
                    home:
                        statValues.xg.home,
                    away:
                        statValues.xg.away,
                    total:
                        calculateTotal(
                            statValues.xg.home,
                            statValues.xg.away
                        )
                },

                btts: {
                    home:
                        statValues.btts.home,
                    away:
                        statValues.btts.away,
                    h2h:
                        statValues.btts.h2h
                },

                overUnder: {
                    over15:
                        statValues.overUnder.over15,
                    over25:
                        statValues.overUnder.over25,
                    over35:
                        statValues.overUnder.over35,
                    under25:
                        statValues.overUnder.under25,
                    under35:
                        statValues.overUnder.under35
                },

                statsEvidence,

                undatedStatsEvidence,

                injuries: cleanInjuries,

                lineups: {
                    home:
                        confirmedLineups.length > 0
                            ? confirmedLineups[0]
                            : predictedLineups.length > 0
                                ? predictedLineups[0]
                                : null,

                    away:
                        confirmedLineups.length > 0
                            ? confirmedLineups[0]
                            : predictedLineups.length > 0
                                ? predictedLineups[0]
                                : null,

                    matchEvidence:
                        lineupMatchEvidence,

                    predicted:
                        predictedLineups,

                    confirmed:
                        confirmedLineups,

                    unknown: []
                },

                odds,

                oddsEvidence,

                undatedOddsEvidence,

                // Keep every normalized source for audit.
                sources: normalizedSources,

                warnings
            },

            quality,

            dataAvailability,

            analysisReady
        });

    } catch (error) {
        console.error(
            "[normalize-web] error:",
            error
        );

        return res.status(500).json({
            success: false,
            version: "V3.3",
            error: "Web data normalization failed.",
            details: error.message
        });
    }
}


// ================================================================
// SOURCE COLLECTION
// ================================================================

function collectSources(input) {
    const output = [];

    if (Array.isArray(input.allResults)) {
        for (const item of input.allResults) {
            output.push(item);
        }
    }

    if (
        output.length === 0 &&
        Array.isArray(input.searches)
    ) {
        for (const search of input.searches) {
            if (!Array.isArray(search.results)) {
                continue;
            }

            for (const item of search.results) {
                output.push({
                    ...item,
                    type:
                        item.type ||
                        search.type ||
                        "unknown"
                });
            }
        }
    }

    return output;
}


// ================================================================
// TEAM IDENTITY
// ================================================================

function buildTeamIdentity(home, away) {
    return {
        home: createTeamIdentity(home),
        away: createTeamIdentity(away)
    };
}


function createTeamIdentity(team) {
    const normalized = cleanText(team);

    let aliases = [
        normalized
    ];

    if (
        normalized.includes("concepcion") &&
        !normalized.includes("universidad")
    ) {
        aliases = [
            "concepcion",
            "deportes concepcion",
            "d concepcion",
            "d. concepcion",
            "cd concepcion",
            "cd. concepcion"
        ];
    }

    if (
        normalized.includes("o higgins") ||
        normalized.includes("o'higgins") ||
        normalized.includes("ohiggins")
    ) {
        aliases = [
            "o higgins",
            "o'higgins",
            "ohiggins",
            "o higgins fc",
            "o'higgins fc",
            "ohiggins fc"
        ];
    }

    return {
        original: team,
        normalized,
        aliases
    };
}


// ================================================================
// TEXT NORMALIZATION
// ================================================================

function cleanText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/[^a-z0-9'\s.-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


// ================================================================
// STRICT ENTITY MATCHING
// ================================================================

function sanitizeForConcepcionMatching(text) {
    let value = cleanText(text);

    // VERY IMPORTANT:
    // Universidad de Concepcion is NOT Deportes Concepcion.
    value = value.replace(
        /\b(universidad|univ|u)\s*(?:de)?\s*concepcion\b/g,
        " "
    );

    return value;
}


function containsTeam(text, identity) {
    let value = cleanText(text);

    if (
        identity.original
            .toLowerCase()
            .includes("concepcion") &&
        !identity.original
            .toLowerCase()
            .includes("universidad")
    ) {
        value =
            sanitizeForConcepcionMatching(value);
    }

    for (const alias of identity.aliases) {
        const escaped = escapeRegex(
            cleanText(alias)
        );

        const regex = new RegExp(
            `(^|\\s|[-/.])${escaped}(?=\\s|[-/.]|$)`,
            "i"
        );

        if (regex.test(value)) {
            return true;
        }
    }

    return false;
}


function containsWrongConcepcionClub(
    text,
    identity
) {
    if (
        !identity.home.normalized.includes(
            "concepcion"
        )
    ) {
        return false;
    }

    const value = cleanText(text);

    return (
        /\buniversidad\s+(?:de\s+)?concepcion\b/i.test(
            value
        ) ||
        /\buniv\.?\s+(?:de\s+)?concepcion\b/i.test(
            value
        ) ||
        /\bu\.?\s+(?:de\s+)?concepcion\b/i.test(
            value
        )
    );
}


function determineTeamRelation(
    text,
    identity
) {
    const homeFound =
        containsTeam(
            text,
            identity.home
        );

    const awayFound =
        containsTeam(
            text,
            identity.away
        );

    const wrongClub =
        containsWrongConcepcionClub(
            text,
            identity
        );

    if (wrongClub && !homeFound) {
        return {
            relation: "IRRELEVANT",
            homeFound: false,
            awayFound,
            wrongClub: true
        };
    }

    if (homeFound && awayFound) {
        return {
            relation: "EXACT_PAIR",
            homeFound: true,
            awayFound: true,
            wrongClub: false
        };
    }

    if (homeFound) {
        return {
            relation: "HOME_ONLY",
            homeFound: true,
            awayFound: false,
            wrongClub: false
        };
    }

    if (awayFound) {
        return {
            relation: "AWAY_ONLY",
            homeFound: false,
            awayFound: true,
            wrongClub: false
        };
    }

    return {
        relation: "IRRELEVANT",
        homeFound: false,
        awayFound: false,
        wrongClub: false
    };
}


// ================================================================
// SOURCE NORMALIZATION
// ================================================================

function normalizeSource(
    raw,
    identity,
    target
) {
    const source = String(
        raw.source ||
        raw.title ||
        ""
    ).trim();

    const title = String(
        raw.title ||
        source
    ).trim();

    const url = String(
        raw.url ||
        raw.link ||
        ""
    ).trim();

    const snippet = String(
        raw.snippet ||
        ""
    ).trim();

    const text = [
        title,
        source,
        snippet,
        url
    ].join(" ");

    const relation =
        determineTeamRelation(
            text,
            identity
        );

    const publishedDate =
        parseSourceDate(
            raw.date
        );

    const eventInfo =
        extractEventDate(
            title,
            snippet,
            url,
            target
        );

    const eventDate =
        eventInfo.date;

    const dateBasis =
        eventInfo.basis;

    const isH2H =
        detectH2H(text);

    const h2hScore =
        calculateH2HScore(text);

    const sourceType =
        normalizeSourceType(
            raw.type,
            text
        );

    if (
        relation.relation === "IRRELEVANT"
    ) {
        return {
            type: sourceType,
            source,
            url,
            snippet,
            text,

            teamRelation:
                "IRRELEVANT",

            relevance:
                "IRRELEVANT",

            eventDate:
                formatDate(eventDate),

            publishedDate:
                formatDate(publishedDate),

            dateBasis:
                dateBasis || null,

            isH2H,
            h2hScore,

            isWrongClub:
                relation.wrongClub
        };
    }

    const relevance =
        classifyRelevance({
            text,
            url,
            title,
            sourceType,
            relation:
                relation.relation,
            eventDate,
            publishedDate,
            target,
            isH2H
        });

    return {
        type: sourceType,
        source,
        url,
        snippet,
        text,

        teamRelation:
            relation.relation,

        relevance,

        eventDate:
            formatDate(eventDate),

        publishedDate:
            formatDate(publishedDate),

        dateBasis:
            dateBasis || null,

        isH2H,
        h2hScore,

        isWrongClub:
            relation.wrongClub
    };
}


// ================================================================
// SOURCE TYPE
// ================================================================

function normalizeSourceType(
    suppliedType,
    text
) {
    const type =
        cleanText(suppliedType);

    if (
        [
            "form",
            "h2h",
            "stats",
            "injuries",
            "lineups",
            "odds"
        ].includes(type)
    ) {
        return type;
    }

    const value =
        cleanText(text);

    if (
        /head to head|h2h|past matches|previous meetings/
            .test(value)
    ) {
        return "h2h";
    }

    if (
        /injur|suspend|unavailable|doubtful/
            .test(value)
    ) {
        return "injuries";
    }

    if (
        /lineup|starting xi|starting 11|predicted xi/
            .test(value)
    ) {
        return "lineups";
    }

    if (
        /odds|1x2|over 2\.5|under 2\.5|btts/
            .test(value)
    ) {
        return "odds";
    }

    if (
        /xg|statistics|stats|goals per match|clean sheets/
            .test(value)
    ) {
        return "stats";
    }

    if (
        /last 5|last five|recent form|recent results/
            .test(value)
    ) {
        return "form";
    }

    return "unknown";
}


// ================================================================
// RELEVANCE
// ================================================================

function classifyRelevance({
    text,
    url,
    title,
    sourceType,
    relation,
    eventDate,
    publishedDate,
    target,
    isH2H
}) {
    if (relation === "IRRELEVANT") {
        return "IRRELEVANT";
    }

    // ------------------------------------------------------------
    // Exact current event date
    // ------------------------------------------------------------

    if (
        eventDate &&
        sameDay(eventDate, target)
    ) {
        return "CURRENT_MATCH";
    }

    // ------------------------------------------------------------
    // Time-zone adjacent current fixture.
    //
    // Example:
    // target = Sep 30 UTC
    // source = Oct 1 00:00 UTC+01
    // ------------------------------------------------------------

    if (
        eventDate &&
        isTimezoneAdjacentCurrent(
            eventDate,
            target,
            text
        )
    ) {
        return "CURRENT_MATCH";
    }

    // ------------------------------------------------------------
    // Future
    // ------------------------------------------------------------

    if (
        eventDate &&
        eventDate > target
    ) {
        return "FUTURE";
    }

    // ------------------------------------------------------------
    // Historical
    // ------------------------------------------------------------

    if (
        eventDate &&
        eventDate < target
    ) {
        return "HISTORICAL";
    }

    // ------------------------------------------------------------
    // Match-specific but undated.
    //
    // Important for pages such as:
    // "Concepcion - O'Higgins : Predicted Lineups"
    // ------------------------------------------------------------

    if (
        relation === "EXACT_PAIR" &&
        isMatchSpecificUndatedPage(
            title,
            url,
            text,
            sourceType,
            isH2H
        )
    ) {
        return "MATCH_SPECIFIC_UNDATED";
    }

    // ------------------------------------------------------------
    // Recent publication is NOT enough for current match.
    //
    // It can only become RECENT when the source describes
    // an actual previous team event.
    // ------------------------------------------------------------

    if (
        eventDate &&
        eventDate < target &&
        withinDays(
            eventDate,
            target,
            45
        )
    ) {
        return "RECENT";
    }

    // ------------------------------------------------------------
    // Undated team information.
    // ------------------------------------------------------------

    return "UNDATED_TEAM_SOURCE";
}


// ================================================================
// CURRENT MATCH PAGE DETECTION
// ================================================================

function isMatchSpecificUndatedPage(
    title,
    url,
    text,
    sourceType,
    isH2H
) {
    const value =
        cleanText(
            `${title} ${url} ${text}`
        );

    // Never use a generic H2H page as current simply because
    // it mentions both teams.
    if (
        isH2H &&
        !(
            /live score|prediction|preview|upcoming|30 09|09 30/
                .test(value)
        )
    ) {
        return false;
    }

    if (
        sourceType === "lineups" &&
        /predicted lineup|predicted lineups|starting xi|starting 11|lineups/
            .test(value)
    ) {
        return true;
    }

    if (
        sourceType === "injuries" &&
        /injur|suspend|unavailable|doubtful|team news/
            .test(value)
    ) {
        // Injury source without date remains conservative.
        return false;
    }

    if (
        sourceType === "odds" &&
        /prediction|odds|betting|over 2\.5|under 2\.5|1x2/
            .test(value)
    ) {
        return true;
    }

    if (
        sourceType === "stats" &&
        /match statistics|match stats|prediction.*stats/
            .test(value)
    ) {
        return true;
    }

    if (
        /live score.*h2h|h2h.*live score/
            .test(value)
    ) {
        return true;
    }

    return false;
}


// ================================================================
// H2H DETECTION
// ================================================================

function detectH2H(text) {
    const value =
        cleanText(text);

    return (
        /\bh2h\b/.test(value) ||
        /head to head/.test(value) ||
        /head-to-head/.test(value) ||
        /past matches/.test(value) ||
        /previous meetings/.test(value)
    );
}


function calculateH2HScore(text) {
    const value =
        cleanText(text);

    let score = 0;

    if (/\bh2h\b/.test(value)) {
        score += 3;
    }

    if (/head to head/.test(value)) {
        score += 3;
    }

    if (/head-to-head/.test(value)) {
        score += 3;
    }

    if (/past matches/.test(value)) {
        score += 2;
    }

    if (/previous meetings/.test(value)) {
        score += 2;
    }

    return score;
}


// ================================================================
// FORM
// ================================================================

function containsFormTerms(text) {
    const value =
        cleanText(text);

    return (
        /last 5/.test(value) ||
        /last five/.test(value) ||
        /recent form/.test(value) ||
        /recent results/.test(value)
    );
}


function extractFormObjects(evidence) {
    return evidence.map(item => ({
        source: item.source,
        url: item.url,
        snippet: item.snippet,
        relevance: item.relevance,
        eventDate: item.eventDate,
        publishedDate: item.publishedDate
    }));
}


// ================================================================
// STATS
// ================================================================

function extractCurrentStats(
    evidence,
    identity
) {
    const output = {
        goals: {
            home: null,
            away: null
        },

        xg: {
            home: null,
            away: null
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

    for (const item of evidence) {
        const text =
            cleanText(
                item.snippet
            );

        // Only use actual exact-pair evidence.
        if (
            containsWrongConcepcionClub(
                text,
                identity
            )
        ) {
            continue;
        }

        const xg =
            extractXG(text);

        if (
            xg.home !== null &&
            output.xg.home === null
        ) {
            output.xg.home =
                xg.home;
        }

        if (
            xg.away !== null &&
            output.xg.away === null
        ) {
            output.xg.away =
                xg.away;
        }

        const btts =
            extractBTTS(text);

        if (
            btts.home !== null &&
            output.btts.home === null
        ) {
            output.btts.home =
                btts.home;
        }

        if (
            btts.away !== null &&
            output.btts.away === null
        ) {
            output.btts.away =
                btts.away;
        }

        const totals =
            extractTotals(text);

        for (
            const key of Object.keys(
                totals
            )
        ) {
            if (
                totals[key] !== null &&
                output.overUnder[key] === null
            ) {
                output.overUnder[key] =
                    totals[key];
            }
        }
    }

    return output;
}


function extractXG(text) {
    let home = null;
    let away = null;

    const values = [];

    const regex =
        /\b(\d+(?:\.\d+)?)\s*xg\b/gi;

    let match;

    while (
        (match = regex.exec(text))
    ) {
        values.push(
            Number(match[1])
        );
    }

    if (values.length >= 2) {
        home = values[0];
        away = values[1];
    }

    return {
        home,
        away
    };
}


function extractBTTS(text) {
    return {
        home: extractPercentageNear(
            text,
            "home",
            "btts"
        ),

        away: extractPercentageNear(
            text,
            "away",
            "btts"
        )
    };
}


function extractPercentageNear(
    text,
    side,
    keyword
) {
    const regex =
        new RegExp(
            `${side}.{0,80}${keyword}.{0,80}(\\d+(?:\\.\\d+)?)%`,
            "i"
        );

    const match =
        text.match(regex);

    if (!match) {
        return null;
    }

    return Number(
        match[1]
    );
}


function extractTotals(text) {
    return {
        over15:
            extractMarketPercentage(
                text,
                "over",
                "1.5"
            ),

        over25:
            extractMarketPercentage(
                text,
                "over",
                "2.5"
            ),

        over35:
            extractMarketPercentage(
                text,
                "over",
                "3.5"
            ),

        under25:
            extractMarketPercentage(
                text,
                "under",
                "2.5"
            ),

        under35:
            extractMarketPercentage(
                text,
                "under",
                "3.5"
            )
    };
}


function extractMarketPercentage(
    text,
    direction,
    line
) {
    const regex =
        new RegExp(
            `${direction}\\s*${escapeRegex(line)}.{0,50}(\\d+(?:\\.\\d+)?)%`,
            "i"
        );

    const match =
        text.match(regex);

    if (!match) {
        return null;
    }

    return Number(
        match[1]
    );
}


// ================================================================
// INJURIES
// ================================================================

function extractInjurySentences(
    source,
    identity
) {
    const result = {
        home: [],
        away: [],
        unknown: []
    };

    const sentences =
        splitIntoSentences(
            source.snippet
        );

    for (const sentence of sentences) {
        if (
            !hasInjuryTerms(sentence)
        ) {
            continue;
        }

        const sides =
            determineMentionedSides(
                sentence,
                identity
            );

        const evidence = {
            team: null,
            text: sentence.trim(),
            source: source.source,
            url: source.url,
            eventDate: source.eventDate,
            publishedDate:
                source.publishedDate
        };

        if (
            sides.home &&
            !sides.away
        ) {
            evidence.team = "home";
            result.home.push(evidence);
        } else if (
            sides.away &&
            !sides.home
        ) {
            evidence.team = "away";
            result.away.push(evidence);
        } else {
            result.unknown.push(evidence);
        }
    }

    return result;
}


function hasInjuryTerms(text) {
    const value =
        cleanText(text);

    return (
        /injur/.test(value) ||
        /suspend/.test(value) ||
        /unavailable/.test(value) ||
        /doubtful/.test(value) ||
        /out /.test(value) ||
        /\bout$/.test(value)
    );
}


function determineMentionedSides(
    text,
    identity
) {
    return {
        home:
            containsTeam(
                text,
                identity.home
            ),

        away:
            containsTeam(
                text,
                identity.away
            )
    };
}


// ================================================================
// LINEUPS
// ================================================================

function detectLineupStatus(text) {
    const value =
        cleanText(text);

    if (
        /confirmed lineup/.test(value) ||
        /confirmed starting xi/.test(value) ||
        /starting xi confirmed/.test(value) ||
        /official lineup/.test(value) ||
        /official starting xi/.test(value)
    ) {
        return "CONFIRMED";
    }

    if (
        /predicted lineup/.test(value) ||
        /predicted lineups/.test(value) ||
        /predicted xi/.test(value) ||
        /starting 11/.test(value) ||
        /predicted starting/.test(value)
    ) {
        return "PREDICTED";
    }

    return "UNKNOWN";
}


// ================================================================
// ODDS
// ================================================================

function extractCurrentOdds(
    evidence
) {
    const output = {
        home: null,
        draw: null,
        away: null,

        over15: null,
        under15: null,

        over25: null,
        under25: null,

        over35: null,
        under35: null,

        bttsYes: null,
        bttsNo: null
    };

    for (const item of evidence) {
        const text =
            cleanText(
                item.snippet
            );

        // --------------------------------------------------------
        // Probability-based odds
        // --------------------------------------------------------

        const homeProbability =
            extractProbability(
                text,
                "home"
            );

        if (
            homeProbability !== null &&
            output.home === null
        ) {
            output.home =
                homeProbability;
        }

        const drawProbability =
            extractProbability(
                text,
                "draw"
            );

        if (
            drawProbability !== null &&
            output.draw === null
        ) {
            output.draw =
                drawProbability;
        }

        const awayProbability =
            extractProbability(
                text,
                "away"
            );

        if (
            awayProbability !== null &&
            output.away === null
        ) {
            output.away =
                awayProbability;
        }

        // --------------------------------------------------------
        // Decimal odds
        // --------------------------------------------------------

        const over25 =
            extractDecimalOdds(
                text,
                "over",
                "2.5"
            );

        if (
            over25 !== null &&
            output.over25 === null
        ) {
            output.over25 =
                over25;
        }

        const under25 =
            extractDecimalOdds(
                text,
                "under",
                "2.5"
            );

        if (
            under25 !== null &&
            output.under25 === null
        ) {
            output.under25 =
                under25;
        }

        const over15 =
            extractDecimalOdds(
                text,
                "over",
                "1.5"
            );

        if (
            over15 !== null &&
            output.over15 === null
        ) {
            output.over15 =
                over15;
        }

        const under15 =
            extractDecimalOdds(
                text,
                "under",
                "1.5"
            );

        if (
            under15 !== null &&
            output.under15 === null
        ) {
            output.under15 =
                under15;
        }

        const over35 =
            extractDecimalOdds(
                text,
                "over",
                "3.5"
            );

        if (
            over35 !== null &&
            output.over35 === null
        ) {
            output.over35 =
                over35;
        }

        const under35 =
            extractDecimalOdds(
                text,
                "under",
                "3.5"
            );

        if (
            under35 !== null &&
            output.under35 === null
        ) {
            output.under35 =
                under35;
        }

        const bttsYes =
            extractDecimalOdds(
                text,
                "btts yes"
            );

        if (
            bttsYes !== null &&
            output.bttsYes === null
        ) {
            output.bttsYes =
                bttsYes;
        }

        const bttsNo =
            extractDecimalOdds(
                text,
                "btts no"
            );

        if (
            bttsNo !== null &&
            output.bttsNo === null
        ) {
            output.bttsNo =
                bttsNo;
        }
    }

    return output;
}


function extractProbability(
    text,
    side
) {
    const patterns = {
        home:
            /(?:home|deportes concepcion|concepcion)[^%]{0,80}(?:probability|chance)\s*[:\-]?\s*(\d+(?:\.\d+)?)%/i,

        draw:
            /draw[^%]{0,80}(?:probability|chance)\s*[:\-]?\s*(\d+(?:\.\d+)?)%/i,

        away:
            /(?:away|o'higgins|ohiggins)[^%]{0,80}(?:probability|chance)\s*[:\-]?\s*(\d+(?:\.\d+)?)%/i
    };

    const regex =
        patterns[side];

    if (!regex) {
        return null;
    }

    const match =
        text.match(regex);

    if (!match) {
        return null;
    }

    return Number(
        match[1]
    );
}


function extractDecimalOdds(
    text,
    market,
    line
) {
    let regex;

    if (
        market === "btts yes" ||
        market === "btts no"
    ) {
        regex =
            new RegExp(
                `${escapeRegex(market)}[^0-9]{0,30}(\\d+(?:\\.\\d+)?)`,
                "i"
            );
    } else {
        regex =
            new RegExp(
                `${escapeRegex(market)}\\s*${line ? escapeRegex(line) : ""}[^0-9]{0,30}(\\d+(?:\\.\\d+)?)`,
                "i"
            );
    }

    const match =
        text.match(regex);

    if (!match) {
        return null;
    }

    const value =
        Number(match[1]);

    // Football decimal odds below 1.01 are not useful.
    if (
        !Number.isFinite(value) ||
        value < 1.01
    ) {
        return null;
    }

    return value;
}


function oddsHasStructuredMarket(
    odds
) {
    return (
        odds.home !== null ||
        odds.draw !== null ||
        odds.away !== null ||
        odds.over15 !== null ||
        odds.under15 !== null ||
        odds.over25 !== null ||
        odds.under25 !== null ||
        odds.over35 !== null ||
        odds.under35 !== null ||
        odds.bttsYes !== null ||
        odds.bttsNo !== null
    );
}


// ================================================================
// DATE PARSING
// ================================================================

function extractEventDate(
    title,
    snippet,
    url,
    target
) {
    const sources = [
        {
            value: title,
            basis: "TEXT_DATE"
        },
        {
            value: snippet,
            basis: "TEXT_DATE"
        },
        {
            value: url,
            basis: "URL_DATE"
        }
    ];

    const candidates = [];

    for (const item of sources) {
        const dates =
            extractDatesFromText(
                item.value,
                target
            );

        for (const date of dates) {
            candidates.push({
                date,
                basis: item.basis,
                value: item.value
            });
        }
    }

    if (candidates.length === 0) {
        return {
            date: null,
            basis: null
        };
    }

    // Prefer exact target date.
    const exact =
        candidates.find(
            item =>
                sameDay(
                    item.date,
                    target
                )
        );

    if (exact) {
        return {
            date: exact.date,
            basis: exact.basis
        };
    }

    // Otherwise use the earliest explicit event date
    // from title/snippet/url.
    return {
        date: candidates[0].date,
        basis: candidates[0].basis
    };
}


function extractDatesFromText(
    text,
    target
) {
    const value =
        String(text || "");

    const results = [];

    // YYYY-MM-DD
    const isoRegex =
        /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g;

    let match;

    while (
        (match = isoRegex.exec(value))
    ) {
        const date =
            makeDate(
                Number(match[1]),
                Number(match[2]),
                Number(match[3])
            );

        if (date) {
            results.push(date);
        }
    }

    // Month name + day + year
    const monthFirstRegex =
        /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun(?:day)?)[a-z]*,?\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi;

    while (
        (match =
            monthFirstRegex.exec(value))
    ) {
        const month =
            monthNumber(
                match[1]
            );

        if (month) {
            const date =
                makeDate(
                    Number(match[3]),
                    month,
                    Number(match[2])
                );

            if (date) {
                results.push(date);
            }
        }
    }

    // Normal Month Day, Year
    const normalMonthFirst =
        /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi;

    while (
        (match =
            normalMonthFirst.exec(value))
    ) {
        const month =
            monthNumber(
                match[1]
            );

        if (month) {
            const date =
                makeDate(
                    Number(match[3]),
                    month,
                    Number(match[2])
                );

            if (date) {
                results.push(date);
            }
        }
    }

    // Day Month Year
    const dayMonthYear =
        /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(20\d{2})\b/gi;

    while (
        (match =
            dayMonthYear.exec(value))
    ) {
        const month =
            monthNumber(
                match[2]
            );

        if (month) {
            const date =
                makeDate(
                    Number(match[3]),
                    month,
                    Number(match[1])
                );

            if (date) {
                results.push(date);
            }
        }
    }

    // Numeric MM/DD/YYYY or DD/MM/YYYY
    const numeric =
        /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g;

    while (
        (match =
            numeric.exec(value))
    ) {
        const first =
            Number(match[1]);

        const second =
            Number(match[2]);

        const year =
            Number(match[3]);

        // If one side > 12, interpretation is obvious.
        if (first > 12) {
            const date =
                makeDate(
                    year,
                    second,
                    first
                );

            if (date) {
                results.push(date);
            }

            continue;
        }

        if (second > 12) {
            const date =
                makeDate(
                    year,
                    first,
                    second
                );

            if (date) {
                results.push(date);
            }

            continue;
        }

        // Ambiguous numeric date:
        // produce both and let target-date matching choose.
        const us =
            makeDate(
                year,
                first,
                second
            );

        const eu =
            makeDate(
                year,
                second,
                first
            );

        if (us) {
            results.push(us);
        }

        if (
            eu &&
            !(
                us &&
                sameDay(us, eu)
            )
        ) {
            results.push(eu);
        }
    }

    // Month + day without year.
    // Infer target year only when this is useful.
    const monthDay =
        /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;

    while (
        (match =
            monthDay.exec(value))
    ) {
        const month =
            monthNumber(
                match[1]
            );

        if (!month) {
            continue;
        }

        const day =
            Number(match[2]);

        const year =
            target.getUTCFullYear();

        const date =
            makeDate(
                year,
                month,
                day
            );

        if (date) {
            results.push(date);
        }
    }

    return uniqueDates(results);
}


function parseSourceDate(value) {
    if (!value) {
        return null;
    }

    if (
        value instanceof Date
    ) {
        return validDate(value)
            ? value
            : null;
    }

    const dates =
        extractDatesFromText(
            String(value),
            new Date()
        );

    return dates.length > 0
        ? dates[0]
        : null;
}


function parseISODate(value) {
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
            value
        )
    ) {
        return null;
    }

    const parts =
        value.split("-").map(Number);

    return makeDate(
        parts[0],
        parts[1],
        parts[2]
    );
}


function makeDate(
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


function monthNumber(value) {
    const month =
        cleanText(value);

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

    return months[month] || null;
}


// ================================================================
// DATE UTILITIES
// ================================================================

function isTimezoneAdjacentCurrent(
    eventDate,
    target,
    text
) {
    if (!eventDate || !target) {
        return false;
    }

    const diff =
        Math.round(
            (
                eventDate.getTime() -
                target.getTime()
            ) /
            86400000
        );

    if (diff !== 1) {
        return false;
    }

    const value =
        String(text || "");

    return (
        /\butc\s*[+-]\d{1,2}/i.test(
            value
        ) ||
        /\bgmt\s*[+-]\d{1,2}/i.test(
            value
        ) ||
        /\b\d{1,2}:\d{2}\b/.test(
            value
        )
    );
}


function sameDay(
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


function withinDays(
    earlier,
    later,
    days
) {
    if (!earlier || !later) {
        return false;
    }

    const diff =
        Math.abs(
            later.getTime() -
            earlier.getTime()
        ) /
        86400000;

    return diff <= days;
}


function validDate(date) {
    return (
        date instanceof Date &&
        !Number.isNaN(
            date.getTime()
        )
    );
}


function formatDate(date) {
    if (!validDate(date)) {
        return null;
    }

    return date
        .toISOString()
        .slice(0, 10);
}


function uniqueDates(
    dates
) {
    const seen = new Set();
    const output = [];

    for (const date of dates) {
        if (!validDate(date)) {
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


// ================================================================
// EVIDENCE UTILITIES
// ================================================================

function dedupeByUrl(
    items
) {
    const seen = new Set();

    return items.filter(item => {
        const key =
            item.url ||
            item.source;

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);

        return true;
    });
}


function dedupeEvidence(
    items
) {
    const seen = new Set();

    return items.filter(item => {
        const key = [
            item.team,
            item.text,
            item.url
        ].join("|");

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);

        return true;
    });
}


function splitIntoSentences(
    text
) {
    return String(text || "")
        .split(
            /(?<=[.!?])\s+|\s*;\s*/
        )
        .map(item => item.trim())
        .filter(Boolean);
}


function calculateTotal(
    a,
    b
) {
    if (
        a === null ||
        b === null
    ) {
        return null;
    }

    return Number(
        (
            a + b
        ).toFixed(2)
    );
}


function escapeRegex(
    value
) {
    return String(value)
        .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
}
