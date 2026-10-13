import { gauss, hash, sequence } from "./rng";

// 模式図用の小さな星空。実画像を使えない説明(前景、光害、周辺減光、スタック)はこれで描く。
// 値は「画素にたまった光の量」で、空の明るさ 1.0 前後、ノイズの標準偏差 NOISE を基準にしている。

export const SIM = { w: 256, h: 144 };
export const NOISE = 0.5;

export type SkyOptions = {
  /** 星空の回転角(ラジアン)。回転の中心は画面の右下の外。 */
  angle?: number;
  /** 星を描く(既定 true)。 */
  stars?: boolean;
  /** 1 枚あたりのノイズの大きさ(NOISE に対する倍率、既定 1)。 */
  noise?: number;
  /** ノイズの出方を決める番号。フレームごとに変えると撮るたびにばらつく。 */
  shot?: number;
  /** 平均した枚数。ノイズが 1/√n になる(既定 1)。 */
  stack?: number;
  /** 光害の強さ(既定 1)。下ほど明るい。 */
  pollution?: number;
  /** 周辺減光の強さ(既定 1)。四隅が中心の約 1/4 になる。 */
  vignette?: number;
  /** ホットピクセルを出す(既定 true)。 */
  hot?: boolean;
  /** 架空の家と木のシルエットを出す(既定 false)。 */
  house?: boolean;
  /** 星の明るさの倍率(既定 1)。 */
  starGain?: number;
};

const stars = (() => {
  const r = sequence(42);
  // 回転の中心から見た極座標で持つ。明るい星は少なく、暗い星が多い
  return Array.from({ length: 420 }, () => ({ rad: 60 + 300 * Math.sqrt(r()), phase: r() * 1.4 - 0.2, flux: 0.6 / Math.pow(r() + 0.02, 1.3), tint: r() }));
})();
export const PIVOT ={ x: SIM.w + 40, y: SIM.h + 110 };

export const hotPixels = (() => {
  const r = sequence(7);
  return Array.from({ length: 26 }, () => ({ x: Math.floor(r() * SIM.w), y: Math.floor(r() * SIM.h * 0.8), level: 6 + 10 * r(), channel: [0, 0, 0, 1, 2][Math.floor(r() * 5)] })); // 台詞が「赤い点」なので赤を多めに
})();

/** 家と木のシルエット。1 なら前景。 */
export const isHouse = (x: number, y: number) => {
  const ground = SIM.h - 10;
  if (y >= ground) return true;
  if (x > 28 && x < 84 && y > ground - 26) return true; // 壁
  if (y > ground - 44 && y <= ground - 26 && Math.abs(x - 56) < (y - (ground - 44)) * 1.9) return true; // 屋根
  const tree = (cx: number, r: number, top: number) => (x - cx) ** 2 + (y - top) ** 2 * 0.5 < r * r || (Math.abs(x - cx) < 2 && y > top);
  return tree(118, 13, ground - 30) || tree(214, 10, ground - 22);
};

/** 周辺減光の倍率(中心 1、四隅ほど小さい)。 */
export const vignetteAt = (x: number, y: number, strength = 1) => {
  const r2 = ((x - SIM.w / 2) ** 2 + (y - SIM.h / 2) ** 2) / ((SIM.w / 2) ** 2 + (SIM.h / 2) ** 2);
  return 1 / (1 + 3 * strength * r2 * r2 + 0 * r2);
};

/** 星だけの像(ノイズなし、周辺減光なし)を RGB で返す。 */
export const starField = (angle = 0, gain = 1) => {
  const out = new Float32Array(SIM.w * SIM.h * 3);
  for (const s of stars) {
    const a = Math.PI + s.phase + angle;
    const [sx, sy] = [PIVOT.x + s.rad * Math.cos(a), PIVOT.y + s.rad * Math.sin(a)];
    const color = s.tint < 0.25 ? [1.25, 0.95, 0.7] : s.tint > 0.7 ? [0.75, 0.95, 1.35] : [1, 1, 1];
    for (let y = Math.floor(sy) - 2; y <= sy + 3; y++) {
      for (let x = Math.floor(sx) - 2; x <= sx + 3; x++) {
        if (x < 0 || y < 0 || x >= SIM.w || y >= SIM.h) continue;
        const v = gain * s.flux * Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / 1.1);
        for (let c = 0; c < 3; c++) out[(y * SIM.w + x) * 3 + c] += v * color[c];
      }
    }
  }
  return out;
};

/** 光害の明るさ(下ほど明るい)。 */
export const pollutionAt = (y: number, strength = 1) => strength * (2.2 + 5 * Math.pow(y / SIM.h, 1.6));

/** 1 枚(または n 枚の平均)の RAW を RGB の光量で作る。 */
export const rawFrame = (o: SkyOptions = {}) => {
  const { angle = 0, noise = 1, shot = 0, stack = 1, pollution = 1, vignette = 1, hot = true, house = false, starGain = 1 } = o;
  const img = o.stars === false ? new Float32Array(SIM.w * SIM.h * 3) : starField(angle, starGain);
  const sigma = (NOISE * noise) / Math.sqrt(stack);
  for (let y = 0; y < SIM.h; y++) {
    for (let x = 0; x < SIM.w; x++) {
      const k = (y * SIM.w + x) * 3;
      const fg = house && isHouse(x, y);
      const v = vignetteAt(x, y, vignette);
      const sky = pollutionAt(y, pollution);
      for (let c = 0; c < 3; c++) {
        const light = fg ? 0.5 + 0.25 * hash(x >> 2, y >> 2, 99) : (sky * [1.05, 1, 0.85][c] + img[k + c]) * v;
        // ノイズは光が多いほど大きい(光の粒のばらつき)
        img[k + c] = light + sigma * Math.sqrt(0.35 + light / 4) * gauss(x, y, shot * 3 + c);
      }
    }
  }
  if (hot) for (const p of hotPixels) img[(p.y * SIM.w + p.x) * 3 + p.channel] += p.level;
  return img;
};

/** 動かない成分だけ(星なし、ノイズなし)= 静止シーン。 */
export const staticScene = (o: SkyOptions = {}) => rawFrame({ ...o, stars: false, noise: 0 });

/** 光量の配列を画面の色にする。lo が黒、hi が白。 */
export const toImageData = (img: Float32Array, lo: number, hi: number) => {
  const px = new Uint8ClampedArray(SIM.w * SIM.h * 4);
  for (let i = 0; i < SIM.w * SIM.h; i++) {
    for (let c = 0; c < 3; c++) px[i * 4 + c] = 255 * Math.pow(Math.min(1, Math.max(0, (img[i * 3 + c] - lo) / (hi - lo))), 1 / 1.8);
    px[i * 4 + 3] = 255;
  }
  return new ImageData(px, SIM.w, SIM.h);
};
