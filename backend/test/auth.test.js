// Passwords, sign-in tokens and request checks. No database needed.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hashPassword, verifyPassword } = require("../src/auth/password");
const { createToken, readToken, readCookie } = require("../src/auth/session");
const { parseRegister, parseLogin, parseProfileUpdate } = require("../src/validators/accountInput");
const { parseDate, parseRange, parseWeekStart, parseNewMeal, parseServingsChange } = require("../src/validators/logInput");
const { campusDate } = require("../src/services/hours");
const { HttpError } = require("../src/utils/httpError");

const is400 = (err) => err instanceof HttpError && err.status === 400;
const ID = "6af0dee86b3cdcd7f87d57ee";

test("passwords are stored hashed and checked correctly", async () => {
    const stored = await hashPassword("correct horse battery");
    assert.match(stored, /^scrypt:16384:8:1:/);
    assert.ok(!stored.includes("correct horse"));
    assert.equal(await verifyPassword("correct horse battery", stored), true);
    assert.equal(await verifyPassword("wrong password", stored), false);
    assert.notEqual(await hashPassword("same"), await hashPassword("same")); // different salt each time
    assert.equal(await verifyPassword("anything", "not-a-hash"), false);
});

test("sign-in tokens carry the user id and reject tampering and expiry", () => {
    const now = Date.UTC(2026, 10, 17);
    const token = createToken(ID, now);
    assert.equal(readToken(token, now), ID);

    const [payload, signature] = token.split(".");
    const otherUser = Buffer.from(JSON.stringify({ sub: "000000000000000000000000", exp: 9999999999 })).toString("base64url");
    assert.equal(readToken(`${otherUser}.${signature}`, now), null); // changed payload
    assert.equal(readToken(`${payload}.${signature.slice(0, -2)}xx`, now), null); // changed signature
    assert.equal(readToken(`${payload}.${signature}.extra`, now), null);
    assert.equal(readToken(token, now + 8 * 24 * 60 * 60 * 1000), null); // after 7 days
    assert.equal(readToken(undefined), null);
});

test("readCookie finds the session cookie among others", () => {
    assert.equal(readCookie({ headers: { cookie: "a=1; ht2_session=abc.def; b=2" } }), "abc.def");
    assert.equal(readCookie({ headers: {} }), null);
});

test("register and login input", () => {
    assert.deepEqual(parseRegister({ name: " Phoebe ", email: " Phoebe@UCSD.edu ", password: "longenough" }), {
        name: "Phoebe",
        email: "phoebe@ucsd.edu",
        password: "longenough",
    });
    assert.equal(parseRegister({ name: "P", email: "p@ucsd.edu", password: "longenough", phone: "+1 (858) 555-0123" }).phone, "+1 (858) 555-0123");
    assert.throws(() => parseRegister({ name: "P", email: "p@ucsd.edu", password: "short" }), is400);
    assert.throws(() => parseRegister({ name: "P", email: "not-an-email", password: "longenough" }), is400);
    assert.throws(() => parseRegister({ name: "", email: "p@ucsd.edu", password: "longenough" }), is400);
    assert.throws(() => parseRegister({ name: "P", email: "p@ucsd.edu", password: "longenough", phone: "858-555-0123" }), is400);
    assert.throws(() => parseRegister({ name: "P", email: "p@ucsd.edu", password: "longenough", isAdmin: true }), is400);
    assert.throws(() => parseRegister(undefined), is400);
    assert.deepEqual(parseLogin({ email: "P@ucsd.edu", password: "x" }), { email: "p@ucsd.edu", password: "x" });
    assert.throws(() => parseLogin({ email: "p@ucsd.edu" }), is400);
});

test("profile changes", () => {
    assert.deepEqual(
        parseProfileUpdate({ goals: { calories: { max: 2500 }, proteinG: { min: 120, max: null } }, budget: { dailyCents: 2500 }, phone: null }),
        { goals: { calories: { max: 2500 }, proteinG: { min: 120, max: null } }, budget: { dailyCents: 2500 }, phone: null },
    );
    assert.throws(() => parseProfileUpdate({}), is400);
    assert.throws(() => parseProfileUpdate({ goals: { calories: { min: 3000, max: 2000 } } }), is400);
    assert.throws(() => parseProfileUpdate({ goals: { sugar: { max: 10 } } }), is400);
    assert.throws(() => parseProfileUpdate({ budget: { dailyCents: 12.5 } }), is400);
    assert.throws(() => parseProfileUpdate({ budget: { dailyCents: -1 } }), is400);
    assert.throws(() => parseProfileUpdate({ password: "new" }), is400);
});

test("log dates, ranges and meals", () => {
    assert.equal(parseDate("2026-02-28"), "2026-02-28");
    assert.throws(() => parseDate("2026-02-30"), is400);
    assert.throws(() => parseDate("11/17/2026"), is400);
    assert.deepEqual(parseRange({}, "2026-11-17"), { from: "2026-11-17", to: "2026-11-17" });
    assert.deepEqual(parseRange({ from: "2026-11-15", to: "2026-11-21" }, "2026-11-17"), { from: "2026-11-15", to: "2026-11-21" });
    assert.throws(() => parseRange({ from: "2026-11-21", to: "2026-11-15" }, "2026-11-17"), is400);
    assert.throws(() => parseRange({ from: "2026-01-01", to: "2026-12-31" }, "2026-11-17"), is400);
    assert.equal(parseWeekStart({}, "2026-11-17"), "2026-11-15"); // Tuesday -> that Sunday
    assert.equal(parseWeekStart({}, "2026-11-15"), "2026-11-15");
    assert.deepEqual(parseNewMeal({ menuItemId: ID }), { menuItemId: ID, servings: 1 });
    assert.deepEqual(parseNewMeal({ menuItemId: ID, servings: 1.5 }), { menuItemId: ID, servings: 1.5 });
    assert.throws(() => parseNewMeal({ menuItemId: "pizza" }), is400);
    assert.throws(() => parseNewMeal({ menuItemId: ID, servings: 0 }), is400);
    assert.throws(() => parseNewMeal({ menuItemId: ID, userId: ID }), is400);
    assert.equal(parseServingsChange({ servings: 2 }), 2);
    assert.throws(() => parseServingsChange({ servings: 99 }), is400);
});

test("campusDate uses Pacific time, not UTC", () => {
    assert.equal(campusDate(new Date("2026-11-18T07:30:00Z")), "2026-11-17"); // 11:30 PM PST
    assert.equal(campusDate(new Date("2026-11-18T08:30:00Z")), "2026-11-18");
});
