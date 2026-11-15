# Verification

Recorded 2026-11-15 21:30 UTC in the project workspace (Linux, bun 1.4.4). Every block below is the real output of the command, with terminal color codes removed. A final `exit code` line was added by the recording shell.

## 1. Install, lint, typecheck, test, build

Fixes made to reach these results: one formatting error in `src/views/global-view.tsx` reported by the first lint run (fixed with prettier). The build was changed to also write a prerendered `dist/client/index.html` so the build can be served as plain files (see `docs/DECISIONS.md`, item 15).

### bun install

```text
bun install v1.4.4 (38afee6c8)

Checked 397 installs across 420 packages (no changes) [26.00ms]
exit code: 0
```

### bun run lint

```text
$ eslint .
exit code: 0
```

### bun run typecheck

```text
$ tsc --noEmit
exit code: 0
```

### bun run test

```text
$ vitest run

 RUN  v4.1.11 /dev-server

 ✓ src/test/modis.test.ts (6 tests) 11ms
 ✓ src/test/power.test.ts (12 tests) 21ms
 ✓ src/test/derive.test.ts (5 tests) 9ms
 ✓ src/test/bundle.test.ts (4 tests) 39ms
 ✓ src/test/loader.test.ts (7 tests) 55ms
 ✓ src/test/quality.test.ts (4 tests) 112ms
 ✓ src/test/plan-export.test.ts (1 test) 114ms
 ✓ src/test/app-routing.test.tsx (1 test) 10ms
 ✓ src/test/engine.test.ts (8 tests) 394ms

 Test Files  9 passed (9)
      Tests  48 passed (48)
   Start at  21:29:07
   Duration  5.50s (transform 1.98s, setup 9.68s, import 2.80s, tests 766ms, environment 25.83s)

exit code: 0
```

### bun run build

```text
$ vite build
The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively via the resolve.tsconfigPaths option. You can remove the plugin and set resolve.tsconfigPaths: true in your Vite config instead.
The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively via the resolve.tsconfigPaths option. You can remove the plugin and set resolve.tsconfigPaths: true in your Vite config instead.
The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively via the resolve.tsconfigPaths option. You can remove the plugin and set resolve.tsconfigPaths: true in your Vite config instead.
vite v8.1.5 building client environment for production...

transforming...✓ 254 modules transformed.
rendering chunks...
computing gzip size...
dist/client/assets/public-sans-latin-600-normal-Fru-LXNs.woff2   14.59 kB
dist/client/assets/public-sans-latin-700-normal-BqJmxWdE.woff2   14.60 kB
dist/client/assets/public-sans-latin-400-normal-8Rpg0ruU.woff2   14.63 kB
dist/client/assets/public-sans-latin-800-normal-Cymo4W0O.woff2   14.77 kB
dist/client/assets/michroma-latin-400-normal-4gS0VCia.woff2      17.90 kB
dist/client/assets/planner.worker-UhdsSxQD.js                    42.99 kB
dist/client/assets/styles-Dtnp5JHC.css                           55.33 kB │ gzip:  11.52 kB
dist/client/assets/snapshot-export-BXgx5ye6.js                    1.20 kB │ gzip:   0.58 kB
dist/client/assets/global-view-BqGs_BvM.js                        2.14 kB │ gzip:   0.94 kB
dist/client/assets/pieces-hA4vmnH4.js                             2.56 kB │ gzip:   1.08 kB
dist/client/assets/about-view-DYhNqp07.js                         2.79 kB │ gzip:   1.20 kB
dist/client/assets/data-status-CL6WzXl8.js                        3.64 kB │ gzip:   1.32 kB
dist/client/assets/motion-Czh4VzdK.js                             9.23 kB │ gzip:   3.66 kB
dist/client/assets/method-view-B7cCJTMA.js                       11.53 kB │ gzip:   3.95 kB
dist/client/assets/engine-run-B1I92Qz4.js                        42.74 kB │ gzip:  14.52 kB
dist/client/assets/routes-jUG9YV6X.js                           116.63 kB │ gzip:  32.74 kB
dist/client/assets/index-Dz6yzXrs.js                            371.36 kB │ gzip: 118.90 kB

✓ built in 855ms
vite v8.1.5 building ssr environment for production...

transforming...✓ 101 modules transformed.
rendering chunks...
computing gzip size...
dist/server/assets/empty-plugin-adapters-D9UWiqvJ.js         0.22 kB │ gzip:  0.16 kB
dist/server/assets/_tanstack-start-manifest_v-y_f63gOj.js    0.64 kB │ gzip:  0.36 kB
dist/server/assets/start-CxjCXmAx.js                         1.57 kB │ gzip:  0.71 kB
dist/server/assets/snapshot-export-B4AIAmdD.js               1.97 kB │ gzip:  0.84 kB
dist/server/assets/global-view-B72pumNY.js                   3.19 kB │ gzip:  1.21 kB
dist/server/assets/createCsrfMiddleware-B2To0gPJ.js          3.19 kB │ gzip:  1.01 kB
dist/server/server.js                                        3.70 kB │ gzip:  1.55 kB
dist/server/assets/pieces-u9M7t63Z.js                        3.87 kB │ gzip:  1.42 kB
dist/server/assets/about-view-BqTnTRXb.js                    4.21 kB │ gzip:  1.50 kB
dist/server/assets/data-status-9wnF27eF.js                   5.45 kB │ gzip:  1.67 kB
dist/server/assets/router-CZPQjRn6.js                        6.92 kB │ gzip:  2.20 kB
dist/server/assets/motion-CDRKzjpr.js                       13.55 kB │ gzip:  4.66 kB
dist/server/assets/method-view-IsRMYvMn.js                  18.79 kB │ gzip:  5.05 kB
dist/server/assets/server-CnsraYEX.js                       66.34 kB │ gzip: 16.95 kB
dist/server/assets/engine-run-BESL1v-Q.js                   75.24 kB │ gzip: 22.13 kB
dist/server/assets/routes-BaGDyZLn.js                      105.21 kB │ gzip: 27.23 kB

✓ built in 338ms
The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively via the resolve.tsconfigPaths option. You can remove the plugin and set resolve.tsconfigPaths: true in your Vite config instead.
[prerender] Prerendering pages...
[prerender] Concurrency: 16
[prerender] Crawling: /
[prerender] Prerendered 1 pages:
[prerender] - /
exit code: 0
```

## 2. Engine files

`diff -rq` between `src/engine/` and `engine/src/` of the supplied R3 package reported no differences (15 files). No file in `src/engine/` was edited.

Some engine files contain words this project avoids in its own text (for example "validated" in `src/engine/validate.ts`). They were left as they are because the engine must stay byte-identical.

## 3. Missing solar days and repeated soil wetness

The Method and Data view now computes these from the loaded data (`src/lib/data/quality.ts`) and shows them as a warning. With the saved snapshot it shows, for each of the five locations, 66 days without solar radiation (Sep 1, 2026 to Nov 5, 2026), and root-zone soil wetness repeating one value for the last 35 days (Oct 2, 2026 to Nov 5, 2026). These numbers were read from the page, not written into the code.

The planner still returns plans with the missing solar days: `src/test/engine.test.ts` gets 216 plans for each location from the snapshot, and `src/test/quality.test.ts` checks that the snapshot has missing solar days and still gives plans. If the engine fails, the existing message area on the Planner shows the reason instead of plans.

The snapshot's source labels were reworded from "near real time" to "for the most recent period". Only these text labels changed; the data values did not. The bundle version was recomputed with the app's own hash function (the old version was first recomputed and matched): new version `d35995acc6fa…`.

## 4. Static smoke test

`dist/client` served with `python3 -m http.server 4173`, opened in headless Chromium (Playwright) at 1280 by 1800. Script: load the root, then for each hash route open it and hard reload, read the main heading, and on Method and Data search the page text for the required labels.

```text
root status 200
planner has 'Rank' text: True | unavailable: False
#/ status None h1: Rotation plans for
Kafr El-Sheikh
#/method status None h1: Method and data
   modeled -> True
   satellite-derived -> True
   observed -> True
   verified -> True
   provisional -> True
   unresolved -> True
   proposed -> True
   Gaps at the end of the series -> True
   Cause not investigated -> True
  warning text: Gaps at the end of the series
#/global status None h1: Other river basins
#/about status None h1: About RotaNile
data responses: [(200, 'http://localhost:4173/data/snapshot.json'), (200, 'http://localhost:4173/data/snapshot.json'), (200, 'http://localhost:4173/data/snapshot.json'), (200, 'http://localhost:4173/data/snapshot.json'), (200, 'http://localhost:4173/data/snapshot.json')]
failed: ['http://localhost:4173/assets/global-view-BqGs_BvM.js']
console errors/warnings: []
```

- Root route loads (status 200) and the Planner shows ranked plans.
- Hard reload on `#/`, `#/method`, `#/global` and `#/about` shows the right page each time.
- `/data/snapshot.json` loads under base `./`. `/data/config.json` and `/data/points.json` also return 200 when requested directly; the app does not request them while the snapshot is valid.
- No console errors or warnings.
- The one failed request (`global-view` script) was cut off by the reload that came straight after it. Opening `#/global` in a fresh page loaded it with no failed requests and no errors.
- Found on the page: modeled, satellite-derived, observed; verified, provisional, unresolved; "Coordinates (proposed)".
- Not run: Firefox, Safari, real phones. Only Chromium is available in this workspace.
- The prerendered page loads scripts and icons from paths starting with `/`, so the folder must be served at the site root. Serving it under a subfolder was not tested.

## 5. Tool names

Search of the working tree (excluding `.git`, `node_modules`, `dist`) for lovable, claude, anthropic, openai, chatgpt, gpt and copilot:

- `README.md`: the requested section "How SI tools were used", which names Lovable and Claude (Anthropic) on purpose.
- `.lovable/north-star/north-star.md`: left in place, see below.
- `bun.lock`: no hits.

## 6. Needs a human decision

- `.lovable/`: a folder created by the coding tool's platform. It was not deleted. Decide whether to keep it in the submitted repository.
- Commit history: all 117 commits carry the coding tool's author name. History was not rewritten.
- Prerendered start page (item 15 in `docs/DECISIONS.md`): decide whether to keep it, or host with the server build instead.
- Cross-browser and device checks are still open.
