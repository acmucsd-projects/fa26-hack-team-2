const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseMenuSearchQuery } = require("../src/validators/menuSearchQuery");
const { HttpError } = require("../src/utils/httpError");

const is400 = (err) => err instanceof HttpError && err.status === 400;
const LOC = "6af0dee86b3cdcd7f87d57ee";

test("every parameter is optional", () => {
    assert.deepEqual(parseMenuSearchQuery({}), {
        keywords: [], location: null, station: null, exclude: [], diet: null, beverage: null,
        maxPriceCents: null, maxCalories: null, sort: "relevance", limit: 30, offset: 0
    });
});

test("q is split into lowercase keywords without repeats", () => {
    assert.deepEqual(parseMenuSearchQuery({ q: "  Chicken   BOWL chicken " }).keywords, ["chicken", "bowl"]);
});

test("parses a full query", () => {
    assert.deepEqual(
        parseMenuSearchQuery({
            q: "tofu", location: LOC, station: LOC, exclude: "dairy,soy", diet: "vegan", beverage: "false",
            maxPriceCents: "1000", maxCalories: "700", sort: "price", limit: "10", offset: "20"
        }),
        {
            keywords: ["tofu"], location: LOC, station: LOC, exclude: ["dairy", "soy"], diet: "vegan", beverage: false,
            maxPriceCents: 1000, maxCalories: 700, sort: "price", limit: 10, offset: 20
        }
    );
});

test("rejects bad input with 400", () => {
    assert.throws(() => parseMenuSearchQuery({ location: "pines" }), is400);
    assert.throws(() => parseMenuSearchQuery({ station: "grill" }), is400);
    assert.throws(() => parseMenuSearchQuery({ exclude: "bacon" }), is400);
    assert.throws(() => parseMenuSearchQuery({ beverage: "yes" }), is400);
    assert.throws(() => parseMenuSearchQuery({ maxPriceCents: "9.99" }), is400);
    assert.throws(() => parseMenuSearchQuery({ maxCalories: "-5" }), is400);
    assert.throws(() => parseMenuSearchQuery({ sort: "cheapest" }), is400);
    assert.throws(() => parseMenuSearchQuery({ limit: "0" }), is400);
    assert.throws(() => parseMenuSearchQuery({ limit: "101" }), is400);
    assert.throws(() => parseMenuSearchQuery({ q: "a".repeat(101) }), is400);
    assert.throws(() => parseMenuSearchQuery({ q: "one two three four five six seven" }), is400);
    assert.throws(() => parseMenuSearchQuery({ q: ["a", "b"] }), is400);
});
