export default async function handler(req, res) {
    try {
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

        const targetDate = new Date(date);

        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                error: "Invalid match date."
            });
        }

        const targetYear = targetDate.getUTCFullYear();

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

            injuries: {
                home: [],
                away: []
            },

            lineups: {
                home: null,
                away: null
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

            sources: [],

            warnings: []
        };

        /*
         * Flatten the searches returned by /api/web-data
         */
        const searches = webData.searches || [];

        for (const search of searches) {

            const type = search.type || "unknown";

            const results = search.results || [];

            for (const item of results) {

                const title = item.title || "";
                const snippet = item.snippet || "";
                const link = item.link || "";

                const text =
                    `${title} ${snippet}`.toLowerCase();

                /*
                 * Determine whether the result is about
                 * the requested teams.
                 */
                const homeMatch =
                    text.includes(home.toLowerCase());

                const awayMatch =
                    text.includes(away.toLowerCase());

                /*
                 * Date relevance
                 */
                const dateText =
                    `${title} ${snippet} ${item.date || ""}`;

                const targetDateText =
                    date.replace(/-/g, "/");

                const mentionsTargetDate =
                    dateText.includes(date) ||
                    dateText.includes(targetDateText) ||
                    text.includes(
                        `${targetDateTargetDate(dayPart(date))}`
                    );

                /*
                 * General relevance score
                 */
                let relevanceScore = 0;

                if (homeMatch) relevanceScore += 30;
                if (awayMatch) relevanceScore += 30;

                if (text.includes(String(targetYear))) {
                    relevanceScore += 10;
                }

                if (mentionsTargetDate) {
                    relevanceScore += 30;
                }

                /*
                 * Classify the source.
                 */
                let relevance = "POSSIBLY_IRRELEVANT";

                if (homeMatch && awayMatch) {

                    if (mentionsTargetDate) {
                        relevance = "CURRENT_MATCH";
                    } else if (
                        text.includes("h2h") ||
                        text.includes("head to head") ||
                        text.includes("head-to-head")
                    ) {
                        relevance = "HISTORICAL";
                    } else {
                        relevance = "RECENT_OR_HISTORICAL";
                    }
                }

                /*
                 * Save source information.
                 */
                normalized.sources.push({
                    type,
                    title,
                    url: link,
                    snippet,
                    date: item.date || null,
                    relevance,
                    relevanceScore
                });

                /*
                 * H2H
                 */
                if (
                    type === "h2h" &&
                    homeMatch &&
                    awayMatch
                ) {
                    normalized.h2h.push({
                        source: title,
                        url: link,
                        snippet
                    });
                }

                /*
                 * Injuries
                 */
                if (type === "injuries") {

                    const injuryWords = [
                        "injury",
                        "injured",
                        "suspended",
                        "unavailable",
                        "doubtful",
                        "out"
                    ];

                    const hasInjuryInformation =
                        injuryWords.some(word =>
                            text.includes(word)
                        );

                    if (hasInjuryInformation) {

                        normalized.injuries.home.push({
                            source: title,
                            url: link,
                            snippet
                        });

                        normalized.injuries.away.push({
                            source: title,
                            url: link,
                            snippet
                        });
                    }
                }

                /*
                 * Lineups
                 */
                if (type === "lineups") {

                    if (
                        text.includes(
                            home.toLowerCase()
                        )
                    ) {
                        normalized.lineups.home = {
                            source: title,
                            url: link,
                            snippet
                        };
                    }

                    if (
                        text.includes(
                            away.toLowerCase()
                        )
                    ) {
                        normalized.lineups.away = {
                            source: title,
                            url: link,
                            snippet
                        };
                    }
                }

                /*
                 * Basic odds extraction.
                 */
                if (type === "odds") {

                    const homeOdds =
                        extractNumberAfterKeyword(
                            text,
                            [
                                "home",
                                home.toLowerCase()
                            ]
                        );

                    const awayOdds =
                        extractNumberAfterKeyword(
                            text,
                            [
                                "away",
                                away.toLowerCase()
                            ]
                        );

                    if (
                        homeOdds !== null &&
                        normalized.odds.home === null
                    ) {
                        normalized.odds.home = homeOdds;
                    }

                    if (
                        awayOdds !== null &&
                        normalized.odds.away === null
                    ) {
                        normalized.odds.away = awayOdds;
                    }
                }
            }
        }

        /*
         * Remove duplicate H2H sources.
         */
        normalized.h2h =
            removeDuplicates(
                normalized.h2h,
                "url"
            );

        /*
         * Remove duplicate sources.
         */
        normalized.sources =
            removeDuplicates(
                normalized.sources,
                "url"
            );

        /*
         * Count useful sources.
         */
        const currentMatchSources =
            normalized.sources.filter(
                source =>
                    source.relevance === "CURRENT_MATCH"
            );

        const historicalSources =
            normalized.sources.filter(
                source =>
                    source.relevance === "HISTORICAL" ||
                    source.relevance === "RECENT_OR_HISTORICAL"
            );

        /*
         * Warnings
         */
        if (currentMatchSources.length === 0) {
            normalized.warnings.push(
                "No web source was confidently matched to the exact target date."
            );
        }

        if (historicalSources.length > 0) {
            normalized.warnings.push(
                "Historical or previous-match information was detected and must not be treated as current-match data."
            );
        }

        normalized.warnings.push(
            "Numerical statistics are not inferred when the source does not explicitly provide them."
        );

        return res.status(200).json({
            success: true,

            normalized,

            quality: {
                totalSources:
                    normalized.sources.length,

                currentMatchSources:
                    currentMatchSources.length,

                historicalSources:
                    historicalSources.length,

                h2hSources:
                    normalized.h2h.length
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
 * Extract a number following a keyword.
 * This is deliberately conservative.
 */
function extractNumberAfterKeyword(text, keywords) {

    for (const keyword of keywords) {

        const escaped =
            keyword.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

        const pattern =
            new RegExp(
                `${escaped}\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)`
            );

        const match = text.match(pattern);

        if (match) {
            const value = Number(match[1]);

            if (
                Number.isFinite(value) &&
                value > 0 &&
                value < 1000
            ) {
                return value;
            }
        }
    }

    return null;
}

/*
 * Remove duplicate objects by a property.
 */
function removeDuplicates(items, property) {

    const seen = new Set();

    return items.filter(item => {

        const value = item[property];

        if (!value) {
            return true;
        }

        if (seen.has(value)) {
            return false;
        }

        seen.add(value);

        return true;
    });
}

/*
 * Safe helper for date text.
 */
function dayPart(dateString) {

    const parts = dateString.split("-");

    return parts.length === 3
        ? parts[2]
        : "";
}

function targetDateTargetDate(value) {
    return value;
}
