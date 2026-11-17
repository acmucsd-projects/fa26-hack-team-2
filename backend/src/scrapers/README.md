# Offline HDH scraper

Reads saved HTML only. It never fetches web pages, schedules collection, connects
to MongoDB, or changes mobile data in `data/halls/`.

From `backend/` (Node 24 tested, backend dependencies installed, Python 3 required
for standard-library ZIP handling):

```sh
npm run scrape:web
npm run test:scrapers
```

The build produces the combined dataset at **`data/web/output/web-dataset.json`**
and refreshes **`data/web/exports/hdh-web-validated.zip`** after a successful run.
If validation errors occur, the command exits nonzero and creates no new export.
Never share a previous ZIP as the result of a failed build.

## Source files

| File in `src/scrapers/` | Responsibility |
| --- | --- |
| `buildWebDataset.js` | Main entry point: read captures, enrich, validate, save and package |
| `menuParser.js` | Parse dates, restaurant hours, stations, food fields and meal periods; merge equivalent offerings |
| `nutritionParser.js` | Read nutrition HTML, check cache filenames, detect conflicts and decide which snapshot is usable |
| `databaseTransform.js` | Convert to Wes's units/collections and validate references and schema constraints locally |
| `validateMenu.js` | Validate parsed menus; count errors, warnings and missing information |
| `localFiles.js` | Safely extract ZIP inputs, discover restaurant HTML and package an explicit list of generated files |

Tests are in `test/scrapers.test.js`. This README is the only scraper guide;
validation results belong in the generated report rather than a static document.

## Data folders

Everything below `backend/data/web/` is local and Git-ignored:

```text
inputs/                     Original restaurant ZIP and Wes's schema PDF
raw/                        Active saved restaurant HTML (includes ucsdRestaurants/ from ZIP)
nutrition/                  Saved detailed nutrition HTML
output/
  web-dataset.json           Combined dataset with raw nutrition and conflict audit fields
  menus/                    One JSON per restaurant and actual calendar date
  mongodb/YYYY-MM-DD/       Foods, Locations, Menu_Items and provenance JSON
reports/                    Validation, nutrition-cache and current-output manifests
exports/                    Current shareable ZIP
```

**Inputs:** `inputs/ucsdRestaurants.zip`, `inputs/Updated_Schema_Doc.pdf`, `raw/`,
and `nutrition/`. All originals are preserved. ZIP extraction rejects unsafe
paths, symlinks, oversized files and overwrites of differing HTML; Apple metadata
is skipped. It writes under `raw/ucsdRestaurants/` without duplicating an existing
identical extraction. The scraper scans only `raw/`.

Name new restaurant captures `<location-id>-day0.html` through `day6.html`.
Use subfolders to keep distinct captures with the same filename. The displayed
calendar date is authoritative: `day0` is relative to capture time, not a weekday.
Nutrition files use `<id>.html` or `<id>-<URL-encoded-recId>.html`;
`reports/nutrition-manifest.json` gives exact filenames and missing pages.

**Generated files:** everything in `output/`, `reports/` and `exports/`.
`reports/output-manifest.json` lists the files from the current build; older JSON
files are never used as build inputs. Share only a successful build's ZIP.
Historical outputs, old previews, unused HTML and code backups are preserved outside
the active data directory in `backend/data/web-backups/hdh-scraper-before-final-cleanup/`.
That folder is Git-ignored and never read by the build. Its existing `inventory.json`
retains the historical move paths and hashes; entries under `backend/data/web/archive/`
now live under that backup folder. No original backup contents were deleted or changed.
The duplicate Ventanas HTML stays active so both source paths remain traceable.

## Reproduce after cloning

Offline inputs are intentionally not in Git. Obtain an input bundle from the branch
maintainer through the team's file-sharing service and copy these files into
`backend/data/web/`, preserving their paths:

```text
inputs/ucsdRestaurants.zip
inputs/Updated_Schema_Doc.pdf
raw/64-degrees-day0.html
raw/pines-day0.html
raw/pines-day1.html
raw/ventanas-day0.html
nutrition/6352.html
```

Then run `npm ci`, `npm run scrape:web`, `npm run test:scrapers` and `npm run check`
from `backend/`. The build regenerates `raw/ucsdRestaurants/` from the ZIP; those
10 extracted files need not be distributed separately. Keep the original ZIP as
the rebuilding source and the extraction as active parser input. The four other
HTML files preserve earlier captures and duplicate provenance; the ZIP alone does
not reproduce all 13 menus. The generated dataset ZIP excludes source inputs, so
request the input bundle separately when rebuilding. No historical backup is needed.

## Calories and nutrition conflicts

Menu calories always take precedence for that menu date. If a saved nutrition
snapshot disagrees, the raw snapshot stays intact in `item.nutrition`, its status
becomes `unverified`, and `nutrition_audit` records both calorie values, menu date,
snapshot file and policy. **None of that snapshot's nutrients or ingredients are
exported to MongoDB for the conflicting record.** Only the menu calories remain;
unknown optional nutrient fields are omitted, never fabricated.

For Pines / Street Eats / Korean Fried Chicken Sandwich (source ID 6352),
November 16 uses **875 calories → 8750 tenths of a calorie**. The retained snapshot
says 984. November 13–14 still use 984 → 9840 and retain their matching details.
The policy applies to every item, not just this sandwich. Agreement alone does
not establish a snapshot's capture date; it means no known calorie conflict.

## Deduplication and validation

Equivalent entries merge across meal periods while retaining every period and
its price. Identity includes restaurant, calendar date, station, category, food
name, source recipe URL, price, calories and tags. Different portions, stations,
prices or dates survive. Identical same-date captures combine source paths;
conflicting captures fail visibly. Explicit closed menus may be empty; malformed
pages are reported, not silently skipped.

The current supplied captures yield **10 locations, 13 dated menus and 1,757 food
records**, accounting for **2,990 occurrences = 1,757 records + 1,233 merges**.
One identical Ventanas capture contributes another 209 duplicate source rows.
The report records all coverage, failures, missing fields and merge counts.

Known limitations: 287 records have no price; 925 of 926 nutrition pages are not
saved. There are 1,754 records without detailed nutrition, two with matching
snapshots and one with an unverified snapshot. No missing prices/nutrients are
invented. Only captured dates are covered, not a full week at every restaurant.
Absent allergen icons never prove allergen absence.

## Wes's schema and team sharing

The authoritative PDF (November 13, 2026, pages 1 and 3–5) differs from the current
backend models and validators. **Do not run `db:import` on these exports.** Shared
models, API units and importing still need coordinated alignment with the team.
No live MongoDB acceptance test or database migration is performed here.

The export uses `version: 1` and deterministic ObjectIds in Extended JSON.
Prices are cents; calories/fat calories are tenths of a calorie; serving size is
tenths of an ounce. Gram nutrient masses become milligrams; sodium/cholesterol
already use milligrams. Values round to the nearest integer after conversion;
original decimals remain in the combined dataset. Unknown nutrition is omitted,
`nutrition.macros` always exists, and unknown diet/program flags are `null`.
Only observed allergens are marked `true`. Full ingredient text is kept as one
string instead of incorrectly splitting nested recipes.

`Lunch_Dinner` maps to `lunch/dinner`, `Late_Night` to `late-night`, and `Brunch`
to `unknown` with a warning because the PDF lacks a brunch enum. Provenance keeps
the original meal period. Location hours apply only to the captured weekday;
unknown required hours withhold that location from database exports. Unsupported
areas are `unknown`, and geodata is `{}`. Date snapshots must stay separate because
`Menu_Items` has no calendar-date field.

Commit scraper code, tests, npm script changes and this README. Do not commit raw
HTML, nutrition HTML, ZIPs, PDFs, `.env`, archives or generated datasets. Share
`exports/hdh-web-validated.zip` through the team's chosen file service, alongside
the code commit hash. It contains current JSON outputs, reports and this guide;
raw inputs, archives and secrets are excluded. Rebuilding refreshes it automatically.

Tests cover every supplied HTML file, source-field preservation, deduplication,
malformed/missing data, conflicts on arbitrary foods, units, references, safe ZIP
handling, archive exclusion and offline builds with network entry points blocked.
Real-input tests explicitly skip if the ignored source ZIP is not supplied.
