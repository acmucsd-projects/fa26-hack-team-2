// Conversion from the hall files to HT2_DB documents. No database needed.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { toFood, toLocationHours, toLocationType, isBeverage } = require("../src/importers/hallImporter");
const { toNutritionDto } = require("../src/services/dto");
const Food = require("../src/models/Food");

const HALLS_DIR = path.join(__dirname, "..", "data", "halls");
const hallFiles = fs.readdirSync(HALLS_DIR, { recursive: true })
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, data: JSON.parse(fs.readFileSync(path.join(HALLS_DIR, f), "utf8")) }));

test("an item with icons becomes a food with known allergens and diet flags", () => {
    const food = toFood({ category: "Burgers", name: " Cali Burger ", price_cents: 1025, calories: 965, tags: ["dairy", "eggs", "soy", "wheat"] });
    assert.equal(food.version, 1);
    assert.equal(food.name, "Cali Burger");
    assert.equal(food.nutrition.calorie, 9650); // tenths of a calorie
    assert.deepEqual(food.nutrition.macros, {});
    assert.equal(Object.keys(food.allergens).length, 10);
    assert.equal(food.allergens.dairy, true);
    assert.equal(food.allergens.shell_fish, false);
    assert.equal(food.vegan, false);
    assert.equal(food.beverage, false);
});

test("vegan implies vegetarian", () => {
    const food = toFood({ category: "Bowls", name: "Tofu Bowl", price_cents: 700, calories: 450, tags: ["soy", "vegan"] });
    assert.equal(food.vegan, true);
    assert.equal(food.vegetarian, true);
});

test("an item with no icons is unknown, not allergen-free", () => {
    const food = toFood({ category: "Beverages", name: "Fountain Drink", price_cents: 200, calories: null, tags: [] });
    assert.deepEqual(food.allergens, {});
    assert.equal(food.vegan, null);
    assert.equal(food.vegetarian, null);
    assert.equal(food.wellness, null);
    assert.equal(food.sustainability, null);
    assert.equal("calorie" in food.nutrition, false); // unknown numbers are left out, never null or 0
});

test("drinks are recognised by category, except food in mixed categories", () => {
    const drink = (category, name) => isBeverage({ category, name });
    assert.equal(drink("Coffeehouse", "Cold Brew"), true);
    assert.equal(drink("Liontree Concessions", "Orange Crush 12oz"), true);
    assert.equal(drink("Beverages & Whole Fruit", "Orange"), false);
    assert.equal(drink("Beverages & Whole Fruit", "Fountain Drink"), true);
    assert.equal(drink("Acai & Smoothies", "Acai Bowl"), false);
    assert.equal(drink("Acai & Smoothies", "Matcha Mango Smoothie"), true);
    assert.equal(drink("Burgers", "Cali Burger"), false);
    assert.equal(drink("Desserts", "Milk Tea Pudding"), false);
});

test("location hours span the stations' hours, or are unknown", () => {
    const hall = (stations, extra = {}) => ({ dining_hall: { name: "x", ...extra }, stations });
    assert.deepEqual(
        toLocationHours(hall([
            { hours: [{ open: "07:00", close: "10:45" }, { open: "11:15", close: "21:00" }] },
            { hours: [{ open: "17:00", close: null }] },
            { hours: null }
        ])),
        { days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], open: "07:00", close: "21:00" }
    );
    assert.equal(toLocationHours(hall([{ hours: null }])), null);
    assert.equal(toLocationHours(hall([{ hours: [{ open: "17:00", close: null }] }])), null);
    // Hours written on the hall itself win.
    assert.deepEqual(
        toLocationHours(hall([{ hours: null }], { hours: { days: ["mon"], open: "08:00", close: "14:00" } })),
        { days: ["mon"], open: "08:00", close: "14:00" }
    );
});

test("location types map to the HT2_DB spelling", () => {
    assert.equal(toLocationType("dining_hall"), "dining hall");
    assert.equal(toLocationType("market"), "market");
    assert.equal(toLocationType("food truck"), null);
});

test("the API converts stored units back to calories, grams and ounces", () => {
    const dto = toNutritionDto({ calorie: 9650, fat_cal: 905, sodium: 780, serving_size: 75, macros: { protein: 32500, carb: 38000 } });
    assert.equal(dto.calories, 965);
    assert.equal(dto.fatCalories, 90.5);
    assert.equal(dto.sodiumMg, 780);
    assert.equal(dto.servingSizeOz, 7.5);
    assert.equal(dto.proteinG, 32.5);
    assert.equal(dto.carbsG, 38);
    assert.equal(dto.fatG, null); // unknown stays null, never 0
});

test("every item in every hall file converts to a valid food with a whole-cent price", async () => {
    let count = 0;
    for (const { name, data } of hallFiles) {
        assert.ok(toLocationType(data.dining_hall.type), `${name}: unknown location type`);
        for (const station of data.stations) {
            for (const item of station.items) {
                const label = `${name} / ${station.name} / ${item.name}`;
                assert.ok(Number.isInteger(item.price_cents) && item.price_cents >= 0, `${label}: bad price_cents`);
                await Food.validate(toFood(item)).catch((e) => assert.fail(`${label}: ${e.message}`));
                count++;
            }
        }
    }
    assert.ok(count > 0);
});
