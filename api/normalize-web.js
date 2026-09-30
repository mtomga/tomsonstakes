// api/normalize-web.js
// TomsonStakes Web Evidence Normalizer
// Version: V3.4
//
// Main protections:
// 1. Strict team/entity matching.
// 2. "Concepcion" NEVER matches "Universidad de Concepcion".
// 3. Event date is separate from publication date.
// 4. Publication date can NEVER silently become event date.
// 5. RECENT is classified before general HISTORICAL.
// 6. Current fixture/H2H pages are not historical H2H results.
// 7. Historical/future evidence remains auditable but is excluded
//    from current-match analysis.
// 8. Historical lineups/injuries cannot become current.
// 9. Predicted and confirmed lineups are separated.
// 10. Home and away lineup evidence are separated.
// 11. Current odds are separated from undated odds.
// 12. Percentage values cannot be mistaken for decimal odds.
// 13. Current-match statistics must belong to the exact target pair.
// 14. Universidad de Concepcion contamination is explicitly rejected.
// 15. Wrong-club injuries/stats/form are rejected.
// 16. Data availability and warnings are explicit.

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const body = req.body || {};
        const input =
            body && typeof body.normalized === "object"
                ? body.normalized
                : body;

        if (
            !input ||
            !input.match ||
            !input.match.home ||
            !input.match.away ||
            !input.match.date
        ) {
            return res.status(400).json({
                error:
                    "Required fields: match.home, match.away, match.date"
            });
        }

        const targetDate = parseSourceDate(input.match.date);

        if (!targetDate) {
            return res.status(400).json({
                error: `Invalid target match date: ${input.match.date}`
            });
        }

        const identity = createMatchIdentity(
            input.match.home,
            input.match.away
        );

        const rawSources = collectSources(input);

        const sources = rawSources
            .map((raw, index) =>
                normalizeSource(
                    raw,
                    identity,
                    targetDate,
                    index
                )
            )
            .filter(Boolean);

        const usefulSources = sources.filter(
            source =>
                source.relation !== "IRRELEVANT" &&
                !source.rejected
        );

        const rejectedSources = sources.filter(
            source => source.rejected
        );

        const currentSources = usefulSources.filter(
            source =>
                source.relevance === "CURRENT_MATCH"
        );

        const recentSources = usefulSources.filter(
            source =>
                source.relevance === "RECENT"
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
                source.relevance ===
                    "MATCH_SPECIFIC_UNDATED" ||
                source.relevance ===
                    "UNDATED_TEAM_SOURCE"
        );

        const h2h = buildH2H(
            usefulSources,
            identity,
            targetDate
        );

        const form = buildForm(
            recentSources,
            identity
        );

        const stats = buildStats(
            currentSources,
            undatedSources,
            identity
        );

        const injuries = buildInjuries(
            usefulSources,
            identity
        );

        const lineups = buildLineups(
            usefulSources,
            identity
        );

        const odds = buildOdds(
            usefulSources,
            identity
        );

        const dataAvailability =
            buildDataAvailability({
                sources,
                currentSources,
                recentSources,
                historicalSources,
                futureSources,
                undatedSources,
                h2h,
                form,
                stats,
                injuries,
                lineups,
                odds
            });

        const warnings = buildWarnings({
            sources,
            rejectedSources,
            currentSources,
            recentSources,
            historicalSources,
            futureSources,
            undatedSources,
            h2h,
            form,
            stats,
            injuries,
            lineups,
            odds,
            identity
        });

        const quality = calculateQuality({
            sources,
            rejectedSources,
            currentSources,
            recentSources,
            h2h,
            form,
            stats,
            injuries,
            lineups,
            odds
        });

        const analysisReady =
            isAnalysisReady({
                identity,
                targetDate,
                currentSources,
                recentSources,
                form,
                stats
            });

        return res.status(200).json({
            ok: true,

            version: "V3.4",

            normalized: {
                match: {
                    home: identity.home.original,
                    away: identity.away.original,
                    date: formatDate(targetDate),

                    identity: {
                        home: identity.home.normalized,
                        away: identity.away.normalized,

                        aliases: {
                            home: identity.home.aliases,
                            away: identity.away.aliases
                        }
                    }
                },

                sources: {
                    total: sources.length,
                    useful: usefulSources.length,
                    rejected: rejectedSources.length,

                    current: currentSources,
                    recent: recentSources,
                    historical: historicalSources,
                    future: futureSources,
                    undated: undatedSources,
                    rejectedSources
                },

                h2h,

                form,

                stats,

                injuries,

                lineups,

                odds
            },

            quality,

            dataAvailability,

            analysisReady,

            warnings
        });
    } catch (error) {
        console.error(
            "normalize-web error:",
            error
        );

        return res.status(500).json({
            error: "Normalization failed",
            message:
                error && error.message
                    ? error.message
                    : String(error)
        });
    }
}


/* =========================================================
   SOURCE COLLECTION
========================================================= */

function collectSources(input) {
    if (
        Array.isArray(input.allResults)
    ) {
        return input.allResults;
    }

    if (
        Array.isArray(input.searches)
    ) {
        return input.searches.flatMap(
            search =>
                Array.isArray(search?.results)
                    ? search.results
                    : []
        );
    }

    if (
        Array.isArray(input.results)
    ) {
        return input.results;
    }

    return [];
}


/* =========================================================
   TEAM IDENTITY
========================================================= */

function createMatchIdentity(home, away) {
    const homeIdentity =
        createTeamIdentity(home);

    const awayIdentity =
        createTeamIdentity(away);

    return {
        home: homeIdentity,
        away: awayIdentity
    };
}


function createTeamIdentity(team) {
    const original =
        String(team || "").trim();

    const normalized =
        cleanText(original);

    let aliases = [
        normalized
    ];

    /*
     * SPECIAL PROTECTION:
     *
     * Deportes/Deportivo/Club/ D Concepcion
     *
     * must NEVER match:
     *
     * Universidad de Concepcion
     */
    if (
        isPlainConcepcion(normalized)
    ) {
        aliases = [
            "concepcion",
            "deportes concepcion",
            "deportivo concepcion",
            "club deportes concepcion",
            "d concepcion",
            "d. concepcion",
            "cd concepcion",
            "cd. concepcion"
        ];
    }

    if (
        isOHiggins(normalized)
    ) {
        aliases = [
            "o higgins",
            "o'higgins",
            "ohiggins",
            "o higgins fc",
            "o'higgins fc",
            "ohiggins fc",
            "club deportivo o higgins"
        ];
    }

    return {
        original,
        normalized,
        aliases: dedupe(
            aliases.map(cleanText)
        )
    };
}


function isPlainConcepcion(text) {
    const value = cleanText(text);

    if (
        value.includes(
            "universidad de concepcion"
        )
    ) {
        return false;
    }

    if (
        value.includes(
            "universidad concepcion"
        )
    ) {
        return false;
    }

    if (
        value.includes(
            "u de concepcion"
        )
    ) {
        return false;
    }

    if (
        value.includes(
            "u concepcion"
        )
    ) {
        return false;
    }

    return (
        value === "concepcion" ||
        value.includes(
            "deportes concepcion"
        ) ||
        value.includes(
            "deportivo concepcion"
        ) ||
        value.includes(
            "club deportes concepcion"
        ) ||
        value.includes(
            "d concepcion"
        ) ||
        value.includes(
            "cd concepcion"
        )
    );
}


function isOHiggins(text) {
    const value = cleanText(text);

    return (
        value.includes("o higgins") ||
        value.includes("ohiggins")
    );
}


/* =========================================================
   TEXT NORMALIZATION
========================================================= */

function cleanText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[’‘`]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function sanitizeForConcepcionMatching(
    text
) {
    let value = cleanText(text);

    value = value
        .replace(
            /\buniversidad\s+de\s+concepcion\b/g,
            " "
        )
        .replace(
            /\buniversidad\s+concepcion\b/g,
            " "
        )
        .replace(
            /\buniv\s+de\s+concepcion\b/g,
            " "
        )
        .replace(
            /\bu\s+de\s+concepcion\b/g,
            " "
        )
        .replace(
            /\bu\s+concepcion\b/g,
            " "
        );

    return value
        .replace(/\s+/g, " ")
        .trim();
}


function containsWrongConcepcionClub(
    text,
    identity
) {
    const value = cleanText(text);

    const targetIsPlainConcepcion =
        isPlainConcepcion(
            identity.home.normalized
        ) ||
        isPlainConcepcion(
            identity.away.normalized
        );

    if (!targetIsPlainConcepcion) {
        return false;
    }

    return (
        /\buniversidad\s+de\s+concepcion\b/i.test(
            value
        ) ||
        /\buniversidad\s+concepcion\b/i.test(
            value
        ) ||
        /\bu\s+de\s+concepcion\b/i.test(
            value
        ) ||
        /\bu\s+concepcion\b/i.test(
            value
        )
    );
}


/* =========================================================
   TEAM MATCHING
========================================================= */

function containsTeam(
    text,
    identity
) {
    const value =
        identity.normalized ===
        "concepcion"
            ? sanitizeForConcepcionMatching(
                  text
              )
            : cleanText(text);

    return identity.aliases.some(
        alias =>
            alias &&
            new RegExp(
                `(^|\\s)${escapeRegExp(
                    alias
                )}(?=\\s|$)`
            ).test(value)
    );
}


function determineTeamRelation(
    text,
    identity
) {
    const homeMatch =
        containsTeam(
            text,
            identity.home
        );

    const awayMatch =
        containsTeam(
            text,
            identity.away
        );

    if (homeMatch && awayMatch) {
        return "EXACT_PAIR";
    }

    if (homeMatch) {
        return "HOME_ONLY";
    }

    if (awayMatch) {
        return "AWAY_ONLY";
    }

    return "IRRELEVANT";
}


function isExactPair(
    text,
    identity
) {
    return (
        containsTeam(
            text,
            identity.home
        ) &&
        containsTeam(
            text,
            identity.away
        )
    );
}


/* =========================================================
   SOURCE NORMALIZATION
========================================================= */

function normalizeSource(
    raw,
    identity,
    targetDate,
    index
) {
    if (!raw) {
        return null;
    }

    const title =
        String(
            raw.title ||
            raw.name ||
            ""
        ).trim();

    const snippet =
        String(
            raw.snippet ||
            raw.description ||
            raw.text ||
            ""
        ).trim();

    const url =
        String(
            raw.url ||
            raw.link ||
            raw.href ||
            ""
        ).trim();

    const source =
        String(
            raw.source ||
            raw.domain ||
            raw.publisher ||
            ""
        ).trim();

    const suppliedType =
        String(
            raw.type ||
            raw.sourceType ||
            raw.category ||
            ""
        ).trim();

    const text = [
        title,
        snippet,
        url
    ]
        .filter(Boolean)
        .join(" ");

    if (!text) {
        return null;
    }

    const relation =
        determineTeamRelation(
            text,
            identity
        );

    const wrongConcepcionClub =
        containsWrongConcepcionClub(
            text,
            identity
        );

    /*
     * IMPORTANT:
     *
     * raw.date is treated as publication/source date.
     * It is NOT automatically the event date.
     */
    const publishedDate =
        parseSourceDate(
            raw.date ||
            raw.publishedDate ||
            raw.published_at ||
            raw.publishedAt
        );

    const eventInfo =
        extractEventDate(
            title,
            snippet,
            url,
            targetDate,
            raw
        );

    const eventDate =
        eventInfo?.date ||
        null;

    const eventDateBasis =
        eventInfo?.basis ||
        null;

    const sourceType =
        normalizeSourceType(
            suppliedType,
            text
        );

    const h2hInfo =
        detectH2H(
            text,
            sourceType
        );

    const relevance =
        classifyRelevance({
            eventDate,
            targetDate,
            text,
            sourceType
        });

    let rejected = false;
    let rejectionReason = null;

    if (
        relation === "IRRELEVANT"
    ) {
        rejected = true;
        rejectionReason =
            "Does not contain the target team pair";
    }

    if (
        wrongConcepcionClub
    ) {
        rejected = true;
        rejectionReason =
            "Contains Universidad de Concepcion while target contains plain Concepcion";
    }

    /*
     * A source explicitly about another fixture
     * must not become current-match evidence.
     */
    if (
        eventDate &&
        !sameDay(
            eventDate,
            targetDate
        ) &&
        sourceType === "MATCH_STATS" &&
        relevance !== "RECENT"
    ) {
        /*
         * Keep historical/future source for audit,
         * but it is not current evidence.
         */
    }

    return {
        id:
            raw.id ||
            raw.resultId ||
            `source-${index + 1}`,

        index,

        source,
        title,
        url,
        snippet,

        text,

        suppliedType,

        sourceType,

        relation,

        eventDate:
            eventDate
                ? formatDate(eventDate)
                : null,

        eventDateBasis,

        publishedDate:
            publishedDate
                ? formatDate(
                      publishedDate
                  )
                : null,

        /*
         * Explicitly expose the distinction.
         */
        dateBasis:
            eventDate
                ? "EVENT_DATE"
                : publishedDate
                    ? "PUBLICATION_DATE_ONLY"
                    : "NONE",

        relevance,

        h2h:
            h2hInfo.isH2H,

        h2hType:
            h2hInfo.type,

        dataRelevance:
            determineDataRelevance({
                relevance,
                sourceType,
                h2h: h2hInfo.isH2H,
                eventDate,
                targetDate
            }),

        rejected,

        rejectionReason
    };
}


/* =========================================================
   EVENT DATE EXTRACTION
========================================================= */

/*
 * This function deliberately does NOT simply scan every date.
 *
 * Publication phrases such as:
 *
 * "Published September 29, 2026"
 * "Updated September 29, 2026"
 *
 * are not event dates.
 */

function extractEventDate(
    title,
    snippet,
    url,
    targetDate,
    raw
) {
    /*
     * First preference:
     * explicit structured event date supplied by
     * upstream search/fixture data.
     */
    const structuredCandidates = [
        raw?.eventDate,
        raw?.fixtureDate,
        raw?.matchDate,
        raw?.gameDate,
        raw?.scheduledDate,
        raw?.scheduledAt
    ];

    for (
        const candidate of structuredCandidates
    ) {
        const parsed =
            parseSourceDate(candidate);

        if (parsed) {
            return {
                date: parsed,
                basis: "STRUCTURED_EVENT_DATE"
            };
        }
    }

    const combined = [
        title,
        snippet,
        url
    ]
        .filter(Boolean)
        .join(" ");

    /*
     * Explicit fixture language.
     */
    const explicitPatterns = [
        /(?:match|fixture|game|kick[\s-]?off|kickoff|scheduled|plays|face|meet|meeting|takes?\s+on|vs\.?|v)\D{0,50}(\d{1,2}(?:st|nd|rd|th)?[\s-]+(?:january|february|march|april|may|june|july|august|september|october|november|december)[,\s-]+\d{4})/i,

        /(?:match|fixture|game|scheduled|kick[\s-]?off|kickoff)\D{0,50}((?:january|february|march|april|may|june|july|august|september|october|november|december)[\s-]+\d{1,2}(?:st|nd|rd|th)?[,\s-]+\d{4})/i,

        /(?:fixture\s+date|match\s+date|game\s+date|date\s+of\s+match)\s*[:\-]?\s*([a-z]+\s+\d{1,2},?\s+\d{4})/i,

        /(?:match|fixture|game)\s+(?:on|for)\s+([a-z]+\s+\d{1,2},?\s+\d{4})/i
    ];

    for (
        const pattern of explicitPatterns
    ) {
        const match =
            combined.match(pattern);

        if (
            match &&
            match[1]
        ) {
            const parsed =
                parseNaturalDate(
                    match[1],
                    targetDate
                );

            if (parsed) {
                return {
                    date: parsed,
                    basis:
                        "EXPLICIT_FIXTURE_LANGUAGE"
                };
            }
        }
    }

    /*
     * Look for a date close to an explicit fixture phrase.
     */
    const dateCandidates =
        extractNaturalDateCandidates(
            combined,
            targetDate
        );

    for (
        const candidate of dateCandidates
    ) {
        const context =
            combined.slice(
                Math.max(
                    0,
                    candidate.index - 100
                ),
                Math.min(
                    combined.length,
                    candidate.index +
                        candidate.raw.length +
                        100
                )
            );

        if (
            isPublicationDateContext(
                context
            )
        ) {
            continue;
        }

        if (
            isFixtureDateContext(
                context
            )
        ) {
            return {
                date: candidate.date,
                basis:
                    "DATE_NEAR_FIXTURE_CONTEXT"
            };
        }
    }

    /*
     * If there is no explicit event-date evidence,
     * do NOT guess from publication date.
     */
    return {
        date: null,
        basis: null
    };
}


function isPublicationDateContext(
    text
) {
    const value =
        cleanText(text);

    return (
        /\bpublished\b/.test(value) ||
        /\bpublication\b/.test(value) ||
        /\bposted\b/.test(value) ||
        /\bupdated\b/.test(value) ||
        /\blast\s+updated\b/.test(value) ||
        /\bmodified\b/.test(value) ||
        /\bcreated\b/.test(value)
    );
}


function isFixtureDateContext(
    text
) {
    const value =
        cleanText(text);

    return (
        /\bmatch\b/.test(value) ||
        /\bfixture\b/.test(value) ||
        /\bgame\b/.test(value) ||
        /\bkickoff\b/.test(value) ||
        /\bkick off\b/.test(value) ||
        /\bscheduled\b/.test(value) ||
        /\bplays\b/.test(value) ||
        /\bface\b/.test(value) ||
        /\bvs\b/.test(value) ||
        /\bv\b/.test(value)
    );
}


/* =========================================================
   RELEVANCE
========================================================= */

function classifyRelevance({
    eventDate,
    targetDate,
    text,
    sourceType
}) {
    /*
     * EXACT CURRENT MATCH
     */
    if (
        eventDate &&
        sameDay(
            eventDate,
            targetDate
        )
    ) {
        return "CURRENT_MATCH";
    }

    /*
     * TIMEZONE-ADJACENT CURRENT MATCH.
     *
     * Only permit this when the source contains
     * explicit time/timezone information.
     */
    if (
        eventDate &&
        isTimezoneAdjacentCurrent(
            eventDate,
            targetDate,
            text
        )
    ) {
        return "CURRENT_MATCH";
    }

    /*
     * FUTURE must come before historical/recent.
     */
    if (
        eventDate &&
        eventDate > targetDate
    ) {
        return "FUTURE";
    }

    /*
     * CRITICAL FIX:
     *
     * RECENT MUST COME BEFORE GENERAL HISTORICAL.
     *
     * Otherwise every recent result is swallowed
     * by HISTORICAL and RECENT becomes unreachable.
     */
    if (
        eventDate &&
        eventDate < targetDate &&
        withinDays(
            eventDate,
            targetDate,
            45
        )
    ) {
        return "RECENT";
    }

    /*
     * Older historical evidence.
     */
    if (
        eventDate &&
        eventDate < targetDate
    ) {
        return "HISTORICAL";
    }

    /*
     * Match-specific pages without a reliable
     * event date remain auditable but are not
     * silently treated as current.
     */
    if (
        isMatchSpecificUndatedPage(
            text,
            sourceType
        )
    ) {
        return "MATCH_SPECIFIC_UNDATED";
    }

    return "UNDATED_TEAM_SOURCE";
}


/* =========================================================
   SOURCE TYPES
========================================================= */

function normalizeSourceType(
    suppliedType,
    text
) {
    const supplied =
        cleanText(
            suppliedType
        );

    if (
        supplied.includes("h2h") ||
        supplied.includes("head to head")
    ) {
        return "H2H";
    }

    if (
        supplied.includes("lineup") ||
        supplied.includes("line up")
    ) {
        return "LINEUPS";
    }

    if (
        supplied.includes("injur")
    ) {
        return "INJURIES";
    }

    if (
        supplied.includes("odd") ||
        supplied.includes("betting")
    ) {
        return "ODDS";
    }

    if (
        supplied.includes("stat")
    ) {
        return "MATCH_STATS";
    }

    if (
        supplied.includes("form")
    ) {
        return "FORM";
    }

    const value =
        cleanText(text);

    if (
        /\bhead to head\b/.test(
            value
        ) ||
        /\bh2h\b/.test(value) ||
        /\bprevious meetings\b/.test(
            value
        )
    ) {
        return "H2H";
    }

    if (
        /\bconfirmed lineups?\b/.test(
            value
        ) ||
        /\bstarting lineups?\b/.test(
            value
        ) ||
        /\bpredicted lineups?\b/.test(
            value
        ) ||
        /\bprobable lineups?\b/.test(
            value
        )
    ) {
        return "LINEUPS";
    }

    if (
        /\binjur(?:y|ies)\b/.test(
            value
        ) ||
        /\bmissing players?\b/.test(
            value
        ) ||
        /\bsuspended\b/.test(
            value
        )
    ) {
        return "INJURIES";
    }

    if (
        /\bodds?\b/.test(value) ||
        /\b1x2\b/.test(value) ||
        /\bover\s+\d/.test(value) ||
        /\bunder\s+\d/.test(value) ||
        /\bbtts\b/.test(value)
    ) {
        return "ODDS";
    }

    if (
        /\bxg\b/.test(value) ||
        /\bexpected goals\b/.test(
            value
        ) ||
        /\bpossession\b/.test(value) ||
        /\bshots?\b/.test(value) ||
        /\bgoals?\s+for\b/.test(value) ||
        /\bgoals?\s+against\b/.test(
            value
        )
    ) {
        return "MATCH_STATS";
    }

    if (
        /\blast\s+\d+\b/.test(value) ||
        /\brecent form\b/.test(value) ||
        /\bform guide\b/.test(value)
    ) {
        return "FORM";
    }

    return "OTHER";
}


/* =========================================================
   H2H
========================================================= */

function detectH2H(
    text,
    sourceType
) {
    const value =
        cleanText(text);

    const isH2H =
        sourceType === "H2H" ||
        /\bh2h\b/.test(value) ||
        /\bhead to head\b/.test(
            value
        ) ||
        /\bprevious meetings\b/.test(
            value
        ) ||
        /\bpast meetings\b/.test(
            value
        ) ||
        /\bprevious encounters\b/.test(
            value
        );

    if (!isH2H) {
        return {
            isH2H: false,
            type: null
        };
    }

    if (
        /\bnext match\b/.test(value) ||
        /\bupcoming\b/.test(value) ||
        /\bpreview\b/.test(value) ||
        /\bfixture\b/.test(value)
    ) {
        return {
            isH2H: true,
            type: "CURRENT_MATCH_H2H_PAGE"
        };
    }

    return {
        isH2H: true,
        type: "HISTORICAL_H2H"
    };
}


function buildH2H(
    sources,
    identity,
    targetDate
) {
    const h2hSources =
        sources.filter(
            source =>
                source.h2h &&
                source.relation ===
                    "EXACT_PAIR"
        );

    const historical =
        h2hSources.filter(
            source =>
                source.h2hType ===
                    "HISTORICAL_H2H" &&
                source.relevance ===
                    "HISTORICAL"
        );

    const currentPages =
        h2hSources.filter(
            source =>
                source.h2hType ===
                "CURRENT_MATCH_H2H_PAGE"
        );

    const future =
        h2hSources.filter(
            source =>
                source.relevance ===
                "FUTURE"
        );

    return {
        available:
            historical.length > 0,

        historical: historical.map(
            source =>
                summarizeSource(
                    source
                )
        ),

        currentMatchPages:
            currentPages.map(
                source =>
                    summarizeSource(
                        source
                    )
            ),

        future:
            future.map(
                source =>
                    summarizeSource(
                        source
                    )
            ),

        count:
            historical.length,

        rule:
            "Only completed historical H2H evidence is eligible for H2H context."
    };
}


/* =========================================================
   FORM
========================================================= */

function buildForm(
    recentSources,
    identity
) {
    const formSources =
        recentSources.filter(
            source =>
                (
                    source.sourceType ===
                        "FORM" ||
                    /\bform\b/i.test(
                        source.text
                    )
                ) &&
                (
                    source.relation ===
                        "HOME_ONLY" ||
                    source.relation ===
                        "AWAY_ONLY" ||
                    source.relation ===
                        "EXACT_PAIR"
                )
        );

    const home =
        formSources.filter(
            source =>
                source.relation ===
                "HOME_ONLY"
        );

    const away =
        formSources.filter(
            source =>
                source.relation ===
                "AWAY_ONLY"
        );

    return {
        home: home.map(
            source =>
                summarizeSource(
                    source
                )
        ),

        away: away.map(
            source =>
                summarizeSource(
                    source
                )
        ),

        paired:
            formSources
                .filter(
                    source =>
                        source.relation ===
                        "EXACT_PAIR"
                )
                .map(
                    source =>
                        summarizeSource(
                            source
                        )
                ),

        available:
            formSources.length > 0
    };
}


/* =========================================================
   STATS
========================================================= */

function buildStats(
    currentSources,
    undatedSources,
    identity
) {
    const current =
        currentSources.filter(
            source =>
                source.sourceType ===
                    "MATCH_STATS" &&
                source.relation ===
                    "EXACT_PAIR"
        );

    const undated =
        undatedSources.filter(
            source =>
                source.sourceType ===
                    "MATCH_STATS" &&
                source.relation ===
                    "EXACT_PAIR"
        );

    return {
        current: current.map(
            source => ({
                ...summarizeSource(
                    source
                ),
                extracted:
                    extractCurrentStats(
                        source.text
                    )
            })
        ),

        undated: undated.map(
            source => ({
                ...summarizeSource(
                    source
                ),
                extracted:
                    extractCurrentStats(
                        source.text
                    )
            })
        ),

        available:
            current.length > 0,

        rule:
            "Only exact target-pair current-match statistics enter current stats."
    };
}


function extractCurrentStats(
    text
) {
    const value =
        String(text || "");

    const xg = extractMetric(
        value,
        [
            /xg\s*[:\-]?\s*(\d+(?:\.\d+)?)/i,
            /expected goals\s*[:\-]?\s*(\d+(?:\.\d+)?)/i
        ]
    );

    const xga = extractMetric(
        value,
        [
            /xga\s*[:\-]?\s*(\d+(?:\.\d+)?)/i,
            /expected goals against\s*[:\-]?\s*(\d+(?:\.\d+)?)/i
        ]
    );

    const btts =
        extractPercentage(
            value,
            /btts\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i
        );

    const over25 =
        extractPercentage(
            value,
            /over\s*2\.5\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i
        );

    const under25 =
        extractPercentage(
            value,
            /under\s*2\.5\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i
        );

    return {
        xg,
        xga,
        btts,
        over25,
        under25
    };
}


/* =========================================================
   INJURIES
========================================================= */

function buildInjuries(
    sources,
    identity
) {
    const injurySources =
        sources.filter(
            source =>
                source.sourceType ===
                    "INJURIES" &&
                source.relevance !==
                    "HISTORICAL" &&
                source.relevance !==
                    "FUTURE"
        );

    const home = [];
    const away = [];
    const unknown = [];

    for (
        const source of injurySources
    ) {
        const sentences =
            splitSentences(
                source.text
            );

        for (
            const sentence of sentences
        ) {
            const mentionsHome =
                containsTeam(
                    sentence,
                    identity.home
                );

            const mentionsAway =
                containsTeam(
                    sentence,
                    identity.away
                );

            if (
                mentionsHome &&
                !mentionsAway
            ) {
                home.push({
                    source:
                        summarizeSource(
                            source
                        ),
                    text:
                        sentence.trim()
                });
            } else if (
                mentionsAway &&
                !mentionsHome
            ) {
                away.push({
                    source:
                        summarizeSource(
                            source
                        ),
                    text:
                        sentence.trim()
                });
            } else if (
                mentionsHome &&
                mentionsAway
            ) {
                unknown.push({
                    source:
                        summarizeSource(
                            source
                        ),
                    text:
                        sentence.trim()
                });
            }
        }
    }

    return {
        home,
        away,
        unknown,

        available:
            home.length > 0 ||
            away.length > 0,

        rule:
            "Historical injury evidence is excluded from current injury analysis."
    };
}


/* =========================================================
   LINEUPS
========================================================= */

function buildLineups(
    sources,
    identity
) {
    const lineupSources =
        sources.filter(
            source =>
                source.sourceType ===
                    "LINEUPS"
        );

    const confirmed = [];
    const predicted = [];
    const unknown = [];

    for (
        const source of lineupSources
    ) {
        const status =
            detectLineupStatus(
                source.text
            );

        const teams =
            determineLineupTeams(
                source.text,
                identity
            );

        const item = {
            source:
                summarizeSource(
                    source
                ),

            status,

            homeMentioned:
                teams.home,

            awayMentioned:
                teams.away,

            players:
                extractPlayerNames(
                    source.text
                )
        };

        if (
            status === "CONFIRMED"
        ) {
            confirmed.push(item);
        } else if (
            status === "PREDICTED"
        ) {
            predicted.push(item);
        } else {
            unknown.push(item);
        }
    }

    /*
     * IMPORTANT:
     *
     * Never assign the same source to both
     * home and away.
     *
     * We expose the evidence separately.
     */
    const homeConfirmed =
        confirmed.filter(
            item =>
                item.homeMentioned &&
                !item.awayMentioned
        );

    const awayConfirmed =
        confirmed.filter(
            item =>
                item.awayMentioned &&
                !item.homeMentioned
        );

    const pairedConfirmed =
        confirmed.filter(
            item =>
                item.homeMentioned &&
                item.awayMentioned
        );

    const homePredicted =
        predicted.filter(
            item =>
                item.homeMentioned &&
                !item.awayMentioned
        );

    const awayPredicted =
        predicted.filter(
            item =>
                item.awayMentioned &&
                !item.homeMentioned
        );

    const pairedPredicted =
        predicted.filter(
            item =>
                item.homeMentioned &&
                item.awayMentioned
        );

    return {
        home: {
            confirmed:
                homeConfirmed,
            predicted:
                homePredicted
        },

        away: {
            confirmed:
                awayConfirmed,
            predicted:
                awayPredicted
        },

        paired: {
            confirmed:
                pairedConfirmed,
            predicted:
                pairedPredicted
        },

        confirmed,

        predicted,

        unknown,

        /*
         * actualLineups is TRUE only when we have
         * explicit confirmed lineup evidence.
         */
        actualLineups:
            confirmed.length > 0,

        confirmedAvailable:
            confirmed.length > 0,

        predictedAvailable:
            predicted.length > 0
    };
}


function detectLineupStatus(
    text
) {
    const value =
        cleanText(text);

    if (
        /\bconfirmed\b/.test(value) ||
        /\bstarting xi\b/.test(value) ||
        /\bstarting eleven\b/.test(value) ||
        /\bofficial lineup\b/.test(value) ||
        /\bofficial lineups\b/.test(value)
    ) {
        return "CONFIRMED";
    }

    if (
        /\bpredicted\b/.test(value) ||
        /\bprobable\b/.test(value) ||
        /\bexpected lineup\b/.test(value) ||
        /\bexpected lineups\b/.test(value) ||
        /\bprojected\b/.test(value)
    ) {
        return "PREDICTED";
    }

    return "UNKNOWN";
}


function determineLineupTeams(
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


function extractPlayerNames(
    text
) {
    /*
     * Conservative extraction.
     *
     * The normalizer should not invent players.
     * It returns only obvious "Player Name"
     * patterns when lineup context exists.
     */
    const value =
        String(text || "");

    const matches =
        value.match(
            /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]{2,}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]{2,}\b/g
        ) || [];

    return dedupe(
        matches
    ).slice(0, 50);
}


/* =========================================================
   ODDS
========================================================= */

function buildOdds(
    sources,
    identity
) {
    const current =
        sources.filter(
            source =>
                source.sourceType ===
                    "ODDS" &&
                (
                    source.relevance ===
                        "CURRENT_MATCH" ||
                    source.relevance ===
                        "MATCH_SPECIFIC_UNDATED"
                ) &&
                source.relation ===
                    "EXACT_PAIR"
        );

    const historical =
        sources.filter(
            source =>
                source.sourceType ===
                    "ODDS" &&
                source.relevance ===
                    "HISTORICAL"
        );

    const future =
        sources.filter(
            source =>
                source.sourceType ===
                    "ODDS" &&
                source.relevance ===
                    "FUTURE"
        );

    const structuredCurrent =
        current
            .map(source => ({
                source:
                    summarizeSource(
                        source
                    ),
                markets:
                    extractOddsMarkets(
                        source.text
                    )
            }))
            .filter(
                item =>
                    Object.keys(
                        item.markets
                    ).length > 0
            );

    return {
        current:
            structuredCurrent,

        historical:
            historical.map(
                source =>
                    summarizeSource(
                        source
                    )
            ),

        future:
            future.map(
                source =>
                    summarizeSource(
                        source
                    )
            ),

        available:
            structuredCurrent.length >
            0,

        rule:
            "Undated odds are never presented as verified current odds."
    };
}


function extractOddsMarkets(
    text
) {
    const value =
        String(text || "");

    const markets = {};

    /*
     * 1X2
     */
    const home =
        extractDecimalOddsNear(
            value,
            [
                /\bhome\b/i,
                /\b1\b/
            ]
        );

    const draw =
        extractDecimalOddsNear(
            value,
            [
                /\bdraw\b/i,
                /\bx\b/
            ]
        );

    const away =
        extractDecimalOddsNear(
            value,
            [
                /\baway\b/i,
                /\b2\b/
            ]
        );

    if (
        home !== null ||
        draw !== null ||
        away !== null
    ) {
        markets["1X2"] = {
            home,
            draw,
            away
        };
    }

    /*
     * Over/Under.
     */
    const over25 =
        extractNamedDecimalOdds(
            value,
            /over\s*2\.5\b/i
        );

    const under25 =
        extractNamedDecimalOdds(
            value,
            /under\s*2\.5\b/i
        );

    if (
        over25 !== null ||
        under25 !== null
    ) {
        markets["OVER_UNDER_2_5"] = {
            over:
                over25,
            under:
                under25
        };
    }

    /*
     * BTTS.
     */
    const bttsYes =
        extractNamedDecimalOdds(
            value,
            /btts\s*(?:yes|y)\b/i
        );

    const bttsNo =
        extractNamedDecimalOdds(
            value,
            /btts\s*(?:no|n)\b/i
        );

    if (
        bttsYes !== null ||
        bttsNo !== null
    ) {
        markets.BTTS = {
            yes:
                bttsYes,
            no:
                bttsNo
        };
    }

    return markets;
}


function extractNamedDecimalOdds(
    text,
    marketRegex
) {
    const match =
        marketRegex.exec(
            text
        );

    if (!match) {
        return null;
    }

    const after =
        text.slice(
            match.index +
                match[0].length,
            match.index +
                match[0].length +
                40
        );

    return findValidDecimalOdds(
        after
    );
}


function extractDecimalOddsNear(
    text,
    patterns
) {
    /*
     * This is deliberately conservative.
     *
     * We do NOT simply take the first number.
     * That would turn "Home 62%" into decimal odds 62.
     */
    for (
        const pattern of patterns
    ) {
        const match =
            pattern.exec(
                text
            );

        if (!match) {
            continue;
        }

        const after =
            text.slice(
                match.index +
                    match[0].length,
                match.index +
                    match[0].length +
                    30
            );

        const odds =
            findValidDecimalOdds(
                after
            );

        if (
            odds !== null
        ) {
            return odds;
        }
    }

    return null;
}


function findValidDecimalOdds(
    text
) {
    /*
     * Valid decimal odds generally fall
     * between 1.01 and 100.
     *
     * Reject percentages:
     * 1.62% is not odds.
     */
    const regex =
        /\b(1\.\d{2,3}|[2-9]\.\d{1,3}|[1-9]\d(?:\.\d{1,3})?|100(?:\.0+)?)\b(?!\s*%)/g;

    const matches = [
        ...String(text || "").matchAll(
            regex
        )
    ];

    for (
        const match of matches
    ) {
        const value =
            Number(match[1]);

        if (
            Number.isFinite(value) &&
            value >= 1.01 &&
            value <= 100
        ) {
            return value;
        }
    }

    return null;
}


/* =========================================================
   DATA RELEVANCE
========================================================= */

function determineDataRelevance({
    relevance,
    sourceType,
    h2h,
    eventDate,
    targetDate
}) {
    if (
        h2h &&
        relevance ===
            "HISTORICAL"
    ) {
        return "H2H_CONTEXT";
    }

    if (
        relevance ===
        "CURRENT_MATCH"
    ) {
        return "CURRENT_MATCH_DATA";
    }

    if (
        relevance ===
        "RECENT"
    ) {
        return "RECENT_FORM_DATA";
    }

    if (
        relevance ===
        "FUTURE"
    ) {
        return "FUTURE_AUDIT_ONLY";
    }

    if (
        relevance ===
        "HISTORICAL"
    ) {
        return "HISTORICAL_AUDIT_ONLY";
    }

    if (
        relevance ===
        "MATCH_SPECIFIC_UNDATED"
    ) {
        return "MATCH_SPECIFIC_UNDATED";
    }

    return "UNDATED_AUDIT_ONLY";
}


/* =========================================================
   MATCH-SPECIFIC UNDATED
========================================================= */

function isMatchSpecificUndatedPage(
    text,
    sourceType
) {
    const value =
        cleanText(text);

    if (
        sourceType ===
        "LINEUPS"
    ) {
        return true;
    }

    if (
        sourceType ===
        "ODDS"
    ) {
        return true;
    }

    if (
        sourceType ===
        "MATCH_STATS"
    ) {
        return true;
    }

    /*
     * Injuries are intentionally more conservative.
     *
     * A generic team injury page without a date
     * should not automatically become current.
     */
    if (
        sourceType ===
            "INJURIES" &&
        (
            /\bmatchday\b/.test(value) ||
            /\bavailable for\b/.test(value) ||
            /\bwill miss\b/.test(value)
        )
    ) {
        return true;
    }

    return (
        /\bmatch preview\b/.test(value) ||
        /\bmatch prediction\b/.test(value) ||
        /\bmatch centre\b/.test(value)
    );
}


/* =========================================================
   DATE PARSING
========================================================= */

function parseSourceDate(
    value
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    if (
        value instanceof Date
    ) {
        return validDate(value)
            ? makeDate(
                  value.getUTCFullYear(),
                  value.getUTCMonth() + 1,
                  value.getUTCDate()
              )
            : null;
    }

    if (
        typeof value === "number"
    ) {
        const date =
            new Date(value);

        return validDate(date)
            ? makeDate(
                  date.getUTCFullYear(),
                  date.getUTCMonth() + 1,
                  date.getUTCDate()
              )
            : null;
    }

    const text =
        String(value)
            .trim();

    if (!text) {
        return null;
    }

    /*
     * ISO date only.
     */
    let match =
        text.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

    if (match) {
        return makeDate(
            Number(match[1]),
            Number(match[2]),
            Number(match[3])
        );
    }

    /*
     * ISO datetime.
     *
     * If timezone exists, convert to UTC and
     * use UTC calendar date.
     */
    if (
        /^\d{4}-\d{2}-\d{2}T/.test(
            text
        )
    ) {
        const timestamp =
            Date.parse(text);

        if (
            Number.isFinite(
                timestamp
            )
        ) {
            const date =
                new Date(timestamp);

            return makeDate(
                date.getUTCFullYear(),
                date.getUTCMonth() + 1,
                date.getUTCDate()
            );
        }
    }

    /*
     * Natural dates.
     */
    return parseNaturalDate(
        text,
        null
    );
}


function parseNaturalDate(
    value,
    targetDate
) {
    let text =
        String(value || "")
            .trim();

    if (!text) {
        return null;
    }

    text =
        text.replace(
            /(\d{1,2})(st|nd|rd|th)\b/gi,
            "$1"
        );

    /*
     * Month DD, YYYY
     */
    let match =
        text.match(
            /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})$/i
        );

    if (match) {
        return makeDate(
            Number(match[3]),
            monthNumber(
                match[1]
            ),
            Number(match[2])
        );
    }

    /*
     * DD Month YYYY
     */
    match =
        text.match(
            /^(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december),?\s+(\d{4})$/i
        );

    if (match) {
        return makeDate(
            Number(match[3]),
            monthNumber(
                match[2]
            ),
            Number(match[1])
        );
    }

    /*
     * Numeric YYYY/MM/DD
     */
    match =
        text.match(
            /^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/
        );

    if (match) {
        return makeDate(
            Number(match[1]),
            Number(match[2]),
            Number(match[3])
        );
    }

    /*
     * Numeric DD/MM/YYYY or MM/DD/YYYY.
     *
     * Prefer unambiguous interpretation.
     */
    match =
        text.match(
            /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/
        );

    if (match) {
        const a =
            Number(match[1]);

        const b =
            Number(match[2]);

        const year =
            Number(match[3]);

        if (a > 12) {
            return makeDate(
                year,
                b,
                a
            );
        }

        if (b > 12) {
            return makeDate(
                year,
                a,
                b
            );
        }

        /*
         * Ambiguous numeric dates are treated
         * as day/month/year for this project.
         */
        return makeDate(
            year,
            b,
            a
        );
    }

    /*
     * Month + day with no year.
     *
     * Infer only when targetDate is available.
     */
    if (targetDate) {
        match =
            text.match(
                /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})$/i
            );

        if (match) {
            return makeDate(
                targetDate.getUTCFullYear(),
                monthNumber(
                    match[1]
                ),
                Number(match[2])
            );
        }

        match =
            text.match(
                /^(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)$/i
            );

        if (match) {
            return makeDate(
                targetDate.getUTCFullYear(),
                monthNumber(
                    match[2]
                ),
                Number(match[1])
            );
        }
    }

    return null;
}


function extractNaturalDateCandidates(
    text,
    targetDate
) {
    const results = [];

    const patterns = [
        /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*|\s+)\d{4}/gi,

        /\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/gi,

        /\d{4}-\d{1,2}-\d{1,2}/g,

        /\d{1,2}\/\d{1,2}\/\d{4}/g
    ];

    for (
        const pattern of patterns
    ) {
        for (
            const match of text.matchAll(
                pattern
            )
        ) {
            const raw =
                match[0];

            const date =
                parseNaturalDate(
                    raw,
                    targetDate
                ) ||
                parseSourceDate(
                    raw
                );

            if (date) {
                results.push({
                    raw,
                    date,
                    index:
                        match.index || 0
                });
            }
        }
    }

    return results;
}


/* =========================================================
   DATE UTILITIES
========================================================= */

function makeDate(
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

    const timestamp =
        Date.UTC(
            year,
            month - 1,
            day
        );

    const date =
        new Date(timestamp);

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !==
            month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
}


function monthNumber(
    name
) {
    const months = {
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

    return (
        months[
            String(name)
                .toLowerCase()
        ] || 0
    );
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


function sameDay(
    a,
    b
) {
    return (
        validDate(a) &&
        validDate(b) &&
        a.getUTCFullYear() ===
            b.getUTCFullYear() &&
        a.getUTCMonth() ===
            b.getUTCMonth() &&
        a.getUTCDate() ===
            b.getUTCDate()
    );
}


function withinDays(
    older,
    newer,
    days
) {
    if (
        !validDate(older) ||
        !validDate(newer)
    ) {
        return false;
    }

    const difference =
        newer.getTime() -
        older.getTime();

    return (
        difference >= 0 &&
        difference <=
            days *
                24 *
                60 *
                60 *
                1000
    );
}


function formatDate(
    date
) {
    if (!validDate(date)) {
        return null;
    }

    return date
        .toISOString()
        .slice(0, 10);
}


function isTimezoneAdjacentCurrent(
    eventDate,
    targetDate,
    text
) {
    if (
        !eventDate ||
        !targetDate
    ) {
        return false;
    }

    const difference =
        Math.abs(
            eventDate.getTime() -
                targetDate.getTime()
        );

    const oneDay =
        24 *
        60 *
        60 *
        1000;

    if (
        difference !== oneDay
    ) {
        return false;
    }

    return (
        /\b(?:utc|gmt|cet|cest|bst|est|edt|pst|pdt)\b/i.test(
            text
        ) ||
        /\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/i.test(
            text
        )
    );
}


/* =========================================================
   WARNINGS
========================================================= */

function buildWarnings({
    sources,
    rejectedSources,
    currentSources,
    recentSources,
    historicalSources,
    futureSources,
    undatedSources,
    h2h,
    form,
    stats,
    injuries,
    lineups,
    odds,
    identity
}) {
    const warnings = [];

    if (
        rejectedSources.length > 0
    ) {
        warnings.push({
            code:
                "REJECTED_SOURCES_PRESENT",
            severity: "INFO",
            message:
                `${rejectedSources.length} source(s) were rejected by entity/date validation.`
        });
    }

    if (
        currentSources.length === 0
    ) {
        warnings.push({
            code:
                "NO_CURRENT_MATCH_EVIDENCE",
            severity: "WARNING",
            message:
                "No reliable current-match evidence was found."
        });
    }

    if (
        recentSources.length === 0
    ) {
        warnings.push({
            code:
                "NO_RECENT_FORM_EVIDENCE",
            severity: "WARNING",
            message:
                "No qualifying recent evidence within the 45-day window was found."
        });
    }

    if (
        h2h.historical.length === 0
    ) {
        warnings.push({
            code:
                "NO_HISTORICAL_H2H",
            severity: "INFO",
            message:
                "No completed historical H2H evidence was found."
        });
    }

    if (
        historicalSources.length > 0
    ) {
        warnings.push({
            code:
                "HISTORICAL_EVIDENCE_QUARANTINED",
            severity: "INFO",
            message:
                "Historical evidence is retained for audit but cannot silently enter current-match analysis."
        });
    }

    if (
        futureSources.length > 0
    ) {
        warnings.push({
            code:
                "FUTURE_EVIDENCE_QUARANTINED",
            severity: "INFO",
            message:
                "Future evidence is retained for audit but excluded from current-match analysis."
        });
    }

    if (
        undatedSources.length > 0
    ) {
        warnings.push({
            code:
                "UNDATED_EVIDENCE_PRESENT",
            severity: "INFO",
            message:
                "Some evidence has no reliable event date and is therefore not treated as historical/current without additional context."
        });
    }

    if (
        lineups.predictedAvailable &&
        !lineups.confirmedAvailable
    ) {
        warnings.push({
            code:
                "PREDICTED_LINEUPS_ONLY",
            severity: "INFO",
            message:
                "Predicted/probable lineups are available, but confirmed lineups are not verified."
        });
    }

    if (
        odds.available === false
    ) {
        warnings.push({
            code:
                "NO_STRUCTURED_CURRENT_ODDS",
            severity: "INFO",
            message:
                "No safely extractable current decimal odds were found."
        });
    }

    if (
        containsWrongConcepcionClub(
            sources
                .map(
                    source =>
                        source.text
                )
                .join(" "),
            identity
        )
    ) {
        warnings.push({
            code:
                "CONCEPCION_ENTITY_CONTAMINATION_REJECTED",
            severity: "INFO",
            message:
                "Universidad de Concepcion evidence was detected and blocked from target Concepcion evidence."
        });
    }

    return warnings;
}


/* =========================================================
   DATA AVAILABILITY
========================================================= */

function buildDataAvailability({
    sources,
    currentSources,
    recentSources,
    historicalSources,
    futureSources,
    undatedSources,
    h2h,
    form,
    stats,
    injuries,
    lineups,
    odds
}) {
    return {
        sources: {
            total:
                sources.length,

            current:
                currentSources.length,

            recent:
                recentSources.length,

            historical:
                historicalSources.length,

            future:
                futureSources.length,

            undated:
                undatedSources.length
        },

        h2h:
            h2h.available,

        form:
            form.available,

        currentStats:
            stats.available,

        injuries:
            injuries.available,

        confirmedLineups:
            lineups.confirmedAvailable,

        predictedLineups:
            lineups.predictedAvailable,

        currentOdds:
            odds.available
    };
}


/* =========================================================
   QUALITY
========================================================= */

function calculateQuality({
    sources,
    rejectedSources,
    currentSources,
    recentSources,
    h2h,
    form,
    stats,
    injuries,
    lineups,
    odds
}) {
    let score = 0;

    /*
     * Current evidence.
     */
    if (
        currentSources.length > 0
    ) {
        score += 20;
    }

    /*
     * Recent form.
     */
    if (
        recentSources.length > 0
    ) {
        score += 20;
    }

    /*
     * Current stats.
     */
    if (
        stats.available
    ) {
        score += 15;
    }

    /*
     * H2H.
     */
    if (
        h2h.available
    ) {
        score += 10;
    }

    /*
     * Injuries.
     */
    if (
        injuries.available
    ) {
        score += 10;
    }

    /*
     * Confirmed lineups.
     */
    if (
        lineups.confirmedAvailable
    ) {
        score += 10;
    } else if (
        lineups.predictedAvailable
    ) {
        score += 5;
    }

    /*
     * Current odds.
     */
    if (
        odds.available
    ) {
        score += 10;
    }

    /*
     * Entity/date rejection is not automatically
     * a negative quality score. Rejection means
     * the security gate worked.
     */
    if (
        sources.length > 0 &&
        rejectedSources.length <
            sources.length
    ) {
        score += 5;
    }

    score =
        Math.min(
            100,
            score
        );

    let label;

    if (
        score >= 80
    ) {
        label = "STRONG";
    } else if (
        score >= 60
    ) {
        label = "GOOD";
    } else if (
        score >= 40
    ) {
        label = "LIMITED";
    } else {
        label = "WEAK";
    }

    return {
        score,
        label
    };
}


/* =========================================================
   ANALYSIS READY
========================================================= */

function isAnalysisReady({
    identity,
    targetDate,
    currentSources,
    recentSources,
    form,
    stats
}) {
    if (
        !identity ||
        !targetDate
    ) {
        return false;
    }

    /*
     * We require at least one reliable current
     * match source and one recent evidence source.
     *
     * The downstream prediction engine can still
     * decide whether there is enough evidence for
     * a particular market.
     */
    return (
        currentSources.length > 0 &&
        recentSources.length > 0
    );
}


/* =========================================================
   SOURCE SUMMARIZATION
========================================================= */

function summarizeSource(
    source
) {
    return {
        id:
            source.id,

        source:
            source.source,

        title:
            source.title,

        url:
            source.url,

        snippet:
            source.snippet,

        sourceType:
            source.sourceType,

        relation:
            source.relation,

        eventDate:
            source.eventDate,

        eventDateBasis:
            source.eventDateBasis,

        publishedDate:
            source.publishedDate,

        dateBasis:
            source.dateBasis,

        relevance:
            source.relevance,

        dataRelevance:
            source.dataRelevance,

        h2h:
            source.h2h,

        h2hType:
            source.h2hType
    };
}


/* =========================================================
   METRIC EXTRACTION
========================================================= */

function extractMetric(
    text,
    patterns
) {
    for (
        const pattern of patterns
    ) {
        const match =
            String(text || "")
                .match(pattern);

        if (
            match &&
            match[1]
        ) {
            const value =
                Number(match[1]);

            if (
                Number.isFinite(value)
            ) {
                return value;
            }
        }
    }

    return null;
}


function extractPercentage(
    text,
    pattern
) {
    const match =
        String(text || "")
            .match(pattern);

    if (
        !match ||
        !match[1]
    ) {
        return null;
    }

    const value =
        Number(match[1]);

    if (
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100
    ) {
        return null;
    }

    return value;
}


/* =========================================================
   SENTENCE / STRING UTILITIES
========================================================= */

function splitSentences(
    text
) {
    return String(text || "")
        .split(
            /(?<=[.!?])\s+/
        )
        .map(
            sentence =>
                sentence.trim()
        )
        .filter(Boolean);
}


function dedupe(
    array
) {
    return [
        ...new Set(
            (array || [])
                .filter(Boolean)
        )
    ];
}


function escapeRegExp(
    value
) {
    return String(value)
        .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
}
