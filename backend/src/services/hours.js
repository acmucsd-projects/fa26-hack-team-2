// Pure time helpers, no database. Servers usually run in UTC, so always
// convert to campus time explicitly.
const { DAYS } = require("../constants/tags");

const TIME_ZONE = "America/Los_Angeles";

const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
});

// => { day: "fri", time: "13:05" } in campus time
function campusNow(date = new Date()) {
    const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
    return { day: parts.weekday.toLowerCase(), time: `${parts.hour}:${parts.minute}` };
}

// HT2_DB requires every location to have hours, so "we don't know the hours"
// is stored as an empty list of days.
const UNKNOWN_HOURS = Object.freeze({ days: [], open: "00:00", close: "00:00" });

function hoursKnown(hours) {
    return Boolean(hours && Array.isArray(hours.days) && hours.days.length > 0);
}

// `hours` is a location's { days, open, close }. Returns true / false, or null
// when the hours are unknown. "HH:MM" strings compare correctly because they
// are zero-padded. A close time at or before the open time means the location
// closes after midnight.
function isOpenNow(hours, now = campusNow()) {
    if (!hoursKnown(hours)) return null;

    const { days, open, close } = hours;
    const today = days.includes(now.day);
    if (close > open) return today && now.time >= open && now.time < close;

    const yesterday = days.includes(DAYS[(DAYS.indexOf(now.day) + 6) % 7]);
    return (today && now.time >= open) || (yesterday && now.time < close);
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

// Today's date on campus as "YYYY-MM-DD" (not the server's UTC date).
function campusDate(date = new Date()) {
    return dateFormatter.format(date);
}

module.exports = { TIME_ZONE, UNKNOWN_HOURS, campusNow, campusDate, hoursKnown, isOpenNow };
