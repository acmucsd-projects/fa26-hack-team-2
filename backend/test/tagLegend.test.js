// Keeps data/tag-legend.json, src/constants/tags.js and the hall files in
// sync. No database needed.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ALLERGENS, DIETS, PROGRAMS, TAGS } = require("../src/constants/tags");

const DATA_DIR = path.join(__dirname, "..", "data");
const HALLS_DIR = path.join(DATA_DIR, "halls");
const legend = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "tag-legend.json"), "utf8"));

const hallFiles = fs.readdirSync(HALLS_DIR, { recursive: true })
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, data: JSON.parse(fs.readFileSync(path.join(HALLS_DIR, f), "utf8")) }));

test("the legend defines exactly the tags the backend knows", () => {
    assert.deepEqual(Object.keys(legend).sort(), [...TAGS].sort());
});

test("each legend entry has the right type", () => {
    const typeOf = (tag) => (ALLERGENS.includes(tag) ? "allergen" : DIETS.includes(tag) ? "diet" : PROGRAMS.includes(tag) ? "program" : null);
    for (const [tag, entry] of Object.entries(legend)) {
        assert.equal(entry.type, typeOf(tag), tag);
        assert.ok(entry.icon && entry.label, `${tag} needs an icon and a label`);
    }
});

test("hall files only use tags from the legend", () => {
    for (const { name, data } of hallFiles) {
        for (const station of data.stations) {
            for (const item of station.items) {
                for (const tag of item.tags ?? []) {
                    assert.ok(legend[tag], `${name} / ${station.name} / ${item.name}: unknown tag "${tag}"`);
                }
            }
        }
    }
});

test("hall files don't repeat the legend", () => {
    for (const { name, data } of hallFiles) {
        assert.equal(data.tag_legend, undefined, `${name} has its own tag_legend; use data/tag-legend.json`);
    }
});
