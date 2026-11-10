const { isObjectIdOrHexString } = require("mongoose");
const Location = require("../models/Location");
const { campusNow, isOpenNow } = require("./hours");
const { toLocationDto, toStationDto } = require("./dto");
const { notFound } = require("../utils/httpError");

// Placeholder documents from the schema designer are never shown.
const VISIBLE = { _example: { $ne: true } };

async function findLocation(id, projection) {
    const location = isObjectIdOrHexString(id)
        ? await Location.findOne({ _id: id, ...VISIBLE }, projection).lean()
        : null;
    if (!location) throw notFound(`Location "${id}" not found`);
    return location;
}

async function listLocations() {
    const docs = await Location.find(VISIBLE, { stations: 0 }).sort({ name: 1 }).lean();
    return docs.map(toLocationDto);
}

async function getStations(locationId, now = campusNow()) {
    const location = await findLocation(locationId, { stations: 1 });
    return location.stations.map((s) => toStationDto(s, isOpenNow(s.hours, now)));
}

module.exports = { VISIBLE, findLocation, listLocations, getStations };
