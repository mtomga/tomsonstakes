export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        version: "V3.7",
        error: "POST method required."
      });
    }

    const body = req.body || {};
    const match = body.match || {};

    const homeInput = String(match.home || "").trim();
    const awayInput = String(match.away || "").trim();
    const matchDate = String(match.date || "").trim();

    const suppliedHomeIdentity =
      String(match.homeIdentity || "").trim();

    const suppliedAwayIdentity =
      String(match.awayIdentity || "").trim();

    if (!homeInput || !awayInput || !matchDate) {
      return res.status(400).json({
        success: false,
        version: "V3.7",
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
    // 6. DATE HELPERS
    // ============================================================

    function parseTargetDate() {
      const parts = matchDate.split("-");

      if (parts.length !== 3) {
        return null;
      }

      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);

      if (
        !year ||
        !month ||
        !day ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
      ) {
        return null;
      }

      return {
        year,
        month,
        day
      };
    }

    const targetDate =
      parseTargetDate();

    function monthName(monthNumber) {
      const names = [
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

      return names[monthNumber] || "";
    }

    function targetDateVariants() {
      if (!targetDate) {
        return [];
      }

      const {
        year,
        month,
        day
      } = targetDate;

      const monthPadded =
        String(month).padStart(2, "0");

      const dayPadded =
        String(day).padStart(2, "0");

      const monthText =
        monthName(month);

      return uniqueArray([
        `${year}-${monthPadded}-${dayPadded}`,
        `${year}-${month}-${day}`,
        `${dayPadded}/${monthPadded}/${year}`,
        `${day}/${month}/${year}`,
        `${dayPadded}-${monthPadded}-${year}`,
        `${day}-${month}-${year}`,
        `${dayPadded} ${monthText} ${year}`,
        `${day} ${monthText} ${year}`,
        `${monthText} ${dayPadded} ${year}`,
        `${monthText} ${day} ${year}`
      ]);
    }

    /*
     * A match scheduled for Sep 30 local time can appear as
     * Oct 1 in UTC-based websites.
     *
     * We therefore permit the immediately following calendar
     * date ONLY as a date representation of the same fixture,
     * and ONLY when the source also clearly contains the
     * requested fixture pair.
     */
    function nextCalendarDate() {
      if (!targetDate) {
        return null;
      }

      const d = new Date(
        Date.UTC(
          targetDate.year,
          targetDate.month - 1,
          targetDate.day
        )
      );

      d.setUTCDate(
        d.getUTCDate() + 1
      );

      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate()
      };
    }

    function dateVariantsFor(
      year,
      month,
      day
    ) {
      const paddedMonth =
        String(month).padStart(2, "0");

      const paddedDay =
        String(day).padStart(2, "0");

      const textMonth =
        monthName(month);

      return [
        `${year}-${paddedMonth}-${paddedDay}`,
        `${year}-${month}-${day}`,
        `${paddedDay}/${paddedMonth}/${year}`,
        `${day}/${month}/${year}`,
        `${paddedDay}-${paddedMonth}-${year}`,
        `${day}-${month}-${year}`,
        `${paddedDay} ${textMonth} ${year}`,
        `${day} ${textMonth} ${year}`,
        `${textMonth} ${paddedDay} ${year}`,
        `${textMonth} ${day} ${year}`
      ];
    }

    function containsAnyDate(
      text,
      variants
    ) {
      const normalized =
        cleanText(text);

      return variants.some(
        variant =>
          normalized.includes(
            cleanText(variant)
          )
      );
    }

    function containsTargetDate(source) {
      if (!targetDate) {
        return false;
      }

      const text = `
        ${source.title}
        ${source.snippet}
        ${source.url}
        ${source.date || ""}
      `;

      return containsAnyDate(
        text,
        targetDateVariants()
      );
    }

    function containsUTCNextDayDate(source) {
      if (!targetDate) {
        return false;
      }

      const nextDate =
        nextCalendarDate();

      if (!nextDate) {
        return false;
      }

      const variants =
        dateVariantsFor(
          nextDate.year,
          nextDate.month,
          nextDate.day
        );

      const text = `
        ${source.title}
        ${source.snippet}
        ${source.url}
        ${source.date || ""}
      `;

      return containsAnyDate(
        text,
        variants
      );
    }

    /*
     * True only when the source explicitly exposes the target
     * date or the immediate UTC-next-day representation.
     */
    function dateMatchForSource(source) {
      return (
        containsTargetDate(source) ||
        containsUTCNextDayDate(source)
      );
    }

    // ============================================================
    // 7. HISTORICAL DATE DETECTION
    // ============================================================

    function historicalJuly2026(source) {
      const text = cleanText(`
        ${source.title}
        ${source.snippet}
        ${source.url}
        ${source.date || ""}
      `);

      return (
        text.includes("27.07.2026") ||
        text.includes("26.07.2026") ||
        text.includes("25.07.2026") ||
        text.includes("jul 27 2026") ||
        text.includes("jul 26 2026") ||
        text.includes("jul 25 2026") ||
        text.includes("july 27 2026") ||
        text.includes("july 26 2026") ||
        text.includes("july 25 2026") ||
        text.includes("2026-07-27") ||
        text.includes("2026-07-26") ||
        text.includes("2026-07-25") ||
        text.includes("27 july 2026") ||
        text.includes("26 july 2026") ||
        text.includes("25 july 2026")
      );
    }

    function clearlyHistoricalBeforeTarget(source) {
      const text = cleanText(`
        ${source.title}
        ${source.snippet}
        ${source.url}
        ${source.date || ""}
      `);

      /*
       * Current fixture = 30 September 2026.
       *
       * These are clear examples of dates before the target.
       * We do not reject every undated page because many
       * football sites omit publication dates.
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
        pattern =>
          text.includes(pattern)
      );
    }

    function obviousHistoricalFixture(source) {
      return (
        historicalJuly2026(source) ||
        clearlyHistoricalBeforeTarget(source)
      );
    }

    // ============================================================
    // 8. OPPONENT / FIXTURE DETECTION
    // ============================================================

    function requestedTeamPatterns(identity) {
      if (
        identity ===
        "DEPORTES_CONCEPCION"
      ) {
        return [
          "deportes concepcion",
          "d concepcion",
          "d. concepcion",
          "deportes-concepcion",
          "deportesconcepcion"
        ];
      }

      if (
        identity ===
        "UNIVERSIDAD_DE_CONCEPCION"
      ) {
        return [
          "universidad de concepcion",
          "u de concepcion",
          "u concepcion",
          "univ de concepcion",
          "univ. de concepcion",
          "universidad-de-concepcion",
          "universidaddeconcepcion"
        ];
      }

      if (
        identity === "OHIGGINS"
      ) {
        return [
          "ohiggins",
          "o higgins",
          "o-higgins"
        ];
      }

      return [];
    }

    function fixtureIdentityPair(source) {
      const bodyText =
        cleanText(`
          ${source.title}
          ${source.snippet}
          ${source.url}
        `);

      const titleText =
        cleanText(source.title);

      const homePatterns =
        requestedTeamPatterns(
          requestedHomeIdentity
        );

      const awayPatterns =
        requestedTeamPatterns(
          requestedAwayIdentity
        );

      const homeInTitle =
        homePatterns.some(
          pattern =>
            titleText.includes(pattern)
        );

      const awayInTitle =
        awayPatterns.some(
          pattern =>
            titleText.includes(pattern)
        );

      const homeInBody =
        homePatterns.some(
          pattern =>
            bodyText.includes(pattern)
        );

      const awayInBody =
        awayPatterns.some(
          pattern =>
            bodyText.includes(pattern)
        );

      /*
       * Strongest evidence:
       * both requested teams in the title.
       */
      if (
        homeInTitle &&
        awayInTitle
      ) {
        return {
          match: true,
          strength: "TITLE_BOTH_TEAMS"
        };
      }

      /*
       * Explicit fixture separators.
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
          pattern =>
            bodyText.includes(pattern)
        );

      if (explicitPair) {
        return {
          match: true,
          strength: "EXPLICIT_FIXTURE_PAIR"
        };
      }

      /*
       * A source that contains both teams but no fixture relationship
       * is deliberately NOT accepted.
       */
      if (
        homeInBody &&
        awayInBody
      ) {
        return {
          match: false,
          strength:
            "BOTH_MENTIONED_NOT_FIXTURE"
        };
      }

      return {
        match: false,
        strength:
          "NOT_BOTH_TEAMS"
      };
    }

    // ============================================================
    // 9. CATEGORY RELEVANCE
    // ============================================================

    function categoryRelevant(source) {
      const type = source.type;

      const fixture =
        fixtureIdentityPair(source);

      const ids =
        sourceIdentities(source);

      const dateMatch =
        dateMatchForSource(source);

      /*
       * ----------------------------------------------------------
       * H2H
       * ----------------------------------------------------------
       *
       * Historical target-vs-target meetings are valid.
       */
      if (type === "h2h") {
        return (
          fixture.match ||
          (
            ids.includes(
              requestedHomeIdentity
            ) &&
            ids.includes(
              requestedAwayIdentity
            )
          )
        );
      }

      /*
       * ----------------------------------------------------------
       * LINEUPS
       * ----------------------------------------------------------
       *
       * Current lineups require exact fixture evidence.
       */
      if (type === "lineups") {
        return (
          fixture.match &&
          (
            dateMatch ||
            !obviousHistoricalFixture(source)
          )
        );
      }

      /*
       * ----------------------------------------------------------
       * ODDS
       * ----------------------------------------------------------
       *
       * Odds must belong to the current requested fixture.
       *
       * We prefer an explicit target date. However, some odds
       * pages omit the date while their title clearly identifies
       * the upcoming fixture.
       */
      if (type === "odds") {
        if (!fixture.match) {
          return false;
        }

        if (obviousHistoricalFixture(source)) {
          return false;
        }

        return true;
      }

      /*
       * ----------------------------------------------------------
       * INJURIES
       * ----------------------------------------------------------
       *
       * Team-specific current injury news is acceptable if:
       * - it identifies one requested team;
       * - it is not obviously historical;
       * - it does not describe a different fixture when both teams
       *   appear.
       */
      if (type === "injuries") {
        const hasHome =
          ids.includes(
            requestedHomeIdentity
          );

        const hasAway =
          ids.includes(
            requestedAwayIdentity
          );

        if (!hasHome && !hasAway) {
          return false;
        }

        if (
          obviousHistoricalFixture(source)
        ) {
          return false;
        }

        if (
          hasHome &&
          hasAway &&
          !fixture.match
        ) {
          return false;
        }

        /*
         * Exact current fixture is always acceptable.
         */
        if (
          fixture.match &&
          (
            dateMatch ||
            !obviousHistoricalFixture(source)
          )
        ) {
          return true;
        }

        /*
         * Team-only injury page can still be useful.
         * We deliberately keep it separate from fixture evidence.
         */
        if (
          hasHome !== hasAway
        ) {
          return true;
        }

        return false;
      }

      /*
       * ----------------------------------------------------------
       * STATS
       * ----------------------------------------------------------
       */
      if (type === "stats") {
        if (
          obviousHistoricalFixture(source)
        ) {
          return false;
        }

        /*
         * Exact fixture.
         */
        if (fixture.match) {
          return true;
        }

        /*
         * Team-specific stats page.
         *
         * If both teams appear but are not an explicit fixture,
         * reject it to prevent cross-fixture contamination.
         */
        const hasHome =
          ids.includes(
            requestedHomeIdentity
          );

        const hasAway =
          ids.includes(
            requestedAwayIdentity
          );

        if (
          hasHome &&
          hasAway
        ) {
          return false;
        }

        return hasHome || hasAway;
      }

      /*
       * ----------------------------------------------------------
       * FORM
       * ----------------------------------------------------------
       *
       * Form is team-specific evidence, not necessarily an exact
       * fixture page.
       */
      if (type === "form") {
        if (
          obviousHistoricalFixture(source)
        ) {
          return false;
        }

        const hasHome =
          ids.includes(
            requestedHomeIdentity
          );

        const hasAway =
          ids.includes(
            requestedAwayIdentity
          );

        /*
         * If both are mentioned without an explicit fixture,
         * reject it.
         */
        if (
          hasHome &&
          hasAway &&
          !fixture.match
        ) {
          return false;
        }

        return hasHome || hasAway;
      }

      return false;
    }

    // ============================================================
    // 10. EVIDENCE ASSESSMENT
    // ============================================================

    function assessSource(source) {
      const ids =
        sourceIdentities(source);

      const fixture =
        fixtureIdentityPair(source);

      const dateMatch =
        dateMatchForSource(source);

      const categoryOk =
        categoryRelevant(source);

      const isH2H =
        source.type === "h2h";

      let usable = false;
      let currentFixtureUsable = false;

      /*
       * ----------------------------------------------------------
       * H2H
       * ----------------------------------------------------------
       *
       * Historical target-vs-target evidence is deliberately
       * usable, but NOT current-fixture evidence.
       */
      if (isH2H) {
        usable =
          categoryOk;

        currentFixtureUsable =
          fixture.match &&
          dateMatch &&
          !obviousHistoricalFixture(source);
      } else {
        /*
         * Current categories.
         */
        usable =
          categoryOk;

        /*
         * Current-fixture evidence is stricter.
         */
        if (
          categoryOk &&
          fixture.match &&
          !obviousHistoricalFixture(source)
        ) {
          /*
           * Exact fixture pages are current-fixture evidence
           * when they have the target date OR appear to describe
           * an undated upcoming/current fixture.
           */
          currentFixtureUsable =
            dateMatch ||
            source.type === "lineups" ||
            source.type === "odds" ||
            source.type === "injuries" ||
            source.type === "stats";
        }

        /*
         * Team-only form/stats/injury evidence is useful,
         * but should NOT be counted as exact fixture evidence.
         */
        if (
          categoryOk &&
          !fixture.match
        ) {
          currentFixtureUsable = false;
        }
      }

      /*
       * Obvious historical current-category evidence is never
       * allowed into currentFixtureUsable.
       */
      if (
        !isH2H &&
        obviousHistoricalFixture(source)
      ) {
        currentFixtureUsable = false;

        /*
         * For current categories, historical evidence should
         * also not be treated as usable.
         */
        usable = false;
      }

      return {
        identities: ids,

        fixtureMatch:
          fixture.match,

        fixtureStrength:
          fixture.strength,

        dateMatch,

        utcNextDayMatch:
          !dateMatch &&
          containsUTCNextDayDate(source),

        categoryRelevant:
          categoryOk,

        usable,

        currentFixtureUsable
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
      if (
        categorized[source.type]
      ) {
        categorized[source.type].push(
          source
        );
      }
    }

    // ============================================================
    // 12. EVIDENCE MAP
    // ============================================================

    const assessedSources =
      results.map(source => {
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

    function currentFixtureCategory(type) {
      return assessedSources.filter(
        source =>
          source.type === type &&
          source.currentFixtureUsable
      );
    }

    // ============================================================
    // 13. H2H
    // ============================================================

    const h2h =
      usableCategory("h2h")
        .map(source => ({
          title: source.title,
          source: source.url,
          snippet: source.snippet,
          date: source.date,
          fixtureMatch:
            source.fixtureMatch,
          fixtureStrength:
            source.fixtureStrength,
          dateMatch:
            source.dateMatch
        }));

    // ============================================================
    // 14. FORM
    // ============================================================

    const form = {
      home: [],
      away: []
    };

    /*
     * Still intentionally conservative.
     *
     * We are not yet converting arbitrary search snippets into
     * W/D/L records. That will be V3.8.
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
      const exists =
        arr.some(
          x =>
            x.value === item.value &&
            x.source === item.source
        );

      if (!exists) {
        arr.push(item);
      }
    }

    /*
     * Only CURRENT-FIXTURE stats are allowed here.
     */
    for (
      const source of
      currentFixtureCategory("stats")
    ) {
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

      for (
        const m of combinedMatches
      ) {
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
      const homePatterns =
        requestedHomeIdentity ===
        "DEPORTES_CONCEPCION"
          ? [
              "deportes concepcion"
            ]
          : requestedHomeIdentity ===
            "UNIVERSIDAD_DE_CONCEPCION"
            ? [
                "universidad de concepcion",
                "u de concepcion",
                "u concepcion"
              ]
            : [];

      for (
        const pattern of homePatterns
      ) {
        const regex =
          new RegExp(
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
              value:
                Number(matchHome[1]),
              source: source.url,
              title: source.title
            }
          );

          break;
        }
      }

      /*
       * Away xG.
       */
      const awayMatch =
        text.match(
          /o['’]?higgins[^.\n]{0,100}?\b(\d+(?:\.\d+)?)\s*xg\b/i
        );

      if (awayMatch) {
        addUnique(
          xg.away,
          {
            value:
              Number(awayMatch[1]),
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

    for (
      const source of
      currentFixtureCategory("stats")
    ) {
      const text =
        source.snippet;

      const matches = [
        ...text.matchAll(
          /both\s+teams\s+to\s+score\s+(yes|no)\s+(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (
        const m of matches
      ) {
        btts.evidence.push({
          answer:
            m[1].toUpperCase(),
          percentage:
            Number(m[2]),
          source:
            source.url,
          title:
            source.title
        });
      }

      const shortMatches = [
        ...text.matchAll(
          /\bbtts?\s*(?:is|:|-)?\s*(yes|no)\s*(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (
        const m of shortMatches
      ) {
        btts.evidence.push({
          answer:
            m[1].toUpperCase(),
          percentage:
            Number(m[2]),
          source:
            source.url,
          title:
            source.title
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

    for (
      const source of
      currentFixtureCategory("stats")
    ) {
      const text =
        source.snippet;

      const matches = [
        ...text.matchAll(
          /\b(over|under)\s+(\d+(?:\.\d+)?)\s*(?:goals?)?\s*(?:[:\-]?\s*)?(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (
        const m of matches
      ) {
        overUnder.evidence.push({
          selection:
            `${m[1].toUpperCase()} ${m[2]}`,
          percentage:
            Number(m[3]),
          source:
            source.url,
          title:
            source.title
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

    /*
     * IMPORTANT:
     * Only current-fixture injury evidence OR clearly current
     * team-specific injury evidence is allowed.
     *
     * Old May/August/July fixture pages are filtered out.
     */
    for (
      const source of
      usableCategory("injuries")
    ) {
      const text =
        source.snippet;

      if (
        homeIdentityValid &&
        hasIdentity(
          source,
          requestedHomeIdentity
        )
      ) {
        injuries.home.push({
          team:
            requestedHomeIdentity,
          text,
          source:
            source.url,
          title:
            source.title,
          date:
            source.date,
          fixtureMatch:
            source.fixtureMatch,
          dateMatch:
            source.dateMatch,
          currentFixtureUsable:
            source.currentFixtureUsable
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
          team:
            requestedAwayIdentity,
          text,
          source:
            source.url,
          title:
            source.title,
          date:
            source.date,
          fixtureMatch:
            source.fixtureMatch,
          dateMatch:
            source.dateMatch,
          currentFixtureUsable:
            source.currentFixtureUsable
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
      const text =
        cleanText(`
          ${source.title}
          ${source.snippet}
        `);

      if (
        text.includes(
          "predicted lineup"
        ) ||
        text.includes(
          "predicted lineups"
        ) ||
        text.includes(
          "predicted xi"
        ) ||
        text.includes(
          "possible starting xi"
        ) ||
        text.includes(
          "probable lineup"
        ) ||
        text.includes(
          "expected lineup"
        )
      ) {
        return "predicted";
      }

      if (
        text.includes(
          "confirmed lineup"
        ) ||
        text.includes(
          "confirmed lineups"
        ) ||
        text.includes(
          "starting xi confirmed"
        ) ||
        text.includes(
          "official lineup"
        )
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

    /*
     * Only CURRENT-FIXTURE lineups.
     */
    for (
      const source of
      currentFixtureCategory("lineups")
    ) {
      const type =
        lineupType(source);

      if (
        homeIdentityValid &&
        hasIdentity(
          source,
          requestedHomeIdentity
        )
      ) {
        lineups.home.push({
          type,
          title:
            source.title,
          source:
            source.url,
          snippet:
            source.snippet,
          date:
            source.date,
          fixtureMatch:
            source.fixtureMatch,
          dateMatch:
            source.dateMatch,
          currentFixtureUsable:
            source.currentFixtureUsable
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
          title:
            source.title,
          source:
            source.url,
          snippet:
            source.snippet,
          date:
            source.date,
          fixtureMatch:
            source.fixtureMatch,
          dateMatch:
            source.dateMatch,
          currentFixtureUsable:
            source.currentFixtureUsable
        });
      }
    }

    /*
     * Safety filter:
     * historical July material can NEVER become current lineups.
     */
    for (
      const side of ["home", "away"]
    ) {
      lineups[side] =
        lineups[side].filter(
          item => {
            return !historicalJuly2026({
              title:
                item.title,
              snippet:
                item.snippet,
              url:
                item.source,
              date:
                item.date
            });
          }
        );
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

    /*
     * Only CURRENT-FIXTURE odds.
     */
    for (
      const source of
      currentFixtureCategory("odds")
    ) {
      const text =
        source.snippet;

      /*
       * Probability is NOT odds.
       */
      const probabilityMatches = [
        ...text.matchAll(
          /probability\s*[:\-]?\s*(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (
        const m of
        probabilityMatches
      ) {
        odds.evidence.push({
          type:
            "probability",
          percentage:
            Number(m[1]),
          source:
            source.url,
          title:
            source.title,
          fixtureMatch:
            source.fixtureMatch,
          dateMatch:
            source.dateMatch,
          currentFixtureUsable:
            source.currentFixtureUsable
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

      for (
        const m of explicitOdds
      ) {
        const value =
          Number(m[1]);

        if (
          value >= 1.01 &&
          value <= 100
        ) {
          odds.evidence.push({
            type:
              "decimal_odds",
            value,
            source:
              source.url,
            title:
              source.title,
            fixtureMatch:
              source.fixtureMatch,
            dateMatch:
              source.dateMatch,
            currentFixtureUsable:
              source.currentFixtureUsable
          });
        }
      }
    }

    // ============================================================
    // 22. SOURCE REPORT
    // ============================================================

    const sources =
      assessedSources.map(
        source => ({
          type:
            source.type,
          title:
            source.title,
          url:
            source.url,
          snippet:
            source.snippet,
          date:
            source.date,
          position:
            source.position,

          identities:
            source.identities,

          fixtureMatch:
            source.fixtureMatch,

          fixtureStrength:
            source.fixtureStrength,

          dateMatch:
            source.dateMatch,

          utcNextDayMatch:
            source.utcNextDayMatch,

          categoryRelevant:
            source.categoryRelevant,

          usable:
            source.usable,

          currentFixtureUsable:
            source.currentFixtureUsable
        })
      );

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
            .includes(
              requestedHomeIdentity
            ) &&
          sourceIdentities(source)
            .includes(
              requestedAwayIdentity
            )
        );
      });

    // ============================================================
    // 24. IDENTITY REPORT
    // ============================================================

    const identity = {
      requested: {
        home:
          homeInput,
        homeIdentity:
          requestedHomeIdentity,
        away:
          awayInput,
        awayIdentity:
          requestedAwayIdentity
      },

      resolved: {
        home:
          requestedHomeIdentity,
        away:
          requestedAwayIdentity
      },

      canonical: {
        home:
          canonicalHome,
        away:
          canonicalAway
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

      separateConcepcionIdentities:
        true
    };

    // ============================================================
    // 25. DATA AVAILABILITY
    // ============================================================

    const dataAvailability = {
      identity:
        identity.homeStatus ===
          "RESOLVED" &&
        identity.awayStatus ===
          "RESOLVED",

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
    // 26. CURRENT FIXTURE DATA AVAILABILITY
    // ============================================================

    const currentFixtureAvailability = {
      form:
        currentFixtureCategory(
          "form"
        ).length > 0,

      stats:
        currentFixtureCategory(
          "stats"
        ).length > 0,

      injuries:
        currentFixtureCategory(
          "injuries"
        ).length > 0,

      lineups:
        currentFixtureCategory(
          "lineups"
        ).length > 0,

      odds:
        currentFixtureCategory(
          "odds"
        ).length > 0,

      h2h:
        usableCategory(
          "h2h"
        ).length > 0
    };

    // ============================================================
    // 27. QUALITY METRICS
    // ============================================================

    const usableSources =
      assessedSources.filter(
        source =>
          source.usable
      );

    const currentFixtureSources =
      assessedSources.filter(
        source =>
          source.currentFixtureUsable
      );

    const fixtureSources =
      assessedSources.filter(
        source =>
          source.fixtureMatch
      );

    const currentDateSources =
      assessedSources.filter(
        source =>
          source.dateMatch
      );

    const quality = {
      sourceCount:
        results.length,

      usableSourceCount:
        usableSources.length,

      currentFixtureSourceCount:
        currentFixtureSources.length,

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
                currentFixtureSources.length /
                Math.max(
                  1,
                  results.length
                )
              ).toFixed(2)
            )
          : 0
    };

    // ============================================================
    // 28. WARNINGS
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
      "Historical target-vs-target matches are retained only as H2H evidence."
    );

    warnings.push(
      "Current-fixture evidence is separated from historical evidence."
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
    // 29. READINESS GATES
    // ============================================================

    const identityReady =
      identity.homeStatus ===
        "RESOLVED" &&
      identity.awayStatus ===
        "RESOLVED";

    const currentEvidenceAvailable =
      currentFixtureAvailability.form ||
      currentFixtureAvailability.stats ||
      currentFixtureAvailability.injuries ||
      currentFixtureAvailability.lineups ||
      currentFixtureAvailability.odds;

    const dataReady =
      identityReady &&
      currentEvidenceAvailable;

    /*
     * V3.7 still refuses to call the dataset fully
     * analysis-ready without both current form and current stats.
     */
    const analysisReady =
      identityReady &&
      dataAvailability.form &&
      dataAvailability.stats;

    // ============================================================
    // 30. FINAL RESPONSE
    // ============================================================

    return res.status(200).json({
      success: true,

      version:
        "V3.7",

      normalized: {
        match: {
          home:
            homeInput,
          away:
            awayInput,
          date:
            matchDate,
          year:
            match.year || null
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

      currentFixtureAvailability,

      readiness: {
        identityReady,
        dataReady,
        analysisReady
      },

      analysisReady,

      warnings
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      version: "V3.7",
      error:
        "Web data normalization failed.",
      details:
        error?.message ||
        String(error)
    });
  }
}
