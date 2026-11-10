const { Router } = require("express");
const locationController = require("../controllers/locationController");

const router = Router();

router.get("/", locationController.list);
router.get("/:id/stations", locationController.stations);

module.exports = router;
