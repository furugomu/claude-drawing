// 003 — 小さな灯り #2: night train over the lake (homage to 銀河鉄道の夜)
export const meta = { title: 'Night train', width: 1600, height: 1000, seed: 11, background: '#070b1c' };

const SKY = [[0, '#060a1a'], [0.45, '#0d1830'], [0.8, '#1a3148'], [1, '#2a4a5c']];

export default function (t) {
  const { W, H, curve, circle, rect, shape, linear, radial, alpha, mix, jitter, ramp, thick } = t;
  const WATER = 660;
  const DECK = 548; // top of the viaduct deck (train wheels)

  // Milky Way: a field in band coordinates (u along the band, v across it)
  const band = curve([[1620, 640], [1370, 500], [1000, 330], [560, 130], [140, -60]]).resample(6);
  const bnr = band.normals();
  const mwRng = t.rng.fork('milkyway');
  const { smoothstep } = t;
  function milkyAt(x, y) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < band.pts.length; i++) {
      const d = (x - band.pts[i][0]) ** 2 + (y - band.pts[i][1]) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    const v = (x - band.pts[bi][0]) * bnr[bi][0] + (y - band.pts[bi][1]) * bnr[bi][1];
    const u = bi * 6;
    const sigma = 125 * (0.8 + 0.35 * mwRng.noise2(u * 0.003, 7));
    let I = Math.exp(-((v / sigma) ** 2));
    I *= 0.5 + 0.5 * (0.5 + 0.5 * mwRng.fbm(x * 0.007, y * 0.007, { octaves: 5 }));
    // the Great Rift: a wandering dark lane with ragged filaments
    const laneC = 30 * mwRng.noise2(u * 0.0035, 3) - 8;
    const laneW = 20 + 16 * (0.5 + 0.5 * mwRng.noise2(u * 0.006, 9));
    const lane = Math.exp(-(((v - laneC) / laneW) ** 2));
    const fil = 0.5 + 0.5 * mwRng.fbm(x * 0.018, y * 0.018, { octaves: 5 });
    const dust = Math.min(1, lane * smoothstep(0.25, 0.65, fil) * 1.2 + 0.35 * smoothstep(0.62, 0.8, fil) * I);
    return { I: I * (1 - 0.75 * dust), core: Math.exp(-((v / (sigma * 0.45)) ** 2)) };
  }
  const EDGE = t.rgba('#4a64a0'), MID = t.rgba('#a9a6cf'), CORE = t.rgba('#f3e5cb');

  const sky = t.layer('sky', (p) => {
    p.fill(rect(0, 0, W, WATER + 2), linear(0, 0, 0, WATER, SKY));
  });

  const milky = t.layer('milkyway', { blend: 'screen' }, (p) => {
    p.raster((x, y) => {
      const { I, core } = milkyAt(x, y);
      if (I < 0.01) return null;
      const c = t.mixRgba(t.mixRgba(EDGE, MID, Math.min(1, I * 1.4)), CORE, core * I);
      return [c[0], c[1], c[2], Math.min(1, I * 0.72)];
    }, { bounds: { x: 0, y: 0, w: W, h: WATER }, res: 3, blur: 1.5 });
  });

  const stars = t.layer('stars', (p) => {
    for (let i = 0; i < 30000; i++) {
      const x = p.rng.range(0, W), y = p.rng.range(0, WATER);
      const { I } = milkyAt(x, y);
      const dens = 0.035 + 0.6 * I * I;
      if (!p.rng.chance(dens * (1 - 0.6 * (y / WATER) ** 3))) continue;
      const bright = Math.pow(p.rng(), 7);
      const r = bright * 1.9 + 0.3;
      const c = p.rng.pick(['#ffffff', '#fff3dd', '#dfe8ff', '#ffe2c4', '#cfe0ff']);
      p.fill(circle(x, y, r, 8), alpha(c, 0.25 + 0.75 * Math.min(1, bright * 3 + p.rng() * 0.5)));
      if (r > 1.4) p.glow(circle(x, y, r * 1.6), c, 5, { alpha: 0.7 });
    }
  });

  const hills = t.layer('hills', (p) => {
    const ridge = (y0, amp, freq, off) => {
      const pts = [[-10, WATER + 5]];
      for (let x = -10; x <= W + 10; x += 20) pts.push([x, y0 - amp * (0.5 + 0.5 * p.rng.fbm(x * freq + off, off, { octaves: 5 }))]);
      pts.push([W + 10, WATER + 5]);
      return shape(pts);
    };
    const far = ridge(600, 170, 0.0025, 3);
    p.fillPainted(far, linear(0, 430, 0, WATER, ['#1c2d44', '#223a4e']), { width: [5, 10], length: [15, 35], alpha: 0.5 });
  });

  const viaduct = t.layer('viaduct', (p) => {
    const outer = rect(-10, DECK, 1350, WATER - DECK + 20);
    const openings = [];
    const span = 132, pier = 24;
    for (let x = -60; x < 1340; x += span) {
      const x0 = x + pier / 2, x1 = x + span - pier / 2, r = (x1 - x0) / 2;
      const arch = t.arc(x0 + r, DECK + 28 + r, r, Math.PI, Math.PI * 2);
      openings.push(shape([[x0, WATER + 40], ...arch.pts, [x1, WATER + 40]]));
    }
    const body = [outer, ...openings];
    p.fill(body, '#0c1424', { rule: 'evenodd' });
    p.clip(outer, () => p.clip(body, () => {
      p.strokes(rect(-10, DECK, 1350, WATER - DECK), { angle: 0, width: [3, 6], length: [14, 28], colors: ['#111c30', '#0a1120', '#15223a', '#1a2944'], alpha: 0.7, spacing: 6 });
    }, { rule: 'evenodd' }));
    // starlit parapet edge
    p.ink(t.line(-10, DECK + 1, 1340, DECK + 1), { width: 2, color: '#3b5470', taper: 0, alpha: 0.8 });
    for (const x of t.linspace(10, 1330, 50)) p.stroke(t.line(x, DECK, x, DECK - 6), '#0c1424', 2);
    p.stroke(t.line(-10, DECK - 6, 1340, DECK - 6), '#0c1424', 2);
  });

  const PORTAL = { x: 1362, w: 46, top: 498 };
  const hill = t.layer('hill', (p) => {
    const near = curve([[1150, WATER + 5], [1235, 612], [1300, 546], [1345, 512], [1420, 468], [1510, 436], [1620, 418], [1620, WATER + 5]]).close();
    p.fillPainted(near, linear(0, 420, 0, WATER, ['#122033', '#0b1522']), { angle: -0.5, width: [6, 12], length: [15, 35], alpha: 0.6 });
    // tunnel portal: stone face with a dark arch the track runs into
    const { x, w, top } = PORTAL;
    const face = rect(x - w / 2 - 22, top - 26, w + 44, DECK - top + 26);
    p.fillPainted(face, linear(0, top - 26, 0, DECK, ['#2a3a52', '#1a2638']), { angle: 0, width: [3, 6], length: [8, 16], alpha: 0.7 });
    const mouth = shape([[x - w / 2, DECK], ...t.arc(x, top + w / 2, w / 2, Math.PI, Math.PI * 2).pts, [x + w / 2, DECK]]);
    p.fill(mouth, '#02040a');
    p.ink(t.arc(x, top + w / 2, w / 2 + 5, Math.PI, Math.PI * 2), { width: 3, color: '#3f5577', taper: 0, alpha: 0.8 });
    p.ink(t.line(x - w / 2 - 22, top - 26, x + w / 2 + 22, top - 26), { width: 2.5, color: '#3f5577', taper: 0 });
    p.stroke(t.line(1300, DECK - 2, x, DECK - 2), '#1b2536', 3); // rails continue to the portal
    // conifers on the hill
    for (let i = 0; i < 30; i++) {
      const tx = p.rng.range(1260, 1610);
      if (Math.abs(tx - x) < w / 2 + 30) continue;
      let ty = 400;
      while (ty < WATER && !near.contains(tx, ty)) ty += 2;
      const h = p.rng.range(24, 54);
      p.fill(shape([[tx, ty - h], [tx - h * 0.22, ty + 4], [tx + h * 0.22, ty + 4]]), '#081019');
    }
    p.mark('portal', x, DECK);
  });

  const TRAIN = { x0: 330, cars: 5, len: 150, gap: 8, h: 34 };
  const train = t.layer('train', (p) => {
    const { x0, cars, len, gap, h } = TRAIN;
    const top = DECK - 4 - h;
    for (let c = 0; c < cars; c++) {
      const x = x0 + c * (len + gap);
      const loco = c === cars - 1;
      const body = loco ? shape([[x, top], [x + len - 28, top], [x + len, top + h * 0.55], [x + len, DECK - 4], [x, DECK - 4]]) : rect(x, top, len, h, 5);
      p.fill(body, '#141c2c');
      p.ink(t.line(x + 4, top + 1, x + len - (loco ? 30 : 4), top + 1), { width: 1.5, color: '#4a5d7a', taper: 0 });
      // windows
      const nWin = loco ? 2 : 6;
      for (let i = 0; i < nWin; i++) {
        const wx = x + 12 + i * 22.5, wy = top + 8;
        const warm = p.rng.pick(['#ffd98a', '#ffcf73', '#ffe6b0', '#ffc766']);
        const lit = p.rng.chance(0.88);
        p.fill(rect(wx, wy, 15, 12, 2), lit ? warm : '#2a3040');
        if (lit && p.rng.chance(0.25)) {
          // a passenger's silhouette
          const sx = wx + p.rng.range(4, 11);
          p.fill(t.ellipse(sx, wy + 6, 3, 3.5), alpha('#3a2a20', 0.8));
          p.fill(t.ellipse(sx, wy + 13, 5, 4), alpha('#3a2a20', 0.8));
        }
      }
      if (loco) {
        p.fill(rect(x + len - 40, top + 8, 12, 10, 2), '#bfe3ff');
        p.mark('headlight', x + len - 2, top + h * 0.7);
      }
      // wheels / bogies
      for (const bx of [x + 22, x + len - 22]) p.fill(rect(bx - 14, DECK - 6, 28, 5, 2), '#070b14');
    }
    // pantograph
    const lx = x0 + (cars - 1) * (len + gap) + 50;
    p.stroke(shape([[lx, top], [lx + 14, top - 14], [lx + 28, top]], false), '#141c2c', 2);
    p.stroke(t.line(lx + 4, top - 14, lx + 26, top - 14), '#141c2c', 2);
  });

  const glowL = t.layer('train-glow', { blend: 'screen' }, (p) => {
    const { x0, cars, len, gap, h } = TRAIN;
    const top = DECK - 4 - h;
    p.group({ blur: 10 }, (g) => {
      for (let c = 0; c < cars - 1; c++) g.fill(rect(x0 + c * (len + gap) + 8, top + 6, len - 16, 16), alpha('#ffb54a', 0.6));
    });
    // headlight beam along the track
    const hx = x0 + (cars - 1) * (len + gap) + len, hy = top + h * 0.7;
    p.group({ blur: 8 }, (g) => {
      g.fill(shape([[hx, hy - 3], [hx + 420, hy - 40], [hx + 420, hy + 30], [hx, hy + 3]]), linear(hx, 0, hx + 420, 0, [alpha('#d8efff', 0.6), alpha('#d8efff', 0)]));
      g.fill(circle(hx, hy, 10), '#e8f6ff');
    });
  });

  t.layer('water', (p) => {
    p.fill(rect(0, WATER, W, H - WATER), linear(0, WATER, 0, H, ['#1a2c3e', '#0a1322', '#050912']));
    p.reflect([sky, milky, stars, hills, viaduct, hill, train, glowL], { axis: WATER, ripple: 4, wavelength: 6, fade: [0.7, 0.2], blur: 1.2, tint: '#0a1830', tintAlpha: 0.35 });
    // the waterline: a faint bright seam where the far surface catches the sky
    p.ink(t.line(0, WATER + 1, W, WATER + 1), { width: 1.5, color: '#3d5b78', alpha: 0.6, taper: 0.1 });
    // horizontal glints that break the mirror
    for (let i = 0; i < 160; i++) {
      const y = WATER + Math.pow(p.rng(), 1.6) * (H - WATER);
      const x = p.rng.range(0, W), len = p.rng.range(20, 120) * (1 + (y - WATER) / 200);
      p.ink(t.line(x, y, x + len, y), { width: p.rng.range(0.6, 1.8), color: p.rng.pick(['#2a4460', '#0a1426', '#324d6a']), alpha: 0.6, taper: 0.4 });
    }
  });

  t.layer('reeds', (p) => {
    const clump = (cx, n, hmax) => {
      for (let i = 0; i < n; i++) {
        const x = cx + p.rng.gauss(0, 40), h = p.rng.range(0.3, 1) * hmax, lean = p.rng.gauss(0, 0.25);
        const tip = [x + Math.sin(lean) * h, H - Math.cos(lean) * h];
        const mid = [x + Math.sin(lean) * h * 0.4 + p.rng.gauss(0, 6), H - h * 0.5];
        p.ink(curve([[x, H + 5], mid, tip]), { width: p.rng.range(2, 5), color: '#03060c', taper: [0, 0.7] });
        if (p.rng.chance(0.2)) p.fill(t.ellipse(tip[0], tip[1] + 14, 4, 16, lean), '#03060c');
      }
    };
    clump(70, 40, 300);
    clump(1540, 30, 240);
  });

  t.layer('fireflies', { blend: 'screen' }, (p) => {
    for (let i = 0; i < 14; i++) {
      const x = p.rng.pick([p.rng.range(20, 260), p.rng.range(1380, 1590)]), y = p.rng.range(720, 960);
      p.glow(circle(x, y, 5), '#d9ff8a', 14, { alpha: 1 });
      p.fill(circle(x, y, 2.2), '#f6ffd8');
    }
  });

  t.layer('finish', () => t.p.grain(0.025));
}
