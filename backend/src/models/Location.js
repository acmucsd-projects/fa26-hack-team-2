// HT2_DB "Locations" collection. MongoDB also enforces db/validators/Locations.json.
const { Schema, model } = require("mongoose");
const { DAYS, LOCATION_TYPES } = require("../constants/tags");
const { version, schemaOptions } = require("./shared");

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/; // 24-hour "HH:MM", America/Los_Angeles

const stationSchema = new Schema({
    station_id: { type: Schema.Types.ObjectId, required: true },
    station_name: { type: String, required: true }
}, { _id: false, strict: false }); // strict: false keeps any extra fields a teammate adds

const locationSchema = new Schema({
    version,
    name: { type: String, required: true },
    type: { type: String, enum: LOCATION_TYPES, required: true },
    location: {
        area: { type: String, required: true }, // e.g. "Muir College"; "unknown" until filled in
        geodata: { type: Schema.Types.Mixed, required: true, default: () => ({}) } // GeoJSON point once we have coordinates
    },
    // One opening window for the whole location. The schema requires it, so
    // unknown hours are stored as `days: []` (see services/hours.js).
    hours: {
        days: { type: [{ type: String, enum: DAYS }], default: [] }, // may be empty (= unknown hours)
        open: { type: String, match: HHMM, required: true },
        close: { type: String, match: HHMM, required: true }
    },
    stations: { type: [stationSchema], default: [] }
}, schemaOptions("Locations"));

module.exports = model("Location", locationSchema);
