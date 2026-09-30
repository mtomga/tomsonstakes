export default async function handler(req, res) {
    try {
        const { home, away, date } = req.query;

        if (!home || !away || !date) {
            return res.status(400).json({
                error: "home, away and date are required."
            });
        }

        const apiKey = process.env.SERPER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "SERPER_API_KEY is not configured."
            });
        }

        const searches = [
            {
                type: "form",
                query: `"${home}" "${away}" recent form results 2026 football`
            },
            {
                type: "h2h",
                query: `"${home}" "${away}" head to head H2H football`
            },
            {
                type: "stats",
                query: `"${home}" "${away}" statistics goals xG BTTS over under 2026`
            }
        ];

        const results = [];

        for (const search of searches) {

            const response = await fetch(
                "https://google.serper.dev/search",
                {
                    method: "POST",

                    headers: {
                        "X-API-KEY": apiKey,
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        q: search.query,
                        num: 8
                    })
                }
            );

            const data = await response.json();

            results.push({
                type: search.type,
                query: search.query,
                status: response.status,
                organic: data.organic || [],
                knowledgeGraph: data.knowledgeGraph || null
            });
        }

        return res.status(200).json({
            match: {
                home,
                away,
                date
            },

            searchedAt: new Date().toISOString(),

            searches: results,

            summary: {
                totalSearches: searches.length,
                totalResults: results.reduce(
                    (total, item) => total + item.organic.length,
                    0
                )
            }
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Web data search failed.",
            details: error.message
        });
    }
}
