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
const locationService = require("../src/services/locationService");
const { HttpError } = require("../src/utils/httpError");

const TEST_DB = "HT2_DB_test";

// A small hall in the same shape as data/halls/*.json.
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
                { category: "Sides", name: "Rice", price_cents: 300, calories: 294, tags: ["vegan"] } // same name, different station
            ]
        }
    ]
};

const names = (items) => items.map((i) => i.name);

describe("HT2_DB import and menu queries", { skip: !process.env.MONGODB_URI && "MONGODB_URI not set" }, () => {
    let locId;
    const search = (query) => menuService.search({ location: String(locId), exclude: [], diet: null, sort: "price", ...query });

    before(async () => {
        const connection = await connectDB({ dbName: TEST_DB });
        assert.equal(connection.name, TEST_DB, "refusing to run against a non-test database");
        await connection.dropDatabase();
        await applyValidators(connection.db);
        await Promise.all([Location.createIndexes(), Food.createIndexes(), MenuItem.createIndexes()]);

        // A placeholder doc like the ones in HT2_DB; it must never show up.
        await Location.collection.insertOne({
            _example: true, name: "EXAMPLE", type: "dining hall",
            location: { area: "x", geodata: {} }, stations: []
        });

        locId = (await importHall(HALL)).locationId;
    });

    after(async () => {
        if (mongoose.connection.name === TEST_DB) await mongoose.connection.dropDatabase();
        await disconnectDB();
    });

    test("import writes documents the HT2_DB validators accept", async () => {
        assert.equal(await Food.countDocuments(), 6);
        assert.equal(await MenuItem.countDocuments({ loc_id: locId }), 6);
        const lemonade = await Food.findOne({ name: "Lemonade" }).lean();
        assert.equal(lemonade.beverage, true);
        assert.equal(lemonade.nutrition.calorie, null); // unknown stays null, not 0
        assert.equal(lemonade.nutrition.macros.protein, null);
    });

    test("the database itself rejects documents that break the validator", async () => {
        await assert.rejects(Food.collection.insertOne({ name: "Bad" }), /validation/i);
    });

    test("re-importing keeps counts and ids, and keeps fields set by teammates", async () => {
        const rice = await Food.findOne({ name: "Rice", "nutrition.calorie": 49 });
        await Food.updateOne({ _id: rice._id }, { $set: { "nutrition.macros.protein": 4 } });
        const ids = async () => (await MenuItem.find({ loc_id: locId }, { _id: 1 }).sort({ _id: 1 }).lean()).map((d) => String(d._id));
        const before = await ids();

        const result = await importHall(HALL);
        assert.equal(result.inserted, 0);
        assert.equal(result.updated, 6);
        assert.deepEqual(await ids(), before);
        assert.equal(await Food.countDocuments(), 6);
        assert.equal((await Food.findById(rice._id).lean()).nutrition.macros.protein, 4);
    });

    test("locations list hides placeholder docs", async () => {
        assert.deepEqual((await locationService.listLocations()).map((l) => l.name), ["Test Hall"]);
    });

    test("allergen filter excludes every item with that allergen", async () => {
        assert.deepEqual(names(await search({ exclude: ["dairy"] })), ["Rice", "Rice", "Lemonade", "Tofu Bowl", "Shrimp Plate"]);
        assert.deepEqual(names(await search({ exclude: ["shellfish", "soy"] })), ["Rice", "Rice", "Lemonade", "Cheese Pizza"]);
    });

    test("diet filter keeps only matches; vegetarian includes vegan", async () => {
        assert.deepEqual(names(await search({ diet: "vegan" })), ["Rice", "Rice", "Lemonade", "Tofu Bowl"]);
        assert.deepEqual(names(await search({ diet: "vegetarian" })), ["Rice", "Rice", "Lemonade", "Cheese Pizza", "Tofu Bowl"]);
    });

    test("menu items come back in API shape with prices in cents", async () => {
        const tofu = (await search({ exclude: ["shellfish"], diet: "vegan" })).find((i) => i.name === "Tofu Bowl");
        assert.equal(tofu.priceCents, 725);
        assert.equal(tofu.stationName, "Grill");
        assert.deepEqual(tofu.allergens, ["soy"]);
        assert.equal(tofu.vegetarian, true);
        assert.equal(tofu.nutrition.calories, 450);
        assert.equal(tofu.nutrition.proteinG, null);
    });

    test("sort by protein puts unknown protein last", async () => {
        assert.equal((await search({ sort: "protein" }))[0].name, "Rice"); // the one we set to 4 g
    });

    test("unknown or malformed location is a 404", async () => {
        const is404 = (err) => err instanceof HttpError && err.status === 404;
        await assert.rejects(menuService.search({ location: "000000000000000000000000", exclude: [] }), is404);
        await assert.rejects(locationService.getStations("pines"), is404);
    });

    test("stations include hours and isOpenNow", async () => {
        const stations = await locationService.getStations(String(locId), { day: "mon", time: "11:00" });
        assert.deepEqual(stations.map((s) => [s.name, s.isOpenNow]), [["Grill", false], ["Cafe", null]]);
    });
});
