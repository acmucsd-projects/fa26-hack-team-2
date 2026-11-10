const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseMenuQuery } = require("../src/validators/menuQuery");
const { HttpError } = require("../src/utils/httpError");

const is400 = (err) => err instanceof HttpError && err.status === 400;
const LOC = "6af0dee86b3cdcd7f87d57ee";

test("parses a full query", () => {
    assert.deepEqual(
        parseMenuQuery({ location: LOC, exclude: "dairy, Gluten,dairy", diet: "vegan", sort: "protein" }),
        { location: LOC, exclude: ["dairy", "gluten"], diet: "vegan", sort: "protein" }
    );
});

test("defaults: no filters, sort by price", () => {
    assert.deepEqual(parseMenuQuery({ location: LOC }), { location: LOC, exclude: [], diet: null, sort: "price" });
});

test("accepts repeated exclude params", () => {
    assert.deepEqual(parseMenuQuery({ location: LOC, exclude: ["dairy", "soy,eggs"] }).exclude, ["dairy", "soy", "eggs"]);
});

test("location ids are case-insensitive", () => {
    assert.equal(parseMenuQuery({ location: LOC.toUpperCase() }).location, LOC);
});

test("rejects bad input with 400", () => {
    assert.throws(() => parseMenuQuery({}), is400);
    assert.throws(() => parseMenuQuery({ location: "pines" }), is400); // a name, not an id
    assert.throws(() => parseMenuQuery({ location: LOC, exclude: "dairy,bacon" }), is400);
    assert.throws(() => parseMenuQuery({ location: LOC, exclude: "vegan" }), is400); // a diet, not an allergen
    assert.throws(() => parseMenuQuery({ location: LOC, diet: "keto" }), is400);
    assert.throws(() => parseMenuQuery({ location: LOC, sort: "calories" }), is400);
    assert.throws(() => parseMenuQuery({ location: [LOC, LOC] }), is400);
});
