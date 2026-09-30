export default async function handler(req, res) {
    try {

        const { team, last } = req.query;

        if (!team) {
            return res.status(400).json({
                error: "Team ID is required."
            });
        }

        const apiKey = process.env.APIFOOTBALL_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "API key is not configured."
            });
        }

        const numberOfMatches = last || 10;

        const response = await fetch(
            `https://v3.football.api-sports.io/fixtures?team=${encodeURIComponent(team)}&last=${encodeURIComponent(numberOfMatches)}`,
            {
                headers: {
                    "x-apisports-key": apiKey
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        return res.status(200).json(data);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Unable to retrieve team analysis data.",
            details: error.message
        });
    }
}
