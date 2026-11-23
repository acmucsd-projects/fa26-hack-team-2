// Keyword search and browsing across every location's menu.
const mongoose = require("mongoose");
const Food = require("../models/Food");
const Location = require("../models/Location");
const MenuItem = require("../models/MenuItem");
const { DB_ALLERGEN } = require("../constants/tags");
const { notFound } = require("../utils/httpError");
const { toMenuItemDto } = require("./dto");

const { ObjectId } = mongoose.Types;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Unknown calories / protein always sort last.
const SORTS = {
    relevance: { rank: 1, "food.name": 1, price: 1, _id: 1 },
    price: { price: 1, "food.name": 1, _id: 1 },
    name: { "food.name": 1, price: 1, _id: 1 },
    calories: { calorieSort: 1, "food.name": 1, _id: 1 },
    protein: { "food.nutrition.macros.protein": -1, "food.name": 1, _id: 1 }
};

// `query` comes from validators/menuSearchQuery.
// Returns { items, total, limit, offset }; `total` counts every match, not just this page.
async function search({ keywords, location, station, exclude, diet, beverage, maxPriceCents, maxCalories, sort, limit, offset }) {
    // 15 or so small documents: cheaper to load once than to join per menu item.
    const locations = await Location.find({}, { name: 1, stations: 1 }).lean();
    const locationNames = new Map(locations.map((l) => [String(l._id), l.name]));
    const stationNames = new Map(locations.flatMap((l) => l.stations.map((s) => [String(s.station_id), s.station_name])));
    if (location && !locationNames.has(location)) throw notFound(`Location "${location}" not found`);

    const itemFilter = {};
    if (location) itemFilter.loc_id = new ObjectId(location);
    if (station) itemFilter.station_id = new ObjectId(station);
    if (maxPriceCents !== null) itemFilter.price = { $lte: maxPriceCents };

    const foodFilter = {};
    // Same safety rule as /api/menus: unknown allergens or diet never pass a filter.
    for (const allergen of exclude) foodFilter[`food.allergens.${DB_ALLERGEN[allergen]}`] = false;
    if (diet === "vegan") foodFilter["food.vegan"] = true;
    if (diet === "vegetarian") foodFilter.$or = [{ "food.vegetarian": true }, { "food.vegan": true }];
    if (beverage !== null) foodFilter["food.beverage"] = beverage;
    // Stored in tenths of a calorie. Foods with unknown calories don't match.
    if (maxCalories !== null) foodFilter["food.nutrition.calorie"] = { $lte: maxCalories * 10 };

    // Every keyword must appear in the food's name, its station's name or its
    // location's name ("pines burger" finds burgers at Pines).
    const keywordFilters = keywords.map((keyword) => {
        const pattern = new RegExp(escapeRegex(keyword), "i");
        return {
            $or: [
                { "food.name": pattern },
                { loc_id: { $in: locations.filter((l) => pattern.test(l.name)).map((l) => l._id) } },
                { station_id: { $in: locations.flatMap((l) => l.stations).filter((s) => pattern.test(s.station_name)).map((s) => s.station_id) } }
            ]
        };
    });

    // Relevance: 0 = every keyword starts a word in the food's name,
    // 1 = every keyword is somewhere in the name, 2 = matched by station or location.
    const inName = (prefix) => ({
        $and: keywords.map((k) => ({ $regexMatch: { input: "$food.name", regex: prefix + escapeRegex(k), options: "i" } }))
    });
    const rank = keywords.length ? { $cond: [inName("\\b"), 0, { $cond: [inName(""), 1, 2] }] } : { $literal: 0 };

    const [result] = await MenuItem.aggregate([
        { $match: itemFilter },
        { $lookup: { from: Food.collection.name, localField: "food_id", foreignField: "_id", as: "food" } },
        { $unwind: "$food" },
        { $match: { ...foodFilter, ...(keywordFilters.length && { $and: keywordFilters }) } },
        { $addFields: { rank, calorieSort: { $ifNull: ["$food.nutrition.calorie", Number.MAX_SAFE_INTEGER] } } },
        {
            $facet: {
                items: [{ $sort: SORTS[sort] }, { $skip: offset }, { $limit: limit }],
                total: [{ $count: "count" }]
            }
        }
    ]);

    return {
        items: result.items.map((row) => ({
            ...toMenuItemDto(row, stationNames),
            locationName: locationNames.get(String(row.loc_id)) ?? null
        })),
        total: result.total[0]?.count ?? 0,
        limit,
        offset
    };
}

module.exports = { search, SORTS };
