// Color helpers. Everything accepts any CSS color string and returns a CSS
// string, so results can go straight into fill/stroke calls.
// Mixing happens in OKLab (perceptual), so gradients and blends stay clean.

import { parse, converter, formatRgb, clampChroma } from 'culori';

const toOklch = converter('oklch');
const toOklab = converter('oklab');

const cache = new Map();
function lch(c) {
  if (typeof c !== 'string') return toOklch(c);
  let v = cache.get(c);
  if (!v) {
    const p = parse(c);
    if (!p) throw new Error(`bad color: ${c}`);
    v = toOklch(p);
    if (v.h === undefined || Number.isNaN(v.h)) v.h = 0;
    if (cache.size > 5000) cache.clear();
    cache.set(c, v);
  }
  return v;
}

// Fast OKLCH/OKLab -> sRGB for the common in-gamut case; culori's chroma
// clamping (slow, but hue-preserving) only when a color falls out of gamut.
const toLinear = (l, a, b) => {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
};
const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
function out(c) {
  let l, a, b;
  if (c.mode === 'oklch') {
    const h = ((c.h || 0) * Math.PI) / 180;
    l = c.l; a = c.c * Math.cos(h); b = c.c * Math.sin(h);
  } else if (c.mode === 'oklab') {
    l = c.l; a = c.a; b = c.b;
  } else return formatRgb(clampChroma(c, 'oklch'));
  const lin = toLinear(l, a, b);
  const eps = 1e-4;
  if (lin.some((v) => v < -eps || v > 1 + eps)) return formatRgb(clampChroma(c, 'oklch'));
  const [r, g, bl] = lin.map((v) => Math.round(Math.max(0, Math.min(1, gamma(v))) * 255));
  const al = c.alpha ?? 1;
  return al >= 1 ? `rgb(${r}, ${g}, ${bl})` : `rgba(${r}, ${g}, ${bl}, ${Math.round(al * 1000) / 1000})`;
}

/** Build a color from OKLCH: l 0..1, c 0..0.37, h degrees. */
export const oklch = (l, c, h, alpha = 1) => out({ mode: 'oklch', l, c, h, alpha });

/** Normalize any color to a css rgb()/rgba() string. */
export const css = (c) => out(lch(c));

/** Perceptual mix of a and b (t=0 → a, t=1 → b). Also mixes alpha. */
export function mix(a, b, t = 0.5) {
  const A = toOklab(lch(a)), B = toOklab(lch(b));
  const aa = A.alpha ?? 1, ba = B.alpha ?? 1;
  return out({
    mode: 'oklab',
    l: A.l + (B.l - A.l) * t,
    a: A.a + (B.a - A.a) * t,
    b: A.b + (B.b - A.b) * t,
    alpha: aa + (ba - aa) * t,
  });
}

/** Adjust in OKLCH: {l: +0.1, c: *, h: +deg, alpha}. l/h are additive, c is multiplicative. */
export function adjust(color, { l = 0, c = 1, h = 0, alpha } = {}) {
  const v = lch(color);
  return out({ ...v, l: Math.max(0, Math.min(1, v.l + l)), c: v.c * c, h: v.h + h, alpha: alpha ?? v.alpha ?? 1 });
}

export const lighten = (c, amt = 0.1) => adjust(c, { l: amt });
export const darken = (c, amt = 0.1) => adjust(c, { l: -amt });
export const saturate = (c, k = 1.2) => adjust(c, { c: k });
export const shiftHue = (c, deg) => adjust(c, { h: deg });
export const alpha = (c, a) => adjust(c, { alpha: a });

/** Small random variation — makes flat fills feel painted. */
export function jitter(color, rng, { l = 0.03, c = 0.1, h = 4 } = {}) {
  const v = lch(color);
  return out({
    ...v,
    l: Math.max(0, Math.min(1, v.l + rng.range(-l, l))),
    c: Math.max(0, v.c * (1 + rng.range(-c, c))),
    h: v.h + rng.range(-h, h),
  });
}

/** Perceived lightness 0..1 (OKLab L). */
export const lightness = (c) => lch(c).l;

/**
 * Normalize gradient stops: ['#a', '#b'] or [[0,'#a'], [0.3,'#b'], ...]
 * and densify them in OKLab so canvas's sRGB interpolation doesn't muddy them.
 */
export function gradientStops(stops, steps = 8) {
  const s = stops.map((st, i) => (Array.isArray(st) ? st : [stops.length === 1 ? 0 : i / (stops.length - 1), st]));
  const res = [];
  for (let i = 0; i < s.length - 1; i++) {
    const [o0, c0] = s[i], [o1, c1] = s[i + 1];
    for (let k = 0; k < steps; k++) res.push([o0 + ((o1 - o0) * k) / steps, mix(c0, c1, k / steps)]);
  }
  res.push([s[s.length - 1][0], css(s[s.length - 1][1])]);
  return res;
}

/** Sample a multi-stop ramp at t (0..1). */
export function ramp(stops, t) {
  const s = stops.map((st, i) => (Array.isArray(st) ? st : [i / (stops.length - 1), st]));
  if (t <= s[0][0]) return css(s[0][1]);
  for (let i = 0; i < s.length - 1; i++) {
    if (t <= s[i + 1][0]) return mix(s[i][1], s[i + 1][1], (t - s[i][0]) / (s[i + 1][0] - s[i][0] || 1));
  }
  return css(s[s.length - 1][1]);
}

/** [r, g, b, a] with rgb 0..255 and a 0..1 — for raster() fields. */
export function rgba(color) {
  const c = converter('rgb')(lch(color));
  return [clamp255(c.r * 255), clamp255(c.g * 255), clamp255(c.b * 255), c.alpha ?? 1];
}
const clamp255 = (v) => Math.max(0, Math.min(255, v));

/** Mix two [r,g,b,a] arrays linearly (fast, for per-pixel work). */
export const mixRgba = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] ?? 1) + ((b[3] ?? 1) - (a[3] ?? 1)) * t];
