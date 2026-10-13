import { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { Card, Photo, Reveal, Stage, Tag } from "../components/ui";
import { hash } from "../sim/rng";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, through, tween } from "../timing";
import type { SceneView } from "../types";
import { Corner } from "./ch09_parts";
import { GlowDef, PixelStar, overlap } from "./ch10_parts";

const RGB = [COLOR.r, COLOR.g, COLOR.b];
/** ベイヤー配列(赤・緑・緑・青の 2×2)で、画素 (x, y) が測る色。0 赤、1 緑、2 青。 */
const bayer = (x: number, y: number) => (x % 2 === 0 && y % 2 === 0 ? 0 : x % 2 === 1 && y % 2 === 1 ? 2 : 1);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// 完成画像の星を拡大。右に「画素より細かいものは写らない」の模式図
const Phenomenon: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const l1 = lineAt(scene, 1);
  const progress = 0.92 * ramp(frame, 20, 130) + 0.08 * through(frame, scene);
  const [sx, sy] = [2.5 + 0.24 * Math.sin(frame / 38), 2.5 + 0.2 * Math.cos(frame / 47)];
  return (
    <Stage chapter={chapter}>
      <div style={{ display: "flex", gap: 60, height: "100%" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Photo src="img/drizzle_1x.png" w={STAGE.h} h={STAGE.h} aspect={1} from={{ zoom: 1, x: 0.5, y: 0.5 }} to={{ zoom: 3.4, x: 0.5, y: 0.66 }} progress={progress} style={{ imageRendering: "pixelated" }} />
          <Tag style={{ position: "absolute", left: 14, top: 14 }}>完成画像を拡大</Tag>
          <Corner>実際の画像</Corner>
        </div>
        <div style={{ position: "relative", flex: 1, opacity: ramp(frame, 120, 20) }}>
          <svg width={1050} height={STAGE.h}>
            <defs>
              <GlowDef />
            </defs>
            <text x={245} y={95} textAnchor="middle" fill={COLOR.text} fontSize={36} fontWeight={700}>
              本当の星の像
            </text>
            <text x={805} y={95} textAnchor="middle" fill={COLOR.text} fontSize={36} fontWeight={700}>
              写真に記録される像
            </text>
            <g transform="translate(20 120)">
              <PixelStar n={5} cell={90} sx={sx} sy={sy} filled={0} />
            </g>
            <path d="M490 345 H545 M527 325 L549 345 L527 365" fill="none" stroke={COLOR.accent} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
            <g transform="translate(580 120)">
              <PixelStar n={5} cell={90} sx={sx} sy={sy} star={0} />
            </g>
            <text x={525} y={648} textAnchor="middle" fill={COLOR.warn} fontSize={42} fontWeight={700} opacity={ramp(frame, l1 + 10, 15)}>
              画素より細かいものは写らない
            </text>
          </svg>
          <Corner style={{ bottom: 0, right: 0 }} />
        </div>
      </div>
    </Stage>
  );
};

// ずらして重ねると画素の境目が合わず、混ぜるのでぼける。色はもともと推測
const Problem: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [l1, l2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const C = 100;
  const [dx, dy] = [tween(frame, 40, 70, 0, 0.4), tween(frame, 40, 70, 0, 0.3)];
  const mixed = ramp(frame, 215, 45);
  const show = (at: number) => ramp(frame, at, 15);
  // 星の1画素が、ずれた先の4画素に分かれる割合
  const parts = [
    { x: 2, y: 2, w: 0.42 },
    { x: 3, y: 2, w: 0.28 },
    { x: 2, y: 3, w: 0.18 },
    { x: 3, y: 3, w: 0.12 },
  ];
  const B = 90;
  const neighbors = [-1, 0, 1].flatMap((j) => [-1, 0, 1].map((i) => ({ i, j }))).filter((n) => n.i || n.j);
  return (
    <Stage chapter={chapter}>
      <svg width={940} height={600} style={{ position: "absolute", left: 0, top: 0 }}>
        <g transform="translate(20 40)">
          <rect width={5 * C} height={5 * C} fill="#070a14" />
          {parts.map((p) => (
            <rect key={`${p.x}${p.y}`} x={p.x * C} y={p.y * C} width={C} height={C} fill="#e6edff" opacity={p.w * 1.7 * mixed} />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M${i * C} 0 V${5 * C} M0 ${i * C} H${5 * C}`} stroke={COLOR.dim} strokeWidth={3} />
          ))}
          {/* ずらした画像の格子。中央の1画素に星 */}
          <g transform={`translate(${dx * C} ${dy * C})`}>
            <rect x={2 * C} y={2 * C} width={C} height={C} fill="#e6edff" opacity={0.95 * (1 - 0.8 * mixed)} />
            {Array.from({ length: 6 }, (_, i) => (
              <path key={i} d={`M${i * C} 0 V${5 * C} M0 ${i * C} H${5 * C}`} stroke={COLOR.accent} strokeWidth={3} opacity={0.9 - 0.45 * mixed} />
            ))}
          </g>
          <rect x={2 * C} y={2 * C} width={2 * C} height={2 * C} fill="none" stroke={COLOR.warn} strokeWidth={6} opacity={show(150)} />
          {parts.map((p) => (
            <text key={`${p.x}${p.y}`} x={(p.x + 0.5) * C} y={(p.y + 0.5) * C + 12} textAnchor="middle" fill={COLOR.warn} fontSize={32} fontWeight={800} stroke="#05070d" strokeWidth={6} paintOrder="stroke" opacity={mixed}>
              {Math.round(p.w * 100)}%
            </text>
          ))}
        </g>
        <g fontSize={28} fill={COLOR.text}>
          <rect x={590} y={62} width={28} height={28} fill="none" stroke={COLOR.dim} strokeWidth={4} />
          <text x={632} y={87}>
            重ねる先の画素
          </text>
          <g opacity={show(30)}>
            <rect x={590} y={112} width={28} height={28} fill="none" stroke={COLOR.accent} strokeWidth={4} />
            <text x={632} y={137}>
              ずらした画像の画素
            </text>
          </g>
        </g>
        <text x={590} y={250} fill={COLOR.warn} fontSize={40} fontWeight={700} opacity={show(120)}>
          境目が合わない
        </text>
        <g fill={COLOR.text} fontSize={34} opacity={show(190)}>
          <text x={590} y={330}>
            周りの画素を混ぜて
          </text>
          <text x={590} y={378}>
            新しい数字を作る
          </text>
        </g>
        <text x={590} y={480} fill={COLOR.bad} fontSize={50} fontWeight={800} opacity={show(260)}>
          → 少しぼける
        </text>
      </svg>
      <svg width={800} height={600} style={{ position: "absolute", left: 1000, top: 0, opacity: show(l1) }}>
        <text x={200} y={48} textAnchor="middle" fill={COLOR.text} fontSize={38} fontWeight={700}>
          ベイヤー配列
        </text>
        <g transform="translate(20 70)">
          {Array.from({ length: 16 }, (_, k) => {
            const [x, y] = [k % 4, Math.floor(k / 4)];
            return <rect key={k} x={x * B + 3} y={y * B + 3} width={B - 6} height={B - 6} rx={6} fill={RGB[bayer(x, y)]} opacity={0.75} />;
          })}
          {/* 赤の画素に、周りの緑と青から矢印 */}
          <g opacity={show(l1 + 80)}>
            <rect x={2 * B} y={2 * B} width={B} height={B} fill="none" stroke="#fff" strokeWidth={6} />
            {neighbors.map((n) => {
              const far = 0.95 - 0.07 * Math.sin(frame / 7);
              const [cx, cy] = [2.5 * B, 2.5 * B];
              return <line key={`${n.i}${n.j}`} x1={cx + n.i * B * far} y1={cy + n.j * B * far} x2={cx + n.i * B * 0.6} y2={cy + n.j * B * 0.6} stroke="#fff" strokeWidth={5} strokeLinecap="round" markerEnd="url(#ch10-arrow)" />;
            })}
          </g>
        </g>
        <defs>
          <marker id="ch10-arrow" markerUnits="userSpaceOnUse" markerWidth={20} markerHeight={20} refX={12} refY={10} orient="auto">
            <path d="M0 0 L20 10 L0 20 Z" fill="#fff" />
          </marker>
        </defs>
        <g fill={COLOR.text} fontSize={36} opacity={show(l1 + 25)}>
          <text x={420} y={170}>
            1画素が測るのは
          </text>
          <text x={420} y={222} fontWeight={700}>
            1色だけ
          </text>
        </g>
        <g fill={COLOR.text} fontSize={36} opacity={show(l1 + 95)}>
          <text x={420} y={320}>
            残りの2色は
          </text>
          <text x={420} y={372}>
            周りの画素から
          </text>
          <text x={420} y={436} fill={COLOR.warn} fontSize={50} fontWeight={800}>
            推測
          </text>
        </g>
      </svg>
      <Reveal at={l2} style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center" }}>
        <Card color={COLOR.warn} style={{ padding: "10px 36px", fontSize: 40 }}>
          <b style={{ color: COLOR.warn }}>推測</b>したものを、さらに<b style={{ color: COLOR.warn }}>混ぜている</b>
        </Card>
      </Reveal>
      <Corner style={{ right: 0, bottom: 0 }} />
    </Stage>
  );
};

// 1つの星が、フレームごとに画素の違う位置に落ちる
const Idea: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [l1, l2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const sx = frame < l1 ? tween(frame, 50, 150, 1.5, 1.9) : tween(frame, l1 + 20, 90, 1.9, 2.0) + tween(frame, l2, 300, 0, 0.55);
  const sy = frame < l1 ? 1.5 : tween(frame, l1 + 20, 90, 1.5, 2.0) + tween(frame, l2, 300, 0, 0.35);
  const shots = [
    { name: "画素の中央", x: 1.5, y: 1.5 },
    { name: "右寄り", x: 1.9, y: 1.5 },
    { name: "角", x: 2.0, y: 2.0 },
  ];
  return (
    <Stage chapter={chapter}>
      <div style={{ display: "flex", gap: 60, height: "100%" }}>
        <svg width={580} height={STAGE.h} style={{ flexShrink: 0 }}>
          <defs>
            <GlowDef />
          </defs>
          <text x={290} y={46} textAnchor="middle" fill={COLOR.text} fontSize={36} fontWeight={700}>
            星は少しずつ動いていく
          </text>
          <g transform="translate(10 70)">
            <PixelStar n={4} cell={140} sx={sx} sy={sy} />
          </g>
          <text x={290} y={674} textAnchor="middle" fill={COLOR.dim} fontSize={28}>
            四角 = 1画素
          </text>
        </svg>
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 40, opacity: ramp(frame, l1 - 10, 10) }}>
            {shots.map((s, i) => (
              <Reveal key={s.name} at={l1 + i * 35} style={{ textAlign: "center" }}>
                <svg width={300} height={300}>
                  <PixelStar n={3} cell={100} sx={s.x} sy={s.y} />
                </svg>
                <div style={{ fontSize: 38, fontWeight: 700, color: COLOR.accent, marginTop: 4 }}>{s.name}</div>
              </Reveal>
            ))}
          </div>
          <Reveal at={l2 + 40}>
            <Card>
              同じ星を、<b style={{ color: COLOR.accent }}>少しずつずれた物差し</b>で何百回も測っている
            </Card>
          </Reveal>
          <Reveal at={l2 + 190}>
            <Card color={COLOR.good}>
              全部合わせれば、<b style={{ color: COLOR.good }}>1画素より細かいこと</b>が分かる
            </Card>
          </Reveal>
          <Corner style={{ right: 0, bottom: 0 }} />
        </div>
      </div>
    </Stage>
  );
};

// ---- アルゴリズム ----
const G0 = { x: 20, y: 25 }; // 左の格子の左上
const F = 80; // 細かい升目の一辺
const DROP = 1.4; // 入力の1画素(細かい升目2つ分)を 0.7倍にした一辺
const FIRST = { from: { x: 5, y: 3 }, to: { x: 3.1, y: 4.2 } };
const RAIN = Array.from({ length: 24 }, (_, k) => ({ t: 485 + 9 * k, x: 1 + 6 * hash(k, 1, 10), y: 1 + 6 * hash(k, 2, 10) }));
const COLOR_AT = 690; // ここから色ごとの面の説明
const P = 40; // 色の面の升目の一辺
const PY = 215;
const PLANES = [
  { name: "赤の面", x: 740 },
  { name: "緑の面", x: 1100 },
  { name: "青の面", x: 1460 },
];
// 1枚目は色ごとに順に、2枚目はまとめて落とす
const FLIGHTS = [
  { n: 1, c: 0, s: 722, e: 750 },
  { n: 1, c: 1, s: 747, e: 775 },
  { n: 1, c: 2, s: 772, e: 800 },
  { n: 2, c: -1, s: 803, e: 828 },
];
/** n 枚目の画像のずれ(細かい升目の単位)。 */
const shift = (n: number) => (n === 1 ? [0, 0] : n === 2 ? [0.9, -0.6] : [4 * hash(n, 3, 77) - 2, 4 * hash(n, 4, 77) - 2]);
/** n 枚目の画素 (px, py) が落ちる中心。 */
const landing = (n: number, px: number, py: number) => [2 * px + 1 + shift(n)[0], 2 * py + 1 + shift(n)[1]];
const M = { x: G0.x + 32, y: G0.y + 64, cell: 144 }; // 入力の1枚(ベイヤー配列)の置き場所
const PIXELS = Array.from({ length: 16 }, (_, k) => ({ px: k % 4, py: Math.floor(k / 4), c: bayer(k % 4, Math.floor(k / 4)) }));
// 3枚目からは、図の外にある周りの画素も面に入ってくる
const AROUND = Array.from({ length: 64 }, (_, k) => ({ px: (k % 8) - 2, py: Math.floor(k / 8) - 2, c: bayer(k % 8, Math.floor(k / 8)) }));

/** 色ごとの面に積もった面積。first は1枚目のうち落ち終わった色、upto は落ち終わった枚数。 */
const coverage = (first: boolean[], upto: number) => {
  const cov = [0, 1, 2].map(() => new Float32Array(64));
  const add = (n: number, only: number) => {
    for (const p of n < 3 ? PIXELS : AROUND) {
      if (only >= 0 && p.c !== only) continue;
      const [cx, cy] = landing(n, p.px, p.py);
      if (cx < -1 || cy < -1 || cx > 9 || cy > 9) continue;
      for (let j = Math.max(0, Math.floor(cy - 0.7)); j <= Math.min(7, Math.floor(cy + 0.7)); j++) {
        for (let i = Math.max(0, Math.floor(cx - 0.7)); i <= Math.min(7, Math.floor(cx + 0.7)); i++) cov[p.c][j * 8 + i] += overlap(cx, cy, DROP, i, j);
      }
    }
  };
  first.forEach((done, c) => done && add(1, c));
  for (let n = 2; n <= upto; n++) add(n, -1);
  return cov;
};

// 2倍細かい格子に、縮めた画素を落として、重なった面積の分だけ足す
const Algorithm: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const show = (at: number, dur = 15) => ramp(frame, at, dur);
  const byColor = show(COLOR_AT, 25);

  // 最初の1滴: 現れる → 0.7倍に縮む → 計算した位置へ → 重なりを数える → 足す
  const [appear, shrink, move, added, gone] = [show(150, 20), show(195, 35), show(240, 35), show(405, 50), show(455, 20)];
  const first = { x: mix(FIRST.from.x, FIRST.to.x, move), y: mix(FIRST.from.y, FIRST.to.y, move), size: (2 - 0.6 * shrink) * F };
  const pieces = [
    [2, 3],
    [3, 3],
    [2, 4],
    [3, 4],
  ].map(([i, j], k) => ({ i, j, k, area: overlap(FIRST.to.x, FIRST.to.y, DROP, i, j) }));

  // 左の格子に積もった量
  const acc = new Float32Array(64);
  for (const d of [{ x: FIRST.to.x, y: FIRST.to.y, w: added }, ...RAIN.map((r) => ({ x: r.x, y: r.y, w: ramp(frame, r.t, 12) }))]) {
    if (d.w <= 0) continue;
    for (let k = 0; k < 64; k++) acc[k] += d.w * overlap(d.x, d.y, DROP, k % 8, Math.floor(k / 8));
  }

  // 色ごとの面
  const landed = [frame >= 750, frame >= 775, frame >= 800];
  const count = frame < 828 ? 1 : Math.min(300, 2 + Math.floor(298 * (Math.max(0, frame - 834) / 48) ** 2));
  const cov = useMemo(() => coverage(landed, count), [landed.join(), count]);
  const flying = FLIGHTS.filter((f) => frame >= f.s && frame < f.e + 16);

  return (
    <Stage chapter={chapter}>
      <svg width={STAGE.w} height={STAGE.h} style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          {PLANES.map((p, c) => (
            <clipPath key={p.name} id={`ch10-plane${c}`}>
              <rect x={p.x} y={PY} width={8 * P} height={8 * P} />
            </clipPath>
          ))}
        </defs>

        {/* 左: 出力の格子 */}
        <g transform={`translate(${G0.x} ${G0.y})`} opacity={1 - byColor}>
          <rect width={8 * F} height={8 * F} fill="#070a14" />
          {Array.from(acc, (v, k) => (
            <rect key={k} x={(k % 8) * F} y={Math.floor(k / 8) * F} width={F} height={F} fill={COLOR.accent} opacity={Math.min(1, v * 0.6)} />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${i * F} 0 V${8 * F} M0 ${i * F} H${8 * F}`} stroke={i % 2 ? COLOR.dim : COLOR.text} strokeWidth={i % 2 ? 2 : 3} opacity={i % 2 ? 0.8 * show(60, 30) : 0.9} />
          ))}
          {/* 雨つぶ */}
          {RAIN.map((r, k) => {
            const fall = Math.min(1, (frame - (r.t - 12)) / 12);
            if (fall <= 0) return null;
            const size = DROP * F * (1 + 0.6 * (1 - fall));
            return <rect key={k} x={r.x * F - size / 2} y={r.y * F - size / 2 - (1 - fall) * 50} width={size} height={size} fill={COLOR.accent} fillOpacity={0.3} stroke="#fff" strokeWidth={3} opacity={fall * (1 - ramp(frame, r.t + 2, 14))} />;
          })}
          {/* 最初の1滴 */}
          <rect x={(FIRST.from.x - 1) * F} y={(FIRST.from.y - 1) * F} width={2 * F} height={2 * F} fill="none" stroke={COLOR.accent} strokeWidth={3} strokeDasharray="8 8" opacity={Math.min(appear, shrink * 3) * (1 - show(285, 20))} />
          <g opacity={show(232, 10) * (1 - show(285, 15))}>
            <path d={`M${FIRST.to.x * F - 18} ${FIRST.to.y * F} h36 M${FIRST.to.x * F} ${FIRST.to.y * F - 18} v36`} stroke={COLOR.warn} strokeWidth={5} />
            <text x={FIRST.to.x * F + 30} y={FIRST.to.y * F + 104} fill={COLOR.warn} fontSize={30} fontWeight={700} stroke="#05070d" strokeWidth={6} paintOrder="stroke">
              計算した位置
            </text>
          </g>
          <rect x={first.x * F - first.size / 2} y={first.y * F - first.size / 2} width={first.size} height={first.size} fill={COLOR.accent} fillOpacity={0.3} stroke="#fff" strokeWidth={4} opacity={appear * (1 - gone)} />
          <text x={first.x * F} y={first.y * F + 11} textAnchor="middle" fill="#fff" fontSize={30} fontWeight={700} opacity={appear * (1 - shrink)}>
            元の1画素
          </text>
          <text x={first.x * F} y={first.y * F + 13} textAnchor="middle" fill="#fff" fontSize={36} fontWeight={800} opacity={shrink * (1 - show(240, 12))}>
            0.7倍
          </text>
          {/* 下の升目と重なった部分と、その割合 */}
          {pieces.map((p) => {
            const [x0, x1] = [Math.max(FIRST.to.x - DROP / 2, p.i), Math.min(FIRST.to.x + DROP / 2, p.i + 1)];
            const [y0, y1] = [Math.max(FIRST.to.y - DROP / 2, p.j), Math.min(FIRST.to.y + DROP / 2, p.j + 1)];
            const on = show(300 + p.k * 25, 12);
            return (
              <g key={p.k}>
                <rect x={x0 * F} y={y0 * F} width={(x1 - x0) * F} height={(y1 - y0) * F} fill={COLOR.warn} stroke="#05070d" strokeWidth={2} opacity={0.75 * on * (1 - show(430, 30))} />
                <text x={(p.i + 0.5) * F} y={(p.j + 0.5) * F + 11} textAnchor="middle" fill="#fff" fontSize={30} fontWeight={800} stroke="#05070d" strokeWidth={6} paintOrder="stroke" opacity={on * (1 - show(465, 18))}>
                  {Math.round((100 * p.area) / (DROP * DROP))}%
                </text>
              </g>
            );
          })}
        </g>

        {/* 色ごとの面へ落とす */}
        <g opacity={byColor}>
          <text x={M.x + 2 * M.cell} y={M.y - 22} textAnchor="middle" fill={COLOR.text} fontSize={36} fontWeight={700}>
            入力の1枚(ベイヤー配列)
          </text>
          <g transform={`translate(${M.x} ${M.y})`}>
            {PIXELS.map((p) => {
              const active = flying.some((f) => frame < f.e && (f.c < 0 || f.c === p.c));
              return (
                <g key={`${p.px}${p.py}`}>
                  <rect x={p.px * M.cell + 4} y={p.py * M.cell + 4} width={M.cell - 8} height={M.cell - 8} rx={8} fill={RGB[p.c]} opacity={active ? 0.9 : 0.5} />
                  <text x={(p.px + 0.5) * M.cell} y={(p.py + 0.5) * M.cell + 14} textAnchor="middle" fill="#05070d" fontSize={40} fontWeight={800}>
                    {"赤緑青"[p.c]}
                  </text>
                </g>
              );
            })}
          </g>
          {PLANES.map((p, c) => (
            <g key={p.name}>
              <text x={p.x + 4 * P} y={PY - 18} textAnchor="middle" fill={RGB[c]} fontSize={38} fontWeight={700}>
                {p.name}
              </text>
              <rect x={p.x} y={PY} width={8 * P} height={8 * P} fill="#070a14" />
              {Array.from(cov[c], (v, k) => (
                <rect key={k} x={p.x + (k % 8) * P} y={PY + Math.floor(k / 8) * P} width={P} height={P} fill={RGB[c]} opacity={1 - Math.exp(-v / 3)} />
              ))}
              {Array.from({ length: 9 }, (_, i) => (
                <path key={i} d={`M${p.x + i * P} ${PY} v${8 * P} M${p.x} ${PY + i * P} h${8 * P}`} stroke={COLOR.dim} strokeWidth={1.5} opacity={0.7} />
              ))}
              {/* いま落ちている枚の正方形(面の外にはみ出す分は切る) */}
              <g clipPath={`url(#ch10-plane${c})`}>
                {count >= 3 &&
                  AROUND.filter((q) => q.c === c).map((q) => {
                    const [cx, cy] = landing(count, q.px, q.py);
                    return <rect key={`${q.px}${q.py}`} x={p.x + (cx - DROP / 2) * P} y={PY + (cy - DROP / 2) * P} width={DROP * P} height={DROP * P} fill="none" stroke="#fff" strokeWidth={2} opacity={0.7} />;
                  })}
              </g>
            </g>
          ))}
          {/* 左の画素が、縮みながら自分の色の面へ飛ぶ */}
          {flying.flatMap((f) =>
            PIXELS.filter((q) => f.c < 0 || f.c === q.c).map((q) => {
              const t = ramp(frame, f.s, f.e - f.s);
              const [cx, cy] = landing(f.n, q.px, q.py);
              const size = mix(M.cell, DROP * P, t);
              const x = mix(M.x + (q.px + 0.5) * M.cell, PLANES[q.c].x + cx * P, t) - size / 2;
              const y = mix(M.y + (q.py + 0.5) * M.cell, PY + cy * P, t) - size / 2;
              const box = { x, y, width: size, height: size, fill: RGB[q.c], fillOpacity: 0.55, stroke: "#fff", strokeWidth: 3 };
              return (
                <g key={`${f.s}-${q.px}${q.py}`}>
                  <rect {...box} opacity={frame < f.e ? (1 - t ** 3) * (1 - 0.7 * Math.sin(Math.PI * t)) : 0} />
                  <g clipPath={`url(#ch10-plane${q.c})`}>
                    <rect {...box} opacity={t * (1 - ramp(frame, f.e, 16))} />
                  </g>
                </g>
              );
            }),
          )}
          <text x={1260} y={622} textAnchor="middle" fill={COLOR.text} fontSize={44} fontWeight={700} opacity={show(722, 10)}>
            重ねた枚数: <tspan fill={COLOR.accent}>{count}枚</tspan>
          </text>
        </g>
      </svg>

      {/* 右: 手順 */}
      <div style={{ position: "absolute", left: 720, top: 0, width: 1060, display: "flex", flexDirection: "column", gap: 16, opacity: 1 - byColor }}>
        <Reveal at={60}>
          <Card>
            出力する画像のマス目を <b style={{ color: COLOR.accent, fontSize: 48 }}>2倍</b> 細かくする
          </Card>
        </Reveal>
        <Reveal at={165}>
          <Card>
            元の画素を <b style={{ color: COLOR.accent, fontSize: 48 }}>0.7倍</b> の正方形にして、計算した位置に落とす
          </Card>
        </Reveal>
        <Reveal at={290}>
          <Card color={COLOR.warn}>
            下のマス目と<b style={{ color: COLOR.warn }}>重なった面積の分だけ</b>、数字を足す
          </Card>
        </Reveal>
        <Reveal at={495}>
          <Card>雨つぶのように、1枚ずつ落としていく</Card>
        </Reveal>
        <Reveal at={640}>
          <Card color={COLOR.accent} style={{ fontSize: 48, fontWeight: 800 }}>
            ドリズル <span style={{ fontSize: 36, fontWeight: 500, color: COLOR.dim }}>(drizzle = 霧雨)</span>
          </Card>
        </Reveal>
      </div>
      <div style={{ position: "absolute", left: 720, top: 0, width: 1060, opacity: byColor }}>
        <Card color={COLOR.accent} style={{ padding: "12px 28px" }}>
          <b style={{ color: COLOR.accent }}>ドリズル</b>: 周りと混ぜない。色も推測しない。
          <div style={{ opacity: show(805) }}>
            <b style={{ color: COLOR.r }}>赤の画素</b>は、<b style={{ color: COLOR.r }}>赤の面</b>にだけ落とす
          </div>
        </Card>
      </div>
      <Corner style={{ right: 0, bottom: 0 }} />
    </Stage>
  );
};

// 宇宙望遠鏡が、少しずつ向きをずらして何枚も撮る
const DITHER = [
  [0, 0],
  [0.3, 0.1],
  [0.1, 0.35],
  [-0.25, 0.2],
  [-0.15, -0.3],
  [0.35, -0.25],
  [-0.35, -0.05],
];
const Hubble: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const l1 = lineAt(scene, 1);
  const [start, every] = [240, 38];
  const k = frame < start ? 0 : Math.min(DITHER.length - 1, 1 + Math.floor((frame - start) / every));
  const t = k === 0 ? 1 : ramp(frame, start + (k - 1) * every, 14);
  const [dx, dy] = k === 0 ? [0, 0] : [mix(DITHER[k - 1][0], DITHER[k][0], t), mix(DITHER[k - 1][1], DITHER[k][1], t)];
  const show = (at: number) => ramp(frame, at, 15);
  const sky = useMemo(() => Array.from({ length: 36 }, (_, i) => ({ x: 20 + 680 * hash(i, 1, 5), y: 10 + 560 * hash(i, 2, 5), r: 1.5 + 2.5 * hash(i, 3, 5), phase: 6 * hash(i, 4, 5) })), []);
  const panel = (y: number) => (
    <g>
      <rect x={-70} y={y} width={120} height={140} fill="#1f3d7a" stroke="#6f8fd0" strokeWidth={3} />
      <path d={`M-30 ${y} v140 M10 ${y} v140 M-70 ${y + 47} h120 M-70 ${y + 93} h120`} stroke="#6f8fd0" strokeWidth={1.5} />
    </g>
  );
  return (
    <Stage chapter={chapter}>
      <svg width={STAGE.w} height={STAGE.h}>
        <defs>
          <GlowDef />
        </defs>
        {sky.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfe0ff" opacity={0.35 + 0.25 * Math.sin(frame / 14 + s.phase)} />
        ))}
        {/* 望遠鏡: 向きが少しずつ変わる */}
        <g transform={`translate(330 310) rotate(${-8 + dx * 9 + 0.6 * Math.sin(frame / 50)})`}>
          <polygon points="155,-45 430,-78 430,78 155,45" fill={COLOR.accent} opacity={0.12 * show(130)} />
          <path d="M-10 -75 V-55 M-10 75 V55" stroke="#8b95ad" strokeWidth={8} />
          {panel(-215)}
          {panel(75)}
          <rect x={-180} y={-55} width={330} height={110} rx={10} fill="#c3cada" />
          <rect x={-215} y={-66} width={110} height={132} rx={12} fill="#9aa4bb" />
          <path d="M-20 -55 V55 M60 -55 V55" stroke="#8b95ad" strokeWidth={4} />
          <ellipse cx={150} cy={0} rx={10} ry={52} fill="#0a0e1a" />
          <polygon points="150,-55 215,-100 222,-90 158,-45" fill="#aab3c8" />
        </g>
        <text x={330} y={610} textAnchor="middle" fill={COLOR.text} fontSize={42} fontWeight={700}>
          ハッブル宇宙望遠鏡
        </text>
        {/* カメラの粗い画素 */}
        <g opacity={show(130)}>
          <text x={1010} y={48} textAnchor="middle" fill={COLOR.warn} fontSize={36} fontWeight={700}>
            画素が粗すぎる
          </text>
          <g transform="translate(760 70)">
            <PixelStar n={5} cell={100} sx={2.5 + dx} sy={2.5 + dy} />
          </g>
          <text x={1010} y={622} textAnchor="middle" fill={COLOR.text} fontSize={40} fontWeight={700} opacity={show(start)}>
            {k + 1}枚目
          </text>
        </g>
        {/* 1画素の中で、星が落ちた位置 */}
        <g opacity={show(start)}>
          <text x={1540} y={110} textAnchor="middle" fill={COLOR.text} fontSize={32}>
            1画素の中で
          </text>
          <text x={1540} y={152} textAnchor="middle" fill={COLOR.text} fontSize={32}>
            星が落ちた位置
          </text>
          <rect x={1410} y={180} width={260} height={260} fill="#070a14" stroke={COLOR.dim} strokeWidth={3} />
          {DITHER.slice(0, k + 1).map((d, i) => {
            const on = i < k ? 1 : t;
            return <circle key={i} cx={1410 + (0.5 + d[0]) * 260} cy={180 + (0.5 + d[1]) * 260} r={i === k ? 16 - 4 * t : 12} fill={i === k ? COLOR.warn : COLOR.accent} opacity={on} />;
          })}
          <text x={1540} y={492} textAnchor="middle" fill={COLOR.accent} fontSize={32} fontWeight={700}>
            向きを少しずつずらす
          </text>
        </g>
      </svg>
      <Reveal at={l1 + 10} style={{ position: "absolute", right: 150, bottom: 0 }}>
        <Card color={COLOR.good} style={{ padding: "12px 28px" }}>
          同じ技を、<b style={{ color: COLOR.good }}>スマホの写真</b>に
        </Card>
      </Reveal>
      <Corner style={{ right: 0, bottom: 0 }} />
    </Stage>
  );
};

// 以前の方法(左)と 2倍ドリズル(右)。同じ場所・同じ表示サイズ
const MARKS = [
  { x: 437, y: 540, r: 64 }, // 3つの明るい星がつながって見える所
  { x: 535, y: 372, r: 52 }, // 明るい星とすぐ隣の星
];
const Result: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const l1 = lineAt(scene, 1);
  const S = 600;
  const progress = ramp(frame, 15, 90);
  const ring = ramp(frame, 110, 20);
  const shot = (src: string, label: string, color: string) => (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <Photo src={src} w={S} h={S} aspect={1} from={{ zoom: 1, x: 0.5, y: 0.5 }} to={{ zoom: 2, x: 0.52, y: 0.52 }} progress={progress}>
        <svg viewBox="0 0 880 880" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {MARKS.map((m) => (
            <circle key={m.x} cx={m.x} cy={m.y} r={m.r + 2 * Math.sin(frame / 10)} fill="none" stroke={COLOR.warn} strokeWidth={3} opacity={ring} />
          ))}
        </svg>
      </Photo>
      <Tag color={color} style={{ position: "absolute", left: 12, top: 12 }}>
        {label}
      </Tag>
    </div>
  );
  return (
    <Stage chapter={chapter}>
      <div style={{ display: "flex", gap: 30 }}>
        {shot("img/drizzle_1x.png", "以前の方法", COLOR.dim)}
        {shot("img/drizzle_2x.png", "2倍ドリズル", COLOR.accent)}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, marginLeft: 10 }}>
          <Reveal at={50}>
            <Card style={{ fontSize: 34 }}>星の像が小さく引き締まる</Card>
          </Reveal>
          <Reveal at={110}>
            <Card color={COLOR.warn} style={{ fontSize: 34 }}>
              <b style={{ color: COLOR.warn }}>丸の中</b>: くっついていた星のあいだに、くびれが見える
            </Card>
          </Reveal>
          <Reveal at={l1 + 130}>
            <Card color={COLOR.good} style={{ fontSize: 34 }}>
              暗い星を見つけられる割合
              <div style={{ color: COLOR.good, fontSize: 46, fontWeight: 800 }}>+3〜4ポイント</div>
              <div style={{ color: COLOR.dim, fontSize: 28 }}>別のレンズで測った値</div>
            </Card>
          </Reveal>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: 618, width: 2 * 600 + 30, textAlign: "center", fontSize: 30, color: COLOR.dim }}>実際の画像(同じ場所・同じ表示サイズ)</div>
    </Stage>
  );
};

// いいことばかりではない: 表と、傾く天びん
const Honest: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const l1 = lineAt(scene, 1);
  const rows = [
    { name: "星のシャープさ", value: "向上", color: COLOR.good, at: 8 },
    { name: "暗い星の検出率", value: "+3〜4ポイント", color: COLOR.good, at: 30 },
    { name: "S/N比(星の光とノイズの比)", value: "2〜6% 低下", color: COLOR.bad, at: 95 },
  ];
  // 天びんが揺れながら傾く
  const tilt = ramp(frame, 100, 50) * (9 + 4 * Math.exp(-Math.max(0, frame - 150) / 50) * Math.cos((frame - 150) / 9));
  return (
    <Stage chapter={chapter} title="2倍ドリズルの効果">
      <div style={{ display: "flex", gap: 50, height: "100%" }}>
        <div style={{ width: 1040, display: "flex", flexDirection: "column", gap: 20, paddingTop: 30 }}>
          {rows.map((r) => (
            <Reveal key={r.name} at={r.at}>
              <Card color={r.color} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 40, padding: "26px 34px" }}>
                <span>{r.name}</span>
                <b style={{ color: r.color, fontSize: 54 }}>{r.value}</b>
              </Card>
            </Reveal>
          ))}
          <div style={{ fontSize: 28, color: COLOR.dim, opacity: ramp(frame, 40, 15) }}>※ 別のレンズで測った値</div>
        </div>
        <svg width={710} height={STAGE.h}>
          <g opacity={ramp(frame, 60, 20)}>
            <polygon points="355,330 315,470 395,470" fill={COLOR.dim} />
            <g transform={`rotate(${tilt} 355 330)`}>
              <rect x={95} y={322} width={520} height={16} rx={8} fill={COLOR.text} />
              <rect x={75} y={200} width={220} height={120} rx={14} fill={COLOR.panel} stroke={COLOR.good} strokeWidth={4} />
              <text x={185} y={250} textAnchor="middle" fill={COLOR.good} fontSize={32} fontWeight={700}>
                シャープさ
              </text>
              <text x={185} y={296} textAnchor="middle" fill={COLOR.good} fontSize={32} fontWeight={700}>
                検出率
              </text>
              <rect x={415} y={234} width={220} height={86} rx={14} fill={COLOR.panel} stroke={COLOR.bad} strokeWidth={4} />
              <text x={525} y={290} textAnchor="middle" fill={COLOR.bad} fontSize={34} fontWeight={700}>
                S/N比
              </text>
            </g>
          </g>
          <text x={355} y={580} textAnchor="middle" fill={COLOR.text} fontSize={50} fontWeight={800} opacity={ramp(frame, l1 + 20, 15)}>
            魔法ではなく、<tspan fill={COLOR.warn}>取引</tspan>
          </text>
        </svg>
      </div>
    </Stage>
  );
};

// 「章ID/場面名」→ 場面の絵
export const ch10: Record<string, SceneView> = {
  "10_drizzle/現象": Phenomenon,
  "10_drizzle/問題": Problem,
  "10_drizzle/アイデア": Idea,
  "10_drizzle/アルゴリズム": Algorithm,
  "10_drizzle/脱線 ハッブル宇宙望遠鏡": Hubble,
  "10_drizzle/結果": Result,
  "10_drizzle/正直な話": Honest,
};
