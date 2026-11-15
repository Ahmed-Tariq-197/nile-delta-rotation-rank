/**
 * Reads the OKLCH color tokens from src/styles.css and checks the text/background pairs the
 * interface uses against WCAG AA (4.5:1 body text, 3:1 large text and interface parts).
 * Run with: bun run contrast
 */
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const tokens = new Map<string, [number, number, number]>();
for (const match of css.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
  tokens.set(match[1]!, [Number(match[2]), Number(match[3]), Number(match[4])]);
}

function luminance([l, c, h]: [number, number, number]) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1);
  const g = clamp(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1);
  const bl = clamp(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function ratio(fg: string, bg: string) {
  const a = tokens.get(fg);
  const b = tokens.get(bg);
  if (!a || !b) throw new Error(`Missing token ${a ? bg : fg}`);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const pairs: [string, string, number][] = [
  ["text", "page", 4.5],
  ["text", "surface", 4.5],
  ["text", "surface-alt", 4.5],
  ["text", "signal-soft", 4.5],
  ["text-muted", "page", 4.5],
  ["text-muted", "surface", 4.5],
  ["text-muted", "surface-alt", 4.5],
  ["text-muted", "signal-soft", 4.5],
  ["signal", "surface", 4.5],
  ["signal", "page", 4.5],
  ["signal", "signal-soft", 4.5],
  ["surface", "signal", 4.5],
  ["error", "surface", 4.5],
  ["ok", "surface", 4.5],
  ["gold-ink", "surface", 4.5],
  ["on-dark", "night", 4.5],
  ["on-dark", "night-2", 4.5],
  ["on-dark-muted", "night", 4.5],
  ["on-dark-muted", "night-2", 4.5],
  ["gold-bright", "night-2", 4.5],
  ["night", "gold", 4.5],
  ["line-strong", "surface", 3],
  ["observed", "surface", 3],
  ["modeled", "surface", 3],
  ["assumed", "surface", 3],
  ["night", "wheat", 4.5],
  ["night", "berseem", 4.5],
  ["night", "cotton", 4.5],
  ["night", "maize", 4.5],
  ["night", "rice", 4.5],
];

let failures = 0;
for (const [fg, bg, need] of pairs) {
  const value = ratio(fg, bg);
  const pass = value >= need;
  if (!pass) failures += 1;
  console.log(`${pass ? "pass" : "FAIL"}  ${fg} on ${bg}: ${value.toFixed(2)} (needs ${need})`);
}
console.log(failures ? `${failures} pair(s) fail` : "All pairs pass WCAG AA");
process.exit(failures ? 1 : 0);
