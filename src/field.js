// Scalar & vector fields: organic shapes from implicit functions (metaballs,
// noise), and stroke paths traced along flow fields.

import { Shape } from './geom.js';

/**
 * Marching squares: closed contours where field(x, y) === level.
 * Inside = field > level. Returns an array of closed Shapes (largest first).
 * opts: {bounds: {x,y,w,h}, cell (px), level, smooth (chaikin iterations)}
 */
export function contour(field, { bounds, cell = 6, level = 1, smooth = 1 } = {}) {
  const { x: bx, y: by, w: bw, h: bh } = bounds;
  const nx = Math.ceil(bw / cell) + 3, ny = Math.ceil(bh / cell) + 3; // +1 cell border each side
  const X = (i) => bx + (i - 1) * cell, Y = (j) => by + (j - 1) * cell;
  const v = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const border = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
    v[j * nx + i] = border ? level - 1 : field(X(i), Y(j));
  }
  const V = (i, j) => v[j * nx + i];
  // edge points: h(i,j) between (i,j)-(i+1,j); v(i,j) between (i,j)-(i,j+1)
  const interp = (a, b) => (level - a) / (b - a);
  const pt = (id) => {
    const [k, i, j] = id;
    if (k === 0) return [X(i) + interp(V(i, j), V(i + 1, j)) * cell, Y(j)];
    return [X(i), Y(j) + interp(V(i, j), V(i, j + 1)) * cell];
  };
  const key = (k, i, j) => (k * ny + j) * nx + i;
  const next = new Map(); // directed: edge key -> next edge key
  const ids = new Map();
  const seg = (a, b) => {
    const ka = key(...a), kb = key(...b);
    ids.set(ka, a); ids.set(kb, b);
    next.set(ka, kb);
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const tl = V(i, j) > level, tr = V(i + 1, j) > level, br = V(i + 1, j + 1) > level, bl = V(i, j + 1) > level;
    const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = [0, i, j], R = [1, i + 1, j], B = [0, i, j + 1], L = [1, i, j];
    // segments oriented so that "inside" is consistently on one side
    switch (c) {
      case 1: seg(L, B); break;
      case 2: seg(B, R); break;
      case 3: seg(L, R); break;
      case 4: seg(R, T); break;
      case 5: {
        const mid = (V(i, j) + V(i + 1, j) + V(i + 1, j + 1) + V(i, j + 1)) / 4 > level;
        if (mid) { seg(L, T); seg(R, B); } else { seg(L, B); seg(R, T); }
        break;
      }
      case 6: seg(B, T); break;
      case 7: seg(L, T); break;
      case 8: seg(T, L); break;
      case 9: seg(T, B); break;
      case 10: {
        const mid = (V(i, j) + V(i + 1, j) + V(i + 1, j + 1) + V(i, j + 1)) / 4 > level;
        if (mid) { seg(T, R); seg(B, L); } else { seg(T, L); seg(B, R); }
        break;
      }
      case 11: seg(T, R); break;
      case 12: seg(R, L); break;
      case 13: seg(R, B); break;
      case 14: seg(B, L); break;
    }
  }
  const loops = [];
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const pts = [];
    let k = start;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      pts.push(pt(ids.get(k)));
      k = next.get(k);
    }
    if (pts.length >= 3) {
      let s = new Shape(pts, true);
      if (smooth) s = s.smooth(smooth);
      loops.push(s);
    }
  }
  loops.sort((a, b) => Math.abs(b.area()) - Math.abs(a.area()));
  return loops;
}

/**
 * Metaball field from circles [[x, y, r], ...] with a compact kernel.
 * blend: how much neighbouring circles melt together (0.1 crisp … 1 gooey).
 * The field equals 1 exactly on a lone circle's edge, so use level 1.
 */
export function metaballs(circles, { blend = 0.35 } = {}) {
  const s = 1 + blend;
  const edge = Math.pow(1 - 1 / (s * s), 3);
  return (x, y) => {
    let sum = 0;
    for (const [cx, cy, r] of circles) {
      const R = r * s, d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 < R * R) sum += Math.pow(1 - d2 / (R * R), 3);
    }
    return sum / edge;
  };
}

/**
 * The smooth union outline of circles [[x, y, r], ...] (largest loop).
 * opts: {blend, cell, smooth, all (return every loop)}
 */
export function blobUnion(circles, { blend = 0.35, cell = 4, smooth = 1, all = false } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, r] of circles) {
    const R = r * (1 + blend);
    x0 = Math.min(x0, x - R); y0 = Math.min(y0, y - R);
    x1 = Math.max(x1, x + R); y1 = Math.max(y1, y + R);
  }
  const loops = contour(metaballs(circles, { blend }), { bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, cell, smooth, level: 1 });
  return all ? loops : loops[0];
}

/**
 * Trace a path through a flow field starting at (x, y).
 * angle(x, y) -> radians. Traces length/2 each way (centered), step px.
 * opts.stop(x, y) -> true to stop early (e.g. leaving a shape).
 */
export function trace(angle, x, y, { length = 60, step = 3, stop } = {}) {
  const walk = (dir) => {
    const pts = [];
    let px = x, py = y, prev;
    for (let s = 0; s < length / 2; s += step) {
      let a = angle(px, py) + (dir < 0 ? Math.PI : 0);
      // keep direction consistent (fields are often orientation-only)
      if (prev !== undefined && Math.cos(a - prev) < 0) a += Math.PI;
      prev = a;
      px += Math.cos(a) * step; py += Math.sin(a) * step;
      if (stop && stop(px, py)) break;
      pts.push([px, py]);
    }
    return pts;
  };
  const back = walk(-1).reverse();
  return new Shape([...back, [x, y], ...walk(1)], false);
}
