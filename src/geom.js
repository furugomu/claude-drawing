// Geometry: everything is a Shape = list of points (+ closed flag).
//
// Curves are sampled densely, so every operation (wobble, offset, hatching,
// scattering, sub-paths, brush strokes) works on the same simple representation.

import { Path2D } from '@napi-rs/canvas';

const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const mixPt = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
export const deg = (d) => (d * Math.PI) / 180;

export class Shape {
  constructor(pts, closed = false) {
    this.pts = pts;
    this.closed = closed;
  }

  // ---- queries -------------------------------------------------------------
  get length() {
    let L = 0;
    const p = this.pts;
    for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]);
    if (this.closed && p.length > 1) L += dist(p[p.length - 1], p[0]);
    return L;
  }

  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of this.pts) {
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x1, y1 };
  }

  centroid() {
    let x = 0, y = 0;
    for (const p of this.pts) { x += p[0]; y += p[1]; }
    return [x / this.pts.length, y / this.pts.length];
  }

  area() {
    // signed shoelace area
    const p = this.pts;
    let a = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      a += p[i][0] * q[1] - q[0] * p[i][1];
    }
    return a / 2;
  }

  contains(x, y) {
    const p = this.pts;
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Cumulative arc lengths (length pts.length, +1 if closed). */
  cumlen() {
    const p = this.pts, c = [0];
    for (let i = 1; i < p.length; i++) c.push(c[i - 1] + dist(p[i - 1], p[i]));
    if (this.closed) c.push(c[c.length - 1] + dist(p[p.length - 1], p[0]));
    return c;
  }

  /** Point + unit tangent + unit normal at fraction t in [0,1] of arc length. */
  frame(t) {
    const p = this.pts;
    const c = this.cumlen();
    const L = c[c.length - 1];
    const s = clamp(t) * L;
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const a = p[(i - 1) % p.length], b = p[i % p.length];
    const seg = c[i] - c[i - 1] || 1;
    const u = (s - c[i - 1]) / seg;
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), tx, ty, nx: -ty, ny: tx, angle: Math.atan2(ty, tx) };
  }

  at(t) {
    const f = this.frame(t);
    return [f.x, f.y];
  }

  /** Per-point unit normals. For closed shapes they point outward. */
  normals() {
    const p = this.pts, n = p.length, out = new Array(n);
    const sign = this.closed ? (this.area() > 0 ? -1 : 1) : 1;
    for (let i = 0; i < n; i++) {
      let a, b;
      if (this.closed) { a = p[(i - 1 + n) % n]; b = p[(i + 1) % n]; }
      else { a = p[Math.max(0, i - 1)]; b = p[Math.min(n - 1, i + 1)]; }
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      out[i] = [(-ty / l) * sign, (tx / l) * sign];
    }
    return out;
  }

  // ---- transforms (all return new Shapes) -----------------------------------
  map(fn) {
    return new Shape(this.pts.map((p, i) => fn(p, i)), this.closed);
  }

  translate(dx, dy) {
    return this.map(([x, y]) => [x + dx, y + dy]);
  }

  /** Rotate by angle (radians) around origin (default: centroid). */
  rotate(a, origin = this.centroid()) {
    const [ox, oy] = origin, c = Math.cos(a), s = Math.sin(a);
    return this.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
  }

  /** Scale around origin (default: centroid). */
  scale(sx, sy = sx, origin = this.centroid()) {
    const [ox, oy] = origin;
    return this.map(([x, y]) => [ox + (x - ox) * sx, oy + (y - oy) * sy]);
  }

  reverse() {
    return new Shape(this.pts.slice().reverse(), this.closed);
  }

  close() {
    return new Shape(this.pts, true);
  }

  open() {
    return new Shape(this.closed ? [...this.pts, this.pts[0]] : this.pts, false);
  }

  /** Evenly spaced points along the outline, `step` px apart. */
  resample(step = 4) {
    const p = this.closed ? [...this.pts, this.pts[0]] : this.pts;
    if (p.length < 2) return new Shape(p.slice(), this.closed);
    const c = [0];
    for (let i = 1; i < p.length; i++) c.push(c[i - 1] + dist(p[i - 1], p[i]));
    const L = c[c.length - 1];
    const n = Math.max(this.closed ? 3 : 2, Math.round(L / step));
    const out = [];
    let j = 1;
    const count = this.closed ? n : n + 1;
    for (let k = 0; k < count; k++) {
      const s = (k / n) * L;
      while (j < c.length - 1 && c[j] < s) j++;
      const seg = c[j] - c[j - 1] || 1;
      out.push(mixPt(p[j - 1], p[j], (s - c[j - 1]) / seg));
    }
    return new Shape(out, this.closed);
  }

  /** Chaikin corner cutting. */
  smooth(iterations = 2) {
    let pts = this.pts;
    for (let it = 0; it < iterations; it++) {
      const out = [];
      const n = pts.length;
      if (!this.closed) out.push(pts[0]);
      const last = this.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        out.push(mixPt(a, b, 0.25), mixPt(a, b, 0.75));
      }
      if (!this.closed) out.push(pts[n - 1]);
      pts = out;
    }
    return new Shape(pts, this.closed);
  }

  /**
   * Hand-drawn wobble: push points along their normals by smooth noise.
   * amount: max displacement in px; freq: wiggles per 100px.
   */
  wobble(amount = 3, { freq = 1, rng, step = 3 } = {}) {
    if (!rng) throw new Error('wobble needs {rng}');
    const r = this.resample(step);
    const nr = r.normals();
    const c = r.cumlen();
    const L = c[c.length - 1];
    const off = rng.range(0, 1000);
    return r.map((p, i) => {
      let v;
      if (r.closed) {
        const R = (L * freq) / 100 / TAU, th = (c[i] / L) * TAU;
        v = rng.noise3(Math.cos(th) * R + off, Math.sin(th) * R, off);
      } else {
        v = rng.noise2((c[i] * freq) / 100 + off, off);
      }
      return [p[0] + nr[i][0] * v * amount, p[1] + nr[i][1] * v * amount];
    });
  }

  /** Recursive midpoint displacement (watercolor-style ragged edges). */
  deform(rounds = 3, amount = 0.3, { rng } = {}) {
    if (!rng) throw new Error('deform needs {rng}');
    let pts = this.pts.map((p) => ({ x: p[0], y: p[1], v: p[2] ?? rng.range(0.5, 1.5) }));
    for (let r = 0; r < rounds; r++) {
      const out = [];
      const n = pts.length;
      const last = this.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        out.push(a);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const v = ((a.v + b.v) / 2) * rng.range(0.7, 1.3);
        const sd = len * amount * v * 0.5;
        out.push({ x: (a.x + b.x) / 2 + rng.gauss(0, sd), y: (a.y + b.y) / 2 + rng.gauss(0, sd), v });
      }
      if (!this.closed) out.push(pts[n - 1]);
      pts = out;
    }
    return new Shape(pts.map((p) => [p.x, p.y, p.v]), this.closed);
  }

  /** Move every point along its normal (positive = outward for closed shapes). */
  offset(d) {
    const nr = this.normals();
    return this.map((p, i) => [p[0] + nr[i][0] * d, p[1] + nr[i][1] * d]);
  }

  /** Portion of the path between fractions t0..t1 of its length. */
  sub(t0, t1) {
    const r = this.open().resample(Math.max(0.5, this.length / 400));
    const n = r.pts.length - 1;
    const i0 = Math.round(clamp(t0) * n), i1 = Math.round(clamp(t1) * n);
    return new Shape(r.pts.slice(i0, i1 + 1), false);
  }

  /**
   * Pieces of the outline where pred(point, normal, index) holds, as open
   * Shapes (longest first). Handles wrap-around on closed shapes.
   */
  where(pred, { step = 2, minLength = 0 } = {}) {
    const r = this.resample(step);
    const nr = r.normals();
    const n = r.pts.length;
    const ok = r.pts.map((p, i) => pred(p, nr[i], i));
    if (ok.every(Boolean)) return [r.closed ? r.open() : r];
    const pieces = [];
    // start scanning just after a "false" so closed-shape runs don't get split
    const start = r.closed ? ok.indexOf(false) + 1 : 0;
    let cur = [];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (ok[i]) cur.push(r.pts[i]);
      else if (cur.length) { pieces.push(cur); cur = []; }
    }
    if (cur.length) pieces.push(cur);
    return pieces
      .filter((p) => p.length >= 2)
      .map((p) => new Shape(p, false))
      .filter((s) => s.length >= minLength)
      .sort((a, b) => b.length - a.length);
  }

  /**
   * Outline pieces whose outward normal faces `angle` (radians; e.g. toward
   * the light). min: cosine threshold (0 = anything facing, 0.7 = squarely).
   */
  facing(angle, { min = 0.3, step = 2, minLength = 10 } = {}) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    return this.where((p, [nx, ny]) => nx * dx + ny * dy > min, { step, minLength });
  }

  /** Build a Path2D. */
  path2d(path = new Path2D()) {
    const p = this.pts;
    if (!p.length) return path;
    path.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) path.lineTo(p[i][0], p[i][1]);
    if (this.closed) path.closePath();
    return path;
  }
}

// ---- constructors -----------------------------------------------------------

export const shape = (pts, closed = true) => new Shape(pts, closed);
export const polyline = (pts) => new Shape(pts, false);
export const line = (x0, y0, x1, y1) => new Shape([[x0, y0], [x1, y1]], false);

export function circle(cx, cy, r, n) {
  n ??= Math.max(24, Math.ceil((TAU * r) / 3));
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(polar(cx, cy, r, (i / n) * TAU));
  return new Shape(pts, true);
}

export function ellipse(cx, cy, rx, ry, rot = 0, n) {
  n ??= Math.max(24, Math.ceil((TAU * Math.max(rx, ry)) / 3));
  const c = Math.cos(rot), s = Math.sin(rot), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return new Shape(pts, true);
}

/** Arc from angle a0 to a1 (radians, clockwise on screen when a1 > a0). */
export function arc(cx, cy, r, a0, a1, n) {
  n ??= Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 3));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(polar(cx, cy, r, lerp(a0, a1, i / n)));
  return new Shape(pts, false);
}

export function rect(x, y, w, h, r = 0) {
  if (!r) return new Shape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
  r = Math.min(r, w / 2, h / 2);
  const pts = [];
  const corner = (cx, cy, a0) => { for (let i = 0; i <= 8; i++) pts.push(polar(cx, cy, r, a0 + (i / 8) * (Math.PI / 2))); };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return new Shape(pts, true);
}

export function regular(cx, cy, r, n, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(polar(cx, cy, r, rot + (i / n) * TAU));
  return new Shape(pts, true);
}

export function star(cx, cy, r1, r2, n = 5, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) pts.push(polar(cx, cy, i % 2 ? r2 : r1, rot + (i / (n * 2)) * TAU));
  return new Shape(pts, true);
}

/**
 * Smooth curve passing THROUGH the given points (centripetal Catmull-Rom,
 * so no cusps or self-loops). This is the main way to draw organic lines.
 */
export function curve(pts, { closed = false, alpha = 0.5, density = 3 } = {}) {
  const n = pts.length;
  if (n < 3) return new Shape(pts.slice(), closed);
  const refl = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1]];
  const P = closed ? [pts[n - 1], ...pts, pts[0], pts[1]] : [refl(pts[0], pts[1]), ...pts, refl(pts[n - 1], pts[n - 2])];
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 1; i <= segs; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const kn = (a, b) => Math.max(1e-4, Math.pow(dist(a, b), alpha));
    const t0 = 0, t1 = t0 + kn(p0, p1), t2 = t1 + kn(p1, p2), t3 = t2 + kn(p2, p3);
    const samples = Math.max(4, Math.ceil(dist(p1, p2) / density));
    for (let j = 0; j < samples; j++) {
      const t = t1 + ((t2 - t1) * j) / samples;
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return new Shape(out, closed);
}

/** Organic closed blob around (cx, cy): n control points at radius r*(1±vary). */
export function blob(cx, cy, r, { n = 7, vary = 0.2, rng, rot = 0, ry } = {}) {
  if (!rng) throw new Error('blob needs {rng}');
  const pts = [];
  const sy = (ry ?? r) / r;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU + rng.range(-0.3, 0.3) / n * TAU;
    const rr = r * (1 + rng.range(-vary, vary));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sy]);
  }
  return curve(pts, { closed: true });
}

/** Quadratic / cubic Bezier as sampled open shapes. */
export function quad(p0, c, p1, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return new Shape(pts, false);
}

export function cubic(p0, c0, c1, p1, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    pts.push([a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0], a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1]]);
  }
  return new Shape(pts, false);
}

/**
 * Poisson-disc points (Bridson) with min spacing r, inside `region`
 * (a Shape, or {x,y,w,h}). Returns [[x,y], ...].
 */
export function poisson(region, r, { rng, k = 20, max = 100000 } = {}) {
  if (!rng) throw new Error('poisson needs {rng}');
  const b = region instanceof Shape ? region.bounds() : region;
  const inside = region instanceof Shape ? (x, y) => region.contains(x, y) : () => true;
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(b.w / cell) + 1, gh = Math.ceil(b.h / cell) + 1;
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [], active = [];
  const gi = (x, y) => Math.floor((y - b.y) / cell) * gw + Math.floor((x - b.x) / cell);
  const fits = (x, y) => {
    if (x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h || !inside(x, y)) return false;
    const cx = Math.floor((x - b.x) / cell), cy = Math.floor((y - b.y) / cell);
    for (let yy = Math.max(0, cy - 2); yy <= Math.min(gh - 1, cy + 2); yy++)
      for (let xx = Math.max(0, cx - 2); xx <= Math.min(gw - 1, cx + 2); xx++) {
        const j = grid[yy * gw + xx];
        if (j >= 0 && (pts[j][0] - x) ** 2 + (pts[j][1] - y) ** 2 < r * r) return false;
      }
    return true;
  };
  const add = (p) => { grid[gi(p[0], p[1])] = pts.length; pts.push(p); active.push(p); };
  // several random seeds so disconnected parts of the region get filled too
  for (let tries = 0; tries < 60; tries++) {
    const x = rng.range(b.x, b.x + b.w), y = rng.range(b.y, b.y + b.h);
    if (fits(x, y)) add([x, y]);
  }
  while (active.length && pts.length < max) {
    const ai = Math.floor(rng() * active.length), a = active[ai];
    let found = false;
    for (let t = 0; t < k; t++) {
      const ang = rng() * TAU, rad = r * (1 + rng());
      const x = a[0] + Math.cos(ang) * rad, y = a[1] + Math.sin(ang) * rad;
      if (fits(x, y)) { add([x, y]); found = true; break; }
    }
    if (!found) active.splice(ai, 1);
  }
  return pts;
}
