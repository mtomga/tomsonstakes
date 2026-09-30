export default async function handler(req, res) {
    try {
        const token = process.env.SPORTMONKS_TOKEN;

        if (!token) {
            return res.status(500).json({
                error: "SPORTMONKS_TOKEN is not configured."
            });
        }

        const teamId = req.query.team || "5635";

        const url =
            `https://api.sportmonks.com/v3/football/teams/${teamId}` +
            `?include=country;venue;activeSeasons;latest;upcoming;sidelined;statistics`;

        const response = await fetch(url, {
            headers: {
                "Authorization": token,
                "Accept": "application/json"
            }
        });

        const data = await response.json();

        return res.status(response.status).json(data);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Sportmonks request failed.",
            details: error.message
        });
    }
}
