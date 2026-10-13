import { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { SimSky } from "../components/SimSky";
import { Card, Photo, Reveal, Stage, Tag } from "../components/ui";
import { gauss, hash } from "../sim/rng";
import { SIM, hotPixels, isHouse, rawFrame } from "../sim/sky";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, through, tween } from "../timing";
import type { SceneView } from "../types";
import { Axes, Kind, SimCrop, bestRect, flatField, hotIn, mixImage } from "./ch03_parts";

// 模式図の上に置く番号の丸
const Badge = ({ n, x, y, at }: { n: number; x: number; y: number; at: number }) => {
  const p = ramp(useCurrentFrame(), at, 12);
  return (
    <div style={{ position: "absolute", left: x - 30, top: y - 30, width: 60, height: 60, borderRadius: 30, background: COLOR.warn, color: "#000", fontSize: 40, fontWeight: 800, textAlign: "center", lineHeight: "60px", opacity: p, transform: `scale(${0.5 + 0.5 * p})` }}>
      {n}
    </div>
  );
};

// 模式図の RAW 1枚。暗い状態から明るさだけ持ち上げ、最後に邪魔者4つを指す
const Overview: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const image = useMemo(() => rawFrame({ house: true }), []);
  const S = 4.5;
  const [w, h] = [SIM.w * S, SIM.h * S];
  const hi = tween(frame, 10, 80, 90, 9);
  const zoom = 1 + 0.05 * through(frame, scene);
  const t = lineAt(scene, 2);
  // 赤いホットピクセルのうち、空にあって明るいもの
  const reds = useMemo(() => hotPixels.filter((p) => p.channel === 0 && !isHouse(p.x, p.y) && p.y > 12).sort((a, b) => b.level - a.level).slice(0, 3), []);
  const items = ["ノイズ(ざらつき)", "光害(下が明るい空)", "周辺減光(暗い四隅)", "ホットピクセル(赤い点)"];
  return (
    <Stage chapter={chapter} title="RAW を1枚見る">
      <div style={{ display: "flex", gap: 40, alignItems: "center", height: "100%" }}>
        <div style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: 10, flexShrink: 0 }}>
          <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})` }}>
            <SimSky image={image} hi={hi} scale={S} />
            <Badge n={1} x={w * 0.42} y={h * 0.3} at={t + 20} />
            <Badge n={2} x={w * 0.66} y={h * 0.8} at={t + 38} />
            <Badge n={3} x={w - 70} y={70} at={t + 56} />
            {reds.map((p, i) => (
              <div key={i} style={{ position: "absolute", left: (p.x + 0.5) * S - 24, top: (p.y + 0.5) * S - 24, width: 48, height: 48, borderRadius: 24, border: `4px solid ${COLOR.warn}`, boxSizing: "border-box", opacity: ramp(frame, t + 74, 12) }} />
            ))}
            {reds[0] && <Badge n={4} x={(reds[0].x + 0.5) * S + 50} y={(reds[0].y + 0.5) * S - 36} at={t + 74} />}
          </div>
          <Tag style={{ position: "absolute", left: 12, top: 12 }}>RAW 1枚(明るさだけ調整)</Tag>
          <Kind />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          <Reveal at={lineAt(scene, 1)}>
            <Card style={{ fontSize: 34 }}>星が少なく、画面が汚い</Card>
          </Reveal>
          <Reveal at={t}>
            <div style={{ fontSize: 44, fontWeight: 800, color: COLOR.warn, marginTop: 10 }}>邪魔者は4つ</div>
          </Reveal>
          {items.map((item, i) => (
            <Reveal key={item} at={t + 20 + i * 18}>
              <Card style={{ fontSize: 34, padding: "14px 22px" }}>
                <b style={{ color: COLOR.warn, fontSize: 40, marginRight: 14 }}>{i + 1}</b>
                {item}
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </Stage>
  );
};

// 断面グラフ用の画素の列。明るい星1つと、ざらつきに埋もれる暗い星1つ
const ROW = (() => {
  const n = 84;
  const bump = (i: number, c: number, a: number) => a * Math.exp(-((i - c) ** 2) / 3);
  const clean = Array.from({ length: n }, (_, i) => 5 + bump(i, 22, 6) + bump(i, 58, 1.1));
  return { n, clean, noisy: clean.map((v, i) => v + 0.75 * gauss(i, 3)) };
})();

// 実画像の空を拡大してざらつきを見せ、横に画素の値の断面(模式)を描く
const Noise: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const t = lineAt(scene, 1);
  const [gw, gh, pad] = [1060, 600, 60];
  const px = (i: number) => pad + 10 + (i / ROW.n) * (gw - pad - 30);
  const py = (v: number) => gh - pad - ((v - 2.5) / 10) * (gh - pad - 30);
  // 画素ごとの階段状の線
  const steps = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)} L${px(i + 1).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const drawn = ramp(frame, 40, 110);
  const band = ramp(frame, 150, 20);
  const found = ramp(frame, t + 40, 20);
  return (
    <Stage chapter={chapter} title="邪魔者 1: ノイズ">
      <div style={{ display: "flex", gap: 50, alignItems: "center", height: "100%" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Photo src="img/noise.png" w={STAGE.h} h={STAGE.h} aspect={1} from={{ zoom: 1, x: 0.5, y: 0.5 }} to={{ zoom: 2.2, x: 0.5, y: 0.5 }} progress={ramp(frame, 10, scene.frames - 30)} style={{ imageRendering: "pixelated" }} />
          <Tag style={{ position: "absolute", left: 12, top: 12 }}>空の拡大</Tag>
          <Kind real />
        </div>
        <div style={{ position: "relative", width: gw, height: gh }}>
          <svg width={gw} height={gh}>
            <Axes w={gw} h={gh} x="画素の位置(横1列)" y="画素の値" pad={pad} />
            {/* ばらつきの幅 */}
            <rect x={pad} y={py(5.75)} width={gw - pad - 10} height={py(4.25) - py(5.75)} fill={COLOR.warn} opacity={0.22 * band} />
            <line x1={pad} y1={py(5)} x2={gw - 10} y2={py(5)} stroke={COLOR.dim} strokeWidth={3} strokeDasharray="10 8" opacity={band} />
            <clipPath id="ch03-noise-clip">
              <rect x={0} y={0} width={pad + (gw - pad) * drawn} height={gh} />
            </clipPath>
            <path d={steps(ROW.noisy)} fill="none" stroke={COLOR.text} strokeWidth={4} clipPath="url(#ch03-noise-clip)" />
            {/* ノイズがなければ見えるはずの形 */}
            <path d={steps(ROW.clean)} fill="none" stroke={COLOR.good} strokeWidth={4} strokeDasharray="8 6" opacity={found} />
            <g opacity={ramp(frame, 120, 15)}>
              <text x={px(22) + 40} y={py(10.6)} fill={COLOR.accent} fontSize={36} fontWeight={700}>
                明るい星
              </text>
            </g>
            <g opacity={band}>
              <text x={px(30)} y={py(2.95)} fill={COLOR.warn} fontSize={34} fontWeight={700}>
                空の明るさのまわりで ばらつく = ノイズ
              </text>
            </g>
            <g opacity={found}>
              <line x1={px(58.5)} y1={py(8.4)} x2={px(58.5)} y2={py(6.9)} stroke={COLOR.good} strokeWidth={4} />
              <path d={`M${px(58.5) - 12},${py(6.9) - 16} L${px(58.5)},${py(6.9)} L${px(58.5) + 12},${py(6.9) - 16}`} fill="none" stroke={COLOR.good} strokeWidth={4} />
              <text x={px(58.5)} y={py(8.4) - 56} fill={COLOR.good} fontSize={38} fontWeight={700} textAnchor="middle">
                暗い星
              </text>
              <text x={px(58.5)} y={py(8.4) - 14} fill={COLOR.good} fontSize={30} textAnchor="middle">
                ざらつきに埋もれる
              </text>
            </g>
          </svg>
          <Kind style={{ right: 12, bottom: "auto", top: 0 }} />
        </div>
      </div>
    </Stage>
  );
};

// 光害。街の明かりのない空から明るい空へ変え、断面で星が空の上に少し乗っているだけと示す
const Pollution: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const dark = useMemo(() => rawFrame({ house: true, vignette: 0, hot: false, pollution: 0 }), []);
  const lit = useMemo(() => rawFrame({ house: true, vignette: 0, hot: false }), []);
  const k = ramp(frame, 35, 110);
  const image = useMemo(() => mixImage(dark, lit, k), [dark, lit, k]);
  const S = 4;
  const [gw, gh, base] = [720, 576, 500];
  const sky = 330 * k;
  // 断面に立つ星の山
  const peaks = [
    { x: 150, a: 60 },
    { x: 290, a: 34 },
    { x: 410, a: 88 },
    { x: 560, a: 44 },
  ];
  const top = (x: number) => base - sky - peaks.reduce((s, p) => s + p.a * Math.exp(-((x - p.x) ** 2) / 160), 0);
  const xs = Array.from({ length: 121 }, (_, i) => 70 + i * 5);
  const outline = xs.map((x, i) => `${i ? "L" : "M"}${x},${top(x).toFixed(1)}`).join(" ");
  const a1 = ramp(frame, 150, 20);
  const a2 = ramp(frame, 215, 20);
  return (
    <Stage chapter={chapter} title="邪魔者 2: 光害">
      <div style={{ display: "flex", gap: 50, alignItems: "center", height: "100%" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <SimSky image={image} scale={S} />
          <Tag style={{ position: "absolute", left: 12, top: 12 }} color={k > 0.5 ? COLOR.warn : COLOR.accent}>
            {k > 0.5 ? "街の明かりがある空" : "街の明かりがない空"}
          </Tag>
          <svg width={70} height={360} style={{ position: "absolute", right: 16, top: 60, opacity: a1 }}>
            <line x1={35} y1={20} x2={35} y2={330} stroke={COLOR.warn} strokeWidth={6} />
            <path d="M15,305 L35,345 L55,305" fill="none" stroke={COLOR.warn} strokeWidth={6} />
          </svg>
          <Tag color={COLOR.warn} style={{ position: "absolute", right: 80, top: 330, opacity: a1 }}>
            地平線側ほど明るい
          </Tag>
          <Kind style={{ right: "auto", left: 12 }} />
        </div>
        <svg width={gw} height={gh}>
          <text x={70} y={40} fill={COLOR.dim} fontSize={30}>
            明るさの断面
          </text>
          <path d={`${outline} L${xs[xs.length - 1]},${base} L70,${base} Z`} fill={COLOR.accent} />
          <rect x={70} y={base - sky} width={600} height={sky} fill={COLOR.warn} />
          <line x1={50} y1={base} x2={gw - 10} y2={base} stroke={COLOR.dim} strokeWidth={3} />
          <text x={60} y={base + 40} fill={COLOR.dim} fontSize={28}>
            明るさ 0
          </text>
          <g opacity={a1}>
            <text x={370} y={base - sky / 2 + 16} fill="#000" fontSize={44} fontWeight={800} textAnchor="middle">
              空の明るさ(光害)
            </text>
          </g>
          <g opacity={a2}>
            <text x={410} y={top(410) - 24} fill={COLOR.accent} fontSize={40} fontWeight={800} textAnchor="middle">
              星の光はこれだけ
            </text>
          </g>
        </svg>
      </div>
      <Reveal at={lineAt(scene, 1)} style={{ position: "absolute", right: 0, bottom: 0 }}>
        <Card style={{ fontSize: 34, padding: "12px 22px" }}>夜なのに、空そのものが明るい</Card>
      </Reveal>
    </Stage>
  );
};

// 周辺減光。一様な空に減光をかけ、中心から四隅への明るさの落ち方をグラフでなぞる
const Vignette: SceneView = ({ chapter }) => {
  const frame = useCurrentFrame();
  const flat = useMemo(() => flatField(0), []);
  const dim = useMemo(() => flatField(1), []);
  const k = ramp(frame, 30, 90);
  const image = useMemo(() => mixImage(flat, dim, k), [flat, dim, k]);
  const S = 4;
  const [w, h] = [SIM.w * S, SIM.h * S];
  const q = ramp(frame, 110, 130); // 中心から四隅へ動く印
  const [gw, gh, pad] = [720, 576, 60];
  const fall = (r: number) => 1 / (1 + 3 * r ** 4);
  const px = (r: number) => pad + 20 + r * (gw - pad - 60);
  const py = (v: number) => gh - pad - v * (gh - pad - 70);
  const curve = Array.from({ length: 61 }, (_, i) => `${i ? "L" : "M"}${px(i / 60).toFixed(1)},${py(fall(i / 60)).toFixed(1)}`).join(" ");
  const label = ramp(frame, 215, 20);
  return (
    <Stage chapter={chapter} title="邪魔者 3: 周辺減光">
      <div style={{ display: "flex", gap: 50, alignItems: "center", height: "100%" }}>
        <div style={{ position: "relative", width: w, height: h, flexShrink: 0 }}>
          <SimSky image={image} scale={S} />
          <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, opacity: ramp(frame, 100, 15) }}>
            <line x1={w / 2} y1={h / 2} x2={w - 6} y2={6} stroke={COLOR.accent} strokeWidth={4} strokeDasharray="12 10" />
            <circle cx={w / 2 + (w / 2 - 26) * q} cy={h / 2 - (h / 2 - 26) * q} r={16} fill="none" stroke={COLOR.accent} strokeWidth={6} />
          </svg>
          <Tag style={{ position: "absolute", left: w / 2 - 50, top: h / 2 + 24, opacity: ramp(frame, 100, 15) }}>中心</Tag>
          <Tag style={{ position: "absolute", right: 30, top: 34, opacity: ramp(frame, 100, 15) }}>四隅</Tag>
          <Kind style={{ right: "auto", left: 12 }} />
        </div>
        <svg width={gw} height={gh}>
          <Axes w={gw} h={gh} x="中心からの距離" y="明るさ" pad={pad} />
          <line x1={pad} y1={py(1)} x2={gw - 10} y2={py(1)} stroke={COLOR.line} strokeWidth={3} strokeDasharray="8 8" />
          <line x1={pad} y1={py(0.25)} x2={gw - 10} y2={py(0.25)} stroke={COLOR.line} strokeWidth={3} strokeDasharray="8 8" />
          <path d={curve} fill="none" stroke={COLOR.accent} strokeWidth={6} opacity={ramp(frame, 90, 20)} />
          <circle cx={px(q)} cy={py(fall(q))} r={14} fill={COLOR.accent} opacity={ramp(frame, 100, 15)} />
          <text x={px(0)} y={py(1) - 18} fill={COLOR.text} fontSize={34} fontWeight={700}>
            中心 = 1
          </text>
          <g opacity={label}>
            <text x={px(1) + 20} y={py(0.25) + 62} fill={COLOR.warn} fontSize={44} fontWeight={800} textAnchor="end">
              四隅 = およそ 1/4
            </text>
          </g>
        </svg>
      </div>
    </Stage>
  );
};

// 画素の格子に、星(広がる)かホットピクセル(1画素だけ)を描き、下に断面を添える
const PixelSample = ({ hot }: { hot?: boolean }) => {
  const [n, cell] = [7, 38];
  const size = n * cell;
  const value = (x: number, y: number) => (hot ? (x === 3 && y === 3 ? 1 : 0) : Math.exp(-((x - 3) ** 2 + (y - 3) ** 2) / 2.6));
  const color = (x: number, y: number) => {
    const v = value(x, y);
    const sky = 62 + 14 * hash(x, y, hot ? 5 : 6);
    const to = hot ? [255, 120, 110] : [235, 245, 255];
    return `rgb(${to.map((c, i) => Math.round([sky, sky + 8, sky + 14][i] * (1 - v) + c * v)).join(",")})`;
  };
  const profile = Array.from({ length: n }, (_, x) => value(x, 3));
  const path = profile.map((v, x) => `${x ? "L" : "M"}${x * cell},${100 - v * 86} L${(x + 1) * cell},${100 - v * 86}`).join(" ");
  return (
    <div>
      <svg width={size} height={size} style={{ display: "block", borderRadius: 8 }}>
        {Array.from({ length: n * n }, (_, i) => (
          <rect key={i} x={(i % n) * cell} y={Math.floor(i / n) * cell} width={cell} height={cell} fill={color(i % n, Math.floor(i / n))} stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
        ))}
      </svg>
      <svg width={size} height={112} style={{ display: "block", marginTop: 10 }}>
        <line x1={0} y1={102} x2={size} y2={102} stroke={COLOR.dim} strokeWidth={2} />
        <path d={path} fill="none" stroke={hot ? COLOR.bad : COLOR.accent} strokeWidth={5} />
      </svg>
    </div>
  );
};

// 実画像の上の丸印。位置と半径は画像に対する割合
const Ring = ({ x, y, r, color, at }: { x: number; y: number; r: number; color: string; at: number }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, 14);
  const pulse = 1 + 0.06 * Math.sin(frame / 6);
  return <div style={{ position: "absolute", left: `${(x - r) * 100}%`, top: `${(y - r) * 100}%`, width: `${r * 200}%`, height: `${r * 200}%`, borderRadius: "50%", border: `6px solid ${color}`, boxSizing: "border-box", opacity: p, transform: `scale(${(1.6 - 0.6 * p) * pulse})` }} />;
};

// ホットピクセルの実拡大。丸で囲み、星(広がる)との違いを模式の格子で並べる
const HotPixel: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [t1, t2] = [lineAt(scene, 1), lineAt(scene, 2)];
  return (
    <Stage chapter={chapter} title="邪魔者 4: ホットピクセル">
      <div style={{ display: "flex", gap: 50, alignItems: "center", height: "100%" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Photo src="img/hot.png" w={STAGE.h} h={STAGE.h} aspect={1} from={{ zoom: 1, x: 0.5, y: 0.5 }} to={{ zoom: 1.25, x: 0.4, y: 0.42 }} progress={through(frame, scene)}>
            <Ring x={0.489} y={0.51} r={0.075} color={COLOR.bad} at={t1} />
            <Ring x={0.04} y={0.18} r={0.1} color={COLOR.accent} at={t2 + 30} />
            <Tag color={COLOR.bad} style={{ position: "absolute", left: "58%", top: "47%", whiteSpace: "nowrap", opacity: ramp(frame, t1 + 10, 12) }}>
              {frame < t2 ? "星？" : "ホットピクセル"}
            </Tag>
            <Tag style={{ position: "absolute", left: "15%", top: "14%", whiteSpace: "nowrap", opacity: ramp(frame, t2 + 40, 12) }}>本物の星</Tag>
          </Photo>
          <Kind real />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
          <Reveal at={20}>
            <Card color={COLOR.bad}>
              光が当たっていないのに、
              <br />
              勝手に<b style={{ color: COLOR.bad }}>明るい数字</b>を出す画素
            </Card>
          </Reveal>
          <div style={{ position: "relative", display: "flex", gap: 70, justifyContent: "center" }}>
            <Reveal at={t2 + 40}>
              <div style={{ fontSize: 40, fontWeight: 800, color: COLOR.accent, textAlign: "center", marginBottom: 8 }}>本物の星</div>
              <PixelSample />
              <div style={{ fontSize: 30, color: COLOR.text, textAlign: "center" }}>複数の画素に広がる</div>
            </Reveal>
            <Reveal at={t2 + 110}>
              <div style={{ fontSize: 40, fontWeight: 800, color: COLOR.bad, textAlign: "center", marginBottom: 8 }}>ホットピクセル</div>
              <PixelSample hot />
              <div style={{ fontSize: 30, color: COLOR.text, textAlign: "center" }}>1画素だけ鋭く光る</div>
            </Reveal>
            <Kind style={{ right: 0, bottom: 0, opacity: ramp(frame, t2 + 40, 12) }} />
          </div>
        </div>
      </div>
    </Stage>
  );
};

// まとめ用の小さな絵の切り出し位置
const NOISE_RECT = { x: 60, y: 30, w: 96, h: 54 };
const HOT_RECT = bestRect(64, 36, (r) => hotIn(r, 4).length, 112);

// 4つを並べて撮り直し続け、ばらつくのはノイズだけと見せてから2つのグループに分ける
const Summary: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const shot = Math.floor(frame / 18);
  const noisy = useMemo(() => rawFrame({ vignette: 0, hot: false, shot }), [shot]);
  const glow = useMemo(() => rawFrame({ noise: 0, vignette: 0, hot: false, house: true }), []);
  const dim = useMemo(() => flatField(1, 0), []);
  const hot = useMemo(() => rawFrame({ noise: 0, vignette: 0, pollution: 0.6, stars: false }), []);
  const [tw, th] = [400, 225];
  const xs = [20, 500, 920, 1340];
  const group = ramp(frame, 150, 20);
  const names = ["ノイズ", "光害", "周辺減光", "ホットピクセル"];
  const thumbs = [
    <SimCrop image={noisy} rect={NOISE_RECT} scale={tw / NOISE_RECT.w} lo={1} hi={8} />,
    <SimSky image={glow} scale={tw / SIM.w} />,
    <SimSky image={dim} scale={tw / SIM.w} hi={8} />,
    <SimCrop image={hot} rect={HOT_RECT} scale={tw / HOT_RECT.w} hi={8} />,
  ];
  const box = (x: number, w: number, color: string, title: string) => (
    <div style={{ position: "absolute", left: x, top: 0, width: w, height: 410, border: `4px solid ${color}`, borderRadius: 22, boxSizing: "border-box", opacity: group }}>
      <div style={{ color, fontSize: 40, fontWeight: 800, textAlign: "center", marginTop: 16 }}>{title}</div>
    </div>
  );
  return (
    <Stage chapter={chapter} title="4つの邪魔者">
      {box(0, 440, COLOR.warn, "撮るたびにばらつく")}
      {box(480, 1280, COLOR.accent, "毎回同じ場所に、同じように出る")}
      {thumbs.map((thumb, i) => (
        <Reveal key={i} at={10 + i * 14} style={{ position: "absolute", left: xs[i], top: 100, width: tw }}>
          <div style={{ position: "relative", width: tw, height: th }}>
            {thumb}
            <Tag color={COLOR.dim} style={{ position: "absolute", left: 8, top: 8, fontSize: 28 }}>
              {shot + 1}枚目
            </Tag>
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, color: i ? COLOR.accent : COLOR.warn, textAlign: "center", marginTop: 14 }}>{names[i]}</div>
        </Reveal>
      ))}
      <Kind style={{ right: 0, bottom: 176 }} />
      <Reveal at={lineAt(scene, 2)} style={{ position: "absolute", left: 0, right: 0, top: 450, display: "flex", justifyContent: "center" }}>
        <Card color={COLOR.good} style={{ fontSize: 44, fontWeight: 700 }}>
          グループごとに、<span style={{ color: COLOR.good }}>退治の仕方がまったく違う</span>
        </Card>
      </Reveal>
    </Stage>
  );
};

export const ch03: Record<string, SceneView> = {
  "03_one_raw/全体像": Overview,
  "03_one_raw/1 ノイズ": Noise,
  "03_one_raw/2 光害": Pollution,
  "03_one_raw/3 周辺減光": Vignette,
  "03_one_raw/4 ホットピクセル": HotPixel,
  "03_one_raw/まとめ": Summary,
};
