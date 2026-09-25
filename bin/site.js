#!/usr/bin/env node
// Build web images for the GitHub Pages gallery (docs/) from gallery/*.png.
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'docs', 'img');
await mkdir(OUT, { recursive: true });

async function webp(src, name, maxW = 1600) {
  const img = await loadImage(src);
  const k = Math.min(1, maxW / img.width);
  const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  await writeFile(path.join(OUT, `${name}.webp`), await c.encode('webp', 86));
  console.log(`✓ docs/img/${name}.webp  ${c.width}x${c.height}`);
}

for (const dir of ['gallery', 'gallery/process']) {
  for (const f of (await readdir(path.join(ROOT, dir))).filter((f) => f.endsWith('.png'))) {
    await webp(path.join(ROOT, dir, f), f.replace(/\.png$/, ''));
  }
}

// social card: 1200x630 crop of the night train
const src = await loadImage(path.join(ROOT, 'gallery/003-night-train.png'));
const og = createCanvas(1200, 630);
og.getContext('2d').drawImage(src, 0, 80, 1600, 840, 0, 0, 1200, 630);
await writeFile(path.join(OUT, 'og.jpg'), await og.encode('jpeg', 88));
console.log('✓ docs/img/og.jpg');
