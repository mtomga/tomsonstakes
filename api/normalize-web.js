export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        version: "V3.4",
        error: "POST method required."
      });
    }

    const body = req.body || {};
    const match = body.match || {};

    const homeInput = String(match.home || "").trim();
    const awayInput = String(match.away || "").trim();
    const matchDate = String(match.date || "").trim();

    if (!homeInput || !awayInput || !matchDate) {
      return res.status(400).json({
        success: false,
        version: "V3.4",
        error: "Match information is incomplete.",
        received: {
          home: homeInput,
          away: awayInput,
          date: matchDate
        }
      });
    }

    // ============================================================
    // 1. TEAM IDENTITY
    // ============================================================

    function cleanText(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function teamIdentity(name) {
      const n = cleanText(name);

      if (
        n.includes("universidad de concepcion") ||
        n === "u de concepcion" ||
        n === "u concepcion" ||
        n.includes("univ de concepcion") ||
        n.includes("univ. de concepcion")
      ) {
        return "UNIVERSIDAD_DE_CONCEPCION";
      }

      if (
        n.includes("deportes concepcion") ||
        n.includes("d concepcion") ||
        n.includes("d. concepcion")
      ) {
        return "DEPORTES_CONCEPCION";
      }

      if (
        n.includes("ohiggins") ||
        n.includes("o higgins")
      ) {
        return "OHIGGINS";
      }

      // IMPORTANT:
      // Bare "Concepcion" is deliberately ambiguous.
      if (n === "concepcion") {
        return "AMBIGUOUS_CONCEPCION";
      }

      return "UNKNOWN";
    }

    const requestedHomeIdentity = teamIdentity(homeInput);
    const requestedAwayIdentity = teamIdentity(awayInput);

    // ============================================================
    // 2. FLATTEN SEARCH RESULTS
    // ============================================================

    const searches = Array.isArray(body.searches)
      ? body.searches
      : [];

    const results = [];

    for (const search of searches) {
      const type = String(search?.type || "unknown");

      if (!Array.isArray(search?.results)) continue;

      for (const item of search.results) {
        results.push({
          type,
          title: String(item?.title || ""),
          url: String(item?.link || ""),
          snippet: String(item?.snippet || ""),
          date: item?.date ?? null,
          position: item?.position ?? null
        });
      }
    }

    // ============================================================
    // 3. SOURCE IDENTITY
    // ============================================================

    function sourceIdentities(source) {
      const text = cleanText(
        `${source.title} ${source.snippet} ${source.url}`
      );

      const identities = new Set();

      if (
        text.includes("universidad de concepcion") ||
        text.includes("u de concepcion") ||
        text.includes("u concepcion") ||
        text.includes("univ de concepcion") ||
        text.includes("univ. de concepcion") ||
        text.includes("universidad-de-concepcion")
      ) {
        identities.add("UNIVERSIDAD_DE_CONCEPCION");
      }

      if (
        text.includes("deportes concepcion") ||
        text.includes("d concepcion") ||
        text.includes("d. concepcion") ||
        text.includes("deportes-concepcion")
      ) {
        identities.add("DEPORTES_CONCEPCION");
      }

      if (
        text.includes("ohiggins") ||
        text.includes("o higgins")
      ) {
        identities.add("OHIGGINS");
      }

      return [...identities];
    }

    function hasIdentity(source, identity) {
      return sourceIdentities(source).includes(identity);
    }

    // ============================================================
    // 4. CURRENT / HISTORICAL DATE DETECTION
    // ============================================================

    function containsTargetDate(source) {
      const text = `${source.title} ${source.snippet} ${source.url}`;

      const target = matchDate.split("-");

      if (target.length !== 3) return false;

      const year = target[0];
      const month = target[1];
      const day = target[2];

      const slashDate =
        `${day}/${month}/${year}`;

      const isoDate =
        `${year}-${month}-${day}`;

      const usDate =
        `${month}/${day}/${year}`;

      return (
        text.includes(isoDate) ||
        text.includes(slashDate) ||
        text.includes(usDate) ||
        text.includes("30 september 2026") ||
        text.includes("september 30 2026")
      );
    }

    function historicalJuly2026(source) {
      const text = cleanText(
        `${source.title} ${source.snippet} ${source.url}`
      );

      return (
        text.includes("27.07.2026") ||
        text.includes("26.07.2026") ||
        text.includes("jul 27 2026") ||
        text.includes("jul 26 2026") ||
        text.includes("july 27 2026") ||
        text.includes("july 26 2026") ||
        text.includes("2026-07-27") ||
        text.includes("2026-07-26")
      );
    }

    // ============================================================
    // 5. SOURCE CLASSIFICATION
    // ============================================================

    const categorized = {
      form: [],
      h2h: [],
      stats: [],
      injuries: [],
      lineups: [],
      odds: []
    };

    for (const source of results) {
      if (categorized[source.type]) {
        categorized[source.type].push(source);
      }
    }

    // ============================================================
    // 6. H2H
    // ============================================================

    const h2h = categorized.h2h
      .filter(source => {
        const ids = sourceIdentities(source);

        return (
          ids.includes("OHIGGINS") &&
          (
            ids.includes("DEPORTES_CONCEPCION") ||
            ids.includes("UNIVERSIDAD_DE_CONCEPCION")
          )
        );
      })
      .map(source => ({
        title: source.title,
        source: source.url,
        snippet: source.snippet
      }));

    // ============================================================
    // 7. CURRENT TARGET IDENTITY FILTER
    // ============================================================

    const homeIdentityIsAmbiguous =
      requestedHomeIdentity === "AMBIGUOUS_CONCEPCION";

    function belongsToRequestedHome(source) {
      if (homeIdentityIsAmbiguous) return false;

      return hasIdentity(source, requestedHomeIdentity);
    }

    function belongsToRequestedAway(source) {
      return hasIdentity(source, requestedAwayIdentity);
    }

    // ============================================================
    // 8. FORM
    // ============================================================

    const form = {
      home: [],
      away: []
    };

    // We intentionally DO NOT manufacture form.
    // A source must contain an explicit target-team identity.
    // H2H sources are excluded.

    for (const source of categorized.form) {
      if (source.type === "h2h") continue;

      if (
        belongsToRequestedHome(source) &&
        !historicalJuly2026(source)
      ) {
        // No generic score extraction here.
        // Prevents H2H and unrelated scores becoming form.
      }

      if (
        belongsToRequestedAway(source) &&
        !historicalJuly2026(source)
      ) {
        // Same protection for away team.
      }
    }

    // ============================================================
    // 9. GOALS
    // ============================================================

    const goals = {
      home: {},
      away: {}
    };

    // Do not infer goals from arbitrary "2-0", "0-1", etc.
    // Those may be historical/H2H scores.

    // ============================================================
    // 10. xG
    // ============================================================

    const xg = {
      home: [],
      away: [],
      combined: [],
      raw: []
    };

    function addUnique(arr, item) {
      const exists = arr.some(
        x =>
          x.value === item.value &&
          x.source === item.source
      );

      if (!exists) arr.push(item);
    }

    for (const source of categorized.stats) {
      const text = `${source.title} ${source.snippet}`;

      // Individual team xG only.
      const homeMatch = text.match(
        /(?:deportes\s+concepcion|universidad\s+de\s+concepcion|u\.?\s*de\s*concepcion)[^.\n]{0,120}?\b(\d+(?:\.\d+)?)\s*xg\b/i
      );

      const awayMatch = text.match(
        /o['’]?higgins[^.\n]{0,120}?\b(\d+(?:\.\d+)?)\s*xg\b/i
      );

      // Combined xG such as:
      // "combined 2.52"
      const combinedMatch = text.match(
        /combined\s+(\d+(?:\.\d+)?)\s*xg/i
      );

      if (combinedMatch) {
        addUnique(xg.combined, {
          value: Number(combinedMatch[1]),
          source: source.url,
          title: source.title
        });
      }

      if (homeMatch && !homeIdentityIsAmbiguous) {
        addUnique(xg.home, {
          value: Number(homeMatch[1]),
          source: source.url,
          title: source.title
        });
      }

      if (awayMatch) {
        addUnique(xg.away, {
          value: Number(awayMatch[1]),
          source: source.url,
          title: source.title
        });
      }
    }

    // ============================================================
    // 11. BTTS
    // ============================================================

    const btts = {
      home: null,
      away: null,
      evidence: []
    };

    for (const source of categorized.stats) {
      const text = source.snippet;

      const matches = [
        ...text.matchAll(
          /both\s+teams\s+to\s+score\s+(yes|no)\s+(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (const m of matches) {
        const answer = m[1].toUpperCase();
        const percentage = Number(m[2]);

        btts.evidence.push({
          answer,
          percentage,
          source: source.url,
          title: source.title
        });
      }
    }

    // ============================================================
    // 12. OVER / UNDER
    // ============================================================

    const overUnder = {
      home: {},
      away: {},
      evidence: []
    };

    for (const source of categorized.stats) {
      const text = source.snippet;

      const matches = [
        ...text.matchAll(
          /(over|under)\s+(\d+(?:\.\d+)?)\s*(?:goals?)?\s*(?:[:\-]?\s*)?(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (const m of matches) {
        overUnder.evidence.push({
          selection:
            `${m[1].toUpperCase()} ${m[2]}`,
          percentage: Number(m[3]),
          source: source.url,
          title: source.title
        });
      }
    }

    // ============================================================
    // 13. INJURIES
    // ============================================================

    const injuries = {
      home: [],
      away: []
    };

    for (const source of categorized.injuries) {
      const text = source.snippet;

      // Only use a source when the team is explicitly identified.
      if (
        !homeIdentityIsAmbiguous &&
        belongsToRequestedHome(source)
      ) {
        injuries.home.push({
          team: requestedHomeIdentity,
          text,
          source: source.url,
          title: source.title
        });
      }

      if (belongsToRequestedAway(source)) {
        injuries.away.push({
          team: requestedAwayIdentity,
          text,
          source: source.url,
          title: source.title
        });
      }
    }

    // ============================================================
    // 14. LINEUPS
    // ============================================================

    const lineups = {
      home: [],
      away: []
    };

    function lineupType(source) {
      const text = cleanText(
        `${source.title} ${source.snippet}`
      );

      if (
        text.includes("predicted lineup") ||
        text.includes("predicted lineups") ||
        text.includes("predicted xi") ||
        text.includes("possible starting xi")
      ) {
        return "predicted";
      }

      if (
        text.includes("lineups") ||
        text.includes("starting xi")
      ) {
        return "unknown";
      }

      return "unknown";
    }

    for (const source of categorized.lineups) {
      const type = lineupType(source);

      if (
        !homeIdentityIsAmbiguous &&
        belongsToRequestedHome(source)
      ) {
        lineups.home.push({
          type,
          title: source.title,
          source: source.url,
          snippet: source.snippet
        });
      }

      if (belongsToRequestedAway(source)) {
        lineups.away.push({
          type,
          title: source.title,
          source: source.url,
          snippet: source.snippet
        });
      }
    }

    // A historical match report must not become a current confirmed lineup.
    for (const side of ["home", "away"]) {
      lineups[side] = lineups[side].filter(item => {
        const source = {
          title: item.title,
          snippet: item.snippet,
          url: item.source
        };

        return !historicalJuly2026(source);
      });
    }

    // ============================================================
    // 15. ODDS / PROBABILITIES
    // ============================================================

    const odds = {
      home: null,
      draw: null,
      away: null,
      probability: {
        home: null,
        draw: null,
        away: null
      },
      evidence: []
    };

    for (const source of categorized.odds) {
      const text = source.snippet;

      // Probability is NOT odds.
      const probabilityMatches = [
        ...text.matchAll(
          /probability\s*[:\-]?\s*(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (const m of probabilityMatches) {
        odds.evidence.push({
          type: "probability",
          percentage: Number(m[1]),
          source: source.url,
          title: source.title
        });
      }

      // Only accept explicit decimal odds.
      const explicitOdds = [
        ...text.matchAll(
          /\bodds?\s*(?:of|:)\s*(\d+(?:\.\d+)?)/gi
        )
      ];

      for (const m of explicitOdds) {
        odds.evidence.push({
          type: "decimal_odds",
          value: Number(m[1]),
          source: source.url,
          title: source.title
        });
      }
    }

    // ============================================================
    // 16. SOURCES
    // ============================================================

    const sources = results.map(source => ({
      type: source.type,
      title: source.title,
      url: source.url,
      snippet: source.snippet,
      date: source.date,
      position: source.position,
      identities: sourceIdentities(source)
    }));

    // ============================================================
    // 17. IDENTITY REPORT
    // ============================================================

    const identity = {
      requested: {
        home: homeInput,
        away: awayInput
      },

      resolved: {
        home: requestedHomeIdentity,
        away: requestedAwayIdentity
      },

      homeStatus: homeIdentityIsAmbiguous
        ? "AMBIGUOUS"
        : "RESOLVED",

      contaminationDetected:
        results.some(source => {
          const ids = sourceIdentities(source);

          return (
            ids.includes("DEPORTES_CONCEPCION") &&
            ids.includes("UNIVERSIDAD_DE_CONCEPCION")
          );
        }),

      separateConcepcionIdentities: true
    };

    // ============================================================
    // 18. AVAILABILITY / QUALITY
    // ============================================================

    const dataAvailability = {
      identity: !homeIdentityIsAmbiguous,
      form: form.home.length > 0 || form.away.length > 0,
      h2h: h2h.length > 0,
      stats:
        xg.home.length > 0 ||
        xg.away.length > 0 ||
        xg.combined.length > 0 ||
        btts.evidence.length > 0 ||
        overUnder.evidence.length > 0,
      injuries:
        injuries.home.length > 0 ||
        injuries.away.length > 0,
      lineups:
        lineups.home.length > 0 ||
        lineups.away.length > 0,
      odds:
        odds.evidence.length > 0
    };

    const warnings = [];

    if (homeIdentityIsAmbiguous) {
      warnings.push(
        "Home team identity is ambiguous: 'Concepcion' may refer to Deportes Concepcion or Universidad de Concepcion."
      );
    }

    if (!dataAvailability.form) {
      warnings.push(
        "Reliable current form was not extracted."
      );
    }

    warnings.push(
      "H2H is isolated from current-form calculations."
    );

    warnings.push(
      "Predicted lineups are not treated as confirmed lineups."
    );

    warnings.push(
      "Universidad de Concepcion and Deportes Concepcion are treated as separate identities."
    );

    warnings.push(
      "Probabilities are kept separate from decimal odds."
    );

    // ============================================================
    // 19. FINAL RESPONSE
    // ============================================================

    const analysisReady =
      identity.homeStatus === "RESOLVED" &&
      identity.resolved.away !== "UNKNOWN";

    return res.status(200).json({
      success: true,
      version: "V3.4",

      normalized: {
        match: {
          home: homeInput,
          away: awayInput,
          date: matchDate,
          year: match.year || null
        },

        identity,

        form,
        goals,
        xg,
        btts,
        overUnder,
        injuries,
        lineups,
        odds,
        h2h,
        sources,

        rawTextLength: JSON.stringify(body).length
      },

      quality: {
        sourceCount: results.length,
        usableText: results.length > 0,
        score: results.length > 0
          ? 1
          : 0
      },

      dataAvailability,

      analysisReady,

      warnings
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      version: "V3.4",
      error: "Web data normalization failed.",
      details: error?.message || String(error)
    });
  }
}
