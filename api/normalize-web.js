export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        version: "V3.6",
        error: "POST method required."
      });
    }

    const body = req.body || {};
    const match = body.match || {};

    const homeInput = String(match.home || "").trim();
    const awayInput = String(match.away || "").trim();
    const matchDate = String(match.date || "").trim();

    /*
     * V3.5 sends explicit identities.
     * V3.6 prefers those identities instead of trying to
     * rediscover the team from the display name.
     */
    const suppliedHomeIdentity =
      String(match.homeIdentity || "").trim();

    const suppliedAwayIdentity =
      String(match.awayIdentity || "").trim();

    if (!homeInput || !awayInput || !matchDate) {
      return res.status(400).json({
        success: false,
        version: "V3.6",
        error: "Match information is incomplete.",
        received: {
          home: homeInput,
          away: awayInput,
          date: matchDate
        }
      });
    }

    // ============================================================
    // 1. BASIC TEXT HELPERS
    // ============================================================

    function cleanText(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[–—]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
    }

    function compactText(value) {
      return cleanText(value)
        .replace(/[^a-z0-9]+/g, "");
    }

    function uniqueArray(arr) {
      return [...new Set(arr)];
    }

    // ============================================================
    // 2. TEAM IDENTITY
    // ============================================================

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

      if (n === "concepcion") {
        return "AMBIGUOUS_CONCEPCION";
      }

      return "UNKNOWN";
    }

    const detectedHomeIdentity =
      teamIdentity(homeInput);

    const detectedAwayIdentity =
      teamIdentity(awayInput);

    /*
     * Explicit V3.5 identity takes priority.
     */
    const requestedHomeIdentity =
      suppliedHomeIdentity || detectedHomeIdentity;

    const requestedAwayIdentity =
      suppliedAwayIdentity || detectedAwayIdentity;

    const VALID_IDENTITIES = [
      "DEPORTES_CONCEPCION",
      "UNIVERSIDAD_DE_CONCEPCION",
      "OHIGGINS"
    ];

    const homeIdentityValid =
      VALID_IDENTITIES.includes(requestedHomeIdentity);

    const awayIdentityValid =
      VALID_IDENTITIES.includes(requestedAwayIdentity);

    const homeIdentityIsAmbiguous =
      requestedHomeIdentity === "AMBIGUOUS_CONCEPCION";

    // ============================================================
    // 3. CANONICAL TEAM NAMES
    // ============================================================

    function canonicalTeamName(identity) {
      switch (identity) {
        case "DEPORTES_CONCEPCION":
          return "Deportes Concepcion";

        case "UNIVERSIDAD_DE_CONCEPCION":
          return "Universidad de Concepcion";

        case "OHIGGINS":
          return "O'Higgins";

        default:
          return "";
      }
    }

    const canonicalHome =
      canonicalTeamName(requestedHomeIdentity);

    const canonicalAway =
      canonicalTeamName(requestedAwayIdentity);

    // ============================================================
    // 4. FLATTEN SEARCH RESULTS
    // ============================================================

    const searches = Array.isArray(body.searches)
      ? body.searches
      : [];

    const results = [];

    for (const search of searches) {
      const type = String(
        search?.type || "unknown"
      );

      if (!Array.isArray(search?.results)) {
        continue;
      }

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
    // 5. SOURCE IDENTITY DETECTION
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
        text.includes("universidad-de-concepcion") ||
        text.includes("universidaddeconcepcion")
      ) {
        identities.add(
          "UNIVERSIDAD_DE_CONCEPCION"
        );
      }

      if (
        text.includes("deportes concepcion") ||
        text.includes("d concepcion") ||
        text.includes("d. concepcion") ||
        text.includes("deportes-concepcion") ||
        text.includes("deportesconcepcion")
      ) {
        identities.add(
          "DEPORTES_CONCEPCION"
        );
      }

      if (
        text.includes("ohiggins") ||
        text.includes("o higgins") ||
        text.includes("o-higgins")
      ) {
        identities.add("OHIGGINS");
      }

      return [...identities];
    }

    function hasIdentity(source, identity) {
      return sourceIdentities(source)
        .includes(identity);
    }

    // ============================================================
    // 6. TARGET DATE DETECTION
    // ============================================================

    function containsTargetDate(source) {
      const text = cleanText(
        `${source.title} ${source.snippet} ${source.url}`
      );

      const parts = matchDate.split("-");

      if (parts.length !== 3) {
        return false;
      }

      const year = parts[0];
      const month = parts[1];
      const day = parts[2];

      const monthNumber = Number(month);

      const monthNames = [
        "",
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

      const monthName =
        monthNames[monthNumber] || "";

      const slashDate =
        `${day}/${month}/${year}`;

      const slashDateNoLeadingZero =
        `${Number(day)}/${Number(month)}/${year}`;

      const isoDate =
        `${year}-${month}-${day}`;

      const isoDateShort =
        `${year}-${Number(month)}-${Number(day)}`;

      const writtenDate1 =
        `${day} ${monthName} ${year}`;

      const writtenDate2 =
        `${monthName} ${Number(day)} ${year}`;

      return (
        text.includes(isoDate) ||
        text.includes(isoDateShort) ||
        text.includes(slashDate) ||
        text.includes(slashDateNoLeadingZero) ||
        text.includes(writtenDate1) ||
        text.includes(writtenDate2)
      );
    }

    // ============================================================
    // 7. HISTORICAL DATE DETECTION
    // ============================================================

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
        text.includes("2026-07-26") ||
        text.includes("27 july 2026") ||
        text.includes("26 july 2026")
      );
    }

    function clearlyHistoricalBeforeTarget(source) {
      const text = cleanText(
        `${source.title} ${source.snippet} ${source.url}`
      );

      /*
       * Current fixture is 2026-09-30.
       *
       * This catches obvious historical references.
       * We deliberately do not reject every undated team page,
       * because many websites do not expose publication dates
       * in snippets.
       */

      const historicalPatterns = [
        "may 16 2026",
        "may 15 2026",
        "may 14 2026",
        "april 2026",
        "march 2026",
        "february 2026",
        "january 2026",
        "august 2026",
        "july 2026",
        "jun 2026",
        "june 2026"
      ];

      return historicalPatterns.some(
        pattern => text.includes(pattern)
      );
    }

    // ============================================================
    // 8. OPPONENT / FIXTURE DETECTION
    // ============================================================

    /*
     * A source is not automatically about the requested fixture
     * simply because both requested teams appear somewhere in
     * its text.
     *
     * Example:
     * "O'Higgins vs Boca Juniors ... Deportes Concepcion ..."
     *
     * contains both identities but is NOT our fixture.
     */

    function fixtureIdentityPair(source) {
      const text = cleanText(
        `${source.title} ${source.snippet}`
      );

      const homePatterns = [];

      if (
        requestedHomeIdentity ===
        "DEPORTES_CONCEPCION"
      ) {
        homePatterns.push(
          "deportes concepcion",
          "d concepcion",
          "d. concepcion",
          "deportes-concepcion",
          "deportesconcepcion"
        );
      }

      if (
        requestedHomeIdentity ===
        "UNIVERSIDAD_DE_CONCEPCION"
      ) {
        homePatterns.push(
          "universidad de concepcion",
          "u de concepcion",
          "u concepcion",
          "univ de concepcion",
          "univ. de concepcion",
          "universidad-de-concepcion",
          "universidaddeconcepcion"
        );
      }

      const awayPatterns = [];

      if (
        requestedAwayIdentity === "OHIGGINS"
      ) {
        awayPatterns.push(
          "ohiggins",
          "o higgins",
          "o-higgins"
        );
      }

      /*
       * We use title first because search titles usually
       * identify the actual fixture more clearly than snippets.
       */
      const titleText = cleanText(source.title);

      const homeInTitle =
        homePatterns.some(
          pattern => titleText.includes(pattern)
        );

      const awayInTitle =
        awayPatterns.some(
          pattern => titleText.includes(pattern)
        );

      const homeInBody =
        homePatterns.some(
          pattern => text.includes(pattern)
        );

      const awayInBody =
        awayPatterns.some(
          pattern => text.includes(pattern)
        );

      /*
       * Strongest evidence:
       * both requested teams appear in the title.
       */
      if (homeInTitle && awayInTitle) {
        return {
          match: true,
          strength: "TITLE_BOTH_TEAMS"
        };
      }

      /*
       * Second level:
       * both teams appear in source body and there is a
       * football fixture separator between them.
       */
      const pairPatterns = [];

      for (const hp of homePatterns) {
        for (const ap of awayPatterns) {
          pairPatterns.push(
            `${hp} vs ${ap}`,
            `${hp} v ${ap}`,
            `${hp} - ${ap}`,
            `${hp} – ${ap}`,
            `${ap} vs ${hp}`,
            `${ap} v ${hp}`,
            `${ap} - ${hp}`,
            `${ap} – ${hp}`
          );
        }
      }

      const explicitPair =
        pairPatterns.some(
          pattern => text.includes(pattern)
        );

      if (explicitPair) {
        return {
          match: true,
          strength: "EXPLICIT_FIXTURE_PAIR"
        };
      }

      /*
       * Merely mentioning both teams in a snippet is not enough.
       */
      if (homeInBody && awayInBody) {
        return {
          match: false,
          strength: "BOTH_MENTIONED_NOT_FIXTURE"
        };
      }

      return {
        match: false,
        strength: "NOT_BOTH_TEAMS"
      };
    }

    // ============================================================
    // 9. CATEGORY RELEVANCE
    // ============================================================

    function categoryRelevant(source) {
      const type = source.type;

      const fixture = fixtureIdentityPair(source);

      /*
       * H2H is allowed to be historical.
       */
      if (type === "h2h") {
        return (
          fixture.match ||
          (
            hasIdentity(
              source,
              requestedHomeIdentity
            ) &&
            hasIdentity(
              source,
              requestedAwayIdentity
            )
          )
        );
      }

      /*
       * Current fixture categories need stronger evidence.
       */
      if (
        type === "lineups" ||
        type === "odds"
      ) {
        return fixture.match;
      }

      /*
       * Injuries can sometimes be published as team news,
       * but only if the source clearly belongs to the requested
       * team and is not obviously a different fixture.
       */
      if (type === "injuries") {
        const ids = sourceIdentities(source);

        const hasRequestedTeam =
          ids.includes(requestedHomeIdentity) ||
          ids.includes(requestedAwayIdentity);

        if (!hasRequestedTeam) {
          return false;
        }

        if (
          clearlyHistoricalBeforeTarget(source) ||
          historicalJuly2026(source)
        ) {
          return false;
        }

        /*
         * If both teams are explicitly present but not as a
         * fixture pair, reject it.
         */
        if (
          ids.includes(requestedHomeIdentity) &&
          ids.includes(requestedAwayIdentity) &&
          !fixture.match
        ) {
          return false;
        }

        return true;
      }

      /*
       * Stats must have either explicit fixture evidence or
       * explicit team-specific statistical evidence.
       */
      if (type === "stats") {
        const ids = sourceIdentities(source);

        if (fixture.match) {
          return true;
        }

        /*
         * Team-specific stats pages may be useful, but a page
         * mentioning both teams without being the requested
         * fixture is not accepted.
         */
        if (
          ids.includes(requestedHomeIdentity) &&
          ids.includes(requestedAwayIdentity)
        ) {
          return false;
        }

        return ids.includes(requestedHomeIdentity) ||
               ids.includes(requestedAwayIdentity);
      }

      /*
       * Form is intentionally conservative.
       */
      if (type === "form") {
        const ids = sourceIdentities(source);

        if (
          ids.includes(requestedHomeIdentity) &&
          ids.includes(requestedAwayIdentity)
        ) {
          return fixture.match;
        }

        return (
          ids.includes(requestedHomeIdentity) ||
          ids.includes(requestedAwayIdentity)
        );
      }

      return false;
    }

    // ============================================================
    // 10. EVIDENCE ASSESSMENT
    // ============================================================

    function assessSource(source) {
      const ids = sourceIdentities(source);

      const fixture = fixtureIdentityPair(source);

      const dateMatch =
        containsTargetDate(source);

      const categoryOk =
        categoryRelevant(source);

      const isH2H =
        source.type === "h2h";

      /*
       * H2H:
       * historical target-vs-target matches are valid evidence.
       */
      let usable = false;

      if (isH2H) {
        usable =
          fixture.match ||
          (
            ids.includes(requestedHomeIdentity) &&
            ids.includes(requestedAwayIdentity)
          );
      } else {
        /*
         * Current fixture evidence:
         *
         * - explicit fixture pair is required for lineups/odds
         * - date evidence strengthens the source
         * - obvious historical fixture pages are rejected
         */
        if (
          historicalJuly2026(source) ||
          clearlyHistoricalBeforeTarget(source)
        ) {
          usable = false;
        } else {
          usable =
            categoryOk &&
            (
              fixture.match ||
              dateMatch ||
              source.type === "form" ||
              source.type === "injuries" ||
              source.type === "stats"
            );
        }
      }

      return {
        identities: ids,
        fixtureMatch: fixture.match,
        fixtureStrength: fixture.strength,
        dateMatch,
        categoryRelevant: categoryOk,
        usable
      };
    }

    // ============================================================
    // 11. CATEGORIZE RESULTS
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
    // 12. EVIDENCE MAP
    // ============================================================

    const assessedSources = results.map(source => {
      const assessment =
        assessSource(source);

      return {
        ...source,
        ...assessment
      };
    });

    function usableCategory(type) {
      return assessedSources.filter(
        source =>
          source.type === type &&
          source.usable
      );
    }

    // ============================================================
    // 13. H2H
    // ============================================================

    const h2h = usableCategory("h2h")
      .map(source => ({
        title: source.title,
        source: source.url,
        snippet: source.snippet,
        date: source.date,
        fixtureMatch: source.fixtureMatch,
        fixtureStrength: source.fixtureStrength
      }));

    // ============================================================
    // 14. FORM
    // ============================================================

    const form = {
      home: [],
      away: []
    };

    /*
     * V3.6 remains conservative here.
     *
     * We do NOT turn arbitrary scores into form.
     * Form extraction will be strengthened in a later stage
     * once fixture/evidence isolation is stable.
     */

    // ============================================================
    // 15. GOALS
    // ============================================================

    const goals = {
      home: {},
      away: {}
    };

    /*
     * No arbitrary score extraction.
     */

    // ============================================================
    // 16. xG
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

      if (!exists) {
        arr.push(item);
      }
    }

    for (const source of usableCategory("stats")) {
      const text =
        `${source.title} ${source.snippet}`;

      /*
       * Combined xG.
       */
      const combinedMatches = [
        ...text.matchAll(
          /(?:combined|total)\s*(?:xg|expected goals)?\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
        )
      ];

      for (const m of combinedMatches) {
        addUnique(
          xg.combined,
          {
            value: Number(m[1]),
            source: source.url,
            title: source.title
          }
        );
      }

      /*
       * Home xG.
       */
      const homePatterns = [
        "deportes concepcion",
        "universidad de concepcion",
        "u de concepcion"
      ];

      if (!homeIdentityIsAmbiguous) {
        for (const pattern of homePatterns) {
          if (
            requestedHomeIdentity ===
            "DEPORTES_CONCEPCION" &&
            !pattern.includes("deportes")
          ) {
            continue;
          }

          if (
            requestedHomeIdentity ===
            "UNIVERSIDAD_DE_CONCEPCION" &&
            !pattern.includes("universidad") &&
            !pattern.includes("u de")
          ) {
            continue;
          }

          const regex = new RegExp(
            pattern +
            "[^\\.\\n]{0,100}?" +
            "(\\d+(?:\\.\\d+)?)\\s*xg\\b",
            "i"
          );

          const matchHome =
            text.match(regex);

          if (matchHome) {
            addUnique(
              xg.home,
              {
                value: Number(matchHome[1]),
                source: source.url,
                title: source.title
              }
            );

            break;
          }
        }
      }

      /*
       * Away xG.
       */
      const awayMatch = text.match(
        /o['’]?higgins[^.\n]{0,100}?\b(\d+(?:\.\d+)?)\s*xg\b/i
      );

      if (awayMatch) {
        addUnique(
          xg.away,
          {
            value: Number(awayMatch[1]),
            source: source.url,
            title: source.title
          }
        );
      }
    }

    // ============================================================
    // 17. BTTS
    // ============================================================

    const btts = {
      home: null,
      away: null,
      evidence: []
    };

    for (const source of usableCategory("stats")) {
      const text = source.snippet;

      const matches = [
        ...text.matchAll(
          /both\s+teams\s+to\s+score\s+(yes|no)\s+(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (const m of matches) {
        btts.evidence.push({
          answer: m[1].toUpperCase(),
          percentage: Number(m[2]),
          source: source.url,
          title: source.title
        });
      }

      /*
       * Also support:
       * BTTS Yes 40%
       * BTTS: Yes 40%
       */
      const shortMatches = [
        ...text.matchAll(
          /\bbtts?\s*(?:is|:|-)?\s*(yes|no)\s*(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (const m of shortMatches) {
        btts.evidence.push({
          answer: m[1].toUpperCase(),
          percentage: Number(m[2]),
          source: source.url,
          title: source.title
        });
      }
    }

    // ============================================================
    // 18. OVER / UNDER
    // ============================================================

    const overUnder = {
      home: {},
      away: {},
      evidence: []
    };

    for (const source of usableCategory("stats")) {
      const text = source.snippet;

      const matches = [
        ...text.matchAll(
          /\b(over|under)\s+(\d+(?:\.\d+)?)\s*(?:goals?)?\s*(?:[:\-]?\s*)?(\d+(?:\.\d+)?)%/gi
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
    // 19. INJURIES
    // ============================================================

    const injuries = {
      home: [],
      away: []
    };

    for (const source of usableCategory("injuries")) {
      const text = source.snippet;

      if (
        homeIdentityValid &&
        hasIdentity(
          source,
          requestedHomeIdentity
        )
      ) {
        injuries.home.push({
          team: requestedHomeIdentity,
          text,
          source: source.url,
          title: source.title,
          date: source.date,
          fixtureMatch: source.fixtureMatch,
          dateMatch: source.dateMatch
        });
      }

      if (
        awayIdentityValid &&
        hasIdentity(
          source,
          requestedAwayIdentity
        )
      ) {
        injuries.away.push({
          team: requestedAwayIdentity,
          text,
          source: source.url,
          title: source.title,
          date: source.date,
          fixtureMatch: source.fixtureMatch,
          dateMatch: source.dateMatch
        });
      }
    }

    // ============================================================
    // 20. LINEUPS
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
        text.includes("possible starting xi") ||
        text.includes("probable lineup") ||
        text.includes("expected lineup")
      ) {
        return "predicted";
      }

      if (
        text.includes("confirmed lineup") ||
        text.includes("confirmed lineups") ||
        text.includes("starting xi confirmed") ||
        text.includes("official lineup")
      ) {
        return "confirmed";
      }

      if (
        text.includes("lineups") ||
        text.includes("starting xi")
      ) {
        return "unknown";
      }

      return "unknown";
    }

    for (const source of usableCategory("lineups")) {
      const type = lineupType(source);

      if (
        homeIdentityValid &&
        hasIdentity(
          source,
          requestedHomeIdentity
        )
      ) {
        lineups.home.push({
          type,
          title: source.title,
          source: source.url,
          snippet: source.snippet,
          date: source.date,
          fixtureMatch: source.fixtureMatch,
          dateMatch: source.dateMatch
        });
      }

      if (
        awayIdentityValid &&
        hasIdentity(
          source,
          requestedAwayIdentity
        )
      ) {
        lineups.away.push({
          type,
          title: source.title,
          source: source.url,
          snippet: source.snippet,
          date: source.date,
          fixtureMatch: source.fixtureMatch,
          dateMatch: source.dateMatch
        });
      }
    }

    /*
     * Never let obvious historical July fixtures become current
     * lineups.
     */
    for (const side of ["home", "away"]) {
      lineups[side] =
        lineups[side].filter(item => {
          return !historicalJuly2026({
            title: item.title,
            snippet: item.snippet,
            url: item.source
          });
        });
    }

    // ============================================================
    // 21. ODDS / PROBABILITIES
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

    for (const source of usableCategory("odds")) {
      const text = source.snippet;

      /*
       * Probability is NOT odds.
       */
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
          title: source.title,
          fixtureMatch: source.fixtureMatch,
          dateMatch: source.dateMatch
        });
      }

      /*
       * Decimal odds only when explicitly labelled.
       */
      const explicitOdds = [
        ...text.matchAll(
          /\bodds?\s*(?:of|:)\s*(\d+(?:\.\d+)?)/gi
        )
      ];

      for (const m of explicitOdds) {
        const value = Number(m[1]);

        /*
         * Reject obviously impossible/irrelevant values.
         * This is NOT a betting recommendation; it is only
         * data hygiene.
         */
        if (value >= 1.01 && value <= 100) {
          odds.evidence.push({
            type: "decimal_odds",
            value,
            source: source.url,
            title: source.title,
            fixtureMatch: source.fixtureMatch,
            dateMatch: source.dateMatch
          });
        }
      }
    }

    // ============================================================
    // 22. SOURCE REPORT
    // ============================================================

    const sources =
      assessedSources.map(source => ({
        type: source.type,
        title: source.title,
        url: source.url,
        snippet: source.snippet,
        date: source.date,
        position: source.position,

        identities: source.identities,

        fixtureMatch: source.fixtureMatch,
        fixtureStrength: source.fixtureStrength,
        dateMatch: source.dateMatch,
        categoryRelevant: source.categoryRelevant,
        usable: source.usable
      }));

    // ============================================================
    // 23. CONTAMINATION DETECTION
    // ============================================================

    const contaminationDetected =
      results.some(source => {
        const ids =
          sourceIdentities(source);

        return (
          ids.includes(
            "DEPORTES_CONCEPCION"
          ) &&
          ids.includes(
            "UNIVERSIDAD_DE_CONCEPCION"
          )
        );
      });

    const wrongFixtureDetected =
      results.some(source => {
        const assessment =
          assessSource(source);

        return (
          assessment.fixtureMatch === false &&
          sourceIdentities(source)
            .includes(requestedHomeIdentity) &&
          sourceIdentities(source)
            .includes(requestedAwayIdentity)
        );
      });

    // ============================================================
    // 24. IDENTITY REPORT
    // ============================================================

    const identity = {
      requested: {
        home: homeInput,
        homeIdentity: requestedHomeIdentity,
        away: awayInput,
        awayIdentity: requestedAwayIdentity
      },

      resolved: {
        home: requestedHomeIdentity,
        away: requestedAwayIdentity
      },

      canonical: {
        home: canonicalHome,
        away: canonicalAway
      },

      homeStatus:
        homeIdentityIsAmbiguous
          ? "AMBIGUOUS"
          : homeIdentityValid
            ? "RESOLVED"
            : "UNKNOWN",

      awayStatus:
        awayIdentityValid
          ? "RESOLVED"
          : "UNKNOWN",

      contaminationDetected,

      wrongFixtureDetected,

      separateConcepcionIdentities: true
    };

    // ============================================================
    // 25. DATA AVAILABILITY
    // ============================================================

    const dataAvailability = {
      identity:
        identity.homeStatus === "RESOLVED" &&
        identity.awayStatus === "RESOLVED",

      form:
        form.home.length > 0 ||
        form.away.length > 0,

      h2h:
        h2h.length > 0,

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

    // ============================================================
    // 26. QUALITY METRICS
    // ============================================================

    const usableSources =
      assessedSources.filter(
        source => source.usable
      );

    const fixtureSources =
      assessedSources.filter(
        source => source.fixtureMatch
      );

    const currentDateSources =
      assessedSources.filter(
        source => source.dateMatch
      );

    const quality = {
      sourceCount: results.length,

      usableSourceCount:
        usableSources.length,

      fixtureSourceCount:
        fixtureSources.length,

      targetDateSourceCount:
        currentDateSources.length,

      contaminatedSourceCount:
        assessedSources.filter(
          source =>
            source.identities.includes(
              "DEPORTES_CONCEPCION"
            ) &&
            source.identities.includes(
              "UNIVERSIDAD_DE_CONCEPCION"
            )
        ).length,

      usableText:
        results.length > 0,

      score:
        results.length > 0
          ? Number(
              Math.min(
                1,
                usableSources.length /
                Math.max(
                  1,
                  results.length
                )
              ).toFixed(2)
            )
          : 0
    };

    // ============================================================
    // 27. WARNINGS
    // ============================================================

    const warnings = [];

    if (
      identity.homeStatus ===
      "AMBIGUOUS"
    ) {
      warnings.push(
        "Home team identity is ambiguous."
      );
    }

    if (
      identity.homeStatus ===
      "UNKNOWN"
    ) {
      warnings.push(
        "Home team identity could not be resolved."
      );
    }

    if (
      identity.awayStatus ===
      "UNKNOWN"
    ) {
      warnings.push(
        "Away team identity could not be resolved."
      );
    }

    if (!dataAvailability.form) {
      warnings.push(
        "Reliable current form was not extracted."
      );
    }

    if (!dataAvailability.stats) {
      warnings.push(
        "No reliable current statistical evidence was extracted."
      );
    }

    if (
      identity.wrongFixtureDetected
    ) {
      warnings.push(
        "Some search results mention both teams but refer to a different fixture; those sources were excluded from current-fixture evidence."
      );
    }

    if (
      identity.contaminationDetected
    ) {
      warnings.push(
        "Universidad de Concepcion and Deportes Concepcion appeared in the raw search results and remain separate identities."
      );
    }

    if (!dataAvailability.injuries) {
      warnings.push(
        "No reliable current injury/suspension evidence was extracted."
      );
    }

    if (!dataAvailability.lineups) {
      warnings.push(
        "No reliable current lineup evidence was extracted."
      );
    }

    if (!dataAvailability.odds) {
      warnings.push(
        "No reliable current odds evidence was extracted."
      );
    }

    warnings.push(
      "H2H is isolated from current-form calculations."
    );

    warnings.push(
      "Predicted lineups are not treated as confirmed lineups."
    );

    warnings.push(
      "Probabilities are kept separate from decimal odds."
    );

    warnings.push(
      "Missing statistics are not guessed."
    );

    // ============================================================
    // 28. READINESS GATES
    // ============================================================

    /*
     * Identity readiness:
     * both teams must be unambiguous.
     */
    const identityReady =
      identity.homeStatus === "RESOLVED" &&
      identity.awayStatus === "RESOLVED";

    /*
     * Data readiness:
     * We require at least H2H plus some current evidence.
     *
     * This deliberately does NOT require every category.
     */
    const currentEvidenceAvailable =
      dataAvailability.form ||
      dataAvailability.stats ||
      dataAvailability.injuries ||
      dataAvailability.lineups ||
      dataAvailability.odds;

    const dataReady =
      identityReady &&
      currentEvidenceAvailable;

    /*
     * Analysis readiness is intentionally stricter.
     *
     * For the current V3.6 stage, do not claim that the dataset
     * is analysis-ready when reliable current form and stats
     * are both absent.
     */
    const analysisReady =
      identityReady &&
      dataAvailability.form &&
      dataAvailability.stats;

    // ============================================================
    // 29. FINAL RESPONSE
    // ============================================================

    return res.status(200).json({
      success: true,
      version: "V3.6",

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

        rawTextLength:
          JSON.stringify(body).length
      },

      quality,

      dataAvailability,

      readiness: {
        identityReady,
        dataReady,
        analysisReady
      },

      /*
       * Keep the old top-level field for compatibility with
       * the existing frontend.
       */
      analysisReady,

      warnings
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      version: "V3.6",
      error: "Web data normalization failed.",
      details:
        error?.message ||
        String(error)
    });
  }
}
