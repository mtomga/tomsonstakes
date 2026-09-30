// api/normalize-web.js
// TomsonStakes Web Data Normalizer
// V3.11 - Final Extraction & Readiness Cleanup

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                success: false,
                error: "POST method required.",
                version: "V3.11"
            });
        }

        const body = req.body || {};

        if (!body.match) {
            return res.status(400).json({
                success: false,
                error: "Missing match object.",
                version: "V3.11"
            });
        }

        const inputMatch = body.match;

        const home = String(inputMatch.home || "").trim();
        const away = String(inputMatch.away || "").trim();
        const matchDate = String(inputMatch.date || "").trim();

        if (!home || !away || !matchDate) {
            return res.status(400).json({
                success: false,
                error: "home, away and date are required.",
                version: "V3.11"
            });
        }

        /* =========================================================
           BASIC HELPERS
        ========================================================= */

        function cleanText(value) {
            return String(value || "")
                .replace(/&nbsp;/gi, " ")
                .replace(/[’‘]/g, "'")
                .replace(/[–—]/g, "-")
                .replace(/\s+/g, " ")
                .trim();
        }

        function lower(value) {
            return cleanText(value).toLowerCase();
        }

        function safeNumber(value) {
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        }

        function round(value, decimals = 2) {
            const n = safeNumber(value);
            if (n === null) return null;

            const p = Math.pow(10, decimals);
            return Math.round((n + Number.EPSILON) * p) / p;
        }

        function uniqueBySource(items) {
            const seen = new Set();
            const output = [];

            for (const item of items || []) {
                const key = [
                    item.source || "",
                    item.title || "",
                    item.snippet || "",
                    item.date || ""
                ].join("|");

                if (!seen.has(key)) {
                    seen.add(key);
                    output.push(item);
                }
            }

            return output;
        }

        function teamPattern(name) {
            const words = cleanText(name)
                .toLowerCase()
                .replace(/[^\w\s]/g, " ")
                .split(/\s+/)
                .filter(Boolean);

            if (!words.length) return "";

            return words
                .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .join("\\s+");
        }

        /* =========================================================
           TEAM IDENTITY
        ========================================================= */

        function teamIdentity(name) {
            const n = lower(name)
                .replace(/[^\w\s]/g, " ")
                .replace(/\s+/g, " ")
                .trim();

            if (
                n === "deportes concepcion" ||
                n === "deportes concepcion club"
            ) {
                return "DEPORTES_CONCEPCION";
            }

            if (
                n === "universidad de concepcion" ||
                n === "universidad concepcion"
            ) {
                return "UNIVERSIDAD_DE_CONCEPCION";
            }

            if (
                n === "ohiggins" ||
                n === "o higgins" ||
                n === "club deportivo ohiggins"
            ) {
                return "OHIGGINS";
            }

            if (n === "concepcion") {
                return "AMBIGUOUS_CONCEPCION";
            }

            return "UNKNOWN";
        }

        const requestedHomeIdentity =
            inputMatch.homeIdentity || teamIdentity(home);

        const requestedAwayIdentity =
            inputMatch.awayIdentity || teamIdentity(away);

        const canonicalNames = {
            DEPORTES_CONCEPCION: "Deportes Concepcion",
            UNIVERSIDAD_DE_CONCEPCION: "Universidad de Concepcion",
            OHIGGINS: "O'Higgins"
        };

        const homeCanonical =
            canonicalNames[requestedHomeIdentity] || home;

        const awayCanonical =
            canonicalNames[requestedAwayIdentity] || away;

        /* =========================================================
           SOURCE FLATTENING
        ========================================================= */

        const searches = Array.isArray(body.searches)
            ? body.searches
            : [];

        const flattened = [];

        for (const search of searches) {
            const category = search.type || "unknown";
            const results = Array.isArray(search.results)
                ? search.results
                : [];

            for (const result of results) {
                flattened.push({
                    category,
                    title: result.title || "",
                    source: result.link || result.url || "",
                    snippet: result.snippet || "",
                    date: result.date || null,
                    position: result.position || null
                });
            }
        }

        const allSources = uniqueBySource(flattened);

        /* =========================================================
           SOURCE TEXT
        ========================================================= */

        function sourceText(source) {
            return cleanText([
                source.title,
                source.snippet,
                source.date,
                source.source
            ].filter(Boolean).join(" "));
        }

        /* =========================================================
           IDENTITY DETECTION
        ========================================================= */

        function sourceIdentities(source) {
            const text = lower(sourceText(source));

            const identities = [];

            if (
                /\bdeportes\s+concepcion\b/.test(text)
            ) {
                identities.push("DEPORTES_CONCEPCION");
            }

            if (
                /\buniversidad\s+de\s+concepcion\b/.test(text)
            ) {
                identities.push("UNIVERSIDAD_DE_CONCEPCION");
            }

            if (
                /\bo[\s'’.-]*higgins\b/.test(text)
            ) {
                identities.push("OHIGGINS");
            }

            return [...new Set(identities)];
        }

        function hasIdentity(source, identity) {
            return sourceIdentities(source).includes(identity);
        }

        /* =========================================================
           DATE PARSING
        ========================================================= */

        const targetDateObj = new Date(`${matchDate}T00:00:00Z`);

        const targetYear = targetDateObj.getUTCFullYear();
        const targetMonth = targetDateObj.getUTCMonth() + 1;
        const targetDay = targetDateObj.getUTCDate();

        const nextDayObj = new Date(targetDateObj.getTime());
        nextDayObj.setUTCDate(nextDayObj.getUTCDate() + 1);

        const nextDayYear = nextDayObj.getUTCFullYear();
        const nextDayMonth = nextDayObj.getUTCMonth() + 1;
        const nextDayDay = nextDayObj.getUTCDate();

        const monthNames = [
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december"
        ];

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
            sept: 9,
            oct: 10,
            nov: 11,
            dec: 12
        };

        function sameDate(y, m, d, targetY, targetM, targetD) {
            return (
                Number(y) === Number(targetY) &&
                Number(m) === Number(targetM) &&
                Number(d) === Number(targetD)
            );
        }

        function extractDateMatches(text) {
            const value = cleanText(text);
            const matches = [];

            let m;

            /* YYYY-MM-DD */
            const isoRegex =
                /\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/g;

            while ((m = isoRegex.exec(value)) !== null) {
                matches.push({
                    year: Number(m[1]),
                    month: Number(m[2]),
                    day: Number(m[3])
                });
            }

            /* DD/MM/YYYY or DD-MM-YYYY */
            const numericRegex =
                /\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/g;

            while ((m = numericRegex.exec(value)) !== null) {
                matches.push({
                    year: Number(m[3]),
                    month: Number(m[2]),
                    day: Number(m[1])
                });
            }

            /* Month DD, YYYY */
            const monthFirstRegex =
                /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/gi;

            while ((m = monthFirstRegex.exec(value)) !== null) {
                matches.push({
                    year: Number(m[3]),
                    month: monthNames.indexOf(m[1].toLowerCase()) + 1,
                    day: Number(m[2])
                });
            }

            /* DD Month YYYY */
            const dayFirstRegex =
                /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi;

            while ((m = dayFirstRegex.exec(value)) !== null) {
                matches.push({
                    year: Number(m[3]),
                    month: monthNames.indexOf(m[2].toLowerCase()) + 1,
                    day: Number(m[1])
                });
            }

            /* Sep 30 2026 / Sep 30, 2026 */
            const shortMonthFirstRegex =
                /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:,)?\s+(20\d{2})\b/gi;

            while ((m = shortMonthFirstRegex.exec(value)) !== null) {
                matches.push({
                    year: Number(m[3]),
                    month: monthShort[m[1].toLowerCase()],
                    day: Number(m[2])
                });
            }

            /* 30 Sep 2026 */
            const shortDayFirstRegex =
                /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(20\d{2})\b/gi;

            while ((m = shortDayFirstRegex.exec(value)) !== null) {
                matches.push({
                    year: Number(m[3]),
                    month: monthShort[m[2].toLowerCase()],
                    day: Number(m[1])
                });
            }

            return matches;
        }

        function containsTargetDate(source) {
            const text = sourceText(source);
            const matches = extractDateMatches(text);

            return matches.some(d =>
                sameDate(
                    d.year,
                    d.month,
                    d.day,
                    targetYear,
                    targetMonth,
                    targetDay
                )
            );
        }

        function containsUtcNextDay(source) {
            const text = lower(sourceText(source));

            const matches = extractDateMatches(text);

            const nextDayFound = matches.some(d =>
                sameDate(
                    d.year,
                    d.month,
                    d.day,
                    nextDayYear,
                    nextDayMonth,
                    nextDayDay
                )
            );

            if (!nextDayFound) return false;

            return (
                /\butc\b/.test(text) ||
                /\b00:00:00?\s*utc\b/.test(text) ||
                /\b12:00:00?\s*am\s*utc\b/.test(text)
            );
        }

        function containsTodayContext(source) {
            const text = lower(sourceText(source));

            return (
                /\btoday\b/.test(text) ||
                /\blive\s+today\b/.test(text) ||
                /\btonight\b/.test(text) ||
                /\bthis\s+match\b/.test(text) ||
                /\bupcoming\s+match\b/.test(text) ||
                /\bnext\s+match\b/.test(text)
            );
        }

        /* =========================================================
           FIXTURE IDENTITY
        ========================================================= */

        function exactFixturePair(source) {
            const text = lower(sourceText(source));

            const homeNames = [
                lower(homeCanonical),
                lower(home)
            ];

            const awayNames = [
                lower(awayCanonical),
                lower(away)
            ];

            const homeFound = homeNames.some(n =>
                n && text.includes(n)
            );

            const awayFound = awayNames.some(n =>
                n && text.includes(n)
            );

            return homeFound && awayFound;
        }

        function wrongConcepcionIdentity(source) {
            const ids = sourceIdentities(source);

            if (
                requestedHomeIdentity === "DEPORTES_CONCEPCION" &&
                ids.includes("UNIVERSIDAD_DE_CONCEPCION") &&
                !ids.includes("DEPORTES_CONCEPCION")
            ) {
                return true;
            }

            if (
                requestedHomeIdentity === "UNIVERSIDAD_DE_CONCEPCION" &&
                ids.includes("DEPORTES_CONCEPCION") &&
                !ids.includes("UNIVERSIDAD_DE_CONCEPCION")
            ) {
                return true;
            }

            return false;
        }

        /* =========================================================
           SOURCE ASSESSMENT
        ========================================================= */

        function isNonSenior(source) {
            const text = lower(sourceText(source));

            return (
                /\bwomen\b/.test(text) ||
                /\bladies\b/.test(text) ||
                /\bfemenino\b/.test(text) ||
                /\bu20\b/.test(text) ||
                /\bu19\b/.test(text) ||
                /\bu18\b/.test(text) ||
                /\breserve\b/.test(text) ||
                /\breserves\b/.test(text)
            );
        }

        function fixtureStrength(source) {
            if (wrongConcepcionIdentity(source)) {
                return "WRONG_CONCEPCION_IDENTITY";
            }

            if (isNonSenior(source)) {
                return "NON_SENIOR_FIXTURE";
            }

            if (exactFixturePair(source)) {
                return "EXACT_FIXTURE";
            }

            const ids = sourceIdentities(source);

            if (
                ids.includes(requestedHomeIdentity) &&
                ids.includes(requestedAwayIdentity)
            ) {
                return "IDENTITY_PAIR";
            }

            return "NEARBY_FIXTURE_CONTEXT";
        }

        function assessSource(source) {
            const fixtureMatch = exactFixturePair(source);

            const dateMatch = containsTargetDate(source);
            const utcNextDayMatch = containsUtcNextDay(source);
            const todayContext = containsTodayContext(source);

            const strength = fixtureStrength(source);

            const historical =
                strength === "EXACT_FIXTURE" &&
                !dateMatch &&
                !utcNextDayMatch &&
                !todayContext;

            const currentFixtureUsable =
                fixtureMatch &&
                !wrongConcepcionIdentity(source) &&
                !isNonSenior(source) &&
                (
                    dateMatch ||
                    utcNextDayMatch ||
                    todayContext
                );

            return {
                fixtureMatch,
                fixtureStrength: strength,
                dateMatch,
                utcNextDayMatch,
                todayContext,
                historical,
                currentFixtureUsable
            };
        }

        const assessedSources = allSources.map(source => ({
            ...source,
            assessment: assessSource(source)
        }));

        /* =========================================================
           CATEGORY HELPERS
        ========================================================= */

        function categorySources(category) {
            return assessedSources.filter(
                s => s.category === category
            );
        }

        function currentFixtureCategory(category) {
            return categorySources(category)
                .filter(s => s.assessment.currentFixtureUsable);
        }

        function currentMarketSources() {
            return uniqueBySource([
                ...currentFixtureCategory("stats"),
                ...currentFixtureCategory("odds")
            ]);
        }

        function formSources() {
            return categorySources("form").filter(source => {
                const a = source.assessment;

                if (a.fixtureStrength === "WRONG_CONCEPCION_IDENTITY") {
                    return false;
                }

                if (a.fixtureStrength === "NON_SENIOR_FIXTURE") {
                    return false;
                }

                return (
                    a.currentFixtureUsable ||
                    a.fixtureStrength === "NEARBY_FIXTURE_CONTEXT" ||
                    hasIdentity(source, requestedHomeIdentity) ||
                    hasIdentity(source, requestedAwayIdentity)
                );
            });
        }

        /* =========================================================
           H2H
        ========================================================= */

        function extractH2H() {
            const evidence = [];

            for (const source of assessedSources) {
                const a = source.assessment;

                if (
                    a.fixtureMatch &&
                    !a.wrongFixture &&
                    !wrongConcepcionIdentity(source) &&
                    !isNonSenior(source)
                ) {
                    evidence.push({
                        title: source.title,
                        source: source.source,
                        snippet: source.snippet,
                        date: source.date || null,
                        currentFixture: !!a.currentFixtureUsable
                    });
                }
            }

            return uniqueBySource(evidence);
        }

        const h2hEvidence = extractH2H();

        /* =========================================================
           FORM
        ========================================================= */

        function parseResultWords(text) {
            const t = lower(text);

            if (
                /\b(win|won|victory)\b/.test(t)
            ) {
                return "W";
            }

            if (
                /\b(draw|drew)\b/.test(t)
            ) {
                return "D";
            }

            if (
                /\b(loss|lost|defeat|defeated)\b/.test(t)
            ) {
                return "L";
            }

            return null;
        }

        function extractScore(text) {
            const m = cleanText(text).match(
                /\b(\d+)\s*[-:]\s*(\d+)\b/
            );

            if (!m) return null;

            return `${m[1]}-${m[2]}`;
        }

        function extractFormForTeam(teamIdentityValue, teamName) {
            const results = [];
            const seen = new Set();

            const pattern = teamPattern(teamName);

            for (const source of formSources()) {
                const text = sourceText(source);
                const textLower = lower(text);

                if (
                    wrongConcepcionIdentity(source) ||
                    isNonSenior(source)
                ) {
                    continue;
                }

                if (!hasIdentity(source, teamIdentityValue)) {
                    continue;
                }

                /*
                 * Capture dated result fragments such as:
                 * August 16, 2026: ... 2-0 win at Cobresal
                 * August 23, 2026: ... 1-1 draw vs Coquimbo Unido
                 */

                const datedRegex =
                    /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*|\s+)20\d{2})\s*:\s*([^.;]+(?:[.;]|$))/gi;

                let match;

                while ((match = datedRegex.exec(text)) !== null) {
                    const dateText = match[1];
                    const fragment = cleanText(match[2]);

                    const dates = extractDateMatches(dateText);

                    if (!dates.length) continue;

                    const parsedDate = dates[0];

                    /*
                     * Do not treat the requested current fixture
                     * as historical form.
                     */
                    if (
                        sameDate(
                            parsedDate.year,
                            parsedDate.month,
                            parsedDate.day,
                            targetYear,
                            targetMonth,
                            targetDay
                        )
                    ) {
                        continue;
                    }

                    const score = extractScore(fragment);
                    const result = parseResultWords(fragment);

                    if (!score || !result) continue;

                    const key =
                        `${dateText}|${score}|${fragment}`;

                    if (seen.has(key)) continue;

                    seen.add(key);

                    results.push({
                        result,
                        score,
                        team: teamIdentityValue,
                        evidence: `${dateText}: ${fragment}`,
                        source: source.source,
                        title: source.title
                    });
                }

                /*
                 * Additional patterns for snippets without dates.
                 */
                const fragments = text.split(
                    /[.;]\s+|\s+\|\s+/
                );

                for (const fragmentRaw of fragments) {
                    const fragment = cleanText(fragmentRaw);

                    if (!fragment) continue;

                    if (
                        !lower(fragment).includes(
                            lower(teamName).replace(/'/g, "")
                        ) &&
                        !lower(fragment).includes(
                            lower(teamName)
                        )
                    ) {
                        continue;
                    }

                    const score = extractScore(fragment);
                    const result = parseResultWords(fragment);

                    if (!score || !result) continue;

                    /*
                     * Avoid current target fixture.
                     */
                    if (
                        exactFixturePair({
                            ...source,
                            snippet: fragment
                        })
                    ) {
                        continue;
                    }

                    const key =
                        `${source.source}|${score}|${fragment}`;

                    if (seen.has(key)) continue;

                    seen.add(key);

                    results.push({
                        result,
                        score,
                        team: teamIdentityValue,
                        evidence: fragment,
                        source: source.source,
                        title: source.title
                    });
                }
            }

            /*
             * Prevent accidental over-collection.
             */
            return results.slice(0, 10);
        }

        const formHome = extractFormForTeam(
            requestedHomeIdentity,
            homeCanonical
        );

        const formAway = extractFormForTeam(
            requestedAwayIdentity,
            awayCanonical
        );

        const form = {
            home: formHome,
            away: formAway,
            homeMeta: {
                requested: 5,
                extracted: formHome.length,
                complete: formHome.length >= 5
            },
            awayMeta: {
                requested: 5,
                extracted: formAway.length,
                complete: formAway.length >= 5
            }
        };

        /* =========================================================
           GOALS
        ========================================================= */

        function extractGoalStats(teamIdentityValue, teamName) {
            const output = {};

            const pattern = teamPattern(teamName);

            for (const source of currentFixtureCategory("stats")) {
                if (
                    !hasIdentity(source, teamIdentityValue)
                ) {
                    continue;
                }

                const text = sourceText(source);

                const patterns = [
                    new RegExp(
                        `${pattern}[^.]{0,100}?` +
                        `(?:average\\s+goals|goals\\s+average|` +
                        `goals\\s+per\\s+game|goals\\s+scored)` +
                        `\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)`,
                        "i"
                    ),

                    new RegExp(
                        `(?:average\\s+goals|goals\\s+average|` +
                        `goals\\s+per\\s+game|goals\\s+scored)` +
                        `\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)` +
                        `[^.]{0,100}?${pattern}`,
                        "i"
                    )
                ];

                for (const regex of patterns) {
                    const m = text.match(regex);

                    if (m) {
                        output.average = round(m[1], 2);
                        output.source = source.source;
                        output.title = source.title;
                        break;
                    }
                }
            }

            return output;
        }

        const goals = {
            home: extractGoalStats(
                requestedHomeIdentity,
                homeCanonical
            ),
            away: extractGoalStats(
                requestedAwayIdentity,
                awayCanonical
            )
        };

        /* =========================================================
           XG
        ========================================================= */

        function extractXGForTeam(teamIdentityValue, teamName) {
            const output = [];

            const pattern = teamPattern(teamName);

            for (const source of currentFixtureCategory("stats")) {
                if (
                    !hasIdentity(source, teamIdentityValue)
                ) {
                    continue;
                }

                const text = sourceText(source);

                const patterns = [
                    new RegExp(
                        `${pattern}[^.\\n]{0,80}?` +
                        `(?:xg|expected\\s+goals)` +
                        `\\s*[:\\-]?\\s*` +
                        `(\\d+(?:\\.\\d+)?)`,
                        "i"
                    ),

                    new RegExp(
                        `(\\d+(?:\\.\\d+)?)\\s*` +
                        `(?:xg|expected\\s+goals)` +
                        `[^.\\n]{0,80}?${pattern}`,
                        "i"
                    ),

                    new RegExp(
                        `(?:xg|expected\\s+goals)` +
                        `\\s*[:\\-]?\\s*` +
                        `(\\d+(?:\\.\\d+)?)` +
                        `[^.\\n]{0,80}?${pattern}`,
                        "i"
                    )
                ];

                for (const regex of patterns) {
                    const m = text.match(regex);

                    if (!m) continue;

                    const value = safeNumber(m[1]);

                    if (
                        value === null ||
                        value < 0 ||
                        value > 10
                    ) {
                        continue;
                    }

                    output.push({
                        value: round(value, 2),
                        source: source.source,
                        title: source.title,
                        evidence: text
                    });

                    break;
                }
            }

            return uniqueBySource(output);
        }

        function extractCombinedXG() {
            const output = [];

            for (const source of currentFixtureCategory("stats")) {
                const text = sourceText(source);
                const lowerText = lower(text);

                if (
                    !/\b(combined|total)\b/.test(lowerText) ||
                    !/\b(xg|expected goals)\b/.test(lowerText)
                ) {
                    continue;
                }

                const regex =
                    /\b(?:combined|total)\s+(?:xg|expected\s+goals)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i;

                const m = text.match(regex);

                if (m) {
                    output.push({
                        value: round(m[1], 2),
                        source: source.source,
                        title: source.title,
                        evidence: text
                    });
                }
            }

            return uniqueBySource(output);
        }

        const xg = {
            home: extractXGForTeam(
                requestedHomeIdentity,
                homeCanonical
            ),
            away: extractXGForTeam(
                requestedAwayIdentity,
                awayCanonical
            ),
            combined: extractCombinedXG(),
            raw: []
        };

        /* =========================================================
           BTTS
        ========================================================= */

        function extractBTTS() {
            const evidence = [];
            const odds = [];

            for (const source of currentMarketSources()) {
                const text = sourceText(source);
                const textLower = lower(text);

                if (
                    !/\bbtts\b/.test(textLower) &&
                    !/\bboth\s+teams\s+to\s+score\b/.test(textLower)
                ) {
                    continue;
                }

                /*
                 * Yes 1.79 52%
                 * No 2.00 48%
                 */
                const regex =
                    /\b(yes|no)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%/gi;

                let match;

                while ((match = regex.exec(text)) !== null) {
                    const answer = match[1].toUpperCase();
                    const decimalOdds = safeNumber(match[2]);
                    const percentage = safeNumber(match[3]);

                    if (
                        decimalOdds !== null &&
                        decimalOdds > 1 &&
                        decimalOdds < 100
                    ) {
                        odds.push({
                            answer,
                            value: round(decimalOdds, 2),
                            percentage:
                                percentage !== null
                                    ? round(percentage, 2)
                                    : null,
                            source: source.source,
                            title: source.title
                        });
                    }

                    evidence.push({
                        answer,
                        percentage:
                            percentage !== null
                                ? round(percentage, 2)
                                : null,
                        source: source.source,
                        title: source.title
                    });
                }
            }

            const probabilityYes =
                evidence.find(e => e.answer === "YES");

            return {
                home: null,
                away: null,
                probability: probabilityYes
                    ? probabilityYes.percentage
                    : null,
                evidence: uniqueBySource(evidence),
                odds: uniqueBySource(odds)
            };
        }

        const btts = extractBTTS();

        /* =========================================================
           OVER / UNDER
        ========================================================= */

        function extractOverUnder() {
            const evidence = [];
            const odds = [];

            for (const source of currentMarketSources()) {
                const text = sourceText(source);

                /*
                 * Examples:
                 * Over (1,5). 1.3
                 * Over 1.5 1.30
                 * Under 2.5 odds 1.76
                 */
                const regex =
                    /\b(over|under)\s*\(?\s*(\d+)[,.](\d+)\s*\)?(?:\s+goals?)?\s*(?:[.:;\-]|\s)+(?:odds?\s*(?:of|:)?\s*)?(\d+(?:\.\d+)?)(?!%)/gi;

                let match;

                while ((match = regex.exec(text)) !== null) {
                    const selection =
                        match[1].toUpperCase();

                    const line =
                        safeNumber(
                            `${match[2]}.${match[3]}`
                        );

                    const decimalOdds =
                        safeNumber(match[4]);

                    if (
                        line === null ||
                        decimalOdds === null
                    ) {
                        continue;
                    }

                    if (
                        decimalOdds <= 1 ||
                        decimalOdds >= 100
                    ) {
                        continue;
                    }

                    odds.push({
                        selection,
                        line: round(line, 2),
                        value: round(decimalOdds, 2),
                        source: source.source,
                        title: source.title,
                        evidence: text
                    });
                }

                /*
                 * Explicit "Over 1.5 @ 1.30"
                 */
                const atRegex =
                    /\b(over|under)\s+(\d+(?:\.\d+)?)\s*@\s*(\d+(?:\.\d+)?)/gi;

                let atMatch;

                while ((atMatch = atRegex.exec(text)) !== null) {
                    const line = safeNumber(atMatch[2]);
                    const value = safeNumber(atMatch[3]);

                    if (
                        line === null ||
                        value === null ||
                        value <= 1 ||
                        value >= 100
                    ) {
                        continue;
                    }

                    odds.push({
                        selection:
                            atMatch[1].toUpperCase(),
                        line: round(line, 2),
                        value: round(value, 2),
                        source: source.source,
                        title: source.title,
                        evidence: text
                    });
                }

                /*
                 * Keep explicit O/U probability evidence.
                 */
                const probabilityRegex =
                    /\b(over|under)\s*(?:2[,.]5|1[,.]5|3[,.]5)?[^0-9]{0,20}(\d+(?:\.\d+)?)%/gi;

                let probabilityMatch;

                while (
                    (probabilityMatch =
                        probabilityRegex.exec(text)) !== null
                ) {
                    evidence.push({
                        selection:
                            probabilityMatch[1].toUpperCase(),
                        percentage:
                            round(probabilityMatch[2], 2),
                        source: source.source,
                        title: source.title
                    });
                }
            }

            return {
                home: {},
                away: {},
                evidence: uniqueBySource(evidence),
                odds: uniqueBySource(odds)
            };
        }

        const overUnder = extractOverUnder();

        /* =========================================================
           INJURIES
        ========================================================= */

        function extractInjuries() {
            const homeInjuries = [];
            const awayInjuries = [];
            const evidence = [];

            for (const source of currentFixtureCategory("injuries")) {
                const text = sourceText(source);

                const identities = sourceIdentities(source);

                if (
                    !identities.includes(requestedHomeIdentity) &&
                    !identities.includes(requestedAwayIdentity)
                ) {
                    continue;
                }

                /*
                 * Only accept explicit injury/suspension context.
                 */
                if (
                    !/\binjur|\bsuspend|\bunavailable|\bmissing\b/i.test(
                        text
                    )
                ) {
                    continue;
                }

                evidence.push({
                    source: source.source,
                    title: source.title,
                    snippet: source.snippet
                });
            }

            return {
                home: homeInjuries,
                away: awayInjuries,
                evidence: uniqueBySource(evidence)
            };
        }

        const injuries = extractInjuries();

        /* =========================================================
           LINEUPS
        ========================================================= */

        function extractLineups() {
            const homeLineup = [];
            const awayLineup = [];
            const evidence = [];
            const fixtureContext = [];

            for (const source of currentFixtureCategory("lineups")) {
                const text = sourceText(source);

                const hasHome =
                    hasIdentity(source, requestedHomeIdentity);

                const hasAway =
                    hasIdentity(source, requestedAwayIdentity);

                if (!hasHome && !hasAway) {
                    continue;
                }

                const lineupContext =
                    /\blineup\b|\bstarting xi\b|\bstarting eleven\b|\bpredicted lineup\b|\bteam news\b/i.test(
                        text
                    );

                if (!lineupContext) {
                    fixtureContext.push({
                        type: "fixture_lineup_context",
                        title: source.title,
                        source: source.source,
                        snippet: source.snippet,
                        date: source.date || null,
                        ...source.assessment
                    });

                    continue;
                }

                const predicted =
                    /\bpredicted\b|\bexpected\b/i.test(text);

                const confirmed =
                    /\bconfirmed\b|\bofficial lineup\b|\bstarting xi confirmed\b/i.test(
                        text
                    );

                const record = {
                    type: confirmed
                        ? "confirmed"
                        : predicted
                        ? "predicted"
                        : "lineup_evidence",
                    source: source.source,
                    title: source.title,
                    snippet: source.snippet
                };

                /*
                 * Never call a lineup confirmed unless the source
                 * explicitly says confirmed/official.
                 */
                if (hasHome) {
                    homeLineup.push(record);
                }

                if (hasAway) {
                    awayLineup.push(record);
                }

                evidence.push(record);
            }

            return {
                home: uniqueBySource(homeLineup),
                away: uniqueBySource(awayLineup),
                evidence: uniqueBySource(evidence),
                fixtureContext: uniqueBySource(fixtureContext)
            };
        }

        const lineups = extractLineups();

        /* =========================================================
           1X2 ODDS
        ========================================================= */

        function extract1X2Odds() {
            const records = [];

            for (const source of currentMarketSources()) {
                const text = sourceText(source);

                /*
                 * Format:
                 * 1: 2.35 X: 3.20 2: 2.95
                 */
                const colonRegex =
                    /\b1\s*[:\-]\s*(\d+(?:\.\d+)?)\s+X\s*[:\-]\s*(\d+(?:\.\d+)?)\s+2\s*[:\-]\s*(\d+(?:\.\d+)?)/i;

                let match = text.match(colonRegex);

                if (match) {
                    records.push({
                        home: round(match[1], 2),
                        draw: round(match[2], 2),
                        away: round(match[3], 2),
                        source: source.source,
                        title: source.title,
                        evidence: text
                    });

                    continue;
                }

                /*
                 * Format:
                 * 1 2.32 X 3.53 2 3.20
                 */
                const spacedRegex =
                    /\b1\s+(\d+(?:\.\d+)?)\s+X\s+(\d+(?:\.\d+)?)\s+2\s+(\d+(?:\.\d+)?)\b/i;

                match = text.match(spacedRegex);

                if (match) {
                    records.push({
                        home: round(match[1], 2),
                        draw: round(match[2], 2),
                        away: round(match[3], 2),
                        source: source.source,
                        title: source.title,
                        evidence: text
                    });
                }
            }

            return uniqueBySource(records);
        }

        const oneXTwoOdds = extract1X2Odds();

        /* =========================================================
           1X2 PROBABILITIES
        ========================================================= */

        function extract1X2Probabilities() {
            const records = [];

            for (const source of currentMarketSources()) {
                const text = sourceText(source);

                const regex =
                    /\b(?:home|1)\b[^0-9]{0,30}(\d+(?:\.\d+)?)%\s*.*?\b(?:draw|x)\b[^0-9]{0,30}(\d+(?:\.\d+)?)%\s*.*?\b(?:away|2)\b[^0-9]{0,30}(\d+(?:\.\d+)?)%/i;

                const match = text.match(regex);

                if (!match) continue;

                records.push({
                    home: round(match[1], 2),
                    draw: round(match[2], 2),
                    away: round(match[3], 2),
                    source: source.source,
                    title: source.title,
                    evidence: text
                });
            }

            return uniqueBySource(records);
        }

        const oneXTwoProbability =
            extract1X2Probabilities();

        /* =========================================================
           PRIMARY ODDS OBJECT
        ========================================================= */

        const primaryOdds =
            oneXTwoOdds.length > 0
                ? oneXTwoOdds[0]
                : null;

        const primaryProbability =
            oneXTwoProbability.length > 0
                ? oneXTwoProbability[0]
                : null;

        const odds = {
            home: primaryOdds
                ? primaryOdds.home
                : null,

            draw: primaryOdds
                ? primaryOdds.draw
                : null,

            away: primaryOdds
                ? primaryOdds.away
                : null,

            probability: {
                home: primaryProbability
                    ? primaryProbability.home
                    : null,

                draw: primaryProbability
                    ? primaryProbability.draw
                    : null,

                away: primaryProbability
                    ? primaryProbability.away
                    : null
            },

            evidence: uniqueBySource([
                ...oneXTwoOdds,
                ...oneXTwoProbability
            ])
        };

        /* =========================================================
           SOURCE REPORT
        ========================================================= */

        const sourceReport = assessedSources.map(source => ({
            category: source.category,
            title: source.title,
            source: source.source,
            date: source.date || null,
            fixtureMatch: source.assessment.fixtureMatch,
            fixtureStrength:
                source.assessment.fixtureStrength,
            dateMatch: source.assessment.dateMatch,
            utcNextDayMatch:
                source.assessment.utcNextDayMatch,
            todayContext:
                source.assessment.todayContext,
            currentFixtureUsable:
                source.assessment.currentFixtureUsable,
            identities: sourceIdentities(source)
        }));

        /* =========================================================
           CONTAMINATION
        ========================================================= */

        const contaminatedSources =
            assessedSources.filter(source => {
                const text = lower(sourceText(source));

                const wrongIdentity =
                    wrongConcepcionIdentity(source);

                const nonSenior =
                    isNonSenior(source);

                const identities =
                    sourceIdentities(source);

                const bothTargetIdentities =
                    identities.includes(
                        requestedHomeIdentity
                    ) &&
                    identities.includes(
                        requestedAwayIdentity
                    );

                const mentionsOtherConcepcion =
                    (
                        requestedHomeIdentity ===
                        "DEPORTES_CONCEPCION"
                    ) &&
                    identities.includes(
                        "UNIVERSIDAD_DE_CONCEPCION"
                    ) &&
                    !identities.includes(
                        "DEPORTES_CONCEPCION"
                    );

                return (
                    wrongIdentity ||
                    nonSenior ||
                    mentionsOtherConcepcion ||
                    (
                        bothTargetIdentities &&
                        !source.assessment.fixtureMatch
                    )
                );
            });

        const contaminationDetected =
            contaminatedSources.length > 0;

        const wrongFixtureDetected =
            assessedSources.some(source =>
                source.assessment.fixtureMatch &&
                !source.assessment.currentFixtureUsable &&
                source.assessment.historical
            );

        /* =========================================================
           IDENTITY REPORT
        ========================================================= */

        const identityReport = {
            requested: {
                home,
                homeIdentity: requestedHomeIdentity,
                away,
                awayIdentity: requestedAwayIdentity
            },

            resolved: {
                home: requestedHomeIdentity,
                away: requestedAwayIdentity
            },

            canonical: {
                home: homeCanonical,
                away: awayCanonical
            },

            homeStatus:
                requestedHomeIdentity === "UNKNOWN" ||
                requestedHomeIdentity ===
                    "AMBIGUOUS_CONCEPCION"
                    ? "UNRESOLVED"
                    : "RESOLVED",

            awayStatus:
                requestedAwayIdentity === "UNKNOWN" ||
                requestedAwayIdentity ===
                    "AMBIGUOUS_CONCEPCION"
                    ? "UNRESOLVED"
                    : "RESOLVED",

            contaminationDetected,
            wrongFixtureDetected,

            separateConcepcionIdentities:
                assessedSources.some(source => {
                    const ids = sourceIdentities(source);

                    return (
                        ids.includes(
                            "DEPORTES_CONCEPCION"
                        ) &&
                        ids.includes(
                            "UNIVERSIDAD_DE_CONCEPCION"
                        )
                    );
                })
        };

        /* =========================================================
           EXTRACTED DATA AVAILABILITY
        ========================================================= */

        const extractedAvailability = {
            identity:
                identityReport.homeStatus ===
                    "RESOLVED" &&
                identityReport.awayStatus ===
                    "RESOLVED",

            form:
                form.home.length > 0 &&
                form.away.length > 0,

            h2h:
                h2hEvidence.length > 0,

            goals:
                Object.keys(goals.home).length > 0 ||
                Object.keys(goals.away).length > 0,

            xg:
                xg.home.length > 0 ||
                xg.away.length > 0 ||
                xg.combined.length > 0,

            btts:
                btts.evidence.length > 0 ||
                btts.odds.length > 0,

            overUnder:
                overUnder.odds.length > 0 ||
                overUnder.evidence.length > 0,

            injuries:
                injuries.home.length > 0 ||
                injuries.away.length > 0,

            lineups:
                lineups.home.length > 0 ||
                lineups.away.length > 0,

            odds:
                oneXTwoOdds.length > 0
        };

        /* =========================================================
           RAW SOURCE AVAILABILITY
        ========================================================= */

        const sourceAvailability = {
            form:
                formSources().length > 0,

            h2h:
                h2hEvidence.length > 0,

            stats:
                currentFixtureCategory("stats").length > 0,

            injuries:
                currentFixtureCategory("injuries").length > 0,

            lineups:
                currentFixtureCategory("lineups").length > 0,

            odds:
                currentMarketSources().length > 0
        };

        /* =========================================================
           CURRENT FIXTURE AVAILABILITY
        ========================================================= */

        const currentFixtureAvailability = {
            form:
                form.home.length > 0 ||
                form.away.length > 0,

            stats:
                extractedAvailability.goals ||
                extractedAvailability.xg ||
                extractedAvailability.btts ||
                extractedAvailability.overUnder,

            injuries:
                currentFixtureCategory("injuries").length > 0,

            lineups:
                lineups.home.length > 0 ||
                lineups.away.length > 0,

            odds:
                oneXTwoOdds.length > 0,

            h2h:
                h2hEvidence.some(
                    item => item.currentFixture
                )
        };

        /* =========================================================
           QUALITY SCORE
        ========================================================= */

        let qualityPoints = 0;
        let qualityMax = 0;

        function quality(condition, weight) {
            qualityMax += weight;

            if (condition) {
                qualityPoints += weight;
            }
        }

        quality(
            identityReport.homeStatus === "RESOLVED" &&
            identityReport.awayStatus === "RESOLVED",
            20
        );

        quality(
            form.home.length >= 3 &&
            form.away.length >= 3,
            20
        );

        quality(
            extractedAvailability.stats ||
            extractedAvailability.goals ||
            extractedAvailability.xg ||
            extractedAvailability.btts ||
            extractedAvailability.overUnder,
            15
        );

        quality(
            extractedAvailability.xg,
            10
        );

        quality(
            extractedAvailability.btts ||
            extractedAvailability.overUnder,
            10
        );

        quality(
            extractedAvailability.odds,
            10
        );

        quality(
            extractedAvailability.h2h,
            5
        );

        quality(
            !contaminationDetected,
            5
        );

        quality(
            !wrongFixtureDetected,
            5
        );

        const qualityScore =
            qualityMax > 0
                ? round(
                      qualityPoints /
                          qualityMax,
                      2
                  )
                : 0;

        /* =========================================================
           READINESS
        ========================================================= */

        const identityReady =
            identityReport.homeStatus === "RESOLVED" &&
            identityReport.awayStatus === "RESOLVED";

        /*
         * Both teams must have at least some real form
         * before analysis can be marked ready.
         */
        const formReady =
            form.home.length > 0 &&
            form.away.length > 0;

        const statsReady =
            extractedAvailability.goals ||
            extractedAvailability.xg ||
            extractedAvailability.btts ||
            extractedAvailability.overUnder;

        /*
         * Injuries and actual lineups are optional because
         * search data may legitimately be unavailable.
         */
        const dataReady =
            identityReady &&
            formReady &&
            statsReady;

        const analysisReady =
            identityReady &&
            formReady &&
            statsReady;

        /* =========================================================
           WARNINGS
        ========================================================= */

        const warnings = [];

        if (contaminationDetected) {
            warnings.push(
                "Some results contain a different Concepcion identity or non-senior fixture; contaminated sources were excluded from structured extraction."
            );
        }

        if (
            requestedHomeIdentity ===
                "DEPORTES_CONCEPCION" &&
            assessedSources.some(source =>
                sourceIdentities(source).includes(
                    "UNIVERSIDAD_DE_CONCEPCION"
                )
            )
        ) {
            warnings.push(
                "Universidad de Concepcion and Deportes Concepcion are treated as separate clubs."
            );
        }

        if (
            form.home.length < 5 ||
            form.away.length < 5
        ) {
            warnings.push(
                `Form is incomplete: home ${form.home.length}/5, away ${form.away.length}/5 extracted from available source text. Missing results were not guessed.`
            );
        }

        if (
            injuries.home.length === 0 &&
            injuries.away.length === 0
        ) {
            warnings.push(
                "No reliable current injury/suspension records were extracted."
            );
        }

        if (
            lineups.home.length === 0 &&
            lineups.away.length === 0
        ) {
            warnings.push(
                "No actual current lineup was extracted. Fixture-level lineup context is kept separately."
            );
        }

        if (oneXTwoOdds.length === 0) {
            warnings.push(
                "No current 1X2 decimal odds were extracted."
            );
        }

        if (btts.evidence.length > 0) {
            warnings.push(
                "BTTS probabilities and decimal odds are stored separately."
            );
        }

        if (
            overUnder.odds.length === 0 &&
            overUnder.evidence.length === 0
        ) {
            warnings.push(
                "No reliable current Over/Under market evidence was extracted."
            );
        }

        if (xg.home.length === 0 && xg.away.length === 0) {
            warnings.push(
                "No reliable current team-attributed xG was extracted; historical/wrong-fixture xG was excluded."
            );
        }

        if (h2hEvidence.length > 0) {
            warnings.push(
                "Historical target-vs-target matches are retained as H2H and are not used as current-fixture statistics."
            );
        }

        warnings.push(
            "Current-fixture evidence requires the exact target fixture plus target-date, UTC-next-day, or explicit current-match context."
        );

        warnings.push(
            "Missing statistics are not guessed."
        );

        /* =========================================================
           FINAL RESPONSE
        ========================================================= */

        return res.status(200).json({
            success: true,
            version: "V3.11",

            match: {
                home,
                away,
                date: matchDate,
                year: targetYear
            },

            identity: identityReport,

            normalized: {
                form,
                h2h: {
                    evidence: h2hEvidence
                },
                goals,
                xg,
                btts,
                overUnder,
                injuries,
                lineups,
                odds
            },

            markets: {
                oneXTwo: {
                    odds: oneXTwoOdds,
                    probability: oneXTwoProbability
                },

                btts: {
                    odds: btts.odds,
                    probability: btts.probability
                },

                overUnder: {
                    odds: overUnder.odds,
                    evidence: overUnder.evidence
                }
            },

            sources: sourceReport,

            availability: {
                extracted: extractedAvailability,
                source: sourceAvailability,
                currentFixture: currentFixtureAvailability
            },

            quality: {
                sourceCount: assessedSources.length,

                usableSourceCount:
                    assessedSources.filter(
                        s =>
                            s.assessment.fixtureMatch ||
                            s.assessment.fixtureStrength ===
                                "NEARBY_FIXTURE_CONTEXT"
                    ).length,

                currentFixtureSourceCount:
                    assessedSources.filter(
                        s =>
                            s.assessment.currentFixtureUsable
                    ).length,

                fixtureSourceCount:
                    assessedSources.filter(
                        s =>
                            s.assessment.fixtureMatch
                    ).length,

                targetDateSourceCount:
                    assessedSources.filter(
                        s =>
                            s.assessment.dateMatch
                    ).length,

                utcNextDaySourceCount:
                    assessedSources.filter(
                        s =>
                            s.assessment.utcNextDayMatch
                    ).length,

                contaminatedSourceCount:
                    contaminatedSources.length,

                usableText:
                    assessedSources.some(
                        s =>
                            cleanText(
                                s.snippet
                            ).length > 0
                    ),

                score: qualityScore
            },

            readiness: {
                identityReady,
                formReady,
                statsReady,
                dataReady,
                analysisReady
            },

            analysisReady,

            warnings
        });

    } catch (error) {
        console.error("V3.11 normalize error:", error);

        return res.status(500).json({
            success: false,
            version: "V3.11",
            error: "Normalization failed.",
            details: error.message
        });
    }
}
