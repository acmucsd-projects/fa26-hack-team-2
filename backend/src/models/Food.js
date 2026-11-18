// HT2_DB "Foods" collection: what a food is, independent of where it's sold.
// MongoDB also enforces db/validators/Foods.json.
//
// Units: calorie and fat_cal are tenths of a calorie; serving_size is tenths
// of an ounce; everything else in nutrition is milligrams.
// Unknown values: a nutrition number is left out; wellness, vegetarian, vegan
// and sustainability are null; allergens is an empty object.
const { Schema, model } = require("mongoose");
const { DB_ALLERGEN } = require("../constants/tags");
const { version, amount, schemaOptions } = require("./shared");

const nutritionSchema = new Schema({
    calorie: amount,
    fat_cal: amount,
    sat_fat: amount,
    trans_fat: amount,
    cholesterol: amount,
    sodium: amount,
    serving_size: amount,
    fiber: amount,
    sugar: amount,
    macros: {
        type: new Schema({ protein: amount, carb: amount, fat: amount }, { _id: false, minimize: false }),
        required: true,
        default: () => ({})
    }
}, { _id: false, minimize: false });

// Either all ten allergens (known) or none of them (unknown).
const allergensSchema = new Schema(
    Object.fromEntries(Object.values(DB_ALLERGEN).map((field) => [field, Boolean])),
    { _id: false, minimize: false }
);

const flag = { type: Boolean, required: true };
const flagOrUnknown = { type: Boolean, default: null }; // null = unknown

const foodSchema = new Schema({
    version,
    name: { type: String, required: true, trim: true },
    personal: flag, // true = entered by a student, false = from HDH
    beverage: flag,
    wellness: flagOrUnknown,
    vegetarian: flagOrUnknown,
    vegan: flagOrUnknown,
    sustainability: flagOrUnknown,
    ingredients: { type: [String], default: [] },
    allergens: { type: allergensSchema, required: true, default: () => ({}) },
    nutrition: { type: nutritionSchema, required: true, default: () => ({}) }
}, schemaOptions("Foods"));

module.exports = model("Food", foodSchema);
