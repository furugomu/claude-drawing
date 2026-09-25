#!/usr/bin/env node
// draw — a headless painting tool for Claude.  Run `draw help` for usage.

import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadScene, renderScene, debugOverlay, savePng } from '../src/render.js';
import { lookSheet, lookCrop, lookCompare, contactSheet } from '../src/look.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'out');

const HELP = `draw — headless painting tool

  draw render <scene.js> [--seed N] [--scale S] [--debug] [--only a,b] [--skip a,b] [--out file]
      Render a scene to out/<name>.png  (--debug also writes out/<name>.debug.png
      with a coordinate grid, marks and guides).
  draw seeds <scene.js> [--from 1] [--count 9] [--scale 0.3] [--cols 3]
      Render several seeds side by side → out/<name>.seeds.png
  draw look <image.png> [--crop x,y,w,h] [--grid N] [--out file]
      Inspection sheet: values, notan, thumbnail. With --crop: zoomed detail
      with coordinates.  → out/look/...
  draw compare <a.png> <b.png> [...]       Side-by-side → out/look/compare.png
  draw new <name> [--size WxH]              Scaffold works/<name>.js
`;

const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined);
const nameOf = (f) => path.basename(f).replace(/\.(js|mjs|png)$/, '');

async function cmdRender(args) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { seed: { type: 'string' }, scale: { type: 'string' }, debug: { type: 'boolean' }, only: { type: 'string' }, skip: { type: 'string' }, out: { type: 'string' } },
  });
  const scene = positionals[0];
  if (!scene) throw new Error('usage: draw render <scene.js>');
  const mod = await loadScene(scene);
  const opts = {
    seed: values.seed != null ? Number(values.seed) : undefined,
    scale: values.scale ? Number(values.scale) : 1,
    only: list(values.only),
    skip: list(values.skip),
  };
  const { canvas, env } = await renderScene(mod, opts);
  const out = values.out ?? path.join(OUT, `${nameOf(scene)}${opts.seed != null ? `.s${opts.seed}` : ''}.png`);
  await savePng(canvas, out);
  const lines = [`✓ ${path.relative(process.cwd(), out)}  ${canvas.width}x${canvas.height}  seed=${env.seed}  ${env.totalMs.toFixed(0)}ms`];
  if (env.layers.length) lines.push('  layers: ' + env.layers.map((l) => `${l.name}(${l.ms.toFixed(0)}ms)`).join(' '));
  if (values.debug) {
    const dbg = out.replace(/\.png$/, '.debug.png');
    await savePng(debugOverlay(canvas, env), dbg);
    lines.push(`  debug: ${path.relative(process.cwd(), dbg)}  (${env.marks.length} marks, ${env.guides.length} guides)`);
  }
  console.log(lines.join('\n'));
}

async function cmdSeeds(args) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { from: { type: 'string', default: '1' }, count: { type: 'string', default: '9' }, scale: { type: 'string', default: '0.3' }, cols: { type: 'string', default: '3' } },
  });
  const scene = positionals[0];
  const from = Number(values.from), count = Number(values.count), scale = Number(values.scale);
  const items = [];
  for (let s = from; s < from + count; s++) {
    const mod = await loadScene(scene);
    const { canvas } = await renderScene(mod, { seed: s, scale });
    items.push({ canvas, label: `seed ${s}` });
    process.stdout.write('.');
  }
  const cols = Number(values.cols);
  const sheet = contactSheet(items, { cols, cellW: Math.min(600, Math.floor(1500 / cols)) });
  const out = await savePng(sheet, path.join(OUT, `${nameOf(scene)}.seeds.png`));
  console.log(`\n✓ ${path.relative(process.cwd(), out)}`);
}

async function cmdLook(args) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { crop: { type: 'string' }, grid: { type: 'string' }, out: { type: 'string' }, width: { type: 'string' } },
  });
  const file = positionals[0];
  let c, suffix;
  if (values.crop) {
    const box = values.crop.split(',').map(Number);
    c = await lookCrop(file, box, { grid: values.grid ? Number(values.grid) : undefined, width: values.width ? Number(values.width) : 1000 });
    suffix = `crop-${box.join('_')}`;
  } else {
    c = await lookSheet(file);
    suffix = 'sheet';
  }
  const out = values.out ?? path.join(OUT, 'look', `${nameOf(file)}.${suffix}.png`);
  await savePng(c, out);
  console.log(`✓ ${path.relative(process.cwd(), out)}`);
}

async function cmdCompare(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { out: { type: 'string' }, width: { type: 'string' } } });
  const c = await lookCompare(positionals, { width: values.width ? Number(values.width) : Math.floor(1500 / positionals.length) });
  const out = values.out ?? path.join(OUT, 'look', 'compare.png');
  await savePng(c, out);
  console.log(`✓ ${path.relative(process.cwd(), out)}`);
}

async function cmdNew(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { size: { type: 'string', default: '1600x1000' } } });
  const name = positionals[0];
  const [w, h] = values.size.split('x').map(Number);
  const file = path.join(ROOT, 'works', `${name}.js`);
  if (existsSync(file)) throw new Error(`${file} exists`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `// ${name}
export const meta = { title: '${name}', width: ${w}, height: ${h}, seed: 1, background: '#f4efe4' };

export default function (t) {
  const { W, H } = t;

  t.layer('main', (p) => {
    p.fill(t.circle(W / 2, H / 2, 200), '#c0392b');
  });
}
`);
  console.log(`✓ ${path.relative(process.cwd(), file)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const cmds = { render: cmdRender, seeds: cmdSeeds, look: cmdLook, compare: cmdCompare, new: cmdNew };
if (!cmd || cmd === 'help' || !cmds[cmd]) {
  console.log(HELP);
} else {
  cmds[cmd](rest).catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
