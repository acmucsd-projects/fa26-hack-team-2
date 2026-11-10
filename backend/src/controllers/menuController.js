const menuService = require("../services/menuService");
const { parseMenuQuery } = require("../validators/menuQuery");

// GET /api/menus?location=pines&exclude=dairy,gluten&diet=vegan&sort=protein
async function search(req, res) {
    const query = parseMenuQuery(req.query);
    res.json({ data: await menuService.search(query) });
}

module.exports = { search };
