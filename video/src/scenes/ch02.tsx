import { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { SimSky } from "../components/SimSky";
import { Card, Reveal, Stage, Tag } from "../components/ui";
import { gauss, hash } from "../sim/rng";
import { rawFrame, SIM, starField } from "../sim/sky";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, tween } from "../timing";
import type { SceneView } from "../types";
import { makeStars, Phase, SkyPanel } from "./ch01_parts";

const PHOTON = "#ffe08a"; // 光の粒の色

// ---- バケツ ----

/** バケツ。(x, y) は口の左端。count 個の光の粒が底から積もる。 */
const Bucket = ({ x, y, w, h, count, seed = 0, color = COLOR.text, dashed = false }: { x: number; y: number; w: number; h: number; count: number; seed?: number; color?: string; dashed?: boolean }) => {
  const inset = w * 0.1;
  const r = Math.max(5, w / 26);
  const cols = Math.floor((w - inset * 2 - 8) / (r * 2 + 2));
  return (
    <g>
      {Array.from({ length: Math.max(0, count) }, (_, k) => {
        const [col, row] = [k % cols, Math.floor(k / cols)];
        const cx = x + inset + 6 + r + col * (r * 2 + 2) + (hash(seed, k, 1) - 0.5) * 3;
        return <circle key={k} cx={cx} cy={y + h - 8 - r - row * (r * 2 + 1)} r={r} fill={PHOTON} />;
      })}
      <path d={`M${x} ${y} L${x + inset} ${y + h} L${x + w - inset} ${y + h} L${x + w} ${y}`} fill="rgba(108,196,255,0.06)" stroke={color} strokeWidth={5} strokeLinejoin="round" strokeDasharray={dashed ? "12 10" : undefined} />
    </g>
  );
};

/** k 番目の粒がバケツの口に届くフレーム。1フレームあたり rate 個の割合で、少しばらつく。 */
const arrival = (seed: number, k: number, start: number, rate: number) => start + (k + 0.5 + (hash(seed, k, 3) - 0.5) * 0.6) / rate;

/** 上から降ってくる粒。届いた数は呼ぶ側で数える。 */
const Rain = ({ seed, x, w, top, bottom, start, rate, until = 1e9 }: { seed: number; x: number; w: number; top: number; bottom: number; start: number; rate: number; until?: number }) => {
  const frame = useCurrentFrame();
  const fall = 26; // 落ちるのにかかるフレーム
  const first = Math.max(0, Math.floor((frame - start) * rate) - 1);
  const last = Math.ceil((frame + fall - start) * rate) + 1;
  return (
    <g>
      {Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => {
        const k = first + i;
        const t = arrival(seed, k, start, rate);
        if (t > until || frame < t - fall || frame >= t) return null;
        const p = 1 - (t - frame) / fall;
        return <circle key={k} cx={x + w * (0.15 + 0.7 * hash(seed, k, 4))} cy={top + (bottom - top) * p} r={9} fill={PHOTON} opacity={Math.min(1, p * 4)} />;
      })}
    </g>
  );
};

/** start から frame までに届いた粒の数。 */
const landed = (seed: number, frame: number, start: number, rate: number, until = 1e9) => {
  let n = 0;
  for (let k = 0; arrival(seed, k, start, rate) <= Math.min(frame, until); k++) n++;
  return n;
};

const Buckets: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const at = lineAt(scene, 1);
  const [countAt, bucketAt] = [at + 110, at + 235];
  const settings = ["RAW", "16秒", "ISO 100", "無限遠", "連続撮影", "タイマー"];
  const rates = [0.05, 0.11, 0.03, 0.08, 0.06];
  return (
    <Stage chapter={chapter}>
      {/* 前の章の設定。意味はまだ分からない */}
      <Phase to={at}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 40 }}>
          <div style={{ display: "flex", gap: 22 }}>
            {settings.map((s, i) => (
              <Reveal key={s} at={8 + i * 8}>
                <Card style={{ fontSize: 42, fontWeight: 700, transform: `translateY(${Math.sin(frame / 14 + i) * 8}px)` }}>{s}</Card>
              </Reveal>
            ))}
          </div>
          <Reveal at={70}>
            <div style={{ fontSize: 64, fontWeight: 800, color: COLOR.warn }}>… どういう意味?</div>
          </Reveal>
        </div>
      </Phase>
      <Phase from={at}>
        <svg width={STAGE.w} height={STAGE.h}>
          {/* センサーと、格子状に並ぶ画素 */}
          <rect x={40} y={130} width={500} height={380} rx={14} fill="#101a30" stroke={COLOR.dim} strokeWidth={4} />
          {Array.from({ length: 20 * 15 }, (_, i) => {
            const [c, r] = [i % 20, Math.floor(i / 20)];
            const lit = ramp(frame, at + 20 + (c + r) * 2, 10);
            return <rect key={i} x={64 + c * 22.6} y={150 + r * 22.8} width={19} height={19} fill={COLOR.accent} opacity={lit * (0.25 + 0.3 * hash(i, 5))} />;
          })}
          <text x={290} y={104} fill={COLOR.text} fontSize={40} fontWeight={700} textAnchor="middle">
            カメラのセンサー
          </text>
          <g opacity={ramp(frame, countAt, 15)}>
            <text x={290} y={580} fill={COLOR.text} fontSize={40} textAnchor="middle">
              画素が{" "}
              <tspan fill={COLOR.accent} fontSize={64} fontWeight={800}>
                1200万個
              </tspan>
            </text>
          </g>
          {/* 画素を拡大するとバケツ */}
          <g opacity={ramp(frame, bucketAt, 15)}>
            <rect x={330} y={332} width={112} height={22} fill="none" stroke={COLOR.warn} strokeWidth={4} />
            <path d="M442 332 L640 60 M442 354 L640 650" stroke={COLOR.warn} strokeWidth={3} strokeDasharray="8 8" fill="none" />
            <rect x={640} y={60} width={1150} height={590} rx={14} fill="rgba(14,20,36,0.7)" stroke={COLOR.warn} strokeWidth={3} />
            {rates.map((rate, i) => {
              const x = 680 + i * 218;
              return (
                <g key={i}>
                  <Rain seed={30 + i} x={x} w={190} top={70} bottom={380} start={bucketAt + 20} rate={rate} />
                  <Bucket x={x} y={380} w={190} h={190} count={landed(30 + i, frame, bucketAt + 20, rate)} seed={i} />
                </g>
              );
            })}
            <text x={1215} y={624} fill={COLOR.text} fontSize={40} fontWeight={700} textAnchor="middle">
              画素 = 光の粒をためる
              <tspan fill={COLOR.warn} fontSize={50}>
                「バケツ」
              </tspan>
            </text>
          </g>
        </svg>
        <Reveal at={bucketAt + 30} style={{ position: "absolute", left: 1500, top: 76 }}>
          <Tag color={PHOTON}>光の粒</Tag>
        </Reveal>
      </Phase>
    </Stage>
  );
};

// ---- シャッター速度 ----

const Shutter: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [open, perSec, rate] = [40, 12.5, 0.24]; // 16秒を 200 フレームに縮めて見せる
  const [whyAt, laterAt] = [lineAt(scene, 1), lineAt(scene, 2)];
  const [top, w, h] = [330, 250, 250];
  return (
    <Stage chapter={chapter} title="シャッター速度 = バケツを開けておく時間">
      <svg width={STAGE.w} height={STAGE.h}>
        {[1, 4, 16].map((sec, i) => {
          const x = 70 + i * 420;
          const close = open + sec * perSec;
          const lid = ramp(frame, open - 8, 8) * (1 - ramp(frame, close, 8)); // 1 で全開
          const elapsed = Math.min(sec, Math.max(0, (frame - open) / perSec));
          const count = landed(50 + i, frame, open, rate, close);
          const best = sec === 16 && frame >= whyAt;
          return (
            <g key={sec}>
              <text x={x + w / 2} y={70} fill={best ? COLOR.good : COLOR.text} fontSize={72} fontWeight={800} textAnchor="middle">
                {sec}秒
              </text>
              {/* 開けている時間の目盛り */}
              <rect x={x} y={92} width={w} height={14} rx={7} fill={COLOR.line} />
              <rect x={x} y={92} width={(w * elapsed) / sec} height={14} rx={7} fill={COLOR.accent} />
              <Rain seed={50 + i} x={x} w={w} top={120} bottom={top} start={open - 100} rate={rate} />
              {/* 閉じているあいだは、ふたが粒を止める */}
              <rect x={x - 12} y={top - 12} width={(w + 24) * (1 - lid)} height={14} rx={5} fill={COLOR.dim} />
              <rect x={x - 12} y={top - 2} width={w + 24} height={30} fill={COLOR.bg} opacity={lid < 0.5 ? 1 : 0} />
              <Bucket x={x} y={top} w={w} h={h} count={count} seed={i} color={best ? COLOR.good : COLOR.text} />
              <text x={x + w / 2} y={top + h + 62} fill={PHOTON} fontSize={44} fontWeight={700} textAnchor="middle">
                光の粒 {count}個
              </text>
            </g>
          );
        })}
        {/* もっと長くしたら? */}
        <g opacity={ramp(frame, whyAt + 80, 15)}>
          <text x={1470 + 130} y={70} fill={COLOR.warn} fontSize={52} fontWeight={800} textAnchor="middle">
            もっと長く?
          </text>
          <Bucket x={1470} y={top} w={260} h={h} count={0} color={COLOR.warn} dashed />
          <text x={1600} y={top + 160} fill={COLOR.warn} fontSize={120} fontWeight={800} textAnchor="middle" opacity={0.6 + 0.4 * Math.sin(frame / 8)}>
            ?
          </text>
        </g>
      </svg>
      <Reveal at={150} style={{ position: "absolute", left: 1300, top: 270 }}>
        <Tag color={PHOTON}>星の光は弱い → 粒がまばら</Tag>
      </Reveal>
      <Reveal at={laterAt + 20} style={{ position: "absolute", left: 1330, top: 110 }}>
        <Card color={COLOR.warn} style={{ fontSize: 34, width: 440, textAlign: "center" }}>
          できない理由がある
          <br />→ あとで説明
        </Card>
      </Reveal>
    </Stage>
  );
};

// ---- ISO感度 ----

const Iso: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [noiseAt, backAt] = [lineAt(scene, 1), lineAt(scene, 2)];
  // 倍率。ISO 100 を 1 として、800 まで上げてから 100 に戻す
  const gain = tween(frame, 150, 120, 1, 8) - tween(frame, backAt + 20, 40, 0, 7);
  const iso = Math.round((100 * gain) / 10) * 10;
  const photons = 20;
  // 画素ごとの光の量。6フレームごとにゆらぐ
  const shot = Math.floor(frame / 6);
  const pixels = Array.from({ length: 16 }, (_, i) => (i === 4 ? 14 : i === 11 ? 30 : 5) + 1.6 * gauss(i, shot, 77));
  const [cw, ch, limit] = [760, 330, 100];
  const clipped = pixels.some((v) => v * gain > limit);
  const knob = 60 + (Math.log2(gain) / 3) * 420;
  return (
    <Stage chapter={chapter} title="ISO感度 = 数字にするときの「倍率」">
      <svg width={STAGE.w} height={STAGE.h}>
        {/* たまった光の粒(増えない) */}
        <Bucket x={60} y={150} w={250} h={230} count={photons} seed={3} />
        <text x={185} y={436} fill={PHOTON} fontSize={40} fontWeight={700} textAnchor="middle">
          光の粒 {photons}個
        </text>
        <text x={185} y={482} fill={COLOR.dim} fontSize={30} textAnchor="middle" opacity={ramp(frame, 230, 15)}>
          (粒は増えない)
        </text>
        <text x={420} y={290} fill={COLOR.accent} fontSize={70} fontWeight={800} textAnchor="middle">
          × {gain.toFixed(gain < 1.05 || gain > 7.95 ? 0 : 1)}
        </text>
        <path d="M350 320 L480 320 M460 304 L482 320 L460 336" stroke={COLOR.accent} strokeWidth={5} fill="none" />
        <text x={530} y={250} fill={COLOR.dim} fontSize={32}>
          数字
        </text>
        <text x={530} y={340} fill={COLOR.text} fontSize={96} fontWeight={800}>
          {Math.round(photons * gain)}
        </text>
        {/* ISO のつまみ */}
        <g transform="translate(40 540)">
          <line x1={60} y1={40} x2={480} y2={40} stroke={COLOR.line} strokeWidth={10} strokeLinecap="round" />
          <line x1={60} y1={40} x2={knob} y2={40} stroke={COLOR.accent} strokeWidth={10} strokeLinecap="round" />
          {[100, 200, 400, 800].map((v, i) => (
            <text key={v} x={60 + i * 140} y={96} fill={COLOR.dim} fontSize={30} textAnchor="middle">
              {v}
            </text>
          ))}
          <circle cx={knob} cy={40} r={22} fill={COLOR.accent} stroke="#fff" strokeWidth={4} />
          <text x={540} y={62} fill={COLOR.accent} fontSize={64} fontWeight={800}>
            ISO {iso}
          </text>
        </g>
        {/* 画素ごとの数字。倍率を掛けると、ゆらぎも同じだけ大きくなる */}
        <g transform="translate(960 150)" opacity={ramp(frame, 110, 15) * (1 - ramp(frame, backAt + 55, 15))}>
          <line x1={0} y1={0} x2={cw} y2={0} stroke={COLOR.bad} strokeWidth={3} strokeDasharray="10 8" />
          <text x={cw} y={-14} fill={COLOR.bad} fontSize={30} textAnchor="end">
            数字の上限(これより上は真っ白)
          </text>
          {pixels.map((v, i) => {
            const out = Math.max(0, v * gain);
            const bar = (Math.min(limit, out) / limit) * ch;
            const star = i === 4 || i === 11;
            return <rect key={i} x={i * (cw / 16) + 5} y={ch - bar} width={cw / 16 - 10} height={bar} fill={out > limit ? "#ffffff" : star ? PHOTON : COLOR.accent} />;
          })}
          <line x1={0} y1={ch} x2={cw} y2={ch} stroke={COLOR.text} strokeWidth={4} />
          <text x={cw / 2} y={ch + 44} fill={COLOR.dim} fontSize={30} textAnchor="middle">
            画素ごとの数字(黄色は星)
          </text>
        </g>
      </svg>
      <Reveal at={noiseAt + 60} style={{ position: "absolute", left: 960, top: 560 }}>
        <Tag color={COLOR.warn} style={{ fontSize: 36, opacity: 1 - ramp(frame, backAt + 55, 15) }}>
          雑音(ゆらぎ)も一緒に大きくなる
        </Tag>
      </Reveal>
      {clipped && frame < backAt + 60 && (
        <Tag color="#fff" style={{ position: "absolute", left: 1300, top: 190, fontSize: 34 }}>
          明るい星が白く飛ぶ
        </Tag>
      )}
      <Phase from={backAt + 70}>
        <div style={{ position: "absolute", left: 960, top: 130, width: 790, display: "flex", flexDirection: "column", gap: 24 }}>
          <Card color={COLOR.good} style={{ fontSize: 44 }}>
            今回は低めの <b style={{ color: COLOR.good, fontSize: 60 }}>ISO 100</b>
          </Card>
          <Reveal at={backAt + 130}>
            <Card style={{ fontSize: 38 }}>上げすぎると、明るい星が白く飛ぶ</Card>
          </Reveal>
          <Reveal at={backAt + 240}>
            <Card style={{ fontSize: 38 }}>明るさは、あとから計算で持ち上げられる</Card>
          </Reveal>
        </div>
      </Phase>
    </Stage>
  );
};

// ---- 脱線 ISOの由来 ----

const IsoOrigin: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [orgAt, filmAt, greekAt] = [lineAt(scene, 1), lineAt(scene, 3), lineAt(scene, 4)];
  const merge = ramp(frame, filmAt + 200, 40);
  return (
    <Stage chapter={chapter} title="脱線: ISO って何の略?">
      {/* 団体の名前 */}
      <Phase to={filmAt}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, paddingTop: 20 }}>
          <div style={{ fontSize: 150, fontWeight: 800, color: COLOR.accent, letterSpacing: 10, transform: `scale(${1 + 0.02 * Math.sin(frame / 15)})` }}>
            ISO <span style={{ color: COLOR.warn, opacity: 1 - ramp(frame, orgAt, 12) }}>?</span>
          </div>
          <Reveal at={orgAt + 10}>
            <div style={{ fontSize: 76, fontWeight: 800, color: COLOR.text }}>= 国際標準化機構</div>
          </Reveal>
          <Reveal at={orgAt + 60}>
            <div style={{ fontSize: 36, color: COLOR.dim }}>世界共通の規格を決めている団体の名前</div>
          </Reveal>
          <div style={{ display: "flex", gap: 40 }}>
            <Reveal at={orgAt + 130}>
              <Card style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 38 }}>
                <svg width={120} height={90}>
                  <g transform={`rotate(${frame * 3} 28 45)`}>
                    <path d="M28 21 L49 33 L49 57 L28 69 L7 57 L7 33Z" fill="#9aa6c4" />
                    <rect x={24} y={30} width={8} height={30} fill="#39415c" />
                  </g>
                  <rect x={48} y={37} width={66} height={16} fill="#9aa6c4" />
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <line key={i} x1={56 + i * 10} y1={37} x2={52 + i * 10} y2={53} stroke="#39415c" strokeWidth={3} />
                  ))}
                </svg>
                ネジの寸法
              </Card>
            </Reveal>
            <Reveal at={orgAt + 190}>
              <Card style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 38 }}>
                <svg width={90} height={90}>
                  <rect x={12} y={6} width={66} height={80} rx={6} fill="none" stroke="#9aa6c4" strokeWidth={5} />
                  {[0, 1, 2].map((i) => (
                    <path key={i} d={`M24 ${28 + i * 22} l7 7 l12 -14`} fill="none" stroke={COLOR.good} strokeWidth={5} opacity={ramp(frame, orgAt + 200 + i * 12, 8)} />
                  ))}
                </svg>
                会社の品質管理のやり方
              </Card>
            </Reveal>
          </div>
        </div>
      </Phase>
      {/* フィルムの感度: ASA と DIN が ISO にまとまる */}
      <Phase from={filmAt} to={greekAt}>
        <svg width={STAGE.w} height={STAGE.h}>
          <text x={900} y={50} fill={COLOR.dim} fontSize={36} textAnchor="middle">
            フィルムの時代: 感度の表し方がばらばら
          </text>
          {[
            { name: "ASA", value: "100", from: "アメリカ", x: 520, at: filmAt + 60, color: COLOR.warn },
            { name: "DIN", value: "21", from: "ドイツ", x: 1280, at: filmAt + 120, color: COLOR.accent },
          ].map((b) => {
            const slide = (1 - ramp(frame, b.at, 20)) * (b.x < 900 ? -120 : 120);
            return (
              <g key={b.name} opacity={ramp(frame, b.at, 15)} transform={`translate(${b.x + slide} 200) scale(0.8)`}>
                {/* フィルムの箱 */}
                <rect x={-190} y={-130} width={380} height={260} rx={14} fill="#1a2238" stroke={b.color} strokeWidth={5} />
                <rect x={-190} y={-130} width={380} height={62} rx={14} fill={b.color} />
                <text x={0} y={-86} fill={COLOR.bg} fontSize={36} fontWeight={800} textAnchor="middle">
                  フィルム({b.from})
                </text>
                <text x={0} y={60} fill={b.color} fontSize={110} fontWeight={800} textAnchor="middle">
                  {b.name} {b.value}
                </text>
              </g>
            );
          })}
          {/* 2つの箱から、1つの規格へ向かう矢印 */}
          {[520, 1280].map((x) => (
            <g key={x} opacity={merge}>
              <line x1={x} y1={312} x2={x + (900 - x) * 0.55 * merge} y2={312 + 62 * merge} stroke={COLOR.good} strokeWidth={8} strokeLinecap="round" />
              <circle cx={x + (900 - x) * 0.55 * merge} cy={312 + 62 * merge} r={11} fill={COLOR.good} />
            </g>
          ))}
          <g opacity={merge} transform={`translate(900 ${490 + (1 - merge) * 30})`}>
            <rect x={-360} y={-110} width={720} height={220} rx={18} fill={COLOR.panel} stroke={COLOR.good} strokeWidth={6} />
            <text x={0} y={-48} fill={COLOR.dim} fontSize={34} textAnchor="middle">
              1つの国際規格にまとめた
            </text>
            <text x={0} y={66} fill={COLOR.good} fontSize={110} fontWeight={800} textAnchor="middle">
              ISO 100/21°
            </text>
          </g>
          <text x={900} y={650} fill={COLOR.text} fontSize={44} fontWeight={700} textAnchor="middle" opacity={ramp(frame, filmAt + 260, 15)}>
            だから「ISO感度」と呼ぶ
          </text>
        </svg>
      </Phase>
      {/* 名前の由来 */}
      <Phase from={greekAt}>
        <div style={{ display: "flex", gap: 50, height: "100%", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, width: 880 }}>
            <Reveal at={greekAt + 20}>
              <div style={{ fontSize: 40, color: COLOR.text, fontWeight: 700 }}>ISO は、頭文字を並べたものではない</div>
            </Reveal>
            {[
              { lang: "英語", name: "International Organization for Standardization", short: "IOS" },
              { lang: "フランス語", name: "Organisation internationale de normalisation", short: "OIN" },
            ].map((l, i) => (
              <Reveal key={l.lang} at={greekAt + 90 + i * 40}>
                <Card style={{ fontSize: 30, padding: "14px 24px" }}>
                  <div style={{ color: COLOR.dim }}>
                    {l.lang}の頭文字なら → <b style={{ fontSize: 44, color: COLOR.warn }}>{l.short}</b>
                  </div>
                  <div style={{ fontSize: 28 }}>{l.name}</div>
                </Card>
              </Reveal>
            ))}
            <Reveal at={greekAt + 135}>
              <div style={{ fontSize: 34, color: COLOR.warn }}>言葉によって略し方が変わってしまう</div>
            </Reveal>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, flex: 1, alignItems: "center" }}>
            <Reveal at={greekAt + 200}>
              <Card color={COLOR.good} style={{ textAlign: "center", padding: "24px 50px" }}>
                <div style={{ fontSize: 34, color: COLOR.dim }}>ギリシャ語</div>
                <div style={{ fontSize: 120, fontWeight: 800, color: COLOR.good, lineHeight: 1.2 }}>isos</div>
                <div style={{ fontSize: 46, fontWeight: 700 }}>イソス =「等しい」</div>
              </Card>
            </Reveal>
            <Reveal at={greekAt + 270}>
              <div style={{ fontSize: 34, color: COLOR.dim }}>…から取った、と説明されている</div>
            </Reveal>
            <Reveal at={greekAt + 350}>
              <Tag style={{ fontSize: 36 }}>カメラの世界では「イソ」と読む人も多い</Tag>
            </Reveal>
          </div>
        </div>
      </Phase>
    </Stage>
  );
};

// ---- 焦点距離 ----

// 架空の星座(0〜1 の座標)。真ん中の1つは、長い焦点距離でも枠に入る
const FIGURES = [
  [[0.44, 0.42], [0.5, 0.5], [0.57, 0.46], [0.55, 0.58], [0.47, 0.6], [0.5, 0.5]],
  [[0.08, 0.2], [0.16, 0.14], [0.24, 0.22], [0.2, 0.34], [0.1, 0.36]],
  [[0.74, 0.14], [0.82, 0.22], [0.9, 0.16], [0.82, 0.22], [0.84, 0.36]],
  [[0.1, 0.74], [0.2, 0.68], [0.3, 0.76], [0.26, 0.9]],
  [[0.68, 0.72], [0.76, 0.66], [0.86, 0.72], [0.92, 0.86], [0.76, 0.66]],
];

/** 同じ空。両方の枠に同じものを描く。 */
const WideSky = ({ w, h, lines }: { w: number; h: number; lines: number }) => {
  const frame = useCurrentFrame();
  const stars = useMemo(() => makeStars(21, 170), []);
  return (
    <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x * w} cy={s.y * h} r={1.2 + 2.4 * s.b} fill={s.tint} opacity={(0.5 + 0.5 * s.b) * (0.8 + 0.2 * Math.sin(frame * 0.12 + s.phase))} />
      ))}
      {FIGURES.map((f, k) => (
        <g key={k}>
          <polyline points={f.map(([x, y]) => `${x * w},${y * h}`).join(" ")} fill="none" stroke={COLOR.accent} strokeWidth={2} opacity={0.75 * lines} />
          {f.map(([x, y], i) => (
            <circle key={i} cx={x * w} cy={y * h} r={4.5} fill="#fff" />
          ))}
        </g>
      ))}
    </svg>
  );
};

const Focal: SceneView = ({ chapter }) => {
  const frame = useCurrentFrame();
  const [w, h] = [860, 484];
  // 写る範囲(空の枠に対する割合)。長い焦点距離から、短い焦点距離へ
  const s = tween(frame, 70, 150, 0.3, 1);
  const lines = ramp(frame, 250, 30);
  const knob = 800 - ((s - 0.3) / 0.7) * 540;
  return (
    <Stage chapter={chapter} title="焦点距離 = 空のどれくらい広い範囲を写すか">
      <div style={{ display: "flex", gap: 80 }}>
        <SkyPanel w={w} h={h} label="同じ空">
          <WideSky w={w} h={h} lines={lines} />
          <div style={{ position: "absolute", left: (w * (1 - s)) / 2, top: (h * (1 - s)) / 2, width: w * s, height: h * s, border: `5px solid ${COLOR.warn}`, boxSizing: "border-box", boxShadow: "0 0 0 2000px rgba(5,7,13,0.55)" }} />
        </SkyPanel>
        <SkyPanel w={w} h={h} label="写る範囲" color={COLOR.warn} style={{ border: `4px solid ${COLOR.warn}` }}>
          <div style={{ position: "absolute", inset: 0, transform: `scale(${1 / s})`, transformOrigin: "center" }}>
            <WideSky w={w} h={h} lines={lines} />
          </div>
          <Tag color={s < 0.6 ? COLOR.dim : COLOR.good} style={{ position: "absolute", left: 14, bottom: 14 }}>
            {s < 0.6 ? "狭い範囲・星は大きい" : "広い範囲・星座がいくつも入る"}
          </Tag>
        </SkyPanel>
      </div>
      {/* 焦点距離のつまみ */}
      <svg width={STAGE.w} height={190} style={{ position: "absolute", left: 0, top: 500 }}>
        <text x={20} y={72} fill={COLOR.text} fontSize={40} fontWeight={700}>
          焦点距離
        </text>
        <line x1={260} y1={58} x2={800} y2={58} stroke={COLOR.line} strokeWidth={10} strokeLinecap="round" />
        <circle cx={knob} cy={58} r={22} fill={COLOR.warn} stroke="#fff" strokeWidth={4} />
        <text x={260} y={124} fill={COLOR.good} fontSize={34} fontWeight={700} textAnchor="middle">
          短い
        </text>
        <text x={800} y={124} fill={COLOR.dim} fontSize={34} fontWeight={700} textAnchor="middle">
          長い
        </text>
        <text x={260} y={166} fill={COLOR.good} fontSize={30} textAnchor="middle" opacity={ramp(frame, 200, 15)}>
          スマホ(数ミリ)
        </text>
      </svg>
      <Reveal at={110} style={{ position: "absolute", left: 940, top: 530 }}>
        <Card color={COLOR.good} style={{ fontSize: 42 }}>
          数字が<b style={{ color: COLOR.good }}>小さい</b>ほど、<b style={{ color: COLOR.good }}>広く</b>写る
        </Card>
      </Reveal>
    </Stage>
  );
};

// ---- RAW ----

const Raw: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const rawAt = lineAt(scene, 2);
  const [cleanAt, lostAt] = [170, 260];
  const scale = 3;
  const sim = useMemo(() => {
    const opts = { pollution: 0.12, vignette: 0.3 };
    const noisy = rawFrame({ ...opts, noise: 1.3, shot: 3 });
    // ふつうの写真: ノイズを消すときに、暗い星も一緒に消える
    const stars = starField(0, 1);
    const clean = rawFrame({ ...opts, stars: false, noise: 0, hot: false });
    const faint: { x: number; y: number; v: number }[] = [];
    for (let y = 8; y < SIM.h - 8; y++) {
      for (let x = 8; x < SIM.w - 8; x++) {
        const k = (y * SIM.w + x) * 3;
        const v = stars[k + 1];
        // 明るい星(近くに強い光がある画素)だけが残る
        let near = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near = Math.max(near, stars[((y + dy) * SIM.w + x + dx) * 3 + 1]);
        if (near > 4.5) for (let c = 0; c < 3; c++) clean[k + c] += stars[k + c] * 1.3;
        // 消えてしまう星のうち、目立つものを印の候補にする
        const peak = v >= stars[k - 2] && v > stars[k + 4] && v >= stars[k + 1 - SIM.w * 3] && v > stars[k + 1 + SIM.w * 3];
        if (peak && v > 2.2 && v < 3.8 && faint.every((f) => Math.hypot(f.x - x, f.y - y) > 28)) faint.push({ x, y, v });
      }
    }
    return { noisy, clean, faint: faint.slice(0, 7) };
  }, []);
  const [pw, ph] = [SIM.w * scale, SIM.h * scale];
  const marks = (color: string, at: number) => (
    <svg width={pw} height={ph} style={{ position: "absolute", left: 0, top: 0 }}>
      {sim.faint.map((f, i) => (
        <circle key={i} cx={(f.x + 0.5) * scale} cy={(f.y + 0.5) * scale} r={20 + 3 * Math.sin(frame / 8 + i)} fill="none" stroke={color} strokeWidth={4} opacity={ramp(frame, at + i * 5, 12)} />
      ))}
    </svg>
  );
  return (
    <Stage chapter={chapter}>
      <div style={{ display: "flex", gap: 90, justifyContent: "center" }}>
        <div style={{ width: pw }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: COLOR.warn, marginBottom: 10 }}>ふつうの写真</div>
          <div style={{ position: "relative", width: pw, height: ph }}>
            <SimSky image={sim.noisy} scale={scale} lo={0.2} hi={8} style={{ position: "absolute" }} />
            <SimSky image={sim.clean} scale={scale} lo={0.2} hi={8} style={{ position: "absolute", opacity: ramp(frame, cleanAt, 40) }} />
            {marks(COLOR.bad, lostAt)}
            <Tag color={COLOR.dim} style={{ position: "absolute", left: 12, top: 12, opacity: 1 - ramp(frame, cleanAt, 20) }}>
              センサーが受けた光
            </Tag>
            <Tag color={COLOR.warn} style={{ position: "absolute", left: 12, top: 12, opacity: ramp(frame, cleanAt + 10, 20) }}>
              カメラが自動で処理したあと
            </Tag>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
            {["色を整える", "明るさを整える", "ノイズを消す"].map((t, i) => (
              <Reveal key={t} at={90 + i * 35}>
                <Card style={{ fontSize: 30, padding: "8px 18px" }}>{t}</Card>
              </Reveal>
            ))}
          </div>
          <Reveal at={lostAt} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 38, fontWeight: 700, color: COLOR.bad }}>暗い星まで、一緒に消されてしまう</div>
          </Reveal>
        </div>
        <div style={{ width: pw, opacity: ramp(frame, rawAt, 20) }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: COLOR.good, marginBottom: 10 }}>RAW</div>
          <div style={{ position: "relative", width: pw, height: ph }}>
            <SimSky image={sim.noisy} scale={scale} lo={0.2} hi={8} style={{ position: "absolute" }} />
            {marks(COLOR.good, rawAt + 90)}
            <Tag color={COLOR.good} style={{ position: "absolute", left: 12, top: 12 }}>
              バケツの数字を「そのまま」保存
            </Tag>
          </div>
          <Reveal at={rawAt + 90} style={{ marginTop: 16 }}>
            <div style={{ fontSize: 34, color: COLOR.text }}>ノイズは多いが、暗い星の光も残っている</div>
          </Reveal>
          <Reveal at={rawAt + 150} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 38, fontWeight: 700, color: COLOR.good }}>→ あとから自分で処理できる</div>
          </Reveal>
        </div>
      </div>
    </Stage>
  );
};

// ---- ベイヤー配列 ----

const Bayer: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [nameAt, oneAt, guessAt] = [lineAt(scene, 1), lineAt(scene, 2), lineAt(scene, 3)];
  const [filterAt, greenAt] = [170, nameAt + 150];
  const [n, cell, ox, oy] = [6, 100, 30, 60];
  const colorOf = (r: number, c: number) => (r % 2 === 0 ? (c % 2 === 0 ? COLOR.r : COLOR.g) : c % 2 === 0 ? COLOR.g : COLOR.b);
  const center = (r: number, c: number) => [ox + c * cell + cell / 2, oy + r * cell + cell / 2];
  const [tr, tc] = [2, 2]; // 注目する画素(赤)
  // 数え方の話(4つ目の台詞)からは、注目を解いて格子の全体に戻す
  const [countAt, ruleAt, shareAt] = [lineAt(scene, 4), lineAt(scene, 5), lineAt(scene, 6)];
  const back = ramp(frame, countAt, 20);
  const focus = ramp(frame, oneAt, 20) * (1 - back);
  const neighbors = [
    ...[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => ({ dr, dc, color: COLOR.g, at: guessAt + 60 })),
    ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dr, dc]) => ({ dr, dc, color: COLOR.b, at: guessAt + 120 })),
  ];
  const known = (at: number) => ramp(frame, at + 20, 15);
  return (
    <Stage chapter={chapter}>
      <svg width={700} height={STAGE.h} style={{ position: "absolute", left: 0, top: 0 }}>
        {Array.from({ length: n * n }, (_, i) => {
          const [r, c] = [Math.floor(i / n), i % n];
          const lit = ramp(frame, filterAt + i * 3, 12);
          const near = Math.abs(r - tr) <= 1 && Math.abs(c - tc) <= 1;
          return (
            <g key={i} opacity={1 - focus * (near ? 0 : 0.7)}>
              <rect x={ox + c * cell + 3} y={oy + r * cell + 3} width={cell - 6} height={cell - 6} rx={6} fill={`rgb(${[0, 1, 2].map(() => 60 + hash(i, 9) * 90).join(",")})`} />
              <rect x={ox + c * cell + 3} y={oy + r * cell + 3 - (1 - lit) * 30} width={cell - 6} height={cell - 6} rx={6} fill={colorOf(r, c)} opacity={lit * 0.85} />
            </g>
          );
        })}
        {/* 緑が2つ入った 2×2 の組 */}
        <rect x={ox + 2 * cell} y={oy + 2 * cell} width={cell * 2} height={cell * 2} fill="none" stroke="#fff" strokeWidth={6} opacity={ramp(frame, greenAt, 15) * (1 - focus)} />
        {/* 注目する1画素と、推測に使う周りの画素 */}
        <rect x={ox + tc * cell} y={oy + tr * cell} width={cell} height={cell} fill="none" stroke="#fff" strokeWidth={7} opacity={focus} />
        {neighbors.map((nb, i) => {
          const [x1, y1] = center(tr + nb.dr, tc + nb.dc);
          const [x2, y2] = center(tr, tc);
          const p = ramp(frame, nb.at, 25) * (1 - back);
          const flow = (frame % 30) / 30;
          return (
            <g key={i} opacity={p}>
              <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * 0.72 * p} y2={y1 + (y2 - y1) * 0.72 * p} stroke="#fff" strokeWidth={5} strokeLinecap="round" />
              <circle cx={x1 + (x2 - x1) * 0.72 * flow} cy={y1 + (y2 - y1) * 0.72 * flow} r={8} fill={nb.color} stroke="#fff" strokeWidth={3} />
            </g>
          );
        })}
        <text x={ox + (n * cell) / 2} y={40} fill={COLOR.text} fontSize={36} fontWeight={700} textAnchor="middle">
          センサーの画素
        </text>
      </svg>
      <div style={{ position: "absolute", left: 720, top: 0, width: 1080, height: STAGE.h }}>
        <Phase to={oneAt}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 30 }}>
            <Reveal at={40}>
              <Card style={{ fontSize: 38 }}>画素そのものは、色を見分けられない</Card>
            </Reveal>
            <Reveal at={filterAt}>
              <Card style={{ fontSize: 38 }}>
                <b style={{ color: COLOR.r }}>赤</b>・<b style={{ color: COLOR.g }}>緑</b>・<b style={{ color: COLOR.b }}>青</b> のフィルターを、1画素ずつ交互にかぶせる
              </Card>
            </Reveal>
            <Reveal at={290}>
              <div style={{ fontSize: 84, fontWeight: 800, color: COLOR.accent }}>ベイヤー配列</div>
            </Reveal>
            <Reveal at={nameAt + 30}>
              <Card style={{ fontSize: 34 }}>発明したコダック社の ブライス・ベイヤーさんから</Card>
            </Reveal>
            <Reveal at={greenAt}>
              <Card color={COLOR.g} style={{ fontSize: 36 }}>
                <b style={{ color: COLOR.g }}>緑だけ2つ</b>: 人の目は、緑の明るさに一番敏感
              </Card>
            </Reveal>
          </div>
        </Phase>
        <Phase from={oneAt} to={countAt}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 30 }}>
            <div style={{ fontSize: 60, fontWeight: 800, color: COLOR.text }}>
              1つの画素は、<span style={{ color: COLOR.warn }}>1つの色</span>しか知らない
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 10 }}>
              {[
                { name: "赤", color: COLOR.r, value: "132", at: -1000 },
                { name: "緑", color: COLOR.g, value: "118", at: guessAt + 60 },
                { name: "青", color: COLOR.b, value: "97", at: guessAt + 120 },
              ].map((ch) => (
                <Card key={ch.name} color={ch.color} style={{ width: 320, textAlign: "center", padding: "16px 10px" }}>
                  <div style={{ fontSize: 40, fontWeight: 700, color: ch.color }}>{ch.name}</div>
                  <div style={{ position: "relative", height: 120 }}>
                    <div style={{ position: "absolute", inset: 0, fontSize: 96, fontWeight: 800, color: COLOR.dim, opacity: 1 - known(ch.at) }}>?</div>
                    <div style={{ position: "absolute", inset: 0, fontSize: 96, fontWeight: 800, color: COLOR.text, opacity: known(ch.at) }}>{ch.value}</div>
                  </div>
                  <div style={{ fontSize: 30, color: ch.at < 0 ? COLOR.text : COLOR.warn, opacity: ch.at < 0 ? 1 : known(ch.at) }}>{ch.at < 0 ? "測った" : "周りから推測"}</div>
                </Card>
              ))}
            </div>
            <Reveal at={guessAt + 30}>
              <div style={{ fontSize: 40, color: COLOR.text }}>
                足りない2色は、<b style={{ color: COLOR.warn }}>周りの画素の色から推測</b>
              </div>
            </Reveal>
          </div>
        </Phase>
        {/* 画面とセンサーでは「1画素」の数え方が違う */}
        <Phase from={countAt}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 6 }}>
            <div style={{ fontSize: 52, fontWeight: 800, color: COLOR.text }}>
              「1画素」の<span style={{ color: COLOR.warn }}>数え方</span>が違う
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              <Card style={{ width: 500, padding: "16px 22px" }}>
                <div style={{ fontSize: 34, color: COLOR.dim }}>一般的な画面</div>
                <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 5, padding: 6, border: "4px solid #fff", borderRadius: 8 }}>
                    {[COLOR.r, COLOR.g, COLOR.b].map((c) => (
                      <div key={c} style={{ width: 30, height: 100, background: c, borderRadius: 4 }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 34, lineHeight: 1.35 }}>
                    3色の点(<b style={{ color: COLOR.accent }}>サブピクセル</b>)
                    <br />
                    <b>3つで 1画素</b>
                  </div>
                </div>
              </Card>
              <Reveal at={ruleAt + 200}>
                <Card color={COLOR.warn} style={{ width: 500, padding: "16px 22px" }}>
                  <div style={{ fontSize: 34, color: COLOR.dim }}>カメラのセンサー</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 10 }}>
                    <div style={{ padding: 6, border: "4px solid #fff", borderRadius: 8 }}>
                      <div style={{ width: 100, height: 100, background: COLOR.g, borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 34, lineHeight: 1.35 }}>
                      1色しか測れない点
                      <br />
                      <b style={{ color: COLOR.warn }}>1つで 1画素</b>
                    </div>
                  </div>
                </Card>
              </Reveal>
            </div>
            <Reveal at={shareAt}>
              <Card style={{ padding: "14px 22px" }}>
                <div style={{ fontSize: 34 }}>1200万画素の内訳</div>
                <div style={{ display: "flex", height: 54, borderRadius: 8, overflow: "hidden", marginTop: 8, fontSize: 30, fontWeight: 700, color: "#0b0f1a", textAlign: "center", lineHeight: "54px" }}>
                  <div style={{ flex: 2, background: COLOR.g }}>緑 約600万</div>
                  <div style={{ flex: 1, background: COLOR.r }}>赤 約300万</div>
                  <div style={{ flex: 1, background: COLOR.b }}>青 約300万</div>
                </div>
              </Card>
            </Reveal>
            <Reveal at={shareAt + 190}>
              <div style={{ fontSize: 38, color: COLOR.text }}>
                写真の色の数字のうち、<b style={{ color: COLOR.warn }}>3分の2 は周りからの推測</b>
                <Tag style={{ fontSize: 30, marginLeft: 20 }}>最後に効いてくる</Tag>
              </div>
            </Reveal>
          </div>
        </Phase>
      </div>
    </Stage>
  );
};

// 「章ID/場面名」→ 場面の絵
export const ch02: Record<string, SceneView> = {
  "02_camera_basics/画素は光のバケツ": Buckets,
  "02_camera_basics/シャッター速度": Shutter,
  "02_camera_basics/ISO感度": Iso,
  "02_camera_basics/脱線 ISOの由来": IsoOrigin,
  "02_camera_basics/焦点距離": Focal,
  "02_camera_basics/RAW": Raw,
  "02_camera_basics/ベイヤー配列": Bayer,
};
