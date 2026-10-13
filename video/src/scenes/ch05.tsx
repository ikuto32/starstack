import { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SimSky } from "../components/SimSky";
import { Card, Photo, Reveal, Stage, Tag } from "../components/ui";
import { hash } from "../sim/rng";
import { SIM, rawFrame } from "../sim/sky";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, through } from "../timing";
import type { SceneView } from "../types";
import { Kind } from "./ch03_parts";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// 一定の速さで 0 → 1(星の動きは緩急をつけない)
const linear = (frame: number, start: number, dur: number) => interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

// 全部をそのまま重ねた実際の画像。星が弧を描いて線になる
const Trails: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  return (
    <Stage chapter={chapter} title="そのまま全部重ねると">
      <div style={{ position: "relative", opacity: ramp(frame, 0, 18) }}>
        <Photo src="img/trails.jpg" w={STAGE.w} h={STAGE.h} aspect={0.75} from={{ zoom: 3.5, x: 0.5, y: 0.3 }} to={{ zoom: 4.3, x: 0.52, y: 0.62 }} progress={through(frame, scene)} />
        <Reveal at={lineAt(scene, 1)} style={{ position: "absolute", left: 16, top: 16 }}>
          <Tag style={{ fontSize: 36 }}>星が線になる</Tag>
        </Reveal>
        <Reveal at={lineAt(scene, 2) + 10} style={{ position: "absolute", left: 16, bottom: 16 }}>
          <Card color={COLOR.accent} style={{ fontSize: 38, background: "rgba(5,7,13,0.86)" }}>
            <b style={{ color: COLOR.accent }}>地球が自転</b>している → 地面に固定したスマホから見ると、<b style={{ color: COLOR.accent }}>空のほうが回る</b>
          </Card>
        </Reveal>
        <Kind real />
      </div>
    </Stage>
  );
};

// 画素の格子。value(列, 行) が 0〜1 の明るさを返す
const PixelGrid = ({ cols, rows, cell, value }: { cols: number; rows: number; cell: number; value: (x: number, y: number) => number }) => (
  <svg width={cols * cell} height={rows * cell} style={{ display: "block", borderRadius: 8 }}>
    {Array.from({ length: cols * rows }, (_, i) => {
      const [x, y] = [i % cols, Math.floor(i / cols)];
      const v = Math.pow(clamp01(value(x, y)), 0.7);
      const rgb = [22, 28, 48].map((b, k) => Math.round(b + ([238, 244, 255][k] - b) * v)).join(",");
      return <rect key={i} x={x * cell} y={y * cell} width={cell} height={cell} fill={`rgb(${rgb})`} stroke="#05070d" strokeWidth={2} />;
    })}
  </svg>
);

// 天の極のまわりに散らした星
const POLE = { x: 520, y: 300 };
const DOME = Array.from({ length: 46 }, (_, i) => ({ r: 50 + 560 * Math.sqrt(hash(i, 1, 55)), a: hash(i, 2, 55) * Math.PI * 2, size: 3 + 5 * hash(i, 3, 55) ** 3 }));
const at = (r: number, a: number) => [POLE.x + r * Math.cos(a), POLE.y + r * Math.sin(a)];

// 固定されたスマホの上で空が回る(1時間に15度)。右は画素の格子の上を星が横切る拡大図
const Problem: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const hours = 2 * linear(frame, 15, 210);
  const turn = (hours * 15 * Math.PI) / 180;
  const [w, h, ground] = [1020, STAGE.h, 590];
  const ref = -2.5; // 角度を測る基準の向き
  const [ax, ay] = at(230, ref);
  const [bx, by] = at(230, ref + turn);
  const [cx, cy] = at(120, ref);
  const [dx, dy] = at(120, ref + turn);
  const [lx, ly] = at(175, ref + turn / 2);
  const t = lineAt(scene, 1);
  // 格子の上を斜めに横切る星
  const u = linear(frame, t - 30, 140);
  const [sx, sy] = [0.6 + 6.8 * u, 3.3 - 2.6 * u];
  return (
    <Stage chapter={chapter} title="空は回っている">
      <div style={{ display: "flex", gap: 50, height: "100%" }}>
        <div style={{ position: "relative", width: w, height: h, flexShrink: 0 }}>
          <svg width={w} height={h} style={{ borderRadius: 10, background: "#080c18" }}>
            <clipPath id="ch05-sky">
              <rect x={0} y={0} width={w} height={ground} />
            </clipPath>
            <g clipPath="url(#ch05-sky)">
              {DOME.map((s, i) => {
                const [x0, y0] = at(s.r, s.a);
                const [x1, y1] = at(s.r, s.a + turn);
                return (
                  <g key={i}>
                    <path d={`M${x0},${y0} A${s.r},${s.r} 0 0 1 ${x1},${y1}`} fill="none" stroke={COLOR.accent} strokeWidth={s.size * 0.7} opacity={0.4} strokeLinecap="round" />
                    <circle cx={x1} cy={y1} r={s.size} fill={COLOR.text} />
                  </g>
                );
              })}
              {/* 回った角度 */}
              <line x1={POLE.x} y1={POLE.y} x2={ax} y2={ay} stroke={COLOR.dim} strokeWidth={3} strokeDasharray="10 8" />
              <line x1={POLE.x} y1={POLE.y} x2={bx} y2={by} stroke={COLOR.warn} strokeWidth={4} />
              <path d={`M${cx},${cy} A120,120 0 0 1 ${dx},${dy}`} fill="none" stroke={COLOR.warn} strokeWidth={6} />
              <text x={lx} y={ly} fill={COLOR.warn} fontSize={44} fontWeight={800} textAnchor="middle" style={{ paintOrder: "stroke", stroke: "#080c18", strokeWidth: 10 }}>
                {Math.round(hours * 15)}度
              </text>
            </g>
            <rect x={0} y={ground} width={w} height={h - ground} fill="#151b2c" />
            <line x1={0} y1={ground} x2={w} y2={ground} stroke={COLOR.dim} strokeWidth={3} />
            {/* 三脚とスマホ */}
            <path d={`M${POLE.x},${ground - 50} L${POLE.x - 26},${ground} M${POLE.x},${ground - 50} L${POLE.x + 26},${ground} M${POLE.x},${ground - 50} L${POLE.x},${ground}`} stroke={COLOR.dim} strokeWidth={5} />
            <rect x={POLE.x - 17} y={ground - 112} width={34} height={64} rx={6} fill={COLOR.panel} stroke={COLOR.text} strokeWidth={4} />
          </svg>
          <Tag style={{ position: "absolute", left: POLE.x + 40, top: ground - 104 }} color={COLOR.text}>
            地面に固定したスマホ
          </Tag>
          <Tag style={{ position: "absolute", left: 14, top: 14 }}>スマホから見た空</Tag>
          <Kind style={{ bottom: 12 + h - ground }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
          <Card color={COLOR.warn} style={{ fontSize: 40 }}>
            空は1時間に <b style={{ color: COLOR.warn, fontSize: 56 }}>15度</b> 回る
            <div style={{ fontSize: 36, color: COLOR.dim }}>
              撮影 {hours.toFixed(1)} 時間 → {Math.round(hours * 15)}度
            </div>
          </Card>
          <Reveal at={t - 40}>
            <div style={{ fontSize: 34, color: COLOR.text, marginBottom: 10 }}>拡大: 画素の上を星が動いていく</div>
            <PixelGrid cols={8} rows={4} cell={86} value={(x, y) => Math.exp(-((x + 0.5 - sx) ** 2 + (y + 0.5 - sy) ** 2) / 0.7)} />
          </Reveal>
        </div>
      </div>
    </Stage>
  );
};

const STRIP = { cols: 18, rows: 3, cell: 60, start: 2.5 };

// シャッターを開けている間に星が travel 画素ぶん動き、通った画素に光がたまっていく
const Exposure = ({ seconds, travel, open, result, show }: { seconds: number; travel: number; open: number; result: string; show: number }) => {
  const { cols, rows, cell, start } = STRIP;
  const moved = travel * open;
  const value = (x: number, y: number) => {
    let sum = 0;
    for (let s = 0; s <= moved; s += 0.1) sum += Math.exp(-((x + 0.5 - start - s) ** 2 + (y - 1) ** 2) / 0.6) * 0.1;
    return sum / 1.37; // 通り過ぎた画素がちょうど 1 になる
  };
  return (
    <div style={{ opacity: show }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 36, color: COLOR.text, marginBottom: 10 }}>
        <span>
          シャッター <b style={{ color: COLOR.accent, fontSize: 46 }}>{seconds}秒</b>
        </span>
        <div style={{ width: 320, height: 20, borderRadius: 10, background: COLOR.line, overflow: "hidden" }}>
          <div style={{ width: `${open * 100}%`, height: "100%", background: COLOR.accent }} />
        </div>
        <span style={{ width: 110, color: COLOR.dim }}>{Math.round(open * seconds)}秒</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <div style={{ position: "relative" }}>
          <PixelGrid cols={cols} rows={rows} cell={cell} value={value} />
          <div style={{ position: "absolute", left: (start + moved) * cell - 16, top: 1.5 * cell - 16, width: 32, height: 32, borderRadius: 16, border: `4px solid ${COLOR.warn}`, boxSizing: "border-box" }} />
        </div>
        <div style={{ fontSize: 48, fontWeight: 800, color: COLOR.warn, opacity: open >= 1 ? 1 : 0.15 }}>{result}</div>
      </div>
    </div>
  );
};

// 16秒なら約3画素、60秒なら約12画素。最後に同じ時間の進み方でもう一度比べる
const WhySixteen: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [t1, t2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const again = t2 + 20;
  const replay = linear(frame, again, 70);
  const short = frame >= again ? clamp01((replay * 60) / 16) : linear(frame, 140, 100);
  const long = frame >= again ? replay : linear(frame, t1 + 25, 130);
  return (
    <Stage chapter={chapter} title="シャッターを長く開けられない理由">
      <div style={{ display: "flex", flexDirection: "column", gap: 26, paddingTop: 6 }}>
        <Exposure seconds={16} travel={3} open={short} result="約3画素 動く" show={ramp(frame, 10, 15)} />
        <Exposure seconds={60} travel={12} open={long} result="約12画素 = 線になる" show={ramp(frame, t1, 15)} />
      </div>
      <Reveal at={t2 + 8} style={{ position: "absolute", left: 0, bottom: 0 }}>
        <Card color={COLOR.good} style={{ fontSize: 42, fontWeight: 700, padding: "14px 28px" }}>
          1枚の撮影時間は<span style={{ color: COLOR.good }}>短く</span>して、そのぶん<span style={{ color: COLOR.good }}>枚数をたくさん</span>撮る
        </Card>
      </Reveal>
      <Kind style={{ right: 0, bottom: 0 }} />
    </Stage>
  );
};

// sim/sky.ts の星空の回転の中心(画面の右下の外)。sky.ts の PIVOT と同じ値
const PIVOT = { x: SIM.w + 40, y: SIM.h + 110 };
const SHOTS = 7;
const STEP = 0.009; // 1枚ごとに空が回る角度(ラジアン)

// 星が回った数枚を、星が重なるように回し戻して重ねる。すると今度は家がぶれる
const Align: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const images = useMemo(() => Array.from({ length: SHOTS }, (_, i) => rawFrame({ angle: i * STEP, shot: i + 10, house: true })), []);
  const S = 4;
  const [w, h] = [SIM.w * S, SIM.h * S];
  const [t1, t2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const flip = frame < 56; // 最初は1枚ずつめくって見せる
  const current = Math.floor(frame / 8) % SHOTS;
  // 0 = そのまま重ねる、1 = 星に合わせてずらす。途中で一度戻して見比べる
  const p = ramp(frame, 85, 80) - ramp(frame, t1 + 70, 36) + ramp(frame, t1 + 125, 36);
  const status = flip ? `${current + 1}枚目` : p < 0.5 ? "そのまま重ねる: 星がずれる" : "星に合わせてずらして重ねる";
  return (
    <Stage chapter={chapter} title="ずらしてから重ねる">
      <div style={{ display: "flex", gap: 50, alignItems: "center", height: "100%" }}>
        <div style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: 10, flexShrink: 0, background: "#000" }}>
          {images.map((image, i) => (
            // 上から 1/(i+1) の濃さで重ねると、全体が平均になる
            <div key={i} style={{ position: "absolute", left: 0, top: 0, opacity: flip ? (i === current ? 1 : 0) : 1 / (i + 1), transform: `rotate(${-i * STEP * p}rad)`, transformOrigin: `${PIVOT.x * S}px ${PIVOT.y * S}px` }}>
              <SimSky image={image} scale={S} style={{ borderRadius: 0, display: "block" }} />
            </div>
          ))}
          <Tag style={{ position: "absolute", left: 14, top: 14, fontSize: 34 }} color={!flip && p >= 0.5 ? COLOR.good : COLOR.accent}>
            {status}
          </Tag>
          <div style={{ opacity: ramp(frame, t1 + 20, 14) * clamp01(p * 2 - 0.6) }}>
            <div style={{ position: "absolute", left: 80, top: 318, width: 300, height: 220, borderRadius: "50%", border: `6px solid ${COLOR.warn}`, boxSizing: "border-box" }} />
            <Tag color={COLOR.warn} style={{ position: "absolute", left: 390, top: 340, fontSize: 36 }}>
              家がぶれる
            </Tag>
          </div>
          <Kind />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          <Reveal at={60}>
            <Card color={COLOR.good}>
              星が同じ位置にくるように、
              <br />
              <b style={{ color: COLOR.good }}>1枚ずつずらしてから</b>重ねる
            </Card>
          </Reveal>
          <Reveal at={t1 + 10}>
            <Card color={COLOR.warn}>
              今度は<b style={{ color: COLOR.warn }}>動いていないもの</b>がずれる
              <div style={{ fontSize: 32, color: COLOR.dim }}>家・光害・ホットピクセル</div>
            </Card>
          </Reveal>
          <Reveal at={t2 + 10}>
            <Card color={COLOR.accent} style={{ fontSize: 40, fontWeight: 700 }}>
              重ねる前に、<span style={{ color: COLOR.accent }}>「星だけ」</span>を取り出す
            </Card>
          </Reveal>
        </div>
      </div>
    </Stage>
  );
};

export const ch05: Record<string, SceneView> = {
  "05_earth_rotation/現象": Trails,
  "05_earth_rotation/問題": Problem,
  "05_earth_rotation/16秒の理由": WhySixteen,
  "05_earth_rotation/アイデア": Align,
};
