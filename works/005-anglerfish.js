// 005 — 小さな灯り #4: the anglerfish (a creature that carries its own light)
export const meta = { title: 'Anglerfish', width: 1600, height: 1000, seed: 21, background: '#02050b' };

export default function (t) {
  const { W, H, curve, circle, ellipse, rect, shape, line, linear, radial, alpha, mix, thick, ribbon, poisson, polar } = t;

  // ---- anatomy (fish faces left) -------------------------------------------------
  const ESCA = [470, 262];
  const SNOUT = [604, 398], CHIN = [556, 706], CORNER = [808, 588];
  const UPPER_JAW = curve([SNOUT, [640, 452], [714, 528], CORNER]);
  const LOWER_JAW = curve([CHIN, [614, 672], [706, 630], CORNER]);
  const BODY = curve([
    SNOUT, [628, 338], [716, 280], [860, 250], [1000, 268], [1112, 330], [1182, 420], [1222, 470],
    [1224, 540], [1172, 612], [1062, 692], [922, 752], [780, 772], [650, 762], CHIN,
    [614, 672], [706, 630], CORNER, [714, 528], [640, 452],
  ], { closed: true });
  const EYE = [712, 372];
  const TAILBASE = [1222, 505];

  /** Fan-shaped fin: base point, spread between two angles, scalloped edge. */
  const fanFin = (bx, by, a0, a1, len, rng) => {
    const n = 9, edge = [];
    for (let i = 0; i <= n * 3; i++) {
      const u = i / (n * 3), a = a0 + (a1 - a0) * u;
      const scallop = 1 - 0.08 * Math.abs(Math.sin(u * n * Math.PI));
      edge.push(polar(bx, by, len * scallop * (0.85 + 0.15 * Math.sin(u * Math.PI)) * rng.range(0.97, 1.03), a));
    }
    const rays = t.times(n + 1, (i) => polar(bx, by, len * (0.85 + 0.15 * Math.sin((i / n) * Math.PI)), a0 + ((a1 - a0) * i) / n));
    return { shape: shape([[bx, by], ...edge]), rays };
  };

  // ---- the deep ----------------------------------------------------------------
  t.layer('water', (p) => {
    p.fill(rect(0, 0, W, H), linear(0, 0, 0, H, ['#071224', '#040914', '#02040a']));
    // the lure's light hanging in the water: soft, slightly uneven haze
    const off = p.rng.range(0, 99);
    p.raster((x, y) => {
      const d = Math.hypot(x - ESCA[0], y - ESCA[1]);
      const k = Math.exp(-((d / 330) ** 2)) * (0.75 + 0.25 * p.rng.fbm(x * 0.006 + off, y * 0.006));
      return k > 0.01 ? [40, 200, 170, k * 0.45] : null;
    }, { bounds: { x: 0, y: 0, w: 1100, h: 900 }, res: 4, blur: 2 });
  });

  t.layer('far-snow', (p) => {
    for (let i = 0; i < 700; i++) {
      const x = p.rng.range(0, W), y = p.rng.range(0, H);
      const lit = Math.exp(-((Math.hypot(x - ESCA[0], y - ESCA[1]) / 380) ** 2));
      p.fill(circle(x, y, p.rng.range(0.5, 1.6), 6), alpha(mix('#34404f', '#b8fff0', lit), 0.3 + 0.6 * lit));
    }
  });

  // ---- the fish ------------------------------------------------------------------
  t.layer('fish', (p) => {
    const b = BODY.bounds();
    // throat, seen through the open mouth
    const cavity = curve([SNOUT, [662, 507], [724, 542], CORNER, [712, 594], [640, 618], CHIN, [596, 560]], { closed: true });
    p.fill(cavity, radial(780, 580, 240, ['#1e0a12', '#0c0408', '#030103']));

    // fins behind the body
    const tail = fanFin(TAILBASE[0] - 12, TAILBASE[1], -0.8, 0.8, 140, p.rng);
    const dorsal = fanFin(1150, 380, -1.7, -0.7, 64, p.rng);
    const anal = fanFin(1150, 630, 0.7, 1.6, 56, p.rng);
    for (const f of [tail, dorsal, anal]) {
      p.group({ blur: 1.5 }, (g) => g.fill(f.shape, alpha('#161118', 0.65)));
      for (const r of f.rays) p.ink(line(f.shape.pts[0][0], f.shape.pts[0][1], r[0], r[1]), { width: 2.2, color: '#2a2229', taper: [0, 0.8], alpha: 0.9 });
    }

    // body
    p.fill(BODY, radial(700, 460, 560, ['#221a1f', '#140f13', '#08060a']));
    p.clip(BODY, () => {
      // skin: short strokes wrapping around the globe of the body
      p.strokes(BODY, {
        angle: (x, y) => 0.35 * Math.sin((y - 500) / 140) + 0.5 * p.rng.noise2(x * 0.004, y * 0.004),
        colors: ['#1a1418', '#151015', '#1f181d', '#120e12'], width: [6, 12], length: [18, 36], alpha: 0.45, dry: 0.2,
      });
      // tubercles
      for (const [x, y] of poisson(BODY, 26, { rng: p.rng })) {
        p.fill(circle(x, y, p.rng.range(1.5, 3.2)), alpha('#302830', 0.7));
      }
      // darker belly & back to round the form
      p.fill(BODY, linear(0, b.y, 0, b.y1, [alpha('#000', 0.35), alpha('#000', 0), alpha('#000', 0.1), alpha('#000', 0.5)]));
      // lateral line
      p.ink(curve([[800, 440], [940, 420], [1080, 450], [1200, 500]]), { width: 2, color: '#352b32', alpha: 0.6, taper: 0.3 });
    });

    // pectoral fin, in front
    const pect = fanFin(900, 600, 0.35, 1.45, 96, p.rng);
    p.group({ blur: 1.2 }, (g) => g.fill(pect.shape, alpha('#1e171d', 0.75)));
    for (const r of pect.rays) p.ink(line(900, 600, r[0], r[1]), { width: 2.2, color: '#352b33', taper: [0, 0.7] });

    // eye: tiny, with a glint of the lure
    p.fill(circle(EYE[0], EYE[1], 13), '#0a0608');
    p.fill(circle(EYE[0], EYE[1], 10), radial(EYE[0] - 3, EYE[1] - 3, 10, ['#3a4a50', '#101418']));
    p.fill(circle(EYE[0] - 4, EYE[1] - 4, 2.8), '#dffff6');

    // illicium: the fishing rod on the forehead
    const rod = curve([[724, 284], [700, 186], [624, 128], [534, 136], [482, 190], ESCA]);
    p.ink(rod, { width: 7, color: '#2b2228', taper: [0, 0.3], pressure: [1, 0.7, 0.55] });
    p.mark('esca', ...ESCA);
    p.mark('eye', ...EYE);

    // the light falls on everything painted so far
    p.illuminate(ESCA[0], ESCA[1], 640, '#2fc9a0', { strength: 0.9, blend: 'lighter', falloff: [[0, 1], [0.3, 0.55], [0.6, 0.15], [1, 0]] });
    // rim light where the outline faces the lure
    for (const e of BODY.facingPoint(ESCA[0], ESCA[1], { min: 0.2, maxDist: 520 })) {
      p.ink(e.offset(-2), { width: 3.5, color: '#8affe0', alpha: 0.8, taper: 0.35 });
    }
    for (const e of pect.shape.facingPoint(ESCA[0], ESCA[1], { min: 0.3 })) p.ink(e, { width: 2, color: '#6ae8c8', alpha: 0.5, taper: 0.3 });
    p.ink(rod.sub(0, 0.85).offset(-2), { width: 2, color: '#8affe0', alpha: 0.6, taper: 0.3 });
  });

  t.layer('teeth', (p) => {
    // needle teeth angled back into the throat; the fangs near the front are longest
    const row = (jaw, sideSign, maxLen, count) => {
      const ts = t.times(count, (i) => (i + 0.5 + p.rng.range(-0.3, 0.3)) / count * 0.9 + 0.02);
      for (const tt of ts) {
        const f = jaw.frame(tt);
        const fang = p.rng.chance(0.35);
        const len = maxLen * (fang ? p.rng.range(0.85, 1.1) : p.rng.range(0.3, 0.55)) * (1 - tt * 0.55);
        const nx = -f.ty * sideSign, ny = f.tx * sideSign;
        const back = p.rng.range(0.25, 0.7);
        const dx = nx + back * f.tx, dy = ny + back * f.ty, dl = Math.hypot(dx, dy);
        const tip = [f.x + (dx / dl) * len, f.y + (dy / dl) * len];
        const mid = [f.x + (dx / dl) * len * 0.5 + f.tx * len * 0.14, f.y + (dy / dl) * len * 0.5 + f.ty * len * 0.14];
        const tooth = curve([[f.x - (dx / dl) * 6, f.y - (dy / dl) * 6], mid, tip]);
        const lit = Math.max(0.35, 1 - Math.hypot(f.x - ESCA[0], f.y - ESCA[1]) / 600);
        p.ink(tooth, { width: 4 + len * 0.07, color: mix('#6f6a60', '#e2dccb', lit), taper: [0, 1], alpha: 0.92 });
        p.ink(tooth.offset(-1.2), { width: 1.3, color: '#f2fff9', taper: [0.15, 1], alpha: 0.75 * lit });
      }
    };
    row(UPPER_JAW, 1, 70, 12);
    row(LOWER_JAW, -1, 84, 13);
  });

  t.layer('esca', (p) => {
    const [x, y] = ESCA;
    p.glow(circle(x, y, 30), '#3dffc0', 40);
    p.glow(circle(x, y, 16), '#b8fff0', 14);
    // a little filament dangling from the bulb
    p.ink(curve([[x + 4, y + 14], [x + 10, y + 34], [x + 4, y + 52]]), { width: 2.5, color: '#9fffe4', alpha: 0.7, taper: [0, 1] });
    p.fill(circle(x, y, 14), radial(x - 3, y - 4, 16, ['#ffffff', '#c8fff0', '#5fe8c4']));
  });

  t.layer('prey', (p) => {
    // small fish drawn to the light
    const fish = (x, y, s, ang) => {
      p.at(x, y, { rotate: ang, scale: s }, () => {
        const body = ribbon(curve([[-20, 0], [0, -1], [22, 0]]), (u) => 7 * Math.sin(Math.PI * Math.min(1, u * 1.1)), (u) => 6 * Math.sin(Math.PI * Math.min(1, u * 1.1)));
        const tailS = shape([[20, 0], [32, -8], [30, 0], [32, 8]]);
        p.fill([body, tailS], '#1c2a33');
        p.fill(body, linear(0, -7, 0, 7, [alpha('#9fffe4', 0.55), alpha('#9fffe4', 0)]));
        p.fill(circle(-12, -1, 1.6), '#dffff6');
      });
    };
    fish(360, 330, 1.5, 0.3);
    fish(300, 230, 1.1, -0.15);
    fish(410, 420, 1.0, 0.75);
    fish(232, 318, 0.9, 0.05);
    fish(180, 420, 0.7, -0.1);
  });

  t.layer('near-snow', { blend: 'screen' }, (p) => {
    // a few big, out-of-focus particles drifting in front
    for (let i = 0; i < 26; i++) {
      const x = p.rng.range(0, W), y = p.rng.range(0, H);
      const lit = Math.exp(-((Math.hypot(x - ESCA[0], y - ESCA[1]) / 500) ** 2));
      p.glow(circle(x, y, p.rng.range(3, 7)), mix('#2a3a48', '#7affe0', lit), 6, { alpha: 0.4 + 0.5 * lit });
    }
  });

  t.layer('finish', () => {
    t.p.vignette(0.6, { cx: 640, cy: 440, inner: 0.25 });
    t.p.grain(0.03);
  });
}
