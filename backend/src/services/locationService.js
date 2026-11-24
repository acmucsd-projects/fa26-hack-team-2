const { isObjectIdOrHexString } = require("mongoose");
const Location = require("../models/Location");
const MenuItem = require("../models/MenuItem");
const { campusNow, isOpenNow } = require("./hours");
const { toLocationDto, toStationDto } = require("./dto");
const { notFound } = require("../utils/httpError");

async function findLocation(id, projection) {
    const location = isObjectIdOrHexString(id) ? await Location.findById(id, projection).lean() : null;
    if (!location) throw notFound(`Location "${id}" not found`);
    return location;
}

// How many menu items each location or station has: { "<id>": count }.
async function itemCounts(field, match = {}) {
    const rows = await MenuItem.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
    return new Map(rows.map((r) => [String(r._id), r.count]));
}

async function listLocations(now = campusNow()) {
    const [docs, counts] = await Promise.all([
        Location.find({}).sort({ name: 1 }).lean(),
        itemCounts("loc_id")
    ]);
    return docs.map((doc) => ({
        ...toLocationDto(doc, isOpenNow(doc.hours, now)),
        stationCount: doc.stations.length,
        itemCount: counts.get(String(doc._id)) ?? 0
    }));
}

async function getStations(locationId) {
    const location = await findLocation(locationId, { stations: 1 });
    const counts = await itemCounts("station_id", { loc_id: location._id });
    return location.stations.map((station) => ({
        ...toStationDto(station),
        itemCount: counts.get(String(station.station_id)) ?? 0
    }));
}

module.exports = { findLocation, listLocations, getStations };
