// HT2_DB "Users" collection. MongoDB also enforces db/validators/Users.json.
// Units: calorie goals in tenths of a calorie, other nutrition goals in
// milligrams, money in cents. The password is only ever stored hashed.
const { Schema, model } = require("mongoose");
const { SCHEMA_VERSION } = require("../constants/tags");
const { version, amount, schemaOptions } = require("./shared");

// Same patterns as the database rules.
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE = /^\+[1-9]\d{0,2} \(\d{3}\) \d{3}-\d{4}$/;

const range = () => ({
    type: new Schema({ min: amount, max: amount }, { _id: false, minimize: false }),
    required: true,
    default: () => ({}),
});

const userSchema = new Schema({
    version: { ...version, default: SCHEMA_VERSION },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true }, // scrypt hash, see auth/password.js
    contact: {
        email: { type: String, required: true, trim: true, lowercase: true, match: EMAIL },
        phone: { type: String, match: PHONE },
    },
    nutrition_goals: {
        calorie: range(),
        protein: range(),
        carb: range(),
        fat: range(),
    },
    finances: {
        balance: amount, // dining dollars left, cents
        goals: {
            type: new Schema({ daily: amount, weekly: amount, monthly: amount, yearly: amount }, { _id: false, minimize: false }),
            required: true,
            default: () => ({}),
        },
    },
}, schemaOptions("Users"));

// One account per email (also created by `npm run db:indexes`).
userSchema.index({ "contact.email": 1 }, { unique: true });

module.exports = model("User", userSchema);
module.exports.EMAIL = EMAIL;
module.exports.PHONE = PHONE;
