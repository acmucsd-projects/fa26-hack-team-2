const locationService = require("../services/locationService");

// GET /api/locations
async function list(req, res) {
    res.json({ data: await locationService.listLocations() });
}

// GET /api/locations/:id/stations
async function stations(req, res) {
    res.json({ data: await locationService.getStations(req.params.id) });
}

module.exports = { list, stations };
