// Turns one data/halls/**/<hall>.json file into HT2_DB documents:
//   1 Locations doc (with stations), and per menu entry 1 Foods doc + 1 Menu_Items doc.
//
// The pure functions (toFood, toLocationHours, isBeverage, ...) convert the
// file's values to HT2_DB's units and "unknown" conventions. importHall writes.
//
// Safe to re-run. A location is matched by name, a station by name within it,
// and a menu item by station + food name. Matched documents are updated in
// place, so their ids stay the same. Values the file doesn't know (macros,
// ingredients, meal period, hours, allergens of items without icons) are only
// set on first insert, so values a teammate fills in later are not wiped.
const mongoose = require("mongoose");
const Location = require("../models/Location");
const Food = require("../models/Food");
const MenuItem = require("../models/MenuItem");
const { UNKNOWN_HOURS } = require("../services/hours");
const { ALLERGENS, TAGS, DB_ALLERGEN, DAYS, LOCATION_TYPES, SCHEMA_VERSION } = require("../constants/tags");

const { ObjectId } = mongoose.Types;

// The files say "dining_hall"; HT2_DB says "dining hall".
function toLocationType(type) {
    const dbType = String(type ?? "").replace(/_/g, " ");
    return LOCATION_TYPES.includes(dbType) ? dbType : null;
}

// Drinks are recognised by menu category, with exceptions for categories that
// mix drinks and food ("Beverages & Whole Fruit", "Acai & Smoothies").
const DRINK_CATEGORY = /beverage|drink|boba|tea|lemonade|coffee|soda|kombucha|nitro|smoothie|shake|infusion|concessions/i;
const NOT_A_DRINK = /^(apple|banana|orange|pear|grapes|whole fruit)s?$|bowl\b/i;

function isBeverage(item) {
    return DRINK_CATEGORY.test(item.category) && !NOT_A_DRINK.test(item.name.trim());
}

// An item with no icons at all is treated as "unknown", not "contains
// nothing": many such items clearly have allergens (a latte with no dairy icon).
function iconsKnown(item) {
    return (item.tags ?? []).length > 0;
}

// Fields that come from the HDH icons. Only meaningful when iconsKnown(item).
function iconFields(item) {
    const tags = new Set(item.tags ?? []);
    return {
        wellness: tags.has("wellness"),
        // HDH shows only the vegan icon on vegan items; vegan implies vegetarian.
        vegetarian: tags.has("vegetarian") || tags.has("vegan"),
        vegan: tags.has("vegan"),
        sustainability: tags.has("sustainability"),
        allergens: Object.fromEntries(ALLERGENS.map((a) => [DB_ALLERGEN[a], tags.has(a)]))
    };
}

const unknownIconFields = () => ({ wellness: null, vegetarian: null, vegan: null, sustainability: null, allergens: {} });

// Calories -> tenths of a calorie. Unknown stays undefined (the field is left out).
function toTenths(value) {
    return value == null ? undefined : Math.round(value * 10);
}

// A complete new Foods document for one file item.
function toFood(item) {
    const nutrition = { macros: {} };
    const calorie = toTenths(item.calories);
    if (calorie !== undefined) nutrition.calorie = calorie;

    return {
        version: SCHEMA_VERSION,
        name: item.name.trim(),
        personal: false,
        beverage: isBeverage(item),
        ...(iconsKnown(item) ? iconFields(item) : unknownIconFields()),
        ingredients: [],
        nutrition
    };
}

// HT2_DB has one { days, open, close } per location. Use the hall's own
// "hours" if the file has it; otherwise span its stations' hours (earliest
// open to latest close); otherwise return null (unknown).
// The screenshots show one day's hours, so station hours are assumed to apply
// every day until we have per-day data.
function toLocationHours(raw) {
    const own = raw.dining_hall.hours;
    if (own) return { days: own.days ?? DAYS, open: own.open, close: own.close };

    const windows = raw.stations.flatMap((s) => s.hours ?? []);
    const closes = windows.map((w) => w.close).filter(Boolean).sort();
    if (!windows.length || !closes.length) return null;
    return { days: DAYS, open: windows.map((w) => w.open).sort()[0], close: closes.at(-1) };
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
    const type = toLocationType(hall.type);
    if (!type) problems.push(`unknown location type "${hall.type}"`);

    const existing = await Location.findOne({ name: hall.name }).lean();
    const locId = existing?._id ?? new ObjectId();
    const oldStations = new Map((existing?.stations ?? []).map((s) => [s.station_name, s]));

    const stationIdByJsonId = new Map();
    const stations = raw.stations.map((s) => {
        const old = oldStations.get(s.name);
        const station = {
            ...old, // keep any extra fields a teammate added
            station_id: old?.station_id ?? new ObjectId(),
            station_name: s.name
        };
        stationIdByJsonId.set(s.id, station.station_id);
        return station;
    });

    const location = {
        version: existing?.version ?? SCHEMA_VERSION,
        name: hall.name,
        type,
        location: {
            area: hall.area ?? existing?.location?.area ?? "unknown",
            geodata: existing?.location?.geodata ?? {}
        },
        // Hours from the file win; otherwise keep what's stored; otherwise unknown.
        hours: toLocationHours(raw) ?? existing?.hours ?? { ...UNKNOWN_HOURS },
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
            if (!Number.isInteger(item.price_cents)) problems.push(`${label}: price_cents must be a whole number`);

            const food = toFood(item);
            const menuFields = { loc_id: locId, station_id: stationId, price: item.price_cents };
            await Food.validate(food).catch((e) => problems.push(`${label}: ${e.message}`));

            const match = known.get(key);
            if (match) {
                const set = { name: food.name, beverage: food.beverage };
                if (iconsKnown(item)) Object.assign(set, iconFields(item));
                if (food.nutrition.calorie !== undefined) set["nutrition.calorie"] = food.nutrition.calorie;
                foodOps.push({ updateOne: { filter: { _id: match.food_id }, update: { $set: set } } });
                menuOps.push({ updateOne: { filter: { _id: match._id }, update: { $set: menuFields } } });
            } else {
                const foodId = new ObjectId();
                const menuItem = { version: SCHEMA_VERSION, food_id: foodId, meal_period: "unknown", ...menuFields };
                await MenuItem.validate(menuItem).catch((e) => problems.push(`${label}: ${e.message}`));
                foodOps.push({ insertOne: { document: { _id: foodId, ...food } } });
                menuOps.push({ insertOne: { document: menuItem } });
                inserted++;
            }
        }
    }

    if (problems.length) {
        throw new Error(`${hall.name} has ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    }

    // Written with the MongoDB driver directly, so exactly these documents are
    // stored (Mongoose would otherwise add defaults or drop empty objects).
    await Location.collection.updateOne({ _id: locId }, { $set: location }, { upsert: true });
    // Foods first, so a menu item never points at a missing food.
    if (foodOps.length) await Food.collection.bulkWrite(foodOps, { ordered: true });
    if (menuOps.length) await MenuItem.collection.bulkWrite(menuOps, { ordered: true });

    const items = seen.size;
    const total = await MenuItem.countDocuments({ loc_id: locId });
    return {
        locationId: locId, name: hall.name, stations: stations.length, items, inserted,
        updated: items - inserted, total, hoursKnown: location.hours.days.length > 0
    };
}

module.exports = { importHall, toFood, toLocationHours, toLocationType, isBeverage, iconsKnown };
