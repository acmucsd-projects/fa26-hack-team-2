const { test } = require("node:test");
const assert = require("node:assert/strict");
const { campusNow, isOpenNow } = require("../src/services/hours");

test("campusNow converts UTC to campus time, across daylight saving", () => {
    // Fri Oct 30 2026, 19:00 UTC = 12:00 PDT
    assert.deepEqual(campusNow(new Date("2026-10-30T19:00:00Z")), { day: "fri", time: "12:00" });
    // Mon Nov 9 2026, 19:00 UTC = 11:00 PST (DST ended Nov 1)
    assert.deepEqual(campusNow(new Date("2026-11-09T19:00:00Z")), { day: "mon", time: "11:00" });
    // Just after midnight campus time is still the campus day, not the UTC day
    assert.deepEqual(campusNow(new Date("2026-11-10T08:05:00Z")), { day: "tue", time: "00:05" });
});

// Street Eats closes 10:45–11:15 AM
const streetEats = [
    { day: "fri", open: "07:00", close: "10:45" },
    { day: "fri", open: "11:15", close: "21:00" }
];

test("isOpenNow handles several windows in one day", () => {
    assert.equal(isOpenNow(streetEats, { day: "fri", time: "06:59" }), false);
    assert.equal(isOpenNow(streetEats, { day: "fri", time: "07:00" }), true);
    assert.equal(isOpenNow(streetEats, { day: "fri", time: "10:45" }), false);
    assert.equal(isOpenNow(streetEats, { day: "fri", time: "11:00" }), false);
    assert.equal(isOpenNow(streetEats, { day: "fri", time: "11:15" }), true);
    assert.equal(isOpenNow(streetEats, { day: "fri", time: "21:00" }), false);
});

test("isOpenNow is false on a day with no hours listed", () => {
    assert.equal(isOpenNow(streetEats, { day: "sat", time: "12:00" }), false);
});

test("isOpenNow returns null when it can't tell", () => {
    // Current: hours unknown
    assert.equal(isOpenNow(null, { day: "fri", time: "12:00" }), null);
    // Heat: opens at 5 PM, closing time unknown
    const heat = [{ day: "fri", open: "17:00", close: null }];
    assert.equal(isOpenNow(heat, { day: "fri", time: "16:00" }), false);
    assert.equal(isOpenNow(heat, { day: "fri", time: "18:00" }), null);
});
