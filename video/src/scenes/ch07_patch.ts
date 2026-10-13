import { gauss } from "../sim/rng";

// 7章の模式図で使う小さな画像(24×18 画素)。星 2 つと、1 画素だけ飛び出たノイズ 1 つを置き、
// 台本と同じ手順(ぼかす → ノイズの5倍 → 塊 → 重心)を実際に計算する。
// 値の単位は「ぼかす前のノイズの標準偏差 = 1」。

const [W, H] = [24, 18];
const STARS = [
  { x: 8.37, y: 7.62, amp: 14, size: 1.1 },
  { x: 17.71, y: 13.28, amp: 7, size: 1.0 },
];
/** 1 画素だけ飛び出たノイズ。断面に入るよう、明るい星と同じ行に置く。 */
const SPIKE = { x: 17, y: 8, value: 7 };
const SEED = 5;

const build = () => {
  const raw = new Array<number>(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = gauss(x, y, SEED);
      for (const s of STARS) v += s.amp * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * s.size ** 2));
      if (x === SPIKE.x && y === SPIKE.y) v = SPIKE.value;
      raw[y * W + x] = v;
    }
  }
  // 少しぼかす(1 4 6 4 1 の重みを縦横に掛ける)
  const kernel = [1, 4, 6, 4, 1].map((k) => k / 16);
  const at = (a: number[], x: number, y: number) => a[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const pass = (a: number[], dx: number, dy: number) => a.map((_, i) => kernel.reduce((sum, k, j) => sum + k * at(a, (i % W) + dx * (j - 2), Math.floor(i / W) + dy * (j - 2)), 0));
  const blurred = pass(pass(raw, 1, 0), 0, 1);
  // ノイズの大きさは、中央値からのずれの中央値で測る(星に引っ張られない)
  const middle = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1];
  const level = middle(blurred);
  const sigma = 1.4826 * middle(blurred.map((v) => Math.abs(v - level)));
  const threshold = level + 5 * sigma;
  // しきい値を超えた画素を、上下左右の隣同士でつないで塊にする
  const label = new Array<number>(W * H).fill(-1);
  const blobs: { cells: number[]; x: number; y: number }[] = [];
  for (let i = 0; i < W * H; i++) {
    if (blurred[i] <= threshold || label[i] >= 0) continue;
    const cells: number[] = [];
    const todo = [i];
    label[i] = blobs.length;
    while (todo.length) {
      const p = todo.pop()!;
      cells.push(p);
      const [x, y] = [p % W, Math.floor(p / W)];
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const q = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || blurred[q] <= threshold || label[q] >= 0) continue;
        label[q] = blobs.length;
        todo.push(q);
      }
    }
    // 重心 = 明るさで重みを付けた位置の平均
    const weight = cells.reduce((s, p) => s + blurred[p] - level, 0);
    blobs.push({ cells, x: cells.reduce((s, p) => s + (blurred[p] - level) * (p % W), 0) / weight, y: cells.reduce((s, p) => s + (blurred[p] - level) * Math.floor(p / W), 0) / weight });
  }
  return { w: W, h: H, raw, blurred, level, sigma, threshold, label, blobs, row: SPIKE.y, spike: SPIKE, stars: STARS };
};

export const PATCH = build();
