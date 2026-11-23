# Dining menus and cached nutrition

This tool reads saved restaurant HTML, adds locally cached nutrition and writes
JSON. The offline build never downloads pages or connects to MongoDB.

## Setup and commands

From `backend/`, run `npm ci` once (Node 24 tested). After cloning, get the 10 saved
restaurant HTML files from the project maintainer and put them in
`data/web/raw/ucsdRestaurants/`. Keep their supplied names. Other captures can use
`<location-id>-day0.html` through `day6.html`; IDs/aliases are in `buildWebDataset.js`.
Source files and generated data are Git-ignored and must be shared separately.

```sh
npm run scrape:web        # Rebuild JSON offline, using any existing cache
npm run scrape:nutrition  # Download missing pages, only when authorized
npm run scrape:web        # Include the new cache in the JSON
npm run test:scrapers     # Menu AND nutrition tests; no real nutrition requests
npm run check
```

The supplied menus contain 10 restaurants, 1,199 foods and 2,037 food occurrences.
838 equivalent occurrences merge across meals. Names, descriptions, prices, tags,
stations, source links, dates and all meal memberships remain intact. Dates come
from the HTML; the tool does not predict a weekly menu. Missing prices stay null.

## Permission before downloading

**Bulk collection is blocked until explicit site permission is documented.**
Public access or a missing robots.txt does not establish permission. The reviewed
[site terms](https://ucsd.edu/about/terms-of-use.html) restrict reuse beyond a
personal-use exception. Obtain permission for the intended collection and use;
creating the following file does not itself grant permission.

After permission is obtained, save `data/web/nutrition-cache/access.json`:

```json
{
  "bulk_download_allowed": true,
  "origin": "https://hdh-web.ucsd.edu",
  "path": "/dining/apps/diningservices/Nutrition/Nutritionfacts2",
  "permission_reference": "Replace with the actual permission reference",
  "reviewed_at": "Replace with an ISO timestamp"
}
```

Replace both placeholders with real information. No permission is provided with
the repository. Without valid documentation the downloader makes no requests and
exits with a blocker. When authorized, it checks current robots rules and terms,
uses one request at a time with at least two seconds between requests, and bounds
retries/timeouts. It respects Retry-After and stops for access challenges,
redirects, 403 or repeated 429 responses. It never bypasses restrictions or runs
when the backend starts.

Record any approval-specific conditions too. `minimum_delay_ms` can require a
slower rate; `stop_on_technical_issues: true` stops on the first technical failure.
For one-time collection, use `one_time_collection: true` with the sorted canonical
URL list's SHA-256 in `approved_url_set_sha256`, and `allow_refresh: false` unless
refreshing is separately approved. Changed URL sets then need a new scope review.
Keep all HTML and outputs private when the approval prohibits public redistribution.

## Download once; reuse until explicit refresh

URLs come only from the saved menus, not guessed IDs. Equivalent URLs are requested
once; both item and recipe parameters are preserved, including empty recipe IDs.
Each URL has a deterministic, hashed `.html` file and `.json` metadata containing
its URL, retrieval time and checksum. Interrupted complete writes are recovered.
`download-state.json` records successes, failures, access blockers and retry times.

Default runs skip **every intact cached response**, even if the parser does not
yet recognize it. Improving the parser needs only another offline build. With all
879 URLs cached, the download command makes zero requests, including policy
requests. If new URLs appear, only missing pages are downloaded. Rerun the command
to resume unsuccessful downloads after restrictions clear. Corrupt or missing
previously completed caches produce an error and require explicit refresh:

```sh
npm run scrape:nutrition -- --refresh-url 'EXACT_URL_FROM_A_SAVED_MENU'
npm run scrape:nutrition -- --refresh   # Intentionally replace ALL cached pages
```

Refresh requires the same site permission and access checks. A failed refresh
keeps the previous intact cache. Do not run two collection commands at once.
For an older local setup, rename `nutrition/` to `nutrition-cache/` once, keeping
HTML and metadata together; this workspace has already been migrated.

## Files and data handling

```text
data/web/
├── raw/ucsdRestaurants/    # Original menu HTML
├── nutrition-cache/       # Nutrition HTML, metadata and download state
└── output/
    ├── web-dataset.json   # Original fields plus raw nutrition and verification
    ├── menus/             # Individual enriched menus
    ├── nutrition-coverage.json
    └── mongodb/YYYY-MM-DD/ # Foods, Locations, Menu_Items and provenance JSON
```

`menuParser.js` reads menus; `nutritionParser.js` parses/matches cached pages;
`nutritionDownloader.js` collects missing pages; `databaseTransform.js` handles
schema exports; `validateMenu.js` checks menus; `buildWebDataset.js` runs the offline
pipeline. Tests use compact HTML and mocked requests. Real-menu tests explicitly
skip when the ignored inputs are unavailable; fixture tests still run.

Nutrition targets calories, fat calories, protein, carbs, total/saturated/trans
fat, fiber, sugar, sodium, cholesterol, serving size, full ingredients and explicit
allergen/diet labels. Original quantities, units and text stay in the raw data.
Ingredients with nested commas remain one statement. Missing nutrients are never
changed to zero; absent allergen icons do not prove allergen absence.

Menu calories always win for that captured date. Conflicting snapshots stay in
raw JSON but contribute no detailed nutrients, ingredients or labels to exports.
Matching calories do not prove the snapshot matches the original menu date.
Coverage lists each macro, sodium, ingredients, cached/downloaded/failed/not-attempted
pages, parser gaps, conflicts and withheld export records with reasons.

## Schema changes and sharing

Exports use stable ObjectIds in Extended JSON, version 1, cents for price, tenths
of a calorie for calories/fat calories, milligrams for nutrient masses, and tenths
of an ounce for serving size. Only known units are converted; original decimals
remain available. Unknown optional numeric fields are omitted, unknown diet flags
are null, unknown allergens form an empty object, and `nutrition.macros` exists.
Every food gets a Boolean beverage flag. Explicit categories take priority;
names, descriptions and drink stations support conservative inference. Food forms
such as cake, soup and pudding prevent drink-keyword mistakes. Drinkable shakes
can appear under Desserts. Unresolved or conflicting evidence defaults to false.
Classification source, rule and review status stay in `provenance.json`, outside
Foods. `nutrition-coverage.json` includes counts and the manual review list under
`beverage_classification`. Review defaults before using them as confirmed labels.
Snapshots stay separate because Menu_Items has no calendar-date field.

If the schema changes, update the transformation and its tests, not scraped values.
Existing models/importers use an older format: do not run `db:import` on these
exports. Share the dataset and coverage report, subject to site permission; share
HTML/cache separately for rebuilding. Commit code/tests/this guide, not generated
outputs, cached HTML, permission documents or secrets. No database writes, commits,
PR creation or pushes are performed by these commands.
