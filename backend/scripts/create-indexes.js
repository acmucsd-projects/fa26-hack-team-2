// Creates the indexes defined in src/models. Never drops an index, so indexes
// a teammate adds in Atlas are left alone.
//
//   npm run db:indexes
require("dotenv").config({ quiet: true });

const { connectDB, disconnectDB } = require("../src/config/db");
const models = [require("../src/models/Location"), require("../src/models/Food"), require("../src/models/MenuItem")];

async function main() {
    const connection = await connectDB();
    console.log(`Creating indexes in database "${connection.name}"`);
    try {
        for (const model of models) {
            await model.createIndexes();
            const indexes = await model.listIndexes();
            console.log(`${model.collection.name}: ${indexes.map((i) => i.name).join(", ")}`);
        }
    } finally {
        await disconnectDB();
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
