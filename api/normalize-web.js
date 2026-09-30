// api/normalize-web.js
//
// TomsonStakes
// Web Data -> Normalize
// Version: V3.4
//
// PURPOSE
// -------
// Convert mixed web-search football evidence into safe, auditable,
// match-specific evidence.
//
// IMPORTANT DESIGN RULE
// ---------------------
// A source may be:
//   - useful for the current match
//   - recent team evidence
//   - historical audit evidence
//   - future evidence
//   - undated evidence
//   - rejected evidence
//
// Historical / future / irrelevant evidence is NEVER silently promoted
// into current-match analysis.
//
// Major fixes in V3.4
// -------------------
// 1. Strict Deportes Concepcion vs Universidad de Concepcion separation.
// 2. Event date is separated from publication date.
// 3. Multiple dates on one page no longer automatically mean the first
//    date is the page's event date.
// 4. RECENT is evaluated BEFORE HISTORICAL.
// 5. Historical match reports cannot become current injuries.
// 6. Historical match reports cannot become current statistics.
// 7. Current H2H fixture pages are not completed H2H results.
// 8. HOME_ONLY / AWAY_ONLY evidence cannot silently become H2H.
// 9. Predicted and confirmed lineups remain separate.
// 10. One lineup source is not duplicated into both home and away.
// 11. Current odds remain separate from undated/historical odds.
// 12. Current stats require current-match qualification.
// 13. Publication date is never treated as event date.
// 14. Source rejection reason is retained for audit.
// 15. Mixed-date pages are classified conservatively.
// 16. Current fixture evidence gets stronger matching rules.
// 17. Search-result snippets containing standings are not treated as
//     match statistics merely because they contain numbers.
// 18. H2H pages involving Universidad de Concepcion are rejected when
//     the target club is Deportes Concepcion.
// 19. Source type supplied by the crawler is treated as a hint, not truth.
// 20. analysisReady only becomes true for evidence that actually passed
//     the relevant safety checks.
//

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
            body.normalized &&
            typeof body.normalized === "object"
                ? body.normalized
                : body;

        if (!input.match) {
            return res.status(400).json({
                success: false,
                error: "match object is required."
            });
        }

        const home =
            String(input.match.home || "").trim();

        const away =
            String(input.match.away || "").trim();

        const targetDate =
            String(input.match.date || "").trim();

        if (!home || !away || !targetDate) {
            return res.status(400).json({
                success: false,
                error:
                    "match.home, match.away and match.date are required."
            });
        }

        const target =
            parseISODate(targetDate);

        if (!target) {
            return res.status(400).json({
                success: false,
                error:
                    "Invalid match date. Expected YYYY-MM-DD."
            });
        }

        const rawSources =
            collectSources(input);

        const identity =
            buildTeamIdentity(home, away);

        const normalizedSources = [];

        for (
            let index = 0;
            index < rawSources.length;
            index++
        ) {
            const normalized =
                normalizeSource(
                    rawSources[index],
                    identity,
                    target,
                    index
                );

            if (normalized) {
                normalizedSources.push(
                    normalized
                );
            }
        }

        const usefulSources =
            normalizedSources.filter(
                source =>
                    source.teamRelation !==
                    "IRRELEVANT" &&
                    !source.rejected
            );

        const currentSources =
            usefulSources.filter(
                source =>
                    source.relevance ===
                    "CURRENT_MATCH"
            );

        const historicalSources =
            usefulSources.filter(
                source =>
                    source.relevance ===
                    "HISTORICAL"
            );

        const futureSources =
            usefulSources.filter(
                source =>
                    source.relevance ===
                    "FUTURE"
            );

        const undatedSources =
            usefulSources.filter(
                source =>
                    source.relevance ===
                        "UNDATED_TEAM_SOURCE" ||
                    source.relevance ===
                        "MATCH_SPECIFIC_UNDATED"
            );

        const recentSources =
            usefulSources.filter(
                source =>
                    source.relevance ===
                    "RECENT"
            );

        // ============================================================
        // H2H
        // ============================================================

        const h2hSources =
            normalizedSources
                .filter(
                    source =>
                        source.teamRelation ===
                            "EXACT_PAIR" &&
                        source.type === "h2h" &&
                        !source.rejected &&
                        (
                            source.isH2H === true ||
                            source.h2hScore > 0
                        )
                )
                .filter(
                    source =>
                        source.relevance ===
                            "HISTORICAL"
                )
                .map(source => ({
                    source:
                        source.source,

                    title:
                        source.title,

                    url:
                        source.url,

                    snippet:
                        source.snippet,

                    relevance:
                        source.relevance,

                    dataRelevance:
                        "H2H_CONTEXT",

                    eventDate:
                        source.eventDate,

                    publishedDate:
                        source.publishedDate,

                    dateBasis:
                        source.dateBasis
                }));

        const historicalH2H =
            h2hSources;

        const cleanH2H =
            dedupeByUrl(
                h2hSources
            ).slice(0, 10);

        // ============================================================
        // FORM
        // ============================================================

        const formEvidence = {
            home: [],
            away: []
        };

        for (
            const source of normalizedSources
        ) {
            if (
                source.rejected
            ) {
                continue;
            }

            if (
                source.type !== "form" &&
                !containsFormTerms(
                    source.text
                )
            ) {
                continue;
            }

            // Form must describe an actual previous team event.
            // A current fixture page merely mentioning "recent form"
            // is not itself a completed result.
            if (
                source.relevance !==
                "RECENT"
            ) {
                continue;
            }

            const sides =
                determineMentionedSides(
                    source.text,
                    identity
                );

            const evidence = {
                source:
                    source.source,

                title:
                    source.title,

                url:
                    source.url,

                snippet:
                    source.snippet,

                relevance:
                    source.relevance,

                eventDate:
                    source.eventDate,

                publishedDate:
                    source.publishedDate,

                dateBasis:
                    source.dateBasis
            };

            if (sides.home) {
                formEvidence.home.push(
                    evidence
                );
            }

            if (sides.away) {
                formEvidence.away.push(
                    evidence
                );
            }
        }

        // ============================================================
        // STATS
        // ============================================================

        const statsEvidence =
            normalizedSources
                .filter(
                    source =>
                        source.type === "stats" &&
                        source.teamRelation ===
                            "EXACT_PAIR" &&
                        source.relevance ===
                            "CURRENT_MATCH" &&
                        !source.rejected &&
                        !source.isWrongClub
                )
                .filter(
                    source =>
                        isCurrentStatsEvidence(
                            source
                        )
                )
                .map(source => ({
                    type: "stats",

                    source:
                        source.source,

                    title:
                        source.title,

                    url:
                        source.url,

                    snippet:
                        source.snippet,

                    relevance:
                        source.relevance,

                    eventDate:
                        source.eventDate,

                    publishedDate:
                        source.publishedDate,

                    dateBasis:
                        source.dateBasis
                }));

        const undatedStatsEvidence =
            normalizedSources
                .filter(
                    source =>
                        source.type === "stats" &&
                        source.teamRelation ===
                            "EXACT_PAIR" &&
                        (
                            source.relevance ===
                                "UNDATED_TEAM_SOURCE" ||
                            source.relevance ===
                                "MATCH_SPECIFIC_UNDATED"
                        ) &&
                        !source.rejected
                )
                .map(source => ({
                    type: "stats",

                    source:
                        source.source,

                    title:
                        source.title,

                    url:
                        source.url,

                    snippet:
                        source.snippet,

                    relevance:
                        source.relevance,

                    eventDate:
                        source.eventDate,

                    publishedDate:
                        source.publishedDate,

                    dateBasis:
                        source.dateBasis
                }));

        const statValues =
            extractCurrentStats(
                statsEvidence,
                identity
            );

        // ============================================================
        // INJURIES
        // ============================================================

        const injuries = {
            home: [],
            away: [],
            unknown: []
        };

        const injurySources =
            normalizedSources.filter(
                source =>
                    source.type === "injuries" &&
                    source.teamRelation ===
                        "EXACT_PAIR"
            );

        for (
            const source of injurySources
        ) {
            if (
                source.rejected
            ) {
                continue;
            }

            if (
                source.relevance !==
                "CURRENT_MATCH"
            ) {
                continue;
            }

            // A historical match report is never current injury evidence.
            if (
                isHistoricalMatchReport(
                    source
                )
            ) {
                continue;
            }

            const extracted =
                extractInjurySentences(
                    source,
                    identity
                );

            injuries.home.push(
                ...extracted.home
            );

            injuries.away.push(
                ...extracted.away
            );

            injuries.unknown.push(
                ...extracted.unknown
            );
        }

        const cleanInjuries = {
            home:
                dedupeEvidence(
                    injuries.home
                ),

            away:
                dedupeEvidence(
                    injuries.away
                ),

            unknown:
                dedupeEvidence(
                    injuries.unknown
                )
        };

        // ============================================================
        // LINEUPS
        // ============================================================

        const lineupSources =
            normalizedSources.filter(
                source =>
                    source.type === "lineups" &&
                    source.teamRelation ===
                        "EXACT_PAIR" &&
                    !source.rejected &&
                    (
                        source.relevance ===
                            "CURRENT_MATCH" ||
                        source.relevance ===
                            "MATCH_SPECIFIC_UNDATED"
                    )
            );

        const predictedLineups = [];
        const confirmedLineups = [];
        const lineupMatchEvidence = [];

        for (
            const source of lineupSources
        ) {
            const status =
                detectLineupStatus(
                    source.text
                );

            const evidence = {
                type: "lineups",

                source:
                    source.source,

                title:
                    source.title,

                url:
                    source.url,

                snippet:
                    source.snippet,

                relevance:
                    source.relevance,

                eventDate:
                    source.eventDate,

                publishedDate:
                    source.publishedDate,

                dateBasis:
                    source.dateBasis,

                status
            };

            lineupMatchEvidence.push(
                evidence
            );

            if (
                status === "CONFIRMED"
            ) {
                confirmedLineups.push(
                    evidence
                );
            } else {
                predictedLineups.push(
                    evidence
                );
            }
        }

        // ============================================================
        // ODDS
        // ============================================================

        const oddsEvidence =
            normalizedSources
                .filter(
                    source =>
                        source.type === "odds" &&
                        source.teamRelation ===
                            "EXACT_PAIR" &&
                        source.relevance ===
                            "CURRENT_MATCH" &&
                        !source.rejected
                )
                .map(source => ({
                    type: "odds",

                    source:
                        source.source,

                    title:
                        source.title,

                    url:
                        source.url,

                    snippet:
                        source.snippet,

                    relevance:
                        source.relevance,

                    eventDate:
                        source.eventDate,

                    publishedDate:
                        source.publishedDate,

                    dateBasis:
                        source.dateBasis
                }));

        const undatedOddsEvidence =
            normalizedSources
                .filter(
                    source =>
                        source.type === "odds" &&
                        source.teamRelation ===
                            "EXACT_PAIR" &&
                        (
                            source.relevance ===
                                "UNDATED_TEAM_SOURCE" ||
                            source.relevance ===
                                "MATCH_SPECIFIC_UNDATED"
                        ) &&
                        !source.rejected
                )
                .map(source => ({
                    type: "odds",

                    source:
                        source.source,

                    title:
                        source.title,

                    url:
                        source.url,

                    snippet:
                        source.snippet,

                    relevance:
                        source.relevance,

                    eventDate:
                        source.eventDate,

                    publishedDate:
                        source.publishedDate,

                    dateBasis:
                        source.dateBasis
                }));

        const odds =
            extractCurrentOdds(
                oddsEvidence
            );

        // ============================================================
        // QUALITY
        // ============================================================

        const rejectedSources =
            normalizedSources.filter(
                source =>
                    source.rejected
            );

        const quality = {
            totalSources:
                normalizedSources.length,

            acceptedSources:
                usefulSources.length,

            rejectedSources:
                rejectedSources.length,

            currentMatchSources:
                currentSources.length,

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
                        source.teamRelation ===
                        "IRRELEVANT"
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

        // ============================================================
        // WARNINGS
        // ============================================================

        const warnings = [];

        if (
            historicalSources.length > 0
        ) {
            warnings.push(
                "Historical evidence was detected and is excluded from current-match analysis."
            );
        }

        if (
            futureSources.length > 0
        ) {
            warnings.push(
                "Future-dated evidence was detected and excluded from current-match analysis."
            );
        }

        if (
            undatedSources.length > 0
        ) {
            warnings.push(
                "Some team-related evidence has no reliable event date and is kept separately."
            );
        }

        if (
            rejectedSources.length > 0
        ) {
            warnings.push(
                `${rejectedSources.length} source(s) were explicitly rejected and retained for audit.`
            );
        }

        if (
            undatedStatsEvidence.length > 0
        ) {
            warnings.push(
                "Undated statistical evidence was retained separately and cannot be treated as date-qualified current-match statistics."
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
            !oddsHasStructuredMarket(
                odds
            )
        ) {
            warnings.push(
                "Current odds source exists, but structured market extraction is incomplete."
            );
        }

        // ============================================================
        // AVAILABILITY
        // ============================================================

        const dataAvailability = {
            fixture: {
                available: true,

                confidence:
                    currentSources.length > 0
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

        // ============================================================
        // ANALYSIS FLAGS
        // ============================================================

        const analysisReady = {
            exactMatchEvidence:
                currentSources.length > 0,

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
                oddsHasStructuredMarket(
                    odds
                ),

            actualLineups:
                confirmedLineups.length > 0
        };

        // ============================================================
        // FINAL FORM
        // ============================================================

        const form = {
            home:
                extractFormObjects(
                    formEvidence.home
                ),

            away:
                extractFormObjects(
                    formEvidence.away
                )
        };

        // ============================================================
        // FINAL RESPONSE
        // ============================================================

        return res.status(200).json({
            success: true,

            version: "V3.4",

            normalized: {
                match: {
                    home,
                    away,
                    date: targetDate,
                    year:
                        target.getUTCFullYear()
                },

                form,

                formEvidence,

                h2h:
                    cleanH2H,

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

                injuries:
                    cleanInjuries,

                lineups: {
                    matchEvidence:
                        lineupMatchEvidence,

                    predicted:
                        predictedLineups,

                    confirmed:
                        confirmedLineups,

                    // Do NOT duplicate the same evidence
                    // into home and away.
                    home: null,
                    away: null
                },

                odds,

                oddsEvidence,

                undatedOddsEvidence,

                // Every source remains available for audit.
                sources:
                    normalizedSources,

                rejectedSources,

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
            version: "V3.4",
            error:
                "Web data normalization failed.",
            details:
                error.message
        });
    }
}


// ===================================================================
// SOURCE COLLECTION
// ===================================================================

function collectSources(input) {
    const output = [];

    if (
        Array.isArray(
            input.allResults
        )
    ) {
        for (
            const item of input.allResults
        ) {
            output.push(item);
        }
    }

    if (
        output.length === 0 &&
        Array.isArray(
            input.searches
        )
    ) {
        for (
            const search of input.searches
        ) {
            if (
                !Array.isArray(
                    search.results
                )
            ) {
                continue;
            }

            for (
                const item of search.results
            ) {
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


// ===================================================================
// TEAM IDENTITY
// ===================================================================

function buildTeamIdentity(
    home,
    away
) {
    return {
        home:
            createTeamIdentity(
                home
            ),

        away:
            createTeamIdentity(
                away
            )
    };
}


function createTeamIdentity(
    team
) {
    const normalized =
        cleanText(team);

    let aliases = [
        normalized
    ];

    // ---------------------------------------------------------------
    // Deportes Concepcion
    // ---------------------------------------------------------------

    if (
        isPlainDeportesConcepcion(
            normalized
        )
    ) {
        aliases = [
            "deportes concepcion",
            "deportes concepcion fc",
            "d concepcion",
            "d. concepcion",
            "cd concepcion",
            "cd. concepcion"
        ];
    }

    // ---------------------------------------------------------------
    // Universidad de Concepcion
    // ---------------------------------------------------------------

    if (
        normalized.includes(
            "universidad de concepcion"
        ) ||
        normalized.includes(
            "univ de concepcion"
        )
    ) {
        aliases = [
            "universidad de concepcion",
            "univ de concepcion",
            "univ. de concepcion",
            "universidad concepcion"
        ];
    }

    // ---------------------------------------------------------------
    // O'Higgins
    // ---------------------------------------------------------------

    if (
        normalized.includes(
            "o higgins"
        ) ||
        normalized.includes(
            "o'higgins"
        ) ||
        normalized.includes(
            "ohiggins"
        )
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
        original:
            team,

        normalized,

        aliases
    };
}


function isPlainDeportesConcepcion(
    normalized
) {
    return (
        normalized.includes(
            "deportes concepcion"
        ) ||
        (
            normalized ===
            "concepcion"
        )
    );
}


// ===================================================================
// TEXT
// ===================================================================

function cleanText(
    value
) {
    return String(value || "")
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .replace(
            /[’]/g,
            "'"
        )
        .replace(
            /[^a-z0-9'\s.-]/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}


// ===================================================================
// STRICT ENTITY MATCHING
// ===================================================================

function sanitizeForConcepcionMatching(
    text
) {
    let value =
        cleanText(text);

    // Universidad de Concepcion is a DIFFERENT CLUB.
    value =
        value.replace(
            /\b(?:universidad|univ|u)\s*(?:de)?\s*concepcion\b/g,
            " "
        );

    return value;
}


function containsTeam(
    text,
    identity
) {
    let value =
        cleanText(text);

    if (
        isPlainDeportesConcepcion(
            identity.normalized
        )
    ) {
        value =
            sanitizeForConcepcionMatching(
                value
            );
    }

    for (
        const alias of identity.aliases
    ) {
        const escaped =
            escapeRegex(
                cleanText(alias)
            );

        const regex =
            new RegExp(
                `(^|\\s|[-/.])${escaped}(?=\\s|[-/.]|$)`,
                "i"
            );

        if (
            regex.test(value)
        ) {
            return true;
        }
    }

    return false;
}


function containsWrongConcepcionClub(
    text,
    identity
) {
    const all =
        `${identity.home.normalized} ${identity.away.normalized}`;

    const targetContainsPlain =
        all.includes(
            "deportes concepcion"
        ) ||
        all === "concepcion";

    if (
        !targetContainsPlain
    ) {
        return false;
    }

    const value =
        cleanText(text);

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
    const wrongClub =
        containsWrongConcepcionClub(
            text,
            identity
        );

    if (
        wrongClub
    ) {
        return {
            relation:
                "IRRELEVANT",

            homeFound:
                false,

            awayFound:
                false,

            wrongClub:
                true
        };
    }

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

    if (
        homeFound &&
        awayFound
    ) {
        return {
            relation:
                "EXACT_PAIR",

            homeFound:
                true,

            awayFound:
                true,

            wrongClub:
                false
        };
    }

    if (
        homeFound
    ) {
        return {
            relation:
                "HOME_ONLY",

            homeFound:
                true,

            awayFound:
                false,

            wrongClub:
                false
        };
    }

    if (
        awayFound
    ) {
        return {
            relation:
                "AWAY_ONLY",

            homeFound:
                false,

            awayFound:
                true,

            wrongClub:
                false
        };
    }

    return {
        relation:
            "IRRELEVANT",

        homeFound:
            false,

        awayFound:
            false,

        wrongClub:
            false
    };
}


// ===================================================================
// SOURCE NORMALIZATION
// ===================================================================

function normalizeSource(
    raw,
    identity,
    target,
    index
) {
    const source =
        String(
            raw.source ||
            raw.title ||
            ""
        ).trim();

    const title =
        String(
            raw.title ||
            source
        ).trim();

    const url =
        String(
            raw.url ||
            raw.link ||
            ""
        ).trim();

    const snippet =
        String(
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

    const suppliedType =
        cleanText(
            raw.type ||
            raw.suppliedType ||
            ""
        );

    const sourceType =
        normalizeSourceType(
            suppliedType,
            text
        );

    const publicationDate =
        parseSourceDate(
            raw.date ||
            raw.publishedDate ||
            raw.published_at ||
            raw.published
        );

    const eventInfo =
        extractEventDate(
            {
                title,
                snippet,
                url,
                text
            },
            target,
            sourceType,
            identity
        );

    const eventDate =
        eventInfo.date;

    const dateBasis =
        eventInfo.basis;

    const isH2H =
        detectH2H(text);

    const h2hScore =
        calculateH2HScore(text);

    const isHistoricalReport =
        looksLikeHistoricalMatchReport(
            text,
            sourceType
        );

    // ---------------------------------------------------------------
    // Hard rejection: wrong club.
    // ---------------------------------------------------------------

    if (
        relation.relation ===
            "IRRELEVANT"
    ) {
        return {
            id:
                raw.id ||
                `source-${index + 1}`,

            index,

            source,

            title,

            url,

            snippet,

            text,

            suppliedType,

            sourceType,

            teamRelation:
                "IRRELEVANT",

            eventDate:
                formatDate(
                    eventDate
                ),

            eventDateBasis:
                dateBasis ||
                null,

            publishedDate:
                formatDate(
                    publicationDate
                ),

            dateBasis:
                dateBasis ||
                null,

            relevance:
                "IRRELEVANT",

            h2h:
                isH2H,

            h2hType:
                null,

            dataRelevance:
                "REJECTED",

            rejected:
                true,

            rejectionReason:
                relation.wrongClub
                    ? "Universidad de Concepcion is a different club from Deportes Concepcion."
                    : "Source does not contain the required target club pair.",

            isWrongClub:
                relation.wrongClub,

            isHistoricalReport
        };
    }

    // ---------------------------------------------------------------
    // A source containing only one target team cannot automatically
    // be used as exact-match evidence.
    // ---------------------------------------------------------------

    const relevance =
        classifyRelevance({
            text,
            url,
            title,
            sourceType,
            relation:
                relation.relation,
            eventDate,
            publicationDate,
            target,
            isH2H,
            isHistoricalReport
        });

    // ---------------------------------------------------------------
    // H2H classification.
    // ---------------------------------------------------------------

    let h2hType = null;

    if (
        isH2H &&
        relation.relation ===
            "EXACT_PAIR"
    ) {
        if (
            relevance ===
            "HISTORICAL"
        ) {
            h2hType =
                "HISTORICAL_H2H";
        } else if (
            relevance ===
            "CURRENT_MATCH"
        ) {
            h2hType =
                "CURRENT_FIXTURE_H2H_PAGE";
        } else {
            h2hType =
                "UNQUALIFIED_H2H";
        }
    }

    const dataRelevance =
        getDataRelevance(
            relevance,
            sourceType,
            h2hType
        );

    // ---------------------------------------------------------------
    // Current stats guard.
    // ---------------------------------------------------------------

    const statsLooksCurrent =
        sourceType === "stats" &&
        isCurrentStatsEvidence(
            {
                title,
                url,
                snippet,
                text,
                eventDate:
                    formatDate(
                        eventDate
                    ),
                relevance
            }
        );

    // ---------------------------------------------------------------
    // Historical evidence never becomes current.
    // ---------------------------------------------------------------

    let rejected = false;
    let rejectionReason = null;

    if (
        relevance ===
            "HISTORICAL" &&
        (
            sourceType ===
                "injuries" ||
            sourceType ===
                "lineups"
        )
    ) {
        // Historical information is retained for audit,
        // but cannot be used as current team news.
        rejected = true;

        rejectionReason =
            "Historical source cannot be used as current-match injury or lineup evidence.";
    }

    if (
        sourceType ===
            "stats" &&
        relevance ===
            "CURRENT_MATCH" &&
        !statsLooksCurrent
    ) {
        rejected = true;

        rejectionReason =
            "Statistics source does not contain sufficiently strong current-match statistical context.";
    }

    if (
        sourceType ===
            "h2h" &&
        relevance ===
            "CURRENT_MATCH"
    ) {
        // The current fixture page can be useful as fixture evidence,
        // but it is NOT a completed historical H2H result.
        h2hType =
            "CURRENT_FIXTURE_H2H_PAGE";
    }

    return {
        id:
            raw.id ||
            `source-${index + 1}`,

        index,

        source,

        title,

        url,

        snippet,

        text,

        suppliedType,

        sourceType,

        teamRelation:
            relation.relation,

        eventDate:
            formatDate(
                eventDate
            ),

        eventDateBasis:
            dateBasis ||
            null,

        publishedDate:
            formatDate(
                publicationDate
            ),

        dateBasis:
            dateBasis ||
            null,

        relevance,

        h2h:
            isH2H,

        h2hScore,

        h2hType,

        dataRelevance,

        rejected,

        rejectionReason,

        isWrongClub:
            relation.wrongClub,

        isHistoricalReport
    };
}


// ===================================================================
// DATA RELEVANCE
// ===================================================================

function getDataRelevance(
    relevance,
    sourceType,
    h2hType
) {
    if (
        relevance ===
        "CURRENT_MATCH"
    ) {
        if (
            h2hType ===
            "CURRENT_FIXTURE_H2H_PAGE"
        ) {
            return "CURRENT_FIXTURE_CONTEXT";
        }

        return "CURRENT_MATCH";
    }

    if (
        relevance ===
        "RECENT"
    ) {
        return "RECENT_TEAM_CONTEXT";
    }

    if (
        relevance ===
        "HISTORICAL"
    ) {
        if (
            h2hType ===
            "HISTORICAL_H2H"
        ) {
            return "H2H_CONTEXT";
        }

        return "HISTORICAL_AUDIT_ONLY";
    }

    if (
        relevance ===
        "FUTURE"
    ) {
        return "FUTURE_AUDIT_ONLY";
    }

    if (
        relevance ===
            "MATCH_SPECIFIC_UNDATED"
    ) {
        return "MATCH_SPECIFIC_UNDATED";
    }

    return "UNDATED_AUDIT_ONLY";
}


// ===================================================================
// SOURCE TYPE
// ===================================================================

function normalizeSourceType(
    suppliedType,
    text
) {
    const type =
        cleanText(
            suppliedType
        );

    if (
        [
            "form",
            "h2h",
            "stats",
            "injuries",
            "lineups",
            "odds",
            "fixture"
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
        /predicted lineup|predicted lineups|starting xi|starting 11|official lineup|confirmed lineup|lineups/
            .test(value)
    ) {
        return "lineups";
    }

    if (
        /injur|suspend|unavailable|doubtful|team news/
            .test(value)
    ) {
        return "injuries";
    }

    if (
        /odds|1x2|over 2\.5|under 2\.5|btts/
            .test(value)
    ) {
        return "odds";
    }

    if (
        /fixture|scheduled|kickoff|kick-off|vs/
            .test(value)
    ) {
        return "fixture";
    }

    if (
        /xg|expected goals|statistics|stats|goals per match|clean sheets/
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


// ===================================================================
// RELEVANCE
// ===================================================================

function classifyRelevance({
    text,
    url,
    title,
    sourceType,
    relation,
    eventDate,
    publicationDate,
    target,
    isH2H,
    isHistoricalReport
}) {
    if (
        relation ===
        "IRRELEVANT"
    ) {
        return "IRRELEVANT";
    }

    // ---------------------------------------------------------------
    // Current target date ALWAYS wins when explicitly tied to the
    // fixture/event.
    // ---------------------------------------------------------------

    if (
        eventDate &&
        sameDay(
            eventDate,
            target
        ) &&
        isCurrentEventContext(
            text,
            sourceType,
            relation
        )
    ) {
        return "CURRENT_MATCH";
    }

    // ---------------------------------------------------------------
    // Time-zone adjacent current fixture.
    // ---------------------------------------------------------------

    if (
        eventDate &&
        isTimezoneAdjacentCurrent(
            eventDate,
            target,
            text
        ) &&
        isCurrentEventContext(
            text,
            sourceType,
            relation
        )
    ) {
        return "CURRENT_MATCH";
    }

    // ---------------------------------------------------------------
    // RECENT MUST COME BEFORE HISTORICAL.
    //
    // This fixes the unreachable RECENT branch in V3.3.
    // ---------------------------------------------------------------

    if (
        eventDate &&
        eventDate < target &&
        withinDays(
            eventDate,
            target,
            45
        ) &&
        isActualPreviousTeamEvent(
            text,
            sourceType,
            isHistoricalReport
        )
    ) {
        return "RECENT";
    }

    // ---------------------------------------------------------------
    // Future.
    // ---------------------------------------------------------------

    if (
        eventDate &&
        eventDate > target
    ) {
        return "FUTURE";
    }

    // ---------------------------------------------------------------
    // Historical.
    // ---------------------------------------------------------------

    if (
        eventDate &&
        eventDate < target
    ) {
        return "HISTORICAL";
    }

    // ---------------------------------------------------------------
    // Match-specific but undated.
    // ---------------------------------------------------------------

    if (
        relation ===
            "EXACT_PAIR" &&
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

    // ---------------------------------------------------------------
    // No reliable event date.
    // Publication date alone does NOT make it current.
    // ---------------------------------------------------------------

    return "UNDATED_TEAM_SOURCE";
}


// ===================================================================
// EVENT CONTEXT
// ===================================================================

function isCurrentEventContext(
    text,
    sourceType,
    relation
) {
    const value =
        cleanText(text);

    if (
        relation !==
        "EXACT_PAIR"
    ) {
        return false;
    }

    if (
        sourceType ===
            "fixture" ||
        sourceType ===
            "lineups" ||
        sourceType ===
            "odds"
    ) {
        return true;
    }

    if (
        /prediction|preview|upcoming|scheduled|kickoff|kick off|fixture|vs/
            .test(value)
    ) {
        return true;
    }

    return false;
}


// ===================================================================
// PREVIOUS EVENT DETECTION
// ===================================================================

function isActualPreviousTeamEvent(
    text,
    sourceType,
    isHistoricalReport
) {
    const value =
        cleanText(text);

    if (
        isHistoricalReport
    ) {
        return true;
    }

    if (
        sourceType ===
            "form" ||
        sourceType ===
            "h2h"
    ) {
        return (
            /\bresult\b/.test(value) ||
            /\bwon\b/.test(value) ||
            /\blost\b/.test(value) ||
            /\bdrew\b/.test(value) ||
            /\b[0-9]\s*[-:]\s*[0-9]\b/.test(value) ||
            /match report/.test(value) ||
            /final score/.test(value)
        );
    }

    return false;
}


// ===================================================================
// HISTORICAL REPORT
// ===================================================================

function looksLikeHistoricalMatchReport(
    text,
    sourceType
) {
    const value =
        cleanText(text);

    if (
        sourceType ===
            "fixture"
    ) {
        return false;
    }

    return (
        /match report/.test(value) ||
        /full time/.test(value) ||
        /final score/.test(value) ||
        /\b[0-9]\s*[-:]\s*[0-9]\b/.test(value) &&
        (
            /held on/.test(value) ||
            /regular season/.test(value) ||
            /match between/.test(value)
        )
    );
}


function isHistoricalMatchReport(
    source
) {
    return (
        source.isHistoricalReport ===
        true ||
        (
            source.relevance ===
                "HISTORICAL" &&
            /match report|final score|held on|full time/i.test(
                source.text
            )
        )
    );
}


// ===================================================================
// MATCH-SPECIFIC UNDATED
// ===================================================================

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

    if (
        sourceType ===
            "h2h" &&
        !(
            /prediction|preview|upcoming|live score/
                .test(value)
        )
    ) {
        return false;
    }

    if (
        sourceType ===
            "lineups" &&
        /predicted lineup|predicted lineups|starting xi|starting 11|official lineup|confirmed lineup|lineups/
            .test(value)
    ) {
        return true;
    }

    if (
        sourceType ===
            "odds" &&
        /prediction|odds|betting|over 2\.5|under 2\.5|1x2|btts/
            .test(value)
    ) {
        return true;
    }

    if (
        sourceType ===
            "stats" &&
        /match statistics|match stats|prediction.*stats/
            .test(value)
    ) {
        return true;
    }

    return false;
}


// ===================================================================
// H2H
// ===================================================================

function detectH2H(
    text
) {
    const value =
        cleanText(text);

    return (
        /\bh2h\b/.test(value) ||
        /head to head/.test(value) ||
        /head to head/.test(value) ||
        /past matches/.test(value) ||
        /previous meetings/.test(value)
    );
}


function calculateH2HScore(
    text
) {
    const value =
        cleanText(text);

    let score = 0;

    if (
        /\bh2h\b/.test(value)
    ) {
        score += 3;
    }

    if (
        /head to head/.test(value)
    ) {
        score += 3;
    }

    if (
        /past matches/.test(value)
    ) {
        score += 2;
    }

    if (
        /previous meetings/.test(value)
    ) {
        score += 2;
    }

    return score;
}


// ===================================================================
// FORM
// ===================================================================

function containsFormTerms(
    text
) {
    const value =
        cleanText(text);

    return (
        /last 5/.test(value) ||
        /last five/.test(value) ||
        /recent form/.test(value) ||
        /recent results/.test(value)
    );
}


function extractFormObjects(
    evidence
) {
    return evidence.map(
        item => ({
            source:
                item.source,

            title:
                item.title,

            url:
                item.url,

            snippet:
                item.snippet,

            relevance:
                item.relevance,

            eventDate:
                item.eventDate,

            publishedDate:
                item.publishedDate,

            dateBasis:
                item.dateBasis
        })
    );
}


// ===================================================================
// STATS
// ===================================================================

function isCurrentStatsEvidence(
    source
) {
    const text =
        cleanText(
            source.text ||
            `${source.title || ""} ${source.snippet || ""}`
        );

    if (
        source.relevance !==
        "CURRENT_MATCH"
    ) {
        return false;
    }

    if (
        /standings|table|league position|points|placed \d+/
            .test(text)
    ) {
        return false;
    }

    if (
        /previous meeting|past matches|h2h|last season/
            .test(text) &&
        !/current match|this match|today|prediction/
            .test(text)
    ) {
        return false;
    }

    return (
        /xg|expected goals|goals per match|clean sheets|btts|over 2\.5|under 2\.5|match statistics|match stats/
            .test(text)
    );
}


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

    for (
        const item of evidence
    ) {
        const text =
            cleanText(
                item.snippet
            );

        if (
            containsWrongConcepcionClub(
                text,
                identity
            )
        ) {
            continue;
        }

        const xg =
            extractXG(
                text
            );

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
            extractBTTS(
                text
            );

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
            extractTotals(
                text
            );

        for (
            const key of Object.keys(
                totals
            )
        ) {
            if (
                totals[key] !== null &&
                output.overUnder[key] ===
                    null
            ) {
                output.overUnder[key] =
                    totals[key];
            }
        }
    }

    return output;
}


function extractXG(
    text
) {
    const values = [];

    const regex =
        /\b(\d+(?:\.\d+)?)\s*xg\b/gi;

    let match;

    while (
        (match =
            regex.exec(text))
    ) {
        values.push(
            Number(match[1])
        );
    }

    return {
        home:
            values.length >= 2
                ? values[0]
                : null,

        away:
            values.length >= 2
                ? values[1]
                : null
    };
}


function extractBTTS(
    text
) {
    return {
        home:
            extractPercentageNear(
                text,
                "home",
                "btts"
            ),

        away:
            extractPercentageNear(
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
            `${escapeRegex(side)}.{0,80}${escapeRegex(keyword)}.{0,80}(\\d+(?:\\.\\d+)?)%`,
            "i"
        );

    const match =
        text.match(
            regex
        );

    if (!match) {
        return null;
    }

    return Number(
        match[1]
    );
}


function extractTotals(
    text
) {
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
            `${escapeRegex(direction)}\\s*${escapeRegex(line)}.{0,50}(\\d+(?:\\.\\d+)?)%`,
            "i"
        );

    const match =
        text.match(
            regex
        );

    if (!match) {
        return null;
    }

    return Number(
        match[1]
    );
}


// ===================================================================
// INJURIES
// ===================================================================

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

    for (
        const sentence of sentences
    ) {
        if (
            !hasInjuryTerms(
                sentence
            )
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

            text:
                sentence.trim(),

            source:
                source.source,

            title:
                source.title,

            url:
                source.url,

            eventDate:
                source.eventDate,

            publishedDate:
                source.publishedDate
        };

        if (
            sides.home &&
            !sides.away
        ) {
            evidence.team =
                "home";

            result.home.push(
                evidence
            );
        } else if (
            sides.away &&
            !sides.home
        ) {
            evidence.team =
                "away";

            result.away.push(
                evidence
            );
        } else {
            result.unknown.push(
                evidence
            );
        }
    }

    return result;
}


function hasInjuryTerms(
    text
) {
    const value =
        cleanText(text);

    return (
        /injur/.test(value) ||
        /suspend/.test(value) ||
        /unavailable/.test(value) ||
        /doubtful/.test(value) ||
        /\bout\b/.test(value)
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


// ===================================================================
// LINEUPS
// ===================================================================

function detectLineupStatus(
    text
) {
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
        /predicted starting/.test(value) ||
        /starting 11/.test(value)
    ) {
        return "PREDICTED";
    }

    return "UNKNOWN";
}


// ===================================================================
// ODDS
// ===================================================================

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

    for (
        const item of evidence
    ) {
        const text =
            cleanText(
                item.snippet
            );

        const markets = [
            {
                key:
                    "home",

                value:
                    extractDecimalOdds(
                        text,
                        "home"
                    )
            },

            {
                key:
                    "draw",

                value:
                    extractDecimalOdds(
                        text,
                        "draw"
                    )
            },

            {
                key:
                    "away",

                value:
                    extractDecimalOdds(
                        text,
                        "away"
                    )
            },

            {
                key:
                    "over15",

                value:
                    extractDecimalOdds(
                        text,
                        "over",
                        "1.5"
                    )
            },

            {
                key:
                    "under15",

                value:
                    extractDecimalOdds(
                        text,
                        "under",
                        "1.5"
                    )
            },

            {
                key:
                    "over25",

                value:
                    extractDecimalOdds(
                        text,
                        "over",
                        "2.5"
                    )
            },

            {
                key:
                    "under25",

                value:
                    extractDecimalOdds(
                        text,
                        "under",
                        "2.5"
                    )
            },

            {
                key:
                    "over35",

                value:
                    extractDecimalOdds(
                        text,
                        "over",
                        "3.5"
                    )
            },

            {
                key:
                    "under35",

                value:
                    extractDecimalOdds(
                        text,
                        "under",
                        "3.5"
                    )
            },

            {
                key:
                    "bttsYes",

                value:
                    extractDecimalOdds(
                        text,
                        "btts yes"
                    )
            },

            {
                key:
                    "bttsNo",

                value:
                    extractDecimalOdds(
                        text,
                        "btts no"
                    )
            }
        ];

        for (
            const market of markets
        ) {
            if (
                market.value !== null &&
                output[market.key] ===
                    null
            ) {
                output[market.key] =
                    market.value;
            }
        }
    }

    return output;
}


function extractDecimalOdds(
    text,
    market,
    line
) {
    let regex;

    if (
        market ===
            "btts yes" ||
        market ===
            "btts no"
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
        text.match(
            regex
        );

    if (!match) {
        return null;
    }

    const value =
        Number(
            match[1]
        );

    // Decimal football odds should not be percentages.
    if (
        !Number.isFinite(value) ||
        value < 1.01 ||
        value > 100
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


// ===================================================================
// DATE EXTRACTION
// ===================================================================

function extractEventDate(
    source,
    target,
    sourceType,
    identity
) {
    const candidates = [];

    // ---------------------------------------------------------------
    // Strongest: title.
    // ---------------------------------------------------------------

    collectDateCandidates(
        candidates,
        source.title,
        "TITLE_DATE",
        target
    );

    // ---------------------------------------------------------------
    // Snippet.
    // ---------------------------------------------------------------

    collectDateCandidates(
        candidates,
        source.snippet,
        "SNIPPET_DATE",
        target
    );

    // ---------------------------------------------------------------
    // URL.
    // ---------------------------------------------------------------

    collectDateCandidates(
        candidates,
        source.url,
        "URL_DATE",
        target
    );

    // ---------------------------------------------------------------
    // No date.
    // ---------------------------------------------------------------

    if (
        candidates.length === 0
    ) {
        return {
            date: null,
            basis: null
        };
    }

    // ---------------------------------------------------------------
    // If target date is explicitly present in the title/snippet,
    // use it.
    // ---------------------------------------------------------------

    const exactTarget =
        candidates.find(
            candidate =>
                sameDay(
                    candidate.date,
                    target
                ) &&
                (
                    candidate.basis ===
                        "TITLE_DATE" ||
                    candidate.basis ===
                        "SNIPPET_DATE"
                )
        );

    if (
        exactTarget
    ) {
        return {
            date:
                exactTarget.date,

            basis:
                exactTarget.basis
        };
    }

    // ---------------------------------------------------------------
    // For form/H2H/history pages, choose a date that actually looks
    // like a football event date rather than a standings/publication
    // date.
    // ---------------------------------------------------------------

    const eventCandidate =
        candidates.find(
            candidate =>
                candidate.eventLike
        );

    if (
        eventCandidate
    ) {
        return {
            date:
                eventCandidate.date,

            basis:
                "EVENT_DATE"
        };
    }

    // ---------------------------------------------------------------
    // Do NOT promote a random page date into an event date.
    // ---------------------------------------------------------------

    return {
        date: null,

        basis:
            "NO_RELIABLE_EVENT_DATE"
    };
}


function collectDateCandidates(
    output,
    text,
    basis,
    target
) {
    const value =
        String(text || "");

    if (!value) {
        return;
    }

    const dates =
        extractDatesFromText(
            value,
            target
        );

    for (
        const date of dates
    ) {
        output.push({
            date,

            basis,

            eventLike:
                looksLikeEventDateContext(
                    value,
                    date
                )
        });
    }
}


function looksLikeEventDateContext(
    text,
    date
) {
    const value =
        cleanText(text);

    const dateText =
        formatDate(
            date
        );

    if (
        dateText &&
        value.includes(
            dateText
        )
    ) {
        return true;
    }

    return (
        /match|fixture|vs|prediction|played|held on|kickoff|kick off|scheduled|result|final score|full time|head to head|h2h/
            .test(value)
    );
}


// ===================================================================
// DATE PARSING
// ===================================================================

function extractDatesFromText(
    text,
    target
) {
    const value =
        String(text || "");

    const results = [];

    let match;

    // YYYY-MM-DD
    const isoRegex =
        /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g;

    while (
        (match =
            isoRegex.exec(value))
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

    // Month Day Year
    const monthFirst =
        /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi;

    while (
        (match =
            monthFirst.exec(value))
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

    // Numeric dates.
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

        if (
            first > 12
        ) {
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

        if (
            second > 12
        ) {
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
            !sameDay(
                us,
                eu
            )
        ) {
            results.push(eu);
        }
    }

    // Month + day without year.
    if (target) {
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

            const date =
                makeDate(
                    target.getUTCFullYear(),
                    month,
                    Number(match[2])
                );

            if (date) {
                results.push(date);
            }
        }
    }

    return uniqueDates(
        results
    );
}


function parseSourceDate(
    value
) {
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

    const text =
        String(value);

    const iso =
        text.match(
            /^\d{4}-\d{2}-\d{2}$/
        );

    if (iso) {
        return parseISODate(
            text
        );
    }

    const dates =
        extractDatesFromText(
            text,
            new Date()
        );

    return dates.length > 0
        ? dates[0]
        : null;
}


function parseISODate(
    value
) {
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
            value
        )
    ) {
        return null;
    }

    const parts =
        value.split("-")
            .map(Number);

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
        date.getUTCFullYear() !==
            year ||
        date.getUTCMonth() !==
            month - 1 ||
        date.getUTCDate() !==
            day
    ) {
        return null;
    }

    return date;
}


function monthNumber(
    value
) {
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

    return (
        months[month] ||
        null
    );
}


// ===================================================================
// DATE UTILITIES
// ===================================================================

function isTimezoneAdjacentCurrent(
    eventDate,
    target,
    text
) {
    if (
        !eventDate ||
        !target
    ) {
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

    if (
        diff !== 1
    ) {
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
    if (
        !a ||
        !b
    ) {
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
    if (
        !earlier ||
        !later
    ) {
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


function validDate(
    date
) {
    return (
        date instanceof Date &&
        !Number.isNaN(
            date.getTime()
        )
    );
}


function formatDate(
    date
) {
    if (
        !validDate(date)
    ) {
        return null;
    }

    return date
        .toISOString()
        .slice(0, 10);
}


function uniqueDates(
    dates
) {
    const seen =
        new Set();

    const output = [];

    for (
        const date of dates
    ) {
        if (
            !validDate(date)
        ) {
            continue;
        }

        const key =
            date.getTime();

        if (
            !seen.has(key)
        ) {
            seen.add(key);
            output.push(date);
        }
    }

    return output;
}


// ===================================================================
// EVIDENCE UTILITIES
// ===================================================================

function dedupeByUrl(
    items
) {
    const seen =
        new Set();

    return items.filter(
        item => {
            const key =
                item.url ||
                item.source;

            if (
                seen.has(key)
            ) {
                return false;
            }

            seen.add(key);

            return true;
        }
    );
}


function dedupeEvidence(
    items
) {
    const seen =
        new Set();

    return items.filter(
        item => {
            const key = [
                item.team,
                item.text,
                item.url
            ].join("|");

            if (
                seen.has(key)
            ) {
                return false;
            }

            seen.add(key);

            return true;
        }
    );
}


function splitIntoSentences(
    text
) {
    return String(
        text || ""
    )
        .split(
            /(?<=[.!?])\s+|\s*;\s*/
        )
        .map(
            item =>
                item.trim()
        )
        .filter(
            Boolean
        );
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
