/**
 * Constants permitted in engine code: physical constants and FAO-56 coefficients.
 * Source for every FAO-56 entry: Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998).
 * Crop evapotranspiration - Guidelines for computing crop water requirements.
 * FAO Irrigation and Drainage Paper 56. Equation numbers refer to that document.
 * Each value was read in the official FAO publication; see docs/ENGINE_METHODS.md, section 1.
 */

export const ENGINE_VERSION = '1.1.0';

/** Symbol list: solar constant, MJ m-2 min-1. */
export const SOLAR_CONSTANT_MJ_M2_MIN = 0.082;
/** Minutes per day, used with Eq 21 (24 x 60 / pi). */
export const MINUTES_PER_DAY = 24 * 60;
/** Symbol list: Stefan-Boltzmann constant, MJ K-4 m-2 day-1. */
export const STEFAN_BOLTZMANN_MJ_K4_M2_DAY = 4.903e-9;
/** Eq 39: temperature in kelvin is degrees Celsius + 273.16. */
export const KELVIN_OFFSET_LONGWAVE = 273.16;
/** Eq 6: the offset used in the aerodynamic term, T + 273. */
export const KELVIN_OFFSET_ET0 = 273;
/** Eq 38: albedo of the hypothetical grass reference crop. */
export const ALBEDO_REFERENCE_GRASS = 0.23;
/** Eq 6 and Eq 20: conversion from MJ m-2 day-1 to mm day-1 of evaporation. */
export const MJ_TO_MM_EVAPORATION = 0.408;
/** Eq 6: numerator coefficient of the aerodynamic term. */
export const ET0_AERODYNAMIC_COEFF = 900;
/** Eq 6: wind coefficient in the denominator. */
export const ET0_WIND_COEFF = 0.34;
/** Eq 7 (as printed in Example 2): sea-level pressure, kPa. */
export const PRESSURE_SEA_LEVEL_KPA = 101.3;
export const PRESSURE_REFERENCE_TEMP_K = 293;
export const PRESSURE_LAPSE_RATE_K_M = 0.0065;
export const PRESSURE_EXPONENT = 5.26;
/** Eq 8: psychrometric constant coefficient. */
export const PSYCHROMETRIC_COEFF = 0.665e-3;
/** Eq 11: saturation vapor pressure coefficients. */
export const SVP_A_KPA = 0.6108;
export const SVP_B = 17.27;
export const SVP_C_C = 237.3;
/** Eq 23: inverse relative distance amplitude. */
export const DR_AMPLITUDE = 0.033;
/** Eq 24: solar declination amplitude (rad) and phase (rad). */
export const DECLINATION_AMPLITUDE_RAD = 0.409;
export const DECLINATION_PHASE_RAD = 1.39;
/** Eq 23 and Eq 24: days in the year used in the day-angle term. */
export const DAY_ANGLE_DAYS = 365;
/** Eq 37: clear-sky radiation coefficients, Rso = (A + B z) Ra. */
export const RSO_BASE = 0.75;
export const RSO_ELEVATION_COEFF_PER_M = 2e-5;
/** Eq 39: net longwave humidity and cloudiness coefficients. */
export const RNL_HUMIDITY_A = 0.34;
export const RNL_HUMIDITY_B = 0.14;
export const RNL_CLOUD_A = 1.35;
export const RNL_CLOUD_B = 0.35;
/** Chapter 3, Table 3: 1 W m-2 = 0.0864 MJ m-2 day-1. */
export const W_M2_TO_MJ_M2_DAY = 0.0864;
/** SI definition (not an FAO-56 value): 1 kWh = 3.6 MJ. */
export const MJ_PER_KWH = 3.6;

/** Cumulative days before each month on the 365-day calendar (calendar arithmetic, not a parameter). */
export const CUMULATIVE_DAYS_BEFORE_MONTH: readonly number[] = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Numerical rounding for reported values: 9 decimal places (not an agronomic parameter). */
export const REPORT_DECIMALS = 9;
/** Tolerance used for share comparisons (floating-point guard, not an agronomic parameter). */
export const SHARE_EPSILON = 1e-12;

/** Constant limits list returned with every response (contract v1). */
export const LIMITS: readonly string[] = [
  'Indicators are documented proxies, not forecasts.',
  'The engine has no external validation.',
  'Normalization is relative to the feasible plan set of the current request.',
  'Version 1 omits income and soil texture.',
];
