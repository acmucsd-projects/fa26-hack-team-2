const Food = require("../models/Food");
const MenuItem = require("../models/MenuItem");
const { DB_ALLERGEN } = require("../constants/tags");
const { findLocation } = require("./locationService");
const { toMenuItemDto } = require("./dto");

const SORTS = {
    price: { price: 1, "food.name": 1, _id: 1 },
    // Unknown protein sorts last when descending.
    protein: { "food.nutrition.macros.protein": -1, "food.name": 1, _id: 1 },
    name: { "food.name": 1, _id: 1 }
};

// Menu items at one location, joined with their Foods doc, filtered in MongoDB.
// `query` comes from validators/menuQuery.
async function search({ location, exclude = [], diet = null, sort = "price" }) {
    const loc = await findLocation(location, { stations: 1 });

    const foodFilter = {};
    // Keep only foods known NOT to contain the allergen. Foods whose allergens
    // are unknown (empty object) don't match, so they are left out: safer for
    // a student with an allergy.
    for (const allergen of exclude) foodFilter[`food.allergens.${DB_ALLERGEN[allergen]}`] = false;
    // Foods whose diet flags are unknown (null) are left out for the same reason.
    if (diet === "vegan") foodFilter["food.vegan"] = true;
    if (diet === "vegetarian") foodFilter.$or = [{ "food.vegetarian": true }, { "food.vegan": true }];

    const rows = await MenuItem.aggregate([
        { $match: { loc_id: loc._id } },
        { $lookup: { from: Food.collection.name, localField: "food_id", foreignField: "_id", as: "food" } },
        { $unwind: "$food" },
        { $match: foodFilter },
        { $sort: SORTS[sort] }
    ]);

    const stationNames = new Map(loc.stations.map((s) => [String(s.station_id), s.station_name]));
    return rows.map((row) => toMenuItemDto(row, stationNames));
}

module.exports = { search, SORTS };
