import { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { SimSky } from "../components/SimSky";
import { Card, Photo, Reveal, Stage, Tag } from "../components/ui";
import { SIM, isHouse, rawFrame, staticScene } from "../sim/sky";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, through, tween } from "../timing";
import type { SceneView } from "../types";
import { BeforeAfter, Corner } from "./ch09_parts";

// 重ねた直後(イメージ)→ 色を直した後。右に「星の色 = 表面の温度」
const Color: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [l1, l2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const split = frame < l1 ? tween(frame, 150, 70, 1, 0.5) : tween(frame, l1, 50, 0.5, 0);
  const pulse = 3 * Math.sin(frame / 11);
  const stars = [
    { x: 220, color: "#ff9d52", name: "オレンジ色の星", temp: "数千度", r: 44 - pulse },
    { x: 830, color: "#bcd3ff", name: "青白い星", temp: "1万度超", r: 44 + pulse },
  ];
  return (
    <Stage chapter={chapter}>
      {/* 白バランス前を真似る色変換(緑が強く、全体に暗い) */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id="ch09-raw" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.50 0 0 0 0.008  0 0.74 0 0 0.025  0 0 0.44 0 0.006  0 0 0 1 0" />
        </filter>
      </svg>
      <div style={{ display: "flex", gap: 60, height: "100%" }}>
        <BeforeAfter src="img/c_final.jpg" size={STAGE.h} split={split} filter="url(#ch09-raw)" before="重ねた直後(イメージ)" after="色を直した後(実際の画像)" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
          <Reveal at={150}>
            <Card>
              RAWファイルに記録された<b style={{ color: COLOR.accent }}>色の情報</b>で、正しい色に直す
            </Card>
          </Reveal>
          <Reveal at={l2} style={{ position: "relative" }}>
            <svg width={1050} height={470} style={{ background: COLOR.panel, borderRadius: 18 }}>
              <defs>
                <linearGradient id="ch09-temp" x1="0" x2="1">
                  <stop offset="0" stopColor="#ff8a3c" />
                  <stop offset="0.45" stopColor="#ffe9cf" />
                  <stop offset="0.7" stopColor="#ffffff" />
                  <stop offset="1" stopColor="#9fc0ff" />
                </linearGradient>
                {stars.map((s) => (
                  <radialGradient key={s.x} id={`ch09-star${s.x}`}>
                    <stop offset="0" stopColor="#fff" />
                    <stop offset="0.35" stopColor={s.color} />
                    <stop offset="1" stopColor={s.color} stopOpacity="0" />
                  </radialGradient>
                ))}
              </defs>
              <text x={525} y={70} textAnchor="middle" fill={COLOR.text} fontSize={46} fontWeight={700}>
                星の色 = 表面の温度
              </text>
              {stars.map((s, i) => (
                <g key={s.x} opacity={ramp(frame, l2 + 60 + i * 110, 20)}>
                  <circle cx={s.x} cy={190} r={s.r * 1.7} fill={`url(#ch09-star${s.x})`} />
                  <line x1={s.x} y1={270} x2={s.x} y2={296} stroke={s.color} strokeWidth={4} />
                  <text x={s.x} y={392} textAnchor="middle" fill={s.color} fontSize={36} fontWeight={700}>
                    {s.name}
                  </text>
                  <text x={s.x} y={446} textAnchor="middle" fill={COLOR.text} fontSize={46} fontWeight={800}>
                    {s.temp}
                  </text>
                </g>
              ))}
              <rect x={80} y={300} width={890} height={26} rx={13} fill="url(#ch09-temp)" />
              <text x={525} y={372} textAnchor="middle" fill={COLOR.dim} fontSize={30}>
                低い ← 温度 → 高い
              </text>
            </svg>
            <Corner />
          </Reveal>
        </div>
      </div>
    </Stage>
  );
};

// 明るさの変換カーブ(asinh 型)と、調整前後
const Brightness: SceneView = ({ chapter }) => {
  const frame = useCurrentFrame();
  const K = 40;
  const curve = (x: number) => Math.asinh(K * x) / Math.asinh(K);
  const [x0, y0, w, h] = [130, 590, 640, 500];
  const px = (x: number) => x0 + x * w;
  const py = (y: number) => y0 - y * h;
  const path = useMemo(() => Array.from({ length: 121 }, (_, i) => `${i ? "L" : "M"}${px((i / 120) ** 2).toFixed(1)} ${py(curve((i / 120) ** 2)).toFixed(1)}`).join(" "), []);
  // 曲線の上を動く点: 暗い側から明るい側へ
  const u = ramp(frame, 95, 150) ** 2;
  const dot = { x: px(u), y: py(curve(u)) };
  return (
    <Stage chapter={chapter} title="明るさの変換カーブ">
      <div style={{ display: "flex", gap: 50, height: "100%", alignItems: "center" }}>
        <div style={{ position: "relative", width: 850, height: STAGE.h }}>
          <svg width={850} height={STAGE.h}>
            <path d={`M${x0} ${py(1) - 30} V${y0} H${px(1) + 30}`} fill="none" stroke={COLOR.dim} strokeWidth={3} />
            <line x1={x0} y1={y0} x2={px(1)} y2={py(1)} stroke={COLOR.line} strokeWidth={3} strokeDasharray="10 10" />
            <path d={path} fill="none" stroke={COLOR.accent} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ramp(frame, 15, 70)} />
            <g opacity={ramp(frame, 90, 10)}>
              <path d={`M${dot.x} ${y0} V${dot.y} H${x0}`} fill="none" stroke={COLOR.warn} strokeWidth={3} strokeDasharray="6 6" />
              <circle cx={dot.x} cy={dot.y} r={13} fill={COLOR.warn} />
            </g>
            <text x={px(0.5)} y={y0 + 62} textAnchor="middle" fill={COLOR.text} fontSize={34}>
              元の明るさ →
            </text>
            <text transform={`translate(${x0 - 50} ${py(0.5)}) rotate(-90)`} textAnchor="middle" fill={COLOR.text} fontSize={34}>
              調整後の明るさ →
            </text>
            <text x={px(0.66)} y={py(0.57)} fill={COLOR.dim} fontSize={28}>
              変換なし
            </text>
          </svg>
          <Tag color={COLOR.good} style={{ position: "absolute", left: 250, top: 400, opacity: ramp(frame, 70, 15) }}>
            暗いところは大きく持ち上げる
          </Tag>
          <Tag color={COLOR.warn} style={{ position: "absolute", left: 420, top: 20, opacity: ramp(frame, 150, 15) }}>
            明るいところは抑える
          </Tag>
        </div>
        <BeforeAfter src="img/c_final.jpg" size={620} split={tween(frame, 100, 110, 1, 0.56)} filter="brightness(0.35)" before="調整前(イメージ)" after="調整後(実際の画像)" />
      </div>
    </Stage>
  );
};

// sky.ts と同じ回転の中心(家のぶれを作るために使う)
const PIVOT = { x: SIM.w + 40, y: SIM.h + 110 };

/** 前景の説明に使う3枚: 星に合わせて重ねた空(家はぶれる)、静止シーンの家の切り出し、合成。 */
const foreground = () => {
  const opt = { pollution: 0.25, vignette: 0.3, hot: false };
  const sky = rawFrame({ ...opt, stack: 60, starGain: 1.6 });
  const still = staticScene({ ...opt, house: true });
  const [aligned, cut, composite] = [new Float32Array(sky.length), new Float32Array(sky.length), new Float32Array(sky.length)];
  const [steps, span] = [24, 0.26];
  for (let y = 0; y < SIM.h; y++) {
    for (let x = 0; x < SIM.w; x++) {
      // 星に合わせて回しながら重ねると、家は弧の形に引き伸ばされる
      let cover = 0;
      for (let s = 0; s < steps; s++) {
        const a = (s / (steps - 1) - 0.5) * span;
        const [dx, dy] = [x - PIVOT.x, y - PIVOT.y];
        cover += isHouse(Math.round(PIVOT.x + dx * Math.cos(a) - dy * Math.sin(a)), Math.round(PIVOT.y + dx * Math.sin(a) + dy * Math.cos(a))) ? 1 : 0;
      }
      cover /= steps;
      const fg = isHouse(x, y);
      for (let c = 0; c < 3; c++) {
        const k = (y * SIM.w + x) * 3 + c;
        aligned[k] = sky[k] * (1 - cover) + 0.6 * cover;
        cut[k] = fg ? still[k] : still[k] * 0.25;
        composite[k] = fg ? still[k] : sky[k];
      }
    }
  }
  return { aligned, still, cut, composite };
};

// 星に合わせた空と、静止シーンから切り出した家を合成する
const Foreground: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const img = useMemo(foreground, []);
  const l1 = lineAt(scene, 1);
  const range = { lo: 0.2, hi: 5 };
  const [small, big] = [2.2, 4.3];
  const [sw, sh] = [SIM.w * small, SIM.h * small];
  const bx = STAGE.w - SIM.w * big;
  const merged = ramp(frame, 165, 40);
  const stacked = { position: "absolute", left: 0, top: 0 } as const;
  return (
    <Stage chapter={chapter}>
      <div style={{ position: "absolute", left: 0, top: 0, width: sw, height: sh }}>
        <SimSky image={img.aligned} scale={small} {...range} />
        <Tag style={{ position: "absolute", left: 10, top: 10 }}>星に合わせて重ねた空</Tag>
        <Tag color={COLOR.warn} style={{ position: "absolute", left: 10, bottom: 10, opacity: ramp(frame, 45, 15) }}>
          家はぶれている
        </Tag>
      </div>
      <Reveal at={75} style={{ position: "absolute", left: 0, top: STAGE.h - sh, width: sw, height: sh }}>
        <SimSky image={img.still} scale={small} {...range} />
        <SimSky image={img.cut} scale={small} {...range} style={{ ...stacked, opacity: ramp(frame, 125, 25) }} />
        <Tag color={COLOR.good} style={{ position: "absolute", left: 10, top: 10 }}>
          静止シーン
        </Tag>
        <Tag color={COLOR.good} style={{ position: "absolute", left: 10, bottom: 10, opacity: ramp(frame, 125, 15) }}>
          景色を切り出す
        </Tag>
      </Reveal>
      {/* 2枚から合成へ向かう矢印 */}
      <svg width={STAGE.w} height={STAGE.h} style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          {[COLOR.accent, COLOR.good].map((color, i) => (
            <marker key={color} id={`ch09-head${i}`} markerWidth={5} markerHeight={5} refX={3.4} refY={2.5} orient="auto">
              <path d="M0 0 L5 2.5 L0 5 Z" fill={color} />
            </marker>
          ))}
        </defs>
        {[sh / 2, STAGE.h - sh / 2].map((y, i) => (
          <line key={y} x1={sw + 18} y1={y} x2={bx - 20} y2={STAGE.h / 2 - 60 + i * 60} stroke={i ? COLOR.good : COLOR.accent} strokeWidth={7} markerEnd={`url(#ch09-head${i})`} opacity={ramp(frame, 150 + i * 12, 15)} />
        ))}
      </svg>
      <div style={{ position: "absolute", left: bx, top: 0, width: SIM.w * big, height: SIM.h * big, opacity: ramp(frame, 20, 20) }}>
        <SimSky image={img.aligned} scale={big} {...range} />
        <SimSky image={img.composite} scale={big} {...range} style={{ ...stacked, opacity: merged }} />
        <Tag style={{ position: "absolute", left: 14, top: 14, opacity: merged }}>星空 + 静止シーンの景色 = 完成</Tag>
        <Corner />
      </div>
      <div style={{ position: "absolute", left: bx, top: SIM.h * big + 12, width: SIM.w * big, fontSize: 36, color: COLOR.text, opacity: ramp(frame, l1 + 20, 15) }}>
        星を消すために作った<b style={{ color: COLOR.good }}>静止シーン</b>を、最後は景色として使う
      </div>
    </Stage>
  );
};

// 等級の物差し: 1〜6等が肉眼、9等が今回の限界
const Magnitude: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [l1, l2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const X = (m: number) => 180 + (m - 1) * 180;
  const show = (at: number, dur = 15) => ramp(frame, at, dur);
  const bracket = (a: number, b: number, y: number, tip: number) => `M${X(a)} ${y + tip} V${y} H${X(b)} V${y + tip}`;
  return (
    <Stage chapter={chapter}>
      <svg width={STAGE.w} height={STAGE.h}>
        <text x={900} y={70} textAnchor="middle" fill={COLOR.text} fontSize={44} fontWeight={700} opacity={show(10)}>
          「肉眼の限界より
          <tspan fill={COLOR.accent}> 約16倍 </tspan>
          暗い星」とは?
        </text>
        {/* 物差し */}
        <g opacity={show(l1)}>
          <line x1={120} y1={370} x2={1700} y2={370} stroke={COLOR.dim} strokeWidth={4} />
          <text x={66} y={310} textAnchor="middle" fill={COLOR.dim} fontSize={28}>
            明るい
          </text>
        </g>
        {Array.from({ length: 9 }, (_, i) => i + 1).map((m) => {
          const at = m <= 6 ? l1 + 20 + m * 14 : l2 + 110 + (m - 6) * 10;
          const r = 34 * Math.pow(0.7, m - 1) * (1 + 0.06 * Math.sin(frame / 9 + m * 2));
          return (
            <g key={m} opacity={show(at)}>
              <circle cx={X(m)} cy={300} r={r * 1.5} fill="#cfe0ff" opacity={0.25} />
              <circle cx={X(m)} cy={300} r={r} fill="#fff" />
              <line x1={X(m)} y1={356} x2={X(m)} y2={384} stroke={COLOR.dim} strokeWidth={4} />
              <text x={X(m)} y={428} textAnchor="middle" fill={m === 9 ? COLOR.accent : COLOR.text} fontSize={38} fontWeight={m === 6 || m === 9 ? 800 : 500}>
                {m}等
              </text>
            </g>
          );
        })}
        <text x={180} y={140} fill={COLOR.dim} fontSize={30} opacity={show(l1 + 70)}>
          ヒッパルコス(古代ギリシャ): 一番明るい星を1等、やっと見える星を6等
        </text>
        <g opacity={show(l1 + 170)}>
          <path d={bracket(1, 6, 215, 12)} fill="none" stroke={COLOR.good} strokeWidth={4} />
          <text x={(X(1) + X(6)) / 2} y={198} textAnchor="middle" fill={COLOR.good} fontSize={38} fontWeight={700}>
            肉眼で見える
          </text>
        </g>
        {/* 5等級で100倍 */}
        <g opacity={show(l2 + 25)}>
          <path d={bracket(1, 6, 468, -14)} fill="none" stroke={COLOR.warn} strokeWidth={4} />
          <text x={(X(1) + X(6)) / 2} y={526} textAnchor="middle" fill={COLOR.warn} fontSize={44} fontWeight={700}>
            5等級の差 = ちょうど100倍
          </text>
        </g>
        {/* 今回の限界 */}
        <g opacity={show(l2 + 140)}>
          <text x={X(9)} y={198} textAnchor="middle" fill={COLOR.accent} fontSize={38} fontWeight={700}>
            今回の写真の限界
          </text>
          <path d={`M${X(9)} 212 V268 M${X(9) - 12} 254 L${X(9)} 270 L${X(9) + 12} 254`} fill="none" stroke={COLOR.accent} strokeWidth={4} />
        </g>
        {/* 6等 → 9等: 1等級ごとに約2.5倍 */}
        {[6, 7, 8].map((m, i) => (
          <g key={m} opacity={show(l2 + 215 + i * 22)}>
            <path d={`M${X(m) + 14} 452 Q${X(m) + 90} 508 ${X(m + 1) - 14} 452`} fill="none" stroke={COLOR.accent} strokeWidth={4} />
            <text x={X(m) + 90} y={526} textAnchor="middle" fill={COLOR.accent} fontSize={30}>
              約2.5倍
            </text>
          </g>
        ))}
        <g opacity={show(l2 + 285)}>
          <path d={bracket(6, 9, 566, -14)} fill="none" stroke={COLOR.accent} strokeWidth={4} />
          <text x={(X(6) + X(9)) / 2} y={636} textAnchor="middle" fill={COLOR.text} fontSize={48} fontWeight={800}>
            3等級の差 →<tspan fill={COLOR.accent}> およそ16倍</tspan>
          </text>
        </g>
      </svg>
    </Stage>
  );
};

// アンドロメダ銀河の拡大と、250万光年
const Andromeda: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [l2, l3] = [lineAt(scene, 2), lineAt(scene, 3)];
  const progress = 0.9 * ramp(frame, 10, 150) + 0.1 * through(frame, scene);
  const ring = ramp(frame, 20, 20) * (0.6 + 0.3 * Math.sin(frame / 10));
  // 光の粒が銀河からスマホへ進む
  const travel = ramp(frame, l2 + 150, l3 + 40 - (l2 + 150));
  const lx = 190 + travel * 650;
  const arrived = ramp(frame, l3 + 35, 15);
  return (
    <Stage chapter={chapter}>
      <div style={{ display: "flex", gap: 60, height: "100%" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Photo src="img/m31.jpg" w={STAGE.h} h={STAGE.h} aspect={1} from={{ zoom: 1, x: 0.5, y: 0.5 }} to={{ zoom: 2.5, x: 0.49, y: 0.51 }} progress={progress}>
            <svg viewBox="0 0 600 600" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              <ellipse cx={297} cy={306} rx={100} ry={36} transform="rotate(-13 297 306)" fill="none" stroke={COLOR.accent} strokeWidth={1.4} strokeDasharray="6 5" opacity={ring} />
            </svg>
          </Photo>
          <Corner>実際の画像</Corner>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
          <Reveal at={l2}>
            <Card style={{ fontSize: 48, fontWeight: 700 }}>
              アンドロメダ銀河 <span style={{ color: COLOR.dim, fontSize: 36 }}>(M31)</span>
            </Card>
          </Reveal>
          <Reveal at={l2 + 70}>
            <Card color={COLOR.accent}>
              地球から およそ <b style={{ color: COLOR.accent, fontSize: 68 }}>250万光年</b>
            </Card>
          </Reveal>
          <Reveal at={l2 + 135} style={{ position: "relative" }}>
            <svg width={1050} height={300} style={{ background: COLOR.panel, borderRadius: 18 }}>
              <defs>
                <radialGradient id="ch09-galaxy">
                  <stop offset="0" stopColor="#fff3d0" />
                  <stop offset="0.3" stopColor="#c9c4e8" stopOpacity="0.7" />
                  <stop offset="1" stopColor="#8fa0e0" stopOpacity="0" />
                </radialGradient>
              </defs>
              <ellipse cx={130} cy={150} rx={100} ry={36} transform="rotate(-13 130 150)" fill="url(#ch09-galaxy)" />
              <line x1={190} y1={150} x2={850} y2={150} stroke={COLOR.line} strokeWidth={4} strokeDasharray="4 12" />
              <line x1={Math.max(190, lx - 110)} y1={150} x2={lx} y2={150} stroke={COLOR.warn} strokeWidth={5} opacity={0.6 * (1 - arrived)} />
              <circle cx={lx} cy={150} r={11} fill={COLOR.warn} opacity={1 - arrived} />
              {/* スマホ */}
              <rect x={870} y={80} width={76} height={140} rx={12} fill="#0a0e1a" stroke={arrived > 0.5 ? COLOR.warn : COLOR.text} strokeWidth={5} />
              <circle cx={890} cy={102} r={7} fill={COLOR.dim} />
              <circle cx={908} cy={150} r={10 + 12 * arrived} fill={COLOR.warn} opacity={0.7 * arrived} />
              <text x={520} y={100} textAnchor="middle" fill={COLOR.text} fontSize={38} fontWeight={700}>
                250万年前に出た光
              </text>
              <text x={130} y={262} textAnchor="middle" fill={COLOR.dim} fontSize={30}>
                銀河
              </text>
              <text x={908} y={262} textAnchor="middle" fill={COLOR.dim} fontSize={30}>
                スマホ
              </text>
            </svg>
            <Corner style={{ bottom: "auto", top: 12 }} />
          </Reveal>
        </div>
      </div>
    </Stage>
  );
};

// 「章ID/場面名」→ 場面の絵
export const ch09: Record<string, SceneView> = {
  "09_finishing/色": Color,
  "09_finishing/明るさ": Brightness,
  "09_finishing/前景": Foreground,
  "09_finishing/脱線 等級": Magnitude,
  "09_finishing/脱線 アンドロメダ銀河": Andromeda,
};
