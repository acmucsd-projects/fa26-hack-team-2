// Pushes the $jsonSchema rules in db/validators/*.json to MongoDB.
// Run after editing one of those files.
//
//   npm run db:validators
require("dotenv").config({ quiet: true });

const { connectDB, disconnectDB } = require("../src/config/db");
const { applyValidators } = require("../src/config/validators");

async function main() {
    const connection = await connectDB();
    try {
        const applied = await applyValidators(connection.db);
        console.log(`Validators in "${connection.name}": ${applied.join(", ")}`);
    } finally {
        await disconnectDB();
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
