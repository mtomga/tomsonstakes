export default async function handler(req, res) {
    try {
        const {
            home,
            away,
            date
        } = req.query;

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

        const query =
            `"${home}" vs "${away}" ${date} football`;

        const response = await fetch(
            "https://google.serper.dev/search",
            {
                method: "POST",
                headers: {
                    "X-API-KEY": apiKey,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    q: query,
                    num: 10
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        return res.status(200).json({
            query,
            searchedAt: new Date().toISOString(),
            results: data.organic || [],
            knowledgeGraph: data.knowledgeGraph || null
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Web search failed.",
            details: error.message
        });
    }
}
