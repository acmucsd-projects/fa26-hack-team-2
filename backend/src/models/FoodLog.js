// HT2_DB "Food_Logs" collection: one document per user. MongoDB also
// enforces db/validators/Food_Logs.json.
//
//   days: {
//     "2026-11-17": {
//       totals: { calorie, protein, carb, fat },   // whole numbers: tenths of a calorie, milligrams
//       meals: [{ menu_item_id, food_id, servings, log_ts,
//                 meal_id, snapshot }]              // the last two are added by the backend, see below
//     }
//   }
//
// Two fields beyond the schema doc (the rules allow extra fields on a meal):
//   meal_id   a stable id, so a meal can be edited or removed reliably
//   snapshot  price (cents) and nutrition (calorie, protein, carb, fat) for ONE
//             serving at the time it was logged, so later menu or price
//             changes don't rewrite history, and the totals can be recomputed
//             from the day's meals alone. Unknown values are null.
//
// Days are read and written with the MongoDB driver (services/logService.js),
// since their keys are dates.
const { Schema, model } = require("mongoose");
const { SCHEMA_VERSION } = require("../constants/tags");
const { version, schemaOptions } = require("./shared");

const foodLogSchema = new Schema({
    version: { ...version, default: SCHEMA_VERSION },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    days: { type: Schema.Types.Mixed, default: () => ({}) },
}, schemaOptions("Food_Logs"));

// One log document per user (also created by `npm run db:indexes`).
foodLogSchema.index({ user_id: 1 }, { unique: true });

module.exports = model("FoodLog", foodLogSchema);
