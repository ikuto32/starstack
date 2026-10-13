import type { CSSProperties, ReactNode } from "react";
import { Tag } from "../components/ui";
import { gauss } from "../sim/rng";
import { SIM } from "../sim/sky";
import { COLOR } from "../theme";
import { ramp } from "../timing";

// 6〜8章で共有する部品

/** 絵の種類(模式図か、実際の画像・データか)を隅に小さく示す。 */
export const Note = ({ kind, style }: { kind: "模式図" | "実際の画像" | "実際のデータ"; style?: CSSProperties }) => (
  <Tag color={COLOR.dim} style={{ position: "absolute", right: 8, bottom: 8, fontSize: 28, fontWeight: 600, ...style }}>
    {kind}
  </Tag>
);

/** start で現れ、end で消える(0〜1)。 */
export const fade = (frame: number, start: number, end: number, dur = 12) => ramp(frame, start, dur) * (1 - ramp(frame, end, dur));

/** 一定の速さで 0 → 1。 */
export const linear = (frame: number, start: number, dur: number) => Math.min(1, Math.max(0, (frame - start) / dur));

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** 値の範囲 [d0, d1] を画面の範囲 [r0, r1] に写す関数を作る。 */
export const scaler = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** 手順の一覧。active 番目を目立たせる。 */
export const Steps = ({ label, items, active }: { label: string; items: string[]; active: number }) => (
  <div style={{ position: "absolute", left: 0, top: 0, display: "flex", alignItems: "center", gap: 18, fontSize: 32, color: COLOR.dim }}>
    <div style={{ marginRight: 6 }}>{label}</div>
    {items.map((item, i) => (
      <div key={item} style={{ padding: "6px 22px", borderRadius: 30, border: `3px solid ${i === active ? COLOR.accent : COLOR.line}`, background: i === active ? "rgba(108,196,255,0.16)" : "transparent", color: i === active ? COLOR.text : COLOR.dim, fontWeight: i === active ? 700 : 500 }}>
        {i + 1}. {item}
      </div>
    ))}
  </div>
);

/** 絶対位置に置く箱。 */
export const At = ({ x, y, w, h, opacity = 1, children, style }: { x: number; y: number; w?: number; h?: number; opacity?: number; children?: ReactNode; style?: CSSProperties }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity, ...style }}>{children}</div>
);

/** 図の下に付ける説明。 */
export const Caption = ({ children, color = COLOR.text, style }: { children: ReactNode; color?: string; style?: CSSProperties }) => <div style={{ fontSize: 36, fontWeight: 600, color, textAlign: "center", marginTop: 10, ...style }}>{children}</div>;

/** SVG の文字。背景色でふちどって、線や棒に重なっても読めるようにする。 */
export const Label = ({ x, y, children, size = 32, color = COLOR.text, anchor = "start", opacity = 1, weight = 700 }: { x: number; y: number; children: ReactNode; size?: number; color?: string; anchor?: "start" | "middle" | "end"; opacity?: number; weight?: number }) => (
  <text x={x} y={y} fontSize={size} fontWeight={weight} fill={color} textAnchor={anchor} opacity={opacity} stroke={COLOR.bg} strokeWidth={8} paintOrder="stroke" strokeLinejoin="round">
    {children}
  </text>
);

/** SVG の矢印(先端つきの線)。 */
export const Arrow = ({ from, to, color = COLOR.text, width = 4, head = 14, opacity = 1, dash }: { from: [number, number]; to: [number, number]; color?: string; width?: number; head?: number; opacity?: number; dash?: string }) => {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  const [ux, uy] = [dx / len, dy / len];
  const h = Math.min(head, len * 0.6);
  const base = [to[0] - ux * h, to[1] - uy * h];
  return (
    <g opacity={opacity}>
      <line x1={from[0]} y1={from[1]} x2={base[0]} y2={base[1]} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
      <polygon points={`${to[0]},${to[1]} ${base[0] - uy * h * 0.5},${base[1] + ux * h * 0.5} ${base[0] + uy * h * 0.5},${base[1] - ux * h * 0.5}`} fill={color} />
    </g>
  );
};

/** 模式図の画像と同じ大きさのノイズ(標準偏差 1)。color は色ごとにばらつく割合(1 で3色が別々、0 で白黒)。 */
export const noiseField = (seed: number, color = 1) => {
  const out = new Float32Array(SIM.w * SIM.h * 3);
  for (let y = 0; y < SIM.h; y++) for (let x = 0; x < SIM.w; x++) for (let c = 0; c < 3; c++) out[(y * SIM.w + x) * 3 + c] = (color * gauss(x, y, seed * 3 + c) + (1 - color) * gauss(x, y, seed * 3 + 911)) / Math.hypot(color, 1 - color);
  return out;
};

/** 模式図の画像 2 枚を a + k × b で合成する。 */
export const combine = (a: Float32Array, b: Float32Array, k: number, base = 0) => {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + k * b[i] + base;
  return out;
};
