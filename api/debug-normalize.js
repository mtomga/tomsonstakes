export default async function handler(req, res) {
    return res.status(200).json({
        method: req.method,
        body: req.body || null,
        bodyType: typeof req.body,
        hasMatch: !!(req.body && req.body.match),
        match: req.body?.match || null,
        keys: req.body
            ? Object.keys(req.body)
            : []
    });
}
