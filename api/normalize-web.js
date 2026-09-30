export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        version: "V3.11",
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
        version: "V3.11",
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

    function uniqueArray(arr) {
      return [...new Set(arr)];
    }

    function escapeRegExp(value) {
      return String(value || "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function addUnique(arr, item, keys) {
      const exists = arr.some(existing =>
        keys.every(key =>
          String(existing[key] ?? "") ===
          String(item[key] ?? "")
        )
      );

      if (!exists) {
        arr.push(item);
      }
    }

    function numberOrNull(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
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
    // 4. FLATTEN SEARCH RESULTS
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
      return sourceIdentities(source).includes(identity);
    }

    // ============================================================
    // 6. TARGET DATE
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
      return [
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
      ][month] || "";
    }

    function shortMonthName(month) {
      return [
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
      ][month] || "";
    }

    function dateVariants(year, month, day) {
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");

      const full = monthName(month);
      const short = shortMonthName(month);

      return uniqueArray([
        `${year}-${mm}-${dd}`,
        `${year}-${month}-${day}`,

        `${dd}/${mm}/${year}`,
        `${day}/${month}/${year}`,

        `${dd}-${mm}-${year}`,
        `${day}-${month}-${year}`,

        `${dd}.${mm}.${year}`,
        `${day}.${month}.${year}`,

        `${dd} ${full} ${year}`,
        `${day} ${full} ${year}`,

        `${full} ${dd} ${year}`,
        `${full} ${day} ${year}`,

        `${dd} ${short} ${year}`,
        `${day} ${short} ${year}`,

        `${short} ${dd} ${year}`,
        `${short} ${day} ${year}`,

        `${dd} ${full}, ${year}`,
        `${day} ${full}, ${year}`,

        `${full} ${dd}, ${year}`,
        `${full} ${day}, ${year}`,

        `${dd} ${short}, ${year}`,
        `${day} ${short}, ${year}`,

        `${short} ${dd}, ${year}`,
        `${short} ${day}, ${year}`
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

    function containsDate(source, year, month, day) {
      const text = textForDate(source);

      const variants =
        dateVariants(year, month, day);

      if (
        variants.some(v =>
          text.includes(cleanText(v))
        )
      ) {
        return true;
      }

      const full =
        escapeRegExp(monthName(month));

      const short =
        escapeRegExp(shortMonthName(month));

      const d =
        String(day);

      const y =
        String(year);

      const patterns = [
        new RegExp(
          `\\b${d}\\s+${full}\\s*,?\\s+${y}\\b`,
          "i"
        ),
        new RegExp(
          `\\b${full}\\s+${d}\\s*,?\\s+${y}\\b`,
          "i"
        ),
        new RegExp(
          `\\b${d}\\s+${short}\\s*,?\\s+${y}\\b`,
          "i"
        ),
        new RegExp(
          `\\b${short}\\s+${d}\\s*,?\\s+${y}\\b`,
          "i"
        )
      ];

      return patterns.some(regex =>
        regex.test(text)
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

      if (
        !containsDate(
          source,
          next.year,
          next.month,
          next.day
        )
      ) {
        return false;
      }

      const text =
        textForDate(source);

      return (
        /\butc\b/i.test(text) ||
        /\bgmt\b/i.test(text)
      );
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

    // ============================================================
    // 7. HISTORICAL CONTAMINATION
    // ============================================================

    function obviousHistoricalFixture(source) {
      const text =
        textForDate(source);

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
        "2026-07-27"
      ];

      if (
        historicalPatterns.some(
          p => text.includes(p)
        )
      ) {
        return !containsTargetDate(source);
      }

      return false;
    }

    // ============================================================
    // 8. TEAM PATTERNS
    // ============================================================

    function requestedTeamPatterns(identity) {
      switch (identity) {
        case "DEPORTES_CONCEPCION":
          return [
            "deportes concepcion",
            "d concepcion",
            "d. concepcion",
            "deportes-concepcion",
            "deportesconcepcion"
          ];

        case "UNIVERSIDAD_DE_CONCEPCION":
          return [
            "universidad de concepcion",
            "u de concepcion",
            "u concepcion",
            "univ de concepcion",
            "universidad-de-concepcion",
            "universidaddeconcepcion"
          ];

        case "OHIGGINS":
          return [
            "ohiggins",
            "o higgins",
            "o-higgins"
          ];

        default:
          return [];
      }
    }

    function containsRequestedTeam(text, identity) {
      return requestedTeamPatterns(identity)
        .some(pattern =>
          text.includes(
            cleanText(pattern)
          )
        );
    }

    // ============================================================
    // 9. STRICT FIXTURE DETECTION
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
          strength: "NON_SENIOR_FIXTURE"
        };
      }

      const homeInTitle =
        homePatterns.some(p =>
          titleText.includes(
            cleanText(p)
          )
        );

      const awayInTitle =
        awayPatterns.some(p =>
          titleText.includes(
            cleanText(p)
          )
        );

      if (
        homeInTitle &&
        awayInTitle
      ) {
        return {
          match: true,
          strength: "TITLE_BOTH_TEAMS"
        };
      }

      const pairRegex =
        new RegExp(
          `(?:${homePatterns.map(escapeRegExp).join("|")})` +
          `\\s*(?:vs\\.?|v\\.?|-|–)` +
          `\\s*` +
          `(?:${awayPatterns.map(escapeRegExp).join("|")})` +
          `|` +
          `(?:${awayPatterns.map(escapeRegExp).join("|")})` +
          `\\s*(?:vs\\.?|v\\.?|-|–)` +
          `\\s*` +
          `(?:${homePatterns.map(escapeRegExp).join("|")})`,
          "i"
        );

      if (
        pairRegex.test(bodyText)
      ) {
        return {
          match: true,
          strength: "EXPLICIT_FIXTURE_PAIR"
        };
      }

      /*
       * Nearby current-fixture context.
       */
      const homePositions = [];
      const awayPositions = [];

      for (const pattern of homePatterns) {
        let index =
          bodyText.indexOf(
            cleanText(pattern)
          );

        while (index >= 0) {
          homePositions.push(index);

          index =
            bodyText.indexOf(
              cleanText(pattern),
              index + 1
            );
        }
      }

      for (const pattern of awayPatterns) {
        let index =
          bodyText.indexOf(
            cleanText(pattern)
          );

        while (index >= 0) {
          awayPositions.push(index);

          index =
            bodyText.indexOf(
              cleanText(pattern),
              index + 1
            );
        }
      }

      let closestDistance = Infinity;

      for (const hi of homePositions) {
        for (const ai of awayPositions) {
          closestDistance =
            Math.min(
              closestDistance,
              Math.abs(hi - ai)
            );
        }
      }

      if (
        closestDistance <= 180
      ) {
        const homeIndex =
          homePositions.find(
            hi =>
              awayPositions.some(
                ai =>
                  Math.abs(hi - ai) <= 180
              )
          );

        const awayIndex =
          awayPositions.find(
            ai =>
              Math.abs(
                ai - homeIndex
              ) <= 180
          );

        if (
          homeIndex !== undefined &&
          awayIndex !== undefined
        ) {
          const start =
            Math.max(
              0,
              Math.min(
                homeIndex,
                awayIndex
              ) - 120
            );

          const end =
            Math.min(
              bodyText.length,
              Math.max(
                homeIndex,
                awayIndex
              ) + 240
            );

          const nearby =
            bodyText.substring(
              start,
              end
            );

          const fixtureLanguage =
            /\btoday\b|\btonight\b|\bmatch\b|\bfixture\b|\bgame\b|\bkickoff\b|\bkick-off\b|\bprediction\b|\bodds\b|\blineup\b|\bstarting xi\b|\bnext match\b|\bnext fixture\b/i
              .test(nearby);

          if (fixtureLanguage) {
            return {
              match: true,
              strength:
                "NEARBY_FIXTURE_CONTEXT"
            };
          }
        }
      }

      const homeInBody =
        homePatterns.some(p =>
          bodyText.includes(
            cleanText(p)
          )
        );

      const awayInBody =
        awayPatterns.some(p =>
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
    // 10. CATEGORY RELEVANCE
    // ============================================================

    function categoryRelevant(source) {
      const fixture =
        fixtureIdentityPair(source);

      const ids =
        sourceIdentities(source);

      if (source.type === "h2h") {
        return fixture.match;
      }

      if (source.type === "form") {
        const hasHome =
          ids.includes(
            requestedHomeIdentity
          );

        const hasAway =
          ids.includes(
            requestedAwayIdentity
          );

        return (
          hasHome ||
          hasAway
        );
      }

      if (
        source.type === "stats" ||
        source.type === "injuries"
      ) {
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
          source.type === "injuries"
        ) {
          return (
            fixture.match &&
            (hasHome || hasAway)
          );
        }

        return (
          fixture.match ||
          hasHome ||
          hasAway
        );
      }

      if (
        source.type === "lineups" ||
        source.type === "odds"
      ) {
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
      const fixture =
        fixtureIdentityPair(source);

      const exactDate =
        containsTargetDate(source);

      const utcNextDay =
        containsUTCNextDayDate(source);

      const today =
        containsToday(source);

      const categoryOk =
        categoryRelevant(source);

      const isH2H =
        source.type === "h2h";

      let currentFixtureUsable = false;

      /*
       * FORM:
       * recent historical matches are useful, but are not
       * themselves current fixture evidence.
       */
      if (source.type === "form") {
        currentFixtureUsable = false;
      }

      /*
       * H2H:
       * historical target-vs-target sources remain usable.
       */
      else if (isH2H) {
        currentFixtureUsable =
          categoryOk &&
          fixture.match &&
          (
            exactDate ||
            utcNextDay ||
            today
          );
      }

      /*
       * ALL CURRENT-FIXTURE CATEGORIES:
       *
       * One unified rule.
       */
      else {
        currentFixtureUsable =
          categoryOk &&
          fixture.match &&
          (
            exactDate ||
            utcNextDay ||
            today
          );
      }

      if (
        obviousHistoricalFixture(source) &&
        !exactDate
      ) {
        currentFixtureUsable = false;
      }

      return {
        identities:
          sourceIdentities(source),

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

        usable:
          categoryOk,

        currentFixtureUsable
      };
    }

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

    /*
     * IMPORTANT V3.11 FIX:
     *
     * Market evidence may appear under either the "stats"
     * search or the "odds" search.
     */
    function currentMarketSources() {
      const map = new Map();

      for (const source of assessedSources) {
        if (
          !source.currentFixtureUsable
        ) {
          continue;
        }

        if (
          source.type !== "stats" &&
          source.type !== "odds"
        ) {
          continue;
        }

        const key =
          `${source.url}|${source.title}|${source.snippet}`;

        map.set(key, source);
      }

      return [...map.values()];
    }

    const marketSources =
      currentMarketSources();

    // ============================================================
    // 12. H2H
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
            source.todayContext,

          currentFixture:
            source.currentFixtureUsable
        }));

    // ============================================================
    // 13. FORM
    // ============================================================

    const form = {
      home: [],
      away: [],

      homeMeta: {
        requested: 5,
        extracted: 0,
        complete: false
      },

      awayMeta: {
        requested: 5,
        extracted: 0,
        complete: false
      }
    };

    function inferResultFromScore(
      teamScore,
      opponentScore
    ) {
      if (teamScore > opponentScore) {
        return "W";
      }

      if (teamScore < opponentScore) {
        return "L";
      }

      return "D";
    }

    function pushFormResult(
      output,
      identity,
      scoreA,
      scoreB,
      evidence,
      source
    ) {
      const a = Number(scoreA);
      const b = Number(scoreB);

      if (
        !Number.isFinite(a) ||
        !Number.isFinite(b) ||
        a > 15 ||
        b > 15
      ) {
        return;
      }

      addUnique(
        output,
        {
          result:
            inferResultFromScore(a, b),

          score:
            `${a}-${b}`,

          team:
            identity,

          evidence:
            evidence.trim(),

          source:
            source.url,

          title:
            source.title
        },
        [
          "result",
          "score",
          "source"
        ]
      );
    }

    function extractTeamForm(
      source,
      identity
    ) {
      const output = [];

      if (
        !hasIdentity(
          source,
          identity
        )
      ) {
        return output;
      }

      const text =
        cleanText(`
          ${source.title}
          ${source.snippet}
        `);

      /*
       * Pattern 1:
       *
       * 2-0 win at Cobresal
       * 1-1 draw vs Coquimbo Unido
       * 0-1 loss to ...
       */
      const resultPatterns = [
        /(\d{1,2})\s*-\s*(\d{1,2})\s+(win|wins|won|draw|drew|loss|lost|defeat|defeated)\b/gi,

        /(?:win|wins|won)\s+(\d{1,2})\s*-\s*(\d{1,2})/gi,

        /(?:draw|drew)\s+(\d{1,2})\s*-\s*(\d{1,2})/gi,

        /(?:loss|lost|defeat|defeated)\s+(\d{1,2})\s*-\s*(\d{1,2})/gi
      ];

      for (const regex of resultPatterns) {
        const matches =
          [...text.matchAll(regex)];

        for (const m of matches) {
          let a;
          let b;

          /*
           * For:
           * 2-0 win
           * score is directly m[1], m[2].
           */
          if (
            /^\d/.test(m[0])
          ) {
            a = m[1];
            b = m[2];
          } else {
            a = m[1];
            b = m[2];
          }

          const start =
            Math.max(
              0,
              m.index - 100
            );

          const end =
            Math.min(
              text.length,
              m.index + 140
            );

          pushFormResult(
            output,
            identity,
            a,
            b,
            text.substring(start, end),
            source
          );
        }
      }

      /*
       * Pattern 2:
       *
       * date ... 2-0 win
       *
       * Useful for sources where the date is immediately
       * before the result.
       */
      const datedScore =
        /(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[^0-9]{0,25}\d{1,2}(?:st|nd|rd|th)?[^0-9]{0,25}\d{4}[^0-9]{0,80}(\d{1,2})\s*-\s*(\d{1,2})\s+(win|wins|won|draw|drew|loss|lost|defeat|defeated)\b/gi;

      for (const m of text.matchAll(datedScore)) {
        const start =
          Math.max(
            0,
            m.index - 40
          );

        const end =
          Math.min(
            text.length,
            m.index + 160
          );

        pushFormResult(
          output,
          identity,
          m[1],
          m[2],
          text.substring(start, end),
          source
        );
      }

      return output;
    }

    for (
      const source of
      usableCategory("form")
    ) {
      /*
       * The current target fixture is never historical form.
       */
      if (
        source.fixtureMatch
      ) {
        continue;
      }

      if (
        hasIdentity(
          source,
          requestedHomeIdentity
        )
      ) {
        const extracted =
          extractTeamForm(
            source,
            requestedHomeIdentity
          );

        for (const item of extracted) {
          addUnique(
            form.home,
            item,
            [
              "result",
              "score",
              "source"
            ]
          );
        }
      }

      if (
        hasIdentity(
          source,
          requestedAwayIdentity
        )
      ) {
        const extracted =
          extractTeamForm(
            source,
            requestedAwayIdentity
          );

        for (const item of extracted) {
          addUnique(
            form.away,
            item,
            [
              "result",
              "score",
              "source"
            ]
          );
        }
      }
    }

    form.home =
      form.home.slice(0, 10);

    form.away =
      form.away.slice(0, 10);

    form.homeMeta.extracted =
      form.home.length;

    form.awayMeta.extracted =
      form.away.length;

    form.homeMeta.complete =
      form.home.length >= 5;

    form.awayMeta.complete =
      form.away.length >= 5;

    // ============================================================
    // 14. GOALS
    // ============================================================

    const goals = {
      home: {},
      away: {}
    };

    /*
     * Only explicit statistical language is accepted.
     */
    for (const source of marketSources) {
      const text =
        cleanText(`
          ${source.title}
          ${source.snippet}
        `);

      const homePatterns =
        requestedTeamPatterns(
          requestedHomeIdentity
        );

      const awayPatterns =
        requestedTeamPatterns(
          requestedAwayIdentity
        );

      for (const pattern of homePatterns) {
        const re =
          new RegExp(
            escapeRegExp(pattern) +
            "[^\\n.]{0,80}?" +
            "(\\d+(?:\\.\\d+)?)\\s*" +
            "(?:goals?\\s*(?:per\\s*match|pg|average|avg)?)",
            "i"
          );

        const m =
          text.match(re);

        if (m) {
          goals.home =
            {
              value:
                Number(m[1]),

              source:
                source.url,

              title:
                source.title,

              evidence:
                m[0]
            };

          break;
        }
      }

      for (const pattern of awayPatterns) {
        const re =
          new RegExp(
            escapeRegExp(pattern) +
            "[^\\n.]{0,80}?" +
            "(\\d+(?:\\.\\d+)?)\\s*" +
            "(?:goals?\\s*(?:per\\s*match|pg|average|avg)?)",
            "i"
          );

        const m =
          text.match(re);

        if (m) {
          goals.away =
            {
              value:
                Number(m[1]),

              source:
                source.url,

              title:
                source.title,

              evidence:
                m[0]
            };

          break;
        }
      }
    }

    // ============================================================
    // 15. xG
    // ============================================================

    const xg = {
      home: [],
      away: [],
      combined: [],
      raw: []
    };

    for (const source of marketSources) {
      const text =
        `${source.title} ${source.snippet}`;

      const combinedMatches = [
        ...text.matchAll(
          /(?:combined|total)\s*(?:xg|expected goals)\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
        )
      ];

      for (const m of combinedMatches) {
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
            },
            [
              "value",
              "source"
            ]
          );
        }
      }

      const homePatterns =
        requestedTeamPatterns(
          requestedHomeIdentity
        );

      const awayPatterns =
        requestedTeamPatterns(
          requestedAwayIdentity
        );

      for (const pattern of homePatterns) {
        const escaped =
          escapeRegExp(pattern);

        const patterns = [
          new RegExp(
            escaped +
            "[^\\n.]{0,100}?" +
            "(\\d+(?:\\.\\d+)?)\\s*xg\\b",
            "i"
          ),

          new RegExp(
            "(\\d+(?:\\.\\d+)?)\\s*xg\\b[^\\n.]{0,100}?" +
            escaped,
            "i"
          )
        ];

        for (const regex of patterns) {
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
                },
                [
                  "value",
                  "source"
                ]
              );
            }

            break;
          }
        }
      }

      for (const pattern of awayPatterns) {
        const escaped =
          escapeRegExp(pattern);

        const patterns = [
          new RegExp(
            escaped +
            "[^\\n.]{0,100}?" +
            "(\\d+(?:\\.\\d+)?)\\s*xg\\b",
            "i"
          ),

          new RegExp(
            "(\\d+(?:\\.\\d+)?)\\s*xg\\b[^\\n.]{0,100}?" +
            escaped,
            "i"
          )
        ];

        for (const regex of patterns) {
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
                },
                [
                  "value",
                  "source"
                ]
              );
            }

            break;
          }
        }
      }

      if (
        /\bxg\b|\bexpected goals\b/i.test(text)
      ) {
        addUnique(
          xg.raw,
          {
            text:
              source.snippet,

            source:
              source.url,

            title:
              source.title
          },
          [
            "source",
            "title"
          ]
        );
      }
    }

    // ============================================================
    // 16. BTTS
    // ============================================================

    const btts = {
      home: null,
      away: null,
      probability: null,
      evidence: [],
      odds: []
    };

    for (const source of marketSources) {
      const text =
        `${source.title} ${source.snippet}`;

      const hasBTTSContext =
        /\bbtts\b|\bboth teams to score\b|\bgg\b/i
          .test(text);

      if (!hasBTTSContext) {
        continue;
      }

      const yesNoPercentage = [
        ...text.matchAll(
          /\b(yes|no)\b\s+(?:(\d+(?:\.\d+)?)\s+)?(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (const m of yesNoPercentage) {
        /*
         * Handles:
         *
         * Yes 52%
         * Yes 1.79 52%
         */
        const possibleOdds =
          m[2]
            ? Number(m[2])
            : null;

        const percentage =
          Number(m[3]);

        const evidence = {
          answer:
            m[1].toUpperCase(),

          percentage,

          source:
            source.url,

          title:
            source.title
        };

        if (
          possibleOdds !== null &&
          possibleOdds >= 1.01 &&
          possibleOdds <= 100
        ) {
          evidence.odds =
            possibleOdds;

          addUnique(
            btts.odds,
            {
              answer:
                m[1].toUpperCase(),

              value:
                possibleOdds,

              percentage,

              source:
                source.url,

              title:
                source.title
            },
            [
              "answer",
              "value",
              "percentage",
              "source"
            ]
          );
        }

        addUnique(
          btts.evidence,
          evidence,
          [
            "answer",
            "percentage",
            "source"
          ]
        );
      }

      const explicitBTTS =
        [
          ...text.matchAll(
            /both\s+teams\s+to\s+score\s+(yes|no)\s+(\d+(?:\.\d+)?)%/gi
          )
        ];

      for (const m of explicitBTTS) {
        addUnique(
          btts.evidence,
          {
            answer:
              m[1].toUpperCase(),

            percentage:
              Number(m[2]),

            source:
              source.url,

            title:
              source.title
          },
          [
            "answer",
            "percentage",
            "source"
          ]
        );
      }

      /*
       * Explicit decimal BTTS odds:
       *
       * BTTS Yes 1.79
       * Both Teams To Score Yes 1.79
       */
      const explicitOdds =
        [
          ...text.matchAll(
            /(?:btts|both teams to score)[^0-9]{0,20}(yes|no)?[^0-9]{0,10}(\d+(?:\.\d+)?)/gi
          )
        ];

      for (const m of explicitOdds) {
        const value =
          Number(m[2]);

        if (
          value >= 1.01 &&
          value <= 100
        ) {
          addUnique(
            btts.odds,
            {
              answer:
                m[1]
                  ? m[1].toUpperCase()
                  : null,

              value,

              source:
                source.url,

              title:
                source.title
            },
            [
              "answer",
              "value",
              "source"
            ]
          );
        }
      }
    }

    if (
      btts.evidence.length > 0
    ) {
      const yes =
        btts.evidence.find(
          x =>
            x.answer === "YES"
        );

      if (yes) {
        btts.probability =
          yes.percentage;
      }
    }

    // ============================================================
    // 17. OVER / UNDER
    // ============================================================

    const overUnder = {
      home: {},
      away: {},
      evidence: [],
      odds: []
    };

    for (const source of marketSources) {
      const text =
        `${source.title} ${source.snippet}`;

      /*
       * Standard:
       * Over 2.5 54%
       * Under 2.5 46%
       */
      const percentageMatches = [
        ...text.matchAll(
          /\b(over|under)\s*(?:\(|\[)?(\d+(?:[.,]\d+)?)(?:\)|\])?\s*(?:goals?)?\s*(?:[:\-]?\s*)?(\d+(?:\.\d+)?)%/gi
        )
      ];

      for (const m of percentageMatches) {
        const line =
          Number(
            String(m[2]).replace(",", ".")
          );

        addUnique(
          overUnder.evidence,
          {
            selection:
              m[1].toUpperCase(),

            line,

            percentage:
              Number(m[3]),

            source:
              source.url,

            title:
              source.title
          },
          [
            "selection",
            "line",
            "percentage",
            "source"
          ]
        );
      }

      /*
       * Scores24-style:
       *
       * Total goals Over (1,5). 1.3
       */
      const explicitSelectionOdds = [
        ...text.matchAll(
          /\b(?:total\s+goals?\s*)?(over|under)\s*\(\s*(\d+(?:[.,]\d+)?)\s*\)\s*[\.:]?\s*(\d+(?:\.\d+)?)/gi
        )
      ];

      for (const m of explicitSelectionOdds) {
        const line =
          Number(
            String(m[2]).replace(",", ".")
          );

        const value =
          Number(m[3]);

        if (
          line >= 0 &&
          line <= 20 &&
          value >= 1.01 &&
          value <= 100
        ) {
          const item = {
            selection:
              m[1].toUpperCase(),

            line,

            value,

            source:
              source.url,

            title:
              source.title
          };

          addUnique(
            overUnder.odds,
            item,
            [
              "selection",
              "line",
              "value",
              "source"
            ]
          );
        }
      }

      /*
       * Standard explicit odds:
       *
       * Over 2.5 odds 2.06
       */
      const standardOdds = [
        ...text.matchAll(
          /\b(over|under)\s*(\d+(?:\.\d+)?)\s*(?:goals?)?\s*(?:odds?|price)\s*(?:of|:)?\s*(\d+(?:\.\d+)?)/gi
        )
      ];

      for (const m of standardOdds) {
        const line =
          Number(m[2]);

        const value =
          Number(m[3]);

        if (
          line >= 0 &&
          line <= 20 &&
          value >= 1.01 &&
          value <= 100
        ) {
          addUnique(
            overUnder.odds,
            {
              selection:
                m[1].toUpperCase(),

              line,

              value,

              source:
                source.url,

              title:
                source.title
            },
            [
              "selection",
              "line",
              "value",
              "source"
            ]
          );
        }
      }

      /*
       * Preserve RatingBet-style evidence without guessing
       * which decimal belongs to Over or Under when the source
       * does not label the order.
       */
      if (
        /\b2\.5\b/.test(text) &&
        /\b46%\b/.test(text) &&
        /\b54%\b/.test(text)
      ) {
        addUnique(
          overUnder.evidence,
          {
            selection:
              null,

            line:
              2.5,

            percentage:
              null,

            rawMarket:
              source.snippet,

            source:
              source.url,

            title:
              source.title,

            parsing:
              "UNRESOLVED_LABELED_ORDER"
          },
          [
            "line",
            "rawMarket",
            "source"
          ]
        );
      }
    }

    // ============================================================
    // 18. INJURIES
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
    // 19. LINEUPS
    // ============================================================

    const lineups = {
      home: [],
      away: [],
      evidence: []
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

      return "unknown";
    }

    function sourceHasActualLineupEvidence(source) {
      const text =
        cleanText(`
          ${source.title}
          ${source.snippet}
        `);

      return (
        /\blineup\b|\blineups\b|\bstarting xi\b|\bstarting eleven\b|\bpredicted xi\b|\bconfirmed lineup\b|\bprobable lineup\b/i
          .test(text)
      );
    }

    for (
      const source of
      currentFixtureCategory("lineups")
    ) {
      if (
        !sourceHasActualLineupEvidence(source)
      ) {
        lineups.evidence.push({
          type:
            "fixture_lineup_context",

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

        continue;
      }

      const type =
        lineupType(source);

      const ids =
        sourceIdentities(source);

      if (
        homeIdentityValid &&
        ids.includes(
          requestedHomeIdentity
        )
      ) {
        lineups.home.push({
          team:
            requestedHomeIdentity,

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
        ids.includes(
          requestedAwayIdentity
        )
      ) {
        lineups.away.push({
          team:
            requestedAwayIdentity,

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
    // 20. ODDS
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
        odds.evidence.some(e =>
          JSON.stringify(e) ===
          JSON.stringify(item)
        );

      if (!exists) {
        odds.evidence.push(item);
      }
    }

    function oddsBase(source) {
      return {
        source:
          source.url,

        title:
          source.title,

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

        currentFixtureUsable:
          source.currentFixtureUsable
      };
    }

    for (const source of marketSources) {
      const text =
        `${source.title} ${source.snippet}`;

      /*
       * 1X2:
       *
       * 1: 2.35 X: 3.20 2: 2.95
       */
      const colon =
        text.match(
          /\b1\s*[:\-]\s*(\d+(?:\.\d+)?)\s+X\s*[:\-]\s*(\d+(?:\.\d+)?)\s+2\s*[:\-]\s*(\d+(?:\.\d+)?)/i
        );

      /*
       * 1 2.32 X 3.53 2 3.20
       */
      const spaced =
        text.match(
          /\b1\s+(\d+(?:\.\d+)?)\s+X\s+(\d+(?:\.\d+)?)\s+2\s+(\d+(?:\.\d+)?)/i
        );

      const oneXTwo =
        colon || spaced;

      if (oneXTwo) {
        const h =
          Number(oneXTwo[1]);

        const d =
          Number(oneXTwo[2]);

        const a =
          Number(oneXTwo[3]);

        if (
          h >= 1.01 &&
          d >= 1.01 &&
          a >= 1.01
        ) {
          addOddsEvidence({
            type:
              "1X2_decimal_odds",

            home:
              h,

            draw:
              d,

            away:
              a,

            ...oddsBase(source)
          });
        }
      }

      /*
       * Probability:
       *
       * Probability: 46.67%
       */
      for (
        const m of text.matchAll(
          /\bprobability\s*[:\-]?\s*(\d+(?:\.\d+)?)%/gi
        )
      ) {
        addOddsEvidence({
          type:
            "probability",

          percentage:
            Number(m[1]),

          ...oddsBase(source)
        });
      }

      /*
       * Explicit home/draw/away probability.
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
       */
      for (
        const m of text.matchAll(
          /\b(?:odds?|price)\s*(?:of|:)\s*(\d+(?:\.\d+)?)/gi
        )
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

            ...oddsBase(source)
          });
        }
      }
    }

    // ============================================================
    // 21. PRIMARY 1X2 ODDS
    // ============================================================

    const primary1X2 =
      odds.evidence.find(
        e =>
          e.type ===
            "1X2_decimal_odds" &&
          e.currentFixtureUsable === true
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
    // 22. PRIMARY BTTS ODDS
    // ============================================================

    const primaryBTTSOdds =
      btts.odds.find(
        e =>
          e.value >= 1.01 &&
          e.value <= 100
      );

    if (
      primaryBTTSOdds &&
      btts.odds.length > 0
    ) {
      btts.primaryOdds =
        primaryBTTSOdds.value;
    } else {
      btts.primaryOdds =
        null;
    }

    // ============================================================
    // 23. PRIMARY O/U
    // ============================================================

    const primaryOUOdds =
      overUnder.odds.length > 0
        ? overUnder.odds[0]
        : null;

    if (primaryOUOdds) {
      overUnder.primary =
        {
          selection:
            primaryOUOdds.selection,

          line:
            primaryOUOdds.line,

          odds:
            primaryOUOdds.value
        };
    } else {
      overUnder.primary =
        null;
    }

    // ============================================================
    // 24. SOURCE REPORT
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
    // 25. CONTAMINATION DETECTION
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
    // 26. IDENTITY REPORT
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
    // 27. DATA AVAILABILITY
    // ============================================================

    const formAny =
      form.home.length > 0 ||
      form.away.length > 0;

    const formBothTeams =
      form.home.length > 0 &&
      form.away.length > 0;

    const statsAvailable =
      xg.home.length > 0 ||
      xg.away.length > 0 ||
      xg.combined.length > 0 ||
      btts.evidence.length > 0 ||
      overUnder.evidence.length > 0 ||
      Object.keys(goals.home).length > 0 ||
      Object.keys(goals.away).length > 0;

    const actualLineupsAvailable =
      lineups.home.length > 0 ||
      lineups.away.length > 0;

    const oneXTwoAvailable =
      odds.home !== null &&
      odds.draw !== null &&
      odds.away !== null;

    const dataAvailability = {
      identity:
        identity.homeStatus === "RESOLVED" &&
        identity.awayStatus === "RESOLVED",

      form:
        formAny,

      formBothTeams,

      h2h:
        h2h.length > 0,

      stats:
        statsAvailable,

      injuries:
        injuries.home.length > 0 ||
        injuries.away.length > 0,

      lineups:
        actualLineupsAvailable,

      odds:
        oneXTwoAvailable,

      btts:
        btts.evidence.length > 0,

      bttsOdds:
        btts.odds.length > 0,

      overUnder:
        overUnder.evidence.length > 0,

      overUnderOdds:
        overUnder.odds.length > 0,

      xg:
        xg.home.length > 0 ||
        xg.away.length > 0 ||
        xg.combined.length > 0
    };

    // ============================================================
    // 28. CURRENT FIXTURE AVAILABILITY
    // ============================================================

    const currentFixtureAvailability = {
      form:
        formAny,

      formBothTeams,

      stats:
        statsAvailable,

      injuries:
        injuries.home.length > 0 ||
        injuries.away.length > 0,

      lineups:
        actualLineupsAvailable,

      odds:
        oneXTwoAvailable,

      btts:
        btts.evidence.length > 0,

      bttsOdds:
        btts.odds.length > 0,

      overUnder:
        overUnder.evidence.length > 0,

      overUnderOdds:
        overUnder.odds.length > 0,

      xg:
        xg.home.length > 0 ||
        xg.away.length > 0 ||
        xg.combined.length > 0,

      h2h:
        h2h.length > 0
    };

    // ============================================================
    // 29. QUALITY
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

    let qualityScore = 0;

    if (
      identity.homeStatus === "RESOLVED" &&
      identity.awayStatus === "RESOLVED"
    ) {
      qualityScore += 0.20;
    }

    if (form.home.length > 0) {
      qualityScore += 0.10;
    }

    if (form.away.length > 0) {
      qualityScore += 0.10;
    }

    if (formBothTeams) {
      qualityScore += 0.10;
    }

    if (statsAvailable) {
      qualityScore += 0.10;
    }

    if (
      xg.home.length > 0 ||
      xg.away.length > 0
    ) {
      qualityScore += 0.10;
    }

    if (btts.evidence.length > 0) {
      qualityScore += 0.05;
    }

    if (overUnder.evidence.length > 0) {
      qualityScore += 0.05;
    }

    if (oneXTwoAvailable) {
      qualityScore += 0.10;
    }

    if (btts.odds.length > 0) {
      qualityScore += 0.025;
    }

    if (overUnder.odds.length > 0) {
      qualityScore += 0.025;
    }

    if (actualLineupsAvailable) {
      qualityScore += 0.05;
    }

    if (
      injuries.home.length > 0 ||
      injuries.away.length > 0
    ) {
      qualityScore += 0.05;
    }

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

      extractedFormHome:
        form.home.length,

      extractedFormAway:
        form.away.length,

      extractedXGHome:
        xg.home.length,

      extractedXGAway:
        xg.away.length,

      extractedBTTS:
        btts.evidence.length > 0,

      extractedBTTSOdds:
        btts.odds.length > 0,

      extracted1X2Odds:
        oneXTwoAvailable,

      extractedOU:
        overUnder.evidence.length > 0,

      extractedOUOdds:
        overUnder.odds.length > 0,

      usableText:
        results.length > 0,

      score:
        Number(
          Math.min(
            1,
            qualityScore
          ).toFixed(2)
        )
    };

    // ============================================================
    // 30. WARNINGS
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

    if (
      form.home.length === 0
    ) {
      warnings.push(
        "No reliable recent form was extracted for the home team."
      );
    }

    if (
      form.away.length === 0
    ) {
      warnings.push(
        "No reliable recent form was extracted for the away team."
      );
    }

    if (
      form.home.length > 0 &&
      form.home.length < 5
    ) {
      warnings.push(
        `Only ${form.home.length} recent home-team form result(s) were extracted; fewer than 5 were available in the returned source text.`
      );
    }

    if (
      form.away.length > 0 &&
      form.away.length < 5
    ) {
      warnings.push(
        `Only ${form.away.length} recent away-team form result(s) were extracted; fewer than 5 were available in the returned source text.`
      );
    }

    if (!statsAvailable) {
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

    if (
      injuries.home.length === 0 &&
      injuries.away.length === 0
    ) {
      warnings.push(
        "No reliable current injury/suspension evidence was extracted."
      );
    }

    if (
      !actualLineupsAvailable
    ) {
      warnings.push(
        "No actual current lineup evidence was extracted; fixture-level lineup context is kept separately."
      );
    }

    if (!oneXTwoAvailable) {
      warnings.push(
        "No complete current 1X2 decimal odds set was extracted."
      );
    } else {
      warnings.push(
        "Current 1X2 decimal odds were successfully extracted from current-fixture evidence."
      );
    }

    if (
      btts.evidence.length > 0
    ) {
      warnings.push(
        "BTTS probability and decimal odds are stored separately."
      );
    }

    if (
      btts.odds.length > 0
    ) {
      warnings.push(
        "Current BTTS decimal odds were extracted."
      );
    }

    if (
      overUnder.odds.length > 0
    ) {
      warnings.push(
        "Current Over/Under decimal odds were extracted where the source explicitly identified the selection, line and price."
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
      "Missing statistics are not guessed."
    );

    // ============================================================
    // 31. READINESS
    // ============================================================

    const identityReady =
      identity.homeStatus === "RESOLVED" &&
      identity.awayStatus === "RESOLVED";

    /*
     * V3.11:
     *
     * Source existence alone is NOT enough.
     *
     * We need actual structured information from BOTH teams.
     */
    const formReady =
      form.home.length > 0 &&
      form.away.length > 0;

    /*
     * Current stats can be BTTS, O/U, xG or goals.
     */
    const statsReady =
      statsAvailable;

    /*
     * Core data requirement:
     * correct identity + some form for BOTH teams +
     * at least one current structured statistical market.
     */
    const dataReady =
      identityReady &&
      formReady &&
      statsReady;

    const analysisReady =
      identityReady &&
      formReady &&
      statsReady;

    // ============================================================
    // 32. FINAL RESPONSE
    // ============================================================

    return res.status(200).json({
      success: true,

      version:
        "V3.11",

      normalized: {
        match: {
          home:
            homeInput,

          away:
            awayInput,

          date:
            matchDate,

          year:
            match.year ||
            targetDate?.year ||
            null
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
        "V3.11",

      error:
        "Web data normalization failed.",

      details:
        error?.message ||
        String(error)
    });
  }
}
