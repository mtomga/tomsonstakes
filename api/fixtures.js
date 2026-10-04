// /api/fixtures.js
// TOMSONSTAKES — SportMonks connection diagnostic

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET."
    });
  }

  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      error: "SPORTMONKS_API_TOKEN is missing from Vercel environment variables."
    });
  }

  const date = String(req.query?.date || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      error: "Date is required. Use YYYY-MM-DD."
    });
  }

  try {
    const url =
      `https://api.sportmonks.com/v3/football/fixtures/date/${date}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": token,
        "Accept": "application/json"
      }
    });

    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return res.status(502).json({
        success: false,
        error: "SportMonks returned a non-JSON response.",
        providerStatus: response.status
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: "SportMonks returned an error.",
        providerStatus: response.status,
        providerErrors: data?.message || data?.errors || null
      });
    }

    return res.status(200).json({
      success: true,
      message: "SportMonks authentication is working.",
      date,
      fixtureCount: Array.isArray(data?.data)
        ? data.data.length
        : 0
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Unable to connect to SportMonks.",
      details: error?.message || "Unknown error."
    });
  }
}
