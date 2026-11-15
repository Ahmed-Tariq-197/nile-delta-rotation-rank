# External resources

Every external resource the repository uses. Nothing is listed that cannot be found in the repository.

## Data services

| Resource | Address in the code | Used for |
| --- | --- | --- |
| NASA POWER daily point API, community AG | `https://power.larc.nasa.gov/api/temporal/daily/point` (`src/lib/data/power.ts`) | Daily meteorology (modeled) and solar radiation (satellite-derived) for the five proposed locations. |
| ORNL DAAC MODIS web service, product MOD13Q1 version 061 | `https://modis.ornl.gov/rst/api/v1` (`src/lib/data/modis.ts`) | 16-day NDVI composites and pixel reliability at 250 m (observed). Context only, not scored. |

The frozen copy of both is `public/data/snapshot.json`.

## Agronomy sources

The seven sources recorded in `public/data/config.json`, with the address copied from that file.

| Id | Address | Access status recorded |
| --- | --- | --- |
| fao56 | https://www.fao.org/4/x0490E/x0490e00.htm (chapters: x0490e0b.htm, x0490e0e.htm) | opened |
| fao66_ch2 | https://fao.org/4/i2800e/i2800e02.pdf | opened |
| fao_egypt_fert | https://www.fao.org/4/y5863e/y5863e00.htm (chapters y5863e07.htm to y5863e0b.htm) | opened |
| fao_iwm_paddy_sched | https://www.fao.org/4/t7202e/t7202e07.htm | opened |
| fao_iwm_water_needs | https://www.fao.org/3/S2022E/s2022e08.htm | opened |
| zjar_2023_berseem | https://zjar.journals.ekb.eg/article_297652_75ab256d516da61ad01cec7147f73c95.pdf | opened |
| gyga_egypt | https://yieldgap.containers.wur.nl/egypt | not accessible |

## Fonts

- Michroma, through the npm package `@fontsource/michroma`.
- Public Sans, through the npm package `@fontsource/public-sans`.

## Image

- Nile Orbit Lab badge, supplied by the team: `public/nile-orbit-lab-space-badge.webp`. The resized copies in `public/brand/` and the icons `public/favicon.ico`, `public/favicon-16x16.png`, `public/favicon-32x32.png` and `public/apple-touch-icon.png` are made from it.

## npm packages

From `package.json`.

### Dependencies

- `@fontsource/michroma` ^5.3.0
- `@fontsource/public-sans` ^5.3.0
- `@radix-ui/react-slot` ^1.2.4
- `@tanstack/react-query` ^5.101.1
- `@tanstack/react-router` 1.170.41
- `@tanstack/react-start` 1.168.60
- `@tanstack/router-plugin` 1.168.42
- `class-variance-authority` ^0.7.1
- `clsx` ^2.1.1
- `react` ^19.2.0
- `react-dom` ^19.2.0
- `tailwind-merge` ^3.5.0
- `tailwindcss` ^4.2.1
- `tw-animate-css` ^1.3.4
- `zod` ^3.25.76

### Development dependencies

- `@eslint/js` ^9.32.0
- `@tailwindcss/vite` ^4.3.5
- `@testing-library/jest-dom` ^6.6.0
- `@testing-library/react` ^16.0.0
- `@types/node` ^22.16.5
- `@types/react` ^19.2.0
- `@types/react-dom` ^19.2.0
- `@vitejs/plugin-react` ^6.3.0
- `eslint` ^9.32.0
- `eslint-config-prettier` ^10.1.1
- `eslint-plugin-prettier` ^5.2.6
- `eslint-plugin-react-hooks` ^5.2.0
- `eslint-plugin-react-refresh` ^0.4.20
- `globals` ^15.15.0
- `jsdom` ^20.0.3
- `nitro` 3.0.260603-beta
- `prettier` ^3.7.3
- `typescript` ^5.8.3
- `typescript-eslint` ^8.56.1
- `vite` 8.1.5
- `vite-tsconfig-paths` ^6.1.1
- `vitest` ^4.1.10

### Override

- `rolldown` 1.2.1
