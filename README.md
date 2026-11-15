# RotaNile

RotaNile is crop-rotation planning support for the Nile Delta, produced by Nile Orbit Lab. It is planning support, not a forecast.

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

## Run, test, build

```sh
bun install
bun run dev        # local development server
bun run lint
bun run typecheck
bun run test
bun run build
```

## How SI tools were used

The application code (user interface, data-loading layer and engine integration) was generated and edited with Lovable, an SI coding tool, following team prompts. Claude (Anthropic) was used to review the repository and draft documentation and submission text. SI tools did not produce the data; climate and vegetation data are retrieved from NASA POWER and the ORNL DAAC MODIS service. Real-world validation was not performed.

## Limits

See `docs/LIMITS.md`. In short: climate is grid-cell model output, NDVI pixels are 250 m and can mix land covers, locations are proposed, solar values are missing for the most recent period, the third "nili" season and capillary rise are not modeled, there are no prices or forecasts, and real-world validation was not performed.
