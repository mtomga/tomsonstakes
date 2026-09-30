export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        version: "V3.9",
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
        version: "V3.9",
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

    function escapeRegExp(value) {
      return String(value || "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      const iso =
        matchDate.match(
          /^(\d{4})-(\d{1,2})-(\d{1,2})$/
        );

      if (!iso) {
        return null;
      }

      const year = Number(iso[1]);
      const month = Number(iso[2]);
      const day = Number(iso[3]);

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

      return uniqueArray([
        `${year}-${mm}-${dd}`,
        `${year}-${month}-${day}`,

        `${dd}/${mm}/${year}`,
        `${day}/${month}/${year}`,

        `${dd}-${mm}-${year}`,
        `${day}-${month}-${year}`,

        `${dd}.${mm}.${year}`,
        `${day}.${month}.${year}`,

        `${dd} ${fullMonth} ${year}`,
        `${day} ${fullMonth} ${year}`,

        `${fullMonth} ${dd} ${year}`,
        `${fullMonth} ${day} ${year}`,

        `${dd} ${shortMonth} ${year}`,
        `${day} ${shortMonth} ${year}`,

        `${shortMonth} ${dd} ${year}`,
        `${shortMonth} ${day} ${year}`,

        `${dd} ${fullMonth}, ${year}`,
        `${day} ${fullMonth}, ${year}`,

        `${fullMonth} ${dd}, ${year}`,
        `${fullMonth} ${day}, ${year}`,

        `${dd} ${shortMonth}, ${year}`,
        `${day} ${shortMonth}, ${year}`,

        `${shortMonth} ${dd}, ${year}`,
        `${shortMonth} ${day}, ${year}`
      ]);
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

      const variants =
        dateVariants(
          year,
          month,
          day
        );

      if (
        variants.some(
          variant =>
            text.includes(
              cleanText(variant)
            )
        )
      ) {
        return true;
      }

      /*
       * Additional flexible month-name patterns.
       * This handles punctuation and weekday text around dates.
       */

      const fullMonth =
        escapeRegExp(
          monthName(month)
        );

      const shortMonth =
        escapeRegExp(
          shortMonthName(month)
        );

      const dayPattern =
        String(day);

      const yearPattern =
        String(year);

      const fullMonthRegex =
        new RegExp(
          `\\b${dayPattern}\\s+${fullMonth}\\s*,?\\s+${yearPattern}\\b`,
          "i"
        );

      const fullMonthReverseRegex =
        new RegExp(
          `\\b${fullMonth}\\s+${dayPattern}\\s*,?\\s+${yearPattern}\\b`,
          "i"
        );

      const shortMonthRegex =
        new RegExp(
          `\\b${dayPattern}\\s+${shortMonth}\\s*,?\\s+${yearPattern}\\b`,
          "i"
        );

      const shortMonthReverseRegex =
        new RegExp(
          `\\b${shortMonth}\\s+${dayPattern}\\s*,?\\s+${yearPattern}\\b`,
          "i"
        );

      return (
        fullMonthRegex.test(text) ||
        fullMonthReverseRegex.test(text) ||
        shortMonthRegex.test(text) ||
        shortMonthReverseRegex.test(text)
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

      /*
       * Explicit UTC/GMT evidence is mandatory.
       */
      const explicitUTC =
        /\butc\b/i.test(text) ||
        /\bgmt\b/i.test(text) ||
        /\b00:00\s*utc\b/i.test(text) ||
        /\b\d{1,2}:\d{2}\s*utc\b/i.test(text);

      return explicitUTC;
    }

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
       * Known July fixture contamination.
       */
      const julyPatterns = [
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
        "2026-07-27"
      ];

      if (
        julyPatterns.some(
          pattern =>
            text.includes(pattern)
        )
      ) {
        if (
          containsTargetDate(source)
        ) {
          return false;
        }

        return true;
      }

      /*
       * Clearly older 2026 months.
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
        if (
          !containsTargetDate(source)
        ) {
          return true;
        }
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
    // 9. STRICT TEAM OCCURRENCE
    // ============================================================

    function containsRequestedTeam(
      text,
      identity
    ) {
      const patterns =
        requestedTeamPatterns(identity);

      return patterns.some(
        pattern =>
          text.includes(
            cleanText(pattern)
          )
      );
    }

    // ============================================================
    // 10. STRICT FIXTURE PAIR DETECTION
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
          p => titleText.includes(
            cleanText(p)
          )
        );

      const awayInTitle =
        awayPatterns.some(
          p => titleText.includes(
            cleanText(p)
          )
        );

      /*
       * Women/youth/non-senior pages are excluded first.
       */
      const womenFixture =
        /\bwomen\b|\bwomens\b|\bladies\b|\bfemenino\b|\bfeminino\b/i
          .test(bodyText);

      const youthFixture =
        /\bu\d{2}\b|\byouth\b|\bjunior\b|\bjuvenil\b|\breserve\b/i
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
       * ----------------------------------------------------------
       * STRONGEST: BOTH TEAMS IN TITLE
       * ----------------------------------------------------------
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
       * ----------------------------------------------------------
       * EXPLICIT FIXTURE PAIR
       *
       * This is deliberately strict.
       *
       * We do NOT accept merely having both teams somewhere in
       * the same page.
       * ----------------------------------------------------------
       */

      const separatorRegex =
        /\s+(?:vs\.?|v\.?|-\s+|–)\s+/i;

      /*
       * Split title/body into chunks around common separators.
       * This prevents:
       *
       * O'Higgins vs Deportes Santa Cruz
       *
       * from becoming:
       *
       * O'Higgins vs Deportes Concepcion
       *
       * simply because Deportes Concepcion appears elsewhere.
       */

      const titleChunks =
        titleText
          .split(separatorRegex)
          .map(x => x.trim())
          .filter(Boolean);

      for (const chunk of titleChunks) {
        const hasHome =
          containsRequestedTeam(
            chunk,
            requestedHomeIdentity
          );

        const hasAway =
          containsRequestedTeam(
            chunk,
            requestedAwayIdentity
          );

        if (
          hasHome &&
          hasAway
        ) {
          return {
            match: true,
            strength:
              "EXPLICIT_FIXTURE_PAIR"
          };
        }
      }

      /*
       * Search the body for explicit:
       *
       * Team A vs Team B
       * Team A v Team B
       * Team A - Team B
       */
      const homeRegex =
        homePatterns
          .map(escapeRegExp)
          .join("|");

      const awayRegex =
        awayPatterns
          .map(escapeRegExp)
          .join("|");

      if (
        homeRegex &&
        awayRegex
      ) {
        const pairRegex =
          new RegExp(
            `(?:${homeRegex})\\s*(?:vs\\.?|v\\.?|-|–)\\s*(?:${awayRegex})|` +
            `(?:${awayRegex})\\s*(?:vs\\.?|v\\.?|-|–)\\s*(?:${homeRegex})`,
            "i"
          );

        if (
          pairRegex.test(bodyText)
        ) {
          return {
            match: true,
            strength:
              "EXPLICIT_FIXTURE_PAIR"
          };
        }
      }

      /*
       * ----------------------------------------------------------
       * TEAM-PAGE / TODAY / NEXT-MATCH CONTEXT
       *
       * If both teams occur within a small window and there is
       * strong fixture language nearby, allow it.
       * ----------------------------------------------------------
       */

      const homePositions = [];

      for (const pattern of homePatterns) {
        const index =
          bodyText.indexOf(
            cleanText(pattern)
          );

        if (index >= 0) {
          homePositions.push(index);
        }
      }

      const awayPositions = [];

      for (const pattern of awayPatterns) {
        const index =
          bodyText.indexOf(
            cleanText(pattern)
          );

        if (index >= 0) {
          awayPositions.push(index);
        }
      }

      let closestDistance =
        Infinity;

      let closestHomeIndex =
        -1;

      let closestAwayIndex =
        -1;

      for (const hi of homePositions) {
        for (const ai of awayPositions) {
          const distance =
            Math.abs(hi - ai);

          if (
            distance <
            closestDistance
          ) {
            closestDistance =
              distance;

            closestHomeIndex =
              hi;

            closestAwayIndex =
              ai;
          }
        }
      }

      if (
        closestHomeIndex >= 0 &&
        closestAwayIndex >= 0 &&
        closestDistance <= 180
      ) {
        const start =
          Math.max(
            0,
            Math.min(
              closestHomeIndex,
              closestAwayIndex
            ) - 100
          );

        const end =
          Math.min(
            bodyText.length,
            Math.max(
              closestHomeIndex,
              closestAwayIndex
            ) + 220
          );

        const nearby =
          bodyText.substring(
            start,
            end
          );

        const fixtureLanguage =
          /\b(today|tomorrow|match|fixture|game|kickoff|kick-off|prediction|odds|lineup|line-up|starting xi|next match|next fixture|vs| v )\b/i
            .test(nearby);

        /*
         * Only call this nearby-context evidence if the text
         * does not clearly identify another opponent.
         *
         * Example:
         *
         * O'Higgins vs Deportes Santa Cruz
         *
         * should not be accepted merely because Deportes
         * Concepcion appears elsewhere.
         */
        const competingOpponents =
          [
            "deportes santa cruz",
            "santa cruz",
            "universidad de concepcion",
            "u de concepcion",
            "universidad de chile",
            "boca juniors",
            "deportes limache"
          ];

        const containsCompetingOpponent =
          competingOpponents.some(
            opponent =>
              nearby.includes(
                cleanText(opponent)
              ) &&
              !(
                requestedHomeIdentity ===
                  "UNIVERSIDAD_DE_CONCEPCION" &&
                opponent.includes(
                  "universidad de concepcion"
                )
              )
          );

        if (
          fixtureLanguage &&
          !containsCompetingOpponent
        ) {
          return {
            match: true,
            strength:
              "NEARBY_FIXTURE_CONTEXT"
          };
        }
      }

      /*
       * Both teams mentioned, but no reliable fixture pairing.
       */
      const homeInBody =
        homePatterns.some(
          p =>
            bodyText.includes(
              cleanText(p)
            )
        );

      const awayInBody =
        awayPatterns.some(
          p =>
            bodyText.includes(
              cleanText(p)
            )
        );

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
    // 11. CATEGORY RELEVANCE
    // ============================================================

    function categoryRelevant(source) {
      const type =
        source.type;

      const fixture =
        fixtureIdentityPair(source);

      const ids =
        sourceIdentities(source);

      if (type === "h2h") {
        return fixture.match;
      }

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

        if (
          hasHome &&
          hasAway &&
          !fixture.match
        ) {
          return false;
        }

        return hasHome || hasAway;
      }

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

        if (
          !hasHome &&
          !hasAway
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

        return true;
      }

      if (type === "lineups") {
        if (
          obviousHistoricalFixture(source)
        ) {
          return false;
        }

        return fixture.match;
      }

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
    // 12. SOURCE ASSESSMENT
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
       * ----------------------------------------------------------
       * H2H
       * ----------------------------------------------------------
       */
      if (isH2H) {
        usable =
          categoryOk;

        currentFixtureUsable =
          fixture.match &&
          (
            exactDate ||
            utcNextDay ||
            (
              today &&
              exactDate
            )
          );
      }

      /*
       * ----------------------------------------------------------
       * FORM
       * ----------------------------------------------------------
       *
       * Form is team-specific and can be useful without being the
       * exact current fixture.
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
       * ----------------------------------------------------------
       * CURRENT FIXTURE CATEGORIES
       * ----------------------------------------------------------
       *
       * V3.9:
       *
       * exact fixture
       * +
       * one of:
       *   exact target date
       *   UTC next day
       *   explicit Today context
       *
       * "Today" is accepted only when the exact fixture pair
       * has already been established.
       * ----------------------------------------------------------
       */
      else {
        usable =
          categoryOk;

        if (
          categoryOk &&
          fixture.match &&
          !obviousHistoricalFixture(source)
        ) {
          if (
            exactDate ||
            utcNextDay
          ) {
            currentFixtureUsable = true;
          }

          if (
            today
          ) {
            currentFixtureUsable = true;
          }
        }
      }

      /*
       * Historical contamination is never current.
       */
      if (
        !isH2H &&
        obviousHistoricalFixture(source)
      ) {
        currentFixtureUsable = false;
        usable = false;
      }

      /*
       * Team-only sources are not exact current fixture sources.
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
    // 13. ASSESS ALL SOURCES
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
    // 14. H2H
    // ============================================================

    const h2h =
      usableCategory("h2h")
        .filter(source =>
          source.fixtureMatch === true
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
            source.utcNextDayMatch,

          todayContext:
            source.todayContext
        }));

    // ============================================================
    // 15. FORM
    // ============================================================

    const form = {
      home: [],
      away: []
    };

    /*
     * V3.9 remains conservative with form extraction.
     * No W/D/L is invented until the source gives reliable
     * team-specific result evidence.
     */

    // ============================================================
    // 16. GOALS
    // ============================================================

    const goals = {
      home: {},
      away: {}
    };

    // ============================================================
    // 17. xG
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
        const value =
          Number(m[1]);

        if (
          value >= 0 &&
          value <= 10
        ) {
          addUnique(
            xg.combined,
            {
              value,
              source:
                source.url,
              title:
                source.title
            }
          );
        }
      }

      /*
       * Home xG.
       */
      const homePatterns =
        requestedTeamPatterns(
          requestedHomeIdentity
        );

      for (
        const pattern of homePatterns
      ) {
        const regex =
          new RegExp(
            escapeRegExp(pattern) +
            "[^.\\n]{0,100}?" +
            "(\\d+(?:\\.\\d+)?)\\s*xg\\b",
            "i"
          );

        const m =
          text.match(regex);

        if (m) {
          const value =
            Number(m[1]);

          if (
            value >= 0 &&
            value <= 10
          ) {
            addUnique(
              xg.home,
              {
                value,
                source:
                  source.url,
                title:
                  source.title
              }
            );
          }

          break;
        }
      }

      /*
       * Away xG.
       */
      const awayPatterns =
        requestedTeamPatterns(
          requestedAwayIdentity
        );

      for (
        const pattern of awayPatterns
      ) {
        const regex =
          new RegExp(
            escapeRegExp(pattern) +
            "[^.\\n]{0,100}?" +
            "(\\d+(?:\\.\\d+)?)\\s*xg\\b",
            "i"
          );

        const m =
          text.match(regex);

        if (m) {
          const value =
            Number(m[1]);

          if (
            value >= 0 &&
            value <= 10
          ) {
            addUnique(
              xg.away,
              {
                value,
                source:
                  source.url,
                title:
                  source.title
              }
            );
          }

          break;
        }
      }
    }

    // ============================================================
    // 18. BTTS
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
       *
       * Yes 1.79 52%
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

    // Remove duplicate BTTS evidence.
    btts.evidence =
      btts.evidence.filter(
        (item, index, arr) =>
          index ===
          arr.findIndex(
            x =>
              x.source === item.source &&
              x.answer === item.answer &&
              x.percentage === item.percentage
          )
      );

    // ============================================================
    // 19. OVER / UNDER
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
    // 20. INJURIES
    // ============================================================

    const injuries = {
      home: [],
      away: []
    };

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
    // 21. LINEUPS
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

          todayContext:
            source.todayContext,

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

          todayContext:
            source.todayContext,

          currentFixtureUsable:
            source.currentFixtureUsable
        });
      }
    }

    // ============================================================
    // 22. ODDS
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

    function addOddsEvidence(item) {
      const exists =
        odds.evidence.some(
          e =>
            e.type === item.type &&
            e.source === item.source &&
            JSON.stringify(e) ===
              JSON.stringify(item)
        );

      if (!exists) {
        odds.evidence.push(item);
      }
    }

    for (
      const source of
      currentFixtureCategory("odds")
    ) {
      const text =
        `${source.title} ${source.snippet}`;

      /*
       * ----------------------------------------------------------
       * 1X2 DECIMAL ODDS
       *
       * Supported:
       *
       * 1: 2.35 X: 3.20 2: 2.95
       * 1:2.35 X:3.20 2:2.95
       * 1 2.32 X 3.53 2 3.20
       * ----------------------------------------------------------
       */

      const oneXTwoColon =
        text.match(
          /\b1\s*[:\-]\s*(\d+(?:\.\d+)?)\s+X\s*[:\-]\s*(\d+(?:\.\d+)?)\s+2\s*[:\-]\s*(\d+(?:\.\d+)?)/i
        );

      const oneXTwoSpace =
        text.match(
          /\b1\s+(\d+(?:\.\d+)?)\s+X\s+(\d+(?:\.\d+)?)\s+2\s+(\d+(?:\.\d+)?)/i
        );

      const oneXTwo =
        oneXTwoColon ||
        oneXTwoSpace;

      if (oneXTwo) {
        const homeOdd =
          Number(oneXTwo[1]);

        const drawOdd =
          Number(oneXTwo[2]);

        const awayOdd =
          Number(oneXTwo[3]);

        if (
          homeOdd >= 1.01 &&
          drawOdd >= 1.01 &&
          awayOdd >= 1.01
        ) {
          addOddsEvidence({
            type:
              "1X2_decimal_odds",

            home:
              homeOdd,

            draw:
              drawOdd,

            away:
              awayOdd,

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

            todayContext:
              source.todayContext,

            currentFixtureUsable:
              source.currentFixtureUsable
          });
        }
      }

      /*
       * ----------------------------------------------------------
       * Explicit Home / Draw / Away odds
       * ----------------------------------------------------------
       */

      const homeOddMatch =
        text.match(
          /\b(?:home|1)\s*(?:odds?|price)?\s*[:\-]\s*(\d+(?:\.\d+)?)/i
        );

      const drawOddMatch =
        text.match(
          /\b(?:draw|x)\s*(?:odds?|price)?\s*[:\-]\s*(\d+(?:\.\d+)?)/i
        );

      const awayOddMatch =
        text.match(
          /\b(?:away|2)\s*(?:odds?|price)?\s*[:\-]\s*(\d+(?:\.\d+)?)/i
        );

      if (
        homeOddMatch &&
        drawOddMatch &&
        awayOddMatch
      ) {
        const h =
          Number(homeOddMatch[1]);

        const d =
          Number(drawOddMatch[1]);

        const a =
          Number(awayOddMatch[1]);

        if (
          h >= 1.01 &&
          d >= 1.01 &&
          a >= 1.01
        ) {
          addOddsEvidence({
            type:
              "1X2_labeled_decimal_odds",

            home:
              h,

            draw:
              d,

            away:
              a,

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

            todayContext:
              source.todayContext,

            currentFixtureUsable:
              source.currentFixtureUsable
          });
        }
      }

      /*
       * ----------------------------------------------------------
       * Probability
       * ----------------------------------------------------------
       */

      const probabilityMatches = [
        ...text.matchAll(
          /probability\s*[:\-]?\s*(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (
        const m of probabilityMatches
      ) {
        const value =
          Number(m[1]);

        if (
          value >= 0 &&
          value <= 100
        ) {
          addOddsEvidence({
            type:
              "probability",

            percentage:
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

            todayContext:
              source.todayContext,

            currentFixtureUsable:
              source.currentFixtureUsable
          });
        }
      }

      /*
       * Explicit probability labels.
       *
       * Example:
       *
       * Home probability: 46.67%
       * Draw probability: 28%
       * Away probability: 25.33%
       */

      const homeProbability =
        text.match(
          /\b(?:home|1)\s+(?:probability|chance)\s*[:\-]\s*(\d+(?:\.\d+)?)%/i
        );

      const drawProbability =
        text.match(
          /\b(?:draw|x)\s+(?:probability|chance)\s*[:\-]\s*(\d+(?:\.\d+)?)%/i
        );

      const awayProbability =
        text.match(
          /\b(?:away|2)\s+(?:probability|chance)\s*[:\-]\s*(\d+(?:\.\d+)?)%/i
        );

      if (homeProbability) {
        odds.probability.home =
          Number(homeProbability[1]);
      }

      if (drawProbability) {
        odds.probability.draw =
          Number(drawProbability[1]);
      }

      if (awayProbability) {
        odds.probability.away =
          Number(awayProbability[1]);
      }

      /*
       * Generic explicit decimal odds.
       *
       * This does NOT treat arbitrary percentages or numbers as
       * odds. It requires the word "odds" or "price".
       */

      const explicitOdds = [
        ...text.matchAll(
          /\b(?:odds?|price)\s*(?:of|:)\s*(\d+(?:\.\d+)?)/gi
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
          addOddsEvidence({
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

            todayContext:
              source.todayContext,

            currentFixtureUsable:
              source.currentFixtureUsable
          });
        }
      }

      /*
       * ----------------------------------------------------------
       * OVER / UNDER ODDS
       * ----------------------------------------------------------
       */

      const ouOdds =
        [
          ...text.matchAll(
            /\b(over|under)\s*(\d+(?:\.\d+)?)\s*(?:goals?)?\s*(?:odds?|price)?\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
          )
        ];

      for (
        const m of ouOdds
      ) {
        const value =
          Number(m[3]);

        if (
          value >= 1.01 &&
          value <= 100
        ) {
          addOddsEvidence({
            type:
              "over_under_decimal_odds",

            selection:
              `${m[1].toUpperCase()} ${m[2]}`,

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

            todayContext:
              source.todayContext,

            currentFixtureUsable:
              source.currentFixtureUsable
          });
        }
      }

      /*
       * ----------------------------------------------------------
       * BTTS ODDS
       * ----------------------------------------------------------
       *
       * Example:
       *
       * BTTS Yes 1.79
       * Both Teams To Score Yes 1.79
       * ----------------------------------------------------------
       */

      const bttsOdds =
        [
          ...text.matchAll(
            /\b(?:btts|both teams to score)\s*(?:yes|no)?\s*(?:odds?|price)?\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
          )
        ];

      for (
        const m of bttsOdds
      ) {
        const value =
          Number(m[1]);

        if (
          value >= 1.01 &&
          value <= 100
        ) {
          addOddsEvidence({
            type:
              "btts_decimal_odds",

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

            todayContext:
              source.todayContext,

            currentFixtureUsable:
              source.currentFixtureUsable
          });
        }
      }
    }

    /*
     * Populate primary 1X2 odds from the strongest extracted
     * current evidence.
     */
    const primary1X2 =
      odds.evidence.find(
        e =>
          e.type ===
            "1X2_decimal_odds" ||
          e.type ===
            "1X2_labeled_decimal_odds"
      );

    if (primary1X2) {
      odds.home =
        primary1X2.home;

      odds.draw =
        primary1X2.draw;

      odds.away =
        primary1X2.away;
    }

    // ============================================================
    // 23. SOURCE REPORT
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
    // 24. CONTAMINATION DETECTION
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
    // 25. IDENTITY REPORT
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
    // 26. DATA AVAILABILITY
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
        odds.home !== null ||
        odds.draw !== null ||
        odds.away !== null ||
        odds.evidence.some(
          e =>
            e.type ===
              "probability" ||
            e.type ===
              "1X2_decimal_odds" ||
            e.type ===
              "1X2_labeled_decimal_odds"
        )
    };

    // ============================================================
    // 27. CURRENT FIXTURE AVAILABILITY
    // ============================================================

    const currentFixtureAvailability = {
      form:
        false,

      stats:
        currentFixtureCategory("stats")
          .length > 0,

      injuries:
        injuries.home.length > 0 ||
        injuries.away.length > 0,

      lineups:
        lineups.home.length > 0 ||
        lineups.away.length > 0,

      odds:
        odds.home !== null ||
        odds.draw !== null ||
        odds.away !== null ||
        odds.evidence.some(
          e =>
            e.type ===
              "probability" ||
            e.type ===
              "1X2_decimal_odds" ||
            e.type ===
              "1X2_labeled_decimal_odds"
        ),

      h2h:
        h2h.length > 0
    };

    // ============================================================
    // 28. QUALITY
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

    const utcNextDaySources =
      assessedSources.filter(
        source =>
          source.utcNextDayMatch
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

      utcNextDaySourceCount:
        utcNextDaySources.length,

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
                (
                  currentFixtureSources.length /
                  Math.max(
                    1,
                    results.length
                  )
                ) +
                (
                  Math.min(
                    0.2,
                    h2h.length * 0.01
                  )
                )
              ).toFixed(2)
            )
          : 0
    };

    // ============================================================
    // 29. WARNINGS
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
        "No reliable current 1X2 odds/probability evidence was extracted."
      );
    }

    warnings.push(
      "Historical target-vs-target matches are retained only as H2H evidence."
    );

    warnings.push(
      "Current-fixture evidence requires an exact target fixture plus target-date, UTC-next-day, or explicit Today evidence."
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
    // 30. READINESS
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
     * Still conservative.
     *
     * Form extraction is not yet implemented, therefore
     * analysisReady should remain false until reliable form is
     * actually extracted.
     */
    const analysisReady =
      identityReady &&
      dataAvailability.form &&
      dataAvailability.stats;

    // ============================================================
    // 31. FINAL RESPONSE
    // ============================================================

    return res.status(200).json({
      success: true,

      version:
        "V3.9",

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
        "V3.9",

      error:
        "Web data normalization failed.",

      details:
        error?.message ||
        String(error)
    });
  }
}
