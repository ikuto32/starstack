import { useMemo, type CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { SimSky } from "../components/SimSky";
import { Card, Reveal, Stage, Tag, Wipe } from "../components/ui";
import frames from "../data/frames.json";
import { hash } from "../sim/rng";
import { SIM, hotPixels, isHouse, rawFrame, starField, staticScene, vignetteAt } from "../sim/sky";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp } from "../timing";
import type { SceneView } from "../types";
import { Arrow, At, Caption, Label, Note, Steps, combine, fade, linear, mix, scaler } from "./ch06_parts";

// 連写の早送り。SHOT フレームごとに次の1枚へ進み、星空が STEP ずつ回る
const SHOT = 3;
const STEP = 0.0022;
const useShot = (start = 0) => {
  const shot = start + Math.floor(useCurrentFrame() / SHOT);
  return { shot, angle: shot * STEP };
};

const FIXES = ["黒レベル", "RAWの補正情報", "ホットピクセル除外"];

// 連写の早送り。星だけが流れ、景色・空の明るさ・ホットピクセルは動かない
const Phenomenon: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const { shot, angle } = useShot();
  const image = useMemo(() => rawFrame({ angle, shot, house: true }), [shot, angle]);
  const scale = 4.4;
  // 空に出ている赤いホットピクセルに印を付ける
  const marks = useMemo(() => hotPixels.filter((p) => p.channel === 0 && !isHouse(p.x, p.y)).slice(0, 5), []);
  const ring = ramp(frame, lineAt(scene, 1) + 60, 15);
  return (
    <Stage chapter={chapter}>
      <At x={0} y={28} w={SIM.w * scale} h={SIM.h * scale}>
        <SimSky image={image} scale={scale} style={{ display: "block" }} />
        <svg width={SIM.w * scale} height={SIM.h * scale} style={{ position: "absolute", left: 0, top: 0 }}>
          {marks.map((p) => (
            <circle key={`${p.x}-${p.y}`} cx={(p.x + 0.5) * scale} cy={(p.y + 0.5) * scale} r={mix(34, 17, ring)} fill="none" stroke={COLOR.bad} strokeWidth={4} opacity={ring} />
          ))}
        </svg>
        <Tag style={{ position: "absolute", left: 12, top: 12 }}>早送り {shot + 1}枚目</Tag>
        <Note kind="模式図" />
      </At>
      <At x={1170} y={28} w={630} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Reveal at={lineAt(scene, 1)}>
          <Card color={COLOR.accent}>
            動いている: <b style={{ color: COLOR.accent, fontSize: 46 }}>星</b>
          </Card>
        </Reveal>
        <Reveal at={lineAt(scene, 1) + 50}>
          <Card>
            動いていない:
            <div style={{ fontWeight: 700, paddingLeft: 24 }}>
              <div>景色</div>
              <div>空の明るさ(光害)</div>
              <div style={{ color: COLOR.bad }}>ホットピクセル</div>
            </div>
          </Card>
        </Reveal>
        <Reveal at={lineAt(scene, 2) + 20}>
          <Card color={COLOR.good}>
            毎回同じ場所に出るものは、<b style={{ color: COLOR.good }}>動かない</b>
          </Card>
        </Reveal>
      </At>
    </Stage>
  );
};

// 「動かないもの」の小さな絵
const Icon = ({ kind }: { kind: number }) => (
  <svg width={84} height={64} viewBox="0 0 84 64" style={{ flexShrink: 0, borderRadius: 8 }}>
    <defs>
      <linearGradient id="ch06-glow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#101830" />
        <stop offset="1" stopColor="#c9a66b" />
      </linearGradient>
      <radialGradient id="ch06-vig" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.2" stopColor="#8fa3c8" />
        <stop offset="1" stopColor="#0a0e18" />
      </radialGradient>
    </defs>
    <rect width={84} height={64} fill={kind === 1 ? "url(#ch06-glow)" : kind === 2 ? "url(#ch06-vig)" : "#131b33"} />
    {kind === 0 && <path d="M0 64 V52 H14 V36 L34 20 L54 36 V52 H84 V64 Z" fill="#05070d" />}
    {kind === 3 && [[20, 18], [56, 30], [36, 46]].map(([x, y]) => <rect key={x} x={x} y={y} width={7} height={7} fill={COLOR.bad} />)}
  </svg>
);

// 動かないものと、星と一緒に動くもの。引き算すれば星だけが残る
const Idea: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const ask = ramp(frame, lineAt(scene, 1), 15);
  const still = ["前景", "光害", "周辺減光", "ホットピクセル"];
  const dots = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ x: hash(i, 1) * 760, y: 20 + hash(i, 2) * 190, r: 2.5 + 4 * hash(i, 3) ** 3 })), []);
  const box: CSSProperties = { width: 860, height: 380, boxSizing: "border-box", padding: "24px 32px" };
  const term = (text: string, color: string) => (
    <div style={{ border: `3px solid ${color}`, borderRadius: 16, padding: "14px 28px", background: COLOR.panel, fontSize: 40, fontWeight: 700, color: COLOR.text }}>{text}</div>
  );
  return (
    <Stage chapter={chapter}>
      <div style={{ display: "flex", gap: 80 }}>
        <Reveal at={4}>
          <Card style={box}>
            <div style={{ fontSize: 46, fontWeight: 800, marginBottom: 18 }}>動かないもの</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "26px 20px" }}>
              {still.map((name, i) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 600 }}>
                  <Icon kind={i} />
                  {name}
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
        <Reveal at={22}>
          <Card color={COLOR.accent} style={box}>
            <div style={{ fontSize: 46, fontWeight: 800, marginBottom: 14 }}>
              星と一緒に動くもの: <span style={{ color: COLOR.accent }}>星</span>
            </div>
            <svg width={790} height={230} style={{ background: "#070b16", borderRadius: 10 }}>
              {dots.map((d, i) => (
                <circle key={i} cx={(((d.x - frame * 0.9) % 790) + 790) % 790} cy={d.y - 8 * Math.sin(((d.x - frame * 0.9) / 790) * Math.PI)} r={d.r} fill="#fff" />
              ))}
            </svg>
          </Card>
        </Reveal>
      </div>
      <At x={0} y={440} w={STAGE.w}>
        <Reveal at={70}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 30, fontSize: 64, fontWeight: 800, color: COLOR.text }}>
            {term("元の写真", COLOR.line)}−{term("動かないものだけの画像", ask > 0.5 ? COLOR.warn : COLOR.line)}={term("星だけ", COLOR.accent)}
          </div>
        </Reveal>
        <div style={{ textAlign: "center", marginTop: 26, fontSize: 44, fontWeight: 700, color: COLOR.warn, opacity: ask, transform: `translateY(${(1 - ask) * 14}px)` }}>どうやって作る？ 星が出ていない夜はない</div>
      </At>
    </Stage>
  );
};

// 1つの画素の値を全フレームぶん並べ、並べ替えると星の値が端に寄ることを見せる
const Median: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const values = frames.series[0].values;
  const n = values.length;
  const { rank, median, mean } = useMemo(() => {
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    const rank = new Array<number>(n);
    order.forEach((index, r) => (rank[index] = r));
    return { rank, median: (values[order[n / 2 - 1]] + values[order[n / 2]]) / 2, mean: values.reduce((a, b) => a + b, 0) / n };
  }, [values, n]);
  const [l2, l3] = [lineAt(scene, 2), lineAt(scene, 3)];
  const zoom = ramp(frame, l2, 40); // 縦軸を拡大する
  const sorted = ramp(frame, l2 + 70, 60) - ramp(frame, l3, 45); // 小さい順に並べ替え、最後に元へ戻す
  const shown = linear(frame, 8, 130) * n;
  const [x0, x1, yBottom, yTop] = [130, 1770, 590, 50];
  const x = scaler(0, n, x0, x1);
  const y = scaler(0, mix(2100, 380, zoom), yBottom, yTop);
  const bar = (x1 - x0) / n;
  const color = (i: number) => (i >= 194 && i <= 196 ? COLOR.warn : i >= 256 && i <= 352 ? "#7a86a8" : COLOR.accent);
  const peak = fade(frame, 150, l2 + 70) * (1 - zoom);
  const lines = ramp(frame, l2 + 150, 20);
  const meanLine = ramp(frame, l3 + 50, 20);
  return (
    <Stage chapter={chapter} title="1つの画素の明るさを、全部のフレームで追う">
      <svg width={STAGE.w} height={STAGE.h}>
        <defs>
          <clipPath id="ch06-plot">
            <rect x={x0} y={yTop - 14} width={x1 - x0} height={yBottom - yTop + 14} />
          </clipPath>
        </defs>
        {/* 縦軸の目盛り。拡大の前後で切り替える */}
        {[0, 500, 1000, 1500, 2000].map((v) => (
          <g key={`a${v}`} opacity={v === 0 ? 1 : 1 - zoom}>
            <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} stroke={COLOR.line} strokeWidth={v === 0 ? 3 : 1.5} />
            <text x={x0 - 14} y={y(v) + 10} fontSize={28} fill={COLOR.dim} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {[100, 200, 300].map((v) => (
          <g key={`b${v}`} opacity={zoom}>
            <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} stroke={COLOR.line} strokeWidth={1.5} />
            <text x={x0 - 14} y={y(v) + 10} fontSize={28} fill={COLOR.dim} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text transform={`translate(34 ${(yBottom + yTop) / 2}) rotate(-90)`} fontSize={30} fill={COLOR.dim} textAnchor="middle">
          画素の値
        </text>
        <g clipPath="url(#ch06-plot)">
          {values.map((v, i) => {
            if (i > shown) return null;
            const top = y(v);
            return <rect key={i} x={x(mix(i, rank[i], sorted))} y={top} width={bar + 0.4} height={Math.max(0, yBottom - top)} fill={color(i)} />;
          })}
        </g>
        {/* 横軸 */}
        {[0, 100, 200, 300].map((v) => (
          <text key={v} x={x(v)} y={yBottom + 34} fontSize={28} fill={COLOR.dim} textAnchor="middle" opacity={1 - sorted}>
            {v}
          </text>
        ))}
        <text x={(x0 + x1) / 2} y={yBottom + 76} fontSize={32} fill={COLOR.dim} textAnchor="middle" opacity={1 - sorted}>
          フレーム番号(撮影開始からの枚数)
        </text>
        <text x={(x0 + x1) / 2} y={yBottom + 76} fontSize={36} fontWeight={700} fill={COLOR.text} textAnchor="middle" opacity={sorted}>
          値の小さい順に並べ替え →
        </text>
        {/* 星が通った山 */}
        <Arrow from={[x(195) + 150, 96]} to={[x(195) + 16, y(1900) + 8]} color={COLOR.warn} opacity={peak} />
        <Label x={x(195) + 162} y={108} size={40} color={COLOR.warn} opacity={peak}>
          星が通った数フレームだけ明るい
        </Label>
        <Label x={x(195) + 26} y={yTop + 34} size={32} color={COLOR.warn} opacity={zoom * (1 - sorted)}>
          ↑ 星(最大 約1950)
        </Label>
        <Label x={x(304)} y={y(mix(520, 362, zoom))} size={32} color="#a9b4d4" anchor="middle" opacity={fade(frame, 215, l2 + 70) + ramp(frame, l3 + 30, 15)}>
          雲がかかったフレーム
        </Label>
        {/* 並べ替えたときの真ん中 */}
        <g opacity={Math.max(0, sorted)}>
          <line x1={x(n / 2)} x2={x(n / 2)} y1={yTop + 110} y2={yBottom} stroke={COLOR.good} strokeWidth={4} strokeDasharray="10 8" />
          <Label x={x(n / 2)} y={yTop + 96} size={44} color={COLOR.good} anchor="middle">
            真ん中の値 = 中央値
          </Label>
          <Arrow from={[x1 - 150, yTop + 190]} to={[x1 - 10, yTop + 120]} color={COLOR.warn} />
          <Label x={x1 - 160} y={yTop + 230} size={36} color={COLOR.warn} anchor="end">
            星が通った値は端に来る
          </Label>
        </g>
        {/* 中央値と平均 */}
        <g opacity={lines}>
          <line x1={x0} x2={mix(x0, x1, lines)} y1={y(median)} y2={y(median)} stroke={COLOR.good} strokeWidth={5} />
          <Label x={x0 + 20} y={y(median) - 13} size={34} color={COLOR.good} opacity={ramp(frame, l3 + 10, 15)}>
            中央値 約{Math.round(median)}(星に影響されない)
          </Label>
        </g>
        <g opacity={meanLine}>
          <line x1={x0} x2={x1} y1={y(mean)} y2={y(mean)} stroke={COLOR.warn} strokeWidth={4} strokeDasharray="14 10" />
          <Label x={x0 + 20} y={y(mean) - 13} size={34} color={COLOR.warn}>
            平均 約{Math.round(mean)}(星や雲に引っ張られて持ち上がる)
          </Label>
        </g>
      </svg>
      <Note kind="実際のデータ" style={{ top: -66, bottom: "auto", right: 0 }} />
    </Stage>
  );
};

// 全部の画素で中央値を取ると、星のいない「静止シーン」になる
const StaticScene: SceneView = ({ chapter }) => {
  const frame = useCurrentFrame();
  const { shot, angle } = useShot(40);
  const image = useMemo(() => rawFrame({ angle, shot, house: true }), [shot, angle]);
  const still = useMemo(() => staticScene({ house: true }), []);
  const scale = 3.0;
  const [w, h] = [SIM.w * scale, SIM.h * scale];
  const sweep = ramp(frame, 40, 90);
  return (
    <Stage chapter={chapter}>
      <At x={0} y={70} w={w}>
        {/* 後ろに重なった写真の束 */}
        {[2, 1].map((k) => (
          <div key={k} style={{ position: "absolute", left: k * 12, top: -k * 12, width: w, height: h, boxSizing: "border-box", border: `3px solid ${COLOR.line}`, borderRadius: 10, background: COLOR.panel }} />
        ))}
        <div style={{ position: "relative" }}>
          <SimSky image={image} scale={scale} style={{ display: "block" }} />
          <Note kind="模式図" />
        </div>
        <Caption>連写した写真(394枚)</Caption>
      </At>
      <At x={w + 20} y={220} w={STAGE.w - 2 * w - 40} style={{ textAlign: "center", color: COLOR.accent, fontSize: 34, fontWeight: 700, lineHeight: 1.35 }}>
        <div>全部の画素で</div>
        <div style={{ fontSize: 46 }}>中央値</div>
        <svg width={150} height={50}>
          <Arrow from={[8, 25]} to={[142, 25]} color={COLOR.accent} width={8} head={26} />
        </svg>
      </At>
      <At x={STAGE.w - w} y={70} w={w}>
        <div style={{ position: "relative", width: w, height: h, borderRadius: 10, background: COLOR.panel, overflow: "hidden" }}>
          <div style={{ width: w * sweep, height: h, overflow: "hidden" }}>
            <SimSky image={still} scale={scale} style={{ display: "block" }} />
          </div>
          <div style={{ position: "absolute", left: w * sweep - 3, top: 0, width: 6, height: h, background: COLOR.accent, opacity: sweep < 1 ? 1 : 0 }} />
        </div>
        <Caption color={COLOR.good} style={{ opacity: ramp(frame, 60, 15), fontSize: 44 }}>
          静止シーン<span style={{ fontSize: 34, color: COLOR.text }}>(星のいない画像)</span>
        </Caption>
      </At>
    </Stage>
  );
};

// 1枚 − 静止シーン = 星だけ。模式図のあと、実際の画像で前後を見比べる
const Subtract: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const { shot, angle } = useShot(110);
  const still = useMemo(() => staticScene({ house: true }), []);
  const image = useMemo(() => rawFrame({ angle, shot, house: true }), [shot, angle]);
  const stars = useMemo(() => combine(image, still, -1), [image, still]);
  const scale = 2.08;
  const w = SIM.w * scale;
  const real = ramp(frame, lineAt(scene, 1) - 8, 16);
  const split = 0.5 + 0.36 * Math.sin(((frame - lineAt(scene, 1)) / 30) * 1.3);
  const op: CSSProperties = { fontSize: 90, fontWeight: 800, color: COLOR.text, width: 100, textAlign: "center", paddingBottom: 60 };
  return (
    <Stage chapter={chapter}>
      <div style={{ position: "absolute", left: 0, top: 150, width: STAGE.w, display: "flex", alignItems: "center", opacity: 1 - real }}>
        <Reveal at={0} style={{ width: w }}>
          <SimSky image={image} scale={scale} style={{ display: "block" }} />
          <Caption>1枚</Caption>
        </Reveal>
        <div style={{ ...op, opacity: ramp(frame, 22, 12) }}>−</div>
        <Reveal at={22} style={{ width: w }}>
          <SimSky image={still} scale={scale} style={{ display: "block" }} />
          <Caption>静止シーン</Caption>
        </Reveal>
        <div style={{ ...op, opacity: ramp(frame, 55, 12) }}>=</div>
        <Reveal at={55} style={{ width: w }}>
          <SimSky image={stars} lo={0.9} hi={8} scale={scale} style={{ display: "block" }} />
          <Caption color={COLOR.accent}>星だけ</Caption>
        </Reveal>
      </div>
      <Note kind="模式図" style={{ opacity: 1 - real }} />
      <div style={{ position: "absolute", left: 180, top: 15, width: 1500, display: "flex", gap: 60, alignItems: "center", opacity: real }}>
        <div style={{ position: "relative" }}>
          <Wipe left="img/c_raw.jpg" right="img/c_stars.jpg" size={660} split={split} labels={["1枚", "1枚 − 静止シーン"]} />
          <Note kind="実際の画像" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, flex: 1 }}>
          <Reveal at={lineAt(scene, 1) + 20}>
            <Card>空の明るさ(光害)が消える</Card>
          </Reveal>
          <Reveal at={lineAt(scene, 1) + 60}>
            <Card color={COLOR.accent}>
              <b style={{ color: COLOR.accent, fontSize: 46 }}>星だけ</b> が残る
            </Card>
          </Reveal>
        </div>
      </div>
    </Stage>
  );
};

// 光がなくても乗っている台(黒レベル 256)を、全体から引く
const BlackLevel: SceneView = ({ chapter }) => {
  const frame = useCurrentFrame();
  const BLACK = 256;
  // 黒レベルを引いた値(空 6 画素と、星が写った 1 画素)
  const light = [42, 51, 38, 760, 118, 47, 44];
  const lit = 1 - fade(frame, 150, 350, 30); // 真っ暗にしたときは光の分が 0 になる
  const sub = ramp(frame, 430, 50); // 256 を引く
  const [x0, yBottom, yTop, bw, gap] = [130, 600, 110, 96, 44];
  const y = scaler(0, 1100, yBottom, yTop);
  const grow = ramp(frame, 20, 40);
  const pedestal = ramp(frame, 150, 20);
  return (
    <Stage chapter={chapter}>
      <Steps label="細かい補正" items={FIXES} active={0} />
      <svg width={1120} height={STAGE.h} style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          <clipPath id="ch06-bars">
            <rect x={0} y={0} width={1120} height={yBottom} />
          </clipPath>
        </defs>
        {[0, 250, 500, 750, 1000].map((v) => (
          <g key={v}>
            <line x1={x0 - 20} x2={1110} y1={y(v)} y2={y(v)} stroke={COLOR.line} strokeWidth={v === 0 ? 3 : 1.5} />
            <text x={x0 - 30} y={y(v) + 10} fontSize={28} fill={COLOR.dim} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <g clipPath="url(#ch06-bars)">
          {light.map((v, i) => {
            const bx = x0 + 20 + i * (bw + gap);
            const base = BLACK * (1 - sub) * grow;
            const top = base + v * lit * grow;
            return (
              <g key={i}>
                <rect x={bx} y={y(top)} width={bw} height={y(base) - y(top)} fill={i === 3 ? COLOR.warn : COLOR.accent} />
                <rect x={bx} y={y(base)} width={bw} height={yBottom - y(base) + 2} fill={pedestal > 0.5 ? "#8d5b6a" : "#56627f"} />
                <text x={bx + bw / 2} y={y(top) - 12} fontSize={30} fontWeight={700} fill={COLOR.text} textAnchor="middle" opacity={grow}>
                  {Math.round(top)}
                </text>
              </g>
            );
          })}
        </g>
        {/* 黒レベルの高さ */}
        <g opacity={pedestal * (1 - sub)}>
          <line x1={x0 - 20} x2={1110} y1={y(BLACK)} y2={y(BLACK)} stroke={COLOR.bad} strokeWidth={4} strokeDasharray="12 9" />
          <Label x={x0 + 20 + 3.5 * (bw + gap) - gap / 2} y={y(BLACK / 2) + 13} size={38} anchor="middle">
            光がなくても乗っている台
          </Label>
        </g>
        <text x={x0 + 20 + 3.5 * (bw + gap) - gap / 2} y={yBottom + 50} fontSize={32} fill={COLOR.dim} textAnchor="middle">
          {sub > 0.5 ? "画素の値(256 を引いたあと)" : lit < 0.5 ? "真っ暗にしたときの画素の値" : "RAW に記録された画素の値"}
        </text>
        <Label x={x0 + 20 + 3 * (bw + gap) + bw / 2} y={y((BLACK * (1 - sub) + 760) * grow) - 56} size={30} color={COLOR.warn} anchor="middle" opacity={grow * lit}>
          星
        </Label>
      </svg>
      <Note kind="模式図" style={{ right: 700 }} />
      <At x={1180} y={110} w={620} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Reveal at={150}>
          <Card>真っ暗でも 0 にならない</Card>
        </Reveal>
        <Reveal at={290}>
          <Card color={COLOR.bad}>
            このカメラの黒レベル = <b style={{ color: COLOR.bad, fontSize: 56 }}>256</b>
          </Card>
        </Reveal>
        <Reveal at={355}>
          <Card>RAWファイルに記録されている</Card>
        </Reveal>
        <Reveal at={425}>
          <Card color={COLOR.good}>
            全体から <b style={{ color: COLOR.good }}>256 を引く</b>
          </Card>
        </Reveal>
      </At>
    </Stage>
  );
};

// RAW に入っている倍率の地図(実データ)を掛けて、端の星の明るさを戻す
const GainMap: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const gain = frames.gain;
  const [rows, cols, cell] = [gain.length, gain[0].length, 19];
  const top = useMemo(() => Math.max(...gain.flat()), [gain]);
  const apply = ramp(frame, 235, 60);
  const field = useMemo(() => starField(0.2, 1.1), []);
  const image = useMemo(() => {
    const out = new Float32Array(field.length);
    for (let y = 0; y < SIM.h; y++) for (let x = 0; x < SIM.w; x++) for (let c = 0; c < 3; c++) out[(y * SIM.w + x) * 3 + c] = field[(y * SIM.w + x) * 3 + c] * Math.pow(vignetteAt(x, y, 5), 1 - apply) + 0.05;
    return out;
  }, [field, apply]);
  const scale = 2.6;
  const [mapW, mapH] = [cols * cell, rows * cell];
  const shade = (g: number) => {
    const t = Math.min(1, (g - 1) / (top - 1));
    return `rgb(${Math.round(mix(22, 255, t))},${Math.round(mix(38, 180, t))},${Math.round(mix(74, 84, t))})`;
  };
  return (
    <Stage chapter={chapter}>
      <Steps label="細かい補正" items={FIXES} active={1} />
      <At x={60} y={100} w={mapW}>
        <svg width={mapW} height={mapH} style={{ display: "block", borderRadius: 10 }}>
          {gain.flatMap((row, r) =>
            row.map((g, c) => {
              // 中心から外へ広がるように現れる
              const d = Math.hypot((c - (cols - 1) / 2) / cols, (r - (rows - 1) / 2) / rows) / 0.7;
              return <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell + 0.5} height={cell + 0.5} fill={shade(g)} opacity={ramp(frame, 50 + d * 90, 15)} />;
            }),
          )}
          <Label x={mapW / 2} y={mapH / 2 + 14} size={40} anchor="middle" opacity={ramp(frame, 70, 15)}>
            中心 1倍
          </Label>
          <Label x={14} y={44} size={36} color={COLOR.warn} opacity={ramp(frame, 150, 15)}>
            約{top.toFixed(1)}倍
          </Label>
          <Label x={mapW - 14} y={mapH - 18} size={36} color={COLOR.warn} anchor="end" opacity={ramp(frame, 150, 15)}>
            四隅ほど大きい
          </Label>
        </svg>
        <Note kind="実際のデータ" style={{ bottom: "auto", top: mapH - 56, right: "auto", left: 8, opacity: ramp(frame, 160, 15) }} />
        <Caption style={{ opacity: ramp(frame, 60, 15) }}>RAWファイルに入っている倍率の地図</Caption>
      </At>
      <At x={mapW + 60} y={250} w={STAGE.w - mapW - 60 - SIM.w * scale - 60} style={{ textAlign: "center", fontSize: 110, fontWeight: 800, color: COLOR.accent, opacity: ramp(frame, 215, 15) }}>
        ×
      </At>
      <At x={STAGE.w - SIM.w * scale - 60} y={100} w={SIM.w * scale}>
        <div style={{ position: "relative" }}>
          <SimSky image={image} lo={0} hi={4} scale={scale} style={{ display: "block" }} />
          <Note kind="模式図" />
        </div>
        <Caption>{apply < 0.5 ? "星だけの画像(端の星が暗い)" : "倍率を掛けたあと"}</Caption>
        <Reveal at={300} style={{ textAlign: "center", marginTop: 14 }}>
          <Tag color={COLOR.good} style={{ fontSize: 36 }}>
            端の星も、中心と同じ明るさに戻る
          </Tag>
        </Reveal>
        <Reveal at={lineAt(scene, 1) + 10} style={{ marginTop: 18 }}>
          <Card style={{ textAlign: "center" }}>補正の答えは、カメラが RAW に書いている</Card>
        </Reveal>
      </At>
    </Stage>
  );
};

// フタをして撮った真っ暗な写真で光っている画素に×印を付け、データなしにする
const HotPixels: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const sky = useMemo(() => rawFrame({ house: true }), []);
  const dark = useMemo(() => rawFrame({ stars: false, pollution: 0, vignette: 0, noise: 0.6 }), []);
  const scale = 3.6;
  const [w, h] = [SIM.w * scale, SIM.h * scale];
  const cover = ramp(frame, 80, 40);
  const colors = [COLOR.r, COLOR.g, COLOR.b];
  return (
    <Stage chapter={chapter}>
      <Steps label="細かい補正" items={FIXES} active={2} />
      <At x={0} y={96} w={w} h={h}>
        <SimSky image={sky} scale={scale} style={{ display: "block" }} />
        <div style={{ position: "absolute", left: 0, top: 0, opacity: cover }}>
          <SimSky image={dark} lo={-0.4} hi={8} scale={scale} style={{ display: "block" }} />
        </div>
        <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
          {hotPixels.map((p, i) => {
            const [cx, cy] = [(p.x + 0.5) * scale, (p.y + 0.5) * scale];
            const found = ramp(frame, 170 + i * 2.2, 12);
            const cross = ramp(frame, 270 + i * 1.6, 10);
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={mix(30, 15, found)} fill="none" stroke={colors[p.channel]} strokeWidth={3} opacity={found * (1 - cross)} />
                <path d={`M${cx - 13} ${cy - 13} L${cx + 13} ${cy + 13} M${cx + 13} ${cy - 13} L${cx - 13} ${cy + 13}`} stroke={COLOR.bad} strokeWidth={5} strokeLinecap="round" opacity={cross} />
              </g>
            );
          })}
        </svg>
        <Tag style={{ position: "absolute", left: 12, top: 12, opacity: cover }}>レンズにフタをして撮った真っ暗な写真</Tag>
        <Note kind="模式図" />
      </At>
      <At x={w + 40} y={96} w={STAGE.w - w - 40} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Reveal at={170}>
          <Card>
            真っ暗なのに光る画素
            <br />= <b style={{ color: COLOR.bad }}>ホットピクセル</b>
          </Card>
        </Reveal>
        <Reveal at={270}>
          <Card color={COLOR.bad}>
            <b style={{ color: COLOR.bad }}>×</b> の画素は「データなし」
            <br />
            計算から外す
            <div style={{ fontSize: 30, color: COLOR.dim, marginTop: 6 }}>実際の撮影では {frames.hotCount.toLocaleString("en-US")} 画素</div>
          </Card>
        </Reveal>
        <Reveal at={lineAt(scene, 1) + 60}>
          <Card color={COLOR.good}>
            星だけの写真が <b style={{ color: COLOR.good, fontSize: 54 }}>394枚</b>
          </Card>
        </Reveal>
      </At>
    </Stage>
  );
};

// 「章ID/場面名」→ 場面の絵
export const ch06: Record<string, SceneView> = {
  "06_extract_stars/現象": Phenomenon,
  "06_extract_stars/アイデア": Idea,
  "06_extract_stars/アルゴリズム 中央値": Median,
  "06_extract_stars/静止シーン": StaticScene,
  "06_extract_stars/引き算": Subtract,
  "06_extract_stars/黒レベル": BlackLevel,
  "06_extract_stars/RAWの補正情報": GainMap,
  "06_extract_stars/ホットピクセル除外": HotPixels,
};
