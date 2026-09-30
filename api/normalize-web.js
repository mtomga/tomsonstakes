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

    const match =
      body.match ||
      body.data?.match ||
      body.normalized?.match ||
      {};

    const home = String(match.home || "").trim();
    const away = String(match.away || "").trim();
    const date = String(match.date || "").trim();

    if (!home || !away || !date) {
      return res.status(400).json({
        success: false,
        version: "V3.3",
        error: "match.home and match.away and match.date are required.",
        received: {
          home,
          away,
          date
        }
      });
    }

    const searches =
      Array.isArray(body.searches)
        ? body.searches
        : Array.isArray(body.allResults)
        ? body.allResults
        : [];

    const results = [];

    for (const item of searches) {
      if (!item) continue;

      if (typeof item === "string") {
        results.push({
          title: "",
          url: "",
          snippet: item
        });
        continue;
      }

      results.push({
        title: String(item.title || ""),
        url: String(item.url || ""),
        snippet: String(
          item.snippet ||
          item.description ||
          item.text ||
          ""
        )
      });
    }

    const combinedText = results
      .map(x => `${x.title} ${x.snippet}`)
      .join(" ")
      .trim();

    const normalized = {
      match: {
        home,
        away,
        date
      },

      form: {
        home: [],
        away: []
      },

      goals: {
        home: {},
        away: {}
      },

      xg: {
        home: {},
        away: {}
      },

      btts: {
        home: null,
        away: null
      },

      overUnder: {
        home: {},
        away: {}
      },

      injuries: {
        home: [],
        away: []
      },

      lineups: {
        home: [],
        away: []
      },

      odds: {
        home: null,
        draw: null,
        away: null
      },

      h2h: [],

      sources: results,

      rawTextLength: combinedText.length
    };

    const quality = {
      sourceCount: results.length,
      usableText: combinedText.length > 0,
      score: results.length > 0 ? 1 : 0
    };

    const dataAvailability = {
      form: false,
      goals: false,
      xg: false,
      btts: false,
      overUnder: false,
      injuries: false,
      lineups: false,
      odds: false,
      h2h: false
    };

    return res.status(200).json({
      success: true,
      version: "V3.3",
      normalized,
      quality,
      dataAvailability,
      analysisReady: true
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
