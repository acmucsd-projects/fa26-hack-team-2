const User = require("../models/User");
const { hashPassword, verifyPassword, verifyAgainstDummy } = require("../auth/password");
const { conflict, unauthorized } = require("../utils/httpError");

// New accounts start with the goals from the designs: 2,200 calories,
// 110 g protein, 275 g carbs, 70 g fat, and $20 a day ($140 a week).
// Stored units: tenths of a calorie, milligrams, cents.
const DEFAULT_NUTRITION_GOALS = {
    calorie: { max: 22000 },
    protein: { min: 110000 },
    carb: { max: 275000 },
    fat: { max: 70000 },
};
const DEFAULT_BUDGET = { daily: 2000, weekly: 14000 };

// API field -> stored field and how many stored units make one API unit.
const GOAL_FIELDS = {
    calories: { field: "calorie", per: 10 },
    proteinG: { field: "protein", per: 1000 },
    carbsG: { field: "carb", per: 1000 },
    fatG: { field: "fat", per: 1000 },
};
const BUDGET_FIELDS = { dailyCents: "daily", weeklyCents: "weekly", monthlyCents: "monthly", yearlyCents: "yearly" };

const scaled = (value, per) => (typeof value === "number" ? value / per : null);

// What the API sends. Never includes the password hash.
function toUserDto(doc) {
    const goals = doc.nutrition_goals ?? {};
    const budget = doc.finances?.goals ?? {};
    return {
        id: doc._id,
        name: doc.name,
        email: doc.contact?.email ?? null,
        phone: doc.contact?.phone ?? null,
        goals: Object.fromEntries(
            Object.entries(GOAL_FIELDS).map(([key, { field, per }]) => [
                key,
                { min: scaled(goals[field]?.min, per), max: scaled(goals[field]?.max, per) },
            ]),
        ),
        budget: Object.fromEntries(Object.entries(BUDGET_FIELDS).map(([key, field]) => [key, budget[field] ?? null])),
        balanceCents: doc.finances?.balance ?? null,
    };
}

async function register({ name, email, password, phone }) {
    const user = new User({
        name,
        password: await hashPassword(password),
        contact: phone ? { email, phone } : { email },
        nutrition_goals: DEFAULT_NUTRITION_GOALS,
        finances: { goals: DEFAULT_BUDGET },
    });
    try {
        await user.save();
    } catch (error) {
        if (error.code === 11000) throw conflict("An account with that email already exists");
        throw error;
    }
    return toUserDto(user.toObject());
}

async function login({ email, password }) {
    const user = await User.findOne({ "contact.email": email }).lean();
    const valid = user ? await verifyPassword(password, user.password) : await verifyAgainstDummy(password);
    if (!valid) throw unauthorized("Email or password is incorrect");
    return toUserDto(user);
}

// The stored document, for other services. 401 if the account is gone.
async function findUser(userId) {
    const user = await User.findById(userId).lean();
    if (!user) throw unauthorized("This account no longer exists. Sign in again.");
    return user;
}

async function getProfile(userId) {
    return toUserDto(await findUser(userId));
}

// `changes` comes from validators/accountInput.parseProfileUpdate.
// null clears an optional value.
async function updateProfile(userId, changes) {
    const set = {};
    const unset = {};
    const put = (path, value) => (value === null ? (unset[path] = "") : (set[path] = value));

    if (changes.name !== undefined) set.name = changes.name;
    if (changes.phone !== undefined) put("contact.phone", changes.phone);
    for (const [key, ends] of Object.entries(changes.goals ?? {})) {
        const { field, per } = GOAL_FIELDS[key];
        for (const [end, value] of Object.entries(ends)) {
            put(`nutrition_goals.${field}.${end}`, value === null ? null : Math.round(value * per));
        }
    }
    for (const [key, value] of Object.entries(changes.budget ?? {})) put(`finances.goals.${BUDGET_FIELDS[key]}`, value);
    if (changes.balanceCents !== undefined) put("finances.balance", changes.balanceCents);

    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;

    const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true }).lean();
    if (!user) throw unauthorized("This account no longer exists. Sign in again.");
    return toUserDto(user);
}

module.exports = { register, login, findUser, getProfile, updateProfile, toUserDto, DEFAULT_NUTRITION_GOALS, DEFAULT_BUDGET };
