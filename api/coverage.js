export default async function handler(req, res) {
    try {
        const { league, season } = req.query;

        if (!league || !season) {
            return res.status(400).json({
                error: "League ID and season are required."
            });
        }

        const apiKey = process.env.APIFOOTBALL_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "API key is not configured."
            });
        }

        const url =
            `https://v3.football.api-sports.io/leagues` +
            `?id=${encodeURIComponent(league)}` +
            `&season=${encodeURIComponent(season)}`;

        const response = await fetch(url, {
            headers: {
                "x-apisports-key": apiKey
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        return res.status(200).json(data);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Unable to retrieve competition coverage.",
            details: error.message
        });
    }
}
