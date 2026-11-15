/**
 * FAO-56 Penman-Monteith reference evapotranspiration (daily time step) and the
 * supporting equations. Equation numbers refer to FAO Irrigation and Drainage
 * Paper 56 (Allen et al., 1998). All functions are pure.
 */
import {
  ALBEDO_REFERENCE_GRASS, DAY_ANGLE_DAYS, DECLINATION_AMPLITUDE_RAD, DECLINATION_PHASE_RAD, DR_AMPLITUDE,
  ET0_AERODYNAMIC_COEFF, ET0_WIND_COEFF, KELVIN_OFFSET_ET0, KELVIN_OFFSET_LONGWAVE, MINUTES_PER_DAY, MJ_PER_KWH,
  MJ_TO_MM_EVAPORATION, PRESSURE_EXPONENT, PRESSURE_LAPSE_RATE_K_M, PRESSURE_REFERENCE_TEMP_K, PRESSURE_SEA_LEVEL_KPA,
  PSYCHROMETRIC_COEFF, RNL_CLOUD_A, RNL_CLOUD_B, RNL_HUMIDITY_A, RNL_HUMIDITY_B, RSO_BASE, RSO_ELEVATION_COEFF_PER_M,
  SOLAR_CONSTANT_MJ_M2_MIN, STEFAN_BOLTZMANN_MJ_K4_M2_DAY, SVP_A_KPA, SVP_B, SVP_C_C, W_M2_TO_MJ_M2_DAY,
} from './constants.js';

const DEG_TO_RAD = Math.PI / 180;

/** Eq 11: saturation vapor pressure e0(T), kPa, T in degrees Celsius. */
export function saturationVaporPressureKpa(tempC: number): number {
  return SVP_A_KPA * Math.exp((SVP_B * tempC) / (tempC + SVP_C_C));
}

/** Eq 13: slope of the saturation vapor pressure curve, kPa per degree C (analytic derivative of Eq 11). */
export function slopeVaporPressureCurveKpaPerC(tempC: number): number {
  return (saturationVaporPressureKpa(tempC) * SVP_B * SVP_C_C) / Math.pow(tempC + SVP_C_C, 2);
}

/** Eq 7: atmospheric pressure, kPa, from elevation in meters. */
export function atmosphericPressureKpa(elevationM: number): number {
  return (
    PRESSURE_SEA_LEVEL_KPA *
    Math.pow((PRESSURE_REFERENCE_TEMP_K - PRESSURE_LAPSE_RATE_K_M * elevationM) / PRESSURE_REFERENCE_TEMP_K, PRESSURE_EXPONENT)
  );
}

/** Eq 8: psychrometric constant, kPa per degree C. */
export function psychrometricConstantKpaPerC(pressureKpa: number): number {
  return PSYCHROMETRIC_COEFF * pressureKpa;
}

/** Eq 23: inverse relative Earth-Sun distance, day of year J (1..365). */
export function inverseRelativeDistance(doy: number): number {
  return 1 + DR_AMPLITUDE * Math.cos((2 * Math.PI * doy) / DAY_ANGLE_DAYS);
}

/** Eq 24: solar declination, radians. */
export function solarDeclinationRad(doy: number): number {
  return DECLINATION_AMPLITUDE_RAD * Math.sin((2 * Math.PI * doy) / DAY_ANGLE_DAYS - DECLINATION_PHASE_RAD);
}

/** Eq 25: sunset hour angle, radians (arccos argument limited to [-1, 1]). */
export function sunsetHourAngleRad(latitudeRad: number, declinationRad: number): number {
  const arg = -Math.tan(latitudeRad) * Math.tan(declinationRad);
  return Math.acos(Math.max(-1, Math.min(1, arg)));
}

/** Eq 21: extraterrestrial radiation Ra, MJ m-2 day-1. */
export function extraterrestrialRadiationMjM2Day(latitudeDeg: number, doy: number): number {
  const phi = latitudeDeg * DEG_TO_RAD;
  const dr = inverseRelativeDistance(doy);
  const delta = solarDeclinationRad(doy);
  const ws = sunsetHourAngleRad(phi, delta);
  return (
    (MINUTES_PER_DAY / Math.PI) * SOLAR_CONSTANT_MJ_M2_MIN * dr *
    (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws))
  );
}

/** Eq 34: daylight hours N. */
export function daylightHours(latitudeDeg: number, doy: number): number {
  return (24 / Math.PI) * sunsetHourAngleRad(latitudeDeg * DEG_TO_RAD, solarDeclinationRad(doy));
}

/** Eq 37: clear-sky solar radiation Rso, MJ m-2 day-1. */
export function clearSkyRadiationMjM2Day(raMjM2Day: number, elevationM: number): number {
  return (RSO_BASE + RSO_ELEVATION_COEFF_PER_M * elevationM) * raMjM2Day;
}

/** Eq 38: net shortwave radiation Rns, MJ m-2 day-1. */
export function netShortwaveRadiationMjM2Day(rsMjM2Day: number): number {
  return (1 - ALBEDO_REFERENCE_GRASS) * rsMjM2Day;
}

/** Eq 39: net longwave radiation Rnl, MJ m-2 day-1 (Rs/Rso limited to 1.0). */
export function netLongwaveRadiationMjM2Day(tMaxC: number, tMinC: number, eaKpa: number, rsMjM2Day: number, rsoMjM2Day: number): number {
  if (!(rsoMjM2Day > 0)) throw new RangeError('Clear-sky radiation must be positive to compute net longwave radiation.');
  const ratio = Math.min(rsMjM2Day / rsoMjM2Day, 1);
  const tmaxK = tMaxC + KELVIN_OFFSET_LONGWAVE;
  const tminK = tMinC + KELVIN_OFFSET_LONGWAVE;
  const sigmaTerm = (STEFAN_BOLTZMANN_MJ_K4_M2_DAY * (Math.pow(tmaxK, 4) + Math.pow(tminK, 4))) / 2;
  return sigmaTerm * (RNL_HUMIDITY_A - RNL_HUMIDITY_B * Math.sqrt(eaKpa)) * (RNL_CLOUD_A * ratio - RNL_CLOUD_B);
}

/**
 * Converts a shortwave radiation series to MJ m-2 day-1 from its unit label.
 * Supported: MJ/m2/day, kWh/m2/day (also kW-hr/m^2/day), W/m2. Returns null when not recognized.
 */
export function radiationUnitFactorToMjM2Day(unitLabel: string): number | null {
  const u = unitLabel
    .toLowerCase()
    .replace(/[\s^]/g, '')
    .replace(/²/g, '2')
    .replace(/kw-?hr?/g, 'kwh')
    .replace(/\/d(ay)?$/, '/day')
    .replace(/m-2/g, '/m2');
  if (/^mj\/m2\/day$/.test(u) || /^mjm2day-1$/.test(u) || /^mj\/m2day-1$/.test(u)) return 1;
  if (/^kwh\/m2\/day$/.test(u) || /^kwhm2day-1$/.test(u) || /^kwh\/m2day-1$/.test(u)) return MJ_PER_KWH;
  if (/^w\/m2$/.test(u) || /^wm2$/.test(u)) return W_M2_TO_MJ_M2_DAY;
  return null;
}

export interface Et0Inputs {
  tMeanC: number;
  tMaxC: number;
  tMinC: number;
  rhMeanPct?: number;
  eaKpa?: number;
  u2MS: number;
  rsMjM2Day: number;
  latitudeDeg: number;
  elevationM: number;
  doy: number;
  gMjM2Day?: number;
}

export interface Et0Result {
  et0MmDay: number;
  pressureKpa: number;
  gammaKpaPerC: number;
  deltaKpaPerC: number;
  esKpa: number;
  eaKpa: number;
  raMjM2Day: number;
  rsoMjM2Day: number;
  rnsMjM2Day: number;
  rnlMjM2Day: number;
  rnMjM2Day: number;
  radiationTermMmDay: number;
  aerodynamicTermMmDay: number;
}

/** Eq 6: FAO Penman-Monteith reference evapotranspiration, mm day-1 (negative results limited to zero). */
export function et0PenmanMonteith(input: Et0Inputs): Et0Result {
  const g = input.gMjM2Day ?? 0;
  const pressure = atmosphericPressureKpa(input.elevationM);
  const gamma = psychrometricConstantKpaPerC(pressure);
  const delta = slopeVaporPressureCurveKpaPerC(input.tMeanC);
  const es = (saturationVaporPressureKpa(input.tMaxC) + saturationVaporPressureKpa(input.tMinC)) / 2;
  let ea: number;
  if (input.eaKpa !== undefined) ea = input.eaKpa;
  else if (input.rhMeanPct !== undefined) ea = (input.rhMeanPct / 100) * es; // Eq 19
  else throw new RangeError('Either eaKpa or rhMeanPct is required.');
  const ra = extraterrestrialRadiationMjM2Day(input.latitudeDeg, input.doy);
  const rso = clearSkyRadiationMjM2Day(ra, input.elevationM);
  const rns = netShortwaveRadiationMjM2Day(input.rsMjM2Day);
  const rnl = netLongwaveRadiationMjM2Day(input.tMaxC, input.tMinC, ea, input.rsMjM2Day, rso);
  const rn = rns - rnl;
  const denom = delta + gamma * (1 + ET0_WIND_COEFF * input.u2MS);
  const radTerm = (MJ_TO_MM_EVAPORATION * (rn - g) * delta) / denom;
  const aeroTerm = (((ET0_AERODYNAMIC_COEFF / (input.tMeanC + KELVIN_OFFSET_ET0)) * input.u2MS * (es - ea)) * gamma) / denom;
  return {
    et0MmDay: Math.max(0, radTerm + aeroTerm),
    pressureKpa: pressure, gammaKpaPerC: gamma, deltaKpaPerC: delta, esKpa: es, eaKpa: ea,
    raMjM2Day: ra, rsoMjM2Day: rso, rnsMjM2Day: rns, rnlMjM2Day: rnl, rnMjM2Day: rn,
    radiationTermMmDay: radTerm, aerodynamicTermMmDay: aeroTerm,
  };
}
