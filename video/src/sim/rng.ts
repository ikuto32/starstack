// 再現できる乱数。Math.random はフレームごとに絵が変わってしまうので使わない

/** 整数の組から 0 以上 1 未満の値を作る。 */
export const hash = (a: number, b = 0, c = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** 整数の組から、平均 0・標準偏差 1 の正規分布の値を作る。 */
export const gauss = (a: number, b = 0, c = 0) => Math.sqrt(-2 * Math.log(hash(a, b, c) + 1e-12)) * Math.cos(2 * Math.PI * hash(a + 7919, b + 104729, c + 1299709));

/** 種から、呼ぶたびに次の値を返す乱数を作る。 */
export const sequence = (seed: number) => {
  let i = 0;
  return () => hash(seed, i++);
};
