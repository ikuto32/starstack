import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import clips from "../data/clips.json";
import { COLOR, STAGE } from "../theme";
import { ramp } from "../timing";
import type { Chapter } from "../types";

/** 場面の土台。左上に章の名前、その下の STAGE に絵を置く。 */
export const Stage = ({ chapter, title, children }: { chapter: Chapter; title?: string; children: ReactNode }) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", left: STAGE.x, top: 28, display: "flex", alignItems: "baseline", gap: 24 }}>
      <div style={{ fontSize: 26, color: COLOR.dim }}>{chapter.title}</div>
      {title && <div style={{ fontSize: 40, fontWeight: 700, color: COLOR.text }}>{title}</div>}
    </div>
    <div style={{ position: "absolute", left: STAGE.x, top: STAGE.y, width: STAGE.w, height: STAGE.h }}>{children}</div>
  </AbsoluteFill>
);

/** at フレームから、少し下からせり上がって現れる。 */
export const Reveal = ({ at, children, style }: { at: number; children: ReactNode; style?: CSSProperties }) => {
  const p = ramp(useCurrentFrame(), at, 14);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)`, ...style }}>{children}</div>;
};

/** 枠つきの箱。 */
export const Card = ({ children, color = COLOR.line, style }: { children: ReactNode; color?: string; style?: CSSProperties }) => (
  <div style={{ background: COLOR.panel, border: `3px solid ${color}`, borderRadius: 18, padding: "20px 28px", color: COLOR.text, fontSize: 36, lineHeight: 1.45, ...style }}>{children}</div>
);

/** 絵の上に置く短いラベル。 */
export const Tag = ({ children, color = COLOR.accent, style }: { children: ReactNode; color?: string; style?: CSSProperties }) => (
  <div style={{ display: "inline-block", background: "rgba(5,7,13,0.82)", border: `2px solid ${color}`, color, borderRadius: 10, padding: "4px 16px", fontSize: 30, fontWeight: 700, ...style }}>{children}</div>
);

type View = { zoom: number; x: number; y: number };

/**
 * 写真を枠の中に表示し、from から to へゆっくり動かす。
 * zoom 1 で写真の全体が枠に収まり、x・y(0〜1)は写真のどこを枠の中心に置くか。
 */
export const Photo = ({ src, w, h, aspect, from = { zoom: 1, x: 0.5, y: 0.5 }, to = from, progress, style, children }: { src: string; w: number; h: number; aspect: number; from?: View; to?: View; progress: number; style?: CSSProperties; children?: ReactNode }) => {
  const mix = (a: number, b: number) => a + (b - a) * progress;
  const view = { zoom: mix(from.zoom, to.zoom), x: mix(from.x, to.x), y: mix(from.y, to.y) };
  const fit = Math.min(w / aspect, h); // zoom 1 のときの写真の高さ
  const [iw, ih] = [fit * aspect * view.zoom, fit * view.zoom];
  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: 14, background: "#000", ...style }}>
      <div style={{ position: "absolute", left: w / 2 - iw * view.x, top: h / 2 - ih * view.y, width: iw, height: ih }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", display: "block" }} />
        {children}
      </div>
    </div>
  );
};

/** 同じ大きさの2枚を重ね、境界線の位置 split(0〜1)で左右に見せ分ける。 */
export const Wipe = ({ left, right, size, split, labels }: { left: string; right: string; size: number; split: number; labels?: [string, string] }) => (
  <div style={{ position: "relative", width: size, height: size, borderRadius: 14, overflow: "hidden" }}>
    <Img src={staticFile(right)} style={{ position: "absolute", width: size, height: size }} />
    <div style={{ position: "absolute", width: size * split, height: size, overflow: "hidden" }}>
      <Img src={staticFile(left)} style={{ width: size, height: size, maxWidth: "none" }} />
    </div>
    <div style={{ position: "absolute", left: size * split - 2, top: 0, width: 4, height: size, background: "#fff" }} />
    {labels && <Tag style={{ position: "absolute", left: 14, top: 14 }}>{labels[0]}</Tag>}
    {labels && <Tag style={{ position: "absolute", right: 14, top: 14 }}>{labels[1]}</Tag>}
  </div>
);

/**
 * Open Camera の操作動画をスマホの枠の中で再生する。
 * 場面のほうが長ければ、場面の長さに合わせてゆっくり再生する。hold を指定すると、その秒数の位置で止める。
 */
export const Phone = ({ clip, frames, hold, height = 680 }: { clip: keyof typeof clips; frames: number; hold?: number; height?: number }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const length = clips[clip] * fps;
  const rate = Math.min(1, (length - 2) / Math.max(1, frames));
  const stopped = hold !== undefined && frame * rate >= hold * fps;
  const width = (height - 24) * 0.48 + 24;
  return (
    <div style={{ width, height, borderRadius: 34, border: "12px solid #1b2030", background: "#000", overflow: "hidden", boxShadow: "0 0 0 2px #39415c" }}>
      {/* 止めるときは、同じ動画をその位置から速度ほぼ 0 で流す */}
      <OffthreadVideo src={staticFile(`app/${clip}.mp4`)} startFrom={stopped ? Math.round(hold! * fps) : 0} playbackRate={stopped ? 0.0001 : rate} muted style={{ width: "100%", height: "100%" }} />
    </div>
  );
};
