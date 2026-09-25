// Seeded randomness and noise.
//
// Every layer gets its own RNG derived from (seed, layer name), so editing one
// layer never reshuffles the randomness of another.

import { createNoise2D, createNoise3D } from 'simplex-noise';

export function hashString(str) {
  // cyrb53-ish 32-bit hash
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * makeRng(seed) -> rng
 *   rng()               uniform [0,1)
 *   rng.range(a, b)     uniform [a,b)
 *   rng.int(a, b)       integer in [a,b]
 *   rng.gauss(mu, sd)   normal
 *   rng.pick(arr)       random element
 *   rng.chance(p)       boolean
 *   rng.shuffle(arr)    shuffled copy
 *   rng.fork(name)      independent child rng
 *   rng.noise2(x, y) / rng.noise3(x, y, z)   simplex noise in [-1,1]
 *   rng.fbm(x, y, {octaves, lacunarity, gain})  fractal noise in ~[-1,1]
 */
export function makeRng(seed) {
  const s = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  const base = sfc32(0x9e3779b9, 0x243f6a88 ^ s, 0xb7e15162, s);
  for (let i = 0; i < 15; i++) base();
  const rng = () => base();
  rng.seed = s;
  rng.range = (a = 0, b = 1) => a + (b - a) * base();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * base());
  rng.gauss = (mu = 0, sd = 1) => {
    let u = 0, v = 0;
    while (u === 0) u = base();
    while (v === 0) v = base();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  rng.pick = (arr) => arr[Math.floor(base() * arr.length)];
  rng.chance = (p = 0.5) => base() < p;
  rng.sign = () => (base() < 0.5 ? -1 : 1);
  rng.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(base() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  rng.fork = (name) => makeRng(hashString(`${s}:${name}`));
  // noise is created lazily (it allocates permutation tables)
  let n2, n3;
  const noiseRng = sfc32(s, 0x1234567, 0x89abcdef, s ^ 0x55555555);
  rng.noise2 = (x, y) => (n2 ??= createNoise2D(noiseRng))(x, y);
  rng.noise3 = (x, y, z) => (n3 ??= createNoise3D(noiseRng))(x, y, z);
  rng.fbm = (x, y, { octaves = 4, lacunarity = 2, gain = 0.5 } = {}) => {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * rng.noise2(x * freq + i * 17.3, y * freq - i * 9.1);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
  return rng;
}
