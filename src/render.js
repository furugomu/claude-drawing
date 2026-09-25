// Scene loading + rendering.
//
// A scene is an ES module:
//   export const meta = { title, width, height, seed, background }
//   export default function (t) { t.layer('sky', p => { ... }) }

import { createCanvas } from '@napi-rs/canvas';
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { Painter } from './painter.js';
import { makeRng } from './random.js';
import { toolkit } from './toolkit.js';

export async function loadScene(scenePath) {
  const url = pathToFileURL(path.resolve(scenePath)).href + `?v=${Date.now()}`;
  const mod = await import(url);
  if (typeof mod.default !== 'function') throw new Error(`${scenePath}: default export must be a function(t)`);
  return mod;
}

/**
 * Render a scene module to a canvas.
 * opts: {seed, scale, only: [layer names], skip: [layer names], debug}
 */
export async function renderScene(mod, opts = {}) {
  const meta = { width: 1600, height: 1000, seed: 1, background: '#faf7f0', ...mod.meta };
  const seed = opts.seed ?? meta.seed;
  const scale = opts.scale ?? 1;
  const W = meta.width, H = meta.height;
  const canvas = createCanvas(Math.round(W * scale), Math.round(H * scale));
  const env = { W, H, scale, seed, marks: [], guides: [], layers: [], meta };
  const rootRng = makeRng(seed);
  const root = new Painter(canvas, env, rootRng.fork('root'));
  root.ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (meta.background) root.background(meta.background);

  const t = toolkit(root, env, rootRng, opts);
  const t0 = performance.now();
  await mod.default(t);
  env.totalMs = performance.now() - t0;
  return { canvas, env, meta };
}

/** Grid + marks + guides + layer list drawn over a copy of the render. */
export function debugOverlay(canvas, env, { grid = 100 } = {}) {
  const { W, H, scale: k } = env;
  const out = createCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const fs = 11 / Math.max(k, 0.5);
  ctx.font = `${fs}px "DejaVu Sans Mono"`;
  // grid
  for (let x = 0; x <= W; x += grid) {
    ctx.strokeStyle = x % (grid * 5) === 0 ? 'rgba(255,0,120,0.55)' : 'rgba(255,0,120,0.25)';
    ctx.lineWidth = 1 / k;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += grid) {
    ctx.strokeStyle = y % (grid * 5) === 0 ? 'rgba(255,0,120,0.55)' : 'rgba(255,0,120,0.25)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  const label = (s, x, y, color = '#ff0078') => {
    const w = ctx.measureText(s).width;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x - 1, y - fs, w + 2, fs + 3);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  };
  for (let x = 0; x < W; x += grid) label(String(x), x + 2, fs + 1);
  for (let y = grid; y < H; y += grid) label(String(y), 2, y - 2);
  // guides
  ctx.setLineDash([6 / k, 4 / k]);
  for (const g of env.guides) {
    ctx.strokeStyle = 'rgba(0,160,255,0.9)';
    ctx.lineWidth = 1.2 / k;
    ctx.beginPath();
    g.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (g.closed) ctx.closePath();
    ctx.stroke();
    if (g.label) label(g.label, g.pts[0][0] + 4, g.pts[0][1] - 4, '#0070c0');
  }
  ctx.setLineDash([]);
  // marks
  for (const m of env.marks) {
    ctx.strokeStyle = '#00a060';
    ctx.lineWidth = 1.5 / k;
    ctx.beginPath();
    ctx.moveTo(m.x - 6, m.y); ctx.lineTo(m.x + 6, m.y);
    ctx.moveTo(m.x, m.y - 6); ctx.lineTo(m.x, m.y + 6);
    ctx.stroke();
    label(`${m.name} (${Math.round(m.x)},${Math.round(m.y)})`, m.x + 5, m.y - 5, '#007040');
  }
  return out;
}

export async function savePng(canvas, file) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, canvas.toBuffer('image/png'));
  return file;
}
