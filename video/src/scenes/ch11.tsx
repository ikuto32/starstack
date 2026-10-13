import { useMemo, type ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Photo, Reveal, Stage, Tag } from "../components/ui";
import { hash } from "../sim/rng";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, through } from "../timing";
import type { SceneView } from "../types";
import { Corner } from "./ch09_parts";

// 流れの各段の小さなアイコン(中心が原点、±45 に収める)
const ICONS: ReactNode[] = [
  // 撮る: スマホ
  <g key="shoot">
    <rect x={-24} y={-42} width={48} height={84} rx={9} fill="#0a0e1a" stroke={COLOR.text} strokeWidth={5} />
    <circle cx={-8} cy={-26} r={6} fill={COLOR.accent} />
  </g>,
  // 静止シーンを引く: 家にマイナス
  <g key="subtract">
    <path d="M-42 34 V0 L-16 -24 L10 0 V34 Z" fill={COLOR.dim} />
    <rect x={18} y={-6} width={30} height={10} rx={3} fill={COLOR.bad} />
  </g>,
  // 星を見つける: 星に照準
  <g key="find">
    <path d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z" fill="#fff" />
    <circle r={30} fill="none" stroke={COLOR.accent} strokeWidth={5} />
    <path d="M0 -44 V-30 M0 44 V30 M-44 0 H-30 M44 0 H30" stroke={COLOR.accent} strokeWidth={5} />
  </g>,
  // 追跡して重ねる: ずれた枚を重ねる
  <g key="stack">
    {[0, 1, 2].map((i) => (
      <g key={i} transform={`translate(${-12 + i * 12} ${-12 + i * 12})`}>
        <rect x={-30} y={-24} width={60} height={48} rx={6} fill="#0a0e1a" stroke={COLOR.accent} strokeWidth={4} />
        <circle cx={-8} cy={-4} r={4} fill="#fff" />
        <circle cx={14} cy={8} r={3} fill="#fff" />
      </g>
    ))}
  </g>,
  // 仕上げ: 明るさのカーブ
  <g key="finish">
    <rect x={-36} y={-36} width={72} height={72} rx={6} fill="#0a0e1a" stroke={COLOR.dim} strokeWidth={4} />
    <path d="M-30 30 C-22 -18 -4 -26 30 -30" fill="none" stroke={COLOR.good} strokeWidth={6} strokeLinecap="round" />
  </g>,
];

// 処理の流れを1本の線で
const Recap: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const l1 = lineAt(scene, 1);
  const steps = ["撮る", "静止シーンを引く", "星を見つける", "追跡して重ねる", "仕上げ"];
  const at = [15, 78, 135, 172, l1 + 8];
  const X = (i: number) => 180 + i * 360;
  const Y = 220;
  // 線は各段が点くのに合わせて伸びる
  const reach = at.reduce((x, t, i) => (i ? x + 360 * ramp(frame, at[i - 1] + 8, t - at[i - 1]) : x), X(0));
  const pulse = X(0) + ((frame * 9) % (X(4) - X(0)));
  return (
    <Stage chapter={chapter}>
      <svg width={STAGE.w} height={STAGE.h}>
        <line x1={X(0)} y1={Y} x2={X(4)} y2={Y} stroke={COLOR.line} strokeWidth={8} />
        <line x1={X(0)} y1={Y} x2={reach} y2={Y} stroke={COLOR.accent} strokeWidth={8} />
        {pulse < reach && <circle cx={pulse} cy={Y} r={9} fill="#fff" opacity={0.8} />}
        {steps.map((name, i) => {
          const on = ramp(frame, at[i], 14);
          return (
            <g key={name} opacity={0.3 + 0.7 * on}>
              <g transform={`translate(${X(i)} ${Y}) scale(${1 + 0.12 * Math.sin(Math.PI * on)})`}>
                <circle r={88} fill={COLOR.panel} stroke={on > 0.5 ? COLOR.accent : COLOR.line} strokeWidth={5} />
                <g transform="scale(1.25)">{ICONS[i]}</g>
              </g>
              <text x={X(i)} y={Y + 150} textAnchor="middle" fill={COLOR.text} fontSize={40} fontWeight={700}>
                {name}
              </text>
            </g>
          );
        })}
        <text x={900} y={560} textAnchor="middle" fontSize={50} fontWeight={700} fill={COLOR.text}>
          <tspan opacity={ramp(frame, l1 + 25, 15)}>394枚・2時間分の計算</tspan>
          <tspan opacity={ramp(frame, l1 + 105, 15)} fill={COLOR.dim}>
            {"  →  "}
          </tspan>
          <tspan opacity={ramp(frame, l1 + 110, 15)} fill={COLOR.accent} fontSize={64} fontWeight={800}>
            パソコンで2分ちょっと
          </tspan>
        </text>
      </svg>
    </Stage>
  );
};

// 苦手なこと: 北極星の近く、画面の四隅
const Limits: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const W = 870;
  const pole = { x: 435, y: 330 };
  const turn = 0.25 + 0.9 * through(frame, scene); // 星が回った角度
  const trails = useMemo(() => [16, 34, 52, 110, 150, 190, 228].flatMap((r, k) => Array.from({ length: r < 60 ? 2 : 4 }, (_, i) => ({ r, a: 6.28 * hash(k, i, 31) }))), []);
  const smear = ramp(frame, 225, 70);
  const corner = useMemo(() => Array.from({ length: 77 }, (_, k) => ({ x: (k % 11) / 10 + 0.05 * (hash(k, 1, 8) - 0.5), y: Math.floor(k / 11) / 6 + 0.07 * (hash(k, 2, 8) - 0.5), r: 3 + 3 * hash(k, 3, 8) })), []);
  const box = { position: "relative", width: W, height: STAGE.h, background: COLOR.panel, border: `3px solid ${COLOR.line}`, borderRadius: 18, boxSizing: "border-box" } as const;
  return (
    <Stage chapter={chapter}>
      <div style={{ display: "flex", gap: 60 }}>
        <div style={box}>
          <svg width={W} height={STAGE.h}>
            <text x={pole.x} y={62} textAnchor="middle" fill={COLOR.text} fontSize={44} fontWeight={700}>
              北極星の近くは苦手
            </text>
            {trails.map((s, i) => {
              const [a0, a1] = [s.a, s.a + turn];
              const p = (a: number) => `${pole.x + s.r * Math.cos(a)} ${pole.y + s.r * Math.sin(a)}`;
              return (
                <g key={i}>
                  <path d={`M${p(a0)} A${s.r} ${s.r} 0 0 1 ${p(a1)}`} fill="none" stroke={COLOR.accent} strokeWidth={3} opacity={0.45} />
                  <circle cx={pole.x + s.r * Math.cos(a1)} cy={pole.y + s.r * Math.sin(a1)} r={5} fill="#fff" />
                </g>
              );
            })}
            <path d={`M${pole.x - 9} ${pole.y} h18 M${pole.x} ${pole.y - 9} v18`} stroke={COLOR.warn} strokeWidth={3} />
            <g opacity={ramp(frame, 90, 15)}>
              <circle cx={pole.x} cy={pole.y} r={68} fill="none" stroke={COLOR.warn} strokeWidth={4} strokeDasharray="10 8" />
              <text x={pole.x} y={pole.y + 275} textAnchor="middle" fill={COLOR.warn} fontSize={34} fontWeight={700}>
                ほとんど動かない
              </text>
              <text x={pole.x} y={pole.y + 320} textAnchor="middle" fill={COLOR.text} fontSize={30}>
                →「動かないもの」と区別できない
              </text>
            </g>
          </svg>
          <Corner />
        </div>
        <Reveal at={205} style={box}>
          <svg width={W} height={STAGE.h}>
            <defs>
              <filter id="ch11-blur" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation={1.6 * smear} />
              </filter>
            </defs>
            <text x={W / 2} y={62} textAnchor="middle" fill={COLOR.text} fontSize={44} fontWeight={700}>
              画面の四隅は星がにじむ
            </text>
            <rect x={105} y={110} width={660} height={440} fill="#05070d" stroke={COLOR.dim} strokeWidth={3} />
            {corner.map((s, i) => {
              const [ux, uy] = [(s.x - 0.5) * 2, (s.y - 0.5) * 2];
              const d = Math.min(1, Math.hypot(ux, uy) / 1.414) ** 3 * smear;
              const [x, y] = [125 + s.x * 620, 130 + s.y * 400];
              // 中心から外へ向かう方向に伸びる
              return <ellipse key={i} cx={x} cy={y} rx={s.r * (1 + 5 * d)} ry={s.r * (1 + 1.2 * d)} transform={`rotate(${(Math.atan2(uy * 400, ux * 620) * 180) / Math.PI} ${x} ${y})`} fill="#fff" opacity={1 - 0.45 * d} filter={d > 0.25 ? "url(#ch11-blur)" : undefined} />;
            })}
            {[0, 1, 2, 3].map((k) => (
              <circle key={k} cx={k % 2 ? 715 : 155} cy={k < 2 ? 160 : 500} r={62} fill="none" stroke={COLOR.warn} strokeWidth={4} strokeDasharray="10 8" opacity={ramp(frame, 290, 15)} />
            ))}
            <text x={W / 2} y={618} textAnchor="middle" fill={COLOR.text} fontSize={32} opacity={ramp(frame, 270, 15)}>
              レンズの性質で、端ほど像がくずれる
            </text>
          </svg>
          <Corner />
        </Reveal>
      </div>
    </Stage>
  );
};

const CREDITS = ["VOICEVOX:四国めたん", "VOICEVOX:春日部つむぎ", "BGM: しゃろう", "効果音: 効果音ラボ", "撮影アプリ: Open Camera", "星表・星座線: d3-celestial"];

// 完成画像と超広角の作例をゆっくりなぞり、GitHub の案内とクレジット
const Guide: SceneView = ({ scene }) => {
  const frame = useCurrentFrame();
  const l1 = lineAt(scene, 1);
  const p = through(frame, scene);
  const wide = ramp(frame, l1 + 10, 30);
  return (
    <AbsoluteFill>
      <Photo src="img/final.jpg" w={1920} h={1080} aspect={3 / 4} from={{ zoom: 2.5, x: 0.5, y: 0.3 }} to={{ zoom: 2.5, x: 0.5, y: 0.52 }} progress={p} style={{ borderRadius: 0 }} />
      <div style={{ position: "absolute", inset: 0, opacity: wide }}>
        <Photo src="img/wide.jpg" w={1920} h={1080} aspect={3 / 2} from={{ zoom: 1.5, x: 0.44, y: 0.45 }} to={{ zoom: 1.5, x: 0.6, y: 0.5 }} progress={p} style={{ borderRadius: 0 }} />
      </div>
      <Tag color={COLOR.dim} style={{ position: "absolute", right: 60, top: 40, fontSize: 28, fontWeight: 600 }}>
        {wide > 0.5 ? "超広角カメラの作例(実際の画像)" : "完成画像(実際の画像)"}
      </Tag>
      <div style={{ position: "absolute", left: 60, top: 50, width: 720, background: "rgba(5,7,13,0.84)", border: `3px solid ${COLOR.line}`, borderRadius: 18, padding: "28px 36px", color: COLOR.text }}>
        <Reveal at={15}>
          <div style={{ fontSize: 32, color: COLOR.dim }}>今回使ったプログラム</div>
          <div style={{ fontSize: 56, fontWeight: 800 }}>
            <span style={{ color: COLOR.accent }}>GitHub</span> で公開
          </div>
        </Reveal>
        <Reveal at={85} style={{ marginTop: 14 }}>
          <Tag style={{ fontSize: 40, padding: "8px 24px" }}>リンクは概要欄</Tag>
        </Reveal>
        <div style={{ height: 3, background: COLOR.line, margin: "28px 0 20px", opacity: ramp(frame, l1, 15) }} />
        {CREDITS.map((c, i) => (
          <Reveal key={c} at={l1 + 5 + i * 9}>
            <div style={{ fontSize: 32, lineHeight: 1.55 }}>{c}</div>
          </Reveal>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// 「章ID/場面名」→ 場面の絵
export const ch11: Record<string, SceneView> = {
  "11_outro/流れの復習": Recap,
  "11_outro/限界": Limits,
  "11_outro/案内": Guide,
};
