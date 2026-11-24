// Field helpers shared by the models. HT2_DB stores whole numbers:
// milligrams, tenths of a calorie, tenths of an ounce, cents.
const wholeNumber = { validator: Number.isInteger, message: "{PATH} must be a whole number" };

// Required `version` field (see SCHEMA_VERSION in constants/tags.js).
const version = { type: Number, required: true, min: 1, validate: wholeNumber };

// Optional whole number >= 0. Leave it out when unknown: HT2_DB rejects null.
const amount = { type: Number, min: 0, validate: wholeNumber };

// minimize: false keeps empty objects such as `allergens: {}` (= unknown) and
// `macros: {}`, which the HT2_DB rules require to exist.
const schemaOptions = (collection) => ({ collection, versionKey: false, minimize: false });

module.exports = { wholeNumber, version, amount, schemaOptions };
