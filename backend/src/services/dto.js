// HT2_DB documents are snake_case and store whole numbers: milligrams, tenths
// of a calorie, tenths of an ounce, cents. The API sends camelCase with
// calories, grams, ounces and integer cents. All conversion happens here.
// Unknown values are null in the API.
const { ALLERGENS, DB_ALLERGEN } = require("../constants/tags");
const { hoursKnown } = require("./hours");

const orNull = (value) => (value === undefined ? null : value);
const scaled = (value, divisor) => (typeof value === "number" ? value / divisor : null);

function toLocationDto(doc, isOpenNow) {
    const geo = doc.location?.geodata;
    return {
        id: doc._id,
        name: doc.name,
        type: doc.type,
        area: orNull(doc.location?.area),
        geo: geo?.coordinates ? geo : null,
        // null when the hours aren't known yet (stored as an empty list of days)
        hours: hoursKnown(doc.hours) ? { days: doc.hours.days, open: doc.hours.open, close: doc.hours.close } : null,
        isOpenNow
    };
}

function toStationDto(station) {
    return { id: station.station_id, name: station.station_name };
}

function toNutritionDto(n = {}) {
    const m = n.macros ?? {};
    return {
        calories: scaled(n.calorie, 10), // stored in tenths of a calorie
        proteinG: scaled(m.protein, 1000), // stored in milligrams
        carbsG: scaled(m.carb, 1000),
        fatG: scaled(m.fat, 1000),
        fatCalories: scaled(n.fat_cal, 10),
        satFatG: scaled(n.sat_fat, 1000),
        transFatG: scaled(n.trans_fat, 1000),
        cholesterolMg: orNull(n.cholesterol),
        sodiumMg: orNull(n.sodium),
        fiberG: scaled(n.fiber, 1000),
        sugarG: scaled(n.sugar, 1000),
        servingSizeOz: scaled(n.serving_size, 10) // stored in tenths of an ounce
    };
}

// `row` is a Menu_Items doc with its Foods doc joined in as `food`.
function toMenuItemDto(row, stationNames) {
    const food = row.food;
    const allergens = food.allergens ?? {};
    const allergensKnown = Object.keys(allergens).length > 0;
    return {
        id: row._id,
        foodId: food._id,
        locationId: row.loc_id,
        stationId: orNull(row.station_id),
        stationName: stationNames.get(String(row.station_id)) ?? null,
        name: food.name,
        mealPeriod: row.meal_period,
        priceCents: orNull(row.price),
        beverage: food.beverage,
        // null = unknown
        vegan: orNull(food.vegan),
        vegetarian: orNull(food.vegetarian),
        wellness: orNull(food.wellness),
        sustainability: orNull(food.sustainability),
        // When allergensKnown is false the list is empty because we don't
        // know, not because the food is allergen-free.
        allergensKnown,
        allergens: ALLERGENS.filter((a) => allergens[DB_ALLERGEN[a]] === true),
        nutrition: toNutritionDto(food.nutrition)
    };
}

module.exports = { toLocationDto, toStationDto, toNutritionDto, toMenuItemDto };
