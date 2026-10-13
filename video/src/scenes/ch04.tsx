import { useMemo, type ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { Card, Reveal, Stage, Tag } from "../components/ui";
import { gauss, hash } from "../sim/rng";
import { rawFrame } from "../sim/sky";
import { COLOR } from "../theme";
import { lineAt, ramp, tween } from "../timing";
import type { SceneView } from "../types";
import { Axes, Kind, PATCH, SimCrop, hotIn, mixImage } from "./ch03_parts";

// この章は模式図だけ。実画像は使わない

// 平均が目標へ寄っていく様子が分かりやすい乱数の列を選ぶ(最初は外れ、最後は近い)
const pickSeries = (make: (seed: number) => number[], target: number, spread: number) => {
  for (let seed = 1; seed < 500; seed++) {
    const v = make(seed);
    const avg = (n: number) => v.slice(0, n).reduce((a, b) => a + b, 0) / n;
    if (Math.abs(avg(v.length) - target) < 0.04 * spread && Math.abs(avg(4) - target) > 0.45 * spread && Math.abs(avg(20) - target) < 0.25 * spread) return v;
  }
  return make(1);
};
const DICE = pickSeries((s) => Array.from({ length: 60 }, (_, i) => 1 + Math.floor(hash(i, s, 17) * 6)), 3.5, 1.7);
// 1つの画素を何度も撮った値(真の値からのずれ、ノイズの標準偏差を 1 とする)
const PIXEL = pickSeries((s) => Array.from({ length: 60 }, (_, i) => gauss(i, s, 23)), 0, 1);

const PIPS: Record<number, number[][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
const Dice = ({ n, size = 64 }: { n: number; size?: number }) => (
  <svg width={size} height={size} viewBox="-10 -10 20 20">
    <rect x={-9} y={-9} width={18} height={18} rx={3} fill={COLOR.text} />
    {PIPS[n].map(([x, y], i) => (
      <circle key={i} cx={x * 5} cy={y * 5} r={1.8} fill="#10141f" />
    ))}
  </svg>
);

// 1つの画素を16秒ごとに測り直すと、値が真の値のまわりでばらつく
const Phenomenon: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [count, every] = [34, 9];
  const n = Math.min(count - 1, Math.max(0, Math.floor((frame - 20) / every)));
  const [gw, gh, pad] = [1260, 640, 60];
  const px = (i: number) => pad + 40 + i * 30;
  const py = (v: number) => 300 - v * 95;
  // 点に重なっても読めるよう、文字を背景色で縁取る
  const outlined = { paintOrder: "stroke" as const, stroke: COLOR.bg, strokeWidth: 12 };
  const t = lineAt(scene, 1);
  const cell = 76;
  // 高く出た回と低く出た回を1つずつ指す
  const hiAt = PIXEL.findIndex((v, i) => i > 1 && i < 12 && v > 0.9);
  const loAt = PIXEL.findIndex((v, i) => i > 1 && i < 14 && v < -0.9);
  return (
    <Stage chapter={chapter} title="同じ画素を何回も撮ると">
      <div style={{ display: "flex", gap: 50, alignItems: "flex-start", height: "100%" }}>
        <div style={{ width: 460, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 20 }}>
          <svg width={cell * 5} height={cell * 5} style={{ borderRadius: 8 }}>
            {Array.from({ length: 25 }, (_, i) => {
              const v = 108 + 30 * (i === 12 ? PIXEL[n] : gauss(n, i, 31));
              return <rect key={i} x={(i % 5) * cell} y={Math.floor(i / 5) * cell} width={cell} height={cell} fill={`rgb(${v},${v + 6},${v + 14})`} stroke="rgba(0,0,0,0.4)" />;
            })}
            <rect x={cell * 2} y={cell * 2} width={cell} height={cell} fill="none" stroke={COLOR.accent} strokeWidth={6} />
          </svg>
          <div style={{ fontSize: 32, color: COLOR.text, textAlign: "center", lineHeight: 1.3 }}>
            同じ1画素を16秒ごとに撮る
            <br />
            <b style={{ color: COLOR.accent, fontSize: 44 }}>{n + 1}</b> 枚目
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            {DICE.slice(0, 5).map((d, i) => (
              <Reveal key={i} at={t + 6 + i * 8}>
                <Dice n={d} size={72} />
              </Reveal>
            ))}
          </div>
        </div>
        <div style={{ position: "relative", width: gw, height: gh }}>
          <svg width={gw} height={gh}>
            <Axes w={gw} h={gh} x="撮った順番" y="その画素の値" pad={pad} />
            <line x1={pad} y1={py(0)} x2={gw - 10} y2={py(0)} stroke={COLOR.good} strokeWidth={4} strokeDasharray="12 9" />
            <text x={gw - 6} y={py(0) - 14} fill={COLOR.good} fontSize={34} fontWeight={700} textAnchor="end">
              真の値
            </text>
            {PIXEL.slice(0, count).map((v, i) => {
              const p = ramp(frame, 20 + i * every, 8);
              return (
                <g key={i} opacity={p}>
                  <line x1={px(i)} y1={py(0)} x2={px(i)} y2={py(v)} stroke={COLOR.accent} strokeWidth={3} opacity={0.4} />
                  <circle cx={px(i)} cy={py(v)} r={i === n ? 15 : 10} fill={i === n ? COLOR.text : COLOR.accent} />
                </g>
              );
            })}
            {hiAt >= 0 && (
              <text x={px(hiAt)} y={py(PIXEL[hiAt]) - 26} textAnchor="middle" style={outlined} fill={COLOR.warn} fontSize={36} fontWeight={700} opacity={ramp(frame, 20 + hiAt * every + 6, 10)}>
                高く出る
              </text>
            )}
            {loAt >= 0 && (
              <text x={px(loAt)} y={py(PIXEL[loAt]) + 54} textAnchor="middle" style={outlined} fill={COLOR.warn} fontSize={36} fontWeight={700} opacity={ramp(frame, 20 + loAt * every + 6, 10)}>
                低く出る
              </text>
            )}
          </svg>
          <Kind style={{ bottom: "auto", top: 0 }} />
        </div>
      </div>
    </Stage>
  );
};

// 1回ごとの値の点と、そこまでの平均の線。平均が目標の破線へ寄っていく
const RunPlot = ({ values, shown, lo, hi, target, targetLabel, title, ticks }: { values: number[]; shown: number; lo: number; hi: number; target: number; targetLabel: string; title: string; ticks?: number[] }) => {
  const [w, h, pad] = [860, 470, 60];
  const px = (i: number) => pad + 24 + (i / (values.length - 1)) * (w - pad - 60);
  const py = (v: number) => h - pad - 20 - ((v - lo) / (hi - lo)) * (h - pad - 60);
  let sum = 0;
  const avg = values.map((v, i) => (sum += v) / (i + 1));
  const k = Math.max(0, Math.min(values.length, Math.floor(shown)));
  return (
    <div>
      <div style={{ fontSize: 38, fontWeight: 700, color: COLOR.text, marginBottom: 6, textAlign: "center" }}>{title}</div>
      <svg width={w} height={h}>
        <Axes w={w} h={h} x="回数" y="値" pad={pad} />
        {ticks?.map((v) => (
          <text key={v} x={pad - 12} y={py(v) + 10} fill={COLOR.dim} fontSize={28} textAnchor="end">
            {v}
          </text>
        ))}
        <line x1={pad} y1={py(target)} x2={w - 10} y2={py(target)} stroke={COLOR.good} strokeWidth={4} strokeDasharray="12 9" />
        <text x={w - 14} y={py(target) - 30} fill={COLOR.good} fontSize={36} fontWeight={800} textAnchor="end" style={{ paintOrder: "stroke", stroke: COLOR.bg, strokeWidth: 12 }}>
          {targetLabel}
        </text>
        {values.slice(0, k).map((v, i) => (
          <circle key={i} cx={px(i)} cy={py(v)} r={7} fill={COLOR.dim} />
        ))}
        {k > 0 && <path d={avg.slice(0, k).map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ")} fill="none" stroke={COLOR.warn} strokeWidth={6} strokeLinejoin="round" />}
        {k > 0 && <circle cx={px(k - 1)} cy={py(avg[k - 1])} r={12} fill={COLOR.warn} />}
      </svg>
    </div>
  );
};

// サイコロの平均が 3.5 に寄るのと同じく、画素の値の平均も真の値に寄る = スタック
const Idea: SceneView = ({ chapter }) => {
  const frame = useCurrentFrame();
  return (
    <Stage chapter={chapter} title="たくさん撮って平均する">
      <div style={{ display: "flex", gap: 60, justifyContent: "center" }}>
        <RunPlot values={DICE} shown={tween(frame, 12, 125, 0, 60)} lo={0.5} hi={6.5} target={3.5} targetLabel="3.5" title="サイコロを振って平均" ticks={[1, 2, 3, 4, 5, 6]} />
        <div style={{ opacity: ramp(frame, 150, 15) }}>
          <RunPlot values={PIXEL} shown={tween(frame, 170, 110, 0, 60)} lo={-3} hi={3} target={0} targetLabel="真の値" title="同じ画素を何枚も撮って平均" />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: 540, display: "flex", gap: 30, alignItems: "center", fontSize: 30, color: COLOR.text }}>
        <svg width={30} height={30}>
          <circle cx={15} cy={15} r={8} fill={COLOR.dim} />
        </svg>
        1回ごとの値
        <svg width={60} height={30}>
          <line x1={0} y1={15} x2={60} y2={15} stroke={COLOR.warn} strokeWidth={6} />
        </svg>
        そこまでの平均
      </div>
      <Reveal at={285} style={{ position: "absolute", left: 0, right: 0, top: 590, display: "flex", justifyContent: "center" }}>
        <Card color={COLOR.accent} style={{ fontSize: 44, fontWeight: 700, padding: "14px 34px" }}>
          何枚も撮って、画素ごとに平均する = <span style={{ color: COLOR.accent }}>スタック</span>
        </Card>
      </Reveal>
      <Kind style={{ bottom: 0, right: 0 }} />
    </Stage>
  );
};

const COUNTS = [1, 4, 16, 64, 256];
const FRACTIONS = ["1", "1/2", "1/4", "1/8", "1/16"];
const PATCH_SCALE = 8;
const PATCH_VIEW = { lo: 1, hi: 9 };
// パッチの中のホットピクセルを丸で囲む
const HotRings = ({ at }: { at: number }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, 14);
  const pulse = 1 + 0.07 * Math.sin(frame / 6);
  return (
    <>
      {hotIn(PATCH, 2).map((h, i) => (
        <div key={i} style={{ position: "absolute", left: (h.x - PATCH.x + 0.5) * PATCH_SCALE - 30, top: (h.y - PATCH.y + 0.5) * PATCH_SCALE - 30, width: 60, height: 60, borderRadius: 30, border: `5px solid ${COLOR.warn}`, boxSizing: "border-box", opacity: p, transform: `scale(${(1.7 - 0.7 * p) * pulse})` }} />
      ))}
    </>
  );
};

// 星空のパッチを 1・4・16・64・256 枚と平均していき、横にノイズの量の棒を並べる
const Algorithm: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const starts = [0, 135, 180, lineAt(scene, 1) + 10, lineAt(scene, 1) + 90];
  const images = useMemo(() => COUNTS.map((n, i) => rawFrame({ stack: n, shot: i + 1, vignette: 0 })), []);
  const step = starts.reduce((s, at, i) => (frame >= at ? i : s), 0);
  const k = step ? ramp(frame, starts[step], 12) : 1;
  const image = useMemo(() => mixImage(images[Math.max(0, step - 1)], images[step], k), [images, step, k]);
  const [cw, ch, base, full] = [840, 360, 300, 240];
  return (
    <Stage chapter={chapter} title="枚数とノイズの量">
      <div style={{ display: "flex", gap: 50, alignItems: "center", height: "100%" }}>
        <SimCrop image={image} rect={PATCH} scale={PATCH_SCALE} {...PATCH_VIEW} style={{ flexShrink: 0 }}>
          <Tag style={{ position: "absolute", left: 14, top: 14, fontSize: 44 }}>{COUNTS[step]}枚{step ? "の平均" : ""}</Tag>
          <Kind />
        </SimCrop>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <Reveal at={25}>
            <div style={{ fontSize: 50, fontWeight: 800, color: COLOR.text }}>
              ノイズの量 = <span style={{ color: COLOR.warn }}>1 / √枚数</span>
            </div>
          </Reveal>
          <div style={{ display: "flex", gap: 16, height: 56 }}>
            <Reveal at={222}>
              <Tag style={{ fontSize: 32 }}>100枚なら 1/10</Tag>
            </Reveal>
            <Reveal at={lineAt(scene, 1) + 20}>
              <Tag color={COLOR.tsumugi} style={{ fontSize: 32 }}>
                半分にするには、枚数を4倍
              </Tag>
            </Reveal>
          </div>
          <svg width={cw} height={ch}>
            <line x1={20} y1={base} x2={cw - 10} y2={base} stroke={COLOR.dim} strokeWidth={3} />
            {COUNTS.map((n, i) => {
              const p = ramp(frame, starts[i], 14);
              const h = (full / 2 ** i) * p;
              const x = 50 + i * 160;
              return (
                <g key={n} opacity={p}>
                  <rect x={x} y={base - h} width={100} height={h} fill={i === step ? COLOR.warn : COLOR.accent} opacity={i === step ? 1 : 0.55} />
                  <text x={x + 50} y={base - h - 14} fill={COLOR.text} fontSize={40} fontWeight={800} textAnchor="middle">
                    {FRACTIONS[i]}
                  </text>
                  <text x={x + 50} y={base + 44} fill={i === step ? COLOR.warn : COLOR.dim} fontSize={34} fontWeight={700} textAnchor="middle">
                    {n}枚
                  </text>
                </g>
              );
            })}
          </svg>
          <Reveal at={lineAt(scene, 2) + 10}>
            <Card color={COLOR.good} style={{ fontSize: 40, fontWeight: 700 }}>
              だから、放置して<span style={{ color: COLOR.good }}>何百枚も</span>撮り続ける
            </Card>
          </Reveal>
        </div>
      </div>
    </Stage>
  );
};

// 小さな点列と平均の線。offset を足すと「毎回同じだけ高い」画素になる
const MiniPlot = ({ offset, spread, at, color, label }: { offset: number; spread: number; at: number; color: string; label: string }) => {
  const frame = useCurrentFrame();
  const [w, h, count] = [840, 176, 32];
  const px = (i: number) => 30 + i * 18;
  const py = (v: number) => 124 - v * 26;
  const values = Array.from({ length: count }, (_, i) => offset + spread * gauss(i, 41, offset ? 2 : 1));
  const k = Math.floor(tween(frame, at, 70, 0, count));
  let sum = 0;
  const avg = values.map((v, i) => (sum += v) / (i + 1));
  return (
    <svg width={w} height={h}>
      <line x1={10} y1={py(0)} x2={620} y2={py(0)} stroke={COLOR.good} strokeWidth={3} strokeDasharray="10 8" />
      <text x={16} y={py(0) + 34} fill={COLOR.good} fontSize={28}>
        真の値
      </text>
      {values.slice(0, k).map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v)} r={6} fill={COLOR.dim} />
      ))}
      {k > 0 && <path d={avg.slice(0, k).map((v, i) => `${i ? "L" : "M"}${px(i)},${py(v).toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth={6} />}
      <text x={632} y={py(avg[count - 1]) + 12} fill={color} fontSize={32} fontWeight={700} opacity={ramp(frame, at + 70, 12)}>
        {label}
      </text>
    </svg>
  );
};

// 256枚平均しても、ホットピクセルと光害の勾配は残る。1枚と見比べる
const Remains: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const one = useMemo(() => rawFrame({ stack: 1, shot: 1, vignette: 0 }), []);
  const many = useMemo(() => rawFrame({ stack: 256, shot: 5, vignette: 0 }), []);
  const t = lineAt(scene, 1);
  const [w, h] = [PATCH.w * PATCH_SCALE, PATCH.h * PATCH_SCALE];
  // 左から「1枚」をかぶせて見比べる境界
  const split = frame < t + 60 ? 0 : 0.3 * (1 - Math.cos((frame - t - 60) / 32));
  return (
    <Stage chapter={chapter} title="平均しても減らないもの">
      <div style={{ display: "flex", gap: 50, alignItems: "center", height: "100%" }}>
        <div style={{ position: "relative", width: w, height: h, flexShrink: 0 }}>
          <SimCrop image={many} rect={PATCH} scale={PATCH_SCALE} {...PATCH_VIEW} />
          <div style={{ position: "absolute", left: 0, top: 0, width: w * split, height: h, overflow: "hidden" }}>
            <SimCrop image={one} rect={PATCH} scale={PATCH_SCALE} {...PATCH_VIEW} />
          </div>
          <div style={{ position: "absolute", left: w * split - 2, top: 0, width: 4, height: h, background: "#fff", opacity: split > 0.004 ? 1 : 0 }} />
          <HotRings at={18} />
          <Tag style={{ position: "absolute", left: 14, top: 14, fontSize: 36, opacity: split > 0.2 ? 1 : 0 }}>1枚</Tag>
          <Tag style={{ position: "absolute", right: 14, top: 14, fontSize: 36 }}>256枚の平均</Tag>
          <Tag color={COLOR.warn} style={{ position: "absolute", left: 14, bottom: 14, opacity: ramp(frame, t + 150, 14) }}>
            下が明るい光害の勾配も、そのまま
          </Tag>
          <Kind />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <Reveal at={t + 10}>
            <div style={{ fontSize: 36, fontWeight: 700, color: COLOR.text }}>ふつうの画素: 毎回ばらつく</div>
            <MiniPlot offset={0} spread={1} at={t + 20} color={COLOR.good} label="平均で減る" />
          </Reveal>
          <Reveal at={t + 80}>
            <div style={{ fontSize: 36, fontWeight: 700, color: COLOR.bad }}>ホットピクセル: 毎回同じだけ高い</div>
            <MiniPlot offset={2.8} spread={0.45} at={t + 90} color={COLOR.bad} label="高いまま残る" />
          </Reveal>
          <Reveal at={t + 180}>
            <Card color={COLOR.warn} style={{ fontSize: 34 }}>
              毎回同じ場所に、同じように出るものは
              <br />
              <b style={{ color: COLOR.warn }}>いくら平均しても残る</b>
            </Card>
          </Reveal>
        </div>
      </div>
    </Stage>
  );
};

// 温度の場面の、光を当てていないセンサーの画素
const GRID = { cols: 20, rows: 12, cell: 36 };
const CELLS = Array.from({ length: GRID.cols * GRID.rows }, (_, i) => {
  const prone = hash(i, 3, 77) < 0.035; // 電気がたまりやすい画素
  const tint = hash(i, 6, 77);
  return { prone, leak: prone ? 0.25 + 0.35 * hash(i, 4, 77) : 0.002 + 0.014 * hash(i, 5, 77) ** 2, color: tint < 0.6 ? [255, 96, 96] : tint < 0.8 ? [100, 150, 255] : [110, 225, 120] };
});

// 温度計。level 0〜1、0℃ の目盛りは level 0.2
const Thermometer = ({ level }: { level: number }) => {
  const y = 460 - level * 430;
  const c = [90 + 165 * level, 140 - 50 * level, 255 - 165 * level].map(Math.round).join(",");
  return (
    <svg width={170} height={560}>
      <rect x={45} y={20} width={40} height={470} rx={20} fill={COLOR.panel} stroke={COLOR.dim} strokeWidth={4} />
      <circle cx={65} cy={505} r={40} fill={`rgb(${c})`} stroke={COLOR.dim} strokeWidth={4} />
      <rect x={53} y={y} width={24} height={500 - y} fill={`rgb(${c})`} />
      <line x1={85} y1={374} x2={106} y2={374} stroke={COLOR.text} strokeWidth={4} />
      <text x={112} y={385} fill={COLOR.text} fontSize={30} fontWeight={700}>
        0℃
      </text>
    </svg>
  );
};

// 熱を持ったスマホ
const HotPhone = ({ frame }: { frame: number }) => (
  <svg width={110} height={120}>
    <rect x={32} y={30} width={46} height={86} rx={8} fill={COLOR.panel} stroke={COLOR.text} strokeWidth={4} />
    {[0, 1, 2].map((i) => {
      const d = Math.sin(frame / 7 + i) * 4;
      return <path key={i} d={`M${40 + i * 15},24 q${-6 + d},-6 0,-12 q${6 - d},-6 0,-12`} fill="none" stroke={COLOR.bad} strokeWidth={4} strokeLinecap="round" />;
    })}
  </svg>
);

// センサーの温度が上がるとホットピクセルが増え、冷やすと減る。最後は冷やせないスマホに戻る
const Temperature: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [t1, t2, t4] = [lineAt(scene, 1), lineAt(scene, 2), lineAt(scene, 4)];
  const [cool, half, phone] = [t4 + 50, t4 + 180, t4 + 320];
  const level = frame < cool ? tween(frame, 30, 290, 0.35, 0.9) : frame < phone ? tween(frame, cool, 120, 0.9, 0.08) : tween(frame, phone + 10, 80, 0.08, 0.85);
  const exposure = tween(frame, t2 + 10, 100, 1, 2.5);
  const factor = 2 ** ((level - 0.45) * 6.67) * exposure;
  const { cols, rows, cell } = GRID;
  const mark = ramp(frame, 250, 12) * (1 - ramp(frame, t1 - 10, 12));
  const panelA = 1 - ramp(frame, t4 - 14, 12);
  const small = { fontSize: 34, padding: "14px 24px" };
  const row = (children: ReactNode) => <div style={{ display: "flex", alignItems: "center", gap: 18 }}>{children}</div>;
  return (
    <Stage chapter={chapter} title="ホットピクセルの正体は「熱」">
      <div style={{ position: "absolute", left: 0, top: 30 }}>
        <div style={{ fontSize: 32, color: COLOR.text, marginBottom: 10 }}>
          センサーの画素(<b style={{ color: COLOR.accent }}>光は当てていない</b>)
        </div>
        <svg width={cols * cell} height={rows * cell} style={{ borderRadius: 8, display: "block" }}>
          {CELLS.map((c, i) => {
            const v = Math.pow(Math.min(1, c.leak * factor), 0.85);
            const rgb = [16, 20, 31].map((b, k) => Math.round(b + (c.color[k] - b) * v)).join(",");
            return <rect key={i} x={(i % cols) * cell} y={Math.floor(i / cols) * cell} width={cell} height={cell} fill={`rgb(${rgb})`} stroke="#05070d" strokeWidth={2} />;
          })}
          {CELLS.map((c, i) => (c.prone ? <rect key={i} x={(i % cols) * cell - 5} y={Math.floor(i / cols) * cell - 5} width={cell + 10} height={cell + 10} fill="none" stroke={COLOR.warn} strokeWidth={4} opacity={mark} /> : null))}
        </svg>
        <div style={{ position: "relative", height: 60 }}>
          <Kind style={{ right: 0, bottom: 0 }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 750, top: 20 }}>
        <div style={{ fontSize: 30, color: COLOR.text, textAlign: "center", width: 130 }}>温度</div>
        <Thermometer level={level} />
      </div>
      <div style={{ position: "absolute", left: 940, top: 30, width: 860, display: "flex", flexDirection: "column", gap: 16, opacity: panelA }}>
        <Reveal at={70}>
          <Card style={small}>
            センサーが温まると、光が当たらなくても
            <br />
            <b style={{ color: COLOR.warn }}>勝手に電気がたまる</b>
          </Card>
        </Reveal>
        <Reveal at={250}>
          <Card color={COLOR.bad} style={small}>
            特にたまりやすい画素 = <b style={{ color: COLOR.bad }}>ホットピクセル</b>
          </Card>
        </Reveal>
        <Reveal at={t1 + 10}>
          <Card style={{ ...small, padding: "6px 24px" }}>
            {row(
              <>
                <HotPhone frame={frame} />
                長くカメラを使うと、スマホは熱くなる
              </>,
            )}
          </Card>
        </Reveal>
        <Reveal at={t2 + 10}>
          <Card color={COLOR.warn} style={small}>
            <b style={{ color: COLOR.warn }}>長時間露光</b>ほど、熱の影響が大きい
            {row(
              <>
                <span style={{ fontSize: 30, color: COLOR.dim }}>露光時間</span>
                <div style={{ height: 22, borderRadius: 11, background: COLOR.warn, width: 120 + 180 * exposure }} />
              </>,
            )}
          </Card>
        </Reveal>
      </div>
      <div style={{ position: "absolute", left: 940, top: 30, width: 860, display: "flex", flexDirection: "column", gap: 16, opacity: 1 - panelA }}>
        <Reveal at={t4 + 20}>
          <Card color={COLOR.accent} style={small}>
            天体写真専用のカメラ: 冷却装置でセンサーを
            <br />
            <b style={{ color: COLOR.accent }}>氷点下まで冷やす</b>
          </Card>
        </Reveal>
        <Reveal at={half}>
          <Card style={small}>
            温度が <b style={{ color: COLOR.accent }}>6〜8度</b> 下がるごとに、熱でたまる電気は<b style={{ color: COLOR.accent }}>およそ半分</b>
            <svg width={800} height={196} style={{ display: "block", marginTop: 6 }}>
              <line x1={10} y1={190} x2={790} y2={190} stroke={COLOR.dim} strokeWidth={3} />
              {["1", "1/2", "1/4", "1/8"].map((label, i) => {
                const p = ramp(frame, half + 20 + i * 22, 14);
                const h = (140 / 2 ** i) * p;
                const x = 40 + i * 210;
                return (
                  <g key={label} opacity={p}>
                    <rect x={x} y={190 - h} width={70} height={h} fill={COLOR.bad} />
                    <text x={x + 35} y={190 - h - 10} fill={COLOR.text} fontSize={34} fontWeight={800} textAnchor="middle">
                      {label}
                    </text>
                    {i > 0 && (
                      <g>
                        <text x={x - 70} y={104} fill={COLOR.accent} fontSize={28} textAnchor="middle">
                          6〜8度
                        </text>
                        <path d={`M${x - 120},118 L${x - 22},118 M${x - 36},108 L${x - 22},118 L${x - 36},128`} fill="none" stroke={COLOR.accent} strokeWidth={4} />
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </Card>
        </Reveal>
        <Reveal at={phone}>
          <Card color={COLOR.good} style={small}>
            スマホに冷却装置はない → <b style={{ color: COLOR.good }}>計算で取り除く</b>
          </Card>
        </Reveal>
      </div>
    </Stage>
  );
};

const Arrow = () => (
  <svg width={100} height={60}>
    <path d="M6,30 L86,30 M64,10 L88,30 L64,50" fill="none" stroke={COLOR.dim} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ばらつくものは重ねて平均で解決。同じ場所に出るものは「?」のまま残る
const Bridge: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const t = lineAt(scene, 1);
  const check = ramp(frame, 80, 18);
  const pile = ramp(frame, t + 20, 50);
  const head = { fontSize: 46, fontWeight: 800 };
  return (
    <Stage chapter={chapter} title="ここまでの整理">
      <div style={{ display: "flex", flexDirection: "column", gap: 60, paddingTop: 40 }}>
        <Reveal at={10}>
          <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
            <Card color={COLOR.warn} style={{ width: 720 }}>
              <div style={{ ...head, color: COLOR.warn }}>ばらつくもの</div>
              ノイズ
            </Card>
            <Arrow />
            <Card color={COLOR.good} style={{ width: 520, ...head }}>
              重ねて平均する
            </Card>
            <svg width={100} height={100} viewBox="0 0 100 100">
              <circle cx={50} cy={50} r={44} fill="none" stroke={COLOR.good} strokeWidth={8} opacity={check} />
              <path d="M26,52 L44,70 L76,34" fill="none" stroke={COLOR.good} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={80} strokeDashoffset={80 * (1 - check)} />
            </svg>
          </div>
        </Reveal>
        <Reveal at={130}>
          <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
            <Card color={COLOR.accent} style={{ width: 720 }}>
              <div style={{ ...head, color: COLOR.accent }}>同じ場所に出るもの</div>
              光害・周辺減光・ホットピクセル
            </Card>
            <Arrow />
            <Card color={COLOR.dim} style={{ width: 520, ...head, borderStyle: "dashed" }}>
              別の方法が必要
            </Card>
            <div style={{ width: 100, textAlign: "center", fontSize: 96, fontWeight: 800, color: COLOR.warn, transform: `scale(${1 + 0.12 * Math.sin(frame / 7)})` }}>？</div>
          </div>
        </Reveal>
        <Reveal at={t + 6}>
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            <div style={{ position: "relative", width: 700, height: 110 }}>
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} style={{ position: "absolute", left: i * 72 * (1 - pile) + (300 + i * 5) * pile, top: 24 - i * 3 * pile, width: 110, height: 70, borderRadius: 8, background: "#141c33", border: `3px solid ${COLOR.accent}`, boxSizing: "border-box" }} />
              ))}
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, color: COLOR.tsumugi }}>ひとまず、全部の写真を重ねてみる</div>
          </div>
        </Reveal>
      </div>
    </Stage>
  );
};

export const ch04: Record<string, SceneView> = {
  "04_stacking/現象": Phenomenon,
  "04_stacking/アイデア": Idea,
  "04_stacking/アルゴリズム": Algorithm,
  "04_stacking/減らないもの": Remains,
  "04_stacking/温度": Temperature,
  "04_stacking/次への橋渡し": Bridge,
};
