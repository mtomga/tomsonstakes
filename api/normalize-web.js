export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "POST method required."
      });
    }

    const body = req.body || {};

    return res.status(200).json({
      success: true,
      debug: true,
      message: "Payload received successfully.",
      receivedBody: body
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || String(error)
    });
  }
}
