// The signed-in user's food log (HT2_DB "Food_Logs", one document per user,
// see models/FoodLog.js).
//
// Every change to a day is ONE atomic update that also recomputes that day's
// totals from its meals, so two changes at once can't leave wrong totals.
const mongoose = require("mongoose");
const FoodLog = require("../models/FoodLog");
const Food = require("../models/Food");
const Location = require("../models/Location");
const MenuItem = require("../models/MenuItem");
const { SCHEMA_VERSION } = require("../constants/tags");
const { notFound } = require("../utils/httpError");
const { findUser } = require("./userService");
const { datesBetween, addDays } = require("../validators/logInput");

const { ObjectId } = mongoose.Types;

// Pipeline stage: totals = sum over meals of (snapshot value × servings),
// rounded to whole units. Unknown (null) values count as 0 here; the API
// reports how many were unknown.
function totalsStage(path) {
    const sum = (field) => ({
        $round: [
            {
                $sum: {
                    $map: {
                        input: { $ifNull: [`$${path}.meals`, []] },
                        as: "meal",
                        in: { $multiply: [{ $ifNull: [`$$meal.snapshot.${field}`, 0] }, "$$meal.servings"] },
                    },
                },
            },
            0,
        ],
    });
    return { $set: { [`${path}.totals`]: { calorie: sum("calorie"), protein: sum("protein"), carb: sum("carb"), fat: sum("fat") } } };
}

// Runs an upserting update; if two first-ever writes for the same user race,
// the unique index rejects one, and trying again turns it into an update.
async function updateLog(filter, pipeline, options = {}) {
    try {
        return await FoodLog.collection.updateOne(filter, pipeline, options);
    } catch (error) {
        if (error.code !== 11000) throw error;
        return FoodLog.collection.updateOne(filter, pipeline, options);
    }
}

async function addMeal(userId, date, { menuItemId, servings }) {
    const item = await MenuItem.findById(menuItemId).lean();
    if (!item) throw notFound(`Menu item "${menuItemId}" not found`);
    const food = await Food.findById(item.food_id).lean();
    if (!food) throw notFound(`The food for menu item "${menuItemId}" no longer exists`);

    const nutrition = food.nutrition ?? {};
    const macros = nutrition.macros ?? {};
    const meal = {
        menu_item_id: item._id,
        food_id: food._id,
        servings,
        log_ts: new Date(),
        meal_id: new ObjectId(),
        // One serving, as it was when logged. Units as in Foods / Menu_Items.
        snapshot: {
            price: item.price ?? null,
            calorie: nutrition.calorie ?? null,
            protein: macros.protein ?? null,
            carb: macros.carb ?? null,
            fat: macros.fat ?? null,
        },
    };

    const path = `days.${date}`;
    await updateLog(
        { user_id: new ObjectId(userId) },
        [
            { $set: { version: { $ifNull: ["$version", SCHEMA_VERSION] }, days: { $ifNull: ["$days", {}] } } },
            { $set: { [`${path}.meals`]: { $concatArrays: [{ $ifNull: [`$${path}.meals`, []] }, [{ $literal: meal }]] } } },
            totalsStage(path),
        ],
        { upsert: true },
    );
    return { meal: String(meal.meal_id), day: await getDay(userId, date) };
}

async function changeServings(userId, date, mealId, servings) {
    const path = `days.${date}`;
    const id = new ObjectId(mealId);
    const result = await updateLog({ user_id: new ObjectId(userId), [`${path}.meals.meal_id`]: id }, [
        {
            $set: {
                [`${path}.meals`]: {
                    $map: {
                        input: `$${path}.meals`,
                        as: "meal",
                        in: { $cond: [{ $eq: ["$$meal.meal_id", id] }, { $mergeObjects: ["$$meal", { servings: { $literal: servings } }] }, "$$meal"] },
                    },
                },
            },
        },
        totalsStage(path),
    ]);
    if (!result.matchedCount) throw notFound(`Meal "${mealId}" not found on ${date}`);
    return getDay(userId, date);
}

async function removeMeal(userId, date, mealId) {
    const path = `days.${date}`;
    const id = new ObjectId(mealId);
    const user = new ObjectId(userId);
    const result = await updateLog({ user_id: user, [`${path}.meals.meal_id`]: id }, [
        { $set: { [`${path}.meals`]: { $filter: { input: `$${path}.meals`, as: "meal", cond: { $ne: ["$$meal.meal_id", id] } } } } },
        totalsStage(path),
    ]);
    if (!result.matchedCount) throw notFound(`Meal "${mealId}" not found on ${date}`);
    // Drop the day entirely once its last meal is gone.
    await FoodLog.collection.updateOne({ user_id: user, [`${path}.meals`]: { $size: 0 } }, { $unset: { [path]: "" } });
    return getDay(userId, date);
}

// Names for the meals' foods, stations and locations, looked up now.
async function lookups(meals) {
    const menuIds = [...new Set(meals.map((m) => String(m.menu_item_id)))];
    const foodIds = [...new Set(meals.map((m) => String(m.food_id)))];
    if (!meals.length) return { items: new Map(), foods: new Map(), places: new Map(), stations: new Map() };
    const [items, foods, places] = await Promise.all([
        MenuItem.find({ _id: { $in: menuIds } }, { loc_id: 1, station_id: 1 }).lean(),
        Food.find({ _id: { $in: foodIds } }, { name: 1 }).lean(),
        Location.find({}, { name: 1, stations: 1 }).lean(),
    ]);
    return {
        items: new Map(items.map((i) => [String(i._id), i])),
        foods: new Map(foods.map((f) => [String(f._id), f.name])),
        places: new Map(places.map((l) => [String(l._id), l.name])),
        stations: new Map(places.flatMap((l) => l.stations.map((s) => [String(s.station_id), s.station_name]))),
    };
}

const times = (value, servings, per) => (value === null || value === undefined ? null : (value * servings) / per);

// One day in API shape: calories, grams, cents; unknown values are null and counted.
function toDayDto(date, day, names) {
    const meals = (day?.meals ?? []).map((meal) => {
        const s = meal.snapshot ?? {};
        const item = names.items.get(String(meal.menu_item_id));
        return {
            id: meal.meal_id ? String(meal.meal_id) : null,
            menuItemId: meal.menu_item_id,
            foodId: meal.food_id,
            name: names.foods.get(String(meal.food_id)) ?? "Unknown item",
            locationName: item ? names.places.get(String(item.loc_id)) ?? null : null,
            stationName: item ? names.stations.get(String(item.station_id)) ?? null : null,
            servings: meal.servings,
            loggedAt: meal.log_ts,
            priceCents: s.price === null || s.price === undefined ? null : Math.round(s.price * meal.servings),
            calories: times(s.calorie, meal.servings, 10),
            proteinG: times(s.protein, meal.servings, 1000),
            carbsG: times(s.carb, meal.servings, 1000),
            fatG: times(s.fat, meal.servings, 1000),
        };
    });
    const totals = day?.totals ?? {};
    return {
        date,
        totals: {
            calories: (totals.calorie ?? 0) / 10,
            proteinG: (totals.protein ?? 0) / 1000,
            carbsG: (totals.carb ?? 0) / 1000,
            fatG: (totals.fat ?? 0) / 1000,
            spentCents: meals.reduce((sum, m) => sum + (m.priceCents ?? 0), 0),
        },
        // How many meals had no value, so the totals above leave them out.
        unknown: {
            calories: meals.filter((m) => m.calories === null).length,
            macros: meals.filter((m) => m.proteinG === null || m.carbsG === null || m.fatG === null).length,
            price: meals.filter((m) => m.priceCents === null).length,
        },
        meals,
    };
}

// Every date from `from` to `to`, including days with nothing logged.
async function getDays(userId, from, to) {
    const log = await FoodLog.findOne({ user_id: userId }).lean();
    const dates = datesBetween(from, to);
    const days = dates.map((date) => log?.days?.[date]);
    const names = await lookups(days.flatMap((day) => day?.meals ?? []));
    return dates.map((date, i) => toDayDto(date, days[i], names));
}

async function getDay(userId, date) {
    const [day] = await getDays(userId, date, date);
    return day;
}

const percent = (value, goal) => (goal ? Math.round((value / goal) * 1000) / 10 : null);

// Seven days from `start`, with each day's progress toward the user's goals
// (for the week strip).
async function getWeek(userId, start) {
    const user = await findUser(userId);
    const end = addDays(start, 6);
    const days = await getDays(userId, start, end);

    const calorieGoal = user.nutrition_goals?.calorie?.max ?? user.nutrition_goals?.calorie?.min ?? null;
    const caloriesGoal = calorieGoal === null ? null : calorieGoal / 10;
    const dailyBudgetCents = user.finances?.goals?.daily ?? null;
    const weeklyBudgetCents = user.finances?.goals?.weekly ?? (dailyBudgetCents === null ? null : dailyBudgetCents * 7);

    const summary = days.map((day) => ({
        date: day.date,
        mealCount: day.meals.length,
        calories: day.totals.calories,
        spentCents: day.totals.spentCents,
        caloriesPercent: percent(day.totals.calories, caloriesGoal),
        budgetPercent: percent(day.totals.spentCents, dailyBudgetCents),
    }));
    const spentCents = summary.reduce((sum, day) => sum + day.spentCents, 0);

    return {
        start,
        end,
        goals: { calories: caloriesGoal, dailyBudgetCents, weeklyBudgetCents },
        days: summary,
        totals: {
            calories: summary.reduce((sum, day) => sum + day.calories, 0),
            spentCents,
            budgetPercent: percent(spentCents, weeklyBudgetCents),
        },
    };
}

module.exports = { addMeal, changeServings, removeMeal, getDays, getDay, getWeek };
