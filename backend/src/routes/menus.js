const { Router } = require("express");
const menuController = require("../controllers/menuController");

const router = Router();

router.get("/", menuController.search);
router.get("/search", menuController.searchAll);

module.exports = router;
