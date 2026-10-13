import type { ReactNode } from "react";
import frames from "../data/frames.json";
import { COLOR } from "../theme";
import { Arrow } from "./ch06_parts";

// 8章「ずらすだけでは合わない」「多項式ワープ」で共有する格子の図(実データ)

/** 2 枚目(黄)の色。 */
export const YELLOW = "#ffd84a";

const REF = frames.gridReference;
const MOVED = frames.grid;
// 格子は 7 列(x)× 9 点(y)で、列ごとに並んでいる
const [NX, NY] = [7, 9];
const CENTER = 3 * NY + 4;
/** 画面の中心が動いた量。全体を平行移動するならこの量だけずらす。 */
export const SHIFT = [MOVED[CENTER][0] - REF[CENTER][0], MOVED[CENTER][1] - REF[CENTER][1]];
/** 平行移動だけで合わせたときに残るずれの最大(画素)。 */
export const WORST = Math.max(...REF.map((p, i) => Math.hypot(MOVED[i][0] - p[0] - SHIFT[0], MOVED[i][1] - p[1] - SHIFT[1])));

const K = 0.14;
/** 写真の画素の座標を、図の中の位置にする。 */
export const gridXY = (x: number, y: number): [number, number] => [20 + (x + 95) * K, 4 + (y + 595) * K];
export const GRID_SIZE = { w: 670, h: 690 };

/**
 * 基準のフレームの点 (x, y) が、もう1枚でどこに写るか。
 * moved: 0 で基準と同じ位置、1 で実際の位置。shift: 平行移動で戻す割合。warp: 残りのずれも戻す割合。
 */
export const moveOf = (index: number, moved: number, shift: number, warp: number): [number, number] => {
  const [dx, dy] = [MOVED[index][0] - REF[index][0], MOVED[index][1] - REF[index][1]];
  return [REF[index][0] + moved * dx - shift * SHIFT[0] - warp * (dx - SHIFT[0]), REF[index][1] + moved * dy - shift * SHIFT[1] - warp * (dy - SHIFT[1])];
};

/** 格子のあいだの点のずれを、まわりの 4 点からなめらかに求める。 */
export const displacement = (x: number, y: number): [number, number] => {
  const [stepX, stepY] = [REF[NY][0] - REF[0][0], REF[1][1] - REF[0][1]];
  const [fx, fy] = [Math.min(NX - 1.001, Math.max(0, (x - REF[0][0]) / stepX)), Math.min(NY - 1.001, Math.max(0, (y - REF[0][1]) / stepY))];
  const [ix, iy] = [Math.floor(fx), Math.floor(fy)];
  const d = (i: number, j: number, c: number) => MOVED[i * NY + j][c] - REF[i * NY + j][c];
  const at = (c: number) => (d(ix, iy, c) * (1 - (fx - ix)) + d(ix + 1, iy, c) * (fx - ix)) * (1 - (fy - iy)) + (d(ix, iy + 1, c) * (1 - (fx - ix)) + d(ix + 1, iy + 1, c) * (fx - ix)) * (fy - iy);
  return [at(0), at(1)];
};

const mesh = (points: [number, number][]) => {
  const line = (indices: number[]) => indices.map((i, n) => `${n ? "L" : "M"}${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)}`).join(" ");
  const columns = Array.from({ length: NX }, (_, i) => line(Array.from({ length: NY }, (_, j) => i * NY + j)));
  const rows = Array.from({ length: NY }, (_, j) => line(Array.from({ length: NX }, (_, i) => i * NY + j)));
  return [...columns, ...rows].join(" ");
};

/** 基準の格子(白)と、もう1枚での格子(黄)を重ねて描く。arrows は残ったずれの矢印の濃さ。 */
export const GridFig = ({ moved, shift, warp, yellow, arrows, children }: { moved: number; shift: number; warp: number; yellow: number; arrows: number; children?: ReactNode }) => {
  const white = REF.map((p) => gridXY(p[0], p[1]));
  const other = REF.map((_, i) => gridXY(...moveOf(i, moved, shift, warp)));
  const [fx, fy] = gridXY(0, 0);
  return (
    <svg width={GRID_SIZE.w} height={GRID_SIZE.h} style={{ display: "block" }}>
      <rect x={fx} y={fy} width={frames.width * K} height={frames.height * K} fill={COLOR.panel} stroke={COLOR.line} strokeWidth={2} />
      <path d={mesh(white)} fill="none" stroke="#e8ecff" strokeWidth={2.5} opacity={0.85} />
      <g opacity={yellow}>
        <path d={mesh(other)} fill="none" stroke={YELLOW} strokeWidth={3.5} />
        {other.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={4.5} fill={YELLOW} />
        ))}
      </g>
      {arrows > 0 && white.map((p, i) => (Math.hypot(other[i][0] - p[0], other[i][1] - p[1]) > 7 ? <Arrow key={i} from={p} to={[p[0] + (other[i][0] - p[0]) * Math.min(1, arrows), p[1] + (other[i][1] - p[1]) * Math.min(1, arrows)]} color={COLOR.bad} width={4} head={12} opacity={Math.min(1, arrows * 2)} /> : null))}
      {children}
    </svg>
  );
};
