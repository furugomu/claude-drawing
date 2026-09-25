# claude-drawing

Claude が自分で使うための headless お絵描きツール。
シーンを JS で書き → PNG にレンダリング → 自分の目（画像読み込み）で見て → 直す、のループで絵を描く。

![雪の夜の屋台](gallery/004-yatai.png)

## 使い方

```sh
node bin/draw.js new my-piece                  # works/my-piece.js を作る
node bin/draw.js render works/my-piece.js      # → out/my-piece.png
node bin/draw.js render works/my-piece.js --debug        # + 座標グリッド・mark・guide 入り
node bin/draw.js render works/my-piece.js --only sky,sea # レイヤーを絞って速く確認
node bin/draw.js look out/my-piece.png                   # 明度・ノタン(5階調)・サムネイルのシート
node bin/draw.js look out/my-piece.png --crop 700,1100,400,360   # 拡大（元画像座標のグリッド付き）
node bin/draw.js compare a.png b.png           # 並べて比較
node bin/draw.js seeds works/my-piece.js --count 9       # シード違いを一覧
```

生成物は `out/`（git 管理外）。完成品は `gallery/` にコピーする。

## シーンの書き方

```js
export const meta = { title: '...', width: 1600, height: 1000, seed: 1, background: '#f4efe4' };

export default function (t) {
  const { W, H, curve, circle, rect, linear } = t;   // ヘルパーは全部 t に入っている
  const sky = t.layer('sky', (p) => {                 // p = Painter。レイヤーごとに独立した p.rng
    p.fillPainted(rect(0, 0, W, 600), linear(0, 0, 0, 600, ['#141833', '#f6c48f']));
  });
  t.layer('sea', { blend: 'multiply', alpha: 0.9 }, (p) => {
    p.reflect([sky], { axis: 600 });                  // レイヤーは Painter を返すので再利用できる
  });
}
```

- 座標は常に「デザインピクセル」（meta.width × meta.height）。
- 乱数はレイヤー名から派生するので、あるレイヤーを編集しても他のレイヤーの乱数は変わらない。
- 配置は定数に名前を付けて（`HORIZON`, `DECK`, `LANTERN` …）そこから全部を導くと崩れにくい。

## API 早見表

### 形（`Shape` = 点列 + closed フラグ）
| 作る | |
|---|---|
| `curve(pts, {closed})` | 点を**通る**滑らかな曲線（centripetal Catmull-Rom）。有機的な線の基本 |
| `circle / ellipse / rect(x,y,w,h,r) / regular / star / arc / line / shape(pts) / polyline` | 基本図形 |
| `blob(cx,cy,r,{rng,n,vary})` | ランダムな有機形 |
| `blobUnion([[x,y,r],...], {blend})` | 円の滑らかな合体（メタボール）。雲・岩・動物の胴体 |
| `contour(fn, {bounds, level})` | スカラー場の等高線 → 形の配列 |
| `thick(curve, width \| fn(u))` | 曲線を太さのある帯に（尻尾・枝・川） |
| `trace(angleFn, x, y, {length})` | 流れ場に沿った線 |
| `poisson(region, r, {rng})` | 均等にばらけた点 |

| 変形・問い合わせ | |
|---|---|
| `.translate .rotate .scale .reverse .close .open` | rotate/scale の既定の中心は重心 |
| `.resample(step) .smooth(n)` | 等間隔化・角を丸める |
| `.wobble(amt, {rng, freq})` | 手描きの揺らぎ |
| `.deform(rounds, amt, {rng})` | 水彩的なギザギザ |
| `.offset(d)` | 法線方向に押し出し（閉図形は外向き正） |
| `.facing(angle, {min, exclude})` | **その方向を向いている輪郭部分**（リムライト・雪・ハイライト） |
| `.where(pred)` | 条件を満たす輪郭部分 |
| `.sub(t0,t1) .at(t) .frame(t) .bounds() .contains(x,y) .length .area()` | |

### 描く（Painter `p`）
| | |
|---|---|
| `fill(shapes, paint, {alpha, blend, rule, shadow})` | paint は色文字列か `linear/radial/conic(...)`（OKLab で補間） |
| `stroke(shapes, paint, width)` | 均一線 |
| `ink(shape, {width, taper, pressure, wobble})` | 入り抜きのある線。線画の主力 |
| `brush(shape, {width, color, dry, streaks})` | ガッシュ風の筆。`dry` でかすれ |
| `pencil(shape, {width, grain})` | 紙の凹凸に沿う鉛筆 |
| `wash(shape, {color, spread, edge, bloom, granulation, soft})` | 水彩のにじみ |
| `strokes(shape, {angle \| fn, colors, width, length, tool})` | **領域を筆致で埋める**。colors にグラデーションを渡すとその場の色を拾う |
| `fillPainted(shape, paint, opts)` | 塗り＋同じ色の筆致（ベタ塗りを絵にする一発技） |
| `hatch(shape, {angle, spacing, cross})` | ハッチング |
| `glow(shapes, color, radius)` | 発光 |
| `raster(fn(x,y)→[r,g,b,a], {bounds, res})` | 手続き的な場（天の川・湯気・霧） |
| `reflect(layers, {axis, ripple, fade})` | 水面反射 |
| `snowcap(shape, depth)` | 上向きの縁に積もる雪 |
| `branch(x, y, angle, len, width, {depth})` | 再帰的な枝。先端の点を返す |
| `vignette(strength, {cx, cy})` / `grain(amt)` / `paper()` | 仕上げ |
| `group(opts, fn)` / `clip(shape, fn)` / `at(x, y, {rotate, scale}, fn)` / `with(opts, fn)` | 合成・マスク・ローカル座標 |
| `text(str, x, y, {size, font, align})` | `font: 'IPAGothic'` で日本語 |
| `mark(name, x, y)` / `guide(shape, label)` | `--debug` 時だけ見える目印 |

### 色
`mix(a, b, t)`（OKLab）, `lighten / darken / saturate / shiftHue / alpha / adjust`, `jitter(c, rng)`, `ramp(stops, t)`, `oklch(l, c, h)`, `rgba(c)` / `mixRgba`（raster 用）

## 描き方のコツ（使いながら分かったこと）

1. **まず `--debug` と `look --crop`**。座標で描くので、拡大して座標を読むのが一番効く。
2. **ノタン（5階調）で明暗を確認**。色相だけで目立っているものはノタンで消える。光源は明度で一番明るく。
3. **輪郭は「意味」で選ぶ**。`sub(0.52, 0.8)` のような数値は形が変わると壊れる。`facing(光の方向)` なら壊れない。
4. **ベタ塗りは `fillPainted`/`strokes` で絵にする**。グラデーションから色を拾う筆致で画面全体の質感が揃う。
5. **柔らかいもの（光・霧・星雲）は `raster`**。筆致や図形の重ね塗りでは塊っぽくなる。
6. **キャラクターは部品を分けて重ねる**。頭と胴を一つのメタボールにすると首が溶ける。部品ごとに作り、`facing({exclude})` でリムライト。
