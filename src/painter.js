// Painter: a thin, opinionated layer over a canvas 2D context.
//
// Coordinates are always "design pixels" (meta.width x meta.height); the render
// scale is applied underneath, so scenes never care about output resolution.

import { createCanvas, Path2D } from '@napi-rs/canvas';
import { Shape, clamp, lerp, smoothstep, poisson, profile, strokeOutline, thick, curve } from './geom.js';
import { trace } from './field.js';
import { css, jitter as jitterColor, gradientStops, ramp, alpha } from './color.js';
import { makeRng } from './random.js';

const TAU = Math.PI * 2;

/** Gradient / paint descriptors (resolved lazily against a ctx). */
export const linear = (x0, y0, x1, y1, stops) => ({ kind: 'linear', x0, y0, x1, y1, stops });
export const radial = (cx, cy, r, stops, { fx = cx, fy = cy, r0 = 0 } = {}) => ({ kind: 'radial', cx, cy, r, fx, fy, r0, stops });
export const conic = (cx, cy, angle, stops) => ({ kind: 'conic', cx, cy, angle, stops });

function resolvePaint(ctx, paint) {
  if (paint == null) return null;
  if (typeof paint === 'string') return css(paint);
  let g;
  if (paint.kind === 'linear') g = ctx.createLinearGradient(paint.x0, paint.y0, paint.x1, paint.y1);
  else if (paint.kind === 'radial') g = ctx.createRadialGradient(paint.fx, paint.fy, paint.r0, paint.cx, paint.cy, paint.r);
  else if (paint.kind === 'conic') g = ctx.createConicGradient(paint.angle, paint.cx, paint.cy);
  else return paint; // assume native CanvasGradient/Pattern
  for (const [o, c] of gradientStops(paint.stops)) g.addColorStop(clamp(o), c);
  return g;
}

/** Color of a paint (css string or gradient descriptor) at design point (x, y). */
export function samplePaint(paint, x, y) {
  if (typeof paint === 'string') return css(paint);
  let t;
  if (paint.kind === 'linear') {
    const dx = paint.x1 - paint.x0, dy = paint.y1 - paint.y0;
    t = ((x - paint.x0) * dx + (y - paint.y0) * dy) / (dx * dx + dy * dy || 1);
  } else if (paint.kind === 'radial') {
    t = (Math.hypot(x - paint.cx, y - paint.cy) - paint.r0) / (paint.r - paint.r0 || 1);
  } else if (paint.kind === 'conic') {
    t = ((((Math.atan2(y - paint.cy, x - paint.cx) - paint.angle) % TAU) + TAU) % TAU) / TAU;
  } else throw new Error('cannot sample this paint');
  return ramp(paint.stops, clamp(t));
}

const toPath = (shapes) => {
  if (shapes instanceof Shape) return shapes.path2d();
  let path;
  for (const s of shapes) path = s.path2d(path);
  return path;
};

export class Painter {
  constructor(canvas, env, rng) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.env = env;
    this.rng = rng;
  }

  get W() { return this.env.W; }
  get H() { return this.env.H; }

  // ---- state -----------------------------------------------------------------

  /** Run fn with temporary ctx state: {alpha, blend, filter, shadow:{color,blur,x,y}}. */
  with(opts, fn) {
    const ctx = this.ctx;
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
    if (opts.blend) ctx.globalCompositeOperation = opts.blend;
    if (opts.filter) ctx.filter = opts.filter;
    if (opts.shadow) {
      const s = opts.shadow, k = this.env.scale;
      ctx.shadowColor = css(s.color ?? 'rgba(0,0,0,0.4)');
      ctx.shadowBlur = (s.blur ?? 10) * k;
      ctx.shadowOffsetX = (s.x ?? 0) * k;
      ctx.shadowOffsetY = (s.y ?? 0) * k;
    }
    try { return fn(this); } finally { ctx.restore(); }
  }

  /**
   * Run fn with its own random sequence, derived from the layer seed + name.
   * What's drawn inside no longer depends on how much randomness earlier
   * drawing consumed — so tweaking one element (or a tool) can't reshuffle it.
   */
  scope(name, fn) {
    const saved = this.rng;
    this.rng = saved.fork(name);
    try { return fn(this); } finally { this.rng = saved; }
  }

  /** Draw in a local coordinate frame: at(x, y, {rotate, scale, sx, sy}, fn) */
  at(x, y, opts, fn) {
    if (typeof opts === 'function') { fn = opts; opts = {}; }
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    if (opts.rotate) ctx.rotate(opts.rotate);
    const s = opts.scale ?? 1;
    if (s !== 1 || opts.sx || opts.sy) ctx.scale(opts.sx ?? s, opts.sy ?? s);
    try { return fn(this); } finally { ctx.restore(); }
  }

  /** Draw only inside shape(s). */
  clip(shapes, fn, { rule = 'nonzero' } = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.clip(toPath(shapes), rule);
    try { return fn(this); } finally { ctx.restore(); }
  }

  /**
   * Draw into an offscreen buffer, then composite it back.
   *   {alpha, blend, blur, filter, mask}
   * mask: Shape (keep inside) or fn(p) drawing a soft alpha mask.
   */
  group(opts, fn) {
    if (typeof opts === 'function') { fn = opts; opts = {}; }
    const { width, height } = this.canvas;
    const child = new Painter(createCanvas(width, height), this.env, opts.rng ?? this.rng);
    child.ctx.setTransform(this.ctx.getTransform());
    fn(child);
    if (opts.mask) child.applyMask(opts.mask);
    this.composite(child.canvas, opts);
    return child;
  }

  applyMask(mask) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    if (mask instanceof Shape || Array.isArray(mask)) {
      ctx.fillStyle = '#000';
      ctx.fill(toPath(mask));
    } else {
      const { width, height } = this.canvas;
      const m = new Painter(createCanvas(width, height), this.env, this.rng);
      m.ctx.setTransform(ctx.getTransform());
      mask(m);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(m.canvas, 0, 0);
    }
    ctx.restore();
  }

  /** Composite a same-size pixel buffer onto this canvas. */
  composite(canvas, { alpha = 1, blend, blur, filter } = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha *= alpha;
    if (blend) ctx.globalCompositeOperation = blend;
    const f = [filter, blur ? `blur(${blur * this.env.scale}px)` : null].filter(Boolean).join(' ');
    if (f) ctx.filter = f;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }

  // ---- basic drawing ---------------------------------------------------------

  /** Fill shape(s) with a color or gradient. opts: {alpha, blend, rule, shadow} */
  fill(shapes, paint, opts = {}) {
    return this.with(opts, () => {
      this.ctx.fillStyle = resolvePaint(this.ctx, paint);
      this.ctx.fill(toPath(shapes), opts.rule ?? 'nonzero');
    });
  }

  /** Uniform-width stroke. opts: {alpha, blend, cap, join, dash} */
  stroke(shapes, paint, width = 2, opts = {}) {
    return this.with(opts, () => {
      const ctx = this.ctx;
      ctx.strokeStyle = resolvePaint(ctx, paint);
      ctx.lineWidth = width;
      ctx.lineCap = opts.cap ?? 'round';
      ctx.lineJoin = opts.join ?? 'round';
      if (opts.dash) ctx.setLineDash(opts.dash);
      ctx.stroke(toPath(shapes));
    });
  }

  /** Fill the whole canvas. */
  background(paint) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = resolvePaint(ctx, paint);
    ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
    ctx.restore();
  }

  text(str, x, y, { size = 24, font = 'DejaVu Sans', weight = '', color = '#222', align = 'left', baseline = 'alphabetic', alpha } = {}) {
    return this.with({ alpha }, () => {
      const ctx = this.ctx;
      ctx.font = `${weight} ${size}px "${font}"`.trim();
      ctx.fillStyle = css(color);
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.fillText(str, x, y);
    });
  }

  // ---- expressive strokes ----------------------------------------------------

  static profile(width, opts) { return profile(width, opts); }
  static strokeOutline(shape, widthAt, step) { return strokeOutline(shape, widthAt, step); }

  /**
   * Ink line: smooth, variable width, tapered ends. The workhorse for line art.
   * opts: {width, color, taper, pressure, wobble, alpha, blend}
   */
  ink(shape, { width = 3, color = '#1a1a1a', taper = 0.2, pressure, wobble = 0, wobbleFreq = 1, ...opts } = {}) {
    let s = shape;
    if (wobble) s = s.wobble(wobble, { rng: this.rng, freq: wobbleFreq });
    const outline = Painter.strokeOutline(s, Painter.profile(width, { taper, pressure }), Math.min(1.5, width / 3 + 0.3));
    return this.fill(outline, color, opts);
  }

  // ---- offscreen helpers -----------------------------------------------------

  /**
   * Draw into a temporary buffer that only covers `bounds` (+pad), in the
   * current coordinate frame, then composite it back: {alpha, blend, blur}.
   * fn(buf) gets a Painter; buf.origin = [x0, y0] in canvas pixels.
   */
  buffered(bounds, pad, fn, { alpha = 1, blend, blur } = {}) {
    const m = this.ctx.getTransform();
    const xs = [], ys = [];
    for (const [x, y] of [[bounds.x - pad, bounds.y - pad], [bounds.x + bounds.w + pad, bounds.y - pad], [bounds.x - pad, bounds.y + bounds.h + pad], [bounds.x + bounds.w + pad, bounds.y + bounds.h + pad]]) {
      xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f);
    }
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const x1 = Math.min(this.canvas.width, Math.ceil(Math.max(...xs))), y1 = Math.min(this.canvas.height, Math.ceil(Math.max(...ys)));
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    const buf = new Painter(createCanvas(x1 - x0, y1 - y0), this.env, this.rng);
    buf.origin = [x0, y0];
    buf.ctx.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    fn(buf);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha *= alpha;
    if (blend) ctx.globalCompositeOperation = blend;
    if (blur) ctx.filter = `blur(${blur * this.env.scale}px)`;
    ctx.drawImage(buf.canvas, x0, y0);
    ctx.restore();
  }

  /** Direct pixel access: fn(data, w, h, x0, y0) where (x0,y0) = canvas-pixel origin. */
  pixels(fn) {
    const { width, height } = this.canvas;
    const img = this.ctx.getImageData(0, 0, width, height);
    const [x0, y0] = this.origin ?? [0, 0];
    fn(img.data, width, height, x0, y0);
    this.ctx.putImageData(img, 0, 0);
  }

  /** Paper tooth at design coords (x, y): 0 = valley, 1 = peak. Tileable, shared by all tools. */
  tooth(x, y) {
    const T = (this.env.toothTex ??= makeToothTexture(this.env.seed));
    const N = 256;
    const xi = ((Math.floor(x * 1.0) % N) + N) % N, yi = ((Math.floor(y * 1.0) % N) + N) % N;
    return T[yi * N + xi];
  }

  // ---- painterly strokes -----------------------------------------------------

  /**
   * Bristle brush (gouache/oil feel): solid body, streaky texture on top,
   * dry-brush gaps erased along the bristle lanes.
   * opts: {width, color, alpha, dry (0..1), taper, pressure, streaks, blend, wobble}
   */
  brush(shape, {
    width = 16, color = '#333', alpha = 0.95, dry = 0.2, taper = [0, 0.25], pressure,
    streaks = 1, blend, wobble = 0,
  } = {}) {
    const rng = this.rng;
    let s = shape.open();
    if (wobble) s = s.wobble(wobble, { rng });
    const r = s.resample(Math.max(1, Math.min(2.5, width / 10)));
    const nr = r.normals();
    const n = r.pts.length;
    if (n < 2) return;
    const widthAt = Painter.profile(width, { taper, pressure });
    const ws = r.pts.map((_, i) => widthAt(i / (n - 1)));
    const L = r.length;
    // streak/dry lanes are smooth, so they only need a vertex every ~5px
    const stride = Math.max(1, Math.round(5 / (L / (n - 1) || 1)));
    const lane = (u, from = 0, to = 1) => {
      const pts = [];
      const i0 = Math.floor(from * (n - 1)), i1 = Math.ceil(to * (n - 1));
      for (let j = i0; j <= i1 + stride - 1; j += stride) {
        const i = Math.min(j, i1);
        const o = u * ws[i];
        pts.push([r.pts[i][0] + nr[i][0] * o, r.pts[i][1] + nr[i][1] * o]);
      }
      return pts;
    };
    const polyPath = (ctx, pts) => { pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };

    this.buffered(r.bounds(), width, (b) => {
      const ctx = b.ctx;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // 1. body — outline with slightly ragged edges and a round start
      const off = rng.range(0, 999);
      const rough = (i, side) => 1 + 0.06 * rng.noise2(off + side * 50, (i * L) / n / 9) + 0.03 * rng.noise2(off - side * 50, (i * L) / n / 2);
      const left = [], right = [];
      for (let i = 0; i < n; i++) {
        const w = ws[i] / 2, [x, y] = r.pts[i], [nx, ny] = nr[i];
        left.push([x + nx * w * rough(i, 0), y + ny * w * rough(i, 0)]);
        right.push([x - nx * w * rough(i, 1), y - ny * w * rough(i, 1)]);
      }
      const cap = (p, nrm, w) => {
        const out = [], a0 = Math.atan2(nrm[1], nrm[0]);
        for (let q = 1; q < 10; q++) {
          const a = a0 - (q / 10) * Math.PI, rr = w * (1 + 0.05 * rng.range(-1, 1));
          out.push([p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr]);
        }
        return out;
      };
      ctx.fillStyle = css(color);
      ctx.beginPath();
      polyPath(ctx, [...left, ...cap(r.pts[n - 1], nr[n - 1], ws[n - 1] / 2), ...right.reverse(), ...cap(r.pts[0], [-nr[0][0], -nr[0][1]], ws[0] / 2)]);
      ctx.closePath();
      ctx.fill();
      // 2. streaks — lighter/darker strands that stay inside the body.
      //    Four color/width variants per stroke, each drawn as a single path.
      if (streaks > 0) {
        ctx.globalCompositeOperation = 'source-atop';
        const ns = Math.max(3, Math.round((width / 2.2) * streaks));
        const variants = [0, 1, 2, 3].map(() => ({
          color: jitterColor(color, rng, { l: 0.09, c: 0.2, h: 5 }),
          alpha: rng.range(0.15, 0.42),
          w: Math.max(0.6, (width / ns) * rng.range(0.6, 2)),
          path: new Path2D(),
        }));
        for (let k = 0; k < ns; k++) {
          const v = variants[k % 4];
          const pts = lane(rng.range(-0.5, 0.5), rng.range(0, 0.3), rng.range(0.6, 1));
          pts.forEach(([x, y], i) => (i ? v.path.lineTo(x, y) : v.path.moveTo(x, y)));
        }
        for (const v of variants) {
          ctx.strokeStyle = v.color;
          ctx.globalAlpha = v.alpha;
          ctx.lineWidth = v.w;
          ctx.stroke(v.path);
        }
      }
      // 3. dry brush — erase gaps along lanes; more at the edges and toward the end
      if (dry > 0) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        const nl = Math.max(6, Math.round(width / 0.9));
        // lanes are batched into a few width classes: one stroke() call per class
        const classes = [0.3, 0.5, 0.7].map((k) => ({ w: Math.max(0.5, (width / nl) * k), path: new Path2D() }));
        for (let k = 0; k < nl; k++) {
          const u = ((k + rng.range(0, 1)) / nl - 0.5) * 1.04;
          const edge = Math.abs(u) * 2;
          const path = classes[k % 3].path;
          const pts = lane(u);
          const lo = rng.range(0, 999);
          let pen = false;
          let g = 0;
          const every = Math.max(1, Math.round(6 / (L / pts.length || 1)));
          for (let i = 0; i < pts.length; i++) {
            const t = i / (pts.length - 1);
            // the gap pattern varies slowly (tens of px), so sample it every ~6px
            if (i % every === 0) g = rng.noise2(lo, (t * L) / 160) * 0.7 + rng.noise2(lo + 7, (t * L) / 45) * 0.3;
            // threshold falls with dryness, edge-ness and distance along the stroke
            const th = 1 - dry * (0.5 + 0.9 * edge * edge + 1.4 * t * t);
            if (g > th) { if (!pen) { path.moveTo(...pts[i]); pen = true; } else path.lineTo(...pts[i]); }
            else pen = false;
          }
        }
        for (const c of classes) { ctx.lineWidth = c.w; ctx.stroke(c.path); }
      }
    }, { alpha, blend });
  }

  /**
   * Graphite: a thin variable-width line whose opacity follows the paper tooth.
   * opts: {width, color, alpha, pressure (fn/array), grain (0..1), taper}
   */
  pencil(shape, { width = 2, color = '#2a2a2a', alpha = 0.85, grain = 0.75, taper = 0.12, pressure, wobble = 0.4 } = {}) {
    let s = shape.open();
    if (wobble) s = s.wobble(wobble, { rng: this.rng, freq: 3 });
    const outline = Painter.strokeOutline(s, Painter.profile(width, { taper, pressure }), 0.8);
    const k = this.env.scale;
    this.buffered(outline.bounds(), 2, (b) => {
      b.fill(outline, color);
      b.pixels((d, w, h, x0, y0) => {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (!d[i + 3]) continue;
          const g = this.tooth((x0 + x) / k, (y0 + y) / k);
          d[i + 3] *= 1 - grain * (1 - g);
        }
      });
    }, { alpha });
  }

  /**
   * Watercolor wash (Tyler Hobbs' layered-deformation technique + blooms and
   * granulation from the paper tooth).
   * opts: {color, layers, alpha, spread, rounds, points, edge, bloom, granulation, soft, blend}
   *   spread: how ragged/bleedy the edge is (0.1 tight … 0.6 wild)
   *   edge:   pigment pooled at the boundary (0..1)
   *   bloom:  blotchy density variation inside (0..1)
   *   soft:   blur radius for wet-in-wet softness
   */
  wash(shape, {
    color = '#3a6ea5', layers = 30, alpha = 0.07, spread = 0.3, rounds = 3, points = 16, edge = 0.5,
    bloom = 0.5, granulation = 0.35, soft = 0, blend,
  } = {}) {
    const rng = this.rng;
    const base = shape.close().resample(Math.max(4, shape.length / points)).deform(2, spread * 0.5, { rng });
    const bb = base.bounds();
    const c = css(color);
    const k = this.env.scale;
    const bloomOff = rng.range(0, 999);
    this.buffered(bb, Math.max(bb.w, bb.h) * spread * 0.6 + soft * 2, (b) => {
      const ctx = b.ctx;
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      for (let i = 0; i < layers; i++) {
        const s = base.deform(rounds, spread, { rng });
        const path = s.path2d();
        ctx.globalAlpha = alpha;
        ctx.fill(path);
        if (edge > 0) {
          ctx.globalAlpha = alpha * edge;
          ctx.lineWidth = 2;
          ctx.stroke(path);
        }
      }
      if (bloom > 0 || granulation > 0) {
        b.pixels((d, w, h, x0, y0) => {
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (!d[i + 3]) continue;
            const X = (x0 + x) / k, Y = (y0 + y) / k;
            let m = 1;
            if (bloom > 0) m -= bloom * 0.5 * (0.5 + 0.5 * rng.fbm(X * 0.012 + bloomOff, Y * 0.012, { octaves: 3 }));
            if (granulation > 0) m -= granulation * 0.6 * (1 - this.tooth(X, Y));
            d[i + 3] *= Math.max(0, m);
          }
        });
      }
    }, { blend, blur: soft });
  }

  /**
   * Cover an area with brush strokes that follow a direction field — the way a
   * painter actually fills a region.
   *   angle:   radians, or fn(x, y) -> radians (strokes curve along it)
   *   colors:  array (picked at random), a paint (gradient sampled per stroke),
   *            or fn(x, y, rng) -> color
   *   width:   number or [min, max];  length: number or [min, max]
   *   spacing: distance between stroke centres (default width * 0.7)
   *   tool:    'brush' | 'ink' | 'pencil';   clip: keep inside the shape (default true)
   *   ...rest is passed to the tool (dry, alpha, taper, ...)
   */
  strokes(shape, {
    angle = 0, colors = ['#555'], width = 10, length = [30, 70], spacing, tool = 'brush', clip = true,
    jitter = 0.15, ...toolOpts
  } = {}) {
    const rng = this.rng;
    const pick = (v) => (Array.isArray(v) ? rng.range(v[0], v[1]) : v);
    const wMax = Array.isArray(width) ? width[1] : width;
    spacing ??= wMax * 0.7;
    const b = shape.bounds();
    const region = { x: b.x - wMax, y: b.y - wMax, w: b.w + wMax * 2, h: b.h + wMax * 2 };
    const seeds = poisson(region, spacing, { rng }).filter(([x, y]) => shape.contains(x, y) || (clip && nearShape(shape, x, y, wMax)));
    const angleAt = typeof angle === 'function' ? angle : () => angle;
    const colorAt = typeof colors === 'function' ? colors
      : Array.isArray(colors) ? () => rng.pick(colors)
      : (x, y) => jitterColor(samplePaint(colors, x, y), rng, { l: 0.03, c: 0.1, h: 3 });
    const draw = () => {
      for (const [x, y] of rng.shuffle(seeds)) {
        const a0 = rng.gauss(0, jitter);
        const path = trace((px, py) => angleAt(px, py) + a0, x, y, { length: pick(length), step: 3 });
        if (path.pts.length < 2) continue;
        this[tool](path, { width: pick(width), color: colorAt(x, y, rng), ...toolOpts });
      }
    };
    if (clip) this.clip(shape, draw); else draw();
  }

  /**
   * Painterly fill: flat fill underneath, then brush strokes whose colors are
   * sampled from the same paint (color or gradient). Extra opts go to strokes().
   */
  fillPainted(shape, paint, { angle = 0, width = [6, 12], length = [20, 50], dry = 0.35, alpha = 0.75, ...opts } = {}) {
    this.fill(shape, paint);
    this.strokes(shape, { colors: typeof paint === 'string' ? (x, y, rng) => jitterColor(paint, rng) : paint, angle, width, length, dry, alpha, ...opts });
  }

  /**
   * Hatching inside a shape.
   * opts: {angle (rad), spacing, width, color, alpha, jitter, cross, ink, taper}
   */
  hatch(shape, { angle = -Math.PI / 4, spacing = 7, width = 1.2, color = '#222', alpha = 1, jitter = 0.35, cross = false, wobble = 0.6, taper = 0.25, falloff } = {}) {
    const rng = this.rng;
    const b = shape.bounds();
    const R = Math.hypot(b.w, b.h) / 2 + spacing;
    const angles = cross ? [angle, angle + (typeof cross === 'number' ? cross : Math.PI / 2)] : [angle];
    this.clip(shape, () => this.with({ alpha }, () => {
      for (const a of angles) {
        const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
        for (let o = -R; o <= R; o += spacing) {
          const oo = o + rng.range(-jitter, jitter) * spacing;
          const cx = b.cx + px * oo, cy = b.cy + py * oo;
          const ext = R * 1.05;
          const ln = new Shape([[cx - dx * ext, cy - dy * ext], [cx + dx * ext, cy + dy * ext]], false);
          let w = width * rng.range(0.75, 1.25);
          if (falloff) w *= falloff(cx, cy);
          if (w < 0.05) continue;
          this.ink(ln, { width: w, color, taper, wobble });
        }
      }
    }));
  }

  /**
   * A point light that only falls on what's already painted on this canvas
   * (so empty water/sky stays dark). Use inside the layer of the lit subject.
   * opts: {strength, blend ('screen' | 'overlay' | 'lighter' ...), falloff}
   */
  illuminate(x, y, radius, color, { strength = 0.8, blend = 'screen', falloff = [[0, 1], [0.35, 0.45], [1, 0]] } = {}) {
    const { width, height } = this.canvas;
    const light = createCanvas(width, height);
    const lctx = light.getContext('2d');
    lctx.setTransform(this.ctx.getTransform());
    const g = lctx.createRadialGradient(x, y, 0, x, y, radius);
    for (const [o, a] of falloff) g.addColorStop(o, alpha(css(color), a * strength));
    lctx.fillStyle = g;
    lctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(this.canvas, 0, 0);
    this.composite(light, { blend });
  }

  /**
   * Lens (raindrop, glass bead, bubble): shows `source` (a layer Painter or
   * canvas) through the shape — inverted and minified like a real droplet.
   * opts: {zoom (field-of-view multiplier), invert, edge (dark rim 0..1),
   *        highlight (0..1), light (angle the specular faces), caustic (0..1),
   *        base (layer drawn un-inverted underneath, e.g. ambient light), baseAlpha,
   *        blend (how the inverted image goes over the base, e.g. 'screen')}
   */
  lens(shape, source, { zoom = 3, invert = true, edge = 0.55, highlight = 0.8, light = -2.3, caustic = 0.35, base, baseAlpha = 1, blend } = {}) {
    const src = source.canvas ?? source;
    const b = shape.bounds();
    const r = Math.max(b.w, b.h) / 2;
    const m = this.ctx.getTransform();
    const px = m.a * b.cx + m.c * b.cy + m.e, py = m.b * b.cx + m.d * b.cy + m.f;
    this.clip(shape, () => {
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (base) {
        ctx.globalAlpha = baseAlpha;
        ctx.drawImage(base.canvas ?? base, 0, 0);
        ctx.globalAlpha = 1;
      }
      if (blend) ctx.globalCompositeOperation = blend;
      const s = (invert ? -1 : 1) / zoom;
      ctx.translate(px, py);
      ctx.scale(s, s);
      ctx.translate(-px, -py);
      ctx.drawImage(src, 0, 0);
      ctx.restore();
      if (edge > 0) {
        this.fill(shape, { kind: 'radial', cx: b.cx, cy: b.cy, r, fx: b.cx, fy: b.cy, r0: 0, stops: [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${edge})`]] });
      }
      if (caustic > 0) {
        // light focused through the drop pools on the side away from the light
        const cx = b.cx - Math.cos(light) * r * 0.45, cy = b.cy - Math.sin(light) * r * 0.45;
        this.fill(shape, { kind: 'radial', cx, cy, r: r * 0.6, fx: cx, fy: cy, r0: 0, stops: [`rgba(255,255,255,${caustic * 0.5})`, 'rgba(255,255,255,0)'] }, { blend: 'screen' });
      }
    });
    if (highlight > 0 && r > 1.5) {
      const hx = b.cx + Math.cos(light) * r * 0.5, hy = b.cy + Math.sin(light) * r * 0.5;
      this.fill(new Shape(ellipsePts(hx, hy, Math.max(0.6, r * 0.22), Math.max(0.5, r * 0.15), light), true), `rgba(255,255,255,${highlight})`);
    }
  }

  /**
   * A round dot, optionally out of focus. `blur` approximates a Gaussian-blurred
   * disc with a radial gradient — far cheaper than glow() for stars, snow,
   * bokeh and particles. opts: {blur, alpha, blend}
   */
  dot(x, y, r, color, { blur = 0, alpha: a = 1, blend } = {}) {
    const c = css(color);
    if (blur <= 0.3) return this.fill(circleShape(x, y, r), c, { alpha: a, blend });
    const R = r + blur * 2.5;
    const at = (d) => Math.max(0, Math.min(1, d / R));
    const stops = [
      [0, c],
      [at(Math.max(0, r - blur)), c],
      [at(r), alpha(c, 0.5)],
      [at(r + blur), alpha(c, 0.16)],
      [at(r + blur * 2), alpha(c, 0.03)],
      [1, alpha(c, 0)],
    ];
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha *= a;
    if (blend) ctx.globalCompositeOperation = blend;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    for (const [o, col] of stops) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Soft glow: blurred copy of the shape(s). */
  glow(shapes, color, radius = 20, { alpha = 1, blend = 'screen' } = {}) {
    const list = shapes instanceof Shape ? [shapes] : shapes;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of list) {
      const b = s.bounds();
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    this.buffered({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, radius * 3, (b) => b.fill(shapes, color), { alpha, blend, blur: radius });
  }

  /**
   * Procedural color field. fn(x, y) -> [r, g, b, a] (rgb 0..255, a 0..1) or
   * null, evaluated every `res` design px and smoothly upscaled — for haze,
   * nebulae, fog, light falloff. opts: {bounds, res, alpha, blend, blur}
   */
  raster(fn, { bounds, res = 4, alpha = 1, blend, blur = 0 } = {}) {
    const b = bounds ?? { x: 0, y: 0, w: this.W, h: this.H };
    const gw = Math.max(1, Math.ceil(b.w / res)), gh = Math.max(1, Math.ceil(b.h / res));
    const small = createCanvas(gw, gh);
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(gw, gh);
    const d = img.data;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const c = fn(b.x + (i + 0.5) * res, b.y + (j + 0.5) * res);
      if (!c) continue;
      const k = (j * gw + i) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = (c[3] ?? 1) * 255;
    }
    sctx.putImageData(img, 0, 0);
    this.with({ alpha, blend, filter: blur ? `blur(${blur * this.env.scale}px)` : undefined }, () => {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
      this.ctx.drawImage(small, b.x, b.y, gw * res, gh * res);
    });
  }

  /**
   * Water reflection: mirror `sources` (Painters or canvases, e.g. layers
   * returned by t.layer) about the horizontal line y = axis, with ripples.
   * opts: {ripple (px), wavelength (px), fade: [alphaAtAxis, alphaAtBottom],
   *        depth (px the reflection reaches), blur, tint, tintAlpha, stretch}
   */
  reflect(sources, { axis, ripple = 3, wavelength = 7, fade = [0.75, 0.1], depth, blur = 0.8, tint, tintAlpha = 0.35, stretch = 1 } = {}) {
    const k = this.env.scale;
    const { width, height } = this.canvas;
    const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).map((s) => s.canvas ?? s);
    // flatten sources
    const src = createCanvas(width, height);
    const sctx = src.getContext('2d');
    for (const c of list) sctx.drawImage(c, 0, 0);
    const out = createCanvas(width, height);
    const o = out.getContext('2d');
    const A = Math.round(axis * k);
    const D = Math.round((depth ?? this.env.H - axis) * k);
    const rng = this.rng.fork('reflect');
    const off = rng.range(0, 999);
    for (let y = 0; y < D && A + y < height; y++) {
      const sy = Math.round(A - y / stretch);
      if (sy < 0) break;
      const Y = y / k;
      const dx = ripple * k * (0.65 * rng.noise2(off, Y / wavelength) + 0.35 * rng.noise2(off + 50, Y / (wavelength * 0.37))) * (0.4 + (0.6 * y) / D);
      o.drawImage(src, 0, sy, width, 1, dx, A + y, width, 1);
    }
    // fade with distance from the axis
    o.globalCompositeOperation = 'destination-in';
    const g = o.createLinearGradient(0, A, 0, A + D);
    g.addColorStop(0, `rgba(0,0,0,${fade[0]})`);
    g.addColorStop(1, `rgba(0,0,0,${fade[1]})`);
    o.fillStyle = g;
    o.fillRect(0, A, width, D);
    if (tint) {
      o.globalCompositeOperation = 'source-atop';
      o.globalAlpha = tintAlpha;
      o.fillStyle = css(tint);
      o.fillRect(0, A, width, D);
    }
    this.composite(out, { blur });
  }

  /**
   * Darken (or tint) toward the edges to pull the eye inward.
   * opts: {color, cx, cy (focus point, design px), inner (0..1 clear radius), blend}
   */
  vignette(strength = 0.35, { color = '#000', cx = this.W / 2, cy = this.H / 2, inner = 0.4, blend } = {}) {
    const R = Math.hypot(Math.max(cx, this.W - cx), Math.max(cy, this.H - cy));
    const c = css(color);
    this.fill(new Shape([[-10, -10], [this.W + 10, -10], [this.W + 10, this.H + 10], [-10, this.H + 10]], true),
      { kind: 'radial', cx, cy, r: R, fx: cx, fy: cy, r0: 0, stops: [[0, alpha(c, 0)], [inner, alpha(c, 0)], [1, alpha(c, strength)]] }, { blend });
  }

  // ---- motifs ----------------------------------------------------------------

  /**
   * Snow (or anything that settles) piled on every upward-facing edge.
   * opts: {color, shade, min (how flat an edge must be, 0..1), wobble}
   */
  snowcap(shape, depth = 20, { color = '#e8eef8', shade = '#aab6cf', min = 0.55, exclude } = {}) {
    for (const edge of shape.facing(-Math.PI / 2, { min, minLength: 8, exclude })) {
      const cap = thick(edge.translate(0, -depth * 0.35), (u) => depth * Math.pow(Math.sin(Math.PI * u), 0.35) * this.rng.range(0.9, 1.1));
      const b = edge.bounds();
      this.fill(cap.wobble(depth * 0.12, { rng: this.rng, freq: 3 }), { kind: 'linear', x0: 0, y0: b.y - depth, x1: 0, y1: b.y + depth * 0.6, stops: [color, shade] });
    }
  }

  /**
   * A branching limb (bare tree, twig, coral, lightning...) grown recursively.
   *   angle: radians (−π/2 = straight up); length/width of the first segment
   *   opts: {depth, color, spread, bend, shrink, kids: [min,max], taper, draw}
   * `draw(p, curve, width, depth)` overrides how each segment is painted.
   * Returns the list of tip points (handy for blossoms, leaves, snow).
   */
  branch(x, y, angle, length, width, {
    depth = 4, color = '#1a1410', spread = 0.9, bend = 0.25, shrink = 0.6, kids = [2, 3], lift = -0.25, draw,
  } = {}) {
    const rng = this.rng, tips = [];
    const grow = (x, y, ang, len, w, d) => {
      const bd = rng.gauss(0, bend);
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const u = i / 4, a = ang + bd * u;
        pts.push([x + Math.cos(a) * len * u + rng.gauss(0, len * 0.02), y + Math.sin(a) * len * u + rng.gauss(0, len * 0.02)]);
      }
      const c = curve(pts);
      if (draw) draw(this, c, w, d);
      else this.ink(c, { width: w, color, taper: [0, 0.25], pressure: [1, 0.8, 0.6] });
      if (d <= 0 || w < 1.2) { tips.push(pts[4]); return; }
      const n = rng.int(kids[0], kids[1]);
      for (let k = 0; k < n; k++) {
        const [sx, sy] = c.at(0.45 + 0.55 * rng());
        grow(sx, sy, ang + bd + rng.range(-spread, spread) + lift * Math.sign(Math.cos(ang)), len * rng.range(0.45, 0.7), w * shrink, d - 1);
      }
      grow(pts[4][0], pts[4][1], ang + bd + rng.gauss(0, 0.2), len * 0.7, w * 0.7, d - 1);
    };
    grow(x, y, angle, length, width, depth);
    return tips;
  }

  // ---- pixel effects ---------------------------------------------------------

  /** Film/paper grain over what's on this canvas. amount ~0.02–0.1 */
  grain(amount = 0.04, { mono = true } = {}) {
    const { width, height } = this.canvas;
    const img = this.ctx.getImageData(0, 0, width, height);
    const d = img.data, rng = this.rng.fork('grain'), A = amount * 255;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      if (mono) {
        const v = (rng() - 0.5) * A * 2;
        d[i] += v; d[i + 1] += v; d[i + 2] += v;
      } else {
        d[i] += (rng() - 0.5) * A * 2; d[i + 1] += (rng() - 0.5) * A * 2; d[i + 2] += (rng() - 0.5) * A * 2;
      }
    }
    this.ctx.putImageData(img, 0, 0);
  }

  /**
   * Paper texture: soft blotches + fine fibre grain, multiplied over everything.
   * opts: {strength, scale}
   */
  paper({ strength = 0.08, scale = 1, tint = '#f3ead8' } = {}) {
    const { width, height } = this.canvas;
    const k = this.env.scale;
    const rng = this.rng.fork('paper');
    const img = this.ctx.getImageData(0, 0, width, height);
    const d = img.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const X = x / k / scale, Y = y / k / scale;
        const blotch = rng.fbm(X * 0.004, Y * 0.004, { octaves: 3 });
        const fibre = rng.noise2(X * 0.08, Y * 0.5) * 0.5 + rng.noise2(X * 0.6, Y * 0.6) * 0.5;
        const v = 1 - strength * (0.5 + 0.35 * blotch + 0.35 * fibre);
        const i = (y * width + x) * 4;
        d[i] *= v; d[i + 1] *= v; d[i + 2] *= v;
      }
    }
    this.ctx.putImageData(img, 0, 0);
  }

  // ---- debug helpers (visible only with --debug) -------------------------------

  /** Label a point; shows as a crosshair + name in debug renders. */
  mark(name, x, y) {
    const m = this.ctx.getTransform(), k = this.env.scale;
    this.env.marks.push({ name, x: (m.a * x + m.c * y + m.e) / k, y: (m.b * x + m.d * y + m.f) / k });
  }

  /** Construction line/shape; shows dashed in debug renders. */
  guide(shape, label) {
    const m = this.ctx.getTransform(), k = this.env.scale;
    this.env.guides.push({
      label,
      closed: shape.closed,
      pts: shape.pts.map(([x, y]) => [(m.a * x + m.c * y + m.e) / k, (m.b * x + m.d * y + m.f) / k]),
    });
  }
}

/** 256x256 tileable paper-tooth texture in [0,1]. */
function makeToothTexture(seed) {
  const N = 256, T = new Float32Array(N * N);
  const rng = makeRng(`tooth:${seed}`);
  const F = (x, y) => 0.55 * rng.noise2(x / 2.2, y / 2.6) + 0.3 * rng.noise2(x / 6, y / 5) + 0.15 * rng.noise2(x / 1.1, y / 1.1);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const val = F(x, y) * (1 - u) * (1 - v) + F(x - N, y) * u * (1 - v) + F(x, y - N) * (1 - u) * v + F(x - N, y - N) * u * v;
    T[y * N + x] = val;
    if (val < lo) lo = val; if (val > hi) hi = val;
  }
  for (let i = 0; i < T.length; i++) T[i] = (T[i] - lo) / (hi - lo);
  return T;
}

function nearShape(shape, x, y, d) {
  for (let a = 0; a < 6; a++) {
    if (shape.contains(x + Math.cos(a) * d, y + Math.sin(a) * d)) return true;
  }
  return false;
}

function ellipsePts(cx, cy, rx, ry, rot, n = 16) {
  const c = Math.cos(rot), s = Math.sin(rot), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}


function circleShape(cx, cy, r) {
  const n = Math.max(8, Math.min(64, Math.ceil(r * 2)));
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([cx + r * Math.cos((i / n) * TAU), cy + r * Math.sin((i / n) * TAU)]);
  return new Shape(pts, true);
}
