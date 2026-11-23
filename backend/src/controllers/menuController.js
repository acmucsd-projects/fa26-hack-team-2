const menuService = require("../services/menuService");
const menuSearchService = require("../services/menuSearchService");
const { parseMenuQuery } = require("../validators/menuQuery");
const { parseMenuSearchQuery } = require("../validators/menuSearchQuery");

// GET /api/menus?location=<id>&exclude=dairy,gluten&diet=vegan&sort=protein
async function search(req, res) {
    const query = parseMenuQuery(req.query);
    res.json({ data: await menuService.search(query) });
}

// GET /api/menus/search?q=chicken&exclude=dairy&maxPriceCents=1000&limit=30&offset=0
async function searchAll(req, res) {
    const query = parseMenuSearchQuery(req.query);
    res.json({ data: await menuSearchService.search(query) });
}

module.exports = { search, searchAll };
