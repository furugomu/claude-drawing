// 007 — 小さな灯り #6: 灯籠流し (floating lanterns)
// First the river of lights; then, in the dark at the lower left, a parent and
// child on the stone steps — and the lantern that has only just left their hands.
export const meta = { title: '灯籠流し', width: 1600, height: 1000, seed: 4, background: '#0b1022' };

const SKY = [[0, '#0a0f26'], [0.45, '#1c2650'], [0.78, '#4a4674'], [0.93, '#a0708a'], [1, '#e8a27c']];
const PAPER = ['#ffc870', '#ffd98a', '#ffb870', '#ffe2a8', '#ffc0a0', '#ffb4b4'];

export default function (t) {
  const { W, H, curve, circle, ellipse, rect, shape, line, linear, radial, alpha, mix, thick, blobUnion, times } = t;
  const cam = t.perspective({ horizon: 420, cx: 900, eye: 2.2, focal: 1100 });
  const HZ = cam.horizon;
  const GLOW = [990, HZ];

  // ---- the world, in metres -------------------------------------------------------
  const WALL_X = -6;            // left embankment face
  const WALL_H = 1.4;
  const FAR_X = 32;             // far bank
  const EDGE_Z = 6.8;           // far edge of the stone landing
  const LANDING_Y = 0.12;
  const FAMILY_Z = 6.25;
  const MOTHER_X = -1.8, CHILD_X = -1.05;
  const MINE = { X: -0.3, Z: 7.9, color: '#ffcf78', mine: true }; // just let go

  const R = t.rng.fork('world');
  const drift = (Z) => MINE.X + (Z - MINE.Z) * 0.05 + 2.8 * Math.sin((Z - MINE.Z) / 16);
  const LANTERNS = [MINE];
  for (let Z = MINE.Z + 2.4; Z < 280; Z += R.range(0.7, 1.9) * (1 + Z / 45)) {
    const n = Z > 20 ? R.int(1, 3) : 1;
    for (let i = 0; i < n; i++) LANTERNS.push({ X: drift(Z) + R.gauss(0, 0.7 + Z * 0.025), Z: Z + R.range(-0.6, 0.6), color: R.pick(PAPER) });
  }
  for (let i = 0; i < 5; i++) LANTERNS.push({ X: R.range(2, 7), Z: R.range(11, 24), color: R.pick(PAPER) }); // strays
  LANTERNS.sort((a, b) => b.Z - a.Z); // far first

  // each list draws from its own random stream, so changing one never reshuffles another
  const RW = t.rng.fork('willows'), RF = t.rng.fork('far');
  const WILLOWS = [12, 24, 40, 64, 100].map((Z) => ({ Z, X: WALL_X - 1.2 - RW.range(0, 0.8), h: RW.range(5.5, 7), seed: `willow${Z}` }));
  const LAMPS = [17, 31, 50, 78, 120, 180].map((Z) => ({ Z, X: WALL_X - 0.4 }));
  const FAR = [];
  for (let Z = 45; Z < 420; Z += RF.range(6, 14) * (1 + Z / 150)) {
    FAR.push(RF.chance(0.35)
      ? { kind: 'house', Z, X: FAR_X + RF.range(2, 8), w: RF.range(6, 10), h: RF.range(4.5, 7), lit: RF.range(0, 1) }
      : { kind: 'tree', Z, X: FAR_X + RF.range(0, 10), r: RF.range(3, 5), h: RF.range(6, 10), seed: `tree${Z.toFixed(1)}` });
  }
  const BRIDGE_Z = 160;

  // ---- scenery (each can be drawn upright, or mirrored as its reflection) -----------
  const place = (s, X, Z, mirror, Y = 0) => cam.place(s, X, Z, { Y, mirror });

  const drawWall = (p, mirror) => {
    const Y = (v) => (mirror ? -v : v);
    const face = shape([cam.at(WALL_X, EDGE_Z, Y(0)), cam.at(WALL_X, 600, Y(0)), cam.at(WALL_X, 600, Y(WALL_H)), cam.at(WALL_X, EDGE_Z, Y(WALL_H))]);
    p.fill(face, linear(0, HZ, 0, 800, ['#2a2c44', '#1a1b2c']));
    // courses of stone converging to the vanishing point
    for (let v = 0.35; v < WALL_H; v += 0.35) p.stroke(shape([cam.at(WALL_X, EDGE_Z, Y(v)), cam.at(WALL_X, 600, Y(v))], false), '#12131f', 1.2);
    for (let Z = EDGE_Z; Z < 120; Z *= 1.12) p.stroke(shape([cam.at(WALL_X, Z, Y(0)), cam.at(WALL_X, Z, Y(WALL_H))], false), '#12131f', 1);
    // the promenade on top
    const top = shape([cam.at(WALL_X, EDGE_Z, Y(WALL_H)), cam.at(WALL_X, 600, Y(WALL_H)), cam.at(WALL_X - 14, 600, Y(WALL_H)), cam.at(WALL_X - 14, EDGE_Z, Y(WALL_H))]);
    p.fill(top, '#161726');
  };

  const drawWillow = (p, w, mirror) => p.scope(w.seed, () => {
    const Y0 = WALL_H;
    const k = cam.scale(w.Z);
    const trunk = thick(curve([[0, 0], [0.3, w.h * 0.28], [0.1, w.h * 0.55]]), (u) => 0.42 * (1 - u * 0.45));
    const limbs = [
      thick(curve([[0.1, w.h * 0.5], [-0.7, w.h * 0.78], [-1.9, w.h * 0.86]]), (u) => 0.14 * (1 - u * 0.6)),
      thick(curve([[0.15, w.h * 0.52], [1.0, w.h * 0.84], [2.1, w.h * 0.8]]), (u) => 0.13 * (1 - u * 0.6)),
      thick(curve([[0.1, w.h * 0.55], [0.2, w.h * 0.85], [-0.2, w.h * 1.0]]), (u) => 0.11 * (1 - u * 0.6)),
    ];
    const bark = mix('#0a0d16', '#3a3a62', w.Z / 260);
    p.fill([trunk, ...limbs].map((s) => place(s, w.X, w.Z, mirror, Y0)), bark);
    // a curtain of strands hanging from the whole arching crown, nearly to the ground
    const spread = 2.8;
    for (let i = 0; i < 170; i++) {
      const u = p.rng.range(-1, 1);
      const sx = u * spread, sy = w.h * (1.0 - 0.3 * u * u) + p.rng.range(-0.4, 0.2);
      const bottom = p.rng.range(0.5, 2.4);
      const len = sy - bottom;
      const sway = p.rng.gauss(0.18, 0.12);
      const strand = curve([[sx, sy], [sx + u * 0.25 + sway * 0.2, sy - len * 0.35], [sx + u * 0.3 + sway, sy - len]]);
      p.ink(place(strand, w.X, w.Z, mirror, Y0), { width: Math.max(0.5, k * 0.035), color: mix('#0c1614', '#3a4468', w.Z / 260), taper: [0.05, 0.5], alpha: 0.85 });
    }
  });

  const drawLamp = (p, L, mirror) => {
    const s = cam.scale(L.Z);
    p.fill(place(rect(-0.05, 0, 0.1, 3.2), L.X, L.Z, mirror, WALL_H), '#0a0d14');
    const [x, y] = cam.at(L.X, L.Z, (mirror ? -1 : 1) * (WALL_H + 3.35));
    p.dot(x, y, Math.max(1, s * 0.12), '#ffd28a', { blur: s * 0.25 + 2, alpha: mirror ? 0.6 : 1 });
  };

  const drawFar = (p, f, mirror) => {
    const s = cam.scale(f.Z);
    if (f.kind === 'tree') {
      p.scope(f.seed, () => {
        const cy = f.h - f.r * 0.7;
        const puffs = t.times(10, (i) => [p.rng.range(-f.r * 0.65, f.r * 0.65), cy + p.rng.range(-f.r * 0.35, f.r * 0.5), f.r * p.rng.range(0.35, 0.6)]);
        // foliage: small bumps along the crown's edge so it doesn't read as a rock
        const crown = blobUnion(puffs, { cell: 0.08, blend: 0.25 }).wobble(0.28, { rng: p.rng, freq: 160 });
        const fog = 1 - Math.exp(-f.Z / 220);
        p.fill([place(crown, f.X, f.Z, mirror), place(rect(-0.2, 0, 0.4, f.h * 0.5), f.X, f.Z, mirror)], mix('#0c1122', '#4a4674', fog * 0.85));
      });
    } else {
      const body = shape([[-f.w / 2, 0], [f.w / 2, 0], [f.w / 2, f.h], [0, f.h + 2], [-f.w / 2, f.h]]);
      p.fill(place(body, f.X, f.Z, mirror), mix('#0f1426', '#4a4674', (1 - Math.exp(-f.Z / 220)) * 0.8));
      if (f.lit > 0.4) {
        const win = rect(-f.w * 0.3, f.h * 0.35, f.w * 0.18, f.h * 0.22);
        p.fill(place(win, f.X, f.Z, mirror), mirror ? '#c88a4a' : '#ffc66e');
        if (s > 3) p.dot(...cam.at(f.X - f.w * 0.21, f.Z, (mirror ? -1 : 1) * f.h * 0.46), s * 0.6, '#ffb050', { blur: s, alpha: 0.4 });
      }
    }
  };

  const drawBridge = (p, mirror) => {
    const Y = (v) => (mirror ? -v : v);
    const deck = shape([cam.at(WALL_X - 2, BRIDGE_Z, Y(5.2)), cam.at(FAR_X + 4, BRIDGE_Z, Y(5.2)), cam.at(FAR_X + 4, BRIDGE_Z, Y(6.4)), cam.at(WALL_X - 2, BRIDGE_Z, Y(6.4))]);
    const piers = [];
    for (let X = WALL_X + 6; X < FAR_X; X += 9.5) piers.push(shape([cam.at(X - 0.8, BRIDGE_Z, Y(0)), cam.at(X + 0.8, BRIDGE_Z, Y(0)), cam.at(X + 0.8, BRIDGE_Z, Y(5.3)), cam.at(X - 0.8, BRIDGE_Z, Y(5.3))]));
    p.fill([deck, ...piers], '#121830');
    for (let X = WALL_X; X < FAR_X + 3; X += 4.5) {
      const [x, y] = cam.at(X, BRIDGE_Z, Y(7.1));
      p.dot(x, y, 1.1, '#ffd89a', { blur: 2.5, alpha: mirror ? 0.5 : 0.95 });
    }
  };

  // ---- lanterns --------------------------------------------------------------------
  const drawLantern = (p, L) => {
    const s = cam.scale(L.Z);
    const [x, y] = cam.at(L.X, L.Z);
    const w = 0.3 * s;
    if (w < 3.5) {
      p.dot(x, y - w * 0.6, Math.max(0.7, w * 0.45), L.color, { blur: w * 1.4 + 1, alpha: 0.95 });
      return;
    }
    const X0 = L.X - 0.15, X1 = L.X + 0.15, Zf = L.Z - 0.15, Zb = L.Z + 0.15;
    const q = (pts) => shape(pts.map(([X, Z, Y]) => cam.at(X, Z, Y)));
    p.dot(x, y - w * 0.6, w * 0.7, L.color, { blur: w * 1.3, alpha: 0.4, blend: 'screen' });
    // floating board
    p.fill(q([[X0 - 0.05, Zf - 0.05, 0], [X1 + 0.05, Zf - 0.05, 0], [X1 + 0.05, Zf - 0.05, 0.05], [X0 - 0.05, Zf - 0.05, 0.05]]), '#2a1c14');
    // side face (whichever side faces the camera), front face, open top glowing inside
    const sx = L.X > 0 ? X0 : X1;
    p.fill(q([[sx, Zf, 0.05], [sx, Zb, 0.05], [sx, Zb, 0.42], [sx, Zf, 0.42]]), mix(L.color, '#b0603a', 0.35));
    const front = q([[X0, Zf, 0.05], [X1, Zf, 0.05], [X1, Zf, 0.42], [X0, Zf, 0.42]]);
    const fb = front.bounds();
    p.fill(front, radial(fb.cx, fb.cy + fb.h * 0.15, fb.w * 0.8, ['#fff6dc', L.color, mix(L.color, '#c0603a', 0.4)]));
    p.fill(q([[X0, Zf, 0.42], [X1, Zf, 0.42], [X1, Zb, 0.42], [X0, Zb, 0.42]]), '#fff2c8');
    if (w > 10) {
      p.stroke(front, '#3a2418', Math.max(0.8, s * 0.012));
      // a few brush marks: a name or a wish written on the paper
      for (let i = 0; i < 2 + (w > 30 ? 2 : 0); i++) {
        const cx = fb.x + fb.w * (0.3 + 0.13 * i), cy = fb.y + fb.h * 0.25;
        p.ink(line(cx, cy, cx + fb.w * 0.02, cy + fb.h * p.rng.range(0.35, 0.55)), { width: Math.max(0.8, fb.w * 0.035), color: '#5a2c1c', alpha: 0.55, taper: 0.3, wobble: fb.w * 0.02 });
      }
    }
  };

  /** A lantern's light trail on the water (drawn into the reflection group). */
  const trail = (p, L) => {
    const s = cam.scale(L.Z);
    const [x, y] = cam.at(L.X, L.Z);
    const w = Math.max(1.2, 0.3 * s);
    const len = w * (2.2 + 30 / (L.Z + 5));
    for (let yy = y + 1; yy < y + len; yy += Math.max(1.5, w * 0.12)) {
      const k = (yy - y) / len;
      const dw = w * (0.9 - 0.5 * k) * p.rng.range(0.5, 1.2);
      p.ink(line(x - dw / 2, yy, x + dw / 2, yy), { width: Math.max(0.8, w * 0.07), color: L.color, alpha: 0.75 * (1 - k), taper: 0.3 });
    }
  };

  // ---- painting ------------------------------------------------------------------
  const sky = t.layer('sky', (p) => {
    p.fill(rect(0, 0, W, HZ + 2), linear(0, 0, 0, HZ, SKY));
    p.fill(rect(0, 0, W, HZ + 2), radial(GLOW[0], GLOW[1], 700, [alpha('#ffb07a', 0.55), alpha('#ff9a7a', 0.18), alpha('#ff9a7a', 0)]), { blend: 'screen' });
    for (let i = 0; i < 70; i++) p.dot(p.rng.range(0, W), p.rng.range(0, 200), p.rng.range(0.4, 1), '#f4f0ff', { alpha: p.rng.range(0.2, 0.7) });
  });

  const mountains = t.layer('mountains', (p) => {
    const pts = [[-10, HZ + 1]];
    for (let x = -10; x <= W + 10; x += 16) pts.push([x, HZ - 18 - 70 * (0.5 + 0.5 * p.rng.fbm(x * 0.003, 3, { octaves: 4 })) * (0.5 + 0.5 * Math.abs(x - GLOW[0]) / 800)]);
    pts.push([W + 10, HZ + 1]);
    p.fill(shape(pts), linear(0, HZ - 100, 0, HZ, ['#262a4c', '#343556']));
  });

  t.layer('water', (p) => {
    const water = rect(0, HZ, W, H - HZ);
    p.fill(water, linear(0, HZ, 0, H, ['#56507a', '#262a4e', '#0d1228', '#070a18']));
    p.group({ alpha: 0.85 }, (r) => {
      r.reflect([sky, mountains], { axis: HZ, ripple: 0, fade: [0.9, 0.25], blur: 0 });
      drawBridge(r, true);
      for (const f of FAR.slice().reverse()) drawFar(r, f, true);
      drawWall(r, true);
      for (const w of WILLOWS.slice().reverse()) drawWillow(r, w, true);
      for (const L of LAMPS) r.with({ blend: 'screen' }, () => trail(r, { ...L, X: L.X, color: '#ffc880' }));
      r.with({ blend: 'screen' }, () => { for (const L of LANTERNS) trail(r, L); });
      r.ripple({ from: HZ, amount: 9, wavelength: 5, grow: 1.4 });
    });
    // fine glints breaking the mirror
    for (let i = 0; i < 260; i++) {
      const y = HZ + 4 + Math.pow(p.rng(), 1.8) * (H - HZ);
      const x = p.rng.range(0, W), len = p.rng.range(6, 40) * (1 + (y - HZ) / 120);
      p.ink(line(x, y, x + len, y), { width: p.rng.range(0.5, 1.4), color: p.rng.pick(['#8a86b0', '#1a1e3a', '#b8a0b0']), alpha: 0.35, taper: 0.4 });
    }
  });

  t.layer('far-bank', (p) => {
    drawBridge(p, false);
    for (const f of FAR.slice().reverse()) drawFar(p, f, false);
  });

  t.layer('left-bank', (p) => {
    drawWall(p, false);
    for (const w of WILLOWS.slice().reverse()) drawWillow(p, w, false);
    for (const L of LAMPS.slice().reverse()) drawLamp(p, L, false);
  });

  t.layer('lanterns', (p) => {
    for (const L of LANTERNS) drawLantern(p, L);
  });

  const landing = cam.ground(-7, 1.4, 1.5, EDGE_Z, LANDING_Y);
  t.layer('landing', (p) => {
    p.fillPainted(landing, linear(0, 756, 0, H, ['#17161f', '#0b0a10']), { angle: 0, width: [6, 12], length: [30, 70], alpha: 0.45 });
    // paving joints in perspective
    for (let Z = 2; Z < EDGE_Z; Z += 0.9) p.stroke(shape([cam.at(-7, Z, LANDING_Y), cam.at(1.4, Z, LANDING_Y)], false), '#060609', 1.5);
    for (let X = -6.5; X < 1.4; X += 1.1) p.stroke(shape([cam.at(X, 1.5, LANDING_Y), cam.at(X, EDGE_Z, LANDING_Y)], false), '#060609', 1.5);
    // wet edge catching the sky, and the lantern's light pooled on the stone
    p.ink(shape([cam.at(-7, EDGE_Z, LANDING_Y), cam.at(1.4, EDGE_Z, LANDING_Y)], false), { width: 2, color: '#6a6090', alpha: 0.6, taper: 0.05 });
    const [lx, ly] = cam.at(MINE.X, MINE.Z, 0.25);
    p.clip(landing, () => p.fill(landing, radial(lx, ly + 30, 300, [alpha('#ffb45a', 0.22), alpha('#ffb45a', 0)]), { blend: 'screen' }));
  });

  t.layer('family', (p) => {
    const [lx, ly] = cam.at(MINE.X, MINE.Z, 0.25); // the lantern's light
    const closed = (pts) => curve(pts, { closed: true });

    // mother: crouched, seen from behind, turned a little toward the child (metres, y up)
    const M = (s) => place(s, MOTHER_X, FAMILY_Z, false, LANDING_Y);
    const mBody = M(closed([
      [-0.3, 0], [-0.36, 0.1], [-0.33, 0.22], [-0.26, 0.34], [-0.25, 0.46], [-0.27, 0.58], [-0.24, 0.67], [-0.14, 0.72],
      [-0.05, 0.75], [0.06, 0.75], [0.16, 0.71], [0.26, 0.63], [0.28, 0.5], [0.31, 0.34], [0.35, 0.2], [0.37, 0.09], [0.31, 0],
    ]));
    const mNeck = M(rect(-0.04, 0.7, 0.08, 0.1));
    const mHead = M(ellipse(0.01, 0.86, 0.093, 0.108));
    const mBun = M(ellipse(0.02, 0.972, 0.062, 0.05));
    const otaiko = M(rect(-0.14, 0.23, 0.28, 0.2, 0.025));
    const obi = M(rect(-0.4, 0.3, 0.8, 0.12));
    // her right arm across to the child's back, the wide sleeve hanging beneath it
    const mArm = M(thick(curve([[0.18, 0.66], [0.38, 0.56], [0.57, 0.47]]), (u) => 0.06 * (1 - u * 0.3)));
    const mSleeve = M(closed([[0.2, 0.63], [0.42, 0.52], [0.45, 0.4], [0.42, 0.3], [0.33, 0.29], [0.26, 0.4]]));

    // child: crouched at the edge, reaching toward the lantern
    const C = (s) => place(s, CHILD_X, FAMILY_Z, false, LANDING_Y);
    const cBody = C(closed([
      [-0.2, 0], [-0.24, 0.08], [-0.22, 0.18], [-0.17, 0.27], [-0.16, 0.36], [-0.14, 0.43], [-0.08, 0.47], [-0.02, 0.48],
      [0.05, 0.48], [0.11, 0.45], [0.15, 0.4], [0.17, 0.32], [0.2, 0.2], [0.24, 0.09], [0.21, 0],
    ]));
    const cHead = C(closed([[-0.07, 0.5], [-0.1, 0.56], [-0.085, 0.63], [-0.02, 0.67], [0.06, 0.665], [0.11, 0.62], [0.12, 0.55], [0.09, 0.5], [0.02, 0.485]]));
    const cArm = C(thick(curve([[0.11, 0.43], [0.27, 0.37], [0.4, 0.29]]), (u) => 0.045 * (1 - u * 0.3)));
    const cSleeve = C(closed([[0.12, 0.4], [0.29, 0.33], [0.31, 0.22], [0.25, 0.16], [0.17, 0.2], [0.14, 0.3]]));
    const bowL = C(ellipse(-0.1, 0.27, 0.1, 0.066, 0.3));
    const bowR = C(ellipse(0.11, 0.27, 0.1, 0.066, -0.3));
    const knot = C(circle(0.005, 0.27, 0.035));
    const tails = [C(thick(curve([[-0.02, 0.25], [-0.05, 0.16], [-0.07, 0.07]]), 0.045)), C(thick(curve([[0.03, 0.25], [0.05, 0.15], [0.065, 0.06]]), 0.04))];
    const bow = [bowL, bowR, knot, ...tails];

    const mInk = '#121322', cInk = '#191b30';
    p.fill([mBody, mNeck, mHead, mBun], mInk);
    p.clip(mBody, () => p.fill(obi, '#1c1a2c'));
    p.fill(otaiko, '#221e34');
    p.fill([cBody, cHead, cSleeve, cArm], cInk);
    // a faint pattern on the child's yukata: small pale flowers, barely there
    p.scope('pattern', () => p.clip(cBody, () => {
      const b = cBody.bounds();
      for (const [x, y] of t.poisson(b, 9, { rng: p.rng })) p.dot(x, y, 1.6, '#c9b8d8', { alpha: 0.18 });
    }));
    const bb = bowR.bounds();
    p.fill(bow, radial(bb.x1, bb.cy, bb.w * 2.6, ['#c86a7c', '#8a3c56', '#3e1e30']));
    p.fill([mSleeve, mArm], mInk);

    // the lantern's warmth on the side of them facing it; a cool edge from the sky
    p.illuminate(lx, ly, 300, '#ff9a40', { strength: 0.22, blend: 'lighter', falloff: [[0, 1], [0.4, 0.3], [1, 0]] });
    p.rim([mBody, mHead, mBun, mSleeve, mArm], [lx, ly], { color: '#ffb866', width: 2, min: 0.4, alpha: 0.75 });
    p.rim([cBody, cHead, cArm, cSleeve, ...bow], [lx, ly], { color: '#ffc47a', width: 2.2, min: 0.3 });
    p.rim([mHead, mBun, cHead], -1.9, { color: '#8a90c8', width: 1.3, min: 0.6, alpha: 0.45 });
    p.mark('mother', ...cam.at(MOTHER_X, FAMILY_Z, 1));
    p.mark('child', ...cam.at(CHILD_X, FAMILY_Z, 0.6));
    p.mark('mine', lx, ly);
  });

  t.layer('finish', () => {
    t.p.vignette(0.45, { cx: 880, cy: 520, inner: 0.35 });
    t.p.grain(0.022);
  });
}
