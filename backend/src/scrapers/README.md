# Offline HDH menu dataset

From `backend/`:

```sh
npm run scrape:web
npm run test:scrapers
# Equivalent build entry point:
node src/scrapers/buildWebDataset.js
```

Requires Node (tested on 24.21.0), installed backend dependencies, and Python 3
(standard library only, used to safely open ZIP files). No browser, HTTP client,
MongoDB connection, credentials, scheduling, or network collection is used.

## Inputs and outputs

All local data lives in the Git-ignored `backend/data/web/` directory:

- `inputs/ucsdRestaurants.zip`: original ZIP; never changed.
- `inputs/Updated_Schema_Doc.pdf`: Wes's authoritative schema; never changed.
- `inputs/extracted/ucsdRestaurants/`: safe ZIP extraction. Traversal, symlinks,
  oversized/unexpected files and overwrites of differing captures are rejected.
  Apple `__MACOSX` metadata is skipped. Repeated extraction is idempotent.
- `raw/`: previously saved menus. Keep new captures here as
  `<configured-id>-day0.html` through `day6.html`. For multiple captures with the
  same name, use separate subdirectories. The displayed date is authoritative;
  day offsets are relative to capture time, not weekdays.
- `nutrition/`: saved nutrition pages, named `<id>.html` or
  `<id>-<URL-encoded-recId>.html`. `reports/nutrition-manifest.json` lists exact
  filenames and missing pages. No pages are fetched automatically.
- `output/menus/<location>-YYYY-MM-DD.json`: individual normalized menus.
- `web-dataset.json`: combined dated menus, preserving source URLs, categories,
  meal periods, per-period prices, raw nutrition and source file paths.
- `output/mongodb/YYYY-MM-DD/{Locations,Foods,Menu_Items}.json`: independent
  collection snapshots in MongoDB Extended JSON (`{"$oid":"…"}` references).
- `output/mongodb/YYYY-MM-DD/provenance.json`: source/menu/date metadata kept
  outside the schema collections.
- `reports/validation-report.json`: errors, warnings, missing fields, duplicates,
  every input's stations/dates, restaurant/day coverage and schema checks.
- `reports/output-manifest.json`: current menus/dates; use this instead of
  blindly importing every old file in an output directory.
- `reports/legacy/`: previous preview, checklist, manifest and old generated menus,
  preserved rather than deleted. `unused/` captures remain untouched and are
  intentionally excluded until explicitly moved into `raw/`.

`backend/data/halls/pines.json` and the mobile importer are unchanged.
Builds read only current HTML inputs, so stale generated JSON never enters the
combined dataset. Errors are reported per capture, other valid captures still
build, and the command exits nonzero if any capture/schema errors occur. Such a
partial dataset must not be treated as complete.

## Parsing and deduplication

The parser prefers the desktop layout to avoid mobile/desktop duplication; it
falls back to all meal item rows for mobile-only saved pages. Explicit closed
menus produce an empty menu. Unrecognized pages/layouts fail visibly.

Identity includes restaurant, actual date, station, category, food name, source
recipe URL, price, calories and tags. Equivalent offerings across meal periods
merge while retaining each period and price. Different portions, stations,
prices, dates or restaurants survive. Identical captures of the same restaurant
and date merge source paths; conflicting captures produce an error. Missing
names/IDs/URLs are retained by parsing and rejected by validation, never silently
skipped. Missing prices/calories/nutrition are warnings, never invented zeros.

## Wes's PDF versus the existing backend

The PDF dated November 13, 2026 differs from the current Mongoose models and
MongoDB validator files. **Do not feed these exports to `npm run db:import`.**
That importer targets mobile screenshot data, uses dollar prices and older
nutrition units, and would lose metadata. Migrating the shared models, validators,
API conversions and importer requires separate coordinated work with the team.
No database writes or migration are performed here.

The export follows PDF pages 1 and 3–5:

- All collection documents have integer `version: 1` and deterministic ObjectIds.
- Price is integer cents; missing price is omitted.
- Calories and fat calories are multiplied by 10; serving ounces by 10.
- Protein, carbohydrates, fat, saturated fat, trans fat, fiber and sugar in grams
  are multiplied by 1,000. Sodium/cholesterol already use milligrams.
- Values are rounded to the nearest integer after conversion (e.g. 2,784.5 mg
  sodium becomes 2,785). Original decimal values remain in the combined dataset.
- Unknown optional nutrition fields are omitted; `nutrition.macros` always exists.
- Unreported diet/program flags are `null`; only observed allergen icons are
  `true`, with no inferred `false` values. Empty allergens means unknown.
- Full saved ingredients text is retained as one string in `ingredients` rather
  than splitting nested recipe ingredient lists incorrectly.
- `Lunch_Dinner` maps to `lunch/dinner`, `Late_Night` to `late-night`.
  `Brunch` maps to `unknown` with a warning because the PDF has no brunch enum;
  provenance preserves the original period.
- Location hours apply only to the captured date's weekday. Missing required hours
  withholds that location and its offerings from database output and reports why.
  Areas unsupported by existing project data are `unknown`; geodata is `{}`.
- Independent snapshots preserve dates because `Menu_Items` has no date field.
  Do not combine all dates into one active menu collection without a team policy.
- References and integer/required/enum constraints are checked locally against the
  PDF contract, not against the outdated models. No live MongoDB acceptance test
  has been performed.

## Tests and sharing

`test/scrapers.test.js` exercises all supplied captures, row-by-row source
comparison, date preservation, duplicates/variants, malformed/empty menus, missing
fields, unit conversions, schema references, missing hours, ZIP safety, offline
operation and deterministic rebuilds. Real input integration tests explicitly
skip when the ignored ZIP isn't available; pure fixture tests still run.

To run the whole backend suite without database writes, use
`MONGODB_URI= npm test`. The database suite is disabled; API tests open a local port.

Keep raw HTML, the ZIP/PDF inputs and generated artifacts out of Git. Share the
validated dataset and reports as a separate team artifact (for example a ZIP in
the team's chosen shared drive), along with the code commit SHA. Include
`web-dataset.json`, the current menu/database outputs and reports; exclude raw
HTML, `inputs/`, `nutrition/`, `reports/legacy/`, `.env` and `unused/`. A local
`output/hdh-web-validated.zip` is provided for this build. Rebuild/repackage when
inputs change. This task does not upload or publish the artifact.
