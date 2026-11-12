// Loads data/halls/**/*.json into HT2_DB (Locations, Foods, Menu_Items).
//
//   npm run db:import                         # every file in data/halls, including subfolders
//   npm run db:import -- data/halls/mobile    # every file in one folder
//   npm run db:import -- data/halls/pines.json
//
// Safe to re-run: existing locations, stations and menu items are updated in
// place, so counts and ids stay the same. See src/importers/hallImporter.js.
require("dotenv").config({ quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const { connectDB, disconnectDB } = require("../src/config/db");
const { importHall } = require("../src/importers/hallImporter");

const HALLS_DIR = path.join(__dirname, "..", "data", "halls");

// A .json file stays as is; a folder expands to every .json file inside it,
// including subfolders (e.g. data/halls/mobile).
function jsonFiles(target) {
    if (!fs.statSync(target).isDirectory()) return [target];
    return fs.readdirSync(target, { recursive: true })
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => path.join(target, f));
}

async function main() {
    const targets = process.argv.slice(2).length ? process.argv.slice(2).map((f) => path.resolve(f)) : [HALLS_DIR];
    const files = targets.flatMap(jsonFiles);

    const connection = await connectDB();
    console.log(`Importing into database "${connection.name}"`);
    try {
        for (const file of files) {
            const r = await importHall(JSON.parse(fs.readFileSync(file, "utf8")));
            console.log(`${r.name} (${r.locationId}): ${r.stations} stations, ${r.items} items in file ` +
                `(${r.inserted} new, ${r.updated} updated). ${r.total} menu items in database.`);
            if (r.total !== r.items) {
                console.warn(`  Warning: the database has ${r.total} menu items for ${r.name} but the file has ${r.items}. ` +
                    "Items removed from the file are not deleted automatically.");
            }
        }
    } finally {
        await disconnectDB();
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
