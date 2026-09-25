export const meta = { title: 'field test', width: 1600, height: 700, seed: 2, background: '#f4efe4' };
export default function (t) {
  const { blobUnion, contour, rect, circle } = t;
  t.layer('a', (p) => {
    // cloud from metaballs
    const cloud = blobUnion([[200, 200, 60], [280, 170, 80], [380, 190, 70], [450, 220, 50], [300, 240, 60], [150, 240, 40]]);
    p.fill(cloud, '#9bb7d4');
    p.ink(cloud.open(), { width: 2, taper: 0 });
    // noise contour
    const loops = contour((x, y) => p.rng.fbm(x * 0.008, y * 0.008), { bounds: { x: 600, y: 50, w: 400, h: 350 }, level: 0.1, cell: 4 });
    loops.forEach((s, i) => p.fill(s, ['#e9c46a', '#f4a261', '#e76f51'][i % 3], { alpha: 0.8 }));
    // strokes following a swirl field
    const area = circle(1300, 230, 190);
    p.strokes(area, { angle: (x, y) => Math.atan2(y - 230, x - 1300) + Math.PI / 2, colors: ['#264653', '#2a9d8f', '#8ab17d'], width: [6, 14], length: [40, 90], dry: 0.3 });
    // strokes: rock-ish facets
    const rock = blobUnion([[250, 520, 90], [380, 540, 110], [520, 560, 70]]);
    p.strokes(rock, { angle: (x, y) => -0.9 + p.rng.noise2(x * 0.01, y * 0.01) * 0.5, colors: (x) => (x < 330 ? '#8a8fa8' : '#3d4260'), width: [8, 16], length: [20, 40], dry: 0.2 });
    // pencil hatching via strokes
    p.strokes(circle(1000, 530, 130), { tool: 'pencil', angle: -0.6, width: 1.5, length: [60, 120], spacing: 7, colors: ['#333'], jitter: 0.05 });
  });
}
