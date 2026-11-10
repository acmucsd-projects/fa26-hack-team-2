// Loads data/halls/*.json into HT2_DB (Locations, Foods, Menu_Items).
//
//   npm run db:import                         # every file in data/halls
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

async function main() {
    const files = process.argv.slice(2).length
        ? process.argv.slice(2).map((f) => path.resolve(f))
        : fs.readdirSync(HALLS_DIR).filter((f) => f.endsWith(".json")).map((f) => path.join(HALLS_DIR, f));

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
