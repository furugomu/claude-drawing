// Tools for *looking* at a picture the way a painter steps back from the easel:
// value structure (grayscale / notan), small-size readability, zoomed crops
// with coordinates, and side-by-side comparisons.

import { createCanvas, loadImage as load } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';

const loadImage = (file) => {
  if (!existsSync(file)) throw new Error(`no such image: ${file}`);
  return load(file);
};

function niceStep(span, target = 8) {
  const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

function drawLabel(ctx, s, x, y, { color = '#ff0078', size = 12 } = {}) {
  ctx.font = `${size}px "DejaVu Sans Mono"`;
  const w = ctx.measureText(s).width;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x - 2, y - size, w + 4, size + 4);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function toGray(src, levels = 0) {
  const c = createCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // approximate perceptual lightness
    let v = Math.cbrt((0.2126 * (d[i] / 255) ** 2.2 + 0.7152 * (d[i + 1] / 255) ** 2.2 + 0.0722 * (d[i + 2] / 255) ** 2.2));
    if (levels) v = Math.round(v * (levels - 1)) / (levels - 1);
    d[i] = d[i + 1] = d[i + 2] = v * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Overview sheet: the picture, its grayscale values, a 5-value notan, and a
 * thumbnail (does it still read when tiny?).
 */
export async function lookSheet(file) {
  const img = await loadImage(file);
  const mainW = Math.min(1100, img.width), mainH = Math.round((img.height * mainW) / img.width);
  const sideW = 360, sideH = Math.round((img.height * sideW) / img.width);
  const thumbW = 110, thumbH = Math.round((img.height * thumbW) / img.width);
  const pad = 14, labelH = 18;
  const H = Math.max(mainH, sideH * 2 + thumbH + labelH * 3 + pad * 2) + pad * 2;
  const c = createCanvas(mainW + sideW + pad * 3, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, pad, pad, mainW, mainH);
  const small = createCanvas(sideW, sideH);
  small.getContext('2d').drawImage(img, 0, 0, sideW, sideH);
  const x2 = mainW + pad * 2;
  let y = pad + labelH;
  const cap = (s) => { ctx.font = '12px "DejaVu Sans Mono"'; ctx.fillStyle = '#ccc'; ctx.fillText(s, x2, y - 5); };
  cap('values');
  ctx.drawImage(toGray(small), x2, y); y += sideH + pad + labelH;
  cap('notan (5 levels)');
  ctx.drawImage(toGray(small, 5), x2, y); y += sideH + pad + labelH;
  cap('thumbnail');
  ctx.drawImage(img, x2, y, thumbW, thumbH);
  return c;
}

/** Zoomed crop with a coordinate grid in the ORIGINAL image's pixel space. */
export async function lookCrop(file, [cx, cy, cw, ch], { width = 1000, grid } = {}) {
  const img = await loadImage(file);
  const z = width / cw, h = Math.round(ch * z);
  const c = createCanvas(width, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cx, cy, cw, ch, 0, 0, width, h);
  const step = grid ?? niceStep(Math.max(cw, ch));
  ctx.lineWidth = 1;
  for (let gx = Math.ceil(cx / step) * step; gx <= cx + cw; gx += step) {
    const X = (gx - cx) * z;
    ctx.strokeStyle = 'rgba(255,0,120,0.35)';
    ctx.beginPath(); ctx.moveTo(X, 0); ctx.lineTo(X, h); ctx.stroke();
    drawLabel(ctx, String(gx), X + 3, 14);
  }
  for (let gy = Math.ceil(cy / step) * step; gy <= cy + ch; gy += step) {
    const Y = (gy - cy) * z;
    ctx.strokeStyle = 'rgba(255,0,120,0.35)';
    ctx.beginPath(); ctx.moveTo(0, Y); ctx.lineTo(width, Y); ctx.stroke();
    drawLabel(ctx, String(gy), 3, Y - 3);
  }
  return c;
}

/** Side-by-side comparison of several images (e.g. before/after), labeled. */
export async function lookCompare(files, { width = 700 } = {}) {
  const imgs = await Promise.all(files.map((f) => loadImage(f)));
  const hs = imgs.map((im) => Math.round((im.height * width) / im.width));
  const pad = 10, labelH = 20;
  const c = createCanvas(imgs.length * (width + pad) + pad, Math.max(...hs) + pad * 2 + labelH);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(0, 0, c.width, c.height);
  imgs.forEach((im, i) => {
    const x = pad + i * (width + pad);
    ctx.font = '13px "DejaVu Sans Mono"';
    ctx.fillStyle = '#ddd';
    ctx.fillText(files[i].split('/').slice(-2).join('/'), x, pad + 13);
    ctx.drawImage(im, x, pad + labelH, width, hs[i]);
  });
  return c;
}

/** Grid of canvases with captions (used for seed exploration). */
export function contactSheet(items, { cols = 3, cellW = 480 } = {}) {
  const first = items[0].canvas;
  const cellH = Math.round((first.height * cellW) / first.width);
  const pad = 8, labelH = 18;
  const rows = Math.ceil(items.length / cols);
  const c = createCanvas(cols * (cellW + pad) + pad, rows * (cellH + labelH + pad) + pad);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(0, 0, c.width, c.height);
  items.forEach(({ canvas, label }, i) => {
    const x = pad + (i % cols) * (cellW + pad), y = pad + Math.floor(i / cols) * (cellH + labelH + pad);
    ctx.font = '13px "DejaVu Sans Mono"';
    ctx.fillStyle = '#ddd';
    ctx.fillText(label, x, y + 13);
    ctx.drawImage(canvas, x, y + labelH, cellW, cellH);
  });
  return c;
}
