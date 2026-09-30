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

        const searches = Array.isArray(webData.searches)
            ? webData.searches
            : [];

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

                const text = (
                    title + " " +
                    snippet + " " +
                    itemDate
                ).toLowerCase();

                const homeMatch =
                    text.includes(home.toLowerCase());

                const awayMatch =
                    text.includes(away.toLowerCase());

                let relevance = "POSSIBLY_IRRELEVANT";

                let relevanceScore = 0;

                if (homeMatch) {
                    relevanceScore += 30;
                }

                if (awayMatch) {
                    relevanceScore += 30;
                }

                if (text.includes(String(targetYear))) {
                    relevanceScore += 10;
                }

                /*
                 * Look for the exact target date in several
                 * common formats.
                 */
                const dateParts = date.split("-");

                const yyyy = dateParts[0];
                const mm = dateParts[1];
                const dd = dateParts[2];

                const dateFormats = [
                    date,
                    `${yyyy}/${mm}/${dd}`,
                    `${dd}/${mm}/${yyyy}`,
                    `${mm}/${dd}/${yyyy}`,
                    `${yyyy}-${mm}-${dd}`,
                    `${dd}-${mm}-${yyyy}`
                ];

                const mentionsTargetDate =
                    dateFormats.some(
                        format =>
                            text.includes(
                                format.toLowerCase()
                            )
                    );

                if (mentionsTargetDate) {
                    relevanceScore += 30;
                }

                /*
                 * Current match
                 */
                if (
                    homeMatch &&
                    awayMatch &&
                    mentionsTargetDate
                ) {
                    relevance = "CURRENT_MATCH";
                }

                /*
                 * H2H pages are historical by nature.
                 */
                else if (
                    homeMatch &&
                    awayMatch &&
                    (
                        text.includes("h2h") ||
                        text.includes("head to head") ||
                        text.includes("head-to-head")
                    )
                ) {
                    relevance = "HISTORICAL";
                }

                /*
                 * Same teams but no exact target date.
                 */
                else if (
                    homeMatch &&
                    awayMatch
                ) {
                    relevance = "RECENT_OR_HISTORICAL";
                }

                normalized.sources.push({
                    type,
                    title,
                    url: link,
                    snippet,
                    date: itemDate || null,
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
                        "injuries",
                        "suspended",
                        "suspension",
                        "unavailable",
                        "doubtful",
                        "out"
                    ];

                    const hasInjuryInformation =
                        injuryWords.some(
                            word => text.includes(word)
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

                    if (homeMatch) {
                        normalized.lineups.home = {
                            source: title,
                            url: link,
                            snippet
                        };
                    }

                    if (awayMatch) {
                        normalized.lineups.away = {
                            source: title,
                            url: link,
                            snippet
                        };
                    }
                }

                /*
                 * Statistics are deliberately NOT guessed.
                 */
                if (type === "stats") {

                    const statRecord = {
                        source: title,
                        url: link,
                        snippet
                    };

                    /*
                     * Keep the source for the analysis engine.
                     * We don't convert snippets into fake numbers.
                     */
                    normalized.sources.push({
                        type: "stats-evidence",
                        title,
                        url: link,
                        snippet,
                        date: itemDate || null,
                        relevance,
                        relevanceScore
                    });
                }

                /*
                 * Odds evidence is also preserved as source
                 * material rather than guessed numbers.
                 */
                if (type === "odds") {

                    normalized.sources.push({
                        type: "odds-evidence",
                        title,
                        url: link,
                        snippet,
                        date: itemDate || null,
                        relevance,
                        relevanceScore
                    });
                }
            }
        }

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

        const currentSources =
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

        if (currentSources.length === 0) {
            normalized.warnings.push(
                "No source was confidently matched to the exact target date."
            );
        }

        if (historicalSources.length > 0) {
            normalized.warnings.push(
                "Historical or previous-match information was detected. It must not be treated as current-match information."
            );
        }

        normalized.warnings.push(
            "Missing statistics are left null rather than guessed."
        );

        return res.status(200).json({
            success: true,

            normalized,

            quality: {
                totalSources:
                    normalized.sources.length,

                currentMatchSources:
                    currentSources.length,

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
