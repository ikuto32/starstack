import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Freeze, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Tag } from "../components/ui";
import clips from "../data/clips.json";
import { sequence } from "../sim/rng";
import { COLOR } from "../theme";
import { ramp } from "../timing";

// 1章・2章の場面で共用する部品

/** from から to のあいだだけ見せる(前後は 15 フレームで溶かす)。枠いっぱいに重ねて置く。 */
export const Phase = ({ from = -100, to = 1e9, children, style }: { from?: number; to?: number; children: ReactNode; style?: CSSProperties }) => {
  const frame = useCurrentFrame();
  const opacity = ramp(frame, from, 15) * (1 - ramp(frame, to - 15, 15));
  if (opacity <= 0) return null;
  return <div style={{ position: "absolute", inset: 0, opacity, ...style }}>{children}</div>;
};

/**
 * Open Camera の操作動画を、スマホの枠の中で見せる。
 * keys は [場面内フレーム, 動画の秒] の並びで、台詞に合わせて動画のどこを映すかを決める。
 */
export const Clip = ({ clip, keys, height = 680 }: { clip: keyof typeof clips; keys: [number, number][]; height?: number }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const sec = interpolate(frame, keys.map((k) => k[0]), keys.map((k) => k[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const at = Math.max(0, Math.min(Math.round(sec * fps), clips[clip] * fps - 3));
  const width = (height - 24) * 0.48 + 24;
  return (
    <div style={{ width, height, flexShrink: 0, borderRadius: 34, border: "12px solid #1b2030", background: "#000", overflow: "hidden", boxShadow: "0 0 0 2px #39415c" }}>
      <Freeze frame={at}>
        <OffthreadVideo src={staticFile(`app/${clip}.mp4`)} muted style={{ width: "100%", height: "100%" }} />
      </Freeze>
    </div>
  );
};

type Star = { x: number; y: number; b: number; tint: string; phase: number };

/** 模式図の星。b は明るさ(0〜1)で、暗い星ほど多い。 */
export const makeStars = (seed: number, n: number): Star[] => {
  const r = sequence(seed);
  return Array.from({ length: n }, () => {
    const [x, y, b, t, phase] = [r(), r(), Math.pow(r(), 2.6), r(), r() * 6.28];
    return { x, y, b, tint: t < 0.2 ? "#ffd9b0" : t > 0.75 ? "#bcd6ff" : "#ffffff", phase };
  });
};

/** 星空。limit より明るい星だけが見える(空が明るいほど limit を上げる)。 */
export const Stars = ({ w, h, seed = 1, n = 260, limit = 0, size = 1 }: { w: number; h: number; seed?: number; n?: number; limit?: number; size?: number }) => {
  const frame = useCurrentFrame();
  const stars = useMemo(() => makeStars(seed, n), [seed, n]);
  return (
    <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
      {stars.map((s, i) => {
        const visible = Math.min(1, Math.max(0, (s.b - limit) * 8 + 0.15));
        if (s.b <= limit || visible <= 0) return null;
        const twinkle = 0.78 + 0.22 * Math.sin(frame * 0.12 + s.phase);
        return <circle key={i} cx={s.x * w} cy={s.y * h} r={(1.3 + 3.4 * s.b) * size} fill={s.tint} opacity={visible * twinkle * (0.55 + 0.45 * s.b)} />;
      })}
    </svg>
  );
};

/** 空の模式図の枠。左上にラベルを置く。 */
export const SkyPanel = ({ w, h, label, color = COLOR.accent, background = "linear-gradient(#04060c, #0a1122)", children, style }: { w: number; h: number; label?: string; color?: string; background?: string; children?: ReactNode; style?: CSSProperties }) => (
  <div style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: 14, background, border: `2px solid ${COLOR.line}`, ...style }}>
    {children}
    {label && (
      <Tag color={color} style={{ position: "absolute", left: 14, top: 14, fontSize: 34 }}>
        {label}
      </Tag>
    )}
  </div>
);

/** 月。phase は 0 が新月、0.5 が満月。 */
export const Moon = ({ cx, cy, r, phase }: { cx: number; cy: number; r: number; phase: number }) => {
  const p = ((phase % 1) + 1) % 1;
  const waxing = p <= 0.5;
  const q = waxing ? p : 1 - p; // 0〜0.5
  const rx = Math.abs(Math.cos(2 * Math.PI * q)) * r;
  // 光っている側の半円と、欠け際の楕円弧で形を作る
  const lit = `M0 ${-r} A${r} ${r} 0 0 1 0 ${r} A${rx} ${r} 0 0 ${q < 0.25 ? 0 : 1} 0 ${-r}Z`;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${waxing ? 1 : -1} 1)`}>
      <circle r={r} fill="#161c2c" stroke="#3a4566" strokeWidth={2} />
      {q > 0.01 && <path d={lit} fill="#f4efd8" />}
    </g>
  );
};

/** 雲。(0,0) を中心に幅およそ 200。 */
export const Cloud = ({ x, y, scale = 1, color = "#566078", opacity = 1 }: { x: number; y: number; scale?: number; color?: string; opacity?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color} opacity={opacity}>
    <ellipse cx={-55} cy={10} rx={48} ry={30} />
    <ellipse cx={0} cy={-12} rx={58} ry={42} />
    <ellipse cx={58} cy={8} rx={46} ry={30} />
    <rect x={-95} y={8} width={190} height={34} rx={17} />
  </g>
);

/** スマホの絵。(0,0) が中心。 */
export const PhoneShape = ({ x, y, angle = 0, scale = 1 }: { x: number; y: number; angle?: number; scale?: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
    <rect x={-48} y={-100} width={96} height={200} rx={14} fill="#1b2030" stroke={COLOR.text} strokeWidth={4} />
    <rect x={-38} y={-86} width={76} height={160} rx={6} fill="#0a1020" />
    <circle cx={0} cy={86} r={5} fill={COLOR.dim} />
  </g>
);

export const CONDITIONS = ["月", "天気", "場所の暗さ", "標高"];

/** 条件の絵文字がわりの小さな絵。 */
export const CondIcon = ({ kind, size = 120 }: { kind: number; size?: number }) => (
  <svg width={size} height={size} viewBox="-60 -60 120 120">
    {kind === 0 && <Moon cx={0} cy={0} r={44} phase={0.14} />}
    {kind === 1 && <Cloud x={0} y={-4} scale={0.56} color="#9aa6c4" />}
    {kind === 2 && (
      <g>
        <rect x={-50} y={-6} width={26} height={56} fill="#3a4566" />
        <rect x={-20} y={-30} width={30} height={80} fill="#4a5678" />
        <rect x={14} y={6} width={34} height={44} fill="#3a4566" />
        {[-42, -12, -2, 22, 34].map((wx, i) => (
          <rect key={i} x={wx} y={[4, -20, 4, 16, 30][i]} width={8} height={8} fill={COLOR.warn} />
        ))}
        <circle cx={34} cy={-38} r={4} fill="#fff" />
        <circle cx={-40} cy={-40} r={3} fill="#fff" />
      </g>
    )}
    {kind === 3 && (
      <g>
        <path d="M-56 48 L-8 -40 L16 0 L28 -16 L56 48Z" fill="#4a5678" />
        <path d="M-8 -40 L-20 -18 L-8 -24 L2 -18Z" fill="#eef2ff" />
        <circle cx={34} cy={-42} r={4} fill="#fff" />
      </g>
    )}
  </svg>
);

/** 4つの条件の帯。active 番目が点灯し、それより前は済みの色になる。 */
export const ConditionBar = ({ active }: { active: number }) => (
  <div style={{ display: "flex", gap: 18, height: 56, alignItems: "center" }}>
    <div style={{ fontSize: 30, color: COLOR.dim, marginRight: 8 }}>撮影の条件</div>
    {CONDITIONS.map((name, i) => {
      const on = i === active;
      const color = on ? COLOR.accent : i < active ? COLOR.good : COLOR.line;
      return (
        <div key={name} style={{ fontSize: on ? 38 : 30, fontWeight: 700, padding: "4px 22px", borderRadius: 12, border: `3px solid ${color}`, background: on ? COLOR.accent : COLOR.panel, color: on ? COLOR.bg : i < active ? COLOR.good : COLOR.dim }}>
          {i + 1} {name}
        </div>
      );
    })}
  </div>
);
