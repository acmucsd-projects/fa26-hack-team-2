// HTTP-level checks that don't need a database.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://localhost:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function get(path) {
    const res = await fetch(baseUrl + path);
    return { status: res.status, body: await res.json() };
}

test("invalid menu query returns 400 in the shared error shape", async () => {
    const { status, body } = await get("/api/menus?location=6af0dee86b3cdcd7f87d57ee&exclude=bacon");
    assert.equal(status, 400);
    assert.equal(body.error.code, "invalid_input");
    assert.match(body.error.message, /bacon/);
});

test("unknown /api route returns JSON 404", async () => {
    const { status, body } = await get("/api/nope");
    assert.equal(status, 404);
    assert.equal(body.error.code, "not_found");
});

test("health returns 503 when MongoDB is not connected", async () => {
    const { status, body } = await get("/api/health");
    assert.equal(status, 503);
    assert.equal(body.error.code, "db_unavailable");
});

test("malformed JSON body returns 400", async () => {
    const res = await fetch(baseUrl + "/api/menus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json"
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "invalid_json");
});
