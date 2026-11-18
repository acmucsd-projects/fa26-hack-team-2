// Accounts and the food log over real HTTP, against a real MongoDB, in a
// separate "HT2_DB_test_accounts" database that is wiped before and after.
// (Its own database, so it can run at the same time as menu.db.test.js.)
// Skipped when MONGODB_URI isn't set.
require("dotenv").config({ quiet: true });

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const app = require("../src/app");
const { connectDB, disconnectDB } = require("../src/config/db");
const { applyValidators } = require("../src/config/validators");
const { importHall } = require("../src/importers/hallImporter");
const Food = require("../src/models/Food");
const FoodLog = require("../src/models/FoodLog");
const Location = require("../src/models/Location");
const MenuItem = require("../src/models/MenuItem");
const User = require("../src/models/User");

const TEST_DB = "HT2_DB_test_accounts";

const HALL = {
    dining_hall: { id: "log-hall", name: "Log Hall", type: "dining_hall", area: "Test College" },
    stations: [
        {
            id: "log-grill", name: "Grill", hours: null,
            items: [
                { category: "Mains", name: "Cheese Pizza", price_cents: 500, calories: 300, tags: ["dairy"] },
                { category: "Tea & Lemonade", name: "Lemonade", price_cents: 325, calories: null, tags: [] },
            ],
        },
    ],
};

async function wipe(connection) {
    for (const c of await connection.db.collections()) await c.drop();
}

describe("accounts and food log", { skip: !process.env.MONGODB_URI && "MONGODB_URI not set" }, () => {
    let server;
    let base;
    let pizza;
    let lemonade;

    // A tiny client that keeps the session cookie, like a browser would.
    function client() {
        let cookie = "";
        return async function call(method, path, body) {
            const res = await fetch(base + path, {
                method,
                headers: { ...(body !== undefined && { "content-type": "application/json" }), ...(cookie && { cookie }) },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            for (const header of res.headers.getSetCookie()) {
                const [pair] = header.split(";");
                cookie = pair.endsWith("=") ? "" : pair;
            }
            return { status: res.status, body: await res.json(), setCookie: res.headers.getSetCookie() };
        };
    }

    before(async () => {
        const connection = await connectDB({ dbName: TEST_DB, autoIndex: false });
        assert.equal(connection.name, TEST_DB, "refusing to run against a non-test database");
        await wipe(connection);
        await applyValidators(connection.db);
        await Promise.all([Location, Food, MenuItem, User, FoodLog].map((model) => model.createIndexes()));
        const { locationId } = await importHall(HALL);
        const items = await MenuItem.aggregate([
            { $match: { loc_id: locationId } },
            { $lookup: { from: "Foods", localField: "food_id", foreignField: "_id", as: "food" } },
            { $unwind: "$food" },
        ]);
        pizza = String(items.find((i) => i.food.name === "Cheese Pizza")._id);
        lemonade = String(items.find((i) => i.food.name === "Lemonade")._id);

        server = app.listen(0);
        await new Promise((resolve) => server.once("listening", resolve));
        base = `http://localhost:${server.address().port}`;
    });

    after(async () => {
        await new Promise((resolve) => server.close(resolve));
        if (mongoose.connection.name === TEST_DB) await wipe(mongoose.connection);
        await disconnectDB();
    });

    const phoebe = client();

    test("signed-out requests to /api/me are refused", async () => {
        const { status, body } = await client()("GET", "/api/me");
        assert.equal(status, 401);
        assert.equal(body.error.code, "unauthorized");
    });

    test("registering creates the account with default goals and signs in", async () => {
        const { status, body, setCookie } = await phoebe("POST", "/api/auth/register", { name: "Phoebe", email: "Phoebe@UCSD.edu", password: "longenough" });
        assert.equal(status, 201);
        assert.equal(body.data.email, "phoebe@ucsd.edu");
        assert.deepEqual(body.data.goals.calories, { min: null, max: 2200 });
        assert.deepEqual(body.data.goals.proteinG, { min: 110, max: null });
        assert.equal(body.data.budget.dailyCents, 2000);
        assert.equal("password" in body.data, false);
        assert.match(setCookie[0], /^ht2_session=.+; Max-Age=604800; Path=\/api; Expires=.+; HttpOnly; SameSite=Lax$/);

        const stored = await User.findOne({ "contact.email": "phoebe@ucsd.edu" }).lean();
        assert.match(stored.password, /^scrypt:/);
        assert.equal(stored.version, 1);
        assert.equal(stored.nutrition_goals.calorie.max, 22000); // tenths of a calorie
    });

    test("an email can only be registered once (any capitalization)", async () => {
        const { status, body } = await client()("POST", "/api/auth/register", { name: "Copy", email: "PHOEBE@ucsd.edu", password: "longenough" });
        assert.equal(status, 409);
        assert.equal(body.error.code, "conflict");
    });

    test("signing in checks the password", async () => {
        const wrong = await client()("POST", "/api/auth/login", { email: "phoebe@ucsd.edu", password: "wrong-password" });
        assert.equal(wrong.status, 401);
        const missing = await client()("POST", "/api/auth/login", { email: "nobody@ucsd.edu", password: "longenough" });
        assert.equal(missing.status, 401);
        assert.equal(missing.body.error.message, wrong.body.error.message); // doesn't reveal which accounts exist

        const again = client();
        assert.equal((await again("POST", "/api/auth/login", { email: "phoebe@ucsd.edu", password: "longenough" })).status, 200);
        assert.equal((await again("GET", "/api/me")).body.data.name, "Phoebe");
    });

    test("a tampered cookie is refused", async () => {
        const res = await fetch(`${base}/api/me`, { headers: { cookie: "ht2_session=eyJzdWIiOiJ4In0.forged" } });
        assert.equal(res.status, 401);
    });

    test("profile changes are saved in the schema's units, and null clears a value", async () => {
        const { status, body } = await phoebe("PATCH", "/api/me", {
            name: "Phoebe Y",
            phone: "+1 (858) 555-0123",
            goals: { calories: { min: 1800, max: 2500 }, fatG: { max: 65.5 } },
            budget: { dailyCents: 2500, weeklyCents: 17500 },
            balanceCents: 123456,
        });
        assert.equal(status, 200);
        assert.equal(body.data.name, "Phoebe Y");
        assert.deepEqual(body.data.goals.calories, { min: 1800, max: 2500 });
        assert.equal(body.data.goals.fatG.max, 65.5);
        assert.equal(body.data.balanceCents, 123456);

        const stored = await User.findOne({ "contact.email": "phoebe@ucsd.edu" }).lean();
        assert.equal(stored.nutrition_goals.calorie.min, 18000);
        assert.equal(stored.nutrition_goals.fat.max, 65500); // milligrams

        const cleared = await phoebe("PATCH", "/api/me", { phone: null, goals: { calories: { min: null } } });
        assert.equal(cleared.body.data.phone, null);
        assert.deepEqual(cleared.body.data.goals.calories, { min: null, max: 2500 });

        assert.equal((await phoebe("PATCH", "/api/me", { email: "new@ucsd.edu" })).status, 400);
    });

    test("an empty range comes back as empty days", async () => {
        const { body } = await phoebe("GET", "/api/me/log?from=2026-11-15&to=2026-11-16");
        assert.deepEqual(body.data.map((d) => [d.date, d.meals.length, d.totals.calories]), [["2026-11-15", 0, 0], ["2026-11-16", 0, 0]]);
    });

    let pizzaMeal;
    let lemonadeMeal;

    test("logging meals updates the day's totals and counts unknowns", async () => {
        const first = await phoebe("POST", "/api/me/log/2026-11-17/meals", { menuItemId: pizza });
        assert.equal(first.status, 201);
        pizzaMeal = first.body.data.mealId;

        const second = await phoebe("POST", "/api/me/log/2026-11-17/meals", { menuItemId: lemonade, servings: 2 });
        lemonadeMeal = second.body.data.mealId;
        const day = second.body.data.day;
        assert.equal(day.meals.length, 2);
        assert.deepEqual(day.totals, { calories: 300, proteinG: 0, carbsG: 0, fatG: 0, spentCents: 500 + 650 });
        assert.deepEqual(day.unknown, { calories: 1, macros: 2, price: 0 });
        assert.deepEqual(
            day.meals.map((m) => [m.name, m.locationName, m.stationName, m.servings, m.priceCents, m.calories]),
            [["Cheese Pizza", "Log Hall", "Grill", 1, 500, 300], ["Lemonade", "Log Hall", "Grill", 2, 650, null]],
        );

        const stored = (await FoodLog.findOne({}).lean()).days["2026-11-17"];
        assert.deepEqual(stored.totals, { calorie: 3000, protein: 0, carb: 0, fat: 0 }); // tenths, milligrams
        assert.equal(stored.meals[0].snapshot.price, 500);
    });

    test("changing servings recomputes the totals", async () => {
        const { status, body } = await phoebe("PATCH", `/api/me/log/2026-11-17/meals/${pizzaMeal}`, { servings: 1.5 });
        assert.equal(status, 200);
        assert.equal(body.data.totals.calories, 450);
        assert.equal(body.data.totals.spentCents, 750 + 650);
    });

    test("the week summary shows progress toward the goals", async () => {
        const { body } = await phoebe("GET", "/api/me/week?start=2026-11-15");
        assert.equal(body.data.days.length, 7);
        const tuesday = body.data.days.find((d) => d.date === "2026-11-17");
        assert.deepEqual(tuesday, { date: "2026-11-17", mealCount: 2, calories: 450, spentCents: 1400, caloriesPercent: 18, budgetPercent: 56 });
        assert.deepEqual(body.data.goals, { calories: 2500, dailyBudgetCents: 2500, weeklyBudgetCents: 17500 });
        assert.equal(body.data.totals.spentCents, 1400);
    });

    test("removing meals updates totals, and an emptied day disappears", async () => {
        const one = await phoebe("DELETE", `/api/me/log/2026-11-17/meals/${lemonadeMeal}`);
        assert.equal(one.body.data.meals.length, 1);
        assert.equal(one.body.data.totals.spentCents, 750);

        await phoebe("DELETE", `/api/me/log/2026-11-17/meals/${pizzaMeal}`);
        const stored = await FoodLog.findOne({}).lean();
        assert.equal("2026-11-17" in stored.days, false);
        assert.equal((await phoebe("DELETE", `/api/me/log/2026-11-17/meals/${pizzaMeal}`)).status, 404);
    });

    test("meals logged at the same moment all count", async () => {
        const results = await Promise.all(Array.from({ length: 10 }, () => phoebe("POST", "/api/me/log/2026-11-18/meals", { menuItemId: pizza })));
        assert.ok(results.every((r) => r.status === 201));
        const [day] = (await phoebe("GET", "/api/me/log?from=2026-11-18")).body.data;
        assert.equal(day.meals.length, 10);
        assert.equal(day.totals.calories, 3000);
        assert.equal(day.totals.spentCents, 5000);
    });

    test("each person only sees their own log", async () => {
        const other = client();
        await other("POST", "/api/auth/register", { name: "Other", email: "other@ucsd.edu", password: "longenough" });
        const [day] = (await other("GET", "/api/me/log?from=2026-11-18")).body.data;
        assert.equal(day.meals.length, 0);
        assert.equal((await other("DELETE", `/api/me/log/2026-11-18/meals/${pizzaMeal}`)).status, 404);
    });

    test("bad log requests get clear errors", async () => {
        assert.equal((await phoebe("POST", "/api/me/log/2026-02-30/meals", { menuItemId: pizza })).status, 400);
        assert.equal((await phoebe("POST", "/api/me/log/2026-11-18/meals", { menuItemId: "000000000000000000000000" })).status, 404);
        assert.equal((await phoebe("POST", "/api/me/log/2026-11-18/meals", { menuItemId: pizza, servings: -1 })).status, 400);
        assert.equal((await phoebe("PATCH", "/api/me/log/2026-11-18/meals/nope", { servings: 1 })).status, 404);
    });

    test("signing out clears the cookie", async () => {
        const { status, setCookie } = await phoebe("POST", "/api/auth/logout");
        assert.equal(status, 200);
        assert.match(setCookie[0], /^ht2_session=;.*Expires=Thu, 01 Jan 1970/);
        assert.equal((await phoebe("GET", "/api/me")).status, 401);
    });
});
