const userService = require("../services/userService");
const logService = require("../services/logService");
const { parseProfileUpdate } = require("../validators/accountInput");
const { parseDate, parseMealId, parseNewMeal, parseRange, parseServingsChange, parseWeekStart } = require("../validators/logInput");
const { campusDate } = require("../services/hours");

// Everything here is for the signed-in user (req.userId, see requireUser).

// GET /api/me
async function profile(req, res) {
    res.json({ data: await userService.getProfile(req.userId) });
}

// PATCH /api/me { name?, phone?, goals?, budget?, balanceCents? }
async function updateProfile(req, res) {
    res.json({ data: await userService.updateProfile(req.userId, parseProfileUpdate(req.body)) });
}

// GET /api/me/log?from=YYYY-MM-DD&to=YYYY-MM-DD (default: today on campus)
async function log(req, res) {
    const { from, to } = parseRange(req.query, campusDate());
    res.json({ data: await logService.getDays(req.userId, from, to) });
}

// POST /api/me/log/:date/meals { menuItemId, servings? }
async function addMeal(req, res) {
    const date = parseDate(req.params.date);
    const { meal, day } = await logService.addMeal(req.userId, date, parseNewMeal(req.body));
    res.status(201).json({ data: { mealId: meal, day } });
}

// PATCH /api/me/log/:date/meals/:mealId { servings }
async function changeMeal(req, res) {
    const date = parseDate(req.params.date);
    const day = await logService.changeServings(req.userId, date, parseMealId(req.params.mealId), parseServingsChange(req.body));
    res.json({ data: day });
}

// DELETE /api/me/log/:date/meals/:mealId
async function removeMeal(req, res) {
    const date = parseDate(req.params.date);
    res.json({ data: await logService.removeMeal(req.userId, date, parseMealId(req.params.mealId)) });
}

// GET /api/me/week?start=YYYY-MM-DD (default: this week's Sunday on campus)
async function week(req, res) {
    res.json({ data: await logService.getWeek(req.userId, parseWeekStart(req.query, campusDate())) });
}

module.exports = { profile, updateProfile, log, addMeal, changeMeal, removeMeal, week };
