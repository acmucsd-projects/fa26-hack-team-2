// Pure time helpers, no database. Vercel/most servers run in UTC, so always
// convert to campus time explicitly.
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

// true / false, or null when we can't tell (hours unknown, or we're past an
// opening time whose closing time is unknown). "HH:MM" strings compare
// correctly because they are zero-padded.
function isOpenNow(hours, now = campusNow()) {
    if (!hours) return null;

    let unknown = false;
    for (const window of hours) {
        if (window.day !== now.day || now.time < window.open) continue;
        if (window.close === null) unknown = true;
        else if (now.time < window.close) return true;
    }
    return unknown ? null : false;
}

module.exports = { TIME_ZONE, campusNow, isOpenNow };
