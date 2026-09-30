export default async function handler(req, res) {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        error: "Date is required. Use YYYY-MM-DD."
      });
    }

    const apiKey = process.env.APIFOOTBALL_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "API key is not configured."
      });
    }

    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?date=${encodeURIComponent(date)}`,
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
    return res.status(500).json({
      error: "Unable to retrieve football fixtures.",
      details: error.message
    });
  }
}
