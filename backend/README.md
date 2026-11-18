# Backend

Express 5 + MongoDB (Mongoose), using the team's `HT2_DB` database. Serves the API under `/api` on port 3001.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `MONGODB_URI` to the Atlas connection string (Atlas → Connect → Drivers). In Atlas → Network Access, allow your current IP.
3. Start the server with `npm run dev`, then open http://localhost:3001/api/health.

`HT2_DB` on the shared cluster already has its validators, indexes and menu data. On a new, empty database, run these first:

```bash
npm run db:validators
npm run db:indexes
npm run db:import
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with auto-restart on file changes |
| `npm test` | Run tests. Database tests use separate `HT2_DB_test` and `HT2_DB_test_accounts` databases (wiped each run) and are skipped if `MONGODB_URI` isn't set |
| `npm run db:validators` | Push the `$jsonSchema` rules in `db/validators/*.json` to MongoDB. **This overwrites the rules in the database**, so only run it when the files are the newest version |
| `npm run db:indexes` | Create the indexes in the schema doc (never drops any) |
| `npm run db:import` | Import every `.json` file in `data/halls`, including subfolders. Pass a file or folder to import just that (`npm run db:import -- data/halls/mobile`). Safe to re-run |
| `npm run check` | Syntax-check and load the app |

## Database (`HT2_DB`)

Follows the team's schema doc of November 13, 2026.

| Collection | One document per | Used by the backend |
| --- | --- | --- |
| `Locations` | Dining hall, cafe or market, with its stations and one set of opening hours | Yes |
| `Foods` | Food or drink, with nutrition, allergens and diet flags | Yes |
| `Menu_Items` | A food offered at a location/station, with its price | Yes |
| `Users` | A student account: name, email, hashed password, nutrition and budget goals | Yes |
| `Food_Logs` | Everything one student logged, by date, with each day's totals | Yes |

Conventions:

- Every document has `version` (currently `1`).
- **Whole numbers only.** Money is cents. Calories (`calorie`, `fat_cal`) are tenths of a calorie, so 965 cal is `9650`. Serving size is tenths of an ounce. All other nutrition values are milligrams.
- **Unknown values.** A nutrition number is left out (never `null` or `0`). `wellness`, `vegetarian`, `vegan` and `sustainability` are `null`. `allergens` is an empty object.
- **Unknown hours.** The rules require `hours` on every location, so unknown hours are stored as `{ "days": [], "open": "00:00", "close": "00:00" }`. The API returns `hours: null` for these.
- **Logged meals carry two extra fields** (the rules allow them; they're not in the schema doc yet): `meal_id`, a stable id for editing and removing, and `snapshot`, the price and nutrition of one serving when it was logged. The snapshot keeps past days unchanged when menus or prices change, and lets each day's `totals` be recomputed from its meals in the same update. Totals count unknown nutrition as 0; the API reports how many meals were unknown.
- **Passwords** are hashed with scrypt (`src/auth/password.js`) and never returned by the API.

`db/validators/*.json` holds the MongoDB-side rules for all five collections. MongoDB rejects any write that breaks them. When the schema changes in Atlas, update these files in the same pull request so the repo and the database stay in step.

## API

Success: `{ data }`. Failure: `{ error: { code, message } }` with 400 (bad input), 404 (not found), 503 (database down) or 500.

The API uses camelCase, prices in integer cents, calories, grams and ounces. `src/services/dto.js` converts from the database's units. Unknown values are `null`.

| Method | Route | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ status, service, db }` after pinging MongoDB |
| GET | `/api/locations` | `[{ id, name, type, area, geo, hours, isOpenNow, stationCount, itemCount }]`. `hours` is `{ days, open, close }` or `null`. `isOpenNow` is `true`, `false`, or `null` when the hours are unknown |
| GET | `/api/locations/:id/stations` | `[{ id, name, itemCount }]` |
| GET | `/api/menus?location=<id>&exclude=dairy,gluten&diet=vegan&sort=protein` | Every menu item at one location, with `priceCents`, `stationName`, `allergens`, `allergensKnown`, diet flags and `nutrition` |
| GET | `/api/menus/search?q=chicken bowl&maxPriceCents=1000&limit=30` | `{ items, total, limit, offset }`: keyword search and browsing across every location, one page at a time. Items have the same fields as `/api/menus` plus `locationName` |

`/api/menus` parameters:
- `location` (required): an `id` from `/api/locations`.
- `exclude`: allergens to remove (`dairy, eggs, fish, shellfish, tree_nuts, peanuts, soy, wheat, sesame, gluten`). Items whose allergens are unknown are also removed.
- `diet`: `vegan` or `vegetarian`. Vegetarian includes vegan items. Items whose diet is unknown are removed.
- `sort`: `price` (default), `protein` or `name`.

`/api/menus/search` parameters (all optional; with none it lists everything):
- `q`: up to 6 keywords. Every keyword must appear in the food's name, its station's name or its location's name, so `pines burger` finds burgers at Pines. Upper/lower case and order don't matter.
- `location`, `station`: ids, to stay inside one location or station.
- `exclude`, `diet`: as for `/api/menus`.
- `beverage`: `true` for drinks only, `false` for food only.
- `maxPriceCents`, `maxCalories`: whole numbers. Items with unknown calories never pass a calorie limit.
- `sort`: `relevance` (default: matches in the food's name first), `price`, `name`, `calories` or `protein`. Unknown values sort last.
- `limit` (default 30, at most 100) and `offset`, for paging. `total` is the number of matches across all pages.

In a menu item, `allergensKnown: false` means the `allergens` list is empty because we don't know, not because the food is allergen-free.

### Accounts and the food log

Signing in sets an httpOnly cookie (`ht2_session`, 7 days). Every `/api/me` route uses the signed-in user from that cookie, never an id in the request, and answers 401 without it. Errors add 401 (not signed in, or wrong email/password) and 409 (email already registered).

| Method | Route | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ name, email, password, phone? }` | 201, the user, signed in. Password 8–200 characters; phone like `+1 (858) 555-0123` |
| POST | `/api/auth/login` | `{ email, password }` | the user, signed in |
| POST | `/api/auth/logout` | | `{ signedOut: true }`, cookie cleared |
| GET | `/api/me` | | `{ id, name, email, phone, goals, budget, balanceCents }` |
| PATCH | `/api/me` | any of `name`, `phone`, `goals`, `budget`, `balanceCents` | the updated user. `null` clears an optional value |
| GET | `/api/me/log?from=&to=` | | one entry per date (default today on campus, at most 62 days): `{ date, totals, unknown, meals }` |
| POST | `/api/me/log/:date/meals` | `{ menuItemId, servings? }` | 201, `{ mealId, day }` |
| PATCH | `/api/me/log/:date/meals/:mealId` | `{ servings }` | the updated day |
| DELETE | `/api/me/log/:date/meals/:mealId` | | the updated day (a day with no meals left is removed) |
| GET | `/api/me/week?start=` | | 7 days from `start` (default this week's Sunday): calories, spending and percent of goal per day, plus the week's totals |

- `goals`: `{ calories, proteinG, carbsG, fatG }`, each `{ min, max }`. `budget`: `{ dailyCents, weeklyCents, monthlyCents, yearlyCents }`. New accounts start with 2,200 cal, 110 g protein, 275 g carbs, 70 g fat, and $20 a day / $140 a week.
- A day's `totals` are `{ calories, proteinG, carbsG, fatG, spentCents }`. `unknown` counts meals whose calories, macros or price aren't known, since those are left out of the totals.
- Each meal: `{ id, menuItemId, foodId, name, locationName, stationName, servings, loggedAt, priceCents, calories, proteinG, carbsG, fatG }`, with price and nutrition for the servings logged.
- Dates are `YYYY-MM-DD`. "Today" and "this week" use campus (Pacific) time.
- Only menu items can be logged for now; the schema requires `menu_item_id`, so "enter a meal manually" needs a schema change.

## Layout

```
src/
  server.js           connects to MongoDB, then starts listening
  app.js              Express app: JSON parsing, /api routes, error handling
  config/db.js        Mongoose connection
  config/validators.js applies db/validators to MongoDB
  models/             Mongoose models for Locations, Foods, Menu_Items, Users, Food_Logs
  routes/             URL → controller
  controllers/        read req, call one service, send { data }
  validators/         check query params and bodies, throw 400s
  services/           business logic (filters, isOpenNow, accounts, food log) and dto.js (DB → API shape)
  importers/          data/halls JSON → Locations + Foods + Menu_Items
  auth/               password hashing and the signed sign-in cookie
  middleware/         error → { error: { code, message } }; requireUser for /api/me
db/validators/        MongoDB $jsonSchema rules for all five collections
scripts/              validators, indexes, import
data/halls/mobile/    menus for 15 locations (Pines, 64 Degrees, Canyon Vista, markets, ...) transcribed from mobile ordering app screenshots
data/tag-legend.json  which HDH icon each tag stands for (shared by all hall files)
test/                 node:test tests
```

## Import notes

- A location is matched by name, a station by name within the location, and a menu item by station + food name. Re-running updates them in place, so ids don't change.
- Item `tags` use the keys in `data/tag-legend.json` (e.g. the pink milk bottle icon is `"dairy"`). Hall files don't repeat the legend. To add a tag, add it to `tag-legend.json` and `src/constants/tags.js`; `npm test` fails if they disagree or a hall file uses an unknown tag.
- An item with no tags at all is imported as "allergens and diet unknown", because many such items clearly have allergens (a latte with no dairy icon). An item with at least one tag gets `false` for every icon it doesn't show.
- Same-named items at different stations are separate foods (Calrose Rice is 49 cal at Heat, 294 cal at Char).
- Values the files don't have (macros, ingredients, meal period) are only set when a document is first created, so values added later aren't overwritten. The same goes for hours and for the allergens of items without tags.
- `beverage` comes from the menu category (Coffeehouse, Beverages, Tea & Lemonade, ...). Vegan items are also marked vegetarian.
- **Hours.** The schema has one `{ days, open, close }` per location. To set it, add `"hours": { "days": ["mon", ...], "open": "07:00", "close": "21:00" }` under `"dining_hall"` in the hall file. Without it, the import spans the stations' hours (earliest open to latest close, every day), or stores "unknown" if the file has none. Per-station hours and mid-day breaks can't be stored in this schema.
- Items removed from a JSON file are not deleted from the database. The import warns when counts differ.
