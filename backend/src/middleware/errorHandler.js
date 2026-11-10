const mongoose = require("mongoose");
const { HttpError } = require("../utils/httpError");

function sendError(res, status, code, message) {
    res.status(status).json({ error: { code, message } });
}

// Any /api path that no router handled.
function notFoundRoute(req, res) {
    sendError(res, 404, "not_found", `No route for ${req.method} ${req.originalUrl}`);
}

// Express 5 forwards errors thrown in async handlers here automatically.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (err instanceof HttpError) {
        return sendError(res, err.status, err.code, err.message);
    }
    if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError) {
        return sendError(res, 400, "invalid_input", err.message);
    }
    if (err.type === "entity.parse.failed") {
        return sendError(res, 400, "invalid_json", "Request body is not valid JSON");
    }

    console.error(err);
    sendError(res, 500, "internal", "Something went wrong");
}

module.exports = { notFoundRoute, errorHandler };
