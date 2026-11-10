const mongoose = require("mongoose");

// Connect once at startup. Mongoose keeps one connection pool and reuses it
// for every request.
async function connectDB({ uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB } = {}) {
    if (!uri) {
        throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");
    }

    await mongoose.connect(uri, {
        dbName: dbName || "HT2_DB",
        // Build indexes automatically while developing. In production, run
        // `npm run db:indexes` instead so startup never blocks on index builds.
        autoIndex: process.env.NODE_ENV !== "production",
        // Never let Mongoose create collections: they must be created with
        // their $jsonSchema validator (`npm run db:validators`).
        autoCreate: false,
        serverSelectionTimeoutMS: 10000
    });

    return mongoose.connection;
}

function disconnectDB() {
    return mongoose.disconnect();
}

// True when MongoDB answers a ping. Used by GET /api/health.
async function pingDB() {
    if (mongoose.connection.readyState !== 1) return false;
    try {
        await mongoose.connection.db.admin().ping();
        return true;
    } catch {
        return false;
    }
}

module.exports = { connectDB, disconnectDB, pingDB };
