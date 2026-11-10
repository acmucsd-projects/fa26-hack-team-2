const { Router } = require("express");
const menuController = require("../controllers/menuController");

const router = Router();

router.get("/", menuController.search);

module.exports = router;
