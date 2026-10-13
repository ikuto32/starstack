import { useMemo } from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { SimSky } from "../components/SimSky";
import { Card, Reveal, Stage, Tag } from "../components/ui";
import frames from "../data/frames.json";
import { hash } from "../sim/rng";
import { SIM, starField } from "../sim/sky";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, tween } from "../timing";
import type { SceneView } from "../types";
import { Arrow, At, Caption, Label, Note, combine, fade, linear, mix, noiseField, scaler } from "./ch06_parts";
import { GRID_SIZE, GridFig, SHIFT, WORST, YELLOW, displacement, gridXY, moveOf } from "./ch08_parts";

type Star = number[]; // [x, y, 明るさ]

/** 一番近い星と、その距離。 */
const nearest = (p: Star, list: Star[]) => {
  let [best, distance] = [list[0], Infinity];
  for (const q of list) {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < distance) [best, distance] = [q, d];
  }
  return { star: best, distance };
};

/** 明るい星ほど大きな点にする。 */
const dot = (brightness: number) => Math.min(11, Math.max(5, 2.5 + 2.6 * Math.log10(brightness / 600)));

// 1枚目(白)と2枚目(黄)の星の位置を重ねる。拡大すると少しずつずれている
const Problem: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [first, second] = [frames.near[0].stars, frames.near[1].stars];
  // 明るい星が集まっている場所を拡大する
  const win = { x: 1540, y: 420, w: 360, h: 220 };
  const zoom = 3;
  const k = 660 / frames.height;
  const inside = (s: Star) => s[0] > win.x + 8 && s[0] < win.x + win.w - 8 && s[1] > win.y + 8 && s[1] < win.y + win.h - 8;
  const pairs = useMemo(() => first.filter(inside).map((a) => ({ a, ...nearest(a, second) })), [first, second]);
  const l1 = lineAt(scene, 1);
  const appear = ramp(frame, 70, 12);
  const move = ramp(frame, 82, 45);
  const link = ramp(frame, l1 + 10, 15);
  const [px, py] = [640, 15];
  const zx = (x: number) => (x - win.x) * zoom;
  const zy = (y: number) => (y - win.y) * zoom;
  return (
    <Stage chapter={chapter}>
      <svg width={STAGE.w} height={STAGE.h} style={{ position: "absolute", left: 0, top: 0 }}>
        {/* 写真1枚の全体 */}
        <g transform="translate(0 15)">
          <rect x={0} y={0} width={frames.width * k} height={660} fill={COLOR.panel} stroke={COLOR.line} strokeWidth={2} rx={6} />
          {first.map((s, i) => (
            <circle key={i} cx={s[0] * k} cy={s[1] * k} r={dot(s[2]) * 0.3} fill="#fff" opacity={linear(frame, i * 0.08, 6)} />
          ))}
          <rect x={win.x * k} y={win.y * k} width={win.w * k} height={win.h * k} fill="none" stroke={COLOR.warn} strokeWidth={3} opacity={ramp(frame, 30, 12)} />
        </g>
        <g opacity={ramp(frame, 36, 14)}>
          <line x1={(win.x + win.w) * k} y1={15 + win.y * k} x2={px} y2={py} stroke={COLOR.warn} strokeWidth={2} strokeDasharray="8 8" />
          <line x1={(win.x + win.w) * k} y1={15 + (win.y + win.h) * k} x2={px} y2={py + win.h * zoom} stroke={COLOR.warn} strokeWidth={2} strokeDasharray="8 8" />
          {/* 拡大 */}
          <g transform={`translate(${px} ${py})`}>
            <rect x={0} y={0} width={win.w * zoom} height={win.h * zoom} fill={COLOR.panel} stroke={COLOR.warn} strokeWidth={3} rx={6} />
            {pairs.map(({ a, star, distance }, i) => {
              const matched = distance < 8;
              const [bx, by] = matched ? [mix(a[0], star[0], move), mix(a[1], star[1], move)] : a;
              return (
                <g key={i}>
                  <circle cx={zx(a[0])} cy={zy(a[1])} r={mix(13, 30, link)} fill="none" stroke={COLOR.accent} strokeWidth={3} strokeDasharray="7 6" opacity={matched ? link : 0} />
                  <circle cx={zx(a[0])} cy={zy(a[1])} r={dot(a[2])} fill="#fff" />
                  {matched && <circle cx={zx(bx)} cy={zy(by)} r={dot(star[2])} fill={YELLOW} opacity={appear * 0.92} />}
                  {matched && <line x1={zx(a[0])} y1={zy(a[1])} x2={zx(bx)} y2={zy(by)} stroke={COLOR.accent} strokeWidth={4} opacity={link} />}
                </g>
              );
            })}
            <line x1={24} x2={24 + 10 * zoom} y1={win.h * zoom - 26} y2={win.h * zoom - 26} stroke={COLOR.text} strokeWidth={5} />
            <Label x={24 + 10 * zoom + 14} y={win.h * zoom - 16} size={28} weight={600}>
              10画素
            </Label>
          </g>
        </g>
      </svg>
      <Tag color={COLOR.dim} style={{ position: "absolute", left: 10, top: 25, fontSize: 28 }}>
        写真1枚の全体
      </Tag>
      <At x={px + 16} y={py + 14} style={{ display: "flex", gap: 14 }}>
        <Tag color="#fff" style={{ opacity: ramp(frame, 40, 12) }}>
          白: 1枚目
        </Tag>
        <Tag color={YELLOW} style={{ opacity: appear }}>
          黄: 2枚目(約16秒後)
        </Tag>
      </At>
      <At x={px + win.w * zoom - 470} y={py + 14} opacity={link}>
        <Tag style={{ fontSize: 36 }}>一番近い星を選べばいい？</Tag>
      </At>
      <Note kind="実際のデータ" style={{ right: STAGE.w - px - win.w * zoom + 10, bottom: 25 }} />
    </Stage>
  );
};

// 前の2枚の動きから次の位置を予測し、そのまわりの小さな円の中だけを探す
const Predict: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [first, second, third] = frames.near.map((n) => n.stars);
  // 1つの星を3枚ぶん追う
  const { p0, p1, p2, guess } = useMemo(() => {
    const p0 = first[6];
    const p1 = nearest(p0, second).star;
    const p2 = nearest(p1, third).star;
    return { p0, p1, p2, guess: [2 * p1[0] - p0[0], 2 * p1[1] - p0[1]] };
  }, [first, second, third]);
  const [l1, l2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const [w, h, unit] = [1120, STAGE.h, 44]; // unit = 1画素ぶんの長さ
  const at = (p: number[]): [number, number] => [560 + (p[0] - guess[0]) * unit, 350 + (p[1] - guess[1]) * unit];
  const [a, b, c, g] = [at(p0), at(p1), at(p2), at(guess)];
  const move = ramp(frame, 60, 40);
  const ahead = ramp(frame, 140, 55);
  const radius = frame < l2 + 125 ? 6 : frame < l2 + 175 ? 3 : 2;
  const r = tween(frame, l2 + 125, 25, 6, 3) + tween(frame, l2 + 175, 25, 0, -1);
  const circle = ramp(frame, l1, 18);
  const actual = ramp(frame, l2 + 55, 15);
  const lines = useMemo(() => {
    const out: number[][] = [];
    for (let i = -14; i <= 14; i++) out.push([560 + (Math.round(guess[0]) + i - guess[0]) * unit, 0, 0], [350 + (Math.round(guess[1]) + i - guess[1]) * unit, 0, 1]);
    return out;
  }, [guess, unit]);
  return (
    <Stage chapter={chapter}>
      <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, borderRadius: 12, background: COLOR.panel }}>
        {lines.map(([v, , vertical], i) => (vertical ? <line key={i} x1={0} x2={w} y1={v} y2={v} stroke="#1a2440" strokeWidth={1.5} /> : <line key={i} x1={v} x2={v} y1={0} y2={h} stroke="#1a2440" strokeWidth={1.5} />))}
        {/* 探す範囲 */}
        <g opacity={circle}>
          <circle cx={g[0]} cy={g[1]} r={r * unit} fill="rgba(108,196,255,0.10)" stroke={COLOR.accent} strokeWidth={4} />
          <Label x={g[0] - r * unit * 0.71 - 14} y={g[1] + r * unit * 0.71 + 44} size={40} color={COLOR.accent} anchor="end" opacity={ramp(frame, l2, 15)}>
            半径 {radius}画素
          </Label>
          <Label x={g[0]} y={g[1] - r * unit - 16} size={36} color={COLOR.accent} anchor="middle" opacity={1 - ramp(frame, l2, 15)}>
            この近くだけ探す
          </Label>
        </g>
        {/* 前の2枚の動き */}
        <Arrow from={a} to={[mix(a[0], b[0], move), mix(a[1], b[1], move)]} color="#fff" width={5} head={18} opacity={ramp(frame, 60, 8)} />
        <Arrow from={b} to={[mix(b[0], g[0], ahead), mix(b[1], g[1], ahead)]} color={COLOR.accent} width={5} head={18} dash="12 9" opacity={ramp(frame, 140, 8)} />
        <circle cx={a[0]} cy={a[1]} r={13} fill="#fff" opacity={ramp(frame, 10, 12)} />
        <Label x={a[0] + 26} y={a[1] + 4} size={36} opacity={ramp(frame, 10, 12)}>
          1枚目
        </Label>
        <circle cx={b[0]} cy={b[1]} r={13} fill="#fff" opacity={ramp(frame, 95, 12)} />
        <Label x={b[0] + 26} y={b[1] + 4} size={36} opacity={ramp(frame, 95, 12)}>
          2枚目
        </Label>
        {/* 予測した位置 */}
        <g opacity={ramp(frame, 190, 12)}>
          <path d={`M${g[0] - 20} ${g[1]} H${g[0] + 20} M${g[0]} ${g[1] - 20} V${g[1] + 20}`} stroke={COLOR.accent} strokeWidth={5} strokeLinecap="round" />
          <Label x={g[0] - 30} y={g[1] - 16} size={38} color={COLOR.accent} anchor="end">
            予測
          </Label>
        </g>
        {/* 実際の3枚目 */}
        <g opacity={actual}>
          <circle cx={c[0]} cy={c[1]} r={mix(26, 12, actual)} fill={YELLOW} />
          <Label x={c[0] + 28} y={c[1] + 46} size={36} color={YELLOW}>
            3枚目(実際の位置)
          </Label>
        </g>
        <line x1={24} x2={24 + unit} y1={h - 30} y2={h - 30} stroke={COLOR.text} strokeWidth={5} />
        <Label x={24 + unit + 14} y={h - 20} size={28} weight={600}>
          1マス = 1画素
        </Label>
      </svg>
      <Note kind="実際のデータ" style={{ right: STAGE.w - w + 10 }} />
      <At x={1160} y={10} w={640} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Reveal at={40}>
          <Card>星は一定の速さで動く</Card>
        </Reveal>
        <Reveal at={150}>
          <Card color={COLOR.accent}>
            前の2枚の動きから、次の位置を <b style={{ color: COLOR.accent }}>予測</b>
          </Card>
        </Reveal>
        <Reveal at={l2 + 10}>
          <Card>
            探す半径
            <div style={{ fontSize: 50, fontWeight: 800 }}>
              {[6, 3, 2].map((v, i) => (
                <span key={v} style={{ color: v === radius ? COLOR.accent : COLOR.dim }}>
                  {i > 0 && <span style={{ color: COLOR.dim }}> → </span>}
                  {v}
                </span>
              ))}
              <span style={{ fontSize: 36, fontWeight: 600 }}> 画素</span>
            </div>
          </Card>
        </Reveal>
        <Reveal at={l2 + 225}>
          <Card color={COLOR.good} style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width={150} height={70} style={{ flexShrink: 0 }}>
              <circle cx={18} cy={35} r={12} fill="#fff" />
              <circle cx={132} cy={35} r={12} fill={YELLOW} />
              <Arrow from={[38, 24]} to={[112, 24]} color={COLOR.good} width={4} head={12} />
              <Arrow from={[112, 46]} to={[38, 46]} color={COLOR.good} width={4} head={12} />
            </svg>
            <div>お互いに一番近いペアだけ採用</div>
          </Card>
        </Reveal>
      </At>
    </Stage>
  );
};

/** 格子の図の凡例。 */
const Legend = ({ color, children, opacity }: { color: string; children: string; opacity: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 600, color: COLOR.text, opacity }}>
    <svg width={60} height={30}>
      <path d="M0 6 H60 M0 24 H60 M10 0 V30 M48 0 V30" stroke={color} strokeWidth={3} />
    </svg>
    {children}
  </div>
);

// 全体を同じ量だけずらしても、中心は合うが端がずれる(実データの格子)
const NotJustShift: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [l1, l2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const moved = ramp(frame, 60, 70);
  const shift = ramp(frame, l1 + 30, 60);
  const arrows = ramp(frame, l2 + 10, 40);
  const center = gridXY(frames.width / 2, frames.height / 2);
  const corner = gridXY(...moveOf(0, 1, 1, 0));
  return (
    <Stage chapter={chapter}>
      <At x={0} y={0}>
        <GridFig moved={moved} shift={shift} warp={0} yellow={ramp(frame, 50, 15)} arrows={arrows}>
          <g opacity={ramp(frame, l2 + 50, 15)}>
            <circle cx={center[0]} cy={center[1]} r={34} fill="none" stroke={COLOR.good} strokeWidth={5} />
            <Label x={center[0]} y={center[1] + 76} size={36} color={COLOR.good} anchor="middle">
              中心は合う
            </Label>
            <Label x={corner[0] - 30} y={corner[1] + 60} size={36} color={COLOR.bad} anchor="end">
              端は大きくずれる
            </Label>
          </g>
        </GridFig>
        <Note kind="実際のデータ" style={{ right: 4, bottom: 4 }} />
      </At>
      <At x={GRID_SIZE.w + 50} y={10} w={STAGE.w - GRID_SIZE.w - 50} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Legend color="#e8ecff" opacity={ramp(frame, 15, 12)}>
          基準のフレーム
        </Legend>
        <Legend color={YELLOW} opacity={ramp(frame, 50, 12)}>
          約1時間前のフレームで、同じ星が写る位置
        </Legend>
        <Reveal at={l1 + 10}>
          <Card>
            全体を同じ量だけ平行にずらすと…
            <div style={{ opacity: ramp(frame, l2 + 50, 15) }}>
              <b style={{ color: COLOR.good }}>中心は合う</b> が、<b style={{ color: COLOR.bad }}>端がずれる</b>
            </div>
          </Card>
        </Reveal>
        <Reveal at={l2 + 110}>
          <Card>
            空は <b style={{ color: COLOR.accent }}>回転</b> している
            <br />
            レンズは端ほど <b style={{ color: COLOR.accent }}>歪む</b>
          </Card>
        </Reveal>
        <Reveal at={l2 + 200}>
          <Card color={COLOR.warn}>場所によって、動く向きも量もバラバラ</Card>
        </Reveal>
      </At>
    </Stage>
  );
};

// 星のペアを全部使ってなめらかな曲がり方を求め、格子と星をぴったり重ねる
const Warp: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const l1 = lineAt(scene, 1);
  const warp = ramp(frame, 150, 110);
  const stars = useMemo(() => frames.near[0].stars.map((s, i) => ({ x: s[0], y: s[1], d: displacement(s[0], s[1]), order: hash(i, 8) })), []);
  return (
    <Stage chapter={chapter}>
      <At x={0} y={0}>
        <GridFig moved={1} shift={1} warp={warp} yellow={1} arrows={1 - warp}>
          {stars.map((s, i) => {
            const p = ramp(frame, 25 + s.order * 80, 10);
            const [wx, wy] = gridXY(s.x, s.y);
            const [yx, yy] = gridXY(s.x + (s.d[0] - SHIFT[0]) * (1 - warp), s.y + (s.d[1] - SHIFT[1]) * (1 - warp));
            return (
              <g key={i} opacity={p}>
                <circle cx={wx} cy={wy} r={2.6} fill="#fff" />
                <circle cx={yx} cy={yy} r={2.6} fill={YELLOW} />
              </g>
            );
          })}
        </GridFig>
        <Note kind="実際のデータ" style={{ right: 4, bottom: 4 }} />
      </At>
      <At x={GRID_SIZE.w + 50} y={10} w={STAGE.w - GRID_SIZE.w - 50} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Reveal at={30}>
          <Card>
            対応が取れた星のペアを全部使う
            <div style={{ fontSize: 32, color: COLOR.dim }}>
              この2枚では <b style={{ color: COLOR.text, fontSize: 44 }}>{frames.track[0].matches.toLocaleString("en-US")}</b> 組(図の点はその一部)
            </div>
          </Card>
        </Reveal>
        <Reveal at={140}>
          <Card color={COLOR.accent}>
            画面全体の <b style={{ color: COLOR.accent }}>なめらかな曲がり方</b> を計算する
          </Card>
        </Reveal>
        <Reveal at={235}>
          <Card style={{ lineHeight: 1.6 }}>
            <div>
              ずらすだけ: 端で <b style={{ color: COLOR.bad, fontSize: 46 }}>約{Math.round(WORST / 10) * 10}画素</b> のずれ
            </div>
            <div style={{ opacity: ramp(frame, 265, 15) }}>
              曲げて合わせる: <b style={{ color: COLOR.good, fontSize: 46 }}>1画素未満</b>
            </div>
          </Card>
        </Reveal>
        <Reveal at={l1 + 20}>
          <Card color={COLOR.good}>星が多いほど、細かい曲がり方まで分かる</Card>
        </Reveal>
      </At>
    </Stage>
  );
};

// フレーム番号に対する「対応が取れた星の数」。厚い雲のところで谷になる
const Clouds: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const track = frames.track;
  const n = track.length;
  const [l1, l2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const [x0, x1, y0, y1] = [150, 1760, 90, 580];
  const x = scaler(0, n, x0, x1);
  const y = scaler(0, 2800, y1, y0);
  const shown = linear(frame, 8, 140) * n;
  // 対応が 1 つも取れなかった区間
  const lost = useMemo(() => [track.findIndex((t) => !t.offset), n - 1 - [...track].reverse().findIndex((t) => !t.offset)], [track, n]);
  const sorted = ramp(frame, l2 + 150, 20); // 使うフレームと外すフレームを色分けする
  const used = track.filter((t) => t.used).length;
  const cloud = ramp(frame, 150, 15);
  return (
    <Stage chapter={chapter} title="前後のフレームで対応が取れた星の数">
      <svg width={STAGE.w} height={STAGE.h}>
        {[0, 500, 1000, 1500, 2000, 2500].map((v) => (
          <g key={v}>
            <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} stroke={COLOR.line} strokeWidth={v === 0 ? 3 : 1.5} />
            <text x={x0 - 14} y={y(v) + 10} fontSize={28} fill={COLOR.dim} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text transform={`translate(40 ${(y0 + y1) / 2}) rotate(-90)`} fontSize={30} fill={COLOR.dim} textAnchor="middle">
          対応が取れた星の数
        </text>
        <rect x={x(lost[0])} y={y0} width={x(lost[1] + 1) - x(lost[0])} height={y1 - y0} fill="rgba(255,180,84,0.13)" opacity={cloud} />
        {track.map((t, i) => (i < shown ? <rect key={i} x={x(i)} y={y(t.matches)} width={(x1 - x0) / n + 0.3} height={y1 - y(t.matches)} fill={t.used ? COLOR.accent : sorted > 0.5 ? "#5d6885" : COLOR.accent} /> : null))}
        {[0, 100, 200, 300].map((v) => (
          <text key={v} x={x(v)} y={y1 + 34} fontSize={28} fill={COLOR.dim} textAnchor="middle">
            {v}
          </text>
        ))}
        <text x={(x0 + x1) / 2} y={y1 + 78} fontSize={32} fill={COLOR.dim} textAnchor="middle">
          フレーム番号(撮影開始からの枚数)
        </text>
        <Label x={x((lost[0] + lost[1] + 1) / 2)} y={y0 + 50} size={44} color={COLOR.warn} anchor="middle" opacity={cloud}>
          厚い雲
        </Label>
        <Label x={x((lost[0] + lost[1] + 1) / 2)} y={y0 + 100} size={32} color={COLOR.warn} anchor="middle" opacity={cloud}>
          約100枚、星が見えない
        </Label>
        {/* 見失うところと、探し直すところ */}
        <g opacity={ramp(frame, l1 + 10, 15)}>
          <Arrow from={[x(lost[0]) - 150, y(1250)]} to={[x(lost[0]) - 6, y(300)]} color={COLOR.bad} />
          <Label x={x(lost[0]) - 140} y={y(1330)} size={38} color={COLOR.bad} anchor="end">
            追跡していた星を見失う
          </Label>
        </g>
        <g opacity={ramp(frame, l2 + 20, 15)}>
          <Arrow from={[x(lost[1] + 1) - 60, y(900)]} to={[x(lost[1] + 1) + 4, y(260)]} color={COLOR.good} />
          <Label x={x1} y={y(1160)} size={36} color={COLOR.good} anchor="end">
            全体のずれの量を
          </Label>
          <Label x={x1} y={y(960)} size={36} color={COLOR.good} anchor="end">
            多数決で探し直す
          </Label>
        </g>
      </svg>
      <At x={x0 + 20} y={0} opacity={sorted} style={{ display: "flex", gap: 40, fontSize: 34, fontWeight: 600, color: COLOR.text }}>
        <div>
          <span style={{ display: "inline-block", width: 28, height: 28, background: COLOR.accent, marginRight: 12, verticalAlign: "-4px" }} />
          重ねる計算に使う {used}枚
        </div>
        <div>
          <span style={{ display: "inline-block", width: 28, height: 28, background: "#5d6885", marginRight: 12, verticalAlign: "-4px" }} />
          重ねる計算から外す {n - used}枚
        </div>
      </At>
      <Note kind="実際のデータ" style={{ top: -66, bottom: "auto", right: 0 }} />
    </Stage>
  );
};

// 視野の中心の軌跡。なめらかな弧の途中に、約42画素の段差がある
const Quake: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const offsets = useMemo(() => frames.track.map((t) => t.offset), []);
  const [l1, l2, l4] = [lineAt(scene, 1), lineAt(scene, 2), lineAt(scene, 4)];
  const JUMP = 158; // この番号と次の番号の間でとぶ
  const [before, after] = [offsets[JUMP]!, offsets[JUMP + 1]!];
  const size = Math.hypot(after[0] - before[0], after[1] - before[1]);
  const k = 0.88;
  const main = (p: number[]): [number, number] => [70 + (p[0] + 452) * k, 44 + (p[1] + 286) * k];
  const shown = linear(frame, 5, 95) * offsets.length;
  // つながっている区間ごとに線にする
  const runs = useMemo(() => {
    const out: number[][] = [[]];
    offsets.forEach((o, i) => {
      if (!o || i === JUMP + 1) out.push([]);
      if (o) out[out.length - 1].push(i);
    });
    return out.filter((r) => r.length > 1);
  }, [offsets]);
  const path = (run: number[], to: (p: number[]) => [number, number], limit = Infinity) =>
    run
      .filter((i) => i < limit)
      .map((i, n) => `${n ? "L" : "M"}${to(offsets[i]!).map((v) => v.toFixed(1)).join(" ")}`)
      .join(" ");
  const gap = [offsets.findIndex((o) => !o) - 1, offsets.length - [...offsets].reverse().findIndex((o) => !o)];
  const mid = [(before[0] + after[0]) / 2, (before[1] + after[1]) / 2];
  const ring = main(mid);
  const found = ramp(frame, l1, 15);
  const quake = ramp(frame, l2 + 95, 15);
  const kept = ramp(frame, l4 + 140, 20);
  // 段差のまわりの拡大
  const [ix, iy, iw, ih, zoom] = [1060, 0, 740, 430, 5.2];
  const inset = (p: number[]): [number, number] => [iw / 2 + (p[0] - mid[0]) * zoom, ih / 2 + (p[1] - mid[1]) * zoom];
  const [b2, a2] = [inset(before), inset(after)];
  const last = offsets[offsets.length - 1]!;
  return (
    <Stage chapter={chapter}>
      <svg width={STAGE.w} height={STAGE.h} style={{ position: "absolute", left: 0, top: 0 }}>
        <rect x={0} y={0} width={1010} height={STAGE.h} fill={COLOR.panel} rx={12} />
        {runs.map((run, i) => (
          <path key={i} d={path(run, main, shown)} fill="none" stroke={run[0] > JUMP ? (kept > 0.5 ? COLOR.good : COLOR.accent) : COLOR.accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* 雲で位置が分からなかった区間 */}
        <g opacity={ramp(frame, 90, 15)}>
          <line x1={main(offsets[gap[0]]!)[0]} y1={main(offsets[gap[0]]!)[1]} x2={main(offsets[gap[1]]!)[0]} y2={main(offsets[gap[1]]!)[1]} stroke={COLOR.dim} strokeWidth={3} strokeDasharray="5 9" />
          <Label x={main(offsets[gap[0]]!)[0] - 60} y={main(offsets[gap[0]]!)[1] + 150} size={30} color={COLOR.dim} weight={600}>
            雲で見えなかった区間
          </Label>
          <Label x={main(offsets[0]!)[0] - 24} y={main(offsets[0]!)[1] + 44} size={30} color={COLOR.dim} anchor="end" weight={600}>
            0枚目(撮影開始)
          </Label>
          <Label x={main(last)[0] + 24} y={main(last)[1] - 6} size={30} color={COLOR.dim} weight={600}>
            {offsets.length - 1}枚目
          </Label>
        </g>
        <circle cx={main(offsets[0]!)[0]} cy={main(offsets[0]!)[1]} r={8} fill={COLOR.accent} />
        <line x1={main(before)[0]} y1={main(before)[1]} x2={main(after)[0]} y2={main(after)[1]} stroke={COLOR.bad} strokeWidth={5} opacity={shown > JUMP + 1 ? 1 : 0} />
        <g opacity={found}>
          <circle cx={ring[0]} cy={ring[1]} r={mix(80, 44, found)} fill="none" stroke={COLOR.warn} strokeWidth={4} />
          <line x1={ring[0] + 40} y1={ring[1] - 20} x2={ix} y2={iy} stroke={COLOR.warn} strokeWidth={2} strokeDasharray="8 8" />
          <line x1={ring[0] + 40} y1={ring[1] + 20} x2={ix} y2={iy + ih} stroke={COLOR.warn} strokeWidth={2} strokeDasharray="8 8" />
        </g>
        <Label x={ring[0] - 56} y={ring[1] + 14} size={40} color={COLOR.bad} anchor="end" opacity={quake}>
          小さな地震
        </Label>
        <line x1={430} x2={430 + 100 * k} y1={STAGE.h - 34} y2={STAGE.h - 34} stroke={COLOR.text} strokeWidth={5} />
        <Label x={430 + 100 * k + 14} y={STAGE.h - 24} size={28} weight={600}>
          100画素
        </Label>
      </svg>
      <Tag color={COLOR.dim} style={{ position: "absolute", left: 16, top: 14, fontSize: 30 }}>
        視野の中心が動いた跡(フレームごと)
      </Tag>
      <Note kind="実際のデータ" style={{ right: STAGE.w - 1010 + 10 }} />
      {/* 拡大 */}
      <svg width={iw} height={ih} style={{ position: "absolute", left: ix, top: iy, borderRadius: 12, background: COLOR.panel, border: `3px solid ${COLOR.warn}`, boxSizing: "border-box", opacity: found }}>
        {runs.map((run, i) => (
          <path key={i} d={path(run.filter((j) => Math.abs(j - JUMP) < 26), inset)} fill="none" stroke={run[0] > JUMP ? (kept > 0.5 ? COLOR.good : COLOR.accent) : COLOR.accent} strokeWidth={4} />
        ))}
        {offsets.map((o, i) => (o && Math.abs(i - JUMP) < 26 ? <circle key={i} cx={inset(o)[0]} cy={inset(o)[1]} r={6} fill={i > JUMP ? (kept > 0.5 ? COLOR.good : COLOR.accent) : COLOR.accent} /> : null))}
        <line x1={b2[0]} y1={b2[1]} x2={a2[0]} y2={a2[1]} stroke={COLOR.bad} strokeWidth={5} strokeDasharray="10 8" />
        <Label x={b2[0] + 6} y={b2[1] + 46} size={32} weight={600}>
          {JUMP}枚目
        </Label>
        <Label x={a2[0] + 6} y={a2[1] - 22} size={32} weight={600}>
          {JUMP + 1}枚目
        </Label>
        <Label x={(a2[0] + b2[0]) / 2 + 26} y={(a2[1] + b2[1]) / 2 + 16} size={46} color={COLOR.bad} opacity={ramp(frame, l2 + 15, 15)}>
          約{Math.round(size)}画素
        </Label>
        <Label x={20} y={ih - 20} size={28} color={COLOR.dim} weight={600}>
          1点 = 1枚
        </Label>
      </svg>
      <At x={ix} y={ih + 20} w={iw} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Reveal at={l2 + 95}>
          <Card color={COLOR.bad} style={{ padding: "12px 28px" }}>
            <b style={{ color: COLOR.bad, fontSize: 48 }}>小さな地震</b> でスマホが動いた
          </Card>
        </Reveal>
        <Reveal at={l4 + 140}>
          <Card color={COLOR.good} style={{ padding: "12px 28px" }}>
            それでも、追跡は <b style={{ color: COLOR.good }}>続けられた</b>
          </Card>
        </Reveal>
      </At>
    </Stage>
  );
};

const NOISE = 0.9; // 模式図の1枚あたりのノイズ
const TILT = [0.1, -0.07, 0.16]; // 各フレームで星空が回っている量
const COUNTS = [16, 48, 128, 217];

/** 飛行機の光のような、1枚にだけ写るまっすぐな線。 */
const streak = () => {
  const out = new Float32Array(SIM.w * SIM.h * 3);
  for (let y = 0; y < SIM.h; y++) {
    for (let x = 0; x < SIM.w; x++) {
      const d = Math.abs((y - 22) - (x - 30) * 0.38) / Math.hypot(1, 0.38);
      if (x > 30 && x < 226 && d < 2) for (let c = 0; c < 3; c++) out[(y * SIM.w + x) * 3 + c] = 6 * Math.exp(-d * d);
    }
  }
  return out;
};

// 各フレームの位置を戻して重ねる。外れ値は外す。続けて実画像で、枚数が増えると暗い星が浮かぶ
const Stack: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const l1 = lineAt(scene, 1);
  const align = ramp(frame, 40, 70);
  const noises = useMemo(() => [0, 1, 2, 3].map((i) => noiseField(20 + i, 0.35)), []);
  const plane = useMemo(streak, []);
  const sky = useMemo(() => starField(0, 1.2), []);
  const thumbs = useMemo(() => TILT.map((t, i) => combine(i === 1 ? combine(starField(t * (1 - align), 1.2), plane, 1) : starField(t * (1 - align), 1.2), noises[i], NOISE)), [align, noises, plane]);
  const count = Math.round(tween(frame, 125, 200, 1, 128));
  const stacked = useMemo(() => combine(sky, noises[3], NOISE / Math.sqrt(count)), [sky, noises, count]);
  const [ts, rs] = [1.45, 3.3];
  const [tw, th] = [SIM.w * ts, SIM.h * ts];
  const real = ramp(frame, l1 - 8, 16);
  const flag = ramp(frame, 195, 15);
  const reject = ramp(frame, 255, 12);
  const level = COUNTS.map((_, i) => (i === 0 ? 1 : ramp(frame, l1 + 12 + i * 38, 22)));
  const current = COUNTS[level.filter((v) => v > 0.5).length - 1];
  return (
    <Stage chapter={chapter}>
      <div style={{ position: "absolute", inset: 0, opacity: 1 - real }}>
        {thumbs.map((image, i) => (
          <At key={i} x={0} y={10 + i * (th + 16)} w={tw} h={th}>
            <SimSky image={image} lo={-0.2} hi={5} scale={ts} style={{ display: "block" }} />
            <Tag color={COLOR.dim} style={{ position: "absolute", left: 6, top: 6, fontSize: 28 }}>
              {i + 1}枚目
            </Tag>
            {i === 1 && (
              <svg width={tw} height={th} style={{ position: "absolute", left: 0, top: 0 }}>
                <line x1={30 * ts} y1={22 * ts} x2={226 * ts} y2={(22 + 196 * 0.38) * ts} stroke={COLOR.bad} strokeWidth={22} strokeLinecap="round" opacity={0.3 * flag} />
                <path d={`M${128 * ts - 26} ${59 * ts - 26} l52 52 m0 -52 l-52 52`} stroke={COLOR.bad} strokeWidth={8} strokeLinecap="round" opacity={reject} />
              </svg>
            )}
          </At>
        ))}
        <svg width={150} height={STAGE.h} style={{ position: "absolute", left: tw + 6, top: 0, opacity: ramp(frame, 110, 15) }}>
          {[0, 1, 2].map((i) => (
            <Arrow key={i} from={[4, 10 + i * (th + 16) + th / 2]} to={[140, 300 + (i - 1) * 40]} color={COLOR.accent} width={5} head={18} />
          ))}
        </svg>
        <At x={530} y={50} w={SIM.w * rs} opacity={ramp(frame, 20, 15)}>
          <div style={{ position: "relative" }}>
            <SimSky image={stacked} lo={-0.2} hi={5} scale={rs} style={{ display: "block" }} />
            <Note kind="模式図" />
          </div>
          <Caption>
            重ねて平均 <b style={{ color: COLOR.accent, fontSize: 48 }}>{count}枚</b>
          </Caption>
        </At>
        <At x={1400} y={50} w={400} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Reveal at={40}>
            <Card>全部のフレームを正確な位置に戻す</Card>
          </Reveal>
          <Reveal at={195}>
            <Card color={COLOR.bad}>
              飛行機や人工衛星の光は <b style={{ color: COLOR.bad }}>計算から外す</b>
            </Card>
          </Reveal>
        </At>
      </div>
      <div style={{ position: "absolute", inset: 0, opacity: real }}>
        <At x={220} y={15} w={660} h={660} style={{ borderRadius: 14, overflow: "hidden" }}>
          {COUNTS.map((n, i) => (
            <Img key={n} src={staticFile(`img/c_stack${n}.jpg`)} style={{ position: "absolute", left: 0, top: 0, width: 660, height: 660, opacity: level[i] }} />
          ))}
          <Note kind="実際の画像" />
        </At>
        <At x={960} y={130} w={700}>
          <div style={{ fontSize: 44, fontWeight: 700, color: COLOR.text }}>重ねた枚数</div>
          <div style={{ fontSize: 170, fontWeight: 800, color: COLOR.accent, lineHeight: 1.15 }}>
            {current}
            <span style={{ fontSize: 80 }}>枚</span>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            {COUNTS.map((n, i) => (
              <div key={n} style={{ width: 150, height: 16, borderRadius: 8, background: level[i] > 0.5 ? COLOR.accent : COLOR.line }} />
            ))}
          </div>
          <div style={{ fontSize: 40, fontWeight: 600, color: COLOR.good, marginTop: 36, opacity: fade(frame, l1 + 60, 9999) }}>暗い星が浮かび上がってくる</div>
        </At>
      </div>
    </Stage>
  );
};

// 「章ID/場面名」→ 場面の絵
export const ch08: Record<string, SceneView> = {
  "08_tracking/問題": Problem,
  "08_tracking/予測": Predict,
  "08_tracking/ずらすだけでは合わない": NotJustShift,
  "08_tracking/多項式ワープ": Warp,
  "08_tracking/雲": Clouds,
  "08_tracking/地震": Quake,
  "08_tracking/重ねる": Stack,
};
