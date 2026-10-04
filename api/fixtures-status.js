export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET."
    });
  }

  const apiKey = process.env.APIFOOTBALL_KEY;

  // Check that the Vercel environment variable exists
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "APIFOOTBALL_KEY is not configured.",
      hint: "Add APIFOOTBALL_KEY to the Vercel environment variables and redeploy."
    });
  }

  try {
    const response = await fetch(
      "https://v3.football.api-sports.io/status",
      {
        method: "GET",
        headers: {
          "x-apisports-key": apiKey,
          "Accept": "application/json"
        }
      }
    );

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      return res.status(502).json({
        success: false,
        error: "API-Football returned a non-JSON response.",
        providerStatus: response.status,
        providerResponse: rawText.slice(0, 2000)
      });
    }

    // API-Football may return HTTP 200 while reporting an
    // account-level problem inside the errors object.
    const providerErrors =
      data && typeof data.errors === "object"
        ? data.errors
        : {};

    const hasProviderErrors =
      providerErrors &&
      Object.keys(providerErrors).length > 0;

    if (!response.ok || hasProviderErrors) {
      return res.status(response.ok ? 502 : response.status).json({
        success: false,
        error: "API-Football status check reported an error.",
        providerStatus: response.status,
        providerErrors,
        providerMessage: data?.message || null,
        providerResponse: data
      });
    }

    // Return the complete status information so we can inspect
    // account/subscription/request information.
    return res.status(200).json({
      success: true,
      message: "API-Football status request completed successfully.",
      providerStatus: response.status,
      account: data?.response?.account || null,
      subscription: data?.response?.subscription || null,
      requests: data?.response?.requests || null,
      providerResponse: data
    });

  } catch (error) {
    console.error("API-Football status check error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to connect to API-Football.",
      message: error?.message || "Unknown server error."
    });
  }
}

After deploying, open:

"https://YOUR-VERCEL-DOMAIN.vercel.app/api/fixtures-status"

Then paste the entire JSON response here. Don't paste your API key—the endpoint above never exposes it.

That response should tell us whether API-Football is reporting anything beyond the dashboard's generic “account suspended” message.
