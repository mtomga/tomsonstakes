export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        version: "V3.8",
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
        version: "V3.8",
        error: "Match information is incomplete.",
        received: {
          home: homeInput,
          away: awayInput,
          date: matchDate
        }
      });
    }

    // ============================================================
    // 1. TEXT HELPERS
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
    // 3. CANONICAL NAMES
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
    // 4. FLATTEN RESULTS
    // ============================================================

    const searches =
      Array.isArray(body.searches)
        ? body.searches
        : [];

    const results = [];

    for (const search of searches) {
      const type =
        String(search?.type || "unknown");

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
      const text = cleanText(`
        ${source.title}
        ${source.snippet}
        ${source.url}
      `);

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
    // 6. DATE PARSING
    // ============================================================

    function parseTargetDate() {
      const matchDatePattern =
        matchDate.match(
          /^(\d{4})-(\d{1,2})-(\d{1,2})$/
        );

      if (!matchDatePattern) {
        return null;
      }

      const year =
        Number(matchDatePattern[1]);

      const month =
        Number(matchDatePattern[2]);

      const day =
        Number(matchDatePattern[3]);

      if (
        year < 2000 ||
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

    function monthName(month) {
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

      return names[month] || "";
    }

    function shortMonthName(month) {
      const names = [
        "",
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec"
      ];

      return names[month] || "";
    }

    function dateVariants(year, month, day) {
      const mm =
        String(month).padStart(2, "0");

      const dd =
        String(day).padStart(2, "0");

      const fullMonth =
        monthName(month);

      const shortMonth =
        shortMonthName(month);

      return [
        `${year}-${mm}-${dd}`,
        `${year}-${month}-${day}`,

        `${dd}/${mm}/${year}`,
        `${day}/${month}/${year}`,

        `${dd}-${mm}-${year}`,
        `${day}-${month}-${year}`,

        `${dd} ${fullMonth} ${year}`,
        `${day} ${fullMonth} ${year}`,

        `${fullMonth} ${dd} ${year}`,
        `${fullMonth} ${day} ${year}`,

        `${dd} ${shortMonth} ${year}`,
        `${day} ${shortMonth} ${year}`,

        `${shortMonth} ${dd} ${year}`,
        `${shortMonth} ${day} ${year}`
      ];
    }

    function textForDate(source) {
      return cleanText(`
        ${source.title}
        ${source.snippet}
        ${source.url}
        ${source.date || ""}
      `);
    }

    function containsDate(
      source,
      year,
      month,
      day
    ) {
      const text =
        textForDate(source);

      return dateVariants(
        year,
        month,
        day
      ).some(variant =>
        text.includes(
          cleanText(variant)
        )
      );
    }

    function nextCalendarDate() {
      if (!targetDate) {
        return null;
      }

      const d =
        new Date(
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

    /*
     * Exact requested date.
     */
    function containsTargetDate(source) {
      if (!targetDate) {
        return false;
      }

      return containsDate(
        source,
        targetDate.year,
        targetDate.month,
        targetDate.day
      );
    }

    /*
     * A source may display the fixture as the following day
     * because it converts the Chilean local kickoff to UTC.
     *
     * IMPORTANT:
     * We only accept this if the source explicitly indicates UTC.
     */
    function containsUTCNextDayDate(source) {
      if (!targetDate) {
        return false;
      }

      const next =
        nextCalendarDate();

      if (!next) {
        return false;
      }

      const text =
        textForDate(source);

      const hasNextDate =
        containsDate(
          source,
          next.year,
          next.month,
          next.day
        );

      if (!hasNextDate) {
        return false;
      }

      return (
        /\butc\b/i.test(text) ||
        /\bgmt\b/i.test(text) ||
        /\b00:00\s*utc\b/i.test(text) ||
        /\b\d{1,2}:\d{2}\s*utc\b/i.test(text)
      );
    }

    /*
     * "Today" is accepted only because the search request is
     * already tied to the requested match date.
     *
     * It is NOT enough by itself to establish a fixture.
     * Exact team-pair evidence is still required.
     */
    function containsToday(source) {
      const text =
        textForDate(source);

      return (
        /\btoday\b/i.test(text) ||
        /\btonight\b/i.test(text) ||
        /\bthis evening\b/i.test(text)
      );
    }

    function dateMatchForSource(source) {
      return containsTargetDate(source);
    }

    function utcNextDayMatchForSource(source) {
      return containsUTCNextDayDate(source);
    }

    // ============================================================
    // 7. HISTORICAL DATE DETECTION
    // ============================================================

    function obviousHistoricalFixture(source) {
      const text =
        textForDate(source);

      /*
       * We deliberately detect the known historical July fixture
       * dates because those pages were contaminating current data.
       */

      const historicalPatterns = [
        "25 july 2026",
        "26 july 2026",
        "27 july 2026",

        "25 jul 2026",
        "26 jul 2026",
        "27 jul 2026",

        "25.07.2026",
        "26.07.2026",
        "27.07.2026",

        "25/07/2026",
        "26/07/2026",
        "27/07/2026",

        "25-07-2026",
        "26-07-2026",
        "27-07-2026",

        "2026-07-25",
        "2026-07-26",
        "2026-07-27",

        "july 2026",
        "jul 2026"
      ];

      if (
        historicalPatterns.some(
          pattern =>
            text.includes(pattern)
        )
      ) {
        /*
         * Do not classify a source as historical merely because
         * it says "July" in a generic URL if it ALSO has the exact
         * current target date.
         */
        if (
          containsTargetDate(source)
        ) {
          return false;
        }

        return true;
      }

      /*
       * Older months clearly before September 2026.
       */
      const olderMonthPatterns = [
        "january 2026",
        "february 2026",
        "march 2026",
        "april 2026",
        "may 2026",
        "june 2026",
        "jan 2026",
        "feb 2026",
        "mar 2026",
        "apr 2026",
        "jun 2026"
      ];

      if (
        olderMonthPatterns.some(
          pattern =>
            text.includes(pattern)
        )
      ) {
        return true;
      }

      return false;
    }

    // ============================================================
    // 8. TEAM PATTERNS
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

    // ============================================================
    // 9. FIXTURE DETECTION
    // ============================================================

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
          p => titleText.includes(p)
        );

      const awayInTitle =
        awayPatterns.some(
          p => titleText.includes(p)
        );

      const homeInBody =
        homePatterns.some(
          p => bodyText.includes(p)
        );

      const awayInBody =
        awayPatterns.some(
          p => bodyText.includes(p)
        );

      /*
       * Women/youth fixtures are never treated as the requested
       * senior men's fixture unless the source explicitly matches
       * the target identity context.
       */
      const womenFixture =
        /\bwomen\b|\bwomens\b|\bladies\b|\bfemenino\b|\bfeminino\b/i
          .test(bodyText);

      const youthFixture =
        /\bu\d{2}\b|\byouth\b|\bjunior\b|\bjuvenil\b/i
          .test(bodyText);

      if (
        womenFixture ||
        youthFixture
      ) {
        return {
          match: false,
          strength:
            "NON_SENIOR_FIXTURE"
        };
      }

      /*
       * Both teams in title = strongest evidence.
       */
      if (
        homeInTitle &&
        awayInTitle
      ) {
        return {
          match: true,
          strength:
            "TITLE_BOTH_TEAMS"
        };
      }

      /*
       * Explicit fixture separator.
       */
      const separators = [
        " vs ",
        " v ",
        " - ",
        " – ",
        " vs.",
        " v."
      ];

      for (const hp of homePatterns) {
        for (const ap of awayPatterns) {
          for (const sep of separators) {
            const a =
              `${hp}${sep}${ap}`;

            const b =
              `${ap}${sep}${hp}`;

            if (
              bodyText.includes(a) ||
              bodyText.includes(b)
            ) {
              return {
                match: true,
                strength:
                  "EXPLICIT_FIXTURE_PAIR"
              };
            }
          }
        }
      }

      /*
       * Exact pair may be written close together without a
       * conventional separator.
       */
      if (
        homeInBody &&
        awayInBody
      ) {
        const homeIndex =
          bodyText.indexOf(
            homePatterns.find(
              p => bodyText.includes(p)
            ) || ""
          );

        const awayIndex =
          bodyText.indexOf(
            awayPatterns.find(
              p => bodyText.includes(p)
            ) || ""
          );

        if (
          homeIndex >= 0 &&
          awayIndex >= 0 &&
          Math.abs(
            homeIndex - awayIndex
          ) <= 180
        ) {
          /*
           * Require some fixture language nearby.
           */
          const nearby =
            bodyText.substring(
              Math.max(
                0,
                Math.min(
                  homeIndex,
                  awayIndex
                ) - 80
              ),
              Math.min(
                bodyText.length,
                Math.max(
                  homeIndex,
                  awayIndex
                ) + 180
              )
            );

          if (
            /\b(today|tomorrow|match|fixture|game|kickoff|kick-off|prediction|odds|lineup|line-up|starting xi|vs| v )\b/i
              .test(nearby)
          ) {
            return {
              match: true,
              strength:
                "NEARBY_FIXTURE_CONTEXT"
            };
          }
        }

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
    // 10. CATEGORY RELEVANCE
    // ============================================================

    function categoryRelevant(source) {
      const type =
        source.type;

      const fixture =
        fixtureIdentityPair(source);

      const ids =
        sourceIdentities(source);

      /*
       * H2H:
       * Historical target-vs-target is valid.
       * But unrelated opponents are rejected.
       */
      if (type === "h2h") {
        return fixture.match;
      }

      /*
       * FORM:
       * Team-specific form pages can be relevant even when they
       * are not the exact fixture.
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
         * If both are present but not a fixture, reject.
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

      /*
       * STATS:
       * Current exact fixture OR current team-specific stats.
       */
      if (type === "stats") {
        if (
          obviousHistoricalFixture(source)
        ) {
          return false;
        }

        if (fixture.match) {
          return true;
        }

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
       * INJURIES:
       * Team-specific current injury pages are acceptable.
       */
      if (type === "injuries") {
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

        if (!hasHome && !hasAway) {
          return false;
        }

        /*
         * Both teams must actually be a fixture.
         */
        if (
          hasHome &&
          hasAway &&
          !fixture.match
        ) {
          return false;
        }

        return true;
      }

      /*
       * LINEUPS:
       * Only exact current fixture.
       */
      if (type === "lineups") {
        if (
          obviousHistoricalFixture(source)
        ) {
          return false;
        }

        return fixture.match;
      }

      /*
       * ODDS:
       * Only exact requested fixture.
       */
      if (type === "odds") {
        if (
          obviousHistoricalFixture(source)
        ) {
          return false;
        }

        return fixture.match;
      }

      return false;
    }

    // ============================================================
    // 11. SOURCE ASSESSMENT
    // ============================================================

    function assessSource(source) {
      const ids =
        sourceIdentities(source);

      const fixture =
        fixtureIdentityPair(source);

      const exactDate =
        dateMatchForSource(source);

      const utcNextDay =
        utcNextDayMatchForSource(source);

      const today =
        containsToday(source);

      const categoryOk =
        categoryRelevant(source);

      const isH2H =
        source.type === "h2h";

      let usable = false;
      let currentFixtureUsable = false;

      /*
       * ==========================================================
       * H2H
       * ==========================================================
       *
       * Historical target-vs-target evidence is usable.
       */
      if (isH2H) {
        usable =
          categoryOk;

        /*
         * A current target-date H2H page can also be considered
         * current-fixture evidence, but it must pass the same
         * strict date gate.
         */
        currentFixtureUsable =
          fixture.match &&
          (
            exactDate ||
            utcNextDay
          );
      }

      /*
       * ==========================================================
       * FORM
       * ==========================================================
       *
       * Form is normally team-specific, so it does not require
       * exact fixture evidence.
       *
       * However it is NEVER marked currentFixtureUsable merely
       * because a team page exists.
       */
      else if (
        source.type === "form"
      ) {
        usable =
          categoryOk;

        currentFixtureUsable =
          false;
      }

      /*
       * ==========================================================
       * CURRENT FIXTURE CATEGORIES
       * ==========================================================
       *
       * HARD RULE:
       *
       * fixtureMatch MUST be true AND
       * target date OR explicit UTC-next-day date MUST be true.
       *
       * "fixtureMatch" by itself is NOT enough.
       */
      else {
        usable =
          categoryOk;

        if (
          categoryOk &&
          fixture.match &&
          !obviousHistoricalFixture(source)
        ) {
          currentFixtureUsable =
            exactDate ||
            utcNextDay;
        }

        /*
         * "Today" pages:
         *
         * A search result saying "Today" is allowed to represent
         * the target date because this web-data request is for the
         * target date.
         *
         * But exact fixture identity remains mandatory.
         */
        if (
          categoryOk &&
          fixture.match &&
          today &&
          !obviousHistoricalFixture(source)
        ) {
          currentFixtureUsable = true;
        }
      }

      /*
       * Historical current-category evidence is NEVER current.
       */
      if (
        !isH2H &&
        obviousHistoricalFixture(source)
      ) {
        currentFixtureUsable = false;
        usable = false;
      }

      /*
       * Team-only injury/stat evidence can be usable but is NOT
       * exact current-fixture evidence.
       */
      if (
        !isH2H &&
        !fixture.match
      ) {
        currentFixtureUsable = false;
      }

      return {
        identities: ids,

        fixtureMatch:
          fixture.match,

        fixtureStrength:
          fixture.strength,

        dateMatch:
          exactDate,

        utcNextDayMatch:
          utcNextDay,

        todayContext:
          today,

        categoryRelevant:
          categoryOk,

        usable,

        currentFixtureUsable
      };
    }

    // ============================================================
    // 12. ASSESS ALL SOURCES
    // ============================================================

    const assessedSources =
      results.map(source => ({
        ...source,
        ...assessSource(source)
      }));

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

    /*
     * STRICT H2H FILTER:
     *
     * Only target-vs-target.
     * No Santa Cruz.
     * No women's fixture.
     * No Universidad de Concepcion contamination.
     */
    const h2h =
      usableCategory("h2h")
        .filter(source =>
          source.fixtureMatch
        )
        .map(source => ({
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

          fixtureStrength:
            source.fixtureStrength,

          dateMatch:
            source.dateMatch,

          utcNextDayMatch:
            source.utcNextDayMatch
        }));

    // ============================================================
    // 14. FORM
    // ============================================================

    const form = {
      home: [],
      away: []
    };

    /*
     * V3.8 keeps form extraction conservative.
     *
     * We will build the proper W/D/L parser after the current
     * fixture gate is proven clean.
     */

    // ============================================================
    // 15. GOALS
    // ============================================================

    const goals = {
      home: {},
      away: {}
    };

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
            value:
              Number(m[1]),
            source:
              source.url,
            title:
              source.title
          }
        );
      }

      /*
       * Home xG.
       */
      let homePatterns = [];

      if (
        requestedHomeIdentity ===
        "DEPORTES_CONCEPCION"
      ) {
        homePatterns = [
          "deportes concepcion"
        ];
      }

      if (
        requestedHomeIdentity ===
        "UNIVERSIDAD_DE_CONCEPCION"
      ) {
        homePatterns = [
          "universidad de concepcion",
          "u de concepcion",
          "u concepcion"
        ];
      }

      for (
        const pattern of homePatterns
      ) {
        const regex =
          new RegExp(
            pattern +
            "[^.\\n]{0,100}?" +
            "(\\d+(?:\\.\\d+)?)\\s*xg\\b",
            "i"
          );

        const m =
          text.match(regex);

        if (m) {
          addUnique(
            xg.home,
            {
              value:
                Number(m[1]),
              source:
                source.url,
              title:
                source.title
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
            source:
              source.url,
            title:
              source.title
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
        `${source.title} ${source.snippet}`;

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

      /*
       * Example:
       * "Yes 1.79 52%"
       */
      const yesNoPercentage =
        [
          ...text.matchAll(
            /\b(yes|no)\b[^%\n]{0,30}?(\d+(?:\.\d+)?)%/gi
          )
        ];

      for (
        const m of yesNoPercentage
      ) {
        const already =
          btts.evidence.some(
            e =>
              e.source === source.url &&
              e.answer ===
                m[1].toUpperCase() &&
              e.percentage ===
                Number(m[2])
          );

        if (!already) {
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
        `${source.title} ${source.snippet}`;

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
     * ONLY currentFixtureUsable injury evidence is placed into
     * the current fixture injury arrays.
     *
     * This prevents old May/August/July pages from appearing here.
     */
    for (
      const source of
      currentFixtureCategory("injuries")
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

          utcNextDayMatch:
            source.utcNextDayMatch,

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

          utcNextDayMatch:
            source.utcNextDayMatch,

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

          utcNextDayMatch:
            source.utcNextDayMatch,

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

          utcNextDayMatch:
            source.utcNextDayMatch,

          currentFixtureUsable:
            source.currentFixtureUsable
        });
      }
    }

    // ============================================================
    // 21. ODDS
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

    for (
      const source of
      currentFixtureCategory("odds")
    ) {
      const text =
        `${source.title} ${source.snippet}`;

      /*
       * Explicit probability.
       */
      const probabilityMatches = [
        ...text.matchAll(
          /probability\s*[:\-]?\s*(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (
        const m of probabilityMatches
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

          utcNextDayMatch:
            source.utcNextDayMatch,

          currentFixtureUsable:
            source.currentFixtureUsable
        });
      }

      /*
       * Explicit decimal odds.
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

            utcNextDayMatch:
              source.utcNextDayMatch,

            currentFixtureUsable:
              source.currentFixtureUsable
          });
        }
      }

      /*
       * Common 1X2 format:
       * 1:2.35 X:3.20 2:2.95
       *
       * This is accepted only from an already verified current
       * fixture source.
       */
      const oneXTwo =
        text.match(
          /\b1\s*[:\-]\s*(\d+(?:\.\d+)?)\s+x\s*[:\-]\s*(\d+(?:\.\d+)?)\s+2\s*[:\-]\s*(\d+(?:\.\d+)?)/i
        );

      if (oneXTwo) {
        odds.evidence.push({
          type:
            "1X2_decimal_odds",

          home:
            Number(oneXTwo[1]),

          draw:
            Number(oneXTwo[2]),

          away:
            Number(oneXTwo[3]),

          source:
            source.url,

          title:
            source.title,

          fixtureMatch:
            source.fixtureMatch,

          dateMatch:
            source.dateMatch,

          utcNextDayMatch:
            source.utcNextDayMatch,

          currentFixtureUsable:
            source.currentFixtureUsable
        });
      }
    }

    // ============================================================
    // 22. SOURCE REPORT
    // ============================================================

    const sources =
      assessedSources.map(source => ({
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

        todayContext:
          source.todayContext,

        categoryRelevant:
          source.categoryRelevant,

        usable:
          source.usable,

        currentFixtureUsable:
          source.currentFixtureUsable
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

    /*
     * IMPORTANT V3.8:
     *
     * Availability is now based on CURRENT usable evidence,
     * not merely on arrays containing historical material.
     */

    const dataAvailability = {
      identity:
        identity.homeStatus === "RESOLVED" &&
        identity.awayStatus === "RESOLVED",

      form:
        currentFixtureCategory("form").length > 0,

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
    // 26. CURRENT FIXTURE AVAILABILITY
    // ============================================================

    const currentFixtureAvailability = {
      form:
        currentFixtureCategory("form").length > 0,

      stats:
        currentFixtureCategory("stats").length > 0,

      injuries:
        currentFixtureCategory("injuries").length > 0,

      lineups:
        currentFixtureCategory("lineups").length > 0,

      odds:
        currentFixtureCategory("odds").length > 0,

      h2h:
        h2h.length > 0
    };

    // ============================================================
    // 27. QUALITY
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
      "Current-fixture evidence requires the exact target fixture plus target-date, UTC-next-day, or explicit Today evidence."
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
    // 29. READINESS
    // ============================================================

    const identityReady =
      identity.homeStatus === "RESOLVED" &&
      identity.awayStatus === "RESOLVED";

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
     * Still deliberately conservative.
     *
     * Form + current stats must exist before the complete
     * prediction dataset is considered analysis-ready.
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
        "V3.8",

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

      version:
        "V3.8",

      error:
        "Web data normalization failed.",

      details:
        error?.message ||
        String(error)
    });
  }
}
