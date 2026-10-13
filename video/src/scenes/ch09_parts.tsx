import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { Tag } from "../components/ui";
import { COLOR } from "../theme";

/** 絵の隅に置く「模式図」「実際の画像」の印。 */
export const Corner = ({ children = "模式図", style }: { children?: ReactNode; style?: CSSProperties }) => (
  <Tag color={COLOR.dim} style={{ position: "absolute", right: 12, bottom: 12, fontSize: 28, fontWeight: 600, ...style }}>
    {children}
  </Tag>
);

const fade = (v: number) => Math.min(1, Math.max(0, v));

/**
 * 同じ写真の「加工前(filter をかけたもの)」と「加工後(そのまま)」を、境界線 split(0〜1)で見せ分ける。
 * 加工前は実物ではないので、ラベルで「イメージ」と示すこと。
 */
export const BeforeAfter = ({ src, size, split, filter, before, after }: { src: string; size: number; split: number; filter: string; before: string; after: string }) => (
  <div style={{ position: "relative", width: size, height: size, borderRadius: 14, overflow: "hidden", flexShrink: 0, background: "#000" }}>
    <Img src={staticFile(src)} style={{ position: "absolute", width: size, height: size }} />
    <div style={{ position: "absolute", width: size * split, height: size, overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{ width: size, height: size, maxWidth: "none", filter }} />
    </div>
    <div style={{ position: "absolute", left: size * split - 2, top: 0, width: 4, height: size, background: "#fff", opacity: fade(split * 30) * fade((1 - split) * 30) }} />
    <Tag color={COLOR.warn} style={{ position: "absolute", left: 14, top: 14, opacity: fade((split - 0.3) * 8) }}>
      {before}
    </Tag>
    <Tag style={{ position: "absolute", right: 14, bottom: 14, opacity: fade((0.8 - split) * 8) }}>{after}</Tag>
  </div>
);
