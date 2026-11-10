const { pingDB } = require("../config/db");

// GET /api/health — 200 when the server and MongoDB are both reachable.
async function health(req, res) {
    if (!(await pingDB())) {
        return res.status(503).json({
            error: { code: "db_unavailable", message: "Cannot reach MongoDB" }
        });
    }

    res.status(200).json({
        data: { status: "ok", service: "ucsd-budget-backend", db: "connected" }
    });
}

module.exports = { health };
