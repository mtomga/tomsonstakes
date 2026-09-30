export default async function handler(req, res) {
    try {
        const {
            fixture,
            homeId,
            awayId,
            home,
            away,
            date
        } = req.query;

        if (!fixture || !homeId || !awayId || !home || !away || !date) {
            return res.status(400).json({
                error: "fixture, homeId, awayId, home, away and date are required."
            });
        }

        const result = {
            match: {
                fixture,
                date,
                home: {
                    id: homeId,
                    name: home
                },
                away: {
                    id: awayId,
                    name: away
                }
            },

            sources: {
                apiFootball: {
                    available: false,
                    data: null
                },

                sportmonks: {
                    available: false,
                    data: null
                },

                web: {
                    available: false,
                    data: null
                }
            },

            analysisData: {
                form: null,
                goals: null,
                xg: null,
                btts: null,
                overUnder: null,
                h2h: null,
                injuries: null,
                lineups: null,
                odds: null
            },

            warnings: []
        };

        // --------------------------------------------------
        // API-FOOTBALL
        // --------------------------------------------------

        const footballKey = process.env.APIFOOTBALL_KEY;

        if (footballKey) {

            const apiUrl =
                `https://v3.football.api-sports.io/fixtures?id=${encodeURIComponent(fixture)}`;

            const apiResponse = await fetch(apiUrl, {
                headers: {
                    "x-apisports-key": footballKey
                }
            });

            const apiData = await apiResponse.json();

            if (
                apiResponse.ok &&
                apiData.results &&
                apiData.results > 0
            ) {
                result.sources.apiFootball.available = true;
                result.sources.apiFootball.data = apiData;
            } else {
                result.warnings.push(
                    "API-Football did not return fixture details."
                );
            }
        } else {
            result.warnings.push(
                "APIFOOTBALL_KEY is not configured."
            );
        }

        // --------------------------------------------------
        // SPORTMONKS
        // --------------------------------------------------

        const sportmonksToken = process.env.SPORTMONKS_TOKEN;

        if (sportmonksToken) {

            const teamIds = [homeId, awayId];

            for (const teamId of teamIds) {

                const sportUrl =
                    `https://api.sportmonks.com/v3/football/teams/${teamId}`;

                const sportResponse = await fetch(sportUrl, {
                    headers: {
                        "Authorization": sportmonksToken,
                        "Accept": "application/json"
                    }
                });

                const sportData = await sportResponse.json();

                if (
                    sportResponse.ok &&
                    sportData.data
                ) {
                    result.sources.sportmonks.available = true;

                    if (!result.sources.sportmonks.data) {
                        result.sources.sportmonks.data = [];
                    }

                    result.sources.sportmonks.data.push(
                        sportData.data
                    );
                }
            }

            if (!result.sources.sportmonks.available) {
                result.warnings.push(
                    "Sportmonks returned no accessible team data for this match."
                );
            }

        } else {
            result.warnings.push(
                "SPORTMONKS_TOKEN is not configured."
            );
        }

        // --------------------------------------------------
        // WEB DATA PLACEHOLDER
        // --------------------------------------------------

        result.sources.web = {
            available: false,
            status: "Web search provider not connected yet.",
            query: `${home} vs ${away} ${date}`
        };

        result.warnings.push(
            "Web-data provider has not yet been connected."
        );

        // --------------------------------------------------
        // RETURN NORMALIZED DATA
        // --------------------------------------------------

        return res.status(200).json(result);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Match data collection failed.",
            details: error.message
        });
    }
}
