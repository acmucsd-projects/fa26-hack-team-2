// HT2_DB "Menu_Items" collection: a Food offered at a location/station, with
// its price there. MongoDB also enforces db/validators/Menu_Items.json.
const { Schema, model } = require("mongoose");
const { MEAL_PERIODS } = require("../constants/tags");

const menuItemSchema = new Schema({
    _example: Boolean,
    food_id: { type: Schema.Types.ObjectId, ref: "Food", required: true },
    loc_id: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    station_id: { type: Schema.Types.ObjectId }, // leave unset (not null) for non-dining-hall locations
    meal_period: { type: String, enum: MEAL_PERIODS, required: true, default: "unknown" },
    price: { type: Number, min: 0 } // US dollars, as in the HT2_DB schema. The API converts to cents.
}, { collection: "Menu_Items", versionKey: false });

menuItemSchema.index({ loc_id: 1, station_id: 1 });
menuItemSchema.index({ food_id: 1 });

module.exports = model("MenuItem", menuItemSchema);
