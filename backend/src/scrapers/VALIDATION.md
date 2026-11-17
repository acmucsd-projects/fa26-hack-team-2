# Validated HDH capture results

Inputs: local restaurant ZIP plus four earlier captures. Schema: Wes’s
`Updated_Schema_Doc.pdf`, November 13, 2026. No HTTP or database writes.

| Restaurant | Calendar date | Food records | Missing prices |
| --- | --- | ---: | ---: |
| 64-degrees | 2026-11-13 | 197 | 20 |
| 64-degrees | 2026-11-16 | 203 | 20 |
| bistro | 2026-11-16 | 34 | 0 |
| canyon-vista | 2026-11-16 | 146 | 59 |
| cecils-faculty-club | 2026-11-16 | 15 | 0 |
| club-med | 2026-11-16 | 55 | 0 |
| foodworx | 2026-11-16 | 57 | 1 |
| oceanview | 2026-11-16 | 202 | 47 |
| pines | 2026-11-13 | 188 | 26 |
| pines | 2026-11-14 | 173 | 26 |
| pines | 2026-11-16 | 188 | 26 |
| sixth-college | 2026-11-16 | 180 | 51 |
| ventanas | 2026-11-16 | 119 | 11 |

14 input captures; 13 distinct menus; 10/10 configured restaurants; 1,757 food
records. One identical Ventanas capture merged with both source paths retained.
1,233 equivalent meal occurrences merged. Zero remaining duplicate records and
zero validation errors. There are 75 warning messages (aggregated missing-data
counts, a calorie mismatch, and brunch enum mappings).

287 records have no price; zero have missing calories. There are 926 unique
nutrition pages, one saved and 925 unavailable. Three records have detailed
nutrition; 1,754 retain basic menu nutrition only. Missing prices and nutrition
are not fabricated. Only offsets 0 and 1 are represented, and offset 1 exists
only for Pines; this is not seven-day coverage.

The older 64 Degrees capture now contains 197 records rather than the baseline
193 because category variants are preserved. Pines remains 188 (November 13)
and 173 (November 14); Ventanas remains 119.

Manual source comparisons covered Bistro Fountain Soda ($3.00, 32 cal),
Canyon Vista BYO Yogurt Parfait ($8.00, 416 cal), Cecil’s Chicken Artichoke Pesto
($12.00, 1,948 cal), OceanView Everything Bagel ($2.50, 327 cal), Pines Matcha
Milk Tea Boba ($5.75, 343 cal), and Sixth Bacon ($3.75, 313 cal), including icons.
The saved Korean Fried Chicken Sandwich nutrition page reports 984 calories,
38.6 g protein and 11.6 oz serving size. Its newer menu calories disagree; the
report flags this and both source values remain in the combined dataset.

Verification commands actually run:

- `node src/scrapers/buildWebDataset.js`: success, zero errors.
- `npm run test:scrapers`: 14 tests passed with the supplied captures.
- `MONGODB_URI= npm test`: 27 tests passed; MongoDB suite disabled.
- `npm run check`: passed.
- `git diff --check`: passed.

API tests required permission to bind a local port outside the sandbox. No live
MongoDB acceptance testing was performed. The existing shared models/validators
still implement the old schema; these exports must not pass through db:import.
See README.md for the PDF mapping, artifact layout, limitations and sharing.
