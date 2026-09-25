// Tool check: one swatch per tool.
export const meta = { title: 'swatches', width: 1600, height: 1000, seed: 3, background: '#f4efe4' };

export default function (t) {
  const { curve, circle, rect, blob, linear, radial } = t;
  const wave = (x, y, w = 300, amp = 30) => curve([[x, y], [x + w * 0.3, y - amp], [x + w * 0.6, y + amp], [x + w, y - amp * 0.3]]);

  t.layer('labels', (p) => {
    const L = [['fill+gradient', 60, 60], ['ink', 460, 60], ['brush', 860, 60], ['brush dry', 1240, 60],
      ['pencil', 60, 400], ['wash', 460, 400], ['hatch', 860, 400], ['glow', 1240, 400],
      ['blob + wobble', 60, 740], ['brush colors', 460, 740], ['wash overlap', 860, 740], ['text', 1240, 740]];
    for (const [s, x, y] of L) p.text(s, x, y, { size: 20, color: '#555' });
  });

  t.layer('swatches', (p) => {
    // fill + gradient
    p.fill(rect(60, 90, 320, 220, 20), linear(60, 90, 380, 310, ['#1d3557', '#e76f51', '#f4a261']));
    // ink
    for (let i = 0; i < 5; i++) p.ink(wave(460, 130 + i * 40), { width: 2 + i * 2 });
    // brush
    for (let i = 0; i < 3; i++) p.brush(wave(860, 140 + i * 70), { width: 30, color: ['#264653', '#2a9d8f', '#e9c46a'][i], dry: 0.1 });
    // brush dry
    for (let i = 0; i < 3; i++) p.brush(wave(1240, 140 + i * 70), { width: 36, color: '#6d2e46', dry: 0.3 + i * 0.3 });
    // pencil
    for (let i = 0; i < 5; i++) p.pencil(wave(60, 460 + i * 45), { width: 1.5 + i });
    // wash
    p.wash(circle(610, 560, 110), { color: '#3a6ea5' });
    // hatch
    p.hatch(circle(1010, 560, 110), { spacing: 8 });
    p.hatch(circle(1010, 560, 70), { spacing: 6, cross: true });
    // glow
    p.fill(rect(1240, 440, 320, 240), '#141726');
    p.glow(circle(1400, 560, 40), '#ffd27a', 30);
    p.fill(circle(1400, 560, 30), '#fff4d6');
    // blob + wobble
    const b = blob(210, 880, 90, { rng: p.rng, n: 8, vary: 0.3 });
    p.fill(b, '#8ab17d');
    p.ink(b.wobble(3, { rng: p.rng }).open(), { width: 3, taper: 0 });
    // brush colors
    ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557'].forEach((c, i) => p.brush(wave(460, 790 + i * 35, 320, 15), { width: 26, color: c }));
    // wash overlap
    p.wash(circle(980, 870, 80), { color: '#e76f51', blend: 'multiply' });
    p.wash(circle(1080, 870, 80), { color: '#2a9d8f', blend: 'multiply' });
    // text
    p.text('こんにちは、絵筆', 1240, 800, { size: 36, font: 'IPAGothic', color: '#333' });
    p.text('draw v0.1', 1240, 860, { size: 28, color: '#888' });
  });
}
