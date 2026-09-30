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

        // Get the year directly from the requested match date
        const matchYear = new Date(date).getUTCFullYear();

        // Targeted searches
        const searches = [
            {
                type: "form",
                query:
                    `"${home}" "${away}" recent form last 5 matches ${matchYear} football`
            },

            {
                type: "h2h",
                query:
                    `"${home}" "${away}" head to head H2H results football`
            },

            {
                type: "stats",
                query:
                    `"${home}" "${away}" statistics goals xG BTTS over under ${matchYear} football`
            },

            {
                type: "injuries",
                query:
                    `"${home}" "${away}" injuries suspended players team news ${matchYear} football`
            },

            {
                type: "lineups",
                query:
                    `"${home}" "${away}" predicted lineup starting XI ${matchYear} football`
            },

            {
                type: "odds",
                query:
                    `"${home}" "${away}" odds 1X2 over under BTTS ${matchYear} football`
            }
        ];

        const results = [];

        for (const search of searches) {
            try {
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
                    success: response.ok,

                    results: (data.organic || []).map(item => ({
                        title: item.title || null,
                        link: item.link || null,
                        snippet: item.snippet || null,
                        date: item.date || null,
                        position: item.position || null
                    })),

                    knowledgeGraph:
                        data.knowledgeGraph || null
                });

            } catch (searchError) {

                results.push({
                    type: search.type,
                    query: search.query,
                    status: 500,
                    success: false,
                    error: searchError.message,
                    results: []
                });
            }
        }

        // Flatten all results for easier processing later
        const allResults = [];

        for (const search of results) {
            for (const item of search.results) {
                allResults.push({
                    type: search.type,
                    title: item.title,
                    link: item.link,
                    snippet: item.snippet,
                    date: item.date,
                    position: item.position
                });
            }
        }

        return res.status(200).json({

            match: {
                home,
                away,
                date,
                year: matchYear
            },

            searchedAt: new Date().toISOString(),

            searches: results,

            allResults: allResults,

            summary: {
                totalSearches: searches.length,

                successfulSearches:
                    results.filter(item => item.success).length,

                failedSearches:
                    results.filter(item => !item.success).length,

                totalResults:
                    allResults.length
            },

            analysisReady: {
                form: true,
                h2h: true,
                stats: true,
                injuries: true,
                lineups: true,
                odds: true
            },

            warnings: [
                "Web results are raw source information.",
                "No prediction has been generated from web results.",
                "Missing statistics must not be guessed.",
                "Source URLs should be retained for verification."
            ]
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Web data search failed.",
            details: error.message
        });
    }
}
