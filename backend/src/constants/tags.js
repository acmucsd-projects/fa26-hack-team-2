// Tags follow the official HDH icon legend.
// Allergen filters exclude items; diet filters keep only matching items.
const ALLERGENS = ["dairy", "eggs", "fish", "shellfish", "tree_nuts", "peanuts", "soy", "wheat", "sesame", "gluten"];
const DIETS = ["vegan", "vegetarian"];
const PROGRAMS = ["wellness", "sustainability"];
const TAGS = [...ALLERGENS, ...DIETS, ...PROGRAMS];

// API allergen name -> field name in Foods.allergens (HT2_DB spells it "shell_fish").
const DB_ALLERGEN = Object.fromEntries(ALLERGENS.map((a) => [a, a === "shellfish" ? "shell_fish" : a]));

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// HT2_DB enums
const LOCATION_TYPES = ["dining hall", "cafe", "market", "other"];
const MEAL_PERIODS = ["breakfast", "lunch", "dinner", "all", "unknown"];

module.exports = { ALLERGENS, DIETS, PROGRAMS, TAGS, DB_ALLERGEN, DAYS, LOCATION_TYPES, MEAL_PERIODS };
