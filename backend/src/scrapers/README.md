# Offline dining menu scraper

This tool reads saved restaurant HTML and writes JSON. It makes no web requests
and does not connect to a database.

## Run

From `backend/`:

```sh
npm ci
npm run scrape:web
npm run test:scrapers
npm run check
```

Install dependencies once with `npm ci`. The build and scraper tests work offline
after that. Node 24 is tested; Python is not required.

## Files

```text
data/web/
├── raw/ucsdRestaurants/    # The 10 supplied restaurant HTML files
└── output/
    ├── web-dataset.json   # Combined data for all restaurants
    └── menus/             # One JSON file per restaurant and displayed date
```

The current inputs produce 10 menus and 1,199 food records. The old captures,
nutrition cache, database exports, reports, ZIPs and backups are no longer used.

Source HTML and generated data are Git-ignored. After cloning, get the 10 HTML
files from the project maintainer and put them in `data/web/raw/ucsdRestaurants/`.
The files must use the supplied names or `<location-id>-day0.html` through
`day6.html`. The configured IDs and filename aliases are in `buildWebDataset.js`.
Do not rename a restaurant page to another restaurant's name.

## How it works

- `buildWebDataset.js` finds saved HTML, processes all restaurants, validates the
  results and writes the combined and individual JSON files.
- `menuParser.js` extracts restaurant names, stations, categories, food names and descriptions,
  prices, calories, tags, source links, meal periods and displayed dates/hours.
- `validateMenu.js` checks food fields, dates, source URLs and duplicate records.

Equivalent foods across meal periods share one record with all their periods.
Different stations, categories, prices, calorie values or descriptions remain separate.
Descriptions keep the source text with extra whitespace removed; missing ones are `null`.
Dates and meal periods come from the HTML. The scraper does not predict future
menus or build a weekly schedule. Missing prices and calories stay `null`.
Nutrition links are saved but never opened. Only menu calories are collected;
detailed nutrition pages are not processed. Missing allergen icons do not mean
a food is allergen-free.

Validation runs on every build and prints counts, errors and warnings in the
terminal. Report files are not needed. If a capture fails, the command exits with
an error and leaves the previous output unchanged. Successful builds replace the
combined dataset and remove old generated menu files whose inputs are gone.

## Share data and change schemas

Share `output/web-dataset.json`, or the `output/` folder if individual menus are
also wanted. Share the HTML separately when someone needs to rebuild it. Commit
code, tests and this README; do not commit HTML, generated data or secrets.

The JSON is scraped source data, not a database import format. If the database
schema changes, keep this source data and add a separate conversion step with
tests for the new fields, units and references. Do not change scraped values just
to fit a schema, and do not pass this JSON to an existing importer without checking
its expected format. Backend models and importers are unchanged.

Tests compare every supplied food row against its HTML and check duplicates,
missing data, malformed pages, repeat builds and offline operation. Source-data
tests are marked skipped if the 10 HTML files are unavailable. If inputs are
replaced, review the fixed capture counts in the tests as well.
