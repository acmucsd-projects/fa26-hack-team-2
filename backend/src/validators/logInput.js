const { isObjectIdOrHexString } = require("mongoose");
const { badRequest, notFound } = require("../utils/httpError");

// Inputs for /api/me/log and /api/me/week.

const MAX_RANGE_DAYS = 62;
const MAX_SERVINGS = 20;

// "YYYY-MM-DD" that is a real calendar date.
function parseDate(value, name = "date") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw badRequest(`${name} must be a date like 2026-11-17`);
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw badRequest(`${name} ${value} isn't a real date`);
    }
    return value;
}

// Dates are compared and stepped through as UTC midnights.
const toTime = (date) => Date.parse(`${date}T00:00:00Z`);
const fromTime = (time) => new Date(time).toISOString().slice(0, 10);
const addDays = (date, days) => fromTime(toTime(date) + days * 86400000);

// Every date from `from` to `to`, inclusive.
function datesBetween(from, to) {
    const dates = [];
    for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
    return dates;
}

// GET /api/me/log?from=2026-11-15&to=2026-11-21 (both default to `today`).
function parseRange(query, today) {
    const from = query.from === undefined ? (query.to === undefined ? today : parseDate(query.to, "to")) : parseDate(query.from, "from");
    const to = query.to === undefined ? from : parseDate(query.to, "to");
    if (to < from) throw badRequest("to can't be before from");
    if ((toTime(to) - toTime(from)) / 86400000 + 1 > MAX_RANGE_DAYS) throw badRequest(`Ask for at most ${MAX_RANGE_DAYS} days at a time`);
    return { from, to };
}

// GET /api/me/week?start=2026-11-15 (defaults to the Sunday of this week).
function parseWeekStart(query, today) {
    if (query.start !== undefined) return parseDate(query.start, "start");
    const weekday = new Date(toTime(today)).getUTCDay(); // 0 = Sunday
    return addDays(today, -weekday);
}

function servings(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_SERVINGS) {
        throw badRequest(`servings must be a number above 0 and at most ${MAX_SERVINGS}`);
    }
    return Math.round(value * 100) / 100;
}

// POST /api/me/log/:date/meals { menuItemId, servings? }
function parseNewMeal(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("Send { menuItemId, servings } as JSON");
    const unknown = Object.keys(body).filter((key) => !["menuItemId", "servings"].includes(key));
    if (unknown.length) throw badRequest(`Unknown field(s): ${unknown.join(", ")}. Allowed: menuItemId, servings`);
    if (!isObjectIdOrHexString(body.menuItemId)) throw badRequest("menuItemId must be an id from /api/menus or /api/menus/search");
    return { menuItemId: String(body.menuItemId), servings: body.servings === undefined ? 1 : servings(body.servings) };
}

// PATCH /api/me/log/:date/meals/:mealId { servings }
function parseServingsChange(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("Send { servings } as JSON");
    const unknown = Object.keys(body).filter((key) => key !== "servings");
    if (unknown.length) throw badRequest(`Unknown field(s): ${unknown.join(", ")}. Allowed: servings`);
    return servings(body.servings);
}

function parseMealId(value) {
    if (!isObjectIdOrHexString(value)) throw notFound(`Meal "${value}" not found`);
    return String(value);
}

module.exports = { parseDate, parseRange, parseWeekStart, parseNewMeal, parseServingsChange, parseMealId, datesBetween, addDays };
