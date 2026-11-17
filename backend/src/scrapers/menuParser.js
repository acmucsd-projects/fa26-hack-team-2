const cheerio = require('cheerio');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
function parseNumber(text) {
  const match = clean(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
function parseHours(text, date) {
  const m = clean(text).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m || !date) return null;
  const time = (h, min, period) => Number(h) >= 1 && Number(h) <= 12 && Number(min) < 60
    ? `${String(Number(h) % 12 + (period.toUpperCase() === 'PM' ? 12 : 0)).padStart(2, '0')}:${min}` : null;
  const open = time(m[1], m[2], m[3]), close = time(m[4], m[5], m[6]);
  return open && close ? { days: [['sun','mon','tue','wed','thu','fri','sat'][new Date(date + 'T12:00:00Z').getUTCDay()]], open, close } : null;
}
function parseMenuHtml(html, hall, dayNumber) {
  const $ = cheerio.load(html);
  const diagnostics = { rows: 0, merged_occurrences: 0, errors: [], warnings: [] };
  const heading = clean($('h2.datenow').first().text()) || $('h2').toArray().map(e => clean($(e).text())).find(t => /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),/.test(t));
  const parts = heading?.match(/^[A-Za-z]+, ([A-Za-z]+) (\d{1,2}),? (\d{4})$/);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const date = parts && months.includes(parts[1]) ? `${parts[3]}-${String(months.indexOf(parts[1])+1).padStart(2,'0')}-${parts[2].padStart(2,'0')}` : null;
  const hallName = clean($('h1').first().text());
  if (!hallName || !$('.meal-category').length) throw new Error('Unrecognized HDH menu: missing heading or meal sections');
  // Desktop and mobile are two renderings of the same data. Prefer desktop;
  // fall back only if the entire saved page has no desktop entries.
  let rows = $('.station-list > .d-none.d-lg-block > .menU-item-row');
  if (!rows.length) rows = $('.meal-category .menU-item-row');
  if (!rows.length && !/closed|no (?:menu|items)|not (?:available|serving)/i.test($('.meal-category').text())) {
    throw new Error('No food rows or explicit closed/empty-menu message; layout may have changed');
  }
  const foods = new Map();
  rows.each((index, element) => {
    diagnostics.rows++;
    const row = $(element), link = row.find('a.sublocsitem').first();
    const name = clean(link.text());
    const station = clean(row.closest('.menu-category-section').find('> .accordion-header h3').first().text());
    const category = clean(row.closest('.station-list').prev('.panel-heading').find('a.sublocs').first().text());
    const period = (row.closest('.meal-category').attr('id') || 'unknown').toLowerCase();
    let url = null;
    try { if (link.attr('href') && link.attr('href') !== '#') url = new URL(link.attr('href'), 'https://hdh-web.ucsd.edu'); } catch { /* validation reports missing URL */ }
    const price = parseNumber(row.find('.item-price').first().text());
    const item = {
      category, name, description: clean(row.find('.proI').first().text()) || null,
      price_cents: price === null ? null : Math.round(price * 100),
      calories: parseNumber(row.find('.cals').first().text()),
      tags: [...new Set(row.find('img[title]').map((_, image) => clean($(image).attr('title')).replace(/^Contains /i,'').replace(/TreeNuts/i,'Tree Nuts').toLowerCase().replace(/\s+/g,'_')).get())].sort(),
      source_item_id: url?.searchParams.get('id') || null, nutrition_url: url?.href || null,
      meal_periods: [period], prices_by_meal_period: { [period]: price === null ? null : Math.round(price * 100) }
    };
    // Include category and nutritional/price variants: the same source ID can
    // describe distinct portions. Merge only equivalent offerings across meals.
    const key = JSON.stringify([hall.id,date,station,category,name,item.nutrition_url,item.price_cents,item.calories,item.tags,item.description]);
    const existing = foods.get(key);
    if (existing) {
      diagnostics.merged_occurrences++;
      if (!existing.meal_periods.includes(period)) existing.meal_periods.push(period);
      existing.prices_by_meal_period[period] = item.price_cents;
    } else foods.set(key, { station, ...item });
  });
  const stations = new Map();
  for (const { station, ...item } of foods.values()) {
    if (!stations.has(station)) stations.set(station, { id: `${hall.id}-${station.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`, name: station, hours: null, items: [] });
    stations.get(station).items.push(item);
  }
  return { dining_hall: { id: hall.id, name: hallName, type: 'dining_hall', area: hall.area || 'unknown' }, source: 'hdh-web', menu_day: dayNumber,
    menu_date: date, menu_date_heading: heading || null, menu_date_label: clean($(`#buta${dayNumber}`).text()) || null,
    hours: parseHours($('#station-hours').text(), date), hours_text: clean($('#station-hours').text()),
    stations: [...stations.values()], diagnostics };
}
module.exports = { parseMenuHtml, parseNumber, parseHours };
