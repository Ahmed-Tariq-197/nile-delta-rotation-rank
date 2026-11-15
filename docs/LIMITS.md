# Limits

- Climate values are NASA POWER grid-cell model output, not field measurements. Meteorology comes from MERRA-2, with GEOS FP-IT for the most recent period; solar radiation is satellite-derived from CERES SYN1deg, with FLASHFlux for the most recent period. The source changes inside the 2020-to-present period, and consistency across that change was not assessed.
- The data are the latest available at retrieval, not real-time. The climate request ends 10 days before the run date. Solar values are missing for the most recent period; the Method and Data view counts the missing days for each location from the loaded data.
- Root-zone soil wetness (GWETROOT) repeats one value over the last days at some locations. The Method and Data view shows the length of each run. The cause of these repeated values was not investigated.
- Grid-cell groups are inferred from identical returned values. This assumes NASA POWER does not interpolate between cells; no extra requests were made to test it. Points that share a cell do not have independent climate series.
- A 250 m MODIS pixel can mix fields, canals, roads and villages. Composite dates are the start of each 16-day window, not acquisition dates. NDVI is context only and never enters any score. The MODIS subset response does not state the collection version; version 061 is the product version documented for the service.
- All five coordinates are proposed. None was checked on imagery or a map. Elevation is the value NASA POWER returns for its cell.
- The third "nili" season is not modeled. Capillary rise is not modeled.
- The configuration has no prices and no forecasts. Any income figure would be a user input or an assumption and must be labeled as such.
- No outside review took place. Real-world validation was not performed.
