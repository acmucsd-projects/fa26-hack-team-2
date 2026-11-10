// HT2_DB documents are snake_case with prices in dollars. The API sends
// camelCase with prices in integer cents. All conversion happens here.
const { ALLERGENS, DB_ALLERGEN } = require("../constants/tags");

const orNull = (value) => (value === undefined ? null : value);

function toLocationDto(doc) {
    const geo = doc.location?.geodata;
    return {
        id: doc._id,
        name: doc.name,
        type: doc.type,
        area: orNull(doc.location?.area),
        geo: geo?.coordinates ? geo : null
    };
}

function toStationDto(station, isOpenNow) {
    return {
        id: station.station_id,
        name: station.station_name,
        hours: orNull(station.hours),
        notes: orNull(station.notes),
        isOpenNow
    };
}

function toNutritionDto(n = {}) {
    const m = n.macros ?? {};
    return {
        calories: orNull(n.calorie),
        proteinG: orNull(m.protein),
        carbsG: orNull(m.carb),
        fatG: orNull(m.fat),
        fatCalories: orNull(n.fat_cal),
        satFatG: orNull(n.sat_fat),
        transFatG: orNull(n.trans_fat),
        cholesterolMg: orNull(n.cholesterol),
        sodiumMg: orNull(n.sodium),
        fiberG: orNull(n.fiber),
        sugarG: orNull(n.sugar),
        servingSizeOz: orNull(n.serving_size)
    };
}

// `row` is a Menu_Items doc with its Foods doc joined in as `food`.
function toMenuItemDto(row, stationNames) {
    const food = row.food;
    return {
        id: row._id,
        foodId: food._id,
        locationId: row.loc_id,
        stationId: orNull(row.station_id),
        stationName: stationNames.get(String(row.station_id)) ?? null,
        name: food.name,
        mealPeriod: row.meal_period,
        priceCents: typeof row.price === "number" ? Math.round(row.price * 100) : null,
        beverage: food.beverage,
        vegan: food.vegan,
        vegetarian: food.vegetarian,
        wellness: food.wellness,
        sustainability: food.sustainability,
        allergens: ALLERGENS.filter((a) => food.allergens?.[DB_ALLERGEN[a]] === true),
        nutrition: toNutritionDto(food.nutrition)
    };
}

module.exports = { toLocationDto, toStationDto, toMenuItemDto };
