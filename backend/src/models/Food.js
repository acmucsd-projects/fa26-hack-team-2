// HT2_DB "Foods" collection: what a food is, independent of where it's sold.
// MongoDB also enforces db/validators/Foods.json.
const { Schema, model } = require("mongoose");
const { DB_ALLERGEN } = require("../constants/tags");

// Unknown nutrition values are null, never 0.
const amount = { type: Number, min: 0, default: null };

const nutritionSchema = new Schema({
    calorie: amount,
    fat_cal: amount,
    sat_fat: amount, // g
    trans_fat: amount, // g
    cholesterol: amount, // mg
    sodium: amount, // mg
    serving_size: amount, // oz
    fiber: amount, // g
    sugar: amount, // g
    macros: {
        protein: amount, // g
        carb: amount, // g
        fat: amount // g
    }
}, { _id: false });

const allergensSchema = new Schema(
    Object.fromEntries(Object.values(DB_ALLERGEN).map((field) => [field, { type: Boolean, required: true, default: false }])),
    { _id: false }
);

const flag = { type: Boolean, required: true, default: false };

const foodSchema = new Schema({
    _example: Boolean,
    name: { type: String, required: true, trim: true },
    personal: flag, // true = entered by a student, false = from HDH
    beverage: flag,
    vegan: flag,
    vegetarian: flag,
    wellness: flag,
    sustainability: flag,
    ingredients: { type: [String], default: [] },
    allergens: { type: allergensSchema, required: true, default: () => ({}) },
    nutrition: { type: nutritionSchema, required: true, default: () => ({}) }
}, { collection: "Foods", versionKey: false });

module.exports = model("Food", foodSchema);
