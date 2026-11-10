// Turns one data/halls/<hall>.json file into HT2_DB documents:
//   1 Locations doc (with stations), and per menu entry 1 Foods doc + 1 Menu_Items doc.
//
// Safe to re-run. A location is matched by name, a station by name within it,
// and a menu item by station + food name. Matched documents are updated in
// place, so their ids stay the same. Fields the screenshots don't have
// (macros, ingredients, meal period, ...) are only set on first insert, so
// values a teammate fills in later are not wiped by the next import.
const mongoose = require("mongoose");
const Location = require("../models/Location");
const Food = require("../models/Food");
const MenuItem = require("../models/MenuItem");
const { ALLERGENS, TAGS, DB_ALLERGEN, DAYS } = require("../constants/tags");

const { ObjectId } = mongoose.Types;

const LOCATION_TYPE = { dining_hall: "dining hall", cafe: "cafe", market: "market", other: "other" };

// Pines menu categories that are drinks (Foods.beverage).
const BEVERAGE_CATEGORIES = new Set([
    "Boba Milk Teas", "Coffeehouse", "Fruit Shakers", "Morning Fog Signature Drinks",
    "Red Bull Infusions", "Seasonal Drinks", "Tea & Lemonade"
]);

function stationHours(hours) {
    if (!hours) return null;
    // The screenshots don't say which day the hours are for. They were captured
    // on one day (see the file's "source"), so assume the same hours every day
    // until we have per-day data.
    return DAYS.flatMap((day) => hours.map((h) => ({ day, open: h.open, close: h.close ?? null })));
}

// Fields that HDH data is the authority on, refreshed on every import.
function hdhFoodFields(item) {
    const tags = new Set(item.tags ?? []);
    return {
        name: item.name.trim(),
        beverage: BEVERAGE_CATEGORIES.has(item.category),
        vegan: tags.has("vegan"),
        // HDH shows only the vegan icon on vegan items; vegan implies vegetarian.
        vegetarian: tags.has("vegetarian") || tags.has("vegan"),
        wellness: tags.has("wellness"),
        sustainability: tags.has("sustainability"),
        allergens: Object.fromEntries(ALLERGENS.map((a) => [DB_ALLERGEN[a], tags.has(a)]))
    };
}

function newFood(item) {
    return {
        ...hdhFoodFields(item),
        personal: false,
        ingredients: [],
        nutrition: {
            calorie: item.calories ?? null,
            fat_cal: null, sat_fat: null, trans_fat: null, cholesterol: null,
            sodium: null, serving_size: null, fiber: null, sugar: null,
            macros: { protein: null, carb: null, fat: null }
        }
    };
}

async function existingMenuItems(locId) {
    const rows = await MenuItem.aggregate([
        { $match: { loc_id: locId } },
        { $lookup: { from: Food.collection.name, localField: "food_id", foreignField: "_id", as: "food" } },
        { $unwind: "$food" },
        { $project: { station_id: 1, food_id: 1, name: "$food.name" } }
    ]);
    return new Map(rows.map((r) => [`${r.station_id}|${r.name}`, r]));
}

async function importHall(raw) {
    const hall = raw.dining_hall;
    const problems = [];
    const type = LOCATION_TYPE[hall.type];
    if (!type) problems.push(`unknown location type "${hall.type}"`);

    const existing = await Location.findOne({ name: hall.name, _example: { $ne: true } }).lean();
    const locId = existing?._id ?? new ObjectId();
    const oldStations = new Map((existing?.stations ?? []).map((s) => [s.station_name, s]));

    const stationIdByJsonId = new Map();
    const stations = raw.stations.map((s) => {
        const old = oldStations.get(s.name);
        const station = {
            ...old, // keep any extra fields a teammate added
            station_id: old?.station_id ?? new ObjectId(),
            station_name: s.name,
            hours: stationHours(s.hours),
            notes: s.notes ?? null
        };
        stationIdByJsonId.set(s.id, station.station_id);
        return station;
    });

    const location = {
        name: hall.name,
        type,
        location: {
            area: hall.area ?? existing?.location?.area ?? "unknown",
            geodata: existing?.location?.geodata ?? {}
        },
        stations
    };

    // Build every write first and validate it, so a typo in one item doesn't
    // leave the database half-imported.
    await Location.validate(location).catch((e) => problems.push(`location: ${e.message}`));

    const known = existing ? await existingMenuItems(locId) : new Map();
    const seen = new Set();
    const foodOps = [];
    const menuOps = [];
    let inserted = 0;

    for (const s of raw.stations) {
        const stationId = stationIdByJsonId.get(s.id);
        for (const item of s.items) {
            const label = `${s.name} / ${item.name}`;
            const key = `${stationId}|${item.name.trim()}`;
            if (seen.has(key)) problems.push(`${label}: listed twice in this station`);
            seen.add(key);

            const unknownTags = (item.tags ?? []).filter((t) => !TAGS.includes(t));
            if (unknownTags.length) problems.push(`${label}: unknown tag(s) ${unknownTags.join(", ")}`);
            if (!Number.isInteger(item.price_cents)) problems.push(`${label}: price_cents must be an integer`);

            const food = newFood(item);
            const menuFields = { loc_id: locId, station_id: stationId, price: item.price_cents / 100 };
            await Food.validate(food).catch((e) => problems.push(`${label}: ${e.message}`));

            const match = known.get(key);
            if (match) {
                const set = hdhFoodFields(item);
                if (item.calories != null) set["nutrition.calorie"] = item.calories;
                foodOps.push({ updateOne: { filter: { _id: match.food_id }, update: { $set: set } } });
                menuOps.push({ updateOne: { filter: { _id: match._id }, update: { $set: menuFields } } });
            } else {
                const foodId = new ObjectId();
                foodOps.push({ insertOne: { document: { _id: foodId, ...food } } });
                menuOps.push({ insertOne: { document: { food_id: foodId, meal_period: "unknown", ...menuFields } } });
                inserted++;
            }
        }
    }

    if (problems.length) {
        throw new Error(`${hall.name} has ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    }

    await Location.updateOne({ _id: locId }, { $set: location }, { upsert: true });
    // Foods first, so a menu item never points at a missing food.
    if (foodOps.length) await Food.bulkWrite(foodOps, { ordered: true });
    if (menuOps.length) await MenuItem.bulkWrite(menuOps, { ordered: true });

    const items = seen.size;
    const total = await MenuItem.countDocuments({ loc_id: locId });
    return { locationId: locId, name: hall.name, stations: stations.length, items, inserted, updated: items - inserted, total };
}

module.exports = { importHall, BEVERAGE_CATEGORIES };
