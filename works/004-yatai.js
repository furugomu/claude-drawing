// 004 — 小さな灯り #3: an oden stall on a snowy night
export const meta = { title: '雪の夜の屋台', width: 1200, height: 1500, seed: 5, background: '#141a2c' };

const UP = -Math.PI / 2;

export default function (t) {
  const { W, H, curve, circle, ellipse, rect, shape, line, linear, radial, alpha, mix, jitter, thick, blobUnion, times } = t;

  // ---- layout ------------------------------------------------------------------
  const GROUND = 1170;           // where the snowy ground meets the stall
  const STALL = { x0: 170, x1: 870, roofY: 560, counterY: 930 };
  const LANTERN = { x: 985, y: 760, rx: 62, ry: 92 };
  const CAT = { x: 930, y: 1420 };

  const snowcap = (p, s, depth, opts) => p.snowcap(s, depth, opts);

  // ---- background ----------------------------------------------------------------
  t.layer('night', (p) => {
    p.fill(rect(0, 0, W, GROUND), linear(0, 0, 0, GROUND, ['#0c1122', '#1b2440', '#2a3350']));
    // distant street lamp, heavily out of focus
    p.fill(rect(0, 0, W, H), radial(260, 330, 420, [alpha('#ffcf8a', 0.35), alpha('#ffcf8a', 0)]), { blend: 'screen' });
    p.glow(circle(260, 330, 26), '#ffe2b0', 30);
  });

  t.layer('fence', (p) => {
    // wooden board fence behind the stall, with snow along its top
    const top = 700;
    const fence = rect(-10, top, W + 20, GROUND - top);
    p.fillPainted(fence, linear(0, top, 0, GROUND, ['#2b2a38', '#1d1d2b']), { angle: UP, width: [5, 10], length: [40, 90], alpha: 0.6 });
    for (let x = 0; x < W; x += 46) p.ink(line(x, top + 4, x, GROUND), { width: 2, color: '#14141f', taper: 0, alpha: 0.8 });
    p.fill(rect(-10, top - 14, W + 20, 16), '#2e2c3b');
    snowcap(p, rect(-10, top - 14, W + 20, 16), 22);
    // a bare branch leaning over the fence, forking into twigs
    p.scope('branch1', () => p.branch(-30, 360, 0.42, 300, 16, { depth: 4, color: '#0d1020', lift: 0 }));
  });

  // ---- the stall ---------------------------------------------------------------
  const { x0, x1, roofY, counterY } = STALL;
  const ROOF = shape([[x0 - 70, roofY + 60], [x0 - 20, roofY - 20], [x1 + 20, roofY - 20], [x1 + 70, roofY + 60]]);

  t.layer('stall', (p) => {
    const wood = ['#6b4531', '#5a3a2a', '#7a5238', '#4a2f22'];
    // back wall inside the stall, lit warm
    p.fill(rect(x0, roofY + 50, x1 - x0, counterY - roofY - 50), linear(0, roofY + 50, 0, counterY, ['#6a4128', '#c07a3e', '#f0b565']));
    // posts
    for (const x of [x0 + 10, x1 - 10]) p.fillPainted(rect(x - 12, roofY, 24, GROUND - roofY), '#4a2f22', { angle: UP, width: [3, 6], length: [30, 60] });
    // roof
    p.fillPainted(ROOF, linear(0, roofY - 20, 0, roofY + 60, ['#3a2a2a', '#241a1c']), { angle: 0, width: [4, 8], length: [30, 70] });
    p.ink(line(x0 - 70, roofY + 60, x1 + 70, roofY + 60), { width: 4, color: '#140e10', taper: 0 });
    // counter
    const counter = rect(x0 - 20, counterY, x1 - x0 + 40, 26);
    p.fillPainted(counter, linear(0, counterY, 0, counterY + 26, ['#b98552', '#7a5238']), { angle: 0, width: [3, 5], length: [40, 90] });
    // front panel of the cart: horizontal planks
    const front = rect(x0 - 10, counterY + 26, x1 - x0 + 20, GROUND - counterY - 26);
    p.strokes(front, { angle: 0, colors: wood, width: [6, 10], length: [80, 200], dry: 0.2, jitter: 0.02 });
    p.fill(front, linear(0, counterY + 26, 0, GROUND, [alpha('#000', 0), alpha('#0b0d1c', 0.55)]));
    for (let y = counterY + 60; y < GROUND; y += 36) p.ink(line(x0 - 10, y, x1 + 10, y), { width: 2, color: '#2a1a14', taper: 0, alpha: 0.7 });
    p.mark('counter', x0, counterY);
  });

  t.layer('pot', (p) => {
    // the oden pot, glimpsed under the noren: items bob in the broth
    const px = 520, py = counterY, surf = py - 46;
    p.fill(rect(px - 150, surf - 4, 300, 20), '#8a5a2a');
    const items = [
      (cx) => p.fill(ellipse(cx, surf - 6, 13, 16), linear(0, surf - 22, 0, surf + 8, ['#fff8ea', '#f0dcb0'])),           // egg
      (cx) => p.fill(rect(cx - 15, surf - 16, 30, 26, 8), linear(0, surf - 16, 0, surf + 8, ['#f6d9a0', '#c98f4a'])),     // daikon
      (cx) => p.fill(shape([[cx - 16, surf + 6], [cx, surf - 20], [cx + 16, surf + 6]]), '#6e6a6e'),                    // konnyaku
      (cx) => { p.fill(rect(cx - 18, surf - 14, 36, 18, 9), '#b7743a'); p.fill(ellipse(cx + 14, surf - 5, 4, 7), '#5a3418'); }, // chikuwa
    ];
    for (let i = 0; i < 8; i++) {
      const cx = px - 118 + i * 34 + p.rng.range(-3, 3);
      p.rng.pick(items)(cx);
      if (p.rng.chance(0.4)) p.stroke(line(cx + 4, surf - 10, cx + 12, surf - 60), '#d8b98a', 2.5); // skewer
    }
    // front of the pot hides the lower halves
    p.fill(rect(px - 156, surf + 2, 312, py - surf - 2, 5), linear(px - 156, 0, px + 156, 0, ['#c8ccd4', '#8a8f99', '#6b7079']));
    p.fill(rect(px - 160, surf - 2, 320, 8, 3), '#d8dce4');
  });

  t.layer('noren', (p) => {
    // three indigo panels hanging from the roof, lit from behind at their edges
    const n = 3, top = roofY + 60, len = 170, gap = 8;
    const pw = (x1 - x0 - gap * (n - 1)) / n;
    const chars = ['お', 'で', 'ん'];
    for (let i = 0; i < n; i++) {
      const px = x0 + i * (pw + gap);
      const sway = p.rng.range(-4, 4);
      const panel = shape([[px, top], [px + pw, top], [px + pw + sway, top + len], ...times(8, (k) => [px + pw - (k / 7) * pw + sway, top + len + 4 * Math.sin((k / 7) * Math.PI)]), [px + sway, top + len]]);
      p.fillPainted(panel, linear(0, top, 0, top + len, ['#26345a', '#1d2848', '#16203a']), { angle: Math.PI / 2, width: [4, 8], length: [40, 90], alpha: 0.6 });
      // folds
      for (let f = 1; f < 4; f++) p.ink(line(px + (f / 4) * pw, top + 6, px + (f / 4) * pw + sway, top + len - 6), { width: 3, color: '#101730', alpha: 0.5, taper: 0.3 });
      p.text(chars[i], px + pw / 2 + sway / 2, top + len * 0.62, { size: 92, font: 'IPAGothic', color: '#efe9dc', align: 'center', baseline: 'middle' });
    }
    // rod
    p.fill(rect(x0 - 8, top - 4, x1 - x0 + 16, 8, 3), '#2a1a14');
  });

  t.layer('steam', { blend: 'screen' }, (p) => {
    const cx = 520, y0 = counterY - 50;
    const off = p.rng.range(0, 99);
    p.raster((x, y) => {
      if (y > y0) return null;
      const h = (y0 - y) / 330;
      const sway = 40 * p.rng.noise2(y * 0.006 + off, 2) * h;
      const col = Math.exp(-(((x - cx - sway) / (130 + 90 * h)) ** 2));
      const wisp = Math.max(0, p.rng.fbm((x - sway) * 0.012 + off, y * 0.02 + h * 2, { octaves: 4 }));
      const a = Math.min(1, col * wisp * Math.max(0, 1 - h) * 1.4);
      return a > 0.01 ? [255, 238, 220, a] : null;
    }, { bounds: { x: cx - 300, y: y0 - 360, w: 600, h: 360 }, res: 3, blur: 2 });
  });

  t.layer('roof-snow', (p) => {
    snowcap(p, ROOF, 34, { min: 0.3 });
  });

  // ---- the lantern ---------------------------------------------------------------
  t.layer('lantern', (p) => {
    const { x, y, rx, ry } = LANTERN;
    p.stroke(line(x1 + 30, roofY + 40, x, y - ry - 18), '#1a1210', 3);
    const body = ellipse(x, y, rx, ry);
    p.glow(body, '#ff7a40', 70, { alpha: 0.9 });
    p.fill(body, radial(x - 8, y - 6, ry * 1.05, [[0, '#fff0c0'], [0.3, '#ffb070'], [0.65, '#f04a2e'], [1, '#8a1a12']]));
    // ribs
    for (let k = -4; k <= 4; k++) {
      const yy = y + (k / 5) * ry, w = rx * Math.sqrt(1 - (k / 5) ** 2);
      p.ink(t.arc(x, yy - 6, w, 0.15, Math.PI - 0.15), { width: 1.4, color: '#6e1a12', alpha: 0.5, taper: 0.2 });
    }
    ['お', 'で', 'ん'].forEach((ch, i) => p.text(ch, x, y - 34 + i * 34, { size: 32, font: 'IPAGothic', color: '#1a0c0a', align: 'center', baseline: 'middle' }));
    p.fill(rect(x - rx * 0.55, y - ry - 12, rx * 1.1, 16, 3), '#1a1210');
    p.fill(rect(x - rx * 0.55, y + ry - 4, rx * 1.1, 16, 3), '#1a1210');
    snowcap(p, rect(x - rx * 0.55, y - ry - 12, rx * 1.1, 16, 3), 12);
    p.mark('lantern', x, y);
  });

  // ---- ground --------------------------------------------------------------------
  t.layer('ground', (p) => {
    const ground = shape([[-10, GROUND - 10], ...times(20, (i) => [i * 65, GROUND - 6 + p.rng.range(-5, 5)]), [W + 10, GROUND], [W + 10, H + 10], [-10, H + 10]]);
    p.fillPainted(ground, linear(0, GROUND, 0, H, ['#7d88a8', '#9aa6c4', '#b7c2dc']), { angle: 0, width: [8, 16], length: [40, 100], alpha: 0.5 });
    // warm light spilling out of the stall, and the lantern's red glow
    p.fill(ground, radial(520, GROUND, 520, [alpha('#ffc27a', 0.65), alpha('#ffc27a', 0)]), { blend: 'screen' });
    p.fill(ground, radial(LANTERN.x, GROUND + 60, 360, [alpha('#ff6a4a', 0.35), alpha('#ff6a4a', 0)]), { blend: 'screen' });
    // footprints wandering to the stall
    for (let i = 0; i < 9; i++) {
      const fx = 120 + i * 50 + (i % 2) * 18, fy = H - 40 - i * 34;
      p.fill(ellipse(fx, fy, 11 - i * 0.5, 6 - i * 0.3), alpha('#56607e', 0.6));
    }
    // stools
    for (const sx of [330, 700]) {
      p.fill(rect(sx - 8, GROUND - 150, 16, 150), '#3e2a20');
      const seat = ellipse(sx, GROUND - 150, 52, 13);
      p.fill(seat, '#6a4531');
      snowcap(p, seat, 12, { min: 0.2 });
    }
  });

  // ---- the cat -------------------------------------------------------------------
  t.layer('cat', (p) => {
    const { x, y } = CAT; // y = where the cat sits on the snow
    // seen from behind: pear-shaped body, round head sitting on the shoulders
    const body = blobUnion([
      [x, y - 78, 84], [x - 34, y - 46, 52], [x + 36, y - 46, 52], // haunches
      [x + 4, y - 158, 60],                                        // shoulders
    ], { blend: 0.3 });
    const hx = x + 12, hy = y - 232;
    const head = ellipse(hx, hy, 54, 47);
    const E = (a) => [hx + 54 * Math.cos(a), hy + 47 * Math.sin(a)];
    const earL = curve([E(-2.65), [hx - 50, hy - 60], [hx - 42, hy - 86], [hx - 20, hy - 58], E(-1.85)]).close();
    const earR = curve([E(-1.3), [hx + 22, hy - 60], [hx + 40, hy - 84], [hx + 48, hy - 56], E(-0.5)]).close();
    const tail = thick(curve([[x - 40, y - 12], [x - 110, y - 4], [x - 165, y - 22], [x - 185, y - 58]]), (u) => 26 * (1 - u * 0.35));
    const parts = [body, head, earL, earR, tail];
    p.fill(parts, '#15131c');
    p.clip(parts, () => {
      p.strokes(body, { angle: (px) => Math.PI / 2 + 0.25 * Math.sin((px - x) * 0.03), colors: ['#1c1a26', '#231f2e', '#121019'], width: [4, 8], length: [14, 30], alpha: 0.7, dry: 0.3 });
      p.strokes(head, { angle: (px, py) => Math.atan2(py - hy, px - hx), colors: ['#1c1a26', '#231f2e', '#121019'], width: [3, 6], length: [8, 16], alpha: 0.7, dry: 0.3 });
    });
    // rim light: lantern (above right) and the stall's warm glow (upper left)
    const rim = (s, ang, min, color, width, ex = []) => {
      for (const e of s.facing(ang, { min, exclude: ex })) p.ink(e.offset(-width * 0.4), { width, color, alpha: 0.85, taper: 0.35 });
    };
    rim(body, -1.25, 0.35, '#ff8a5a', 5, [head]);
    rim(head, -1.25, 0.2, '#ff8a5a', 4.5, [earL, earR]);
    rim(earR, -0.9, 0.1, '#ff8a5a', 3);
    rim(earL, -1.6, 0.3, '#ff9a6a', 2.5);
    rim(body, -2.4, 0.55, '#ffc98a', 3, [head]);
    rim(head, -2.5, 0.5, '#ffc98a', 2.5, [earL]);
    rim(earL, -2.6, 0.3, '#ffc98a', 2.5);
    rim(tail, -1.3, 0.5, '#ff8a5a', 3);
    p.mark('cat-head', hx, hy);
  });

  // ---- falling snow (depth: far = small & sharp, near = big & soft) --------------
  t.layer('snow', (p) => {
    for (let i = 0; i < 900; i++) {
      const depth = Math.pow(p.rng(), 2.2); // most flakes far away
      const x = p.rng.range(0, W), y = p.rng.range(0, H);
      const r = 1 + depth * 9;
      const c = mix('#c9d3ea', '#ffffff', depth);
      if (depth > 0.55) p.dot(x, y, r, c, { blur: r * 0.8, alpha: 0.5 });
      else p.dot(x, y, r, c, { alpha: 0.55 + depth * 0.4 });
    }
  });

  t.layer('finish', () => {
    t.p.vignette(0.55, { cx: 600, cy: 820, inner: 0.35, color: '#0a0d1c' });
    t.p.grain(0.02);
  });
}
