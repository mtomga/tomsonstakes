export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                success: false,
                error: "POST method required."
            });
        }

        const raw = req.body;

        if (!raw) {
            return res.status(400).json({
                success: false,
                error: "Request body is required."
            });
        }

        const match = raw.match || {};
        const home = cleanTeamName(match.home || "");
        const away = cleanTeamName(match.away || "");
        const targetDate = normalizeDate(match.date);

        if (!home || !away || !targetDate) {
            return res.status(400).json({
                success: false,
                error: "home, away and date are required."
            });
        }

        const homeAliases = buildAliases(home);
        const awayAliases = buildAliases(away);

        const searches = Array.isArray(raw.searches)
            ? raw.searches
            : [];

        const allResults = [];

        for (const search of searches) {
            const type = search.type || "";

            const items = Array.isArray(search.results)
                ? search.results
                : [];

            for (const item of items) {
                allResults.push({
                    type,
                    title: item.title || "",
                    link: item.link || "",
                    snippet: item.snippet || "",
                    date: item.date || null
                });
            }
        }

        /*
         * ------------------------------------------------------------
         * BASIC HELPERS
         * ------------------------------------------------------------
         */

        function cleanText(value) {
            return String(value || "")
                .replace(/\s+/g, " ")
                .trim();
        }

        function normalizeText(value) {
            return cleanText(value)
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
        }

        function cleanTeamName(value) {
            return cleanText(value)
                .replace(/^deportes\s+/i, "")
                .replace(/\s+/g, " ")
                .trim();
        }

        function normalizeDate(value) {
            if (!value) return null;

            if (value instanceof Date && !isNaN(value)) {
                return formatDate(value);
            }

            const text = cleanText(value);

            if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                return text;
            }

            const parsed = new Date(text);

            if (!isNaN(parsed)) {
                return formatDate(parsed);
            }

            return null;
        }

        function formatDate(date) {
            const y = date.getUTCFullYear();
            const m = String(date.getUTCMonth() + 1).padStart(2, "0");
            const d = String(date.getUTCDate()).padStart(2, "0");

            return `${y}-${m}-${d}`;
        }

        function dateObject(value) {
            const normalized = normalizeDate(value);
            if (!normalized) return null;

            const d = new Date(`${normalized}T00:00:00Z`);

            return isNaN(d) ? null : d;
        }

        function daysBetween(a, b) {
            const da = dateObject(a);
            const db = dateObject(b);

            if (!da || !db) return null;

            return Math.round(
                Math.abs(db.getTime() - da.getTime()) /
                86400000
            );
        }

        function buildAliases(team) {
            const normalized = normalizeText(team);
            const aliases = new Set();

            aliases.add(normalized);

            if (normalized === "concepcion") {
                aliases.add("deportes concepcion");
                aliases.add("d concepcion");
                aliases.add("d. concepcion");
            }

            if (normalized === "o'higgins" || normalized === "ohiggins") {
                aliases.add("ohiggins");
                aliases.add("o'higgins");
                aliases.add("o higgins");
                aliases.add("club ohiggins");
            }

            return Array.from(aliases);
        }

        function containsTeam(text, aliases) {
            const normalized = normalizeText(text);

            return aliases.some(alias => {
                return normalized.includes(alias);
            });
        }

        /*
         * VERY IMPORTANT:
         * "Universidad de Concepcion" is NOT the same club as
         * "Concepcion".
         */

        function isWrongConcepcionClub(text) {
            const normalized = normalizeText(text);

            if (!normalized.includes("universidad de concepcion")) {
                return false;
            }

            if (homeAliases.includes("concepcion")) {
                return true;
            }

            return false;
        }

        function containsBothTeams(text) {
            if (isWrongConcepcionClub(text)) {
                return false;
            }

            return (
                containsTeam(text, homeAliases) &&
                containsTeam(text, awayAliases)
            );
        }

        /*
         * ------------------------------------------------------------
         * DATE EXTRACTION
         * ------------------------------------------------------------
         */

        function extractDates(text) {
            const dates = [];

            const source = cleanText(text);

            const patterns = [
            const patterns = [
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g,

    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(\d{4})\b/gi,

    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/gi,

    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,

    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/gi,

    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g
];
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

            for (const match of source.matchAll(patterns[0])) {
                dates.push(
                    `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`
                );
            }

            for (const match of source.matchAll(patterns[1])) {
                const month = months[match[1].toLowerCase()];
                if (!month) continue;

                dates.push(
                    `${match[3]}-${String(month).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`
                );
            }

            for (const match of source.matchAll(patterns[2])) {
                const month = months[match[1].toLowerCase()];
                if (!month) continue;

                dates.push(
                    `${match[3]}-${String(month).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`
                );
            }

            for (const match of source.matchAll(patterns[3])) {
                const month = months[match[2].toLowerCase()];
                if (!month) continue;

                dates.push(
                    `${match[3]}-${String(month).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`
                );
            }

            for (const match of source.matchAll(patterns[4])) {
                const month = months[match[2].toLowerCase()];
                if (!month) continue;

                dates.push(
                    `${match[3]}-${String(month).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`
                );
            }

            /*
             * Numeric dates:
             *
             * If one side is >12 it is clearly DD/MM/YYYY.
             * Otherwise we keep both possible interpretations and
             * choose the one closest to the target date.
             */

            for (const match of source.matchAll(patterns[5])) {
                const a = Number(match[1]);
                const b = Number(match[2]);
                const year = Number(match[3]);

                const candidates = [];

                if (a <= 12 && b <= 31) {
                    candidates.push(
                        `${year}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`
                    );
                }

                if (b <= 12 && a <= 31) {
                    candidates.push(
                        `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`
                    );
                }

                for (const candidate of candidates) {
                    if (!dates.includes(candidate)) {
                        dates.push(candidate);
                    }
                }
            }

            return [...new Set(
                dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
            )];
        }

        function chooseEventDate(text) {
            const dates = extractDates(text);

            if (!dates.length) {
                return null;
            }

            const target = targetDate;

            let best = null;
            let bestDistance = Infinity;

            for (const date of dates) {
                const distance = daysBetween(date, target);

                if (distance !== null && distance < bestDistance) {
                    best = date;
                    bestDistance = distance;
                }
            }

            return best;
        }

        /*
         * ------------------------------------------------------------
         * PUBLICATION DATE
         * ------------------------------------------------------------
         */

        function extractPublishedDate(item) {
            if (item.date) {
                const d = normalizeDate(item.date);

                if (d) return d;
            }

            return null;
        }

        /*
         * ------------------------------------------------------------
         * SOURCE CLASSIFICATION
         * ------------------------------------------------------------
         */

        function classifySource({
            title,
            snippet,
            type,
            eventDate,
            publishedDate
        }) {
            const combined = cleanText(
                `${title} ${snippet}`
            );

            const normalized = normalizeText(combined);

            const hasBothTeams = containsBothTeams(combined);

            if (!hasBothTeams) {
                return "IRRELEVANT";
            }

            if (eventDate) {
                if (eventDate === targetDate) {
                    return "CURRENT_MATCH";
                }

                if (eventDate > targetDate) {
                    return "FUTURE";
                }

                /*
                 * For H2H pages an older event date is expected.
                 */
                if (
                    type === "h2h" ||
                    normalized.includes("head to head") ||
                    normalized.includes("h2h")
                ) {
                    return "HISTORICAL";
                }

                return "HISTORICAL";
            }

            if (publishedDate) {
                const age = daysBetween(
                    publishedDate,
                    targetDate
                );

                if (
                    age !== null &&
                    age >= 0 &&
                    age <= 30
                ) {
                    return "RECENT";
                }
            }

            return "UNDATED_TEAM_SOURCE";
        }

        /*
         * ------------------------------------------------------------
         * H2H
         * ------------------------------------------------------------
         */

        function isH2HSource(item) {
            const text = normalizeText(
                `${item.title} ${item.snippet}`
            );

            return (
                text.includes("head to head") ||
                text.includes("h2h") ||
                text.includes("head-to-head")
            );
        }

        /*
         * A target-date H2H/live page is NOT historical merely
         * because its title contains H2H.
         */

        function classifyH2H(item) {
            const combined = `${item.title} ${item.snippet}`;

            const eventDate = chooseEventDate(combined);

            const publishedDate = extractPublishedDate(item);

            if (
                eventDate === targetDate &&
                containsBothTeams(combined)
            ) {
                return {
                    relevance: "CURRENT_MATCH",
                    eventDate,
                    publishedDate
                };
            }

            return {
                relevance: "HISTORICAL",
                eventDate,
                publishedDate
            };
        }

        /*
         * ------------------------------------------------------------
         * INJURIES
         * ------------------------------------------------------------
         */

        function extractInjuryEvidence(item) {
            const text = cleanText(
                `${item.title} ${item.snippet}`
            );

            if (isWrongConcepcionClub(text)) {
                return [];
            }

            const normalized = normalizeText(text);

            if (
                !normalized.includes("injur") &&
                !normalized.includes("unavailable") &&
                !normalized.includes("suspend")
            ) {
                return [];
            }

            const results = [];

            const sentences = text
                .split(/[.!?]\s+/)
                .map(s => cleanText(s))
                .filter(Boolean);

            for (const sentence of sentences) {
                if (
                    !normalizeText(sentence).match(
                        /injur|unavailable|suspend/
                    )
                ) {
                    continue;
                }

                const sentenceNormalized =
                    normalizeText(sentence);

                let team = "unknown";

                if (
                    containsTeam(sentence, homeAliases) &&
                    !sentenceNormalized.includes(
                        "universidad de concepcion"
                    )
                ) {
                    team = "home";
                }

                if (
                    containsTeam(sentence, awayAliases)
                ) {
                    team =
                        team === "home"
                            ? "unknown"
                            : "away";
                }

                /*
                 * Explicit Universidad de Concepcion statements
                 * must never be attributed to Concepcion.
                 */
                if (
                    sentenceNormalized.includes(
                        "universidad de concepcion"
                    )
                ) {
                    continue;
                }

                results.push({
                    team,
                    text: sentence,
                    source: item.title,
                    url: item.link || null
                });
            }

            return results;
        }

        /*
         * ------------------------------------------------------------
         * LINEUPS
         * ------------------------------------------------------------
         */

        function isPredictedLineup(text) {
            const normalized = normalizeText(text);

            return (
                normalized.includes("predicted lineup") ||
                normalized.includes("predicted lineups") ||
                normalized.includes("predicted xi") ||
                normalized.includes("predicted x11") ||
                normalized.includes("starting 11 prediction")
            );
        }

        function isActualLineup(text) {
            const normalized = normalizeText(text);

            if (
                normalized.includes("predicted lineup") ||
                normalized.includes("predicted xi")
            ) {
                return false;
            }

            return (
                normalized.includes("lineups for") ||
                normalized.includes("starting lineup") ||
                normalized.includes("starting xi")
            );
        }

        function lineupEvidence(item) {
            const text = cleanText(
                `${item.title} ${item.snippet}`
            );

            if (
                !containsBothTeams(text) ||
                isWrongConcepcionClub(text)
            ) {
                return null;
            }

            const eventDate = chooseEventDate(text);
            const publishedDate =
                extractPublishedDate(item);

            /*
             * Old match reports must not become current lineups.
             */
            if (
                eventDate &&
                eventDate !== targetDate
            ) {
                return null;
            }

            const predicted =
                isPredictedLineup(text);

            const actual =
                !predicted &&
                isActualLineup(text);

            return {
                type: "lineups",
                source: item.title,
                url: item.link || null,
                snippet: item.snippet || "",
                relevance:
                    eventDate === targetDate
                        ? "CURRENT_MATCH"
                        : "UNDATED_TEAM_SOURCE",
                eventDate,
                publishedDate,
                confirmed: actual,
                predicted
            };
        }

        /*
         * ------------------------------------------------------------
         * STATS
         * ------------------------------------------------------------
         */

        function statsEvidence(item) {
            const text = cleanText(
                `${item.title} ${item.snippet}`
            );

            if (
                !containsBothTeams(text) ||
                isWrongConcepcionClub(text)
            ) {
                return null;
            }

            const eventDate = chooseEventDate(text);
            const publishedDate =
                extractPublishedDate(item);

            const relevance = classifySource({
                title: item.title,
                snippet: item.snippet,
                type: "stats",
                eventDate,
                publishedDate
            });

            /*
             * Do not allow an old team article to become current.
             */
            if (
                relevance === "HISTORICAL" ||
                relevance === "FUTURE"
            ) {
                return null;
            }

            return {
                type: "stats",
                source: item.title,
                url: item.link || null,
                snippet: item.snippet || "",
                relevance,
                eventDate,
                publishedDate
            };
        }

        /*
         * ------------------------------------------------------------
         * ODDS
         * ------------------------------------------------------------
         */

        function oddsEvidence(item) {
            const text = cleanText(
                `${item.title} ${item.snippet}`
            );

            if (
                !containsBothTeams(text) ||
                isWrongConcepcionClub(text)
            ) {
                return null;
            }

            const normalized = normalizeText(text);

            if (
                !normalized.includes("odds") &&
                !normalized.includes("1x2") &&
                !normalized.includes("over") &&
                !normalized.includes("under") &&
                !normalized.includes("btts")
            ) {
                return null;
            }

            const eventDate = chooseEventDate(text);
            const publishedDate =
                extractPublishedDate(item);

            const relevance = classifySource({
                title: item.title,
                snippet: item.snippet,
                type: "odds",
                eventDate,
                publishedDate
            });

            if (
                relevance === "HISTORICAL" ||
                relevance === "FUTURE"
            ) {
                return null;
            }

            return {
                type: "odds",
                source: item.title,
                url: item.link || null,
                snippet: item.snippet || "",
                relevance,
                eventDate,
                publishedDate
            };
        }

        /*
         * ------------------------------------------------------------
         * FORM
         * ------------------------------------------------------------
         */

        function formEvidence(item) {
            const text = cleanText(
                `${item.title} ${item.snippet}`
            );

            if (
                !containsBothTeams(text) ||
                isWrongConcepcionClub(text)
            ) {
                return null;
            }

            const eventDate = chooseEventDate(text);
            const publishedDate =
                extractPublishedDate(item);

            /*
             * A form article needs actual result/date evidence.
             */
            if (!eventDate) {
                return null;
            }

            if (eventDate >= targetDate) {
                return null;
            }

            return {
                source: item.title,
                url: item.link || null,
                snippet: item.snippet || "",
                eventDate,
                publishedDate
            };
        }

        /*
         * ------------------------------------------------------------
         * BUILD RESULT ARRAYS
         * ------------------------------------------------------------
         */

        const h2h = [];
        const formHome = [];
        const formAway = [];
        const formEvidenceHome = [];
        const formEvidenceAway = [];

        const injuriesHome = [];
        const injuriesAway = [];
        const injuriesUnknown = [];

        const lineups = [];
        const stats = [];
        const undatedStats = [];
        const odds = [];
        const undatedOdds = [];

        let currentMatchSources = 0;
        let recentSources = 0;
        let historicalSources = 0;
        let futureSources = 0;
        let undatedTeamSources = 0;
        let irrelevantSources = 0;

        for (const item of allResults) {
            const text = cleanText(
                `${item.title} ${item.snippet}`
            );

            /*
             * Reject wrong club before ANY extraction.
             */
            if (isWrongConcepcionClub(text)) {
                irrelevantSources++;
                continue;
            }

            const eventDate = chooseEventDate(text);
            const publishedDate =
                extractPublishedDate(item);

            const relevance = classifySource({
                title: item.title,
                snippet: item.snippet,
                type: item.type,
                eventDate,
                publishedDate
            });

            if (relevance === "CURRENT_MATCH") {
                currentMatchSources++;
            } else if (relevance === "RECENT") {
                recentSources++;
            } else if (relevance === "HISTORICAL") {
                historicalSources++;
            } else if (relevance === "FUTURE") {
                futureSources++;
            } else if (
                relevance === "UNDATED_TEAM_SOURCE"
            ) {
                undatedTeamSources++;
            } else {
                irrelevantSources++;
            }

            /*
             * H2H
             */
            if (
                item.type === "h2h" ||
                isH2HSource(item)
            ) {
                const h = classifyH2H(item);

                h2h.push({
                    source: item.title,
                    url: item.link || null,
                    snippet: item.snippet || "",
                    relevance: h.relevance,
                    dataRelevance:
                        h.relevance === "CURRENT_MATCH"
                            ? "CURRENT_MATCH_PAGE"
                            : "H2H_CONTEXT",
                    eventDate: h.eventDate,
                    publishedDate: h.publishedDate
                });
            }

            /*
             * FORM
             */
            if (item.type === "form") {
                const f = formEvidence(item);

                if (f) {
                    const normalized =
                        normalizeText(text);

                    if (
                        normalized.includes(
                            normalizeText(home)
                        )
                    ) {
                        formEvidenceHome.push(f);
                    }

                    if (
                        normalized.includes(
                            normalizeText(away)
                        )
                    ) {
                        formEvidenceAway.push(f);
                    }
                }
            }

            /*
             * INJURIES
             */
            if (item.type === "injuries") {
                const injuryItems =
                    extractInjuryEvidence(item);

                for (const injury of injuryItems) {
                    if (injury.team === "home") {
                        injuriesHome.push(injury);
                    } else if (
                        injury.team === "away"
                    ) {
                        injuriesAway.push(injury);
                    } else {
                        injuriesUnknown.push(injury);
                    }
                }
            }

            /*
             * LINEUPS
             */
            if (item.type === "lineups") {
                const lineup =
                    lineupEvidence(item);

                if (lineup) {
                    lineups.push(lineup);
                }
            }

            /*
             * STATS
             */
            if (item.type === "stats") {
                const stat =
                    statsEvidence(item);

                if (stat) {
                    if (
                        stat.relevance === "CURRENT_MATCH" ||
                        stat.relevance === "RECENT"
                    ) {
                        stats.push(stat);
                    } else {
                        undatedStats.push(stat);
                    }
                }
            }

            /*
             * ODDS
             */
            if (item.type === "odds") {
                const odd =
                    oddsEvidence(item);

                if (odd) {
                    if (
                        odd.relevance === "CURRENT_MATCH" ||
                        odd.relevance === "RECENT"
                    ) {
                        odds.push(odd);
                    } else {
                        undatedOdds.push(odd);
                    }
                }
            }
        }

        /*
         * ------------------------------------------------------------
         * DEDUPLICATION
         * ------------------------------------------------------------
         */

        function dedupe(items) {
            const seen = new Set();

            return items.filter(item => {
                const key = [
                    item.source || "",
                    item.url || "",
                    item.eventDate || "",
                    item.team || ""
                ].join("|");

                if (seen.has(key)) {
                    return false;
                }

                seen.add(key);
                return true;
            });
        }

        function dedupeSimple(items) {
            const seen = new Set();

            return items.filter(item => {
                const key = [
                    item.source || "",
                    item.url || "",
                    item.eventDate || ""
                ].join("|");

                if (seen.has(key)) {
                    return false;
                }

                seen.add(key);
                return true;
            });
        }

        const cleanH2H = dedupeSimple(h2h);

        const cleanStats = dedupeSimple(stats);
        const cleanUndatedStats =
            dedupeSimple(undatedStats);

        const cleanOdds = dedupeSimple(odds);
        const cleanUndatedOdds =
            dedupeSimple(undatedOdds);

        const cleanLineups =
            dedupeSimple(lineups);

        const cleanHomeInjuries =
            dedupe(injuriesHome);

        const cleanAwayInjuries =
            dedupe(injuriesAway);

        const cleanUnknownInjuries =
            dedupe(injuriesUnknown);

        /*
         * ------------------------------------------------------------
         * LINEUP SELECTION
         * ------------------------------------------------------------
         */

        const predictedLineups =
            cleanLineups.filter(x => x.predicted);

        const confirmedLineups =
            cleanLineups.filter(x => x.confirmed);

        const selectedLineup =
            confirmedLineups[0] ||
            predictedLineups[0] ||
            cleanLineups[0] ||
            null;

        /*
         * ------------------------------------------------------------
         * STRUCTURED STATS
         *
         * Do NOT manufacture values.
         * ------------------------------------------------------------
         */

        const goals = {
            home: null,
            away: null
        };

        const xg = {
            home: null,
            away: null,
            total: null
        };

        const btts = {
            home: null,
            away: null,
            h2h: null
        };

        const overUnder = {
            over15: null,
            over25: null,
            over35: null,
            under25: null,
            under35: null
        };

        /*
         * ------------------------------------------------------------
         * STRUCTURED ODDS
         * ------------------------------------------------------------
         *
         * We intentionally leave these null until a reliable,
         * current-match odds parser is implemented.
         */

        const oddsValues = {
            home: null,
            draw: null,
            away: null,
            over25: null,
            under25: null,
            bttsYes: null,
            bttsNo: null
        };

        /*
         * ------------------------------------------------------------
         * WARNINGS
         * ------------------------------------------------------------
         */

        const warnings = [];

        if (historicalSources > 0) {
            warnings.push(
                "Historical evidence was detected and excluded from current-match statistics."
            );
        }

        if (futureSources > 0) {
            warnings.push(
                "Future fixture information was detected and excluded from current-match evidence."
            );
        }

        if (undatedTeamSources > 0) {
            warnings.push(
                "Some team-related sources had no reliable event date and were kept separately."
            );
        }

        if (cleanUndatedStats.length > 0) {
            warnings.push(
                "Undated statistical sources were retained separately and must not be treated as current-match statistics."
            );
        }

        if (cleanUndatedOdds.length > 0) {
            warnings.push(
                "Undated odds sources were retained separately and were not used as structured current-match odds."
            );
        }

        if (cleanOdds.length === 0) {
            warnings.push(
                "No date-qualified current-match odds source was confidently identified."
            );
        }

        if (predictedLineups.length > 0) {
            warnings.push(
                "Predicted lineup evidence is available, but it is not a confirmed starting XI."
            );
        }

        /*
         * ------------------------------------------------------------
         * COMPACT SOURCE SUMMARY
         * ------------------------------------------------------------
         */

        const sourceSummary = {
            h2h: cleanH2H.slice(0, 8).map(x => ({
                source: x.source,
                url: x.url,
                relevance: x.relevance,
                eventDate: x.eventDate
            })),

            stats: cleanStats.slice(0, 6).map(x => ({
                source: x.source,
                url: x.url,
                relevance: x.relevance,
                eventDate: x.eventDate
            })),

            injuries: [
                ...cleanHomeInjuries,
                ...cleanAwayInjuries
            ].slice(0, 8).map(x => ({
                team: x.team,
                source: x.source,
                url: x.url
            })),

            lineups: cleanLineups.slice(0, 6).map(x => ({
                source: x.source,
                url: x.url,
                predicted: x.predicted,
                confirmed: x.confirmed
            })),

            odds: cleanOdds.slice(0, 6).map(x => ({
                source: x.source,
                url: x.url,
                relevance: x.relevance
            }))
        };

        /*
         * ------------------------------------------------------------
         * FINAL RESULT
         * ------------------------------------------------------------
         */

        const normalized = {
            match: {
                home,
                away,
                date: targetDate,
                year: Number(targetDate.slice(0, 4))
            },

            form: {
                home: [],
                away: []
            },

            formEvidence: {
                home: formEvidenceHome.slice(0, 10),
                away: formEvidenceAway.slice(0, 10)
            },

            h2h: cleanH2H.slice(0, 10),

            goals,

            xg,

            btts,

            overUnder,

            injuries: {
                home: cleanHomeInjuries.slice(0, 10),
                away: cleanAwayInjuries.slice(0, 10),
                unknown: cleanUnknownInjuries.slice(0, 5)
            },

            lineups: {
                home: selectedLineup,
                away: selectedLineup,
                matchEvidence: cleanLineups.slice(0, 8)
            },

            odds: oddsValues,

            statsEvidence: cleanStats.slice(0, 8),

            undatedStatsEvidence:
                cleanUndatedStats.slice(0, 6),

            oddsEvidence: cleanOdds.slice(0, 8),

            undatedOddsEvidence:
                cleanUndatedOdds.slice(0, 6),

            sourceSummary,

            warnings
        };

        const quality = {
            totalSources: allResults.length,

            currentMatchSources,
            recentSources,
            historicalSources,
            futureSources,
            undatedTeamSources,
            irrelevantSources,

            h2hSources: cleanH2H.length,

            formEvidence:
                formEvidenceHome.length +
                formEvidenceAway.length,

            statsEvidence:
                cleanStats.length,

            undatedStatsEvidence:
                cleanUndatedStats.length,

            injuryEvidence:
                cleanHomeInjuries.length +
                cleanAwayInjuries.length +
                cleanUnknownInjuries.length,

            injurySources:
                cleanHomeInjuries.length +
                cleanAwayInjuries.length,

            lineupEvidence:
                cleanLineups.length,

            predictedLineupEvidence:
                predictedLineups.length,

            confirmedLineupEvidence:
                confirmedLineups.length,

            oddsEvidence:
                cleanOdds.length,

            undatedOddsEvidence:
                cleanUndatedOdds.length
        };

        const dataAvailability = {
            fixture: {
                available:
                    currentMatchSources > 0,
                confidence:
                    currentMatchSources > 0
                        ? "HIGH"
                        : "NONE"
            },

            form: {
                available:
                    formEvidenceHome.length > 0 ||
                    formEvidenceAway.length > 0,

                confidence:
                    formEvidenceHome.length > 0 ||
                    formEvidenceAway.length > 0
                        ? "MEDIUM"
                        : "NONE",

                reason:
                    formEvidenceHome.length === 0 &&
                    formEvidenceAway.length === 0
                        ? "No date-qualified recent results extracted."
                        : null
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
                    cleanHomeInjuries.length > 0 ||
                    cleanAwayInjuries.length > 0,

                confidence:
                    cleanHomeInjuries.length > 0 ||
                    cleanAwayInjuries.length > 0
                        ? "MEDIUM"
                        : "NONE",

                sourceAvailable:
                    cleanHomeInjuries.length > 0 ||
                    cleanAwayInjuries.length > 0
            },

            lineups: {
                sourceAvailable:
                    cleanLineups.length > 0,

                playersAvailable:
                    cleanLineups.length > 0,

                confirmed:
                    confirmedLineups.length > 0
            },

            stats: {
                available:
                    cleanStats.length > 0 ||
                    cleanUndatedStats.length > 0,

                confidence:
                    cleanStats.length > 0
                        ? "MEDIUM"
                        : cleanUndatedStats.length > 0
                            ? "LOW"
                            : "NONE",

                undatedAvailable:
                    cleanUndatedStats.length > 0
            },

            odds: {
                sourceAvailable:
                    cleanOdds.length > 0 ||
                    cleanUndatedOdds.length > 0,

                structured1X2: false,

                confidence:
                    cleanOdds.length > 0
                        ? "MEDIUM"
                        : cleanUndatedOdds.length > 0
                            ? "LOW"
                            : "NONE",

                undatedAvailable:
                    cleanUndatedOdds.length > 0
            }
        };

        const analysisReady = {
            exactMatchEvidence:
                currentMatchSources > 0,

            recentEvidence:
                formEvidenceHome.length > 0 ||
                formEvidenceAway.length > 0,

            h2hEvidence:
                cleanH2H.length > 0,

            formEvidence:
                formEvidenceHome.length > 0 ||
                formEvidenceAway.length > 0,

            injuryEvidence:
                cleanHomeInjuries.length > 0 ||
                cleanAwayInjuries.length > 0,

            lineupEvidence:
                cleanLineups.length > 0,

            statsEvidence:
                cleanStats.length > 0,

            oddsEvidence:
                cleanOdds.length > 0,

            structuredOdds: false,

            /*
             * IMPORTANT:
             * Predicted lineup is NOT actual lineup.
             */
            actualLineups:
                confirmedLineups.length > 0
        };

        /*
         * Compact response.
         * The giant original `sources` array is deliberately removed.
         */

        return res.status(200).json({
            success: true,
            version: "V3.3",

            normalized,

            quality,

            dataAvailability,

            analysisReady
        });

    } catch (error) {
    console.error("normalize-web ERROR:", error);

    return res.status(500).json({
        success: false,
        error: "Web data normalization failed.",
        details: error?.message || String(error),
        stack: process.env.NODE_ENV === "development"
            ? error?.stack
            : undefined
    });
}
