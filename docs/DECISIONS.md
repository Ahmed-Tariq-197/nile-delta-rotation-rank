# Decisions

1. **Browser-side data requests.** The app's server-function endpoint did not answer under the relative asset base (`./`) the project uses; requests reached the page handler instead (status 406). Both NASA POWER and the ORNL DAAC MODIS service send `Access-Control-Allow-Origin: *`, so the data layer runs in the browser. This also keeps the build usable on static hosting. The same modules run from a terminal (`bun run snapshot`), where a User-Agent header identifying RotaNile is sent; browsers do not allow that header.
2. **MODIS timeout of 60 seconds.** Measured subset requests took 16 to 40 seconds, so the 25-second limit used for NASA POWER would fail almost every vegetation request. Climate keeps 25 seconds.
3. **One subset request per band per group of ten composites.** Requests for all bands at once took up to 40 seconds and then began failing with status 502 after 60 seconds; single-band requests (NDVI, pixel reliability) answered in 16 to 18 seconds.
4. **Progressive loading.** The planner opens as soon as climate series are available; vegetation records fill in per location afterward because a full live retrieval takes many minutes. The bundle version is recomputed when each vegetation record arrives.
5. **Frozen snapshot.** `public/data/snapshot.json` was produced with `bun run snapshot` from the same retrieval code so the demonstration does not depend on NASA service speed. Deleting the file returns the app to live retrieval.
6. **Contract additions.** `Manifest` gained optional fields only (per-location request records, NDVI metadata source and status, solar cell groups). No existing key was renamed or retyped. `runPlanner` now passes the assembled bundle to the worker, because live data have no static per-location files.
7. **Validation.** Fetched JSON is checked with zod at the boundary. On success the original object is kept unchanged, so exported snapshots match what was loaded.
8. **Removed unused interface components and packages** that no code imported.
9. **Visual direction from the badge.** Every page opens on a night-side banner taken from the Nile Orbit Lab badge (navy sky, gold orbit, satellite), ending on a curved horizon; content below is light. Michroma (display) echoes the badge lettering; Public Sans is used for text.
10. **Badge sizes.** The original badge (1.79 MB, 1254 px) is kept unchanged. The interface loads resized copies in `public/brand/`: 128 px (5 KB), 256 px (14 KB), 640 px (54 KB) and 1200 px (91 KB), each with width and height set.
11. **Background retries.** Failed loads retry automatically on a capped schedule (15 seconds doubling to 5 minutes); a "Retry now" link stays available as a secondary action.
12. **Hash routing.** Views live under `#/`, `#/method`, `#/global`, `#/about`, so the build works from any folder on static hosting without rewrite rules.

## 13. Calculation engine integration

- The engine (version 1.1.0) is placed unchanged in `src/engine/`. It is excluded from lint and formatting so its files stay byte-identical, and the type check option `noPropertyAccessFromIndexSignature` is turned off because the engine was written without it.
- Contract comparison: `EngineRequest`, `EngineResponse`, `Plan`, `Slot`, `SlotDetail`, `IndicatorValue`, `Driver` and `ProvenanceEntry` match key for key. The engine's `ConfigFile` and `ManifestFile` are looser than the app's; the app bundle is passed through a type cast. The app bundle also carries `ndvi`, which the engine ignores. One app-side change: `AppError` gains the kind `engine_error` and an optional `code`.
- Engine error codes map to plain messages in `src/lib/engine-run.ts`. Only a missing worker is handled by the main-thread fallback.
- The engine runs in a worker; if the worker fails to start, the same code runs on the main thread. Slider changes recalculate after 300 ms.

## 14. Page motion

- Sections fade up as they scroll into view, cards follow the pointer with a soft glow, and a gold bar under the header shows scroll progress. All of it is off when the system asks for reduced motion, and content stays visible if scripts do not run.
- Ranked plans download as CSV (one row per plan, engine values as returned) or as the full engine response in JSON.

## 15. Static start page

- The build also writes `dist/client/index.html`, a prerendered copy of the root route, so `dist/client` can be served as plain files. Pages use hash routes, so this one file serves every view. Script and icon paths in it start with `/`, so the folder must be served at the site root.

## 16. Run-time data checks

- The Method and Data view counts missing solar days and the run of identical root-zone soil wetness values at the end of each series from the loaded data. No counts are written into the code.
