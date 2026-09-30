// api/normalize-web.js
//
// TomsonStakes Web Evidence Normalizer
// V3.4
//
// Main V3.4 fixes:
// 1. RECENT is evaluated before generic HISTORICAL.
// 2. Supplied sourceType is NOT blindly trusted.
// 3. Historical match reports cannot become current injury/odds/lineup evidence.
// 4. Deportes Concepcion and Universidad de Concepcion are strictly separated.
// 5. Current fixture pages and historical H2H pages are separated.
// 6. Undated evidence stays isolated.
// 7. Recent form is based on actual recent match/form evidence.
// 8. Current odds/stats require the exact target pair.
// 9. Current injuries/lineups may be team-specific, but must be current/undated.
// 10. Every source carries audit information explaining how it was classified.
//
// Date parsing intentionally avoids relying on arbitrary Date.parse() behavior,
// because non-standard date strings can be implementation-dependent.
// See MDN Date.parse documentation.

"use strict";

const VERSION = "V3.4";

const MAX_RECENT_DAYS = 60;

const MAX_H2H_ITEMS = 12;
const MAX_CURRENT_ITEMS = 20;
const MAX_FORM_ITEMS = 20;
const MAX_INJURY_ITEMS = 20;
const MAX_LINEUP_ITEMS = 20;
const MAX_ODDS_ITEMS = 20;
const MAX_STATS_ITEMS = 20;

const RELEVANCE = Object.freeze({
  CURRENT_MATCH: "CURRENT_MATCH",
  RECENT: "RECENT",
  HISTORICAL: "HISTORICAL",
  FUTURE: "FUTURE",
  H2H_CONTEXT: "H2H_CONTEXT",
  MATCH_SPECIFIC_UNDATED: "MATCH_SPECIFIC_UNDATED",
  UNDATED_TEAM_SOURCE: "UNDATED_TEAM_SOURCE",
  UNDATED: "UNDATED",
  IRRELEVANT: "IRRELEVANT"
});

const SOURCE_TYPES = Object.freeze({
  FORM: "FORM",
  H2H: "H2H",
  STATS: "STATS",
  INJURIES: "INJURIES",
  LINEUPS: "LINEUPS",
  ODDS: "ODDS",
  MATCH: "MATCH",
  PREVIEW: "PREVIEW",
  PREDICTION: "PREDICTION",
  UNKNOWN: "UNKNOWN"
});


/* ==========================================================================
   HTTP HANDLER
   ========================================================================== */

async function handler(req, res) {
  try {
    if (req.method && req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed. Use POST."
      });
    }

    const body = req.body || {};

    const input =
      body.normalized &&
      typeof body.normalized === "object"
        ? body.normalized
        : body;

    const match = input.match || {};

    if (!match.home || !match.away || !match.date) {
      return res.status(400).json({
        ok: false,
        error:
          "Missing required match.home, match.away or match.date."
      });
    }

    const targetDate = normalizeTargetDate(match.date);

    if (!targetDate) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid match.date. Expected YYYY-MM-DD or a supported date format."
      });
    }

    const homeIdentity = buildTeamIdentity(match.home);
    const awayIdentity = buildTeamIdentity(match.away);

    const rawSources = collectSources(input);

    const normalizedSources = [];

    for (let i = 0; i < rawSources.length; i++) {
      const source = normalizeSource({
        raw: rawSources[i],
        index: i,
        match,
        targetDate,
        homeIdentity,
        awayIdentity
      });

      if (source) {
        normalizedSources.push(source);
      }
    }

    const acceptedSources = normalizedSources.filter(
      source =>
        !source.rejected &&
        source.relevance !== RELEVANCE.IRRELEVANT
    );

    const currentMatchSources = acceptedSources.filter(
      source =>
        source.relevance === RELEVANCE.CURRENT_MATCH
    );

    const recentSources = acceptedSources.filter(
      source =>
        source.relevance === RELEVANCE.RECENT
    );

    const historicalSources = acceptedSources.filter(
      source =>
        source.relevance === RELEVANCE.HISTORICAL
    );

    const futureSources = acceptedSources.filter(
      source =>
        source.relevance === RELEVANCE.FUTURE
    );

    const undatedSources = acceptedSources.filter(
      source =>
        source.relevance === RELEVANCE.MATCH_SPECIFIC_UNDATED ||
        source.relevance === RELEVANCE.UNDATED_TEAM_SOURCE ||
        source.relevance === RELEVANCE.UNDATED
    );

    const form = extractFormEvidence(
      acceptedSources
    );

    const h2h = extractH2HEvidence(
      acceptedSources
    );

    const statsEvidence = extractStatsEvidence(
      acceptedSources
    );

    const undatedStatsEvidence =
      extractUndatedStatsEvidence(
        acceptedSources
      );

    const injuries = extractInjuryEvidence(
      acceptedSources
    );

    const lineups = extractLineupEvidence(
      acceptedSources
    );

    const odds = extractOddsEvidence(
      acceptedSources
    );

    const undatedOddsEvidence =
      extractUndatedOddsEvidence(
        acceptedSources
      );

    const goals = extractGoalEvidence(
      acceptedSources
    );

    const xg = extractXGEvidence(
      acceptedSources
    );

    const btts = extractBTTSEvidence(
      acceptedSources
    );

    const overUnder =
      extractOverUnderEvidence(
        acceptedSources
      );

    const quality = buildQuality({
      allSources: normalizedSources,
      acceptedSources,
      currentMatchSources,
      recentSources,
      historicalSources,
      futureSources,
      undatedSources,
      form,
      h2h,
      statsEvidence,
      injuries,
      lineups,
      odds
    });

    const warnings = buildWarnings({
      normalizedSources,
      acceptedSources,
      currentMatchSources,
      recentSources,
      historicalSources,
      futureSources,
      undatedSources,
      form,
      h2h,
      statsEvidence,
      injuries,
      lineups,
      odds
    });

    const dataAvailability = {
      currentMatch:
        currentMatchSources.length > 0,

      recentForm:
        form.home.length > 0 ||
        form.away.length > 0,

      h2h:
        h2h.length > 0,

      goals:
        goals.home.length > 0 ||
        goals.away.length > 0 ||
        goals.combined.length > 0,

      xg:
        xg.home !== null ||
        xg.away !== null,

      btts:
        btts.value !== null,

      overUnder:
        overUnder.length > 0,

      stats:
        statsEvidence.length > 0,

      injuries:
        injuries.length > 0,

      lineups:
        lineups.confirmed.length > 0 ||
        lineups.predicted.length > 0,

      odds:
        odds.length > 0,

      undatedStats:
        undatedStatsEvidence.length > 0,

      undatedOdds:
        undatedOddsEvidence.length > 0
    };

    const analysisReady = {
      exactMatchEvidence:
        currentMatchSources.length > 0,

      recentEvidence:
        form.home.length > 0 &&
        form.away.length > 0,

      h2hEvidence:
        h2h.length > 0,

      marketEvidence:
        odds.length > 0,

      lineupEvidence:
        lineups.confirmed.length > 0 ||
        lineups.predicted.length > 0,

      injuryEvidence:
        injuries.length > 0,

      enoughForBasicAnalysis:
        currentMatchSources.length > 0 &&
        (
          form.home.length > 0 ||
          form.away.length > 0 ||
          h2h.length > 0 ||
          statsEvidence.length > 0
        ),

      warnings:
        warnings.length
    };

    return res.status(200).json({
      ok: true,
      version: VERSION,

      match: {
        ...match,
        date: targetDate
      },

      form,

      h2h,

      goals,

      xg,

      btts,

      overUnder,

      statsEvidence,

      undatedStatsEvidence,

      injuries,

      lineups,

      odds,

      undatedOddsEvidence,

      sources: normalizedSources,

      warnings,

      quality,

      dataAvailability,

      analysisReady
    });
  } catch (error) {
    console.error(
      "normalize-web V3.4 error:",
      error
    );

    return res.status(500).json({
      ok: false,
      version: VERSION,
      error: "Normalization failed.",
      message:
        process.env.NODE_ENV === "production"
          ? undefined
          : error.message
    });
  }
}


/* ==========================================================================
   SOURCE COLLECTION
   ========================================================================== */

function collectSources(input) {
  const result = [];

  if (Array.isArray(input.allResults)) {
    result.push(...input.allResults);
  }

  if (Array.isArray(input.results)) {
    result.push(...input.results);
  }

  if (Array.isArray(input.searches)) {
    for (const search of input.searches) {
      if (!search || typeof search !== "object") {
        continue;
      }

      if (Array.isArray(search.results)) {
        result.push(...search.results);
      }

      if (Array.isArray(search.allResults)) {
        result.push(...search.allResults);
      }
    }
  }

  return result.filter(Boolean);
}


/* ==========================================================================
   TEAM IDENTITY
   ========================================================================== */

function buildTeamIdentity(name) {
  const original = String(name || "").trim();
  const clean = cleanText(original);

  const identity = {
    original,
    clean,
    aliases: new Set()
  };

  /*
   * IMPORTANT:
   *
   * Deportes Concepcion
   * is NOT
   * Universidad de Concepcion.
   */

  if (
    clean.includes("deportes concepcion") ||
    clean === "concepcion" ||
    clean === "deportes concepcion fc"
  ) {
    [
      "deportes concepcion",
      "deportes concepcion fc",
      "deportes concepcion club",
      "d concepcion",
      "d concepcion fc",
      "d. concepcion",
      "cd concepcion",
      "cd. concepcion"
    ].forEach(alias =>
      identity.aliases.add(
        cleanText(alias)
      )
    );
  } else if (
    clean.includes("universidad de concepcion") ||
    clean.includes("univ de concepcion") ||
    clean === "u de concepcion"
  ) {
    [
      "universidad de concepcion",
      "universidad de concepcion fc",
      "univ de concepcion",
      "univ de concepcion fc",
      "univ. de concepcion",
      "u de concepcion",
      "u. de concepcion",
      "udec"
    ].forEach(alias =>
      identity.aliases.add(
        cleanText(alias)
      )
    );
  } else if (
    clean.includes("o higgins") ||
    clean.includes("ohiggins")
  ) {
    [
      "o higgins",
      "o'higgins",
      "ohiggins",
      "o higgins fc",
      "o'higgins fc",
      "ohiggins fc",
      "cd o higgins",
      "club deportivo o higgins"
    ].forEach(alias =>
      identity.aliases.add(
        cleanText(alias)
      )
    );
  } else {
    identity.aliases.add(clean);
  }

  return identity;
}


function containsTeam(text, identity) {
  if (!text || !identity) {
    return false;
  }

  const normalized = cleanText(text);

  for (const alias of identity.aliases) {
    if (!alias) {
      continue;
    }

    if (hasPhrase(normalized, alias)) {
      return true;
    }
  }

  return false;
}


function hasPhrase(text, phrase) {
  if (!text || !phrase) {
    return false;
  }

  const escaped = escapeRegex(phrase)
    .replace(/\s+/g, "\\s+");

  return new RegExp(
    "(^|[^a-z0-9])" +
    escaped +
    "([^a-z0-9]|$)",
    "i"
  ).test(text);
}


function containsWrongConcepcionClub(
  text,
  identity
) {
  if (!text || !identity) {
    return false;
  }

  const normalized = cleanText(text);

  const isDeportes =
    identity.clean.includes(
      "deportes concepcion"
    );

  const isUniversidad =
    identity.clean.includes(
      "universidad de concepcion"
    ) ||
    identity.clean.includes(
      "univ de concepcion"
    );

  if (isDeportes) {
    return (
      hasPhrase(
        normalized,
        "universidad de concepcion"
      ) ||
      hasPhrase(
        normalized,
        "univ de concepcion"
      ) ||
      hasPhrase(
        normalized,
        "u de concepcion"
      ) ||
      hasPhrase(
        normalized,
        "udec"
      )
    );
  }

  if (isUniversidad) {
    return (
      hasPhrase(
        normalized,
        "deportes concepcion"
      ) ||
      hasPhrase(
        normalized,
        "d concepcion"
      ) ||
      hasPhrase(
        normalized,
        "cd concepcion"
      )
    );
  }

  return false;
}


function determineTeamRelation(
  text,
  homeIdentity,
  awayIdentity
) {
  const normalized = cleanText(text);

  const wrongHome =
    containsWrongConcepcionClub(
      normalized,
      homeIdentity
    );

  const wrongAway =
    containsWrongConcepcionClub(
      normalized,
      awayIdentity
    );

  if (wrongHome || wrongAway) {
    return {
      relation: "IRRELEVANT",
      wrongClub: true,
      reason: "WRONG_CONCEPCION_CLUB"
    };
  }

  const hasHome =
    containsTeam(
      normalized,
      homeIdentity
    );

  const hasAway =
    containsTeam(
      normalized,
      awayIdentity
    );

  if (hasHome && hasAway) {
    return {
      relation: "EXACT_PAIR",
      wrongClub: false,
      reason: null
    };
  }

  if (hasHome) {
    return {
      relation: "HOME_ONLY",
      wrongClub: false,
      reason: null
    };
  }

  if (hasAway) {
    return {
      relation: "AWAY_ONLY",
      wrongClub: false,
      reason: null
    };
  }

  return {
    relation: "IRRELEVANT",
    wrongClub: false,
    reason: "NO_TARGET_TEAM"
  };
}


/* ==========================================================================
   SOURCE NORMALIZATION
   ========================================================================== */

function normalizeSource({
  raw,
  index,
  match,
  targetDate,
  homeIdentity,
  awayIdentity
}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const title = firstString(
    raw.title,
    raw.name,
    raw.headline
  );

  const source = firstString(
    raw.source,
    raw.domain,
    raw.publisher,
    raw.site
  );

  const url = firstString(
    raw.url,
    raw.link,
    raw.href
  );

  const snippet = firstString(
    raw.snippet,
    raw.description,
    raw.summary,
    raw.text
  );

  const bodyText = firstString(
    raw.text,
    raw.content,
    raw.description,
    raw.summary,
    raw.snippet
  );

  const text = cleanText(
    [
      title,
      source,
      url,
      snippet,
      bodyText
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (!text) {
    return null;
  }

  const suppliedType =
    normalizeSuppliedType(
      raw.type ||
      raw.sourceType ||
      raw.category ||
      raw.kind ||
      raw.dataType
    );

  const relationInfo =
    determineTeamRelation(
      text,
      homeIdentity,
      awayIdentity
    );

  const eventDateInfo =
    extractEventDate({
      title,
      url,
      snippet,
      bodyText,
      targetDate,
      homeIdentity,
      awayIdentity
    });

  const eventDate =
    eventDateInfo.date;

  const publicationDate =
    normalizeDateValue(
      raw.publishedDate ||
      raw.publicationDate ||
      raw.published_at ||
      raw.datePublished ||
      raw.createdAt
    );

  /*
   * Content-based type detection happens BEFORE supplied metadata.
   *
   * This fixes examples such as:
   *
   * suppliedType = INJURIES
   * title = "Deportes Concepcion 2 - 0 O'Higgins - Match Report"
   *
   * The effective type becomes MATCH.
   */

  const effectiveType =
    deriveEffectiveSourceType({
      suppliedType,
      title,
      url,
      snippet,
      bodyText,
      text,
      eventDate,
      targetDate,
      relation:
        relationInfo.relation
    });

  const h2hInfo =
    detectH2H({
      suppliedType,
      effectiveType,
      title,
      url,
      text,
      relation:
        relationInfo.relation,
      eventDate,
      targetDate
    });

  const relevanceInfo =
    classifyRelevance({
      eventDate,
      targetDate,
      relation:
        relationInfo.relation,
      effectiveType,
      suppliedType,
      h2h:
        h2hInfo.isH2H,
      title,
      url,
      text
    });

  const relevance =
    relevanceInfo.relevance;

  let rejected = false;
  let rejectionReason = null;

  if (
    relationInfo.relation ===
    "IRRELEVANT"
  ) {
    rejected = true;

    rejectionReason =
      relationInfo.reason ||
      "NO_TARGET_TEAM";
  }

  if (
    relevance ===
      RELEVANCE.IRRELEVANT &&
    !h2hInfo.isH2H
  ) {
    rejected = true;

    rejectionReason =
      rejectionReason ||
      relevanceInfo.reason ||
      "IRRELEVANT_SOURCE";
  }

  const dataRelevance =
    determineDataRelevance({
      relevance,
      effectiveType,
      h2h:
        h2hInfo.isH2H,
      relation:
        relationInfo.relation,
      eventDate,
      targetDate
    });

  const score =
    extractScoreFromText(
      text,
      homeIdentity,
      awayIdentity
    );

  const extracted = {
    score,

    stats:
      extractCurrentStats(text),

    injuries:
      extractInjuryText(text),

    lineupStatus:
      detectLineupStatus(text),

    odds:
      extractDecimalOdds(text),

    probabilities:
      extractProbabilities(text),

    goalMarkets:
      extractGoalMarkets(text),

    btts:
      extractBTTSValue(text),

    formMarkers:
      extractFormMarkers(text)
  };

  return {
    id:
      raw.id ||
      raw.resultId ||
      raw.sourceId ||
      `web-${index + 1}`,

    source:
      source || null,

    title:
      title || null,

    url:
      url || null,

    snippet:
      snippet || null,

    suppliedType,

    sourceType:
      effectiveType,

    relation:
      relationInfo.relation,

    eventDate:
      eventDate || null,

    eventDateConfidence:
      eventDateInfo.confidence,

    eventDateSource:
      eventDateInfo.source,

    publicationDate:
      publicationDate || null,

    relevance,

    relevanceReason:
      relevanceInfo.reason,

    dataRelevance,

    h2h:
      h2hInfo.isH2H,

    h2hType:
      h2hInfo.type,

    score,

    extracted,

    rejected,

    rejectionReason,

    dataQuality:
      calculateSourceQuality({
        title,
        url,
        snippet,
        eventDate,
        targetDate,
        relation:
          relationInfo.relation,
        effectiveType,
        rejected
      })
  };
}


/* ==========================================================================
   SUPPLIED SOURCE TYPE
   ========================================================================== */

function normalizeSuppliedType(type) {
  const value = cleanText(type);

  if (!value) {
    return SOURCE_TYPES.UNKNOWN;
  }

  if (
    value.includes("injur") ||
    value.includes("absent")
  ) {
    return SOURCE_TYPES.INJURIES;
  }

  if (
    value.includes("lineup") ||
    value.includes("line up") ||
    value.includes("starting xi")
  ) {
    return SOURCE_TYPES.LINEUPS;
  }

  if (
    value.includes("odds") ||
    value.includes("market")
  ) {
    return SOURCE_TYPES.ODDS;
  }

  if (
    value.includes("h2h") ||
    value.includes("head to head") ||
    value.includes("head-to-head")
  ) {
    return SOURCE_TYPES.H2H;
  }

  if (
    value.includes("form") ||
    value.includes("recent")
  ) {
    return SOURCE_TYPES.FORM;
  }

  if (value.includes("stat")) {
    return SOURCE_TYPES.STATS;
  }

  if (
    value.includes("match") ||
    value.includes("result")
  ) {
    return SOURCE_TYPES.MATCH;
  }

  if (
    value.includes("preview")
  ) {
    return SOURCE_TYPES.PREVIEW;
  }

  if (
    value.includes("prediction")
  ) {
    return SOURCE_TYPES.PREDICTION;
  }

  return SOURCE_TYPES.UNKNOWN;
}


/* ==========================================================================
   EFFECTIVE SOURCE TYPE
   ========================================================================== */

function deriveEffectiveSourceType({
  suppliedType,
  title,
  url,
  snippet,
  bodyText,
  text,
  eventDate,
  targetDate,
  relation
}) {
  const titleClean =
    cleanText(title);

  const urlClean =
    cleanText(url);

  const content =
    cleanText(
      [
        title,
        url,
        snippet,
        bodyText
      ]
        .filter(Boolean)
        .join(" ")
    );

  /*
   * MATCH REPORT FIRST.
   *
   * This is critical because a result may have been tagged by the
   * search layer as "injuries" even though the actual page is a
   * completed match report.
   */

  if (
    isMatchReport(
      content,
      eventDate,
      targetDate
    )
  ) {
    return SOURCE_TYPES.MATCH;
  }

  if (
    isLineupContent(content)
  ) {
    return SOURCE_TYPES.LINEUPS;
  }

  if (
    isInjuryContent(content)
  ) {
    return SOURCE_TYPES.INJURIES;
  }

  if (
    isOddsContent(content)
  ) {
    return SOURCE_TYPES.ODDS;
  }

  if (
    isH2HContent(content)
  ) {
    return SOURCE_TYPES.H2H;
  }

  if (
    isFormContent(content)
  ) {
    return SOURCE_TYPES.FORM;
  }

  if (
    isStatsContent(content)
  ) {
    return SOURCE_TYPES.STATS;
  }

  if (
    titleClean.includes("prediction") ||
    titleClean.includes("preview") ||
    urlClean.includes("prediction") ||
    content.includes("match prediction")
  ) {
    if (
      titleClean.includes("preview")
    ) {
      return SOURCE_TYPES.PREVIEW;
    }

    return SOURCE_TYPES.PREDICTION;
  }

  /*
   * Only after content detection do we fall back to supplied metadata.
   */

  return (
    suppliedType ||
    SOURCE_TYPES.UNKNOWN
  );
}


function isMatchReport(
  text,
  eventDate,
  targetDate
) {
  const normalized =
    cleanText(text);

  if (
    /\bmatch report\b/i.test(
      normalized
    ) ||
    /\bfull time\b/i.test(
      normalized
    ) ||
    /\bfinal score\b/i.test(
      normalized
    ) ||
    /\bmatch result\b/i.test(
      normalized
    ) ||
    (
      /\bresult\b/i.test(
        normalized
      ) &&
      /\bft\b/i.test(
        normalized
      )
    )
  ) {
    return true;
  }

  const scorePattern =
    /\b[a-z][a-z0-9 .'-]{2,45}\s+\d{1,2}\s*[-–]\s*\d{1,2}\s+[a-z][a-z0-9 .'-]{2,45}\b/i;

  if (
    eventDate &&
    targetDate &&
    eventDate !== targetDate &&
    scorePattern.test(normalized)
  ) {
    return true;
  }

  return false;
}


function isLineupContent(text) {
  const value =
    cleanText(text);

  return (
    value.includes("starting lineup") ||
    value.includes("starting xi") ||
    value.includes("predicted lineup") ||
    value.includes("confirmed lineup") ||
    value.includes("lineups") ||
    value.includes("formation") ||
    value.includes("team news lineup")
  );
}


function isInjuryContent(text) {
  const value =
    cleanText(text);

  return (
    value.includes("injury") ||
    value.includes("injuries") ||
    value.includes("injured") ||
    value.includes("unavailable") ||
    value.includes("ruled out") ||
    value.includes("doubtful") ||
    value.includes("suspended") ||
    value.includes("suspension") ||
    value.includes("absent")
  );
}


function isOddsContent(text) {
  const value =
    cleanText(text);

  return (
    value.includes("odds") ||
    value.includes("betting odds") ||
    value.includes("bookmaker") ||
    value.includes("1x2 odds") ||
    value.includes("moneyline") ||
    value.includes("over 2.5") ||
    value.includes("under 2.5") ||
    value.includes("both teams to score")
  );
}


function isH2HContent(text) {
  const value =
    cleanText(text);

  return (
    value.includes("head to head") ||
    value.includes("head-to-head") ||
    value.includes("h2h") ||
    value.includes("previous meetings") ||
    value.includes("past meetings") ||
    value.includes("last meetings") ||
    value.includes("historical meetings")
  );
}


function isFormContent(text) {
  const value =
    cleanText(text);

  return (
    value.includes("recent form") ||
    value.includes("last 5") ||
    value.includes("last five") ||
    value.includes("last 6") ||
    value.includes("last six") ||
    value.includes("last 10") ||
    value.includes("recent results") ||
    value.includes("form guide") ||
    value.includes("current form")
  );
}


function isStatsContent(text) {
  const value =
    cleanText(text);

  return (
    value.includes("expected goals") ||
    /\bxg\b/i.test(value) ||
    /\bxga\b/i.test(value) ||
    value.includes("shots on target") ||
    value.includes("possession") ||
    value.includes("goals per game") ||
    value.includes("clean sheets") ||
    /\bbtts\b/i.test(value) ||
    value.includes("both teams scored") ||
    value.includes("over 2.5")
  );
}


/* ==========================================================================
   EVENT DATE EXTRACTION
   ========================================================================== */

function normalizeTargetDate(value) {
  return normalizeDateValue(value);
}


function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null;
    }

    return formatDateUTC(value);
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  /*
   * ISO first.
   */

  const iso =
    text.match(
      /\b(\d{4})-(\d{2})-(\d{2})\b/
    );

  if (iso) {
    const candidate =
      makeValidDate(
        Number(iso[1]),
        Number(iso[2]),
        Number(iso[3])
      );

    if (candidate) {
      return formatDateUTC(
        candidate
      );
    }
  }

  const monthName =
    parseMonthNameDate(text);

  if (monthName) {
    return monthName;
  }

  const numeric =
    parseNumericDate(text);

  if (numeric) {
    return numeric;
  }

  return null;
}


function extractEventDate({
  title,
  url,
  snippet,
  bodyText,
  targetDate,
  homeIdentity,
  awayIdentity
}) {
  const candidates = [];

  collectDateCandidates(
    candidates,
    title,
    "TITLE",
    300,
    targetDate
  );

  collectDateCandidates(
    candidates,
    url,
    "URL",
    250,
    targetDate
  );

  collectDateCandidates(
    candidates,
    snippet,
    "SNIPPET",
    100,
    targetDate
  );

  collectDateCandidates(
    candidates,
    bodyText,
    "BODY",
    50,
    targetDate
  );

  if (!candidates.length) {
    return {
      date: null,
      confidence: "NONE",
      source: null
    };
  }

  const pairText =
    cleanText(
      [
        title,
        url,
        snippet
      ]
        .filter(Boolean)
        .join(" ")
    );

  const exactPair =
    containsTeam(
      pairText,
      homeIdentity
    ) &&
    containsTeam(
      pairText,
      awayIdentity
    );

  for (const candidate of candidates) {
    let score =
      candidate.baseScore;

    if (
      candidate.date ===
      targetDate
    ) {
      score += 1000;
    }

    if (exactPair) {
      score += 100;
    }

    if (
      /\b\d{1,2}:\d{2}\s*(am|pm)?\b/i.test(
        candidate.context
      )
    ) {
      score += 25;
    }

    if (
      /\b(match|fixture|kickoff|kick-off|vs|v)\b/i.test(
        candidate.context
      )
    ) {
      score += 40;
    }

    candidate.score = score;
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score
  );

  const best =
    candidates[0];

  let confidence = "LOW";

  if (best.score >= 1000) {
    confidence = "HIGH";
  } else if (best.score >= 300) {
    confidence = "MEDIUM";
  }

  return {
    date: best.date,
    confidence,
    source: best.source
  };
}


function collectDateCandidates(
  array,
  text,
  source,
  baseScore,
  targetDate
) {
  if (!text) {
    return;
  }

  const value =
    String(text);

  /*
   * ISO
   */

  const isoRegex =
    /\b(\d{4})-(\d{2})-(\d{2})\b/g;

  let match;

  while (
    (match =
      isoRegex.exec(value))
  ) {
    const date =
      normalizeDateValue(
        match[0]
      );

    if (date) {
      array.push({
        date,
        source,
        baseScore,
        context:
          getDateContext(
            value,
            match.index,
            match[0].length
          ),
        score: baseScore
      });
    }
  }

  /*
   * Month-name dates.
   */

  const monthRegex =
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,)?\s+\d{4}\b/gi;

  while (
    (match =
      monthRegex.exec(value))
  ) {
    const date =
      normalizeDateValue(
        match[0]
      );

    if (date) {
      array.push({
        date,
        source,
        baseScore,
        context:
          getDateContext(
            value,
            match.index,
            match[0].length
          ),
        score: baseScore
      });
    }
  }

  const reverseMonthRegex =
    /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/gi;

  while (
    (match =
      reverseMonthRegex.exec(value))
  ) {
    const date =
      normalizeDateValue(
        match[0]
      );

    if (date) {
      array.push({
        date,
        source,
        baseScore,
        context:
          getDateContext(
            value,
            match.index,
            match[0].length
          ),
        score: baseScore
      });
    }
  }

  /*
   * Numeric dates.
   */

  const numericRegex =
    /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/g;

  while (
    (match =
      numericRegex.exec(value))
  ) {
    const a =
      Number(match[1]);

    const b =
      Number(match[2]);

    const year =
      Number(match[3]);

    let date = null;

    if (
      a > 12 &&
      b <= 12
    ) {
      date =
        makeValidDate(
          year,
          b,
          a
        );
    } else if (
      b > 12 &&
      a <= 12
    ) {
      date =
        makeValidDate(
          year,
          a,
          b
        );
    } else {
      /*
       * Ambiguous MM/DD/YYYY.
       */
      date =
        makeValidDate(
          year,
          a,
          b
        );
    }

    if (date) {
      array.push({
        date:
          formatDateUTC(
            date
          ),
        source,
        baseScore:
          baseScore - 25,
        context:
          getDateContext(
            value,
            match.index,
            match[0].length
          ),
        score:
          baseScore - 25
      });
    }
  }

  /*
   * Month/day without year.
   */

  const monthDayRegex =
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b/gi;

  while (
    (match =
      monthDayRegex.exec(value))
  ) {
    const inferredYear =
      targetDate
        ? Number(
            String(
              targetDate
            ).slice(0, 4)
          )
        : targetYearFromContext(
            value
          );

    const date =
      parseMonthDayWithoutYear(
        match[0],
        inferredYear
      );

    if (date) {
      array.push({
        date,
        source,
        baseScore:
          baseScore - 50,
        context:
          getDateContext(
            value,
            match.index,
            match[0].length
          ),
        score:
          baseScore - 50
      });
    }
  }
}


function targetYearFromContext(
  text
) {
  const match =
    String(text || "")
      .match(
        /\b(20\d{2})\b/
      );

  if (match) {
    return Number(
      match[1]
    );
  }

  return new Date()
    .getUTCFullYear();
}


function getDateContext(
  text,
  index,
  length
) {
  const start =
    Math.max(
      0,
      index - 100
    );

  const end =
    Math.min(
      text.length,
      index +
        length +
        100
    );

  return text.slice(
    start,
    end
  );
}


function parseMonthNameDate(
  text
) {
  if (!text) {
    return null;
  }

  const value =
    String(text).trim();

  let match =
    value.match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,)?\s+(\d{4})\b/i
    );

  if (match) {
    const month =
      monthNumber(
        match[1]
      );

    const day =
      Number(match[2]);

    const year =
      Number(match[3]);

    const date =
      makeValidDate(
        year,
        month,
        day
      );

    return date
      ? formatDateUTC(date)
      : null;
  }

  match =
    value.match(
      /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i
    );

  if (match) {
    const day =
      Number(match[1]);

    const month =
      monthNumber(
        match[2]
      );

    const year =
      Number(match[3]);

    const date =
      makeValidDate(
        year,
        month,
        day
      );

    return date
      ? formatDateUTC(date)
      : null;
  }

  return null;
}


function parseMonthDayWithoutYear(
  text,
  year
) {
  if (!text) {
    return null;
  }

  const match =
    String(text).match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\b/i
    );

  if (!match) {
    return null;
  }

  const month =
    monthNumber(
      match[1]
    );

  const day =
    Number(match[2]);

  const date =
    makeValidDate(
      year,
      month,
      day
    );

  return date
    ? formatDateUTC(date)
    : null;
}


function parseNumericDate(
  text
) {
  const value =
    String(text || "")
      .trim();

  const match =
    value.match(
      /^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\s*$/
    );

  if (!match) {
    return null;
  }

  const a =
    Number(match[1]);

  const b =
    Number(match[2]);

  const year =
    Number(match[3]);

  let date = null;

  if (
    a > 12 &&
    b <= 12
  ) {
    date =
      makeValidDate(
        year,
        b,
        a
      );
  } else if (
    b > 12 &&
    a <= 12
  ) {
    date =
      makeValidDate(
        year,
        a,
        b
      );
  } else {
    date =
      makeValidDate(
        year,
        a,
        b
      );
  }

  return date
    ? formatDateUTC(date)
    : null;
}


function monthNumber(
  month
) {
  const value =
    cleanText(month)
      .slice(0, 3);

  const months = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12
  };

  return (
    months[value] ||
    0
  );
}


function makeValidDate(
  year,
  month,
  day
) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !==
      day
  ) {
    return null;
  }

  return date;
}


function formatDateUTC(
  date
) {
  return date
    .toISOString()
    .slice(0, 10);
}


/* ==========================================================================
   RELEVANCE CLASSIFICATION
   ========================================================================== */

function classifyRelevance({
  eventDate,
  targetDate,
  relation,
  effectiveType,
  suppliedType,
  h2h,
  title,
  url,
  text
}) {
  if (
    relation === "IRRELEVANT"
  ) {
    return {
      relevance:
        RELEVANCE.IRRELEVANT,

      reason:
        "SOURCE_DOES_NOT_MATCH_TARGET_TEAMS"
    };
  }

  /*
   * PRIORITY #1:
   * Exact target date = CURRENT_MATCH.
   */

  if (
    eventDate === targetDate
  ) {
    return {
      relevance:
        RELEVANCE.CURRENT_MATCH,

      reason:
        "EVENT_DATE_EQUALS_TARGET_DATE"
    };
  }

  /*
   * PRIORITY #2:
   * Timezone-adjacent current fixture.
   */

  if (
    eventDate &&
    isTimezoneAdjacentCurrent(
      eventDate,
      targetDate,
      text,
      effectiveType
    )
  ) {
    return {
      relevance:
        RELEVANCE.CURRENT_MATCH,

      reason:
        "TIMEZONE_ADJACENT_FIXTURE_DATE"
    };
  }

  /*
   * PRIORITY #3:
   * Future.
   */

  if (
    eventDate &&
    compareDates(
      eventDate,
      targetDate
    ) > 0
  ) {
    return {
      relevance:
        RELEVANCE.FUTURE,

      reason:
        "EVENT_DATE_AFTER_TARGET_DATE"
    };
  }

  /*
   * PRIORITY #4:
   *
   * RECENT MUST COME BEFORE GENERIC HISTORICAL.
   *
   * This fixes the V3.3 bug where the historical branch made
   * RECENT unreachable.
   */

  if (
    eventDate &&
    compareDates(
      eventDate,
      targetDate
    ) < 0 &&
    daysBetween(
      eventDate,
      targetDate
    ) <= MAX_RECENT_DAYS &&
    isEligibleRecentSource({
      effectiveType,
      suppliedType,
      h2h,
      text
    })
  ) {
    return {
      relevance:
        RELEVANCE.RECENT,

      reason:
        "RECENT_EVENT_WITHIN_FORM_WINDOW"
    };
  }

  /*
   * PRIORITY #5:
   * Historical H2H.
   */

  if (
    h2h &&
    eventDate &&
    compareDates(
      eventDate,
      targetDate
    ) < 0
  ) {
    return {
      relevance:
        RELEVANCE.HISTORICAL,

      reason:
        "HISTORICAL_HEAD_TO_HEAD"
    };
  }

  /*
   * PRIORITY #6:
   * Generic historical evidence.
   */

  if (
    eventDate &&
    compareDates(
      eventDate,
      targetDate
    ) < 0
  ) {
    return {
      relevance:
        RELEVANCE.HISTORICAL,

      reason:
        "EVENT_DATE_BEFORE_TARGET_DATE"
    };
  }

  /*
   * PRIORITY #7:
   * Exact-pair undated page.
   */

  if (
    relation === "EXACT_PAIR" &&
    isMatchSpecificUndatedPage({
      text,
      effectiveType
    })
  ) {
    return {
      relevance:
        RELEVANCE.MATCH_SPECIFIC_UNDATED,

      reason:
        "EXACT_PAIR_MATCH_SPECIFIC_PAGE_WITHOUT_DATE"
    };
  }

  /*
   * PRIORITY #8:
   * Team-specific undated page.
   */

  if (
    (
      relation === "HOME_ONLY" ||
      relation === "AWAY_ONLY"
    ) &&
    isTeamSpecificUndatedPage({
      text,
      effectiveType
    })
  ) {
    return {
      relevance:
        RELEVANCE.UNDATED_TEAM_SOURCE,

      reason:
        "TEAM_SPECIFIC_SOURCE_WITHOUT_EVENT_DATE"
    };
  }

  /*
   * PRIORITY #9:
   * Generic target-team source with no date.
   */

  if (
    relation === "EXACT_PAIR" ||
    relation === "HOME_ONLY" ||
    relation === "AWAY_ONLY"
  ) {
    return {
      relevance:
        RELEVANCE.UNDATED,

      reason:
        "TARGET_TEAM_SOURCE_WITHOUT_RELIABLE_DATE"
    };
  }

  return {
    relevance:
      RELEVANCE.IRRELEVANT,

    reason:
      "NO_RELIABLE_EVENT_OR_MATCH_SPECIFIC_CONTEXT"
  };
}


function isEligibleRecentSource({
  effectiveType,
  suppliedType,
  h2h,
  text
}) {
  if (h2h) {
    return false;
  }

  if (
    effectiveType ===
      SOURCE_TYPES.MATCH ||
    effectiveType ===
      SOURCE_TYPES.FORM
  ) {
    return true;
  }

  /*
   * Stats are accepted as recent form only if the content actually
   * talks about recent form/results.
   */

  if (
    effectiveType ===
      SOURCE_TYPES.STATS &&
    (
      text.includes("last 5") ||
      text.includes("last five") ||
      text.includes("recent form") ||
      text.includes("recent results")
    )
  ) {
    return true;
  }

  return false;
}


function isTimezoneAdjacentCurrent(
  eventDate,
  targetDate,
  text,
  effectiveType
) {
  if (
    !eventDate ||
    !targetDate
  ) {
    return false;
  }

  const difference =
    daysBetween(
      eventDate,
      targetDate
    );

  if (difference !== 1) {
    return false;
  }

  const value =
    cleanText(text);

  const hasTime =
    /\b\d{1,2}:\d{2}\s*(am|pm)?\b/i.test(
      value
    );

  const hasTimezone =
    value.includes("utc") ||
    value.includes("gmt") ||
    value.includes("cet") ||
    value.includes("bst") ||
    value.includes("est") ||
    value.includes("edt");

  const looksLikeFixture =
    effectiveType ===
      SOURCE_TYPES.MATCH ||
    effectiveType ===
      SOURCE_TYPES.PREVIEW ||
    effectiveType ===
      SOURCE_TYPES.PREDICTION ||
    value.includes("fixture") ||
    value.includes("kickoff") ||
    value.includes("kick-off") ||
    value.includes("match");

  return (
    hasTime &&
    (
      hasTimezone ||
      looksLikeFixture
    )
  );
}


function isMatchSpecificUndatedPage({
  text,
  effectiveType
}) {
  const value =
    cleanText(text);

  return (
    effectiveType ===
      SOURCE_TYPES.PREVIEW ||
    effectiveType ===
      SOURCE_TYPES.PREDICTION ||
    effectiveType ===
      SOURCE_TYPES.ODDS ||
    effectiveType ===
      SOURCE_TYPES.LINEUPS ||
    effectiveType ===
      SOURCE_TYPES.INJURIES ||
    value.includes(
      "match prediction"
    ) ||
    value.includes(
      "predicted lineup"
    ) ||
    value.includes(
      "betting odds"
    ) ||
    value.includes(
      "team news"
    )
  );
}


function isTeamSpecificUndatedPage({
  text,
  effectiveType
}) {
  return (
    effectiveType ===
      SOURCE_TYPES.FORM ||
    effectiveType ===
      SOURCE_TYPES.INJURIES ||
    effectiveType ===
      SOURCE_TYPES.LINEUPS ||
    effectiveType ===
      SOURCE_TYPES.STATS
  );
}


/* ==========================================================================
   H2H
   ========================================================================== */

function detectH2H({
  suppliedType,
  effectiveType,
  title,
  url,
  text,
  relation,
  eventDate,
  targetDate
}) {
  if (
    relation !== "EXACT_PAIR"
  ) {
    return {
      isH2H: false,
      type: null
    };
  }

  const explicitH2H =
    effectiveType ===
      SOURCE_TYPES.H2H ||
    suppliedType ===
      SOURCE_TYPES.H2H ||
    isH2HContent(
      [
        title,
        url,
        text
      ]
        .filter(Boolean)
        .join(" ")
    );

  if (!explicitH2H) {
    return {
      isH2H: false,
      type: null
    };
  }

  /*
   * Current fixture page containing H2H history.
   */

  if (
    eventDate &&
    targetDate &&
    eventDate === targetDate
  ) {
    return {
      isH2H: true,
      type:
        "CURRENT_MATCH_H2H_PAGE"
    };
  }

  /*
   * Completed historical H2H.
   */

  if (
    eventDate &&
    targetDate &&
    compareDates(
      eventDate,
      targetDate
    ) < 0
  ) {
    return {
      isH2H: true,
      type:
        "HISTORICAL_H2H"
    };
  }

  return {
    isH2H: true,
    type:
      "H2H_CONTEXT"
  };
}


/* ==========================================================================
   DATA RELEVANCE
   ========================================================================== */

function determineDataRelevance({
  relevance,
  effectiveType,
  h2h,
  relation,
  eventDate,
  targetDate
}) {
  if (
    relevance ===
    RELEVANCE.IRRELEVANT
  ) {
    return "IRRELEVANT";
  }

  if (
    h2h &&
    relevance ===
      RELEVANCE.HISTORICAL
  ) {
    return "H2H_CONTEXT";
  }

  if (
    relevance ===
      RELEVANCE.CURRENT_MATCH
  ) {
    if (h2h) {
      return "CURRENT_MATCH_H2H_PAGE";
    }

    return "CURRENT_MATCH";
  }

  if (
    relevance ===
      RELEVANCE.RECENT
  ) {
    return "RECENT_FORM_CONTEXT";
  }

  if (
    relevance ===
      RELEVANCE.HISTORICAL
  ) {
    return "HISTORICAL_AUDIT_ONLY";
  }

  if (
    relevance ===
      RELEVANCE.FUTURE
  ) {
    return "FUTURE_AUDIT_ONLY";
  }

  if (
    relevance ===
      RELEVANCE.MATCH_SPECIFIC_UNDATED
  ) {
    return "MATCH_SPECIFIC_UNDATED";
  }

  if (
    relevance ===
      RELEVANCE.UNDATED_TEAM_SOURCE
  ) {
    return "UNDATED_TEAM_CONTEXT";
  }

  return "UNDATED";
}


/* ==========================================================================
   FORM
   ========================================================================== */

function extractFormEvidence(
  sources
) {
  const home = [];
  const away = [];

  for (const source of sources) {
    if (
      source.relevance !==
      RELEVANCE.RECENT
    ) {
      continue;
    }

    if (source.h2h) {
      continue;
    }

    if (
      source.sourceType !==
        SOURCE_TYPES.FORM &&
      source.sourceType !==
        SOURCE_TYPES.MATCH
    ) {
      continue;
    }

    const item = {
      sourceId:
        source.id,

      source:
        source.source,

      title:
        source.title,

      url:
        source.url,

      eventDate:
        source.eventDate,

      relation:
        source.relation,

      sourceType:
        source.sourceType,

      score:
        source.score,

      snippet:
        source.snippet,

      dataRelevance:
        "RECENT_FORM"
    };

    if (
      source.relation ===
        "HOME_ONLY" ||
      source.relation ===
        "EXACT_PAIR"
    ) {
      home.push(item);
    }

    if (
      source.relation ===
        "AWAY_ONLY" ||
      source.relation ===
        "EXACT_PAIR"
    ) {
      away.push(item);
    }
  }

  return {
    home:
      dedupeEvidence(home)
        .slice(
          0,
          MAX_FORM_ITEMS
        ),

    away:
      dedupeEvidence(away)
        .slice(
          0,
          MAX_FORM_ITEMS
        )
  };
}


/* ==========================================================================
   H2H EVIDENCE
   ========================================================================== */

function extractH2HEvidence(
  sources
) {
  const items = [];

  for (const source of sources) {
    if (
      !source.h2h ||
      source.relation !==
        "EXACT_PAIR"
    ) {
      continue;
    }

    if (
      source.h2hType ===
        "HISTORICAL_H2H" ||
      source.h2hType ===
        "H2H_CONTEXT"
    ) {
      items.push({
        sourceId:
          source.id,

        source:
          source.source,

        title:
          source.title,

        url:
          source.url,

        eventDate:
          source.eventDate,

        h2hType:
          source.h2hType,

        score:
          source.score,

        snippet:
          source.snippet,

        dataRelevance:
          "H2H_CONTEXT"
      });
    }
  }

  return dedupeEvidence(items)
    .sort(
      (a, b) => {
        if (!a.eventDate) {
          return 1;
        }

        if (!b.eventDate) {
          return -1;
        }

        return b.eventDate.localeCompare(
          a.eventDate
        );
      }
    )
    .slice(
      0,
      MAX_H2H_ITEMS
    );
}


/* ==========================================================================
   CURRENT STATS
   ========================================================================== */

function extractStatsEvidence(
  sources
) {
  const items = [];

  for (const source of sources) {
    if (
      source.relevance !==
      RELEVANCE.CURRENT_MATCH
    ) {
      continue;
    }

    if (
      source.relation !==
      "EXACT_PAIR"
    ) {
      continue;
    }

    if (
      source.sourceType !==
      SOURCE_TYPES.STATS
    ) {
      continue;
    }

    items.push({
      sourceId:
        source.id,

      source:
        source.source,

      title:
        source.title,

      url:
        source.url,

      eventDate:
        source.eventDate,

      stats:
        source.extracted.stats,

      snippet:
        source.snippet,

      dataRelevance:
        "CURRENT_MATCH_STATS"
    });
  }

  return dedupeEvidence(items)
    .slice(
      0,
      MAX_STATS_ITEMS
    );
}


function extractUndatedStatsEvidence(
  sources
) {
  const items = [];

  for (const source of sources) {
    if (
      source.relevance !==
        RELEVANCE.MATCH_SPECIFIC_UNDATED &&
      source.relevance !==
        RELEVANCE.UNDATED_TEAM_SOURCE &&
      source.relevance !==
        RELEVANCE.UNDATED
    ) {
      continue;
    }

    if (
      source.sourceType !==
      SOURCE_TYPES.STATS
    ) {
      continue;
    }

    if (
      source.relation !==
        "EXACT_PAIR" &&
      source.relation !==
        "HOME_ONLY" &&
      source.relation !==
        "AWAY_ONLY"
    ) {
      continue;
    }

    items.push({
      sourceId:
        source.id,

      source:
        source.source,

      title:
        source.title,

      url:
        source.url,

      relation:
        source.relation,

      stats:
        source.extracted.stats,

      snippet:
        source.snippet,

      dataRelevance:
        "UNDATED_STATS"
    });
  }

  return dedupeEvidence(items)
    .slice(
      0,
      MAX_STATS_ITEMS
    );
}


/* ==========================================================================
   INJURIES
   ========================================================================== */

function extractInjuryEvidence(
  sources
) {
  const items = [];

  for (const source of sources) {
    if (
      source.relevance !==
        RELEVANCE.CURRENT_MATCH &&
      source.relevance !==
        RELEVANCE.MATCH_SPECIFIC_UNDATED &&
      source.relevance !==
        RELEVANCE.UNDATED_TEAM_SOURCE
    ) {
      continue;
    }

    if (
      source.sourceType !==
      SOURCE_TYPES.INJURIES
    ) {
      continue;
    }

    if (
      source.relation !==
        "EXACT_PAIR" &&
      source.relation !==
        "HOME_ONLY" &&
      source.relation !==
        "AWAY_ONLY"
    ) {
      continue;
    }

    items.push({
      sourceId:
        source.id,

      source:
        source.source,

      title:
        source.title,

      url:
        source.url,

      eventDate:
        source.eventDate,

      relation:
        source.relation,

      injuries:
        source.extracted.injuries,

      snippet:
        source.snippet,

      dataRelevance:
        source.relevance ===
          RELEVANCE.CURRENT_MATCH
          ? "CURRENT_MATCH_INJURIES"
          : "UNDATED_INJURIES"
    });
  }

  return dedupeEvidence(items)
    .slice(
      0,
      MAX_INJURY_ITEMS
    );
}


/* ==========================================================================
   LINEUPS
   ========================================================================== */

function extractLineupEvidence(
  sources
) {
  const confirmed = [];
  const predicted = [];

  for (const source of sources) {
    if (
      source.relevance !==
        RELEVANCE.CURRENT_MATCH &&
      source.relevance !==
        RELEVANCE.MATCH_SPECIFIC_UNDATED &&
      source.relevance !==
        RELEVANCE.UNDATED_TEAM_SOURCE
    ) {
      continue;
    }

    if (
      source.sourceType !==
      SOURCE_TYPES.LINEUPS
    ) {
      continue;
    }

    if (
      source.relation !==
        "EXACT_PAIR" &&
      source.relation !==
        "HOME_ONLY" &&
      source.relation !==
        "AWAY_ONLY"
    ) {
      continue;
    }

    const item = {
      sourceId:
        source.id,

      source:
        source.source,

      title:
        source.title,

      url:
        source.url,

      eventDate:
        source.eventDate,

      relation:
        source.relation,

      status:
        source.extracted.lineupStatus,

      snippet:
        source.snippet,

      dataRelevance:
        source.relevance ===
          RELEVANCE.CURRENT_MATCH
          ? "CURRENT_MATCH_LINEUP"
          : "UNDATED_LINEUP"
    };

    if (
      source.extracted.lineupStatus ===
      "CONFIRMED"
    ) {
      confirmed.push(item);
    } else {
      predicted.push(item);
    }
  }

  return {
    confirmed:
      dedupeEvidence(
        confirmed
      ).slice(
        0,
        MAX_LINEUP_ITEMS
      ),

    predicted:
      dedupeEvidence(
        predicted
      ).slice(
        0,
        MAX_LINEUP_ITEMS
      )
  };
}


/* ==========================================================================
   ODDS
   ========================================================================== */

function extractOddsEvidence(
  sources
) {
  const items = [];

  for (const source of sources) {
    if (
      source.relevance !==
      RELEVANCE.CURRENT_MATCH
    ) {
      continue;
    }

    if (
      source.relation !==
      "EXACT_PAIR"
    ) {
      continue;
    }

    if (
      source.sourceType !==
      SOURCE_TYPES.ODDS
    ) {
      continue;
    }

    items.push({
      sourceId:
        source.id,

      source:
        source.source,

      title:
        source.title,

      url:
        source.url,

      eventDate:
        source.eventDate,

      odds:
        source.extracted.odds,

      probabilities:
        source.extracted.probabilities,

      goalMarkets:
        source.extracted.goalMarkets,

      btts:
        source.extracted.btts,

      snippet:
        source.snippet,

      dataRelevance:
        "CURRENT_MATCH_ODDS"
    });
  }

  return dedupeEvidence(items)
    .slice(
      0,
      MAX_ODDS_ITEMS
    );
}


function extractUndatedOddsEvidence(
  sources
) {
  const items = [];

  for (const source of sources) {
    if (
      source.relevance !==
        RELEVANCE.MATCH_SPECIFIC_UNDATED &&
      source.relevance !==
        RELEVANCE.UNDATED
    ) {
      continue;
    }

    if (
      source.sourceType !==
      SOURCE_TYPES.ODDS
    ) {
      continue;
    }

    if (
      source.relation !==
      "EXACT_PAIR"
    ) {
      continue;
    }

    items.push({
      sourceId:
        source.id,

      source:
        source.source,

      title:
        source.title,

      url:
        source.url,

      odds:
        source.extracted.odds,

      probabilities:
        source.extracted.probabilities,

      goalMarkets:
        source.extracted.goalMarkets,

      btts:
        source.extracted.btts,

      snippet:
        source.snippet,

      dataRelevance:
        "UNDATED_ODDS"
    });
  }

  return dedupeEvidence(items)
    .slice(
      0,
      MAX_ODDS_ITEMS
    );
}


/* ==========================================================================
   GOALS
   ========================================================================== */

function extractGoalEvidence(
  sources
) {
  const home = [];
  const away = [];
  const combined = [];
  const sourceItems = [];

  for (const source of sources) {
    if (
      source.relevance !==
        RELEVANCE.CURRENT_MATCH &&
      source.relevance !==
        RELEVANCE.RECENT
    ) {
      continue;
    }

    const markets =
      source.extracted.goalMarkets ||
      [];

    if (!markets.length) {
      continue;
    }

    for (const market of markets) {
      const item = {
        sourceId:
          source.id,

        eventDate:
          source.eventDate,

        ...market
      };

      if (
        source.relation ===
        "HOME_ONLY"
      ) {
        home.push(item);
      }

      if (
        source.relation ===
        "AWAY_ONLY"
      ) {
        away.push(item);
      }

      if (
        source.relation ===
        "EXACT_PAIR"
      ) {
        combined.push(item);
      }
    }

    sourceItems.push({
      sourceId:
        source.id,

      source:
        source.source,

      title:
        source.title,

      url:
        source.url,

      eventDate:
        source.eventDate,

      markets
    });
  }

  return {
    home:
      dedupeEvidence(home),

    away:
      dedupeEvidence(away),

    combined:
      dedupeEvidence(combined),

    sources:
      dedupeEvidence(sourceItems)
  };
}


/* ==========================================================================
   XG
   ========================================================================== */

function extractXGEvidence(
  sources
) {
  let home = null;
  let away = null;

  const evidence = [];

  for (const source of sources) {
    if (
      source.relevance !==
      RELEVANCE.CURRENT_MATCH
    ) {
      continue;
    }

    if (
      source.relation !==
      "EXACT_PAIR"
    ) {
      continue;
    }

    const stats =
      source.extracted.stats ||
      {};

    if (
      stats.xg &&
      (
        stats.xg.home !== null ||
        stats.xg.away !== null
      )
    ) {
      if (
        home === null &&
        stats.xg.home !== null
      ) {
        home =
          stats.xg.home;
      }

      if (
        away === null &&
        stats.xg.away !== null
      ) {
        away =
          stats.xg.away;
      }

      evidence.push({
        sourceId:
          source.id,

        source:
          source.source,

        title:
          source.title,

        url:
          source.url,

        eventDate:
          source.eventDate,

        xg:
          stats.xg,

        snippet:
          source.snippet
      });
    }
  }

  return {
    home,

    away,

    sources:
      dedupeEvidence(
        evidence
      )
  };
}


/* ==========================================================================
   BTTS
   ========================================================================== */

function extractBTTSEvidence(
  sources
) {
  let value = null;

  const evidence = [];

  for (const source of sources) {
    if (
      source.relevance !==
        RELEVANCE.CURRENT_MATCH &&
      source.relevance !==
        RELEVANCE.RECENT
    ) {
      continue;
    }

    if (
      source.relation !==
      "EXACT_PAIR"
    ) {
      continue;
    }

    const btts =
      source.extracted.btts;

    if (!btts) {
      continue;
    }

    if (value === null) {
      value =
        btts.value;
    }

    evidence.push({
      sourceId:
        source.id,

      source:
        source.source,

      title:
        source.title,

      url:
        source.url,

      eventDate:
        source.eventDate,

      ...btts,

      snippet:
        source.snippet
    });
  }

  return {
    value,

    sources:
      dedupeEvidence(
        evidence
      )
  };
}


/* ==========================================================================
   OVER / UNDER
   ========================================================================== */

function extractOverUnderEvidence(
  sources
) {
  const items = [];

  for (const source of sources) {
    if (
      source.relevance !==
        RELEVANCE.CURRENT_MATCH &&
      source.relevance !==
        RELEVANCE.RECENT
    ) {
      continue;
    }

    if (
      source.relation !==
      "EXACT_PAIR"
    ) {
      continue;
    }

    const markets =
      source.extracted.goalMarkets ||
      [];

    for (const market of markets) {
      items.push({
        sourceId:
          source.id,

        source:
          source.source,

        title:
          source.title,

        url:
          source.url,

        eventDate:
          source.eventDate,

        ...market,

        snippet:
          source.snippet
      });
    }
  }

  return dedupeEvidence(
    items
  );
}


/* ==========================================================================
   STATS PARSING
   ========================================================================== */

function extractCurrentStats(
  text
) {
  const value =
    cleanText(text);

  const xg =
    extractXG(value);

  const btts =
    extractBTTSValue(value);

  const totals =
    extractGoalMarkets(value);

  const possession =
    extractPossession(value);

  const shots =
    extractShots(value);

  return {
    xg,

    btts,

    totals,

    possession,

    shots
  };
}


function extractXG(
  text
) {
  const value =
    cleanText(text);

  const patterns = [
    /\bxg\s*[:=]?\s*(\d+(?:\.\d+)?)\s*[-–\/]\s*(\d+(?:\.\d+)?)/i,

    /\bexpected goals\s*[:=]?\s*(\d+(?:\.\d+)?)\s*[-–\/]\s*(\d+(?:\.\d+)?)/i,

    /\bxg\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i
  ];

  for (const pattern of patterns) {
    const match =
      value.match(pattern);

    if (match) {
      return {
        home:
          Number(match[1]),

        away:
          Number(match[2])
      };
    }
  }

  return {
    home: null,
    away: null
  };
}


function extractBTTSValue(
  text
) {
  const value =
    cleanText(text);

  const explicit =
    value.match(
      /\bbtts\s*(?:prediction|pick|tip)?\s*[:=-]?\s*(yes|no)\b/i
    );

  if (explicit) {
    return {
      value:
        explicit[1].toLowerCase() ===
        "yes",

      confidence:
        "EXPLICIT"
    };
  }

  const bothTeams =
    value.match(
      /\bboth teams (?:to )?score\s*[:=-]?\s*(yes|no)\b/i
    );

  if (bothTeams) {
    return {
      value:
        bothTeams[1].toLowerCase() ===
        "yes",

      confidence:
        "EXPLICIT"
    };
  }

  return null;
}


function extractGoalMarkets(
  text
) {
  const value =
    cleanText(text);

  const markets = [];

  const regex =
    /\b(over|under)\s*(0\.5|1\.5|2\.5|3\.5|4\.5|5\.5)\s*(?:goals)?\s*(?:[:=-]\s*)?(\d+(?:\.\d{2})?)?/gi;

  let match;

  while (
    (match =
      regex.exec(value))
  ) {
    markets.push({
      market:
        `${match[1].toUpperCase()} ${match[2]}`,

      line:
        Number(match[2]),

      odds:
        match[3]
          ? Number(match[3])
          : null
    });
  }

  return dedupeEvidence(
    markets
  );
}


function extractPossession(
  text
) {
  const value =
    cleanText(text);

  const match =
    value.match(
      /\bpossession\s*[:=-]?\s*(\d{1,3})\s*%\s*[-–]\s*(\d{1,3})\s*%\b/i
    );

  if (!match) {
    return {
      home: null,
      away: null
    };
  }

  return {
    home:
      Number(match[1]),

    away:
      Number(match[2])
  };
}


function extractShots(
  text
) {
  const value =
    cleanText(text);

  const match =
    value.match(
      /\bshots(?:\s+on\s+target)?\s*[:=-]?\s*(\d+)\s*[-–]\s*(\d+)\b/i
    );

  if (!match) {
    return {
      home: null,
      away: null
    };
  }

  return {
    home:
      Number(match[1]),

    away:
      Number(match[2])
  };
}


/* ==========================================================================
   PROBABILITIES
   ========================================================================== */

function extractProbabilities(
  text
) {
  const value =
    cleanText(text);

  let home = null;
  let draw = null;
  let away = null;

  const oneXTwo =
    value.match(
      /\b1x2\b[^\d]{0,30}(\d{1,3}(?:\.\d+)?)\s*%\s*[-–\/]\s*(\d{1,3}(?:\.\d+)?)\s*%\s*[-–\/]\s*(\d{1,3}(?:\.\d+)?)\s*%/i
    );

  if (oneXTwo) {
    home =
      Number(oneXTwo[1]);

    draw =
      Number(oneXTwo[2]);

    away =
      Number(oneXTwo[3]);
  }

  const homeProbability =
    value.match(
      /\b(home|home win)\b[^\d]{0,20}(\d{1,3}(?:\.\d+)?)\s*%/i
    );

  if (
    home === null &&
    homeProbability
  ) {
    home =
      Number(
        homeProbability[2]
      );
  }

  const drawProbability =
    value.match(
      /\b(draw|tie)\b[^\d]{0,20}(\d{1,3}(?:\.\d+)?)\s*%/i
    );

  if (
    draw === null &&
    drawProbability
  ) {
    draw =
      Number(
        drawProbability[2]
      );
  }

  const awayProbability =
    value.match(
      /\b(away|away win)\b[^\d]{0,20}(\d{1,3}(?:\.\d+)?)\s*%/i
    );

  if (
    away === null &&
    awayProbability
  ) {
    away =
      Number(
        awayProbability[2]
      );
  }

  return {
    home,
    draw,
    away
  };
}


/* ==========================================================================
   ODDS
   ========================================================================== */

function extractDecimalOdds(
  text
) {
  const value =
    cleanText(text);

  const odds = [];

  const patterns = [
    {
      market:
        "1X2_HOME",

      regex:
        /\b(?:home|1)\b[^\d]{0,15}(\d+\.\d{2})\b/i
    },

    {
      market:
        "1X2_DRAW",

      regex:
        /\b(?:draw|x)\b[^\d]{0,15}(\d+\.\d{2})\b/i
    },

    {
      market:
        "1X2_AWAY",

      regex:
        /\b(?:away|2)\b[^\d]{0,15}(\d+\.\d{2})\b/i
    },

    {
      market:
        "OVER_2_5",

      regex:
        /\bover\s*2\.5\b[^\d]{0,15}(\d+\.\d{2})\b/i
    },

    {
      market:
        "UNDER_2_5",

      regex:
        /\bunder\s*2\.5\b[^\d]{0,15}(\d+\.\d{2})\b/i
    },

    {
      market:
        "BTTS_YES",

      regex:
        /\bbtts\s*(?:yes)?\b[^\d]{0,15}(\d+\.\d{2})\b/i
    },

    {
      market:
        "BTTS_NO",

      regex:
        /\bbtts\s*no\b[^\d]{0,15}(\d+\.\d{2})\b/i
    }
  ];

  for (const item of patterns) {
    const match =
      value.match(
        item.regex
      );

    if (!match) {
      continue;
    }

    const decimal =
      Number(match[1]);

    if (
      Number.isFinite(
        decimal
      ) &&
      decimal >= 1 &&
      decimal <= 1000
    ) {
      odds.push({
        market:
          item.market,

        decimal
      });
    }
  }

  return dedupeEvidence(
    odds
  );
}


/* ==========================================================================
   INJURY TEXT
   ========================================================================== */

function extractInjuryText(
  text
) {
  const value =
    String(text || "").trim();

  if (!value) {
    return [];
  }

  const sentences =
    value
      .split(
        /[.!?]\s+/
      )
      .map(
        sentence =>
          sentence.trim()
      )
      .filter(Boolean);

  const injuryTerms =
    /\b(injur|injured|out|ruled out|doubtful|suspended|suspension|unavailable|absent|fitness)\b/i;

  return sentences
    .filter(
      sentence =>
        injuryTerms.test(
          sentence
        )
    )
    .slice(0, 10);
}


/* ==========================================================================
   LINEUP STATUS
   ========================================================================== */

function detectLineupStatus(
  text
) {
  const value =
    cleanText(text);

  if (
    value.includes(
      "confirmed lineup"
    ) ||
    value.includes(
      "confirmed lineups"
    ) ||
    value.includes(
      "official lineup"
    ) ||
    value.includes(
      "official lineups"
    ) ||
    value.includes(
      "starting xi confirmed"
    )
  ) {
    return "CONFIRMED";
  }

  if (
    value.includes(
      "predicted lineup"
    ) ||
    value.includes(
      "predicted lineups"
    ) ||
    value.includes(
      "expected lineup"
    ) ||
    value.includes(
      "expected lineups"
    ) ||
    value.includes(
      "possible lineup"
    ) ||
    value.includes(
      "projected lineup"
    )
  ) {
    return "PREDICTED";
  }

  if (
    value.includes(
      "starting lineup"
    ) ||
    value.includes(
      "starting xi"
    ) ||
    value.includes(
      "lineups"
    )
  ) {
    return "UNSPECIFIED";
  }

  return "UNSPECIFIED";
}


/* ==========================================================================
   FORM MARKERS
   ========================================================================== */

function extractFormMarkers(
  text
) {
  const value =
    cleanText(text);

  return {
    last5:
      value.includes("last 5") ||
      value.includes("last five"),

    last10:
      value.includes("last 10"),

    recentForm:
      value.includes(
        "recent form"
      ) ||
      value.includes(
        "form guide"
      ) ||
      value.includes(
        "recent results"
      )
  };
}


/* ==========================================================================
   SCORE EXTRACTION
   ========================================================================== */

function extractScoreFromText(
  text,
  homeIdentity,
  awayIdentity
) {
  const value =
    String(text || "");

  const genericScores = [];

  const scoreRegex =
    /([A-Za-zÀ-ÿ0-9.'’& -]{2,50})\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-zÀ-ÿ0-9.'’& -]{2,50})/g;

  let match;

  while (
    (match =
      scoreRegex.exec(value))
  ) {
    genericScores.push({
      left:
        match[1].trim(),

      homeScore:
        Number(match[2]),

      awayScore:
        Number(match[3]),

      right:
        match[4].trim()
    });
  }

  for (
    const candidate
    of genericScores
  ) {
    const leftClean =
      cleanText(
        candidate.left
      );

    const rightClean =
      cleanText(
        candidate.right
      );

    const leftIsHome =
      containsTeam(
        leftClean,
        homeIdentity
      );

    const leftIsAway =
      containsTeam(
        leftClean,
        awayIdentity
      );

    const rightIsHome =
      containsTeam(
        rightClean,
        homeIdentity
      );

    const rightIsAway =
      containsTeam(
        rightClean,
        awayIdentity
      );

    if (
      leftIsHome &&
      rightIsAway
    ) {
      return {
        home:
          candidate.homeScore,

        away:
          candidate.awayScore,

        orientation:
          "HOME_AWAY",

        confidence:
          "HIGH"
      };
    }

    if (
      leftIsAway &&
      rightIsHome
    ) {
      return {
        home:
          candidate.awayScore,

        away:
          candidate.homeScore,

        orientation:
          "AWAY_HOME",

        confidence:
          "HIGH"
      };
    }
  }

  /*
   * Compact form:
   *
   * Deportes Concepcion 2-0 O'Higgins
   */

  const compactRegex =
    /([A-Za-zÀ-ÿ0-9.'’& -]{2,50})\s+(\d{1,2})\s*[-–:]\s*(\d{1,2})\s+([A-Za-zÀ-ÿ0-9.'’& -]{2,50})/g;

  while (
    (match =
      compactRegex.exec(value))
  ) {
    const left =
      match[1].trim();

    const right =
      match[4].trim();

    const leftIsHome =
      containsTeam(
        left,
        homeIdentity
      );

    const leftIsAway =
      containsTeam(
        left,
        awayIdentity
      );

    const rightIsHome =
      containsTeam(
        right,
        homeIdentity
      );

    const rightIsAway =
      containsTeam(
        right,
        awayIdentity
      );

    if (
      leftIsHome &&
      rightIsAway
    ) {
      return {
        home:
          Number(match[2]),

        away:
          Number(match[3]),

        orientation:
          "HOME_AWAY",

        confidence:
          "HIGH"
      };
    }

    if (
      leftIsAway &&
      rightIsHome
    ) {
      return {
        home:
          Number(match[3]),

        away:
          Number(match[2]),

        orientation:
          "AWAY_HOME",

        confidence:
          "HIGH"
      };
    }
  }

  return {
    home: null,
    away: null,
    orientation: null,
    confidence: "NONE"
  };
}


/* ==========================================================================
   QUALITY
   ========================================================================== */

function calculateSourceQuality({
  title,
  url,
  snippet,
  eventDate,
  targetDate,
  relation,
  effectiveType,
  rejected
}) {
  if (rejected) {
    return "REJECTED";
  }

  let score = 0;

  if (title) {
    score += 15;
  }

  if (url) {
    score += 15;
  }

  if (snippet) {
    score += 10;
  }

  if (eventDate) {
    score += 20;
  }

  if (
    eventDate ===
    targetDate
  ) {
    score += 30;
  }

  if (
    relation ===
    "EXACT_PAIR"
  ) {
    score += 20;
  } else if (
    relation ===
      "HOME_ONLY" ||
    relation ===
      "AWAY_ONLY"
  ) {
    score += 10;
  }

  if (
    effectiveType !==
    SOURCE_TYPES.UNKNOWN
  ) {
    score += 10;
  }

  if (score >= 100) {
    return "HIGH";
  }

  if (score >= 70) {
    return "MEDIUM";
  }

  return "LOW";
}


function buildQuality({
  allSources,
  acceptedSources,
  currentMatchSources,
  recentSources,
  historicalSources,
  futureSources,
  undatedSources,
  form,
  h2h,
  statsEvidence,
  injuries,
  lineups,
  odds
}) {
  const acceptedRatio =
    allSources.length
      ? acceptedSources.length /
        allSources.length
      : 0;

  let overall = "LOW";

  if (
    currentMatchSources.length >= 2 &&
    (
      form.home.length > 0 ||
      form.away.length > 0
    )
  ) {
    overall = "HIGH";
  } else if (
    currentMatchSources.length > 0 ||
    recentSources.length > 0 ||
    h2h.length > 0
  ) {
    overall = "MEDIUM";
  }

  return {
    overall,

    totalSources:
      allSources.length,

    acceptedSources:
      acceptedSources.length,

    rejectedSources:
      allSources.filter(
        source =>
          source.rejected
      ).length,

    acceptedRatio:
      Number(
        acceptedRatio.toFixed(3)
      ),

    currentMatchSources:
      currentMatchSources.length,

    recentSources:
      recentSources.length,

    historicalSources:
      historicalSources.length,

    futureSources:
      futureSources.length,

    undatedSources:
      undatedSources.length,

    formHome:
      form.home.length,

    formAway:
      form.away.length,

    h2h:
      h2h.length,

    stats:
      statsEvidence.length,

    injuries:
      injuries.length,

    confirmedLineups:
      lineups.confirmed.length,

    predictedLineups:
      lineups.predicted.length,

    odds:
      odds.length
  };
}


/* ==========================================================================
   WARNINGS
   ========================================================================== */

function buildWarnings({
  normalizedSources,
  acceptedSources,
  currentMatchSources,
  recentSources,
  historicalSources,
  futureSources,
  undatedSources,
  form,
  h2h,
  statsEvidence,
  injuries,
  lineups,
  odds
}) {
  const warnings = [];

  const rejected =
    normalizedSources.filter(
      source =>
        source.rejected
    );

  const wrongClubSources =
    rejected.filter(
      source =>
        source.rejectionReason ===
        "WRONG_CONCEPCION_CLUB"
    );

  if (
    wrongClubSources.length > 0
  ) {
    warnings.push({
      code:
        "WRONG_CONCEPCION_CLUB_FILTERED",

      severity:
        "INFO",

      message:
        `${wrongClubSources.length} source(s) were rejected because they refer to the wrong Concepcion club.`
    });
  }

  if (
    currentMatchSources.length === 0
  ) {
    warnings.push({
      code:
        "NO_CURRENT_MATCH_SOURCE",

      severity:
        "HIGH",

      message:
        "No reliable current-match source was found for the target fixture."
    });
  }

  if (
    form.home.length === 0 ||
    form.away.length === 0
  ) {
    warnings.push({
      code:
        "INCOMPLETE_RECENT_FORM",

      severity:
        "MEDIUM",

      message:
        "Recent form evidence is incomplete for one or both teams."
    });
  }

  if (
    h2h.length === 0
  ) {
    warnings.push({
      code:
        "NO_H2H",

      severity:
        "LOW",

      message:
        "No historical head-to-head evidence was found."
    });
  }

  if (
    statsEvidence.length === 0
  ) {
    warnings.push({
      code:
        "NO_CURRENT_STATS",

      severity:
        "MEDIUM",

      message:
        "No exact-pair current-match statistics source was found."
    });
  }

  if (
    injuries.length === 0
  ) {
    warnings.push({
      code:
        "NO_INJURY_EVIDENCE",

      severity:
        "LOW",

      message:
        "No current or match-specific injury evidence was found."
    });
  }

  if (
    lineups.confirmed.length === 0 &&
    lineups.predicted.length === 0
  ) {
    warnings.push({
      code:
        "NO_LINEUP_EVIDENCE",

      severity:
        "LOW",

      message:
        "No lineup evidence was found."
    });
  }

  if (
    odds.length === 0
  ) {
    warnings.push({
      code:
        "NO_CURRENT_ODDS",

      severity:
        "MEDIUM",

      message:
        "No exact-pair current-match odds source was found."
    });
  }

  if (
    historicalSources.length > 0
  ) {
    warnings.push({
      code:
        "HISTORICAL_EVIDENCE_PRESENT",

      severity:
        "INFO",

      message:
        `${historicalSources.length} historical source(s) were retained for audit/context only and are not treated as current-match evidence.`
    });
  }

  if (
    futureSources.length > 0
  ) {
    warnings.push({
      code:
        "FUTURE_EVIDENCE_PRESENT",

      severity:
        "INFO",

      message:
        `${futureSources.length} future source(s) were retained but excluded from current-match evidence.`
    });
  }

  if (
    undatedSources.length > 0
  ) {
    warnings.push({
      code:
        "UNDATED_EVIDENCE_PRESENT",

      severity:
        "INFO",

      message:
        `${undatedSources.length} source(s) have no reliable event date and are kept separately.`
    });
  }

  const typeOverrides =
    normalizedSources.filter(
      source =>
        source.suppliedType !==
          source.sourceType &&
        source.suppliedType !==
          SOURCE_TYPES.UNKNOWN
    );

  if (
    typeOverrides.length > 0
  ) {
    warnings.push({
      code:
        "SOURCE_TYPE_OVERRIDES",

      severity:
        "INFO",

      message:
        `${typeOverrides.length} source(s) had their supplied type overridden by content-based classification.`
    });
  }

  return warnings;
}


/* ==========================================================================
   DEDUPLICATION
   ========================================================================== */

function dedupeEvidence(
  items
) {
  const seen = new Set();
  const result = [];

  for (
    const item
    of items || []
  ) {
    const key = [
      item.sourceId || "",
      item.url || "",
      item.eventDate || "",
      item.market || "",
      item.line || "",
      item.value || "",
      item.status || ""
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}


function dedupeByUrl(
  items
) {
  const seen = new Set();
  const result = [];

  for (
    const item
    of items || []
  ) {
    const key =
      cleanText(item.url) ||
      cleanText(item.sourceId) ||
      JSON.stringify(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}


/* ==========================================================================
   DATE UTILITIES
   ========================================================================== */

function compareDates(
  a,
  b
) {
  if (!a || !b) {
    return 0;
  }

  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}


function daysBetween(
  a,
  b
) {
  if (!a || !b) {
    return Infinity;
  }

  const first =
    dateToUTCNumber(a);

  const second =
    dateToUTCNumber(b);

  if (
    first === null ||
    second === null
  ) {
    return Infinity;
  }

  return Math.round(
    Math.abs(
      second - first
    ) / 86400000
  );
}


function dateToUTCNumber(
  value
) {
  const match =
    String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return null;
  }

  const date =
    makeValidDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    );

  return date
    ? date.getTime()
    : null;
}


/* ==========================================================================
   TEXT UTILITIES
   ========================================================================== */

function cleanText(
  value
) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[’‘`]/g,
      "'"
    )
    .replace(
      /[–—]/g,
      "-"
    )
    .replace(
      /[“”]/g,
      '"'
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .toLowerCase();
}


function firstString(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      return String(
        value
      ).trim();
    }
  }

  return null;
}


function escapeRegex(
  value
) {
  return String(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
}


/* ==========================================================================
   OPTIONAL SOURCE HELPERS
   ========================================================================== */

function isH2HSource(
  source
) {
  return (
    source &&
    source.h2h === true
  );
}


function isCurrentSource(
  source
) {
  return (
    source &&
    source.relevance ===
      RELEVANCE.CURRENT_MATCH
  );
}


function isRecentSource(
  source
) {
  return (
    source &&
    source.relevance ===
      RELEVANCE.RECENT
  );
}


function isHistoricalSource(
  source
) {
  return (
    source &&
    source.relevance ===
      RELEVANCE.HISTORICAL
  );
}


/* ==========================================================================
   EXPORT
   ========================================================================== */

module.exports = {
  handler,
  VERSION
};
```0
