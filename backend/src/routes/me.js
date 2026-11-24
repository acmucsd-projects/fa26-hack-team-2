const { Router } = require("express");
const meController = require("../controllers/meController");
const { requireUser } = require("../middleware/requireUser");

// Signed-in only. The user always comes from the session cookie.
const router = Router();
router.use(requireUser);

router.get("/", meController.profile);
router.patch("/", meController.updateProfile);
router.get("/log", meController.log);
router.post("/log/:date/meals", meController.addMeal);
router.patch("/log/:date/meals/:mealId", meController.changeMeal);
router.delete("/log/:date/meals/:mealId", meController.removeMeal);
router.get("/week", meController.week);

module.exports = router;
