const express = require("express");

const app = express();

// Middleware to parse incoming JSON requests
app.use(express.json());

// Basic health check endpoint
app.get("/api/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "ucsd-budget-backend"
    });
});

module.exports = app;