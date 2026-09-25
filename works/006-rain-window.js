// 006 — 小さな灯り #5: rainy night, through the window
export const meta = { title: '雨の夜の窓辺', width: 1600, height: 1000, seed: 8, background: '#0b0a12' };

export default function (t) {
  const { W, H, curve, circle, ellipse, rect, shape, line, linear, radial, alpha, mix, thick, poisson, times } = t;
  const SILL = 842;
  const CANDLE = { x: 1215, y: SILL };
  const MUG = { x: 420, y: SILL };

  // ---- the city across the street: point lights we'll reuse for bokeh --------------
  const R = t.rng.fork('city');
  const LIGHTS = []; // {x, y, color, size, a}
  const light = (x, y, color, size = 1, a = 1) => LIGHTS.push({ x, y, color, size, a });

  const city = t.layer('city', { alpha: 0 }, (p) => { // drawn invisible; used as the lens source
    p.fill(rect(0, 0, W, H), linear(0, 0, 0, 720, ['#120f22', '#251b38', '#3a2640']));
    // building facades
    let x = -20;
    while (x < W) {
      const w = R.range(160, 320), top = R.range(120, 330);
      const col = R.pick(['#1a1824', '#221e2c', '#16141e', '#1e1a26']);
      p.fill(rect(x, top, w, 720 - top), col);
      for (let wy = top + 30; wy < 660; wy += 46) {
        for (let wx = x + 18; wx < x + w - 30; wx += 38) {
          if (!R.chance(0.42)) continue;
          const c = R.pick(['#ffcf80', '#ffd89a', '#ffc070', '#bfe0ff', '#9fc4ff', '#ffe8c0']);
          p.fill(rect(wx, wy, 22, 28), c);
          if (R.chance(0.3)) light(wx + 11, wy + 14, c, 0.7, 0.55);
        }
      }
      x += w + R.range(0, 30);
    }
    // neon signs
    p.fill(rect(300, 250, 44, 170, 6), '#ff4fa0');
    light(322, 290, '#ff4fa0', 1.2); light(322, 380, '#ff4fa0', 1.2);
    p.fill(rect(1080, 360, 130, 40, 6), '#4ff4ff');
    light(1145, 380, '#4ff4ff', 1.3);
    // street lamps (sodium), a traffic light, a vending machine
    for (const [lx, ly] of [[170, 330], [760, 352], [1400, 318]]) {
      p.stroke(line(lx, ly, lx, 730), '#0c0b10', 6);
      p.fill(circle(lx, ly, 10), '#ffb050');
      light(lx, ly, '#ffa640', 1.8);
    }
    p.fill(circle(980, 470, 9), '#ff3030'); light(980, 470, '#ff3a30', 1.3);
    p.fill(rect(1030, 610, 60, 110), '#e8f4ff'); light(1060, 650, '#dff0ff', 1.4, 0.8);
    // wet street with smeared reflections
    p.fill(rect(0, 720, W, 300), linear(0, 720, 0, 900, ['#15121c', '#0c0b10']));
    for (const L of LIGHTS.filter((l) => l.size > 1)) {
      p.fill(rect(L.x - 6 * L.size, 725, 12 * L.size, 120), linear(0, 725, 0, 845, [alpha(L.color, 0.7), alpha(L.color, 0)]));
    }
    // cars: taillights and headlights
    for (const [cx, cy, c] of [[560, 770, '#ff2a2a'], [640, 770, '#ff2a2a'], [1350, 782, '#fff4dc'], [1440, 782, '#fff4dc']]) {
      p.fill(circle(cx, cy, 6), c);
      light(cx, cy, c, 1.1);
    }
  });

  // ---- what we actually see through the glass: out of focus -------------------------
  const bokeh = t.layer('bokeh', (p) => {
    p.composite(city.canvas, { blur: 26 });
    p.fill(rect(0, 0, W, H), alpha('#000', 0.25));
    for (const L of LIGHTS) {
      const r = (22 + 16 * L.size) * R.range(0.85, 1.15);
      const a = 0.28 * L.a;
      p.fill(circle(L.x, L.y, r), radial(L.x, L.y, r, [[0, alpha(L.color, a * 0.8)], [0.82, alpha(L.color, a)], [1, alpha(L.color, a * 1.4)]]), { blend: 'screen' });
    }
  });

  // ---- rain on the glass ------------------------------------------------------------
  const G = t.rng.fork('glass');
  const TRAILS = times(8, () => {
    let x = G.range(60, W - 60), y = G.range(20, 480);
    const pts = [[x, y]];
    const end = G.range(560, SILL - 20);
    while (y < end) {
      y += G.range(8, 16);
      x += G.gauss(0, 2.2);
      pts.push([x, y]);
    }
    return curve(pts);
  });
  const DROPS = [];
  for (const [x, y] of poisson({ x: 0, y: 0, w: W, h: SILL - 6 }, 21, { rng: G })) {
    const k = G();
    const r = k < 0.66 ? G.range(1.2, 3) : k < 0.96 ? G.range(3.5, 7.5) : G.range(9, 15);
    DROPS.push({ x, y, r });
  }
  for (const tr of TRAILS) {
    const [ex, ey] = tr.pts[tr.pts.length - 1];
    DROPS.push({ x: ex, y: ey + 4, r: G.range(9, 13) });
    for (const f of tr.frames(10)) if (G.chance(0.6)) DROPS.push({ x: f.x + G.sign() * G.range(6, 12), y: f.y, r: G.range(1.5, 3.5) });
  }
  const dropShape = (d) => ellipse(d.x, d.y + d.r * 0.08, d.r * 0.96, d.r * 1.04);

  t.layer('fog', (p) => {
    const off = G.range(0, 99);
    p.raster((x, y) => {
      const f = 0.5 + 0.5 * G.fbm(x * 0.004 + off, y * 0.004, { octaves: 4 });
      return [190, 196, 214, 0.05 + 0.12 * f * (1 - y / H * 0.4)];
    }, { bounds: { x: 0, y: 0, w: W, h: SILL }, res: 6 });
    // drops and trails wipe the mist away
    p.with({ blend: 'destination-out' }, () => {
      for (const tr of TRAILS) p.fill(thick(tr, 18), '#000');
      for (const d of DROPS) p.fill(circle(d.x, d.y, d.r * 1.6), '#000');
    });
  });

  t.layer('rain', (p) => {
    for (const tr of TRAILS) {
      const band = thick(tr, (u) => 6 + 2.5 * Math.sin(u * 23) * (0.5 + 0.5 * Math.sin(u * 7)));
      // a clear channel through the mist: brighter, edge-lit water
      p.lens(band, bokeh, { invert: false, zoom: 1, edge: 0.3, highlight: 0, caustic: 0 });
      p.fill(band, alpha('#ffffff', 0.06), { blend: 'screen' });
      p.ink(tr.translate(-2.5, 0), { width: 1.3, color: '#ffffff', alpha: 0.45, taper: 0.15 });
      p.ink(tr.translate(2.5, 0), { width: 1, color: '#000000', alpha: 0.35, taper: 0.15 });
    }
    for (const d of DROPS) {
      if (d.r < 3.2) {
        // tiny beads: just a dark rim and a glint
        p.fill(circle(d.x, d.y, d.r), alpha('#000', 0.15));
        p.fill(circle(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.45), alpha('#fff', 0.5));
      } else {
        p.lens(dropShape(d), city, { zoom: 5, edge: 0.32, highlight: 0.6, caustic: 0.55, base: bokeh, baseAlpha: 1, blend: 'screen' });
      }
    }
  });

  // ---- inside: the sill, a mug, a candle ---------------------------------------------
  t.layer('sill', (p) => {
    const sill = rect(-10, SILL, W + 20, H - SILL + 10);
    p.fillPainted(sill, linear(0, SILL, 0, H, ['#2a1c16', '#140d0a']), { angle: 0, width: [4, 8], length: [60, 160], alpha: 0.6 });
    p.ink(line(-10, SILL + 1, W + 10, SILL + 1), { width: 2, color: '#6a5a78', alpha: 0.6, taper: 0 });
    // the glossy sill mirrors the lights outside, smeared
    p.clip(sill, () => p.group({ blur: 10, alpha: 0.35 }, (g) => {
      for (const L of LIGHTS.filter((l) => l.size >= 1)) {
        const x = L.x + R.range(-10, 10);
        g.fill(rect(x - 14 * L.size, SILL + 4, 28 * L.size, 60 + 30 * L.size), linear(0, SILL, 0, SILL + 100, [alpha(L.color, 0.8), alpha(L.color, 0)]));
      }
    }));
    // candle light pooled on the sill
    p.fill(sill, radial(CANDLE.x, SILL + 10, 420, [alpha('#ffae50', 0.45), alpha('#ffae50', 0)]), { blend: 'screen' });
  });

  t.layer('mug', (p) => {
    const { x, y } = MUG;
    const body = rect(x - 55, y - 120, 110, 120, 12);
    const handle = thick(curve([[x + 50, y - 95], [x + 92, y - 88], [x + 92, y - 40], [x + 50, y - 32]]), 14);
    p.fill([body, handle], '#1c1618');
    p.fill(body, linear(x - 55, 0, x + 55, 0, [alpha('#8a7aa8', 0.35), alpha('#000', 0), alpha('#ffb060', 0.12)]));
    for (const e of body.facing(-Math.PI / 2 - 0.4, { min: 0.6 })) p.ink(e, { width: 2.5, color: '#9a8ab8', alpha: 0.6, taper: 0.2 });
    for (const e of [body, handle].flatMap((sh) => sh.facingPoint(CANDLE.x, CANDLE.y - 90, { min: 0.5, exclude: sh === handle ? [body] : [] }))) p.ink(e.offset(-1.5), { width: 3, color: '#ffb060', alpha: 0.55, taper: 0.3 });
    // steam, backlit by the city
    p.group({ blend: 'screen', blur: 3 }, (g) => {
      for (let i = 0; i < 3; i++) {
        const sx = x - 25 + i * 25;
        const wisp = curve(times(7, (k) => [sx + 18 * Math.sin(k * 1.1 + i * 2) + k * 3, y - 130 - k * 38]));
        g.ink(wisp, { width: 10, color: '#d8d4e8', alpha: 0.3, taper: [0.2, 0.8] });
      }
    });
  });

  t.layer('candle', (p) => {
    const { x, y } = CANDLE;
    // glass jar
    const jar = rect(x - 50, y - 130, 100, 130, 14);
    p.fill(jar, linear(x - 50, 0, x + 50, 0, [alpha('#ffcf9a', 0.16), alpha('#ffcf9a', 0.04), alpha('#ffcf9a', 0.12)]));
    const wax = rect(x - 42, y - 70, 84, 66, 8);
    p.fill(wax, linear(x - 42, 0, x + 42, 0, ['#b88a58', '#f6dcae', '#f0d2a0', '#9a6e44']));
    p.fill(wax, linear(0, y - 70, 0, y - 4, [alpha('#fff2c8', 0.9), alpha('#ffd28a', 0.25), alpha('#5a3a20', 0.4)]));
    p.fill(ellipse(x, y - 70, 40, 7), radial(x, y - 70, 40, ['#fff6d8', '#f4d6a0']));
    p.ink(line(x, y - 70, x, y - 80), { width: 2, color: '#2a1a10', taper: 0 });
    // flame
    const flame = curve([[x, y - 118], [x + 8, y - 96], [x + 5, y - 84], [x, y - 80], [x - 5, y - 84], [x - 8, y - 96]], { closed: true });
    p.glow(circle(x, y - 92, 40), '#ff9a3a', 50, { alpha: 0.9 });
    p.glow(flame, '#ffd070', 10);
    p.fill(flame, linear(0, y - 118, 0, y - 80, ['#fff8d0', '#ffd070', '#ff8a30']));
    p.fill(ellipse(x, y - 86, 3, 5), alpha('#5a8aff', 0.6));
    // jar walls catch the light
    p.ink(line(x - 48, y - 120, x - 48, y - 12), { width: 2.5, color: '#ffd9a0', alpha: 0.5, taper: 0.2 });
    p.ink(line(x + 48, y - 120, x + 48, y - 12), { width: 2.5, color: '#ffd9a0', alpha: 0.35, taper: 0.2 });
    p.ink(curve([[x - 50, y - 128], [x, y - 134], [x + 50, y - 128]]), { width: 2, color: '#ffd9a0', alpha: 0.4, taper: 0.1 });
    // reflected in the glossy sill, and faintly in the window
    p.glow(ellipse(x, y + 26, 16, 34), '#ff9a3a', 20, { alpha: 0.4 });
    p.glow(circle(x + 24, y - 150, 10), '#ffb060', 18, { alpha: 0.35 });
    p.mark('flame', x, y - 96);
  });

  t.layer('finish', () => {
    t.p.vignette(0.5, { cx: 900, cy: 520, inner: 0.35 });
    t.p.grain(0.025);
  });
}
