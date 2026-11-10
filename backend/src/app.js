const express = require("express");
const apiRoutes = require("./routes");
const { notFoundRoute, errorHandler } = require("./middleware/errorHandler");

const app = express();

// Middleware to parse incoming JSON requests
app.use(express.json());

// All API endpoints (see src/routes/index.js)
app.use("/api", apiRoutes);

// Unknown /api paths get a JSON 404 instead of Express's HTML page
app.use("/api", notFoundRoute);

// Turns thrown errors into { error: { code, message } }
app.use(errorHandler);

module.exports = app;
