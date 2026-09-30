export default async function handler(req, res) {
    try {

        const { team, from, to } = req.query;

        if (!team) {
            return res.status(400).json({
                error: "Team ID is required."
            });
        }

        if (!from || !to) {
            return res.status(400).json({
                error: "Both from and to dates are required. Use YYYY-MM-DD."
            });
        }

        const apiKey = process.env.APIFOOTBALL_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "API key is not configured."
            });
        }

        const url =
            `https://v3.football.api-sports.io/fixtures` +
            `?team=${encodeURIComponent(team)}` +
            `&from=${encodeURIComponent(from)}` +
            `&to=${encodeURIComponent(to)}`;

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
            error: "Unable to retrieve team fixtures.",
            details: error.message
        });
    }
}
