import type { CSSProperties, ReactNode } from "react";
import { SimSky } from "../components/SimSky";
import { Tag } from "../components/ui";
import { gauss } from "../sim/rng";
import { NOISE, SIM, hotPixels, starField, vignetteAt } from "../sim/sky";
import { COLOR } from "../theme";

// 3〜5章で共有する部品

/** 絵の隅に置く「模式図」「実際の画像」の表示。 */
export const Kind = ({ real, style }: { real?: boolean; style?: CSSProperties }) => (
  <Tag color={COLOR.dim} style={{ position: "absolute", right: 12, bottom: 12, fontSize: 28, fontWeight: 600, ...style }}>
    {real ? "実際の画像" : "模式図"}
  </Tag>
);

/** 2枚の光量の配列を t(0〜1)で混ぜる。 */
export const mixImage = (a: Float32Array, b: Float32Array, t: number) => {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
};

export type Rect = { x: number; y: number; w: number; h: number };

/** 模式図の星空の一部(画素の範囲 rect)を切り出して拡大する。children は拡大後の座標に重ねる。 */
export const SimCrop = ({ image, rect, scale, lo, hi, style, children }: { image: Float32Array; rect: Rect; scale: number; lo?: number; hi?: number; style?: CSSProperties; children?: ReactNode }) => (
  <div style={{ position: "relative", width: rect.w * scale, height: rect.h * scale, overflow: "hidden", borderRadius: 10, ...style }}>
    <SimSky image={image} lo={lo} hi={hi} scale={scale} style={{ position: "absolute", left: -rect.x * scale, top: -rect.y * scale, borderRadius: 0, maxWidth: "none" }} />
    {children}
  </div>
);

/** 空の明るさが一様なときの1枚(周辺減光だけを見せる用)。strength 0 で減光なし。 */
export const flatField = (strength: number, noise = 1, shot = 0) => {
  const img = starField(0, 1);
  for (let y = 0; y < SIM.h; y++) {
    for (let x = 0; x < SIM.w; x++) {
      const v = vignetteAt(x, y, strength);
      for (let c = 0; c < 3; c++) {
        const k = (y * SIM.w + x) * 3 + c;
        const light = (5 * [1.05, 1, 0.85][c] + img[k]) * v;
        img[k] = light + NOISE * noise * Math.sqrt(0.35 + light / 4) * gauss(x, y, shot * 3 + c + 50);
      }
    }
  }
  return img;
};

/** rect の中にあるホットピクセル(端すぎるものは除く)。 */
export const hotIn = (r: Rect, margin = 3) => hotPixels.filter((p) => p.x >= r.x + margin && p.x < r.x + r.w - margin && p.y >= r.y + margin && p.y < r.y + r.h - margin);

/** w×h の範囲のうち、score が最大になる置き場所を探す。 */
export const bestRect = (w: number, h: number, score: (r: Rect) => number, yMax = SIM.h) => {
  let best: Rect = { x: 0, y: 0, w, h };
  let top = -Infinity;
  for (let y = 0; y + h <= yMax; y += 4) {
    for (let x = 0; x + w <= SIM.w; x += 4) {
      const s = score({ x, y, w, h });
      if (s > top) [top, best] = [s, { x, y, w, h }];
    }
  }
  return best;
};

/** 星空のパッチ(4章のスタックの説明で使い回す)。ホットピクセルが2〜3個と、暗い星が入る場所。 */
export const PATCH: Rect = (() => {
  const field = starField(0, 1);
  return bestRect(
    112,
    72,
    (r) => {
      let faint = 0;
      let bright = 0;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const v = field[(y * SIM.w + x) * 3 + 1];
          if (v > 0.8 && v < 3) faint++;
          if (v > 8) bright++;
        }
      }
      // 赤いホットピクセルを優先する
      const hot = hotIn(r, 8);
      const red = hot.filter((p) => p.channel === 0).length;
      return Math.min(3, hot.length) * 60 + Math.min(2, red) * 80 + Math.min(faint, 60) - bright * 2;
    },
    118,
  );
})();

/** 上向きの軸2本と軸の名前だけの、素朴なグラフの枠。 */
export const Axes = ({ w, h, x, y, pad = 60 }: { w: number; h: number; x: string; y: string; pad?: number }) => (
  <g>
    <line x1={pad} y1={h - pad} x2={w - 10} y2={h - pad} stroke={COLOR.dim} strokeWidth={3} />
    <line x1={pad} y1={h - pad} x2={pad} y2={10} stroke={COLOR.dim} strokeWidth={3} />
    <text x={w - 12} y={h - 16} fill={COLOR.dim} fontSize={28} textAnchor="end">
      {x}
    </text>
    <text x={24} y={h / 2} fill={COLOR.dim} fontSize={28} textAnchor="middle" transform={`rotate(-90 24 ${h / 2})`}>
      {y}
    </text>
  </g>
);
