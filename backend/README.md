# Backend

Express 5 + MongoDB (Mongoose), using the team's `HT2_DB` database. Serves the API under `/api` on port 3001.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `MONGODB_URI` to the Atlas connection string (Atlas → Connect → Drivers). In Atlas → Network Access, allow your current IP.
3. Start the server with `npm run dev`, then open http://localhost:3001/api/health.

`HT2_DB` on the shared cluster already has its validators, indexes and Pines data. On a new, empty database, run these first:

```bash
npm run db:validators
npm run db:indexes
npm run db:import
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with auto-restart on file changes |
| `npm test` | Run tests. Database tests use a separate `HT2_DB_test` database (wiped each run) and are skipped if `MONGODB_URI` isn't set |
| `npm run db:validators` | Push the `$jsonSchema` rules in `db/validators/*.json` to MongoDB |
| `npm run db:indexes` | Create the indexes defined in `src/models` (never drops any) |
| `npm run db:import` | Import every `.json` file in `data/halls`, including subfolders. Pass a file or folder to import just that (`npm run db:import -- data/halls/mobile`). Safe to re-run |
| `npm run check` | Syntax-check and load the app |

## Database (`HT2_DB`)

| Collection | One document per | Notes |
| --- | --- | --- |
| `Locations` | Dining hall, cafe or market | Stations are embedded. The backend adds `hours` and `notes` to each station |
| `Foods` | Food or drink, with nutrition, allergens and diet flags | Unknown nutrition values are `null`, never `0` |
| `Menu_Items` | A food offered at a location/station | `price` is in dollars, as the schema defines it |
| `Users`, `Food_Logs` | | Not used by the backend yet |

`db/validators/*.json` holds the MongoDB-side rules for `Foods`, `Locations` and `Menu_Items`. MongoDB rejects any write that breaks them. To change a rule, edit the file, run `npm run db:validators`, and commit the file.

Documents with `_example: true` are the schema designer's placeholders. The API hides them.

## API

Success: `{ data }`. Failure: `{ error: { code, message } }` with 400 (bad input), 404 (not found), 503 (database down) or 500. The API uses camelCase and prices in integer cents; `src/services/dto.js` converts from the database's snake_case and dollars.

| Method | Route | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ status, service, db }` after pinging MongoDB |
| GET | `/api/locations` | `[{ id, name, type, area, geo }]` |
| GET | `/api/locations/:id/stations` | `[{ id, name, hours, notes, isOpenNow }]`. `isOpenNow` is `true`, `false`, or `null` if unknown |
| GET | `/api/menus?location=<id>&exclude=dairy,gluten&diet=vegan&sort=protein` | Menu items with `priceCents`, `stationName`, `allergens`, diet flags and `nutrition` |

`/api/menus` parameters:
- `location` (required): an `id` from `/api/locations`.
- `exclude`: allergens to remove (`dairy, eggs, fish, shellfish, tree_nuts, peanuts, soy, wheat, sesame, gluten`).
- `diet`: `vegan` or `vegetarian`. Vegetarian includes vegan items.
- `sort`: `price` (default), `protein` or `name`.

## Layout

```
src/
  server.js           connects to MongoDB, then starts listening
  app.js              Express app: JSON parsing, /api routes, error handling
  config/db.js        Mongoose connection
  config/validators.js applies db/validators to MongoDB
  models/             Mongoose models for Locations, Foods, Menu_Items
  routes/             URL → controller
  controllers/        read req, call one service, send { data }
  validators/         check query params, throw 400s
  services/           business logic (filters, isOpenNow) and dto.js (DB → API shape)
  importers/          data/halls JSON → Locations + Foods + Menu_Items
  middleware/         error → { error: { code, message } }
db/validators/        MongoDB $jsonSchema rules (source of truth)
scripts/              validators, indexes, import
data/halls/mobile/    menus for 15 locations (Pines, 64 Degrees, Canyon Vista, markets, ...) transcribed from mobile ordering app screenshots
data/tag-legend.json  which HDH icon each tag stands for (shared by all hall files)
test/                 node:test tests
```

## Import notes

- A location is matched by name, a station by name within the location, and a menu item by station + food name. Re-running updates them in place, so ids don't change.
- Item `tags` use the keys in `data/tag-legend.json` (e.g. the pink milk bottle icon is `"dairy"`). Hall files don't repeat the legend. To add a tag, add it to `tag-legend.json` and `src/constants/tags.js`; `npm test` fails if they disagree or a hall file uses an unknown tag.
- Same-named items at different stations are separate foods (Calrose Rice is 49 cal at Heat, 294 cal at Char).
- Fields the screenshots don't have (macros, ingredients, meal period) are only set when a document is first created, so values added later aren't overwritten.
- `beverage` comes from the menu category (Coffeehouse, Tea & Lemonade, ...). Vegan items are also marked vegetarian.
- The screenshots show one day's hours, so the import applies them to every day.
- Items removed from a JSON file are not deleted from the database. The import warns when counts differ.
