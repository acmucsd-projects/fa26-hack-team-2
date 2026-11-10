// MongoDB-side schema rules ($jsonSchema) for the HT2_DB collections.
// The JSON files in db/validators are the source of truth; MongoDB rejects any
// write that breaks them, even from Atlas or scripts that skip Mongoose.
const fs = require("node:fs");
const path = require("node:path");

const VALIDATORS_DIR = path.join(__dirname, "..", "..", "db", "validators");

function loadValidators() {
    return fs.readdirSync(VALIDATORS_DIR)
        .filter((file) => file.endsWith(".json"))
        .map((file) => ({
            collection: path.basename(file, ".json"),
            validator: JSON.parse(fs.readFileSync(path.join(VALIDATORS_DIR, file), "utf8"))
        }));
}

// Creates missing collections with their validator, and updates the validator
// on existing ones. Only touches collections that have a file in db/validators.
async function applyValidators(db) {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    const applied = [];

    for (const { collection, validator } of loadValidators()) {
        if (!existing.has(collection)) {
            try {
                await db.createCollection(collection, { validator });
                applied.push(`${collection} (created)`);
                continue;
            } catch (err) {
                // Created meanwhile (e.g. by an index build); update it below instead.
                if (err.code !== 48 /* NamespaceExists */) throw err;
            }
        }
        await db.command({ collMod: collection, validator });
        applied.push(`${collection} (updated)`);
    }
    return applied;
}

module.exports = { loadValidators, applyValidators };
