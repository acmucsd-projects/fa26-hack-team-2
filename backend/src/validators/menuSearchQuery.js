const { badRequest } = require("../utils/httpError");
const { parseDietFilters, single, objectId } = require("./menuQuery");

const SORT_KEYS = ["relevance", "price", "name", "calories", "protein"];
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_KEYWORDS = 6;
const MAX_QUERY_LENGTH = 100;

// A whole number >= min, or `fallback` when the parameter is absent.
function wholeNumber(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = null } = {}) {
    const text = single(value, name);
    if (!text) return fallback;
    if (!/^\d+$/.test(text)) throw badRequest(`${name} must be a whole number, got "${text}"`);
    const number = Number(text);
    if (number < min || number > max) throw badRequest(`${name} must be between ${min} and ${max}`);
    return number;
}

function trueFalse(value, name) {
    const text = single(value, name);
    if (!text) return null;
    if (text !== "true" && text !== "false") throw badRequest(`${name} must be true or false, got "${text}"`);
    return text === "true";
}

// GET /api/menus/search?q=chicken bowl&location=<id>&station=<id>&exclude=dairy&diet=vegan
//     &beverage=false&maxPriceCents=1000&maxCalories=700&sort=price&limit=30&offset=0
// Every parameter is optional. With none, it lists everything, one page at a time.
function parseMenuSearchQuery(query) {
    if (Array.isArray(query.q)) throw badRequest("q can only be given once");
    const text = typeof query.q === "string" ? query.q.trim() : "";
    if (text.length > MAX_QUERY_LENGTH) throw badRequest(`q can be at most ${MAX_QUERY_LENGTH} characters`);
    // Each keyword must match. Order and upper/lower case don't matter.
    const keywords = [...new Set(text.toLowerCase().split(/\s+/).filter(Boolean))];
    if (keywords.length > MAX_KEYWORDS) throw badRequest(`q can have at most ${MAX_KEYWORDS} keywords`);

    const sort = single(query.sort, "sort") || "relevance";
    if (!SORT_KEYS.includes(sort)) {
        throw badRequest(`Unknown sort "${sort}". Valid: ${SORT_KEYS.join(", ")}`);
    }

    return {
        keywords,
        location: objectId(query.location, "location") || null,
        station: objectId(query.station, "station") || null,
        ...parseDietFilters(query),
        beverage: trueFalse(query.beverage, "beverage"),
        maxPriceCents: wholeNumber(query.maxPriceCents, "maxPriceCents"),
        maxCalories: wholeNumber(query.maxCalories, "maxCalories"),
        sort,
        limit: wholeNumber(query.limit, "limit", { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT }),
        offset: wholeNumber(query.offset, "offset", { fallback: 0 })
    };
}

module.exports = { parseMenuSearchQuery, SORT_KEYS, DEFAULT_LIMIT, MAX_LIMIT };
