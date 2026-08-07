# African Tick Atlas Platform

A continental geospatial surveillance platform for tick species, hosts, pathogens, and tick-borne diseases across Africa. Built for ICIPE.

## Running the code

- Run `npm i` in the root and in `server/` to install dependencies.
- Run `npm run dev` to start the frontend development server (Vite, proxies `/api` to `http://localhost:3001`).
- Run `pnpm --dir server dev` to start the backend API server (Express + Prisma + SQLite).

## Data structure

The database (`server/prisma/tickatlas.db`) contains two tables linked by `species`:

| Table | Contents | Source |
| --- | --- | --- |
| `occurrences` | ~166k tick occurrence points (species, lat/lng, country, year, GBIF ID) | `server/data/tick_occurrence_simple.xlsx` |
| `epidemiological_records` | ~11.3k literature records (disease, hosts, method, incidence, title/links) | `server/data/ticks_epidemiological_data.xlsx` |

### API

- `GET /api/occurrences` — list/filter occurrence points (`species`, `country`, `yearStart`, `yearEnd`, `search`, `page`, `limit`)
- `GET /api/occurrences/meta/counts` — occurrence aggregates
- `GET /api/epidemiological` — list/filter epidemiological records (`species`, `country`, `host`, `disease`, `yearStart`, `yearEnd`, `search`)
- `GET /api/epidemiological/meta/counts` and `.../meta/yearly` — aggregates

## Importing data

Excel files live in `server/data/`. To re-import and regenerate the static fallback JSON (used by the production build when no API is available):

```bash
pnpm --dir server exec prisma db push --accept-data-loss
pnpm --dir server exec tsx src/import.ts
```

Pass custom paths with `--occurrences <file>` and `--epidemiological <file>`.
