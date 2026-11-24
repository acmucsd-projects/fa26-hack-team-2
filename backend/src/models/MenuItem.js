// HT2_DB "Menu_Items" collection: a Food offered at a location/station, with
// its price there. MongoDB also enforces db/validators/Menu_Items.json.
const { Schema, model } = require("mongoose");
const { MEAL_PERIODS } = require("../constants/tags");
const { version, wholeNumber, schemaOptions } = require("./shared");

const menuItemSchema = new Schema({
    version,
    food_id: { type: Schema.Types.ObjectId, ref: "Food", required: true },
    loc_id: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    station_id: { type: Schema.Types.ObjectId }, // leave unset (not null) when the location has no stations
    meal_period: { type: String, enum: MEAL_PERIODS, required: true, default: "unknown" },
    price: { type: Number, validate: wholeNumber } // cents
}, schemaOptions("Menu_Items"));

menuItemSchema.index({ loc_id: 1, station_id: 1 });

module.exports = model("MenuItem", menuItemSchema);
