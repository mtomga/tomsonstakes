const fetch = global.fetch;

module.exports = async function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET."
    });
  }

  const apiKey = process.env.APIFOOTBALL_KEY;

  // Check API key configuration
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "APIFOOTBALL_KEY is not configured.",
      hint: "Check Vercel Environment Variables and redeploy."
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

    const providerErrors =
      data &&
      typeof data.errors === "object" &&
      data.errors !== null
        ? data.errors
        : {};

    const hasProviderErrors =
      Object.keys(providerErrors).length > 0;

    if (!response.ok || hasProviderErrors) {
      return res.status(response.ok ? 502 : response.status).json({
        success: false,
        error: "API-Football status check reported an error.",
        providerStatus: response.status,
        providerErrors: providerErrors,
        providerMessage: data && data.message
          ? data.message
          : null,
        providerResponse: data
      });
    }

    return res.status(200).json({
      success: true,
      message: "API-Football status request completed successfully.",
      providerStatus: response.status,
      account: data &&
        data.response &&
        data.response.account
        ? data.response.account
        : null,
      subscription: data &&
        data.response &&
        data.response.subscription
        ? data.response.subscription
        : null,
      requests: data &&
        data.response &&
        data.response.requests
        ? data.response.requests
        : null,
      providerResponse: data
    });

  } catch (error) {
    console.error(
      "API-Football status check error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to connect to API-Football.",
      message: error && error.message
        ? error.message
        : "Unknown server error."
    });
  }
};

Then deploy

After Vercel finishes deploying, open:

https://YOUR-VERCEL-DOMAIN.vercel.app/api/fixtures-status

For example:

https://tomsonstakes.vercel.app/api/fixtures-status

Don't change "APIFOOTBALL_KEY".

Send me the JSON response you get. That will let us determine whether the suspension is being reported by the API status endpoint and what information API-Football is exposing about the account.
