import type { ReactNode } from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { Card, Reveal, Stage } from "../components/ui";
import frames from "../data/frames.json";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, tween } from "../timing";
import type { SceneView } from "../types";
import { Arrow, At, Caption, Label, Note, Steps, fade, linear, mix, scaler } from "./ch06_parts";
import { CROP_PATCH, CROP_STARS } from "./ch07_data";
import { PATCH } from "./ch07_patch";

const STEPS = ["ぼかす", "ノイズの5倍", "塊", "重心"];
const CROP = "img/c_stars_stretched.jpg";
const CROP_SIZE = 900;

/** 模式図の画素値を灰色の濃さにする。 */
const gray = (v: number, lo = -2.5, hi = 12) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), 0.6));

// 人には星が見えるが、計算機には数字の表でしかない
const Problem: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const size = 660;
  const k = size / CROP_SIZE;
  const l2 = lineAt(scene, 2);
  const table = ramp(frame, l2, 20);
  const [cw, ch, gx, gy] = [82, 60, 790, 96];
  const { x0, y0, w, h, values } = CROP_PATCH;
  const box = { x: (x0 + w / 2) * k - 14, y: (y0 + h / 2) * k - 11, w: 28, h: 22 };
  const plain = ramp(frame, l2 + 110, 40); // 濃淡を消して数字だけにする
  // 座標を尋ねる印を付ける星。明るい順に、互いに離れたものを選ぶ
  const marks = CROP_STARS.filter((s) => s[0] > 60 && s[0] < 680 && s[1] > 90 && s[1] < 800).reduce<number[][]>((list, s) => (list.length < 4 && list.every((t) => Math.hypot(t[0] - s[0], t[1] - s[1]) > 200) ? [...list, s] : list), []);
  return (
    <Stage chapter={chapter}>
      <At x={0} y={15} w={size} h={size}>
        <Img src={staticFile(CROP)} style={{ width: size, height: size, borderRadius: 14, display: "block" }} />
        <svg width={size} height={size} style={{ position: "absolute", left: 0, top: 0 }}>
          {marks.map(([sx, sy], i) => {
              const p = fade(frame, 70 + i * 22, l2, 12);
              return (
                <g key={i} opacity={p}>
                  <path d={`M${sx * k - 30} ${sy * k} H${sx * k - 10} M${sx * k + 10} ${sy * k} H${sx * k + 30} M${sx * k} ${sy * k - 30} V${sy * k - 10} M${sx * k} ${sy * k + 10} V${sy * k + 30}`} stroke={COLOR.accent} strokeWidth={3} />
                  <Label x={sx * k + 22} y={sy * k - 18} size={30} color={COLOR.accent}>
                    (x, y) = ?
                  </Label>
                </g>
              );
            })}
          <rect {...{ x: box.x, y: box.y, width: box.w, height: box.h }} fill="none" stroke={COLOR.warn} strokeWidth={3} opacity={table} />
        </svg>
        <Note kind="実際の画像" />
      </At>
      {/* 拡大する場所から数字の表へ */}
      <svg width={STAGE.w} height={STAGE.h} style={{ position: "absolute", left: 0, top: 0, opacity: table }}>
        <line x1={box.x + box.w} y1={15 + box.y} x2={gx} y2={gy} stroke={COLOR.warn} strokeWidth={2} strokeDasharray="8 8" />
        <line x1={box.x + box.w} y1={15 + box.y + box.h} x2={gx} y2={gy + ch * h} stroke={COLOR.warn} strokeWidth={2} strokeDasharray="8 8" />
      </svg>
      <At x={720} y={110} w={1040} opacity={1 - table} style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <Reveal at={20}>
          <Card>
            重ねるには、星が画面のどこにあるか
            <br />
            <b style={{ color: COLOR.accent, fontSize: 48 }}>座標</b> で知る必要がある
          </Card>
        </Reveal>
        <Reveal at={lineAt(scene, 1) + 10}>
          <Card color={COLOR.tsumugi}>人は、見れば星だと分かる</Card>
        </Reveal>
      </At>
      <At x={gx} y={10} w={cw * w} opacity={ramp(frame, l2 + 30, 15)} style={{ fontSize: 44, fontWeight: 800, color: COLOR.text, textAlign: "center" }}>
        計算機に見えているもの = <span style={{ color: COLOR.warn }}>数字の表</span>
      </At>
      <svg width={cw * w} height={ch * h} style={{ position: "absolute", left: gx, top: gy }}>
        {values.map((v, i) => {
          const [c, r] = [i % w, Math.floor(i / w)];
          const p = ramp(frame, l2 + 10 + r * 5 + c * 1.5, 12);
          const shade = Math.round(mix(v, 20, plain));
          const bright = mix(v, 20, plain) > 130;
          return (
            <g key={i} opacity={p}>
              <rect x={c * cw} y={r * ch} width={cw} height={ch} fill={`rgb(${shade},${shade},${Math.round(shade * 1.15)})`} stroke={COLOR.line} strokeWidth={1.5} />
              <text x={c * cw + cw / 2} y={r * ch + ch / 2 + 11} fontSize={30} fontWeight={600} textAnchor="middle" fill={bright ? "#05070d" : COLOR.text}>
                {v}
              </text>
            </g>
          );
        })}
      </svg>
    </Stage>
  );
};

/** 模式図の画像を、画素が見える大きさで描く。 */
const Pixels = ({ values, cell, children }: { values: number[]; cell: number; children?: ReactNode }) => (
  <svg width={PATCH.w * cell} height={PATCH.h * cell} style={{ display: "block", borderRadius: 8 }}>
    {values.map((v, i) => {
      const g = gray(v);
      return <rect key={i} x={(i % PATCH.w) * cell} y={Math.floor(i / PATCH.w) * cell} width={cell + 0.5} height={cell + 0.5} fill={`rgb(${g},${g},${Math.min(255, Math.round(g * 1.1))})`} />;
    })}
    {children}
  </svg>
);

const SECTION = { w: 770, h: 440, x0: 30, x1: 750, y0: 40, y1: 390 };

/** 1列ぶんの明るさを階段状の線にする。 */
const steps = (row: number[], x: (v: number) => number, y: (v: number) => number) => row.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(v)} L${x(i + 1)} ${y(v)}`).join(" ");

/** 断面グラフの枠。 */
const Section = ({ y, children }: { y: (v: number) => number; children: ReactNode }) => (
  <svg width={SECTION.w} height={SECTION.h + 50} style={{ display: "block" }}>
    <defs>
      <clipPath id="ch07-section">
        <rect x={SECTION.x0} y={SECTION.y0 - 30} width={SECTION.x1 - SECTION.x0} height={SECTION.y1 - SECTION.y0 + 34} />
      </clipPath>
    </defs>
    <rect x={SECTION.x0} y={SECTION.y0 - 30} width={SECTION.x1 - SECTION.x0} height={SECTION.y1 - SECTION.y0 + 34} fill={COLOR.panel} rx={8} />
    <line x1={SECTION.x0} x2={SECTION.x1} y1={y(0)} y2={y(0)} stroke={COLOR.line} strokeWidth={2} />
    <text x={(SECTION.x0 + SECTION.x1) / 2} y={SECTION.y1 + 44} fontSize={30} fill={COLOR.dim} textAnchor="middle">
      枠で囲んだ1列の明るさ(横に1画素ずつ)
    </text>
    <g clipPath="url(#ch07-section)">{children}</g>
  </svg>
);

/** 実画像の星のまわりを 3 倍に拡大して見せる。blur は元の画素で数えたぼかしの量。 */
const RealZoom = ({ blur }: { blur: number }) => {
  const [size, zoom] = [400, 3];
  const [cx, cy] = [CROP_PATCH.x0 + CROP_PATCH.w / 2 + 14, CROP_PATCH.y0 + CROP_PATCH.h / 2 + 8];
  return (
    <div style={{ position: "relative", width: size, height: size, overflow: "hidden", borderRadius: 10 }}>
      <Img src={staticFile(CROP)} style={{ position: "absolute", left: size / 2 - cx * zoom, top: size / 2 - cy * zoom, width: CROP_SIZE * zoom, height: CROP_SIZE * zoom, maxWidth: "none", imageRendering: "pixelated", filter: `blur(${blur * zoom}px)` }} />
      <Note kind="実際の画像" />
    </div>
  );
};

const CELL = 22;
const ROW = PATCH.row;
const rowOf = (a: number[]) => a.slice(ROW * PATCH.w, (ROW + 1) * PATCH.w);

/** 断面にする1列を示す枠。 */
const RowFrame = () => <rect x={1.5} y={ROW * CELL} width={PATCH.w * CELL - 3} height={CELL} fill="none" stroke={COLOR.warn} strokeWidth={3} />;

// 少しぼかすと、1画素だけのノイズは沈み、数画素に広がる星は残る
const Blur: SceneView = ({ chapter }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, 105, 60);
  const values = PATCH.raw.map((v, i) => mix(v, PATCH.blurred[i], p));
  const x = scaler(0, PATCH.w, SECTION.x0, SECTION.x1);
  const y = scaler(-3, 16, SECTION.y1, SECTION.y0);
  const [raw, now] = [rowOf(PATCH.raw), rowOf(values)];
  const [star, spike] = [8, PATCH.spike.x];
  return (
    <Stage chapter={chapter}>
      <Steps label="星を見つける手順" items={STEPS} active={0} />
      <At x={0} y={96}>
        <RealZoom blur={1.2 * p} />
        <Caption>星のまわりを拡大</Caption>
      </At>
      <At x={450} y={96}>
        <div style={{ position: "relative" }}>
          <Pixels values={values} cell={CELL}>
            <RowFrame />
          </Pixels>
          <Note kind="模式図" />
        </div>
        <Caption>{p < 0.5 ? "画素ごとの明るさ" : "少しぼかしたあと"}</Caption>
      </At>
      <At x={1030} y={76}>
        <Section y={y}>
          <path d={steps(raw, x, y)} fill="none" stroke={COLOR.dim} strokeWidth={2.5} strokeDasharray="6 6" opacity={p} />
          <path d={steps(now, x, y)} fill="none" stroke={COLOR.accent} strokeWidth={5} strokeLinejoin="round" />
          <Label x={x(star + 0.5)} y={y(raw[star]) - 16} size={36} anchor="middle" opacity={ramp(frame, 20, 15)}>
            星
          </Label>
          <Label x={x(spike + 0.5)} y={y(raw[spike]) - 16} size={32} color={COLOR.warn} anchor="middle" opacity={ramp(frame, 40, 15)}>
            1画素だけのノイズ
          </Label>
          <Arrow from={[x(spike + 0.5), y(raw[spike]) + 14]} to={[x(spike + 0.5), y(now[spike]) - 10]} color={COLOR.warn} opacity={ramp(frame, 170, 15)} />
        </Section>
      </At>
      <At x={450} y={590} w={1350} style={{ display: "flex", gap: 30 }}>
        <Reveal at={170} style={{ flex: 1 }}>
          <Card color={COLOR.warn}>
            1画素だけのノイズ → <b style={{ color: COLOR.warn }}>沈む</b>
          </Card>
        </Reveal>
        <Reveal at={255} style={{ flex: 1 }}>
          <Card color={COLOR.accent}>
            数画素に広がる星 → <b style={{ color: COLOR.accent }}>残る</b>
          </Card>
        </Reveal>
      </At>
    </Stage>
  );
};

/** しきい値を超えた画素を光らせる。 */
const Lit = ({ opacity, cell = CELL }: { opacity: number; cell?: number }) => (
  <g opacity={opacity}>
    {PATCH.label.map((b, i) => (b < 0 ? <rect key={i} x={(i % PATCH.w) * cell} y={Math.floor(i / PATCH.w) * cell} width={cell + 0.5} height={cell + 0.5} fill="rgba(5,7,13,0.6)" /> : <rect key={i} x={(i % PATCH.w) * cell + 1.5} y={Math.floor(i / PATCH.w) * cell + 1.5} width={cell - 3} height={cell - 3} fill="rgba(108,196,255,0.35)" stroke={COLOR.accent} strokeWidth={3} />))}
  </g>
);

// ノイズの大きさを測り、その5倍より明るい画素だけ拾う
const Threshold: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const x = scaler(0, PATCH.w, SECTION.x0, SECTION.x1);
  const y = scaler(tween(frame, 0, 30, -3, -1.2), tween(frame, 0, 30, 16, 9), SECTION.y1, SECTION.y0);
  const row = rowOf(PATCH.blurred);
  const times = tween(frame, 70, 50, 1, 5);
  const line = y(PATCH.level + times * PATCH.sigma);
  const band = ramp(frame, 25, 15);
  const lit = ramp(frame, 128, 15);
  return (
    <Stage chapter={chapter}>
      <Steps label="星を見つける手順" items={STEPS} active={1} />
      <At x={0} y={96}>
        <RealZoom blur={1.2} />
        <Caption>少しぼかしたあと</Caption>
      </At>
      <At x={450} y={96}>
        <div style={{ position: "relative" }}>
          <Pixels values={PATCH.blurred} cell={CELL}>
            <Lit opacity={lit} />
            <RowFrame />
          </Pixels>
          <Note kind="模式図" />
        </div>
        <Caption>{lit < 0.5 ? "少しぼかしたあと" : "線を超えた画素だけ光らせる"}</Caption>
      </At>
      <At x={1030} y={76}>
        <Section y={y}>
          <defs>
            <clipPath id="ch07-over">
              <rect x={0} y={0} width={SECTION.w} height={line} />
            </clipPath>
          </defs>
          <rect x={SECTION.x0} y={y(PATCH.level + PATCH.sigma)} width={SECTION.x1 - SECTION.x0} height={y(PATCH.level - PATCH.sigma) - y(PATCH.level + PATCH.sigma)} fill="rgba(255,180,84,0.35)" opacity={band} />
          <path d={steps(row, x, y)} fill="none" stroke="#5f7fb0" strokeWidth={5} strokeLinejoin="round" />
          <path d={steps(row, x, y)} fill="none" stroke={COLOR.accent} strokeWidth={7} strokeLinejoin="round" clipPath="url(#ch07-over)" opacity={lit} />
          <Label x={SECTION.x0 + 14} y={y(PATCH.level + PATCH.sigma) - 12} size={32} color={COLOR.warn} opacity={band}>
            ノイズの大きさ
          </Label>
          <g opacity={ramp(frame, 65, 12)}>
            <line x1={SECTION.x0} x2={SECTION.x1} y1={line} y2={line} stroke={COLOR.bad} strokeWidth={4} strokeDasharray="14 9" />
            <Label x={SECTION.x1 - 14} y={line - 14} size={40} color={COLOR.bad} anchor="end">
              ノイズの{Math.round(times)}倍
            </Label>
          </g>
        </Section>
      </At>
      <At x={450} y={590} w={1350} style={{ display: "flex", gap: 30 }}>
        <Reveal at={128} style={{ flex: 1 }}>
          <Card color={COLOR.accent}>
            <b style={{ color: COLOR.bad }}>ノイズの5倍</b> より明るい画素だけ拾う
          </Card>
        </Reveal>
        <Reveal at={lineAt(scene, 1) + 20} style={{ flex: 1 }}>
          <Card color={COLOR.good}>まぐれでは、ここまで明るくならない</Card>
        </Reveal>
      </At>
    </Stage>
  );
};

/** 塊の輪郭(同じ塊でない隣との境目)を線にする。 */
const outline = (blob: number, cell: number, ox = 0, oy = 0) =>
  PATCH.blobs[blob].cells
    .flatMap((p) => {
      const [c, r] = [p % PATCH.w, Math.floor(p / PATCH.w)];
      const same = (dc: number, dr: number) => c + dc >= 0 && c + dc < PATCH.w && r + dr >= 0 && r + dr < PATCH.h && PATCH.label[(r + dr) * PATCH.w + c + dc] === blob;
      const [x, y] = [(c - ox) * cell, (r - oy) * cell];
      return [!same(0, -1) && `M${x} ${y} h${cell}`, !same(0, 1) && `M${x} ${y + cell} h${cell}`, !same(-1, 0) && `M${x} ${y} v${cell}`, !same(1, 0) && `M${x + cell} ${y} v${cell}`];
    })
    .filter(Boolean)
    .join(" ");

/** 重心の十字。 */
const Cross = ({ x, y, size, opacity }: { x: number; y: number; size: number; opacity: number }) => (
  <g opacity={opacity}>
    <path d={`M${x - size} ${y} H${x + size} M${x} ${y - size} V${y + size}`} stroke={COLOR.bg} strokeWidth={9} strokeLinecap="round" />
    <path d={`M${x - size} ${y} H${x + size} M${x} ${y - size} V${y + size}`} stroke={COLOR.bad} strokeWidth={4} strokeLinecap="round" />
  </g>
);

// 画像の中での位置に見えるよう、模式図の座標に足す量
const ORIGIN = { x: 400, y: 260 };

// 隣り合う明るい画素を塊にし、明るさで重みを付けた重心を小数の座標で求める
const Blob: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [l1, l2] = [lineAt(scene, 1), lineAt(scene, 2)];
  const joined = ramp(frame, 55, 20);
  const weights = ramp(frame, 150, 20);
  const center = ramp(frame, 200, 15);
  const ruler = ramp(frame, l1, 15);
  // 明るいほうの星のまわり 9×9 画素を大きく見せる
  const [zc, zr, zn, zcell, zx, zy] = [4, 3, 9, 60, 640, 100];
  const star = PATCH.blobs[0];
  const [sx, sy] = [(star.x + 0.5 - zc) * zcell, (star.y + 0.5 - zr) * zcell];
  return (
    <Stage chapter={chapter}>
      <Steps label="星を見つける手順" items={STEPS} active={frame < 190 ? 2 : 3} />
      <At x={0} y={110}>
        <div style={{ position: "relative" }}>
          <Pixels values={PATCH.blurred} cell={CELL}>
            <Lit opacity={1} />
            {PATCH.blobs.map((b, i) => (
              <g key={i}>
                <path d={outline(i, CELL)} stroke={COLOR.good} strokeWidth={5} strokeLinecap="round" fill="none" opacity={joined} />
                <Label x={(b.x + 0.5) * CELL} y={(Math.min(...b.cells.map((p) => Math.floor(p / PATCH.w))) - 0.6) * CELL} size={32} color={COLOR.good} anchor="middle" opacity={joined}>
                  塊
                </Label>
                <Cross x={(b.x + 0.5) * CELL} y={(b.y + 0.5) * CELL} size={16} opacity={center} />
              </g>
            ))}
            <rect x={zc * CELL} y={zr * CELL} width={zn * CELL} height={zn * CELL} fill="none" stroke={COLOR.dim} strokeWidth={2} strokeDasharray="6 6" opacity={ramp(frame, 20, 15)} />
          </Pixels>
          <Note kind="模式図" />
        </div>
        <Caption>隣り合う明るい画素をつなぐ</Caption>
      </At>
      {/* 拡大図 */}
      <svg width={zn * zcell + 80} height={zn * zcell + 50} style={{ position: "absolute", left: zx - 80, top: zy - 50, opacity: ramp(frame, 20, 15) }}>
        <g transform="translate(80 50)">
          {Array.from({ length: zn * zn }, (_, i) => {
            const [c, r] = [zc + (i % zn), zr + Math.floor(i / zn)];
            const v = PATCH.blurred[r * PATCH.w + c];
            const inside = PATCH.label[r * PATCH.w + c] === 0;
            const g = gray(v) * (inside ? 1 : 0.45);
            return (
              <g key={i}>
                <rect x={(c - zc) * zcell} y={(r - zr) * zcell} width={zcell} height={zcell} fill={`rgb(${g},${g},${Math.min(255, g * 1.1)})`} stroke="#1a2238" strokeWidth={1.5} />
                {inside && (
                  <text x={(c - zc + 0.5) * zcell} y={(r - zr + 0.5) * zcell + 10} fontSize={28} fontWeight={700} textAnchor="middle" fill={g > 140 ? "#05070d" : COLOR.text} opacity={weights}>
                    {v.toFixed(1)}
                  </text>
                )}
              </g>
            );
          })}
          <path d={outline(0, zcell, zc, zr)} stroke={COLOR.good} strokeWidth={6} strokeLinecap="round" fill="none" opacity={joined} />
          {/* 画素の番号。重心は番号と番号の間に来る */}
          <g opacity={ruler}>
            {Array.from({ length: zn }, (_, i) => (
              <g key={i}>
                <text x={(i + 0.5) * zcell} y={-14} fontSize={28} fill={COLOR.dim} textAnchor="middle">
                  {ORIGIN.x + zc + i}
                </text>
                <text x={-14} y={(i + 0.5) * zcell + 10} fontSize={28} fill={COLOR.dim} textAnchor="end">
                  {ORIGIN.y + zr + i}
                </text>
              </g>
            ))}
            <line x1={sx} y1={0} x2={sx} y2={sy} stroke={COLOR.bad} strokeWidth={3} strokeDasharray="8 7" />
            <line x1={0} y1={sy} x2={sx} y2={sy} stroke={COLOR.bad} strokeWidth={3} strokeDasharray="8 7" />
          </g>
          <Cross x={sx} y={sy} size={30} opacity={center} />
        </g>
      </svg>
      <At x={1230} y={100} w={570} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Reveal at={200}>
          <Card>
            <b style={{ color: COLOR.bad }}>重心</b> = 明るさで重みを付けた、位置の平均
          </Card>
        </Reveal>
        <Reveal at={l1}>
          <Card color={COLOR.accent} style={{ fontSize: 54, fontWeight: 800 }}>
            <div>
              x = {Math.floor(ORIGIN.x + star.x)}
              <span style={{ color: COLOR.accent }}>.{(star.x % 1).toFixed(2).slice(2)}</span>
            </div>
            <div>
              y = {Math.floor(ORIGIN.y + star.y)}
              <span style={{ color: COLOR.accent }}>.{(star.y % 1).toFixed(2).slice(2)}</span>
            </div>
          </Card>
        </Reveal>
        <Reveal at={l2 + 100}>
          <Card color={COLOR.good}>
            <b style={{ color: COLOR.good }}>1画素より細かい</b> 精度で位置が決まる
          </Card>
        </Reveal>
      </At>
    </Stage>
  );
};

// 実画像に検出の印が一斉に付き、394枚すべての検出数を並べる
const Result: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const size = 660;
  const k = size / CROP_SIZE;
  const l1 = lineAt(scene, 1);
  const found = Math.min(CROP_STARS.length, Math.max(0, Math.floor((frame - 6) / 0.16)));
  const counts = frames.track.map((t) => t.stars);
  const [x0, x1, y0, y1] = [110, 1060, 50, 330];
  const x = scaler(0, counts.length, x0, x1);
  const y = scaler(0, 3200, y1, y0);
  const shown = linear(frame, l1 + 10, 110) * counts.length;
  return (
    <Stage chapter={chapter}>
      <At x={0} y={15} w={size} h={size}>
        <Img src={staticFile(CROP)} style={{ width: size, height: size, borderRadius: 14, display: "block" }} />
        <svg width={size} height={size} style={{ position: "absolute", left: 0, top: 0 }}>
          {CROP_STARS.slice(0, found).map(([sx, sy], i) => (
            <circle key={i} cx={sx * k} cy={sy * k} r={mix(18, 8, ramp(frame, 6 + i * 0.16, 8))} fill="none" stroke={COLOR.good} strokeWidth={2.5} />
          ))}
        </svg>
        <Note kind="実際の画像" />
      </At>
      <At x={720} y={15} w={1080} style={{ display: "flex", gap: 24 }}>
        <Card color={COLOR.good} style={{ flex: 1 }}>
          この範囲で見つかった星
          <div style={{ fontSize: 64, fontWeight: 800, color: COLOR.good, lineHeight: 1.2 }}>{found}個</div>
        </Card>
        <Reveal at={50} style={{ flex: 1 }}>
          <Card>
            写真1枚の全体では
            <div style={{ fontSize: 64, fontWeight: 800, color: COLOR.text, lineHeight: 1.2 }}>{frames.track[frames.reference].stars.toLocaleString("en-US")}個</div>
          </Card>
        </Reveal>
      </At>
      <At x={720} y={250} w={1080} opacity={ramp(frame, l1, 15)}>
        <div style={{ fontSize: 40, fontWeight: 700, color: COLOR.text }}>394枚すべてで星を見つける</div>
        <svg width={1080} height={410} style={{ display: "block" }}>
          {[0, 1000, 2000, 3000].map((v) => (
            <g key={v}>
              <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} stroke={COLOR.line} strokeWidth={v === 0 ? 3 : 1.5} />
              <text x={x0 - 12} y={y(v) + 10} fontSize={28} fill={COLOR.dim} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {counts.map((v, i) => (i < shown ? <rect key={i} x={x(i)} y={y(v)} width={(x1 - x0) / counts.length + 0.3} height={y1 - y(v)} fill={COLOR.good} /> : null))}
          {[0, 100, 200, 300].map((v) => (
            <text key={v} x={x(v)} y={y1 + 32} fontSize={28} fill={COLOR.dim} textAnchor="middle">
              {v}
            </text>
          ))}
          <text x={(x0 + x1) / 2} y={y1 + 72} fontSize={30} fill={COLOR.dim} textAnchor="middle">
            フレーム番号(縦は1枚ごとに見つかった星の数)
          </text>
        </svg>
        <Note kind="実際のデータ" style={{ bottom: "auto", top: 4, right: 20 }} />
      </At>
    </Stage>
  );
};

// 「章ID/場面名」→ 場面の絵
export const ch07: Record<string, SceneView> = {
  "07_find_stars/問題": Problem,
  "07_find_stars/アルゴリズム ぼかす": Blur,
  "07_find_stars/しきい値": Threshold,
  "07_find_stars/塊と重心": Blob,
  "07_find_stars/結果": Result,
};
