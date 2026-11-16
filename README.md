# RotaNile

RotaNile is crop-rotation planning support for the Nile Delta, produced by Nile Orbit Lab. It is planning support, not a forecast.
https://nile-delta-rotation-rank.ahmed-alsaiid-2024.workers.dev/

## What it does

- Loads daily climate series from NASA POWER (meteorology and solar, both modeled; solar is satellite-derived) and MODIS MOD13Q1 version 061 NDVI composites (observed) for five proposed Delta locations.
- Reads the agronomy configuration (`public/data/config.json`), in which every parameter carries an evidence grade: verified, provisional or unresolved.
- Shows the data end date ("latest available"), retrieval time, unit conversions, warnings, grid-cell groups and limits on the Planner and Method and Data views.
- Ranks three-year rotation plans with the calculation engine, version 1.1.0, in `src/engine/`. The engine runs in a web worker, with a main-thread fallback when the worker cannot start. Ranked plans can be saved as CSV or JSON.

## Data

| File                        | Content                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `public/data/config.json`   | Agronomy configuration with evidence grades. Read at run time; values are never edited by the app.                              |
| `public/data/points.json`   | Five proposed locations. Coordinates were not checked on imagery. Elevation and cell id are filled at run time.                 |
| `public/data/snapshot.json` | Optional frozen copy of the complete data bundle. When present and valid, the app uses it instead of calling the NASA services. |

Loader order: `snapshot.json` first; otherwise the bundle is assembled live in the browser from NASA POWER and the ORNL DAAC MODIS web service. Requests use a timeout, up to three retries with exponential backoff, at most two concurrent requests and a six-hour in-memory cache.

To refresh the snapshot, open Method and Data and select "Export snapshot" after all vegetation records have loaded, then place the file in `public/data/`. The same can be done from a terminal with `bun run snapshot`.


