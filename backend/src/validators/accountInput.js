const { EMAIL, PHONE } = require("../models/User");
const { badRequest } = require("../utils/httpError");

// Request bodies for /api/auth and /api/me. Each parser throws a 400 that
// names the problem, and returns only the fields it knows about.

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

function object(body, what) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest(`Send ${what} as a JSON object`);
    return body;
}

function onlyKeys(body, allowed, where = "the request") {
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length) throw badRequest(`Unknown field(s) in ${where}: ${unknown.join(", ")}. Allowed: ${allowed.join(", ")}`);
}

function text(value, name, { min = 1, max = 200 } = {}) {
    if (typeof value !== "string") throw badRequest(`${name} is required and must be text`);
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) throw badRequest(`${name} must be ${min}–${max} characters`);
    return trimmed;
}

function email(value) {
    const address = text(value, "email", { max: 254 }).toLowerCase();
    if (!EMAIL.test(address)) throw badRequest("email doesn't look like an email address");
    return address;
}

function password(value) {
    if (typeof value !== "string" || value.length < MIN_PASSWORD || value.length > MAX_PASSWORD) {
        throw badRequest(`password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters`);
    }
    return value;
}

function phone(value) {
    if (value === null) return null; // remove it
    if (typeof value !== "string" || !PHONE.test(value)) throw badRequest('phone must look like "+1 (858) 555-0123", or null to remove it');
    return value;
}

// A number >= 0, or null to clear it.
function amountOrNull(value, name) {
    if (value === null) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw badRequest(`${name} must be a number of at least 0, or null`);
    return value;
}

// POST /api/auth/register { name, email, password, phone? }
function parseRegister(body) {
    object(body, "name, email and password");
    onlyKeys(body, ["name", "email", "password", "phone"]);
    const account = { name: text(body.name, "name", { max: 80 }), email: email(body.email), password: password(body.password) };
    if (body.phone !== undefined && body.phone !== null) account.phone = phone(body.phone);
    return account;
}

// POST /api/auth/login { email, password }
function parseLogin(body) {
    object(body, "email and password");
    onlyKeys(body, ["email", "password"]);
    if (typeof body.password !== "string" || !body.password) throw badRequest("password is required");
    return { email: email(body.email), password: body.password };
}

const GOAL_KEYS = ["calories", "proteinG", "carbsG", "fatG"];
const BUDGET_KEYS = ["dailyCents", "weeklyCents", "monthlyCents", "yearlyCents"];

// PATCH /api/me — every field is optional; null clears an optional value.
// {
//   name, phone,
//   goals:  { calories: { min, max }, proteinG: { min, max }, carbsG: {...}, fatG: {...} },
//   budget: { dailyCents, weeklyCents, monthlyCents, yearlyCents },
//   balanceCents
// }
function parseProfileUpdate(body) {
    object(body, "the changes");
    onlyKeys(body, ["name", "phone", "goals", "budget", "balanceCents"]);
    const update = {};

    if (body.name !== undefined) update.name = text(body.name, "name", { max: 80 });
    if (body.phone !== undefined) update.phone = phone(body.phone);

    if (body.goals !== undefined) {
        object(body.goals, "goals");
        onlyKeys(body.goals, GOAL_KEYS, "goals");
        update.goals = {};
        for (const key of GOAL_KEYS) {
            if (body.goals[key] === undefined) continue;
            const goal = object(body.goals[key], `goals.${key}`);
            onlyKeys(goal, ["min", "max"], `goals.${key}`);
            const parsed = {};
            for (const end of ["min", "max"]) {
                if (goal[end] !== undefined) parsed[end] = amountOrNull(goal[end], `goals.${key}.${end}`);
            }
            if (typeof parsed.min === "number" && typeof parsed.max === "number" && parsed.min > parsed.max) {
                throw badRequest(`goals.${key}: min can't be more than max`);
            }
            update.goals[key] = parsed;
        }
    }

    if (body.budget !== undefined) {
        object(body.budget, "budget");
        onlyKeys(body.budget, BUDGET_KEYS, "budget");
        update.budget = {};
        for (const key of BUDGET_KEYS) {
            if (body.budget[key] === undefined) continue;
            const cents = amountOrNull(body.budget[key], `budget.${key}`);
            if (cents !== null && !Number.isInteger(cents)) throw badRequest(`budget.${key} must be whole cents`);
            update.budget[key] = cents;
        }
    }

    if (body.balanceCents !== undefined) {
        const cents = amountOrNull(body.balanceCents, "balanceCents");
        if (cents !== null && !Number.isInteger(cents)) throw badRequest("balanceCents must be whole cents");
        update.balanceCents = cents;
    }

    if (!Object.keys(update).length) throw badRequest("Nothing to change");
    return update;
}

module.exports = { parseRegister, parseLogin, parseProfileUpdate, GOAL_KEYS, BUDGET_KEYS };
