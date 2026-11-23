const { test } = require("node:test");
const assert = require("node:assert/strict");
const { campusNow, isOpenNow, UNKNOWN_HOURS } = require("../src/services/hours");

test("campusNow converts UTC to campus time, across daylight saving", () => {
    // Fri Oct 30 2026, 19:00 UTC = 12:00 PDT
    assert.deepEqual(campusNow(new Date("2026-10-30T19:00:00Z")), { day: "fri", time: "12:00" });
    // Mon Nov 9 2026, 19:00 UTC = 11:00 PST (DST ended Nov 1)
    assert.deepEqual(campusNow(new Date("2026-11-09T19:00:00Z")), { day: "mon", time: "11:00" });
    // Just after midnight campus time is still the campus day, not the UTC day
    assert.deepEqual(campusNow(new Date("2026-11-10T08:05:00Z")), { day: "tue", time: "00:05" });
});

const weekdays = { days: ["mon", "tue", "wed", "thu", "fri"], open: "07:00", close: "21:00" };

test("isOpenNow is true from opening up to (not including) closing", () => {
    assert.equal(isOpenNow(weekdays, { day: "fri", time: "06:59" }), false);
    assert.equal(isOpenNow(weekdays, { day: "fri", time: "07:00" }), true);
    assert.equal(isOpenNow(weekdays, { day: "fri", time: "20:59" }), true);
    assert.equal(isOpenNow(weekdays, { day: "fri", time: "21:00" }), false);
});

test("isOpenNow is false on a day that isn't listed", () => {
    assert.equal(isOpenNow(weekdays, { day: "sat", time: "12:00" }), false);
});

test("isOpenNow returns null when the hours are unknown", () => {
    assert.equal(isOpenNow(UNKNOWN_HOURS, { day: "fri", time: "12:00" }), null);
    assert.equal(isOpenNow(null, { day: "fri", time: "12:00" }), null);
    assert.equal(isOpenNow(undefined, { day: "fri", time: "12:00" }), null);
});

test("isOpenNow handles closing after midnight", () => {
    const lateNight = { days: ["fri", "sat"], open: "18:00", close: "01:00" };
    assert.equal(isOpenNow(lateNight, { day: "fri", time: "23:30" }), true);
    assert.equal(isOpenNow(lateNight, { day: "sat", time: "00:30" }), true); // still Friday's night
    assert.equal(isOpenNow(lateNight, { day: "sun", time: "00:30" }), true); // still Saturday's night
    assert.equal(isOpenNow(lateNight, { day: "sun", time: "19:00" }), false);
    assert.equal(isOpenNow(lateNight, { day: "fri", time: "00:30" }), false); // Thursday isn't listed
    assert.equal(isOpenNow(lateNight, { day: "sat", time: "12:00" }), false);
});
