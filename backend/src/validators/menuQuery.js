const { ALLERGENS, DIETS } = require("../constants/tags");
const { badRequest } = require("../utils/httpError");

const SORT_KEYS = ["price", "protein", "name"];

// Accepts "dairy,gluten" or repeated ?exclude=dairy&exclude=gluten.
function toList(value) {
    if (value === undefined || value === null || value === "") return [];
    return (Array.isArray(value) ? value : [value])
        .flatMap((v) => String(v).split(","))
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
}

function single(value, name) {
    if (Array.isArray(value)) throw badRequest(`${name} can only be given once`);
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// GET /api/menus?location=<location id>&exclude=dairy,gluten&diet=vegan&sort=protein
function parseMenuQuery(query) {
    const location = single(query.location, "location");
    if (!location) throw badRequest("location is required: a location id from GET /api/locations");
    if (!/^[0-9a-f]{24}$/.test(location)) {
        throw badRequest(`location must be a location id from GET /api/locations, got "${location}"`);
    }

    const exclude = [...new Set(toList(query.exclude))];
    const unknown = exclude.filter((tag) => !ALLERGENS.includes(tag));
    if (unknown.length) {
        throw badRequest(`Unknown allergen(s): ${unknown.join(", ")}. Valid: ${ALLERGENS.join(", ")}`);
    }

    const diet = single(query.diet, "diet") || null;
    if (diet && !DIETS.includes(diet)) {
        throw badRequest(`Unknown diet "${diet}". Valid: ${DIETS.join(", ")}`);
    }

    const sort = single(query.sort, "sort") || "price";
    if (!SORT_KEYS.includes(sort)) {
        throw badRequest(`Unknown sort "${sort}". Valid: ${SORT_KEYS.join(", ")}`);
    }

    return { location, exclude, diet, sort };
}

module.exports = { parseMenuQuery };
