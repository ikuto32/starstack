import { COLOR } from "../theme";

// 誤差関数の近似(Abramowitz & Stegun 7.1.26)
const erf = (x: number) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x < 0 ? -y : y;
};

/** 中心 (sx, sy)・広がり sigma(画素単位)の星の光のうち、画素 (x, y) に入る割合。 */
export const pixelShare = (sx: number, sy: number, x: number, y: number, sigma: number) => {
  const part = (a: number, c: number) => 0.5 * (erf((a + 1 - c) / (sigma * Math.SQRT2)) - erf((a - c) / (sigma * Math.SQRT2)));
  return part(x, sx) * part(y, sy);
};

/** 星のにじみ(放射状のぼかし)。SVG の defs に置き、fill="url(#ch10-glow)" で使う。 */
export const GlowDef = () => (
  <radialGradient id="ch10-glow">
    <stop offset="0" stopColor="#fff" />
    <stop offset="0.3" stopColor="#ffe9a8" stopOpacity="0.85" />
    <stop offset="1" stopColor="#ffd060" stopOpacity="0" />
  </radialGradient>
);

/**
 * n×n の画素の格子に星を1つ落とし、各画素の明るさを塗る(SVG の g)。
 * (sx, sy) は画素単位の星の位置。star は本当の星の像を重ねる濃さ、filled は画素の塗りの濃さ。
 */
export const PixelStar = ({ n, cell, sx, sy, sigma = 0.32, star = 1, filled = 1, line = COLOR.dim }: { n: number; cell: number; sx: number; sy: number; sigma?: number; star?: number; filled?: number; line?: string }) => (
  <g>
    <rect width={n * cell} height={n * cell} fill="#070a14" />
    {Array.from({ length: n * n }, (_, k) => {
      const [x, y] = [k % n, Math.floor(k / n)];
      return <rect key={k} x={x * cell} y={y * cell} width={cell} height={cell} fill="#e6edff" opacity={Math.min(1, 1.2 * pixelShare(sx, sy, x, y, sigma)) * filled} />;
    })}
    {Array.from({ length: n + 1 }, (_, i) => (
      <path key={i} d={`M${i * cell} 0 V${n * cell} M0 ${i * cell} H${n * cell}`} stroke={line} strokeWidth={2} />
    ))}
    {star > 0 && <circle cx={sx * cell} cy={sy * cell} r={sigma * cell * 2.4} fill="url(#ch10-glow)" opacity={star} />}
  </g>
);

/** 中心 (cx, cy)・一辺 size の正方形が、単位の升目 (i, j) と重なる面積。 */
export const overlap = (cx: number, cy: number, size: number, i: number, j: number) => {
  const side = (c: number, k: number) => Math.max(0, Math.min(c + size / 2, k + 1) - Math.max(c - size / 2, k));
  return side(cx, i) * side(cy, j);
};
