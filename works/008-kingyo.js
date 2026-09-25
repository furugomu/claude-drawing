// 008 — 小さな灯り #7: 金魚すくい
// Looking down into the tub through the child's eyes. The goldfish and the
// lanterns' reflections catch the eye first; then, reflected faintly on the
// surface against the lantern glow, two heads leaning in together.
export const meta = { title: '金魚すくい', width: 1600, height: 1000, seed: 12, background: '#0c3a4c' };

export default function (t) {
  const { W, H, curve, circle, ellipse, rect, shape, line, linear, radial, alpha, mix, thick, ribbon, blobUnion, times, polar } = t;

  const RIM_Y = 930;                     // the tub's near lip
  const POI = { x: 1170, y: 745, r: 78 };
  const BOWL = { x: 250, y: 760, r: 92 };
  const HEADS = { child: [820, 690], parent: [610, 620] }; // reflected, on the surface

  // ---- goldfish (seen from above) ---------------------------------------------------
  const R = t.rng.fork('school');
  const KINDS = {
    red: { edge: '#ff8a4a', back: '#c8260e', fin: '#ffb07a' },
    orange: { edge: '#ffb050', back: '#f06018', fin: '#ffd09a' },
    kohaku: { edge: '#f6f0e6', back: '#f2e8dc', fin: '#fff4ea', patches: '#e0401c' },
    black: { edge: '#3a3038', back: '#120e14', fin: '#4a404a' },
  };
  const FISH = [
    { x: 1080, y: 690, a: 3.5, len: 118, kind: 'red' },      // hovering over the poi
    { x: 650, y: 380, a: 3.3, len: 130, kind: 'red' },
    { x: 820, y: 470, a: 3.0, len: 105, kind: 'kohaku' },
    { x: 560, y: 560, a: 3.6, len: 112, kind: 'orange' },
    { x: 930, y: 300, a: 2.9, len: 125, kind: 'black' },
    { x: 400, y: 450, a: 3.9, len: 98, kind: 'red' },
    { x: 1250, y: 420, a: 3.2, len: 110, kind: 'orange' },
    { x: 1000, y: 560, a: 2.6, len: 95, kind: 'red' },
    { x: 720, y: 230, a: 3.4, len: 100, kind: 'kohaku' },
    { x: 1400, y: 610, a: 3.8, len: 104, kind: 'red' },
    { x: 330, y: 250, a: 2.8, len: 92, kind: 'orange' },
    { x: 1150, y: 200, a: 3.1, len: 116, kind: 'red' },
    { x: 480, y: 700, a: 4.3, len: 90, kind: 'black' },
    { x: 1450, y: 250, a: 3.6, len: 96, kind: 'kohaku' },
    { x: 150, y: 520, a: 2.5, len: 100, kind: 'red' },
  ].map((f, i) => ({ ...f, phase: R.range(0, 6.28), bend: R.range(0.06, 0.16) * R.sign(), depth: R.range(0.6, 1.2), seed: `fish${i}` }));

  // ---- motion (t.time loops 0..1; every frequency is a whole number per loop) -------------
  const TAU = Math.PI * 2, T = t.time;
  /** A goldfish hovering: tail beating, drifting a little forward/back and side to side. */
  const swim = (f) => {
    const d = 9 * Math.sin(TAU * (T + f.phase / TAU));
    const side = 6 * Math.sin(TAU * (T + f.phase / 3.1));
    const a = f.a + 0.12 * Math.sin(TAU * (T + f.phase / 4));
    return { ...f, a, phase: f.phase + TAU * T * 3, x: f.x + Math.cos(f.a) * d - Math.sin(f.a) * side, y: f.y + Math.sin(f.a) * d + Math.cos(f.a) * side };
  };
  const NOW = FISH.map(swim);

  /** Body, tail and fins of one goldfish, as shapes. */
  function fishShapes(f) {
    const dx = Math.cos(f.a), dy = Math.sin(f.a), px = -dy, py = dx;
    const L = f.len, Wd = L * 0.25;
    const spineAt = (u) => {
      const sway = f.bend * L * Math.sin(f.phase + u * 2.6) * u;
      return [f.x - dx * u * L + px * sway, f.y - dy * u * L + py * sway];
    };
    const spine = curve(times(9, (i) => spineAt(i / 8)));
    const prof = [[0, 0.45], [0.06, 0.72], [0.15, 0.9], [0.3, 1], [0.45, 0.92], [0.6, 0.7], [0.75, 0.45], [0.88, 0.28], [1, 0.2]];
    const w = (u) => {
      for (let i = 0; i < prof.length - 1; i++) if (u <= prof[i + 1][0]) {
        const k = (u - prof[i][0]) / (prof[i + 1][0] - prof[i][0]);
        return Wd * (prof[i][1] + (prof[i + 1][1] - prof[i][1]) * k);
      }
      return Wd * 0.2;
    };
    const body = ribbon(spine, w, w);
    const nose = ellipse(...spineAt(0.02), L * 0.09, Wd * 0.46, f.a);
    // fan tail: two veils flowing back from the tail base, lagging the body's swing
    const base = spineAt(1), back = Math.atan2(base[1] - spineAt(0.9)[1], base[0] - spineAt(0.9)[0]);
    const lobe = (side) => {
      const spread = back + side * 0.42 + f.bend * 1.5;
      const tl = L * 0.55;
      const c = curve(times(5, (i) => {
        const u = i / 4, a = spread + side * 0.12 * u + Math.sin(f.phase + u * 2) * 0.12;
        return [base[0] + Math.cos(a) * tl * u, base[1] + Math.sin(a) * tl * u];
      }));
      return ribbon(c, (u) => Wd * (0.2 + 0.9 * Math.sin(Math.PI * Math.min(1, u * 0.75))), (u) => Wd * (0.15 + 0.5 * u * (1 - u)));
    };
    const tail = [lobe(-1), lobe(1)];
    const [ex, ey] = spineAt(0.1);
    const pect = [-1, 1].map((s) => ellipse(ex + px * s * Wd * 1.05 - dx * L * 0.1, ey + py * s * Wd * 1.05 - dy * L * 0.1, Wd * 0.62, Wd * 0.28, f.a + s * 0.7 + Math.PI));
    const eyes = [-1, 1].map((s) => [ex + px * s * Wd * (f.kind === 'black' ? 0.92 : 0.55), ey + py * s * Wd * (f.kind === 'black' ? 0.92 : 0.55)]);
    return { spine, body: [body, nose], tail, pect, eyes, Wd, spineAt };
  }

  function drawFish(p, f) {
    p.scope(f.seed, () => {
      const K = KINDS[f.kind];
      const s = fishShapes(f);
      // translucent fins first
      for (const lobeS of s.tail) {
        p.fill(lobeS, alpha(K.fin, 0.55));
        const b = s.spineAt(1);
        for (let i = 0; i < 7; i++) {
          const tip = lobeS.pts[Math.floor((i / 6) * (lobeS.pts.length / 2 - 1))];
          p.ink(line(b[0], b[1], tip[0], tip[1]), { width: 1, color: K.back, alpha: 0.35, taper: 0.3 });
        }
        p.ink(lobeS.open(), { width: 1.2, color: '#ffffff', alpha: 0.25, taper: 0.4 });
      }
      for (const pf of s.pect) p.fill(pf, alpha(K.fin, 0.6));
      // body: pale flanks, deep colour along the back
      p.fill(s.body, K.edge);
      p.clip(s.body, () => {
        p.group({ blur: s.Wd * 0.35 }, (g) => g.ink(s.spine.sub(0.02, 0.95), { width: s.Wd * 1.1, color: K.back, taper: [0.1, 0.4] }));
        if (K.patches) {
          for (let i = 0; i < 3; i++) {
            const [cx, cy] = s.spineAt(p.rng.range(0.1, 0.8));
            p.fill(t.blob(cx + p.rng.gauss(0, s.Wd * 0.4), cy + p.rng.gauss(0, s.Wd * 0.4), s.Wd * p.rng.range(0.5, 0.9), { rng: p.rng, n: 6, vary: 0.35 }), K.patches);
          }
        }
        // scales catching the light: tiny pale arcs
        for (let i = 0; i < 40; i++) {
          const u = p.rng.range(0.15, 0.85), [cx, cy] = s.spineAt(u);
          const o = p.rng.gauss(0, s.Wd * 0.5);
          const x = cx - Math.sin(f.a) * o, y = cy + Math.cos(f.a) * o;
          p.ink(t.arc(x, y, s.Wd * 0.14, f.a - 1.2, f.a + 1.2), { width: 0.9, color: '#ffffff', alpha: 0.3, taper: 0.3 });
        }
      });
      // head highlight and eyes
      p.ink(s.spine.sub(0.05, 0.4).offset(-s.Wd * 0.25), { width: s.Wd * 0.25, color: '#fff2e0', alpha: 0.35, taper: 0.5 });
      for (const [x, y] of s.eyes) {
        const er = s.Wd * (f.kind === 'black' ? 0.3 : 0.12);
        p.fill(circle(x, y, er), '#140c0c');
        p.dot(x - er * 0.3, y - er * 0.3, er * 0.3, '#ffffff', { alpha: 0.7 });
      }
    });
  }

  function fishShadow(p, f) {
    const s = fishShapes(f);
    const off = [16 * f.depth, 24 * f.depth];
    p.fill([...s.body, ...s.tail].map((sh) => sh.translate(...off)), '#062232');
  }

  // ---- the tub, seen through the water -------------------------------------------------
  t.layer('below', (p) => {
    p.fill(rect(0, 0, W, H), linear(0, 0, 0, H, ['#1f6a8e', '#2a7ea2', '#2a7a9e']));
    // caustics: a web of light focused by the surface ripples
    const off = p.rng.range(0, 99);
    const [cx1, cy1] = t.loopOffset(0.7), [cx2, cy2] = t.loopOffset(0.9, 1, 0.3);
    p.raster((x, y) => {
      const n1 = 1 - Math.abs(p.rng.noise2(x * 0.011 + off + cx1, y * 0.013 + cy1));
      const n2 = 1 - Math.abs(p.rng.noise2(x * 0.017 - off + cx2, y * 0.012 + 5 + cy2));
      const patch = 0.35 + 0.65 * (0.5 + 0.5 * p.rng.noise2(x * 0.003 + 40, y * 0.003));
      const c = (Math.pow(n1, 10) * 0.8 + Math.pow(n2, 14) * 0.6) * patch;
      return c > 0.02 ? [255, 236, 200, Math.min(1, c)] : null;
    }, { res: 3, blend: 'screen', alpha: 0.38 });
    // fish shadows on the bottom
    p.group({ blur: 7, alpha: 0.45 }, (g) => { for (const f of NOW) fishShadow(g, f); });
    p.group({ blur: 10, alpha: 0.4 }, (g) => {
      g.fill(circle(BOWL.x + 20, BOWL.y + 30, BOWL.r), '#062232');
      g.fill(circle(POI.x + 14, POI.y + 22, POI.r), alpha('#062232', 0.5));
    });
    // depth: the water itself tints everything toward deep teal
    p.fill(rect(0, 0, W, H), radial(820, 600, 1100, [alpha('#0a3a50', 0.3), alpha('#051e30', 0.72)]));
    // warm light from the stall's bulbs falling into the water
    p.fill(rect(0, 0, W, H), radial(760, 780, 900, [alpha('#ffb060', 0.22), alpha('#ffb060', 0)]), { blend: 'screen' });
  });

  t.layer('fish', (p) => {
    for (const f of NOW.slice().sort((a, b) => a.depth - b.depth).reverse()) drawFish(p, f);
    // a veil of water over them
    p.with({ blend: 'source-atop' }, () => p.fill(rect(0, 0, W, H), alpha('#1a6a84', 0.18)));
  });

  // refraction: the surface ripples bend everything under it
  t.layer('refract', () => t.p.warp({ amount: 5, scale: 90, shift: t.loopOffset(0.6) }));

  // ---- things at the surface -------------------------------------------------------
  t.layer('bowl', (p) => {
    const { x, y, r } = BOWL;
    p.fill(circle(x, y, r), radial(x - 20, y - 25, r, ['#ffffff', '#e8eef4', '#b8c8d8']));
    p.fill(circle(x, y, r * 0.84), radial(x, y, r * 0.84, ['#9fd8ec', '#6fbcd8']));
    drawFish(p, swim({ x: x + 36, y: y - 18, a: 2.4, len: 70, kind: 'red', phase: 1.2, bend: 0.14, depth: 0.3, seed: 'caught' }));
    p.stroke(circle(x, y, r * 0.92), alpha('#ffffff', 0.7), 3);
    p.ink(t.arc(x, y, r * 0.95, 3.6, 4.6), { width: 4, color: '#ffffff', alpha: 0.9, taper: 0.5 });
  });

  t.layer('poi', (p) => {
    const { x, y, r } = POI;
    const handle = thick(curve([[x + r * 0.75, y + r * 0.62], [x + 170, y + 160], [x + 330, y + 300]]), (u) => 16 - u * 3);
    // wet paper: translucent, with a tear where a fish broke through before
    const tear = t.blob(x - r * 0.45, y + r * 0.3, r * 0.3, { rng: p.rng, n: 9, vary: 0.4 });
    p.group({}, (g) => {
      g.fill(circle(x, y, r), alpha('#ffffff', 0.42));
      g.with({ blend: 'destination-out' }, () => g.fill(tear, '#000'));
      g.ink(tear.open(), { width: 1.5, color: '#ffffff', alpha: 0.6, taper: 0, wobble: 1 });
    });
    p.stroke(circle(x, y, r), '#ff82ac', 9);
    p.stroke(circle(x, y, r + 2), alpha('#ffffff', 0.45), 2);
    p.fill(handle, linear(x, y, x + 330, y + 300, ['#ff82ac', '#ff9cc0']));
    p.ink(handle.facing(-2.4, { min: 0.5 })[0] ?? handle.open(), { width: 2, color: '#ffffff', alpha: 0.5, taper: 0.3 });
    p.mark('poi', x, y);
  });

  // ---- the surface: faint reflections of what's above ------------------------------------
  t.layer('reflection', (p) => {
    p.group({}, (r) => {
      // lanterns hanging over the stall, rows of warm glows
      const LAN = [];
      for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
        LAN.push([90 + i * 245 + row * 90 + r.rng.range(-30, 30), 140 + row * 230 + r.rng.range(-30, 30), r.rng.pick(['#ff4a3a', '#ffb070', '#ffe0b0', '#ff6a4a'])]);
      }
      for (const [x, y, c] of LAN) {
        r.dot(x, y, 26, c, { blur: 30, alpha: 0.5, blend: 'screen' });
        r.dot(x, y, 10, '#fff4dc', { blur: 8, alpha: 0.5, blend: 'screen' });
      }
      // the stall's lanterns right above us: in the reflection they ring the two heads
      const [cx, cy] = HEADS.child, [mx, my] = HEADS.parent;
      r.dot(720, 560, 200, '#ffb070', { blur: 140, alpha: 0.45, blend: 'screen' });
      for (const [x, y, c] of [[470, 470, '#ff5a3a'], [610, 430, '#ffd8a0'], [760, 470, '#ff6a4a'], [900, 520, '#ffe0b0'], [990, 610, '#ff5a3a']]) {
        r.dot(x, y, 30, c, { blur: 26, alpha: 0.6, blend: 'screen' });
        r.dot(x, y, 12, '#fff4dc', { blur: 6, alpha: 0.6, blend: 'screen' });
      }
      // two heads leaning in, dark against the glow: a parent with her hair up, a child with pigtails
      const dome = (x, y, rx, top, bottom) => curve([[x - rx, y + bottom], [x - rx * 0.9, y + top + (bottom - top) * 0.35], [x - rx * 0.45, y + top + 6], [x, y + top], [x + rx * 0.45, y + top + 6], [x + rx * 0.9, y + top + (bottom - top) * 0.35], [x + rx, y + bottom]]).close();
      const parent = [ellipse(mx, my, 54, 64), circle(mx + 6, my - 70, 26), rect(mx - 20, my + 40, 40, 60), dome(mx, my, 165, 92, 330)];
      const child = [circle(cx, cy, 48), ellipse(cx - 60, cy - 14, 16, 30, -0.45), ellipse(cx + 60, cy - 14, 16, 30, 0.45), rect(cx - 15, cy + 36, 30, 44), dome(cx, cy, 108, 78, 260)];
      r.group({ alpha: 0.36, blur: 2.5 }, (g) => {
        g.fill([...parent, ...child], '#081020');
        g.rim(parent, [720, 420], { color: '#ffd09a', width: 4, alpha: 0.7, min: 0.1 });
        g.rim(child, [720, 420], { color: '#ffd09a', width: 4, alpha: 0.7, min: 0.1 });
      });
      r.mark('child', cx, cy);
      r.mark('parent', mx, my);
      r.warp({ amount: 7, scale: 60, shift: t.loopOffset(0.8, 1, 0.5) });
    });
    // specular glints where ripples catch the lantern light
    for (let i = 0; i < 140; i++) {
      const x = p.rng.range(0, W), y = p.rng.range(0, RIM_Y);
      const len = p.rng.range(3, 14);
      const twinkle = 0.5 + 0.5 * Math.sin(TAU * (T * p.rng.int(1, 3) + p.rng()));
      p.ink(line(x, y, x + len, y + p.rng.range(-2, 2)), { width: p.rng.range(1, 2.4), color: p.rng.pick(['#ffffff', '#fff0d0', '#ffd0a0']), alpha: p.rng.range(0.3, 0.8) * twinkle, taper: 0.4 });
    }
  });

  // ---- the near lip of the tub and the child's hand ------------------------------------------
  t.layer('rim', (p) => {
    const lip = curve([[-20, RIM_Y + 8], [400, RIM_Y - 4], [800, RIM_Y - 8], [1200, RIM_Y - 4], [1620, RIM_Y + 8], [1620, H + 10], [-20, H + 10]], { closed: true });
    p.fill(lip, linear(0, RIM_Y - 10, 0, H, ['#7fd0f0', '#3a9ad0', '#1e6aa8']));
    p.ink(curve([[-20, RIM_Y + 10], [400, RIM_Y - 2], [800, RIM_Y - 6], [1200, RIM_Y - 2], [1620, RIM_Y + 10]]), { width: 3, color: '#e8fbff', alpha: 0.8, taper: 0.1 });
    // the poi's handle continues over the lip into a small hand
    const { x, y } = POI;
    const handle = thick(curve([[x + 190, y + 172], [x + 300, y + 262]]), 14);
    p.fill(handle, '#ff9cc0');
    const hx = x + 232, hy = y + 196;
    const hand = blobUnion([[hx, hy, 30], [hx + 30, hy + 20, 32], [hx + 62, hy + 38, 36], [hx + 110, hy + 70, 44], [hx - 18, hy + 24, 13], [hx - 8, hy + 38, 13], [hx + 6, hy + 50, 13]], { blend: 0.35 });
    p.fill(hand, radial(hx - 10, hy - 10, 90, ['#ffd9b8', '#f0b08c', '#c0806a']));
    for (const k of [0, 1, 2]) p.ink(t.arc(hx - 18 + k * 13, hy + 26 + k * 12, 12, -0.4, 1.4), { width: 1.4, color: '#a0605a', alpha: 0.6, taper: 0.3 });
    p.rim([hand], [600, 200], { color: '#fff0d8', width: 2, alpha: 0.6, min: 0.4 });
  });

  t.layer('finish', () => {
    t.p.vignette(0.45, { cx: 820, cy: 520, inner: 0.4, color: '#04161e' });
    t.p.grain(0.02);
  });
}
