// HT2_DB "Locations" collection. MongoDB also enforces db/validators/Locations.json.
const { Schema, model } = require("mongoose");
const { DAYS, LOCATION_TYPES } = require("../constants/tags");

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/; // 24-hour "HH:MM", America/Los_Angeles

// A station can have several windows on the same day
// (e.g. Street Eats closes 10:45–11:15 AM).
const hoursSchema = new Schema({
    day: { type: String, enum: DAYS, required: true },
    open: { type: String, match: HHMM, required: true },
    close: { type: String, match: HHMM, default: null } // null = closing time unknown
}, { _id: false });

const stationSchema = new Schema({
    station_id: { type: Schema.Types.ObjectId, required: true },
    station_name: { type: String, required: true },
    // Added by the backend (not in the original HT2_DB schema, which allows extra fields).
    hours: { type: [hoursSchema], default: null }, // null = hours unknown
    notes: { type: String, default: null }
}, { _id: false });

const locationSchema = new Schema({
    _example: Boolean, // placeholder docs from the schema designer; hidden from the API
    name: { type: String, required: true },
    type: { type: String, enum: LOCATION_TYPES, required: true },
    location: {
        area: { type: String, required: true }, // e.g. "Muir College"
        geodata: { type: Schema.Types.Mixed, default: () => ({}) } // GeoJSON point once we have coordinates
    },
    stations: { type: [stationSchema], default: [] }
}, { collection: "Locations", versionKey: false });

module.exports = model("Location", locationSchema);
