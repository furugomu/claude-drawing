// 001 — lighthouse at blue hour
export const meta = { title: 'Lighthouse, blue hour', width: 1600, height: 1000, seed: 7, background: '#1b1f3b' };

const SKY = [[0, '#141833'], [0.45, '#3b3566'], [0.75, '#8a5a7c'], [0.92, '#e59a7a'], [1, '#f6c48f']];
const SEA = [[0, '#6d5f86'], [0.08, '#3a3f6e'], [0.5, '#1d2447'], [1, '#0e1330']];

export default function (t) {
  const { W, H, curve, circle, rect, shape, linear, radial, poisson, alpha, ramp, jitter, mix, blobUnion } = t;
  const HORIZON = 610;
  const LX = 1255; // lighthouse axis
  const GLOW = [330, HORIZON]; // where the sun went down

  t.layer('sky', (p) => {
    p.fill(rect(0, 0, W, HORIZON + 2), linear(0, 0, 0, HORIZON, SKY));
    // paint over the gradient with horizontal strokes sampled from it
    p.strokes(rect(0, 0, W, HORIZON), {
      angle: (x, y) => 0.04 * Math.sin(x / 300),
      colors: (x, y, rng) => jitter(ramp(SKY, y / HORIZON), rng, { l: 0.025 }),
      width: [14, 26], length: [80, 200], alpha: 0.6, dry: 0.35, clip: true,
    });
    p.fill(rect(0, 0, W, HORIZON + 2), radial(GLOW[0], GLOW[1], 750, [alpha('#ffb27a', 0.5), alpha('#ffb27a', 0)]), { blend: 'screen' });
  });

  t.layer('stars', (p) => {
    for (const [x, y] of poisson({ x: 0, y: 0, w: W, h: 360 }, 40, { rng: p.rng })) {
      const fade = 1 - y / 360;
      const big = p.rng.chance(0.05);
      const r = p.rng.range(0.6, 1.5) * (big ? 1.8 : 1);
      if (big) p.glow(circle(x, y, r * 2), '#fff3d6', 6, { alpha: 0.6 * fade });
      p.fill(circle(x, y, r), alpha('#fff6e0', 0.3 + 0.6 * fade * p.rng()));
    }
  });

  t.layer('clouds', (p) => {
    // sunset stratocumulus: a row of base puffs + bigger bumps on top, flat underside
    const cloud = (cx, cy, w, h) => {
      const n = Math.round(w / (h * 0.7));
      const circles = t.times(n + 1, (i) => [cx - w / 2 + (i / n) * w, cy, h * 0.5 * p.rng.range(0.8, 1.2)]);
      for (let i = 0; i < n * 0.7; i++) {
        const u = p.rng.range(0.1, 0.9), env = Math.sin(Math.PI * u);
        circles.push([cx - w / 2 + u * w, cy - h * 0.35 * env, h * p.rng.range(0.4, 0.8) * (0.5 + env * 0.6)]);
      }
      const loops = blobUnion(circles, { blend: 0.45, all: true });
      const under = cy + h * 0.25;
      p.group({ mask: (m) => m.fill(rect(cx - w, cy - h * 3, w * 2, h * 3.6), linear(0, under - h * 0.15, 0, under + h * 0.2, ['#000', alpha('#000', 0)])) }, (p) => {
        for (const s of loops) {
          const b = s.bounds();
          p.wash(s, { color: '#6e5277', alpha: 0.08, spread: 0.12, edge: 0.3, soft: 1.5, points: 40 });
          p.strokes(s, {
            angle: 0, width: [5, 10], length: [25, 60], alpha: 0.6, dry: 0.4,
            colors: (x, y, rng) => jitter(mix('#7a5a82', '#f3ae86', Math.max(0, (y - b.y) / b.h - 0.3) * 1.5), rng),
          });
        }
      });
    };
    cloud(250, 445, 420, 44);
    cloud(780, 488, 320, 30);
    cloud(560, 300, 280, 30);
    cloud(1040, 395, 400, 40);
    cloud(1480, 250, 260, 28);
  });

  t.layer('sea', (p) => {
    const sea = rect(0, HORIZON, W, H - HORIZON);
    p.fill(sea, linear(0, HORIZON, 0, H, SEA));
    p.strokes(sea, {
      angle: 0, jitter: 0.03, spacing: 9,
      width: (() => { return [3, 9]; })(), length: [60, 220], dry: 0.45, alpha: 0.7,
      colors: (x, y, rng) => {
        const k = (y - HORIZON) / (H - HORIZON);
        const base = ramp(SEA, k);
        return rng.chance(0.35) ? t.lighten(base, 0.08 + 0.05 * (1 - k)) : jitter(t.darken(base, 0.03), rng);
      },
    });
    // afterglow reflection: a broken column of warm dashes
    for (let y = HORIZON + 3; y < 860; y += 6) {
      const k = (y - HORIZON) / 250;
      const x = GLOW[0] + p.rng.gauss(0, 40 + k * 50);
      const len = p.rng.range(30, 150) * (1 - k * 0.4);
      p.brush(curve([[x - len / 2, y], [x + len / 2, y + p.rng.range(-1, 1)]]), {
        width: 2.5 + k * 3, color: mix('#ffd3a0', '#e88f78', Math.min(1, k)), alpha: 0.75 * Math.max(0.1, 1 - k * 0.8), dry: 0.3,
      });
    }
  });

  t.layer('beam', { blend: 'screen', blur: 16 }, (p) => {
    const ly = 318;
    p.fill(shape([[LX, ly - 8], [LX - 950, ly - 170], [LX - 950, ly + 100], [LX, ly + 8]]),
      linear(LX, ly, LX - 950, ly, [alpha('#fff1c4', 0.5), alpha('#fff1c4', 0)]));
  });

  const CLIFF = curve([
    [890, 1010], [915, 930], [950, 850], [975, 760], [1010, 700], [1060, 650], [1120, 612],
    [1200, 592], [1300, 590], [1420, 574], [1510, 590], [1610, 596], [1610, 1010],
  ]).close().wobble(9, { rng: t.rng.fork('cliff'), freq: 1.6 }).wobble(2.5, { rng: t.rng.fork('cliff2'), freq: 8 });
  const LIGHT = Math.atan2(-0.35, -1); // afterglow: low, from the left

  t.layer('cliff', (p) => {
    const b = CLIFF.bounds();
    p.fill(CLIFF, '#12152c');
    // facets: strokes lean with the slope; faces toward the afterglow catch warm light
    p.strokes(CLIFF, {
      angle: (x, y) => -1.2 + 0.7 * p.rng.noise2(x * 0.006, y * 0.006),
      width: [8, 18], length: [18, 45], dry: 0.25, jitter: 0.3,
      colors: (x, y, rng) => {
        const lit = Math.max(0, 1 - (x - b.x) / 300) * Math.max(0, 1 - (y - b.y) / 500);
        return jitter(mix('#161a36', '#6f5276', Math.min(1, lit * 1.6)), rng, { l: 0.04 });
      },
    });
    // warm rim wherever the outline faces the light
    for (const edge of CLIFF.facing(LIGHT, { min: 0.35, minLength: 30 })) {
      p.ink(edge.offset(-2), { width: 4, color: '#e39a7e', alpha: 0.7, taper: 0.3 });
    }
    p.mark('cliff-top', 1300, 590);
  });

  t.layer('foam', (p) => {
    // surf where the sea meets the foot of the cliff
    for (let i = 0; i < 40; i++) {
      const y = p.rng.range(900, 1000);
      let ex = 1600;
      for (let x = 850; x < 1100; x += 2) if (CLIFF.contains(x, y)) { ex = x; break; }
      const len = p.rng.range(25, 80) * (0.6 + (y - 900) / 150);
      const x = ex + p.rng.range(-10, 6);
      p.brush(curve([[x - len, y + p.rng.range(-2, 2)], [x - len * 0.4, y - 1], [x, y]]), {
        width: p.rng.range(2, 6), color: p.rng.pick(['#9aa0cc', '#c5c9e8', '#7d84b8']), alpha: 0.55, dry: 0.5,
      });
    }
  });

  t.layer('cottage', (p) => {
    const x = 1360, y = 575;
    const wall = shape([[x, y], [x, y - 44], [x + 70, y - 44], [x + 70, y]]);
    const small = { width: [2, 4], length: [8, 16], dry: 0.3 };
    p.fillPainted(wall, linear(x, 0, x + 70, 0, ['#d9b8aa', '#b9a9a8', '#6d6484', '#4d4868']), { ...small, angle: Math.PI / 2 });
    p.fillPainted(shape([[x - 8, y - 42], [x + 26, y - 72], [x + 60, y - 72], [x + 78, y - 42]]), '#3b2f45', { ...small, angle: 0 });
    p.fill(rect(x + 12, y - 32, 14, 14), '#ffcf7a');
    p.glow(rect(x + 12, y - 32, 14, 14), '#ffb45a', 10, { alpha: 0.8 });
    p.fill(rect(x + 48, y - 90, 8, 22), '#3b2f45');
  });

  t.layer('lighthouse', (p) => {
    const baseY = 590, topY = 350;
    const half = (y) => 34 - ((baseY - y) / (baseY - topY)) * 11;
    const band = (y0, y1) => shape([[LX - half(y0), y0], [LX - half(y1), y1], [LX + half(y1), y1], [LX + half(y0), y0]]);
    const body = band(baseY, topY);
    const paintOpts = { angle: Math.PI / 2, width: [3, 5], length: [10, 26], dry: 0.3, alpha: 0.7 };
    p.fillPainted(body, linear(LX - 34, 0, LX + 34, 0, ['#f6d9c4', '#e6ddd4', '#8e8aa3', '#4b4a6a']), paintOpts);
    for (const [y0, y1] of [[545, 512], [470, 437]]) {
      p.fillPainted(band(y0, y1), linear(LX - 34, 0, LX + 34, 0, ['#e0705a', '#b8453c', '#6a2a3a', '#3e1f34']), paintOpts);
    }
    p.ink(body.open(), { width: 1.6, color: '#2a2440', taper: 0, alpha: 0.7, wobble: 0.4 });
    // door
    p.fill(rect(LX - 8, baseY - 28, 16, 28, 7), '#2a2440');
    // gallery + lantern
    p.fill(rect(LX - 32, topY - 8, 64, 10), '#2a2a36');
    p.fill(rect(LX - 17, topY - 44, 34, 36), '#fff3c9');
    p.stroke(t.line(LX, topY - 44, LX, topY - 8), '#2a2a36', 2);
    p.stroke(rect(LX - 17, topY - 44, 34, 36), '#2a2a36', 3);
    p.fill(shape([[LX - 24, topY - 44], [LX, topY - 70], [LX + 24, topY - 44]]), '#2a2a36');
    p.glow(circle(LX, topY - 26, 34), '#ffe6a0', 30);
    p.mark('lamp', LX, topY - 26);
  });

  t.layer('finish', () => t.p.grain(0.025));
}
