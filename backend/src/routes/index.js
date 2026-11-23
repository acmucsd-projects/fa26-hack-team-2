const { Router } = require("express");
const { health } = require("../controllers/healthController");

// Everything here is mounted under /api in app.js.
// Routes stay thin: validate input, call one service, return JSON.
const router = Router();

router.get("/health", health);
router.use("/locations", require("./locations"));
router.use("/menus", require("./menus"));
router.use("/auth", require("./auth"));
router.use("/me", require("./me"));

module.exports = router;
