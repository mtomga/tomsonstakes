export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        version: "V3.3",
        error: "POST method required."
      });
    }

    const body = req.body || {};

    const match = body.match || {};

    const home = String(match.home || "").trim();
    const away = String(match.away || "").trim();
    const date = String(match.date || "").trim();

    if (!home || !away || !date) {
      return res.status(400).json({
        success: false,
        version: "V3.3",
        error: "Match information is incomplete.",
        received: {
          home,
          away,
          date
        }
      });
    }

    /*
     * ---------------------------------------------------------
     * TEAM IDENTITY
     * ---------------------------------------------------------
     */

    function normalizeName(name) {
      return String(name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.'’]/g, "")
        .replace(/\b(univ|university|universidad|deportes|deportivo|cd|club)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const homeKey = normalizeName(home);
    const awayKey = normalizeName(away);

    /*
     * Concepcion is dangerous because:
     *
     * Universidad de Concepcion
     * Deportes Concepcion
     *
     * are different clubs.
     *
     * Therefore "concepcion" alone is NOT enough to identify
     * a source as belonging to the requested club.
     */

    function teamMatches(text, team) {
      const t = String(text || "").toLowerCase();

      const teamLower = team.toLowerCase();

      if (teamLower.includes("universidad") ||
          teamLower.includes("university") ||
          teamLower.includes("u. de") ||
          teamLower.includes("u de")) {

        return (
          t.includes("universidad de concepcion") ||
          t.includes("universidad de concepción") ||
          t.includes("u. de concepcion") ||
          t.includes("u de concepcion")
        );
      }

      if (teamLower.includes("deportes")) {
        return (
          t.includes("deportes concepcion") ||
          t.includes("deportes concepción") ||
          t.includes("d. concepcion") ||
          t.includes("d. concepción")
        );
      }

      const key = normalizeName(team);

      return normalizeName(t).includes(key);
    }

    /*
     * ---------------------------------------------------------
     * FLATTEN SEARCH RESULTS
     * ---------------------------------------------------------
     */

    const searches = Array.isArray(body.searches)
      ? body.searches
      : [];

    const sources = [];

    for (const search of searches) {
      if (!search || !Array.isArray(search.results)) continue;

      for (const result of search.results) {
        if (!result) continue;

        sources.push({
          type: String(search.type || ""),
          query: String(search.query || ""),
          title: String(result.title || ""),
          url: String(result.link || ""),
          snippet: String(result.snippet || ""),
          date: result.date || null,
          position: result.position || null
        });
      }
    }

    /*
     * ---------------------------------------------------------
     * TEXT HELPERS
     * ---------------------------------------------------------
     */

    function sourceText(source) {
      return `${source.title} ${source.snippet}`.trim();
    }

    function lowerText(source) {
      return sourceText(source).toLowerCase();
    }

    function containsAny(text, words) {
      const t = String(text || "").toLowerCase();

      return words.some(word =>
        t.includes(String(word).toLowerCase())
      );
    }

    function parseNumber(value) {
      if (value === null || value === undefined) return null;

      const n = Number(
        String(value)
          .replace(",", ".")
          .replace(/[^\d.-]/g, "")
      );

      return Number.isFinite(n) ? n : null;
    }

    /*
     * ---------------------------------------------------------
     * DATE / RECENCY HELPERS
     * ---------------------------------------------------------
     */

    function extractDate(text) {
      const value = String(text || "");

      let m = value.match(
        /\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/
      );

      if (m) {
        return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
      }

      m = value.match(
        /\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/
      );

      if (m) {
        return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
      }

      return null;
    }

    function isHistoricalResult(source) {
      const text = sourceText(source);
      const d = source.date || extractDate(text);

      if (!d) return false;

      return d < date;
    }

    /*
     * ---------------------------------------------------------
     * CLASSIFY CURRENT MATCH VS OTHER MATCH
     * ---------------------------------------------------------
     */

    function isRequestedFixture(source) {
      const text = lowerText(source);

      const homePresent = teamMatches(text, home);
      const awayPresent = teamMatches(text, away);

      return homePresent && awayPresent;
    }

    function isWrongConcepcionIdentity(source) {
      const text = lowerText(source);

      const hasUniversity =
        text.includes("universidad de concepcion") ||
        text.includes("universidad de concepción") ||
        text.includes("u. de concepcion") ||
        text.includes("u de concepcion");

      const hasDeportes =
        text.includes("deportes concepcion") ||
        text.includes("deportes concepción") ||
        text.includes("d. concepcion") ||
        text.includes("d. concepción");

      if (hasUniversity && hasDeportes) return false;

      if (
        homeKey.includes("concepcion") &&
        !homeKey.includes("universidad") &&
        !homeKey.includes("deportes")
      ) {
        return false;
      }

      return false;
    }

    /*
     * ---------------------------------------------------------
     * RESULT BUCKETS
     * ---------------------------------------------------------
     */

    const buckets = {
      form: [],
      h2h: [],
      stats: [],
      injuries: [],
      lineups: [],
      odds: []
    };

    for (const source of sources) {
      if (buckets[source.type]) {
        buckets[source.type].push(source);
      }
    }

    /*
     * ---------------------------------------------------------
     * FORM
     * ---------------------------------------------------------
     *
     * Only extract explicit score/result evidence.
     * Do not treat H2H as team form.
     */

    function extractScores(source, team) {
      const text = sourceText(source);

      if (!teamMatches(text, team)) return [];

      const scores = [];

      const patterns = [
        /(\d+)\s*[-–]\s*(\d+)/g,
        /(\d+)\s*:\s*(\d+)/g
      ];

      for (const regex of patterns) {
        let m;

        while ((m = regex.exec(text)) !== null) {
          const a = parseInt(m[1], 10);
          const b = parseInt(m[2], 10);

          if (
            Number.isInteger(a) &&
            Number.isInteger(b) &&
            a >= 0 &&
            b >= 0 &&
            a <= 20 &&
            b <= 20
          ) {
            scores.push({
              homeScore: a,
              awayScore: b,
              source: source.url
            });
          }
        }
      }

      return scores;
    }

    const homeForm = [];
    const awayForm = [];

    for (const source of buckets.form) {
      if (isRequestedFixture(source)) continue;

      const homeScores = extractScores(source, home);
      const awayScores = extractScores(source, away);

      homeForm.push(...homeScores);
      awayForm.push(...awayScores);
    }

    /*
     * ---------------------------------------------------------
     * GOALS / xG / BTTS / O-U
     * ---------------------------------------------------------
     */

    function extractPercentage(text, label) {
      const regex = new RegExp(
        `${label}[^%]{0,80}(\\d+(?:\\.\\d+)?)\\s*%`,
        "i"
      );

      const m = String(text || "").match(regex);

      return m ? parseNumber(m[1]) : null;
    }

    function extractXG(text) {
      const values = [];

      const regex =
        /\b(?:xg|expected goals)[^0-9]{0,30}(\d+(?:[.,]\d+)?)/gi;

      let m;

      while ((m = regex.exec(text)) !== null) {
        const n = parseNumber(m[1]);

        if (n !== null && n >= 0 && n <= 10) {
          values.push(n);
        }
      }

      return values;
    }

    const xgValues = [];

    for (const source of buckets.stats) {
      const text = sourceText(source);

      if (isWrongConcepcionIdentity(source)) continue;

      const values = extractXG(text);

      for (const value of values) {
        xgValues.push({
          value,
          source: source.url,
          title: source.title
        });
      }
    }

    /*
     * ---------------------------------------------------------
     * BTTS
     * ---------------------------------------------------------
     */

    function extractBTTS(source) {
      const text = sourceText(source);

      const results = [];

      const yes =
        text.match(/both teams to score[^%]{0,60}yes[^%]{0,20}(\d+(?:\.\d+)?)\s*%/i);

      if (yes) {
        results.push({
          value: parseNumber(yes[1]),
          answer: "YES",
          source: source.url
        });
      }

      const generic =
        text.match(/btts[^%]{0,60}(\d+(?:\.\d+)?)\s*%/i);

      if (generic) {
        results.push({
          value: parseNumber(generic[1]),
          answer: null,
          source: source.url
        });
      }

      return results;
    }

    const btts = [];

    for (const source of buckets.stats) {
      btts.push(...extractBTTS(source));
    }

    /*
     * ---------------------------------------------------------
     * OVER / UNDER
     * ---------------------------------------------------------
     */

    function extractOverUnder(source) {
      const text = sourceText(source);
      const results = [];

      const regex =
        /\b(over|under)\s*(\d+(?:[.,]\d+)?)\b[^%]{0,50}(\d+(?:\.\d+)?)\s*%/gi;

      let m;

      while ((m = regex.exec(text)) !== null) {
        results.push({
          market: m[1].toUpperCase(),
          line: parseNumber(m[2]),
          percentage: parseNumber(m[3]),
          source: source.url
        });
      }

      return results;
    }

    const overUnder = [];

    for (const source of buckets.stats) {
      overUnder.push(...extractOverUnder(source));
    }

    /*
     * ---------------------------------------------------------
     * INJURIES
     * ---------------------------------------------------------
     *
     * Never transfer a player from one Concepcion identity
     * to another.
     */

    function extractInjuryEvidence(source) {
      const text = sourceText(source);

      const injuryWords = [
        "injured",
        "injury",
        "unavailable",
        "suspended",
        "doubtful",
        "out",
        "absent"
      ];

      if (!containsAny(text, injuryWords)) return null;

      const correctHome =
        teamMatches(text, home);

      const correctAway =
        teamMatches(text, away);

      if (!correctHome && !correctAway) return null;

      return {
        team:
          correctHome
            ? "home"
            : correctAway
            ? "away"
            : null,
        text,
        source: source.url,
        title: source.title
      };
    }

    const injuries = [];

    for (const source of buckets.injuries) {
      const evidence = extractInjuryEvidence(source);

      if (evidence) {
        injuries.push(evidence);
      }
    }

    /*
     * ---------------------------------------------------------
     * LINEUPS
     * ---------------------------------------------------------
     */

    function isPredictedLineup(source) {
      const text = lowerText(source);

      return containsAny(text, [
        "predicted lineup",
        "predicted lineups",
        "predicted xi",
        "possible xi",
        "possible starting",
        "expected lineup",
        "expected xi"
      ]);
    }

    function isConfirmedLineup(source) {
      const text = lowerText(source);

      return containsAny(text, [
        "confirmed lineup",
        "starting lineup",
        "starting xi",
        "lineups announced",
        "official lineup"
      ]);
    }

    const lineups = [];

    for (const source of buckets.lineups) {
      const homePresent = teamMatches(sourceText(source), home);
      const awayPresent = teamMatches(sourceText(source), away);

      if (!homePresent && !awayPresent) continue;

      lineups.push({
        type: isConfirmedLineup(source)
          ? "confirmed"
          : isPredictedLineup(source)
          ? "predicted"
          : "unknown",

        title: source.title,
        source: source.url,
        snippet: source.snippet
      });
    }

    /*
     * ---------------------------------------------------------
     * ODDS
     * ---------------------------------------------------------
     *
     * Do not treat probability as bookmaker odds.
     */

    function extractDecimalOdds(text) {
      const values = [];

      const regex =
        /\b([1-9]\d?\.\d{2})\b/g;

      let m;

      while ((m = regex.exec(text)) !== null) {
        const value = parseNumber(m[1]);

        if (value !== null && value >= 1.01 && value <= 100) {
          values.push(value);
        }
      }

      return values;
    }

    const oddsEvidence = [];

    for (const source of buckets.odds) {
      const text = sourceText(source);

      const values = extractDecimalOdds(text);

      if (values.length) {
        oddsEvidence.push({
          values,
          source: source.url,
          title: source.title
        });
      }
    }

    /*
     * ---------------------------------------------------------
     * H2H
     * ---------------------------------------------------------
     *
     * Kept separate from form/stats.
     */

    const h2h = [];

    for (const source of buckets.h2h) {
      const text = sourceText(source);

      if (!teamMatches(text, home) ||
          !teamMatches(text, away)) {
        continue;
      }

      h2h.push({
        title: source.title,
        source: source.url,
        snippet: source.snippet
      });
    }

    /*
     * ---------------------------------------------------------
     * SOURCE QUALITY
     * ---------------------------------------------------------
     */

    const usableSources = sources.filter(source =>
      source.title ||
      source.snippet ||
      source.url
    );

    const rawText = usableSources
      .map(source => sourceText(source))
      .join(" ")
      .trim();

    /*
     * ---------------------------------------------------------
     * FINAL OUTPUT
     * ---------------------------------------------------------
     */

    const normalized = {
      match: {
        home,
        away,
        date,
        year: match.year || null
      },

      form: {
        home: homeForm.slice(0, 10),
        away: awayForm.slice(0, 10)
      },

      goals: {
        home: {},
        away: {}
      },

      xg: {
        home: xgValues.filter(x =>
          teamMatches(x.title, home)
        ),
        away: xgValues.filter(x =>
          teamMatches(x.title, away)
        ),
        raw: xgValues
      },

      btts: {
        home: null,
        away: null,
        evidence: btts
      },

      overUnder: {
        home: {},
        away: {},
        evidence: overUnder
      },

      injuries: {
        home: injuries.filter(x => x.team === "home"),
        away: injuries.filter(x => x.team === "away")
      },

      lineups: {
        home: lineups.filter(x =>
          teamMatches(`${x.title} ${x.snippet}`, home)
        ),
        away: lineups.filter(x =>
          teamMatches(`${x.title} ${x.snippet}`, away)
        )
      },

      odds: {
        home: null,
        draw: null,
        away: null,
        evidence: oddsEvidence
      },

      h2h,

      sources: usableSources.map(source => ({
        type: source.type,
        title: source.title,
        url: source.url,
        snippet: source.snippet,
        date: source.date,
        position: source.position
      })),

      rawTextLength: rawText.length
    };

    const dataAvailability = {
      form: homeForm.length > 0 || awayForm.length > 0,
      h2h: h2h.length > 0,
      stats: xgValues.length > 0 ||
        btts.length > 0 ||
        overUnder.length > 0,
      injuries: injuries.length > 0,
      lineups: lineups.length > 0,
      odds: oddsEvidence.length > 0
    };

    const warningList = [];

    if (!dataAvailability.form) {
      warningList.push("Reliable current form was not extracted.");
    }

    if (!dataAvailability.stats) {
      warningList.push("Reliable current statistical data was not extracted.");
    }

    if (!dataAvailability.injuries) {
      warningList.push("No reliable current injury evidence was extracted.");
    }

    if (!dataAvailability.odds) {
      warningList.push("No reliable decimal bookmaker odds were extracted.");
    }

    warningList.push(
      "H2H is isolated from current-form calculations."
    );

    warningList.push(
      "Predicted lineups are not treated as confirmed lineups."
    );

    warningList.push(
      "Universidad de Concepcion and Deportes Concepcion are treated as separate identities."
    );

    return res.status(200).json({
      success: true,
      version: "V3.3",
      normalized,
      quality: {
        sourceCount: usableSources.length,
        usableText: rawText.length > 0,
        score: usableSources.length > 0 ? 1 : 0
      },
      dataAvailability,
      analysisReady: Object.values(dataAvailability).some(Boolean),
      warnings: warningList
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      version: "V3.3",
      error: "Web data normalization failed.",
      details: error?.message || String(error)
    });
  }
}
