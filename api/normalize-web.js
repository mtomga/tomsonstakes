export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                success: false,
                error: "Method not allowed. Use POST."
            });
        }

        const body = req.body || {};

        if (!body.match) {
            return res.status(400).json({
                success: false,
                error: "Missing match object."
            });
        }

        const match = body.match;

        const requestedHome =
            match.homeInput ||
            match.home ||
            "";

        const requestedAway =
            match.awayInput ||
            match.away ||
            "";

        const requestedHomeIdentity =
            match.homeIdentity ||
            "";

        const requestedAwayIdentity =
            match.awayIdentity ||
            "";

        const matchDate =
            match.date ||
            "";

        if (!requestedHome || !requestedAway || !matchDate) {
            return res.status(400).json({
                success: false,
                error: "Match home, away and date are required."
            });
        }

        const allowedIdentities = [
            "DEPORTES_CONCEPCION",
            "UNIVERSIDAD_DE_CONCEPCION",
            "OHIGGINS"
        ];

        function clean(value) {
            return String(value || "")
                .toLowerCase()
                .replace(/[’']/g, "")
                .replace(/&/g, " and ")
                .replace(/[^a-z0-9]+/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        }

        function canonicalIdentity(name) {
            const n = clean(name);

            if (
                n.includes("universidad de concepcion") ||
                n.includes("universidad concepcion") ||
                n.includes("u de concepcion") ||
                n.includes("u concepcion")
            ) {
                return "UNIVERSIDAD_DE_CONCEPCION";
            }

            if (
                n.includes("deportes concepcion") ||
                n.includes("deportes de concepcion") ||
                n === "d concepcion" ||
                n === "d concepcion"
            ) {
                return "DEPORTES_CONCEPCION";
            }

            if (
                n === "ohiggins" ||
                n.includes("o higgins") ||
                n.includes("cd ohiggins") ||
                n.includes("club deportivo ohiggins")
            ) {
                return "OHIGGINS";
            }

            if (
                n === "concepcion" ||
                n === "d concepcion"
            ) {
                return "AMBIGUOUS_CONCEPCION";
            }

            return "UNKNOWN";
        }

        function identityAliases(identity) {
            const map = {
                DEPORTES_CONCEPCION: [
                    "deportes concepcion",
                    "deportes de concepcion",
                    "d concepcion"
                ],

                UNIVERSIDAD_DE_CONCEPCION: [
                    "universidad de concepcion",
                    "universidad concepcion",
                    "u de concepcion",
                    "u concepcion"
                ],

                OHIGGINS: [
                    "ohiggins",
                    "o higgins",
                    "o'higgins",
                    "cd ohiggins",
                    "club deportivo ohiggins"
                ]
            };

            return map[identity] || [];
        }

        function containsIdentity(text, identity) {
            const t = clean(text);

            return identityAliases(identity).some(alias => {
                const a = clean(alias);

                if (!a) return false;

                return t.includes(a);
            });
        }

        const resolvedHome =
            allowedIdentities.includes(requestedHomeIdentity)
                ? requestedHomeIdentity
                : canonicalIdentity(requestedHome);

        const resolvedAway =
            allowedIdentities.includes(requestedAwayIdentity)
                ? requestedAwayIdentity
                : canonicalIdentity(requestedAway);

        const canonicalNames = {
            DEPORTES_CONCEPCION: "Deportes Concepcion",
            UNIVERSIDAD_DE_CONCEPCION: "Universidad de Concepcion",
            OHIGGINS: "O'Higgins"
        };

        const homeCanonical =
            canonicalNames[resolvedHome] ||
            requestedHome;

        const awayCanonical =
            canonicalNames[resolvedAway] ||
            requestedAway;

        /*
         * ---------------------------------------------------------
         * DATE HELPERS
         * ---------------------------------------------------------
         */

        const targetDate = new Date(`${matchDate}T00:00:00Z`);

        const targetDay =
            targetDate.getUTCDate();

        const targetMonth =
            targetDate.getUTCMonth() + 1;

        const targetYear =
            targetDate.getUTCFullYear();

        const previousDay =
            new Date(targetDate.getTime() - 86400000);

        const nextDay =
            new Date(targetDate.getTime() + 86400000);

        function pad(n) {
            return String(n).padStart(2, "0");
        }

        const targetDDMMYYYY =
            `${pad(targetDay)}/${pad(targetMonth)}/${targetYear}`;

        const targetMMDDYYYY =
            `${pad(targetMonth)}/${pad(targetDay)}/${targetYear}`;

        const targetISO =
            `${targetYear}-${pad(targetMonth)}-${pad(targetDay)}`;

        const targetDMY =
            `${targetDay}/${targetMonth}/${targetYear}`;

        const targetMonthName =
            targetDate.toLocaleString("en-US", {
                month: "long",
                timeZone: "UTC"
            });

        const targetMonthShort =
            targetDate.toLocaleString("en-US", {
                month: "short",
                timeZone: "UTC"
            });

        function dateMatchesTarget(text) {
            const t = String(text || "").toLowerCase();

            if (!t) return false;

            if (t.includes(targetISO)) return true;

            if (t.includes(targetDDMMYYYY)) return true;

            if (t.includes(targetMMDDYYYY)) return true;

            if (t.includes(`${targetMonthName.toLowerCase()} ${targetDay}, ${targetYear}`)) {
                return true;
            }

            if (t.includes(`${targetMonthName.toLowerCase()} ${targetDay} ${targetYear}`)) {
                return true;
            }

            if (t.includes(`${targetDay} ${targetMonthName.toLowerCase()} ${targetYear}`)) {
                return true;
            }

            if (t.includes(`${targetMonthShort.toLowerCase()} ${targetDay}, ${targetYear}`)) {
                return true;
            }

            if (t.includes(`${targetMonthShort.toLowerCase()} ${targetDay} ${targetYear}`)) {
                return true;
            }

            if (t.includes(`${targetDay} ${targetMonthShort.toLowerCase()} ${targetYear}`)) {
                return true;
            }

            return false;
        }

        function utcNextDayMatches(text) {
            const t = String(text || "").toLowerCase();

            if (!t) return false;

            const d = previousDay.getUTCDate();
            const m = previousDay.getUTCMonth() + 1;
            const y = previousDay.getUTCFullYear();

            const iso = `${y}-${pad(m)}-${pad(d)}`;

            if (t.includes(iso)) return true;

            const monthName =
                previousDay.toLocaleString("en-US", {
                    month: "long",
                    timeZone: "UTC"
                }).toLowerCase();

            const monthShort =
                previousDay.toLocaleString("en-US", {
                    month: "short",
                    timeZone: "UTC"
                }).toLowerCase();

            if (t.includes(`${monthName} ${d}, ${y}`)) return true;

            if (t.includes(`${d} ${monthName} ${y}`)) return true;

            if (t.includes(`${monthShort} ${d}, ${y}`)) return true;

            if (t.includes(`${d} ${monthShort} ${y}`)) return true;

            return false;
        }

        function todayContext(text) {
            const t = String(text || "").toLowerCase();

            if (!t) return false;

            const dayNames = [
                "sunday",
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday"
            ];

            const targetDayName =
                dayNames[targetDate.getUTCDay()];

            return (
                t.includes("today") ||
                t.includes("tonight") ||
                t.includes("live") ||
                t.includes(`${targetDay} ${targetMonthShort.toLowerCase()}`) ||
                t.includes(`${targetMonthShort.toLowerCase()} ${targetDay}`) ||
                t.includes(targetDayName)
            );
        }

        /*
         * ---------------------------------------------------------
         * SOURCE COLLECTION
         * ---------------------------------------------------------
         */

        function flattenSources() {
            const output = [];

            if (Array.isArray(body.allResults)) {
                for (const item of body.allResults) {
                    output.push(item);
                }
            }

            if (Array.isArray(body.searches)) {
                for (const search of body.searches) {
                    for (const item of (search.results || [])) {
                        output.push({
                            ...item,
                            type: search.type,
                            team: search.team || null,
                            teamIdentity: search.teamIdentity || null
                        });
                    }
                }
            }

            const seen = new Set();

            return output.filter(item => {
                const key = [
                    item.type || "",
                    item.title || "",
                    item.link || item.url || "",
                    item.snippet || ""
                ].join("|");

                if (seen.has(key)) return false;

                seen.add(key);
                return true;
            });
        }

        const sources = flattenSources();

        /*
         * ---------------------------------------------------------
         * FIXTURE IDENTITY
         *
         * IMPORTANT V3.12:
         * title and URL have priority.
         *
         * A random mention of Deportes Concepcion inside a
         * Santa Cruz article must NOT turn that article into
         * a Deportes Concepcion vs O'Higgins fixture.
         * ---------------------------------------------------------
         */

        function titleAndUrlText(source) {
            return [
                source.title || "",
                source.link || source.url || ""
            ].join(" ");
        }

        function snippetText(source) {
            return source.snippet || "";
        }

        function exactFixtureFromTitleUrl(source) {
            const tu = clean(titleAndUrlText(source));

            const homeHere =
                containsIdentity(tu, resolvedHome);

            const awayHere =
                containsIdentity(tu, resolvedAway);

            if (homeHere && awayHere) {
                return true;
            }

            return false;
        }

        function exactFixtureFromSnippet(source) {
            const sn = clean(snippetText(source));

            const homeHere =
                containsIdentity(sn, resolvedHome);

            const awayHere =
                containsIdentity(sn, resolvedAway);

            return homeHere && awayHere;
        }

        function wrongFixtureFromTitleUrl(source) {
            const tu = clean(titleAndUrlText(source));

            const wrongHome =
                resolvedHome === "DEPORTES_CONCEPCION"
                    ? containsIdentity(tu, "UNIVERSIDAD_DE_CONCEPCION")
                    : false;

            const wrongUniversity =
                resolvedHome === "UNIVERSIDAD_DE_CONCEPCION"
                    ? containsIdentity(tu, "DEPORTES_CONCEPCION")
                    : false;

            if (wrongHome || wrongUniversity) {
                return true;
            }

            /*
             * A title such as:
             * O'Higgins vs Deportes Santa Cruz
             *
             * must not become our target just because the
             * snippet mentions Deportes Concepcion.
             */
            if (
                resolvedAway === "OHIGGINS" &&
                tu.includes("ohiggins") &&
                tu.includes("santa cruz")
            ) {
                return true;
            }

            return false;
        }

        function sourceIdentities(source) {
            const titleUrl = titleAndUrlText(source);
            const snippet = snippetText(source);

            const result = [];

            for (const id of allowedIdentities) {
                if (
                    containsIdentity(titleUrl, id) ||
                    containsIdentity(snippet, id)
                ) {
                    result.push(id);
                }
            }

            return [...new Set(result)];
        }

        function fixtureStrength(source) {
            const tu = titleAndUrlText(source);
            const sn = snippetText(source);

            if (wrongFixtureFromTitleUrl(source)) {
                return "WRONG_FIXTURE";
            }

            if (exactFixtureFromTitleUrl(source)) {
                return "EXACT_FIXTURE";
            }

            /*
             * Team pages may have the actual fixture only in the
             * snippet, e.g.:
             *
             * Deportes Concepcion next match against O'Higgins
             *
             * This is fixture context, not an actual fixture article.
             */
            if (exactFixtureFromSnippet(source)) {
                return "NEARBY_FIXTURE_CONTEXT";
            }

            const text = clean(`${tu} ${sn}`);

            if (
                text.includes("next match") &&
                (
                    containsIdentity(text, resolvedHome) ||
                    containsIdentity(text, resolvedAway)
                )
            ) {
                return "NEARBY_FIXTURE_CONTEXT";
            }

            if (
                text.includes("women") ||
                text.includes("femenino") ||
                text.includes("u20") ||
                text.includes("u19") ||
                text.includes("u18") ||
                text.includes("reserve") ||
                text.includes("reserves")
            ) {
                return "NON_SENIOR_FIXTURE";
            }

            return "OTHER";
        }

        function processSource(source) {
            const title =
                source.title ||
                "";

            const link =
                source.link ||
                source.url ||
                "";

            const snippet =
                source.snippet ||
                "";

            const text =
                `${title} ${snippet} ${link}`;

            const strength =
                fixtureStrength(source);

            const dateMatch =
                dateMatchesTarget(text);

            const utcNextDayMatch =
                utcNextDayMatches(text);

            const today =
                todayContext(text);

            const fixtureMatch =
                strength === "EXACT_FIXTURE" ||
                strength === "NEARBY_FIXTURE_CONTEXT";

            const currentFixtureUsable =
                fixtureMatch &&
                strength !== "WRONG_FIXTURE" &&
                strength !== "NON_SENIOR_FIXTURE" &&
                (
                    dateMatch ||
                    utcNextDayMatch ||
                    today
                );

            return {
                ...source,

                title,
                link,
                snippet,

                identities: sourceIdentities(source),

                fixtureMatch,
                fixtureStrength: strength,

                dateMatch,
                utcNextDayMatch,
                todayContext: today,

                currentFixtureUsable,

                wrongFixture:
                    strength === "WRONG_FIXTURE",

                historicalJuly2026:
                    /july\s+(2[0-9]|3[01]),?\s*2026/i.test(text) ||
                    /2026[-/](07)[-/](2[0-9]|3[01])/i.test(text)
            };
        }

        const processedSources =
            sources.map(processSource);

        /*
         * ---------------------------------------------------------
         * SOURCE FILTER HELPERS
         * ---------------------------------------------------------
         */

        function currentSourcesByType(types) {
            const list =
                Array.isArray(types)
                    ? types
                    : [types];

            return processedSources.filter(source =>
                list.includes(source.type) &&
                source.currentFixtureUsable === true
            );
        }

        function fixtureSourcesByType(types) {
            const list =
                Array.isArray(types)
                    ? types
                    : [types];

            return processedSources.filter(source =>
                list.includes(source.type) &&
                source.fixtureMatch === true &&
                source.fixtureStrength !== "WRONG_FIXTURE" &&
                source.fixtureStrength !== "NON_SENIOR_FIXTURE"
            );
        }

        function uniqueSources(list) {
            const seen = new Set();

            return list.filter(source => {
                const key =
                    `${source.title}|${source.link}|${source.snippet}`;

                if (seen.has(key)) return false;

                seen.add(key);
                return true;
            });
        }

        /*
         * ---------------------------------------------------------
         * FORM
         * ---------------------------------------------------------
         */

        function parseFormResults(source, teamIdentity) {
            const text =
                `${source.title || ""} ${source.snippet || ""}`;

            const results = [];

            /*
             * W/D/L followed by score.
             */
            const patterns = [
                /\b(win|won|victory)\b[^0-9]{0,30}(\d+)\s*[-:]\s*(\d+)/gi,
                /\b(draw|drew)\b[^0-9]{0,30}(\d+)\s*[-:]\s*(\d+)/gi,
                /\b(loss|lost|defeat)\b[^0-9]{0,30}(\d+)\s*[-:]\s*(\d+)/gi
            ];

            for (const regex of patterns) {
                for (const m of text.matchAll(regex)) {
                    const word =
                        String(m[1]).toLowerCase();

                    let result = null;

                    if (
                        word === "win" ||
                        word === "won" ||
                        word === "victory"
                    ) {
                        result = "W";
                    }

                    if (
                        word === "draw" ||
                        word === "drew"
                    ) {
                        result = "D";
                    }

                    if (
                        word === "loss" ||
                        word === "lost" ||
                        word === "defeat"
                    ) {
                        result = "L";
                    }

                    if (!result) continue;

                    results.push({
                        result,
                        score: `${m[2]}-${m[3]}`,
                        team: teamIdentity,
                        evidence: text.slice(0, 500),
                        source: source.link || null,
                        title: source.title || null
                    });
                }
            }

            /*
             * FotMob-style:
             *
             * August 16, 2026: Primera Division - 2-0 win at Cobresal
             * August 23, 2026: Primera Division - 1-1 draw vs Coquimbo Unido
             */

            const fotmobRegex =
                /(?:\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b\s+\d{1,2},?\s+2026)[^.;]{0,120}?(\d+)\s*[-:]\s*(\d+)\s+(win|draw|loss)/gi;

            for (const m of text.matchAll(fotmobRegex)) {
                const word =
                    String(m[4]).toLowerCase();

                let result = null;

                if (word === "win") result = "W";
                if (word === "draw") result = "D";
                if (word === "loss") result = "L";

                if (!result) continue;

                results.push({
                    result,
                    score: `${m[2]}-${m[3]}`,
                    team: teamIdentity,
                    evidence: text.slice(0, 500),
                    source: source.link || null,
                    title: source.title || null
                });
            }

            return results;
        }

        function getFormSources(teamIdentity, side) {
            const acceptedTypes =
                side === "home"
                    ? ["form_home", "form_home_recent"]
                    : ["form_away", "form_away_recent"];

            return processedSources.filter(source => {
                if (!acceptedTypes.includes(source.type)) {
                    return false;
                }

                if (
                    source.teamIdentity &&
                    source.teamIdentity !== teamIdentity
                ) {
                    return false;
                }

                return (
                    !source.wrongFixture &&
                    source.fixtureStrength !== "NON_SENIOR_FIXTURE"
                );
            });
        }

        function buildForm(teamIdentity, side) {
            const candidates =
                getFormSources(teamIdentity, side);

            const output = [];

            for (const source of candidates) {
                const parsed =
                    parseFormResults(source, teamIdentity);

                for (const item of parsed) {
                    output.push(item);
                }
            }

            /*
             * Remove duplicates.
             */
            const seen = new Set();

            return output.filter(item => {
                const key =
                    `${item.result}|${item.score}|${item.source}`;

                if (seen.has(key)) return false;

                seen.add(key);
                return true;
            }).slice(0, 5);
        }

        const homeForm =
            buildForm(resolvedHome, "home");

        const awayForm =
            buildForm(resolvedAway, "away");

        /*
         * ---------------------------------------------------------
         * H2H
         * ---------------------------------------------------------
         */

        function validH2HSource(source) {
            if (source.wrongFixture) return false;

            if (
                source.fixtureStrength === "NON_SENIOR_FIXTURE"
            ) {
                return false;
            }

            const titleUrl =
                clean(titleAndUrlText(source));

            /*
             * For H2H, title/URL must contain both target clubs
             * when it claims to be a specific fixture.
             */
            if (
                source.fixtureStrength === "EXACT_FIXTURE"
            ) {
                return (
                    containsIdentity(titleUrl, resolvedHome) &&
                    containsIdentity(titleUrl, resolvedAway)
                );
            }

            /*
             * Historical H2H pages can use H2H wording rather than
             * a single fixture title.
             */
            const text =
                clean(`${titleUrl} ${source.snippet || ""}`);

            if (
                text.includes("head to head") ||
                text.includes("h2h") ||
                text.includes("previous meetings")
            ) {
                /*
                 * Do NOT accept if title/URL clearly names a
                 * different opponent.
                 */
                if (
                    resolvedAway === "OHIGGINS" &&
                    titleUrl.includes("santa cruz")
                ) {
                    return false;
                }

                return (
                    containsIdentity(text, resolvedHome) &&
                    containsIdentity(text, resolvedAway)
                );
            }

            return false;
        }

        const h2hSources =
            uniqueSources(
                processedSources.filter(validH2HSource)
            );

        const h2hEvidence =
            h2hSources.map(source => ({
                title: source.title,
                source: source.link,
                snippet: source.snippet,
                date: source.date || null,
                fixtureStrength: source.fixtureStrength,
                dateMatch: source.dateMatch,
                utcNextDayMatch: source.utcNextDayMatch,
                currentFixtureUsable: source.currentFixtureUsable
            }));

        /*
         * ---------------------------------------------------------
         * CURRENT MARKET SOURCES
         * ---------------------------------------------------------
         */

        const currentMarketSources =
            uniqueSources([
                ...currentSourcesByType("stats"),
                ...currentSourcesByType("odds")
            ]);

        /*
         * ---------------------------------------------------------
         * BTTS
         * ---------------------------------------------------------
         */

        const bttsOdds = [];
        const bttsEvidence = [];

        for (const source of currentMarketSources) {
            const text =
                `${source.title || ""} ${source.snippet || ""}`;

            if (
                !/\bbtts\b|\bboth teams to score\b/i.test(text)
            ) {
                continue;
            }

            for (
                const m of text.matchAll(
                    /\b(yes|no)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%/gi
                )
            ) {
                const answer =
                    m[1].toUpperCase();

                const odds =
                    Number(m[2]);

                const percentage =
                    Number(m[3]);

                if (
                    odds >= 1 &&
                    odds <= 100 &&
                    percentage >= 0 &&
                    percentage <= 100
                ) {
                    bttsOdds.push({
                        answer,
                        value: odds,
                        percentage,
                        source: source.link || null,
                        title: source.title || null
                    });

                    bttsEvidence.push({
                        answer,
                        percentage,
                        source: source.link || null,
                        title: source.title || null
                    });
                }
            }
        }

        const bttsProbability =
            bttsOdds.length
                ? bttsOdds[0].percentage
                : null;

        /*
         * ---------------------------------------------------------
         * OVER / UNDER
         * ---------------------------------------------------------
         */

        const overUnderOdds = [];
        const overUnderEvidence = [];

        for (const source of currentMarketSources) {
            const text =
                `${source.title || ""} ${source.snippet || ""}`;

            /*
             * Examples:
             *
             * Over (1,5). 1.3
             * Over 2.5 odds 1.90
             */
            const regex =
                /\b(over|under)\s*\(?\s*(\d+)[,.](\d+)\s*\)?(?:\s+goals?)?\s*(?:(?:odds?|price)\s*(?:of|:)?\s*)?(\d+(?:\.\d+)?)/gi;

            for (const m of text.matchAll(regex)) {
                const selection =
                    m[1].toUpperCase();

                const line =
                    Number(`${m[2]}.${m[3]}`);

                const value =
                    Number(m[4]);

                if (
                    !Number.isFinite(line) ||
                    !Number.isFinite(value)
                ) {
                    continue;
                }

                if (value < 1 || value > 100) {
                    continue;
                }

                overUnderOdds.push({
                    selection,
                    line,
                    value,
                    source: source.link || null,
                    title: source.title || null
                });

                overUnderEvidence.push({
                    selection,
                    line,
                    source: source.link || null,
                    title: source.title || null
                });
            }
        }

        /*
         * ---------------------------------------------------------
         * 1X2 ODDS
         * ---------------------------------------------------------
         */

        const oneXTwoEvidence = [];

        for (const source of currentMarketSources) {
            const text =
                `${source.title || ""} ${source.snippet || ""}`;

            const patterns = [
                /\b1\s*[:\-]?\s*(\d+(?:\.\d+)?)\s+X\s*[:\-]?\s*(\d+(?:\.\d+)?)\s+2\s*[:\-]?\s*(\d+(?:\.\d+)?)\b/i,

                /\b1\s+(\d+(?:\.\d+)?)\s+X\s+(\d+(?:\.\d+)?)\s+2\s+(\d+(?:\.\d+)?)\b/i
            ];

            for (const regex of patterns) {
                const m =
                    text.match(regex);

                if (!m) continue;

                const homeOdds =
                    Number(m[1]);

                const drawOdds =
                    Number(m[2]);

                const awayOdds =
                    Number(m[3]);

                if (
                    homeOdds >= 1 &&
                    drawOdds >= 1 &&
                    awayOdds >= 1 &&
                    homeOdds <= 100 &&
                    drawOdds <= 100 &&
                    awayOdds <= 100
                ) {
                    oneXTwoEvidence.push({
                        home: homeOdds,
                        draw: drawOdds,
                        away: awayOdds,
                        source: source.link || null,
                        title: source.title || null
                    });

                    break;
                }
            }
        }

        const primaryOneXTwo =
            oneXTwoEvidence.length
                ? oneXTwoEvidence[0]
                : null;

        /*
         * ---------------------------------------------------------
         * XG
         * ---------------------------------------------------------
         */

        function explicitTeamXG(source, teamIdentity) {
            const text =
                `${source.title || ""} ${source.snippet || ""}`;

            if (!source.currentFixtureUsable) {
                return null;
            }

            const aliases =
                identityAliases(teamIdentity)
                    .map(clean)
                    .filter(Boolean);

            for (const alias of aliases) {
                const escaped =
                    alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

                const patterns = [
                    new RegExp(
                        `${escaped}[^\\n]{0,100}?(?:xg|expected goals)\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)`,
                        "i"
                    ),

                    new RegExp(
                        `(\\d+(?:\\.\\d+)?)\\s*(?:xg|expected goals)[^\\n]{0,100}?${escaped}`,
                        "i"
                    )
                ];

                for (const regex of patterns) {
                    const m =
                        text.match(regex);

                    if (!m) continue;

                    const value =
                        Number(
                            m[1] ||
                            m[2]
                        );

                    if (
                        Number.isFinite(value) &&
                        value >= 0 &&
                        value <= 10
                    ) {
                        return {
                            value,
                            source: source.link || null,
                            title: source.title || null
                        };
                    }
                }
            }

            return null;
        }

        const homeXG = [];
        const awayXG = [];
        const combinedXG = [];

        for (const source of currentMarketSources) {
            const homeValue =
                explicitTeamXG(
                    source,
                    resolvedHome
                );

            const awayValue =
                explicitTeamXG(
                    source,
                    resolvedAway
                );

            if (homeValue) {
                homeXG.push(homeValue);
            }

            if (awayValue) {
                awayXG.push(awayValue);
            }

            const text =
                `${source.title || ""} ${source.snippet || ""}`;

            const combined =
                text.match(
                    /(?:combined|total)\s+(?:xg|expected goals)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i
                );

            if (combined) {
                const value =
                    Number(combined[1]);

                if (
                    Number.isFinite(value) &&
                    value >= 0 &&
                    value <= 15
                ) {
                    combinedXG.push({
                        value,
                        source: source.link || null,
                        title: source.title || null
                    });
                }
            }
        }

        /*
         * ---------------------------------------------------------
         * GOALS / TEAM STATISTICS
         * ---------------------------------------------------------
         */

        function explicitGoalStat(source, teamIdentity) {
            const text =
                `${source.title || ""} ${source.snippet || ""}`;

            if (!source.currentFixtureUsable) {
                return null;
            }

            const aliases =
                identityAliases(teamIdentity)
                    .map(clean)
                    .filter(Boolean);

            for (const alias of aliases) {
                const escaped =
                    alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

                const regex =
                    new RegExp(
                        `${escaped}[^\\n]{0,100}?(?:goals scored|goals average|goals per game|average goals)\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)`,
                        "i"
                    );

                const m =
                    text.match(regex);

                if (!m) continue;

                const value =
                    Number(m[1]);

                if (
                    Number.isFinite(value) &&
                    value >= 0 &&
                    value <= 20
                ) {
                    return {
                        value,
                        source: source.link || null,
                        title: source.title || null
                    };
                }
            }

            return null;
        }

        const homeGoals = [];
        const awayGoals = [];

        for (const source of currentMarketSources) {
            const h =
                explicitGoalStat(
                    source,
                    resolvedHome
                );

            const a =
                explicitGoalStat(
                    source,
                    resolvedAway
                );

            if (h) homeGoals.push(h);
            if (a) awayGoals.push(a);
        }

        /*
         * ---------------------------------------------------------
         * INJURIES
         * ---------------------------------------------------------
         *
         * Conservative:
         * only accept explicit current team-specific evidence.
         * ---------------------------------------------------------
         */

        function explicitTeamInjury(source, teamIdentity) {
            if (!source.currentFixtureUsable) {
                return [];
            }

            const text =
                `${source.title || ""} ${source.snippet || ""}`;

            const teamPresent =
                containsIdentity(
                    text,
                    teamIdentity
                );

            if (!teamPresent) {
                return [];
            }

            if (
                !/injur|injured|unavailable|suspend|doubt|absent|out/i.test(text)
            ) {
                return [];
            }

            /*
             * We do not invent player names from ambiguous snippets.
             * Return evidence only.
             */
            return [{
                type: "team_news",
                evidence: text.slice(0, 600),
                source: source.link || null,
                title: source.title || null
            }];
        }

        const injurySources =
            currentSourcesByType("injuries");

        const homeInjuries = [];
        const awayInjuries = [];

        for (const source of injurySources) {
            homeInjuries.push(
                ...explicitTeamInjury(
                    source,
                    resolvedHome
                )
            );

            awayInjuries.push(
                ...explicitTeamInjury(
                    source,
                    resolvedAway
                )
            );
        }

        /*
         * ---------------------------------------------------------
         * LINEUPS
         * ---------------------------------------------------------
         *
         * We deliberately do NOT turn a "predicted lineup" into
         * confirmed lineup data.
         * ---------------------------------------------------------
         */

        const lineupSources =
            currentSourcesByType("lineups");

        const homeLineups = [];
        const awayLineups = [];
        const lineupEvidence = [];

        for (const source of lineupSources) {

            const text =
                `${source.title || ""} ${source.snippet || ""}`;

            const predicted =
                /predicted lineup|probable lineup|possible lineup|expected lineup/i.test(text);

            const confirmed =
                /confirmed lineup|starting xi confirmed|official lineup|lineups confirmed/i.test(text);

            const homeMention =
                containsIdentity(text, resolvedHome);

            const awayMention =
                containsIdentity(text, resolvedAway);

            /*
             * Fixture context without players.
             */
            if (
                source.fixtureStrength === "NEARBY_FIXTURE_CONTEXT" &&
                !predicted &&
                !confirmed
            ) {
                lineupEvidence.push({
                    type: "fixture_lineup_context",
                    title: source.title,
                    source: source.link,
                    snippet: source.snippet,
                    date: source.date || null,
                    fixtureMatch: source.fixtureMatch,
                    dateMatch: source.dateMatch,
                    utcNextDayMatch: source.utcNextDayMatch,
                    currentFixtureUsable: source.currentFixtureUsable
                });

                continue;
            }

            if (predicted) {
                lineupEvidence.push({
                    type: "predicted",
                    title: source.title,
                    source: source.link,
                    snippet: source.snippet,
                    confirmed: false
                });

                continue;
            }

            if (confirmed) {
                lineupEvidence.push({
                    type: "confirmed_claim",
                    title: source.title,
                    source: source.link,
                    snippet: source.snippet,
                    confirmed: true
                });

                /*
                 * We still don't manufacture player arrays.
                 */
                continue;
            }

            if (homeMention && awayMention) {
                lineupEvidence.push({
                    type: "fixture_lineup_context",
                    title: source.title,
                    source: source.link,
                    snippet: source.snippet,
                    confirmed: false
                });
            }
        }

        /*
         * ---------------------------------------------------------
         * NORMALIZED OBJECTS
         * ---------------------------------------------------------
         */

        const normalized = {

            form: {
                home: homeForm,
                away: awayForm,

                homeMeta: {
                    requested: 5,
                    extracted: homeForm.length,
                    complete: homeForm.length >= 5
                },

                awayMeta: {
                    requested: 5,
                    extracted: awayForm.length,
                    complete: awayForm.length >= 5
                }
            },

            h2h: {
                evidence: h2hEvidence
            },

            goals: {
                home:
                    homeGoals.length
                        ? {
                            evidence: homeGoals
                        }
                        : {},

                away:
                    awayGoals.length
                        ? {
                            evidence: awayGoals
                        }
                        : {}
            },

            xg: {
                home: homeXG,
                away: awayXG,
                combined: combinedXG,
                raw: []
            },

            btts: {
                home: null,
                away: null,
                probability: bttsProbability,
                evidence: bttsEvidence,
                odds: bttsOdds
            },

            overUnder: {
                home: {},
                away: {},
                evidence: overUnderEvidence,
                odds: overUnderOdds
            },

            injuries: {
                home: homeInjuries,
                away: awayInjuries
            },

            lineups: {
                home: homeLineups,
                away: awayLineups,
                evidence: lineupEvidence
            },

            odds: {
                home:
                    primaryOneXTwo
                        ? primaryOneXTwo.home
                        : null,

                draw:
                    primaryOneXTwo
                        ? primaryOneXTwo.draw
                        : null,

                away:
                    primaryOneXTwo
                        ? primaryOneXTwo.away
                        : null,

                probability: {
                    home: null,
                    draw: null,
                    away: null
                },

                evidence: oneXTwoEvidence
            }
        };

        /*
         * ---------------------------------------------------------
         * AVAILABILITY
         * ---------------------------------------------------------
         */

        const extractedAvailability = {
            identity:
                resolvedHome !== "UNKNOWN" &&
                resolvedAway !== "UNKNOWN",

            form:
                homeForm.length > 0 ||
                awayForm.length > 0,

            h2h:
                h2hEvidence.length > 0,

            goals:
                homeGoals.length > 0 ||
                awayGoals.length > 0,

            xg:
                homeXG.length > 0 ||
                awayXG.length > 0 ||
                combinedXG.length > 0,

            btts:
                bttsOdds.length > 0,

            overUnder:
                overUnderOdds.length > 0,

            injuries:
                homeInjuries.length > 0 ||
                awayInjuries.length > 0,

            lineups:
                homeLineups.length > 0 ||
                awayLineups.length > 0,

            odds:
                oneXTwoEvidence.length > 0
        };

        const sourceAvailability = {
            form:
                processedSources.some(source =>
                    [
                        "form_home",
                        "form_home_recent",
                        "form_away",
                        "form_away_recent"
                    ].includes(source.type)
                ),

            h2h:
                processedSources.some(source =>
                    source.type === "h2h"
                ),

            stats:
                processedSources.some(source =>
                    source.type === "stats"
                ),

            injuries:
                processedSources.some(source =>
                    source.type === "injuries"
                ),

            lineups:
                processedSources.some(source =>
                    source.type === "lineups"
                ),

            odds:
                processedSources.some(source =>
                    source.type === "odds"
                )
        };

        const currentFixtureAvailability = {
            form:
                processedSources.some(source =>
                    [
                        "form_home",
                        "form_home_recent",
                        "form_away",
                        "form_away_recent"
                    ].includes(source.type) &&
                    source.currentFixtureUsable
                ),

            stats:
                processedSources.some(source =>
                    source.type === "stats" &&
                    source.currentFixtureUsable
                ),

            injuries:
                processedSources.some(source =>
                    source.type === "injuries" &&
                    source.currentFixtureUsable
                ),

            lineups:
                processedSources.some(source =>
                    source.type === "lineups" &&
                    source.currentFixtureUsable
                ),

            odds:
                processedSources.some(source =>
                    (
                        source.type === "odds" ||
                        source.type === "stats"
                    ) &&
                    source.currentFixtureUsable
                ),

            h2h:
                h2hEvidence.some(item =>
                    item.currentFixtureUsable
                )
        };

        /*
         * ---------------------------------------------------------
         * IDENTITY REPORT
         * ---------------------------------------------------------
         */

        const contaminationSources =
            processedSources.filter(source =>
                source.wrongFixture ||
                source.fixtureStrength === "NON_SENIOR_FIXTURE"
            );

        const universitySources =
            processedSources.filter(source =>
                source.identities.includes(
                    "UNIVERSIDAD_DE_CONCEPCION"
                )
            );

        const deportesSources =
            processedSources.filter(source =>
                source.identities.includes(
                    "DEPORTES_CONCEPCION"
                )
            );

        const separateConcepcionIdentities =
            universitySources.length > 0 &&
            deportesSources.length > 0;

        const identityReport = {
            requested: {
                home: requestedHome,
                homeIdentity: requestedHomeIdentity,
                away: requestedAway,
                awayIdentity: requestedAwayIdentity
            },

            resolved: {
                home: resolvedHome,
                away: resolvedAway
            },

            canonicalNames: {
                home: homeCanonical,
                away: awayCanonical
            },

            homeStatus:
                resolvedHome !== "UNKNOWN" &&
                resolvedHome !== "AMBIGUOUS_CONCEPCION"
                    ? "RESOLVED"
                    : "UNRESOLVED",

            awayStatus:
                resolvedAway !== "UNKNOWN" &&
                resolvedAway !== "AMBIGUOUS_CONCEPCION"
                    ? "RESOLVED"
                    : "UNRESOLVED",

            contaminationDetected:
                contaminationSources.length > 0,

            wrongFixtureDetected:
                processedSources.some(
                    source => source.wrongFixture
                ),

            separateConcepcionIdentities,

            importantRule:
                "Deportes Concepcion and Universidad de Concepcion are separate clubs."
        };

        /*
         * ---------------------------------------------------------
         * QUALITY
         * ---------------------------------------------------------
         */

        const sourceCount =
            processedSources.length;

        const usableSourceCount =
            processedSources.filter(source =>
                !source.wrongFixture &&
                source.fixtureStrength !== "NON_SENIOR_FIXTURE"
            ).length;

        const currentFixtureSourceCount =
            processedSources.filter(source =>
                source.currentFixtureUsable
            ).length;

        const fixtureSourceCount =
            processedSources.filter(source =>
                source.fixtureMatch &&
                source.fixtureStrength !== "WRONG_FIXTURE" &&
                source.fixtureStrength !== "NON_SENIOR_FIXTURE"
            ).length;

        const targetDateSourceCount =
            processedSources.filter(source =>
                source.dateMatch
            ).length;

        const utcNextDaySourceCount =
            processedSources.filter(source =>
                source.utcNextDayMatch
            ).length;

        const contaminatedSourceCount =
            contaminationSources.length;

        const structuredCount =
            [
                homeForm.length > 0 || awayForm.length > 0,
                h2hEvidence.length > 0,
                homeGoals.length > 0 || awayGoals.length > 0,
                homeXG.length > 0 || awayXG.length > 0,
                bttsOdds.length > 0,
                overUnderOdds.length > 0,
                oneXTwoEvidence.length > 0,
                homeInjuries.length > 0 || awayInjuries.length > 0,
                homeLineups.length > 0 || awayLineups.length > 0
            ].filter(Boolean).length;

        const qualityScore =
            Math.min(
                1,
                (
                    (currentFixtureSourceCount * 0.02) +
                    (structuredCount * 0.08) +
                    (h2hEvidence.length > 0 ? 0.08 : 0) +
                    (
                        resolvedHome !== "UNKNOWN" &&
                        resolvedAway !== "UNKNOWN"
                            ? 0.10
                            : 0
                    )
                )
            );

        const quality = {
            sourceCount,
            usableSourceCount,
            currentFixtureSourceCount,
            fixtureSourceCount,
            targetDateSourceCount,
            utcNextDaySourceCount,
            contaminatedSourceCount,
            structuredDataCategories: structuredCount,
            usableText:
                processedSources.length > 0,
            score:
                Number(qualityScore.toFixed(2))
        };

        /*
         * ---------------------------------------------------------
         * READINESS
         * ---------------------------------------------------------
         *
         * Form must exist for BOTH teams.
         *
         * At least one current meaningful statistics category
         * must exist.
         *
         * Injuries and lineups do not automatically block analysis
         * when the web has no reliable evidence.
         * ---------------------------------------------------------
         */

        const identityReady =
            identityReport.homeStatus === "RESOLVED" &&
            identityReport.awayStatus === "RESOLVED";

        const formReady =
            homeForm.length >= 1 &&
            awayForm.length >= 1;

        const statsReady =
            (
                bttsOdds.length > 0 ||
                overUnderOdds.length > 0 ||
                homeXG.length > 0 ||
                awayXG.length > 0 ||
                homeGoals.length > 0 ||
                awayGoals.length > 0
            );

        const oddsReady =
            oneXTwoEvidence.length > 0;

        const dataReady =
            identityReady &&
            formReady &&
            statsReady;

        const analysisReady =
            identityReady &&
            formReady &&
            statsReady;

        const readiness = {
            identityReady,
            formReady,
            statsReady,
            oddsReady,
            dataReady,
            analysisReady
        };

        /*
         * ---------------------------------------------------------
         * WARNINGS
         * ---------------------------------------------------------
         */

        const warnings = [];

        if (contaminatedSourceCount > 0) {
            warnings.push(
                `${contaminatedSourceCount} contaminated/wrong-fixture source(s) detected and excluded from relevant normalized data.`
            );
        }

        if (
            resolvedHome === "DEPORTES_CONCEPCION" ||
            resolvedAway === "DEPORTES_CONCEPCION"
        ) {
            if (
                processedSources.some(source =>
                    source.identities.includes(
                        "UNIVERSIDAD_DE_CONCEPCION"
                    )
                )
            ) {
                warnings.push(
                    "Universidad de Concepcion and Deportes Concepcion were detected as separate identities."
                );
            }
        }

        if (homeForm.length < 5) {
            warnings.push(
                `Home form incomplete: ${homeForm.length}/5 reliable results extracted. No missing results were guessed.`
            );
        }

        if (awayForm.length < 5) {
            warnings.push(
                `Away form incomplete: ${awayForm.length}/5 reliable results extracted. No missing results were guessed.`
            );
        }

        if (
            homeInjuries.length === 0 &&
            awayInjuries.length === 0
        ) {
            warnings.push(
                "No reliable current injury/suspension records were extracted."
            );
        }

        if (
            homeLineups.length === 0 &&
            awayLineups.length === 0
        ) {
            warnings.push(
                "No confirmed current player lineups were extracted."
            );
        }

        if (lineupEvidence.some(item =>
            item.type === "predicted"
        )) {
            warnings.push(
                "Predicted lineup evidence exists but is not treated as confirmed lineup data."
            );
        }

        if (
            homeXG.length === 0 &&
            awayXG.length === 0
        ) {
            warnings.push(
                "No reliable current team-attributed xG was extracted."
            );
        }

        if (
            bttsOdds.length > 0
        ) {
            warnings.push(
                "BTTS probability and BTTS odds are stored separately."
            );
        }

        if (
            overUnderOdds.length > 0
        ) {
            warnings.push(
                "Over/Under odds are stored separately from probabilities."
            );
        }

        if (
            h2hEvidence.length > 0
        ) {
            warnings.push(
                "Historical target-vs-target meetings are retained under H2H and are not treated as current form."
            );
        }

        warnings.push(
            "Current fixture evidence requires exact fixture identity plus current-date, UTC-next-day, or current-context evidence."
        );

        if (!statsReady) {
            warnings.push(
                "Core current statistics are insufficient for full analysis. Missing statistics were not guessed."
            );
        }

        /*
         * ---------------------------------------------------------
         * FINAL RESPONSE
         * ---------------------------------------------------------
         */

        return res.status(200).json({

            success: true,

            version: "V3.12",

            match: {
                home: homeCanonical,
                away: awayCanonical,
                date: matchDate,
                year: targetYear
            },

            identity: identityReport,

            normalized,

            sources: processedSources,

            availability: {
                extracted: extractedAvailability,
                source: sourceAvailability,
                currentFixture: currentFixtureAvailability
            },

            quality,

            readiness,

            analysisReady,

            warnings
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            version: "V3.12",
            error: "Normalization failed.",
            details: error.message
        });
    }
}
