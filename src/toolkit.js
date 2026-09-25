// The `t` object handed to every scene: layers + all helpers in one place,
// so scenes don't need imports.

import * as geom from './geom.js';
import * as color from './color.js';
import * as field from './field.js';
import { linear, radial, conic } from './painter.js';

export function toolkit(root, env, rootRng, opts = {}) {
  const t = {
    W: env.W,
    H: env.H,
    seed: env.seed,
    meta: env.meta,
    PI: Math.PI,
    /** Animation: loop phase 0..1 (0 for stills), current frame and frame count. */
    time: env.time,
    frame: env.frame,
    frames: env.frames,
    /** sin wave that loops: freq must be a whole number of cycles per loop. */
    wave: (freq = 1, phase = 0) => Math.sin(2 * Math.PI * (env.time * freq + phase)),
    /** A point going round a circle of radius r once per loop — add it to noise
     *  coordinates to make any noise field move and come back seamlessly. */
    loopOffset: (r = 1, freq = 1, phase = 0) => {
      const a = 2 * Math.PI * (env.time * freq + phase);
      return [r * Math.cos(a), r * Math.sin(a)];
    },
    TAU: Math.PI * 2,
    /** Scene-level rng (independent from layer rngs). */
    rng: rootRng.fork('scene'),
    /** Root painter (draws directly onto the final image). */
    p: root,

    /**
     * Named layer: fn(p) draws into its own buffer, which is then composited.
     * opts: {alpha, blend, blur, filter, mask}
     * Each layer has its own deterministic rng (p.rng) derived from its name.
     * Returns the layer's Painter (its .canvas can be reused, e.g. p.reflect()).
     */
    layer(name, lopts, fn) {
      if (typeof lopts === 'function') { fn = lopts; lopts = {}; }
      const skipped = (opts.only && !opts.only.includes(name)) || (opts.skip && opts.skip.includes(name));
      // a skipped layer is an empty painter, so layers that reuse it keep working
      if (skipped) return root.group({ alpha: 0 }, () => {});
      const t0 = performance.now();
      const painter = root.group({ ...lopts, rng: rootRng.fork(`layer:${name}`) }, fn);
      env.layers.push({ name, ms: performance.now() - t0 });
      return painter;
    },

    /** [fn(0), fn(1), ... fn(n-1)] */
    times: (n, fn) => Array.from({ length: n }, (_, i) => fn(i, n)),
    /** n evenly spaced values from a to b inclusive */
    linspace: (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1)),

    ...geom,
    ...field,
    ...color,
    linear,
    radial,
    conic,
  };
  return t;
}
