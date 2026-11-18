// Runs against a real MongoDB, in a separate "HT2_DB_test" database that is
// wiped before and after. The database gets the same $jsonSchema validators as
// HT2_DB (db/validators), so these tests also prove our writes pass them.
// Skipped when MONGODB_URI isn't set.
require("dotenv").config({ quiet: true });

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../src/config/db");
const { applyValidators } = require("../src/config/validators");
const { importHall } = require("../src/importers/hallImporter");
const Location = require("../src/models/Location");
const Food = require("../src/models/Food");
const MenuItem = require("../src/models/MenuItem");
const menuService = require("../src/services/menuService");
const menuSearchService = require("../src/services/menuSearchService");
const { parseMenuSearchQuery } = require("../src/validators/menuSearchQuery");
const locationService = require("../src/services/locationService");
const { HttpError } = require("../src/utils/httpError");

const TEST_DB = "HT2_DB_test";

// Small locations in the same shape as data/halls/**/*.json.
const HALL = {
    dining_hall: { id: "test-hall", name: "Test Hall", type: "dining_hall", area: "Test College" },
    stations: [
        {
            id: "test-grill", name: "Grill", notes: null,
            hours: [{ open: "07:00", close: "10:45" }, { open: "11:15", close: "21:00" }],
            items: [
                { category: "Mains", name: "Cheese Pizza", price_cents: 500, calories: 300, tags: ["dairy", "gluten", "wheat", "vegetarian"] },
                { category: "Mains", name: "Tofu Bowl", price_cents: 725, calories: 450, tags: ["soy", "vegan"] },
                { category: "Mains", name: "Shrimp Plate", price_cents: 1200, calories: 600, tags: ["shellfish"] },
                { category: "Sides", name: "Rice", price_cents: 250, calories: 49, tags: ["vegan"] }
            ]
        },
        {
            id: "test-cafe", name: "Cafe", notes: "hours unknown", hours: null,
            items: [
                { category: "Tea & Lemonade", name: "Lemonade", price_cents: 325, calories: null, tags: ["vegan"] },
                { category: "Sides", name: "Rice", price_cents: 300, calories: 294, tags: ["vegan"] }, // same name, different station
                { category: "Beverages", name: "Fountain Drink", price_cents: 200, calories: null, tags: [] } // no icons: unknown
            ]
        }
    ]
};

// No hours anywhere in the file, like most of the real data.
const MARKET = {
    dining_hall: { id: "test-market", name: "Test Market", type: "market" },
    stations: [{ id: "test-market-deli", name: "Deli", hours: null, items: [{ category: "Sandwiches", name: "BLT", price_cents: 899, calories: 520, tags: ["wheat", "gluten"] }] }]
};

const names = (items) => items.map((i) => i.name);

// Drops collections one-by-one to avoid needing dbAdmin privileges.
async function wipe(connection) {
    for (const c of await connection.db.collections()) await c.drop();
}

describe("HT2_DB import and menu queries", { skip: !process.env.MONGODB_URI && "MONGODB_URI not set" }, () => {
    let locId;
    const search = (query) => menuService.search({ location: String(locId), exclude: [], diet: null, sort: "price", ...query });

    before(async () => {
        const connection = await connectDB({ dbName: TEST_DB, autoIndex: false }); // indexes are built below, after validators
        assert.equal(connection.name, TEST_DB, "refusing to run against a non-test database");
        await wipe(connection);
        await applyValidators(connection.db);
        await Promise.all([Location.createIndexes(), Food.createIndexes(), MenuItem.createIndexes()]);

        locId = (await importHall(HALL)).locationId;
        await importHall(MARKET);
    });

    after(async () => {
        if (mongoose.connection.name === TEST_DB) await wipe(mongoose.connection);
        await disconnectDB();
    });

    test("import writes documents the HT2_DB validators accept, in the schema's units", async () => {
        assert.equal(await Food.countDocuments(), 8);
        assert.equal(await MenuItem.countDocuments({ loc_id: locId }), 7);

        const pizza = await Food.findOne({ name: "Cheese Pizza" }).lean();
        assert.equal(pizza.version, 1);
        assert.equal(pizza.nutrition.calorie, 3000); // tenths of a calorie
        assert.equal(pizza.allergens.dairy, true);
        assert.equal((await MenuItem.findOne({ food_id: pizza._id }).lean()).price, 500); // cents

        const lemonade = await Food.findOne({ name: "Lemonade" }).lean();
        assert.equal(lemonade.beverage, true);
        assert.equal("calorie" in lemonade.nutrition, false); // unknown is left out, not null or 0
        assert.deepEqual(lemonade.nutrition.macros, {});

        const fountain = await Food.findOne({ name: "Fountain Drink" }).lean();
        assert.deepEqual(fountain.allergens, {}); // unknown
        assert.equal(fountain.vegan, null);
    });

    test("the database itself rejects documents that break the validator", async () => {
        await assert.rejects(Food.collection.insertOne({ name: "Bad" }), /validation/i);
        const valid = await Food.findOne({ name: "Tofu Bowl" }, { _id: 0 }).lean();
        await assert.rejects(Food.collection.insertOne({ ...valid, nutrition: { macros: {}, calorie: null } }), /validation/i);
        await assert.rejects(Food.collection.insertOne({ ...valid, version: undefined }), /validation/i);
    });

    test("re-importing keeps counts and ids, and keeps values filled in by teammates", async () => {
        const rice = await Food.findOne({ name: "Rice", "nutrition.calorie": 490 });
        await Food.collection.updateOne({ _id: rice._id }, { $set: { "nutrition.macros.protein": 4000 } });
        await Food.collection.updateOne({ name: "Fountain Drink" }, { $set: { vegan: true, "allergens.dairy": false } });
        const realHours = { days: ["mon", "tue"], open: "08:00", close: "14:00" };
        await Location.collection.updateOne({ name: "Test Market" }, { $set: { hours: realHours } });

        const ids = async () => (await MenuItem.find({ loc_id: locId }, { _id: 1 }).sort({ _id: 1 }).lean()).map((d) => String(d._id));
        const before = await ids();

        const result = await importHall(HALL);
        await importHall(MARKET);
        assert.equal(result.inserted, 0);
        assert.equal(result.updated, 7);
        assert.deepEqual(await ids(), before);
        assert.equal(await Food.countDocuments(), 8);
        assert.equal(await Location.countDocuments(), 2);
        assert.equal((await Food.findById(rice._id).lean()).nutrition.macros.protein, 4000);
        const fountain = await Food.findOne({ name: "Fountain Drink" }).lean();
        assert.equal(fountain.vegan, true);
        assert.equal(fountain.allergens.dairy, false);
        assert.deepEqual((await Location.findOne({ name: "Test Market" }).lean()).hours, realHours);
    });

    test("locations list hours and isOpenNow; unknown hours are null", async () => {
        await Location.collection.updateOne({ name: "Test Market" }, { $set: { hours: { days: [], open: "00:00", close: "00:00" } } });
        const [hall, market] = await locationService.listLocations({ day: "mon", time: "11:00" });

        assert.equal(hall.name, "Test Hall");
        assert.equal(hall.type, "dining hall");
        assert.deepEqual(hall.hours, { days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], open: "07:00", close: "21:00" });
        assert.equal(hall.isOpenNow, true);
        assert.equal(hall.stationCount, 2);
        assert.equal(hall.itemCount, 7);

        assert.equal(market.name, "Test Market");
        assert.equal(market.type, "market");
        assert.equal(market.area, "unknown");
        assert.equal(market.hours, null);
        assert.equal(market.isOpenNow, null);
    });

    test("allergen filter excludes items with that allergen and items whose allergens are unknown", async () => {
        // Back to unknown (the re-import test above filled these in).
        await Food.collection.updateOne({ name: "Fountain Drink" }, { $set: { vegan: null, vegetarian: null, allergens: {} } });
        assert.deepEqual(names(await search({ exclude: ["dairy"] })), ["Rice", "Rice", "Lemonade", "Tofu Bowl", "Shrimp Plate"]);
        assert.deepEqual(names(await search({ exclude: ["shellfish", "soy"] })), ["Rice", "Rice", "Lemonade", "Cheese Pizza"]);
    });

    test("diet filter keeps only matches; vegetarian includes vegan", async () => {
        assert.deepEqual(names(await search({ diet: "vegan" })), ["Rice", "Rice", "Lemonade", "Tofu Bowl"]);
        assert.deepEqual(names(await search({ diet: "vegetarian" })), ["Rice", "Rice", "Lemonade", "Cheese Pizza", "Tofu Bowl"]);
    });

    test("menu items come back in API shape: cents, calories, and unknowns as null", async () => {
        const items = await search({});
        assert.equal(items.length, 7);

        const tofu = items.find((i) => i.name === "Tofu Bowl");
        assert.equal(tofu.priceCents, 725);
        assert.equal(tofu.stationName, "Grill");
        assert.equal(tofu.allergensKnown, true);
        assert.deepEqual(tofu.allergens, ["soy"]);
        assert.equal(tofu.vegetarian, true);
        assert.equal(tofu.nutrition.calories, 450);
        assert.equal(tofu.nutrition.proteinG, null);

        const fountain = items.find((i) => i.name === "Fountain Drink");
        assert.equal(fountain.allergensKnown, false);
        assert.deepEqual(fountain.allergens, []);
        assert.equal(fountain.vegan, null);
        assert.equal(fountain.nutrition.calories, null);
    });

    test("sort by protein puts unknown protein last", async () => {
        const [first] = await search({ sort: "protein" });
        assert.equal(first.name, "Rice"); // the one we set to 4 g
        assert.equal(first.nutrition.proteinG, 4);
    });

    test("unknown or malformed location is a 404", async () => {
        const is404 = (err) => err instanceof HttpError && err.status === 404;
        await assert.rejects(menuService.search({ location: "000000000000000000000000", exclude: [] }), is404);
        await assert.rejects(locationService.getStations("pines"), is404);
    });

    // Keyword search across every location. Prices, cheapest first:
    // Fountain Drink 200, Rice 250, Rice 300, Lemonade 325, Cheese Pizza 500, Tofu Bowl 725, BLT 899, Shrimp Plate 1200
    const find = (query) => menuSearchService.search({ ...parseMenuSearchQuery({}), ...query });

    test("search matches keywords in food, station and location names", async () => {
        const rice = await find({ keywords: ["rice"] });
        assert.equal(rice.total, 2);
        assert.deepEqual(rice.items.map((i) => [i.name, i.locationName, i.stationName]), [["Rice", "Test Hall", "Grill"], ["Rice", "Test Hall", "Cafe"]]);

        assert.deepEqual(names((await find({ keywords: ["grill"], sort: "price" })).items), ["Rice", "Cheese Pizza", "Tofu Bowl", "Shrimp Plate"]);
        assert.deepEqual(names((await find({ keywords: ["market"] })).items), ["BLT"]);
        // Every keyword must match: "cafe" narrows the two Rice items to one.
        assert.deepEqual((await find({ keywords: ["rice", "cafe"] })).items.map((i) => i.stationName), ["Cafe"]);
        assert.equal((await find({ keywords: ["sushi"] })).total, 0);
        // Special characters are searched literally, not as a pattern.
        assert.equal((await find({ keywords: ["(a+"] })).total, 0);
    });

    test("search ranks food-name matches above station and location matches", async () => {
        await Food.collection.updateOne({ name: "BLT" }, { $set: { name: "Grilled BLT" } });
        const { items } = await find({ keywords: ["grill"] });
        assert.equal(items[0].name, "Grilled BLT");
        assert.equal(items.length, 5);
        await Food.collection.updateOne({ name: "Grilled BLT" }, { $set: { name: "BLT" } });
    });

    test("search filters by price, calories, drinks, allergens and location", async () => {
        assert.deepEqual(names((await find({ maxPriceCents: 300, sort: "price" })).items), ["Fountain Drink", "Rice", "Rice"]);
        // Unknown calories never pass a calorie limit.
        assert.deepEqual(names((await find({ maxCalories: 100 })).items), ["Rice"]);
        assert.deepEqual(names((await find({ beverage: true, sort: "price" })).items), ["Fountain Drink", "Lemonade"]);
        // Unknown allergens never pass an allergen filter.
        assert.deepEqual(names((await find({ exclude: ["dairy"], sort: "price" })).items), ["Rice", "Rice", "Lemonade", "Tofu Bowl", "BLT", "Shrimp Plate"]);
        assert.deepEqual(names((await find({ diet: "vegetarian", keywords: ["bowl"] })).items), ["Tofu Bowl"]);

        const market = await Location.findOne({ name: "Test Market" }).lean();
        assert.deepEqual(names((await find({ location: String(market._id) })).items), ["BLT"]);
        assert.deepEqual(names((await find({ station: String(market.stations[0].station_id) })).items), ["BLT"]);
    });

    test("search pages through results and sorts unknown calories last", async () => {
        const page = await find({ sort: "price", limit: 2, offset: 2 });
        assert.deepEqual(names(page.items), ["Rice", "Lemonade"]);
        assert.deepEqual([page.total, page.limit, page.offset], [8, 2, 2]);

        const byCalories = names((await find({ sort: "calories", limit: 100 })).items);
        assert.deepEqual(byCalories.slice(0, 2), ["Rice", "Rice"]);
        assert.deepEqual(byCalories.slice(-2).sort(), ["Fountain Drink", "Lemonade"]);
    });

    test("search with an unknown location is a 404", async () => {
        await assert.rejects(find({ location: "000000000000000000000000" }), (err) => err instanceof HttpError && err.status === 404);
    });

    test("stations list ids and names", async () => {
        const stations = await locationService.getStations(String(locId));
        assert.deepEqual(stations.map((s) => [s.name, s.itemCount]), [["Grill", 4], ["Cafe", 3]]);
        assert.ok(stations.every((s) => mongoose.isObjectIdOrHexString(s.id)));
    });
});
