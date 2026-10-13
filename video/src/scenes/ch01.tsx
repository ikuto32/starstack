import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { Card, Photo, Reveal, Stage, Tag } from "../components/ui";
import { hash } from "../sim/rng";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, tween } from "../timing";
import type { Chapter, SceneView } from "../types";
import { Clip, Cloud, CondIcon, CONDITIONS, ConditionBar, Moon, Phase, PhoneShape, SkyPanel, Stars } from "./ch01_parts";

// ---- 用意するもの ----

const Supplies: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [tripodAt, leanAt, cableAt, modelAt] = [70, lineAt(scene, 2), lineAt(scene, 2) + 150, lineAt(scene, 4)];
  const cable = ramp(frame, cableAt, 40);
  const sway = Math.sin(frame / 40) * 1.2;
  return (
    <Stage chapter={chapter} title="用意するもの">
      <div style={{ position: "absolute", left: 0, top: 0, width: 1000, height: STAGE.h, borderRadius: 14, overflow: "hidden", background: "linear-gradient(#04060c, #0b1326)" }}>
        <Stars w={1000} h={420} seed={11} n={150} />
        <svg width={1000} height={STAGE.h} style={{ position: "absolute" }}>
          <rect x={0} y={610} width={1000} height={80} fill="#131a2c" />
          {/* 三脚に載せたスマホ */}
          <g opacity={ramp(frame, tripodAt, 15)}>
            {[-70, 0, 70].map((dx) => (
              <line key={dx} x1={290} y1={440} x2={290 + dx} y2={610} stroke={COLOR.dim} strokeWidth={9} strokeLinecap="round" />
            ))}
            <circle cx={290} cy={436} r={16} fill={COLOR.dim} />
          </g>
          <line x1={262} y1={250} x2={150} y2={40} stroke={COLOR.accent} strokeWidth={3} strokeDasharray="10 12" strokeDashoffset={-frame * 0.6} opacity={0.7} />
          <PhoneShape x={290} y={tween(frame, 0, 20, 300, 340)} angle={-28 + sway} />
          <text x={290} y={668} fill={COLOR.text} fontSize={32} fontWeight={700} textAnchor="middle" opacity={ramp(frame, tripodAt, 15)}>
            三脚
          </text>
          {/* 立てかけるだけ */}
          <g opacity={ramp(frame, leanAt, 15)}>
            <rect x={730} y={470} width={150} height={140} rx={8} fill="#2a3350" stroke={COLOR.dim} strokeWidth={3} />
            <PhoneShape x={680} y={510} angle={-24} />
            <text x={760} y={668} fill={COLOR.text} fontSize={32} fontWeight={700} textAnchor="middle">
              立てかけるだけでも
            </text>
          </g>
          {/* 充電ケーブル */}
          <g opacity={ramp(frame, cableAt, 10)}>
            <path d="M338 428 C 380 560, 430 600, 500 590" fill="none" stroke={COLOR.warn} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - cable} />
            <g opacity={ramp(frame, cableAt + 30, 12)}>
              <rect x={496} y={562} width={86} height={48} rx={8} fill="#2a3350" stroke={COLOR.warn} strokeWidth={4} />
              <path d="M544 570 L530 588 L540 588 L534 604 L550 584 L540 584Z" fill={COLOR.warn} />
              <text x={540} y={540} fill={COLOR.warn} fontSize={30} fontWeight={700} textAnchor="middle">
                充電しながら
              </text>
            </g>
          </g>
        </svg>
      </div>
      <div style={{ position: "absolute", left: 1040, top: 0, width: 760, display: "flex", flexDirection: "column", gap: 20 }}>
        <Reveal at={10}>
          <Card style={{ fontSize: 42, fontWeight: 700 }}>スマホ</Card>
        </Reveal>
        <Reveal at={tripodAt}>
          <Card style={{ fontSize: 42, fontWeight: 700 }}>
            空に向けて固定するもの
            <div style={{ fontSize: 30, fontWeight: 400, color: COLOR.dim, opacity: ramp(frame, leanAt + 60, 15) }}>動かなければ十分</div>
          </Card>
        </Reveal>
        <Reveal at={cableAt}>
          <Card color={COLOR.warn} style={{ fontSize: 34 }}>
            長時間撮影 → 充電しながらだと安心
          </Card>
        </Reveal>
        <Reveal at={modelAt}>
          <Card color={COLOR.accent}>
            今回: <b style={{ fontSize: 46, color: COLOR.accent }}>Pixel 11 Pro</b>
            <div style={{ fontSize: 32, opacity: ramp(frame, modelAt + 90, 15) }}>
              ほかの機種でも、次の2つができれば同じ
              <br />・シャッター速度を手動で決められる
              <br />・RAWで保存できる
            </div>
          </Card>
        </Reveal>
      </div>
    </Stage>
  );
};

// ---- アプリと5つの設定 ----

const SETTINGS = ["RAW", "露出", "フォーカス", "連続撮影", "タイマー"];

/** 5つの設定のうち、いまどれかを示す帯。 */
const Steps = ({ n }: { n: number }) => (
  <div style={{ display: "flex", gap: 14 }}>
    {SETTINGS.map((name, i) => {
      const on = i === n;
      const color = on ? COLOR.accent : i < n ? COLOR.good : COLOR.line;
      return (
        <div key={name} style={{ fontSize: 30, fontWeight: 700, padding: "4px 18px", borderRadius: 12, border: `3px solid ${color}`, background: on ? COLOR.accent : COLOR.panel, color: on ? COLOR.bg : i < n ? COLOR.good : COLOR.dim }}>
          {i + 1} {name}
        </div>
      );
    })}
  </div>
);

/** 設定の場面の割り付け。左に操作動画、右に帯・見出し・説明。 */
const Setting = ({ chapter, n, title, phone, children }: { chapter: Chapter; n: number; title: string; phone: ReactNode; children: ReactNode }) => (
  <Stage chapter={chapter}>
    <div style={{ display: "flex", gap: 64, height: "100%" }}>
      {phone}
      <div style={{ display: "flex", flexDirection: "column", gap: 22, flex: 1, paddingTop: 4 }}>
        <Steps n={n} />
        <div style={{ fontSize: 56, fontWeight: 800, color: COLOR.text }}>{title}</div>
        {children}
      </div>
    </div>
  </Stage>
);

/** 設定する値を大きく見せる箱。 */
const Value = ({ label, value, sub, color = COLOR.accent }: { label: string; value: string; sub?: string; color?: string }) => (
  <Card color={color} style={{ padding: "14px 30px" }}>
    <div style={{ fontSize: 32, color: COLOR.dim }}>{label}</div>
    <div style={{ fontSize: 76, fontWeight: 800, color, lineHeight: 1.15 }}>
      {value}
      {sub && <span style={{ fontSize: 36, fontWeight: 600, color: COLOR.text, marginLeft: 14 }}>{sub}</span>}
    </div>
  </Card>
);

const App: SceneView = ({ chapter, scene }) => (
  <Stage chapter={chapter}>
    <div style={{ display: "flex", gap: 64, height: "100%" }}>
      <Clip clip="main" keys={[[0, 0.2], [scene.frames, 3.8]]} />
      <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
        <Reveal at={6}>
          <div style={{ fontSize: 80, fontWeight: 800, color: COLOR.text }}>
            Open Camera <span style={{ fontSize: 40, color: COLOR.good, border: `3px solid ${COLOR.good}`, borderRadius: 12, padding: "2px 18px", verticalAlign: "middle" }}>無料</span>
          </div>
        </Reveal>
        <Reveal at={70}>
          <div style={{ fontSize: 44, color: COLOR.accent, fontWeight: 700 }}>設定は5つだけ</div>
        </Reveal>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {SETTINGS.map((name, i) => (
            <Reveal key={name} at={88 + i * 12}>
              <Card style={{ fontSize: 40, padding: "10px 26px", width: 860 }}>
                <b style={{ color: COLOR.accent, marginRight: 22 }}>{i + 1}</b>
                {["保存形式を RAW に", "露出(シャッター速度とISO感度)", "フォーカス", "連続撮影", "タイマー"][i]}
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  </Stage>
);

const SetRaw: SceneView = ({ chapter, scene }) => (
  <Setting chapter={chapter} n={0} title="保存形式を「RAW」にする" phone={<Clip clip="raw" keys={[[0, 1.6], [50, 3.1], [75, 4.0], [scene.frames, 4.3]]} />}>
    <Reveal at={50}>
      <Value label="RAW" value="DNG (RAW) only" />
    </Reveal>
    <Reveal at={105}>
      <Card style={{ fontSize: 40 }}>
        <b style={{ color: COLOR.accent }}>DNG</b> というファイル形式で保存される
      </Card>
    </Reveal>
    <Reveal at={lineAt(scene, 1) + 10}>
      <div style={{ fontSize: 32, color: COLOR.dim }}>RAW が何かは、このあと「カメラの基礎」で</div>
    </Reveal>
  </Setting>
);

/** ISO が低すぎる・高すぎるときに起きることの小さな図。 */
const IsoTrouble = ({ high }: { high: boolean }) => {
  const frame = useCurrentFrame();
  const amp = (high ? 96 : 20) * (0.9 + 0.1 * Math.sin(frame / 12));
  const [w, base, top] = [300, 104, 16];
  // 星の光の山。高すぎるときは上限で頭打ちになる
  const pts = Array.from({ length: 67 }, (_, i) => {
    const x = (i / 66) * w;
    const y = base - 10 - amp * Math.exp(-(((x - w / 2) / 44) ** 2));
    return [x, y] as const;
  });
  const line = (clip: boolean) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${(clip ? Math.max(top, y) : y).toFixed(1)}`).join("");
  return (
    <svg width={w} height={120} style={{ display: "block" }}>
      {high ? (
        <line x1={0} y1={top} x2={w} y2={top} stroke={COLOR.bad} strokeWidth={3} strokeDasharray="8 8" />
      ) : (
        [16, 60, 104].map((y) => <line key={y} x1={0} y1={y} x2={w} y2={y} stroke={COLOR.line} strokeWidth={3} />)
      )}
      <path d={line(false)} fill="none" stroke={COLOR.dim} strokeWidth={3} strokeDasharray={high ? "6 6" : undefined} />
      {high ? <path d={line(true)} fill="none" stroke="#fff" strokeWidth={5} /> : <line x1={0} y1={104} x2={w} y2={104} stroke={COLOR.warn} strokeWidth={5} />}
    </svg>
  );
};

const SetExposure: SceneView = ({ chapter, scene }) => {
  const at = lineAt(scene, 2);
  return (
    <Setting chapter={chapter} n={1} title="シャッター速度と ISO感度" phone={<Clip clip="exposure" keys={[[0, 0.3], [scene.frames, 12.8]]} />}>
      <div style={{ display: "flex", gap: 24 }}>
        <Reveal at={30}>
          <Value label="シャッター速度" value="16秒" />
        </Reveal>
        <Reveal at={95}>
          <Value label="ISO感度" value="ISO 100" sub="(今回)" color={COLOR.good} />
        </Reveal>
      </div>
      <Reveal at={at}>
        <div style={{ fontSize: 34, color: COLOR.text }}>ちょうどいい ISO は、機種ごとに違う</div>
      </Reveal>
      <div style={{ display: "flex", gap: 24 }}>
        <Reveal at={at + 90}>
          <Card color={COLOR.warn} style={{ fontSize: 30, width: 650, padding: "14px 22px", display: "flex", gap: 18, alignItems: "center" }}>
            <IsoTrouble high={false} />
            <div>
              <b style={{ fontSize: 38, color: COLOR.warn }}>低すぎる</b>
              <br />
              暗い星の光が
              <br />
              数字の刻みに埋もれる
            </div>
          </Card>
        </Reveal>
        <Reveal at={at + 200}>
          <Card color={COLOR.bad} style={{ fontSize: 30, width: 650, padding: "14px 22px", display: "flex", gap: 18, alignItems: "center" }}>
            <IsoTrouble high />
            <div>
              <b style={{ fontSize: 38, color: COLOR.bad }}>高すぎる</b>
              <br />
              明るい星や空が
              <br />
              白く飛ぶ
            </div>
          </Card>
        </Reveal>
      </div>
      <div style={{ fontSize: 28, color: COLOR.dim, marginTop: "auto" }}>← 操作例です。ISOの値は実際の撮影と異なります</div>
    </Setting>
  );
};

/** ヒストグラムの模式図。peak は山の位置(0〜1)。 */
const Histogram = ({ peak, verdict, color, note }: { peak: number; verdict: string; color: string; note: string }) => {
  const frame = useCurrentFrame();
  const [w, h] = [420, 200];
  const pts = Array.from({ length: 85 }, (_, i) => {
    const x = i / 84;
    const wobble = 1 + 0.06 * Math.sin(frame / 9 + i * 0.7);
    return `L${(x * w).toFixed(1)} ${(h - 170 * wobble * Math.exp(-(((x - peak) / 0.075) ** 2))).toFixed(1)}`;
  });
  return (
    <Card color={color} style={{ padding: "16px 18px", textAlign: "center" }}>
      <svg width={w} height={h + 6} style={{ display: "block" }}>
        <path d={`M0 ${h}${pts.join("")}L${w} ${h}Z`} fill={color} opacity={0.75} />
        <path d={`M0 0 L0 ${h} L${w} ${h}`} fill="none" stroke={COLOR.text} strokeWidth={4} />
        <line x1={w / 2} y1={10} x2={w / 2} y2={h} stroke={COLOR.dim} strokeWidth={2} strokeDasharray="6 8" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: COLOR.dim }}>
        <span>暗い</span>
        <span>明るい</span>
      </div>
      <div style={{ fontSize: 30 }}>{note}</div>
      <div style={{ fontSize: 46, fontWeight: 800, color }}>{verdict}</div>
    </Card>
  );
};

const IsoGuide: SceneView = ({ chapter, scene }) => {
  const at = lineAt(scene, 2);
  return (
    <Stage chapter={chapter}>
      <div style={{ display: "flex", gap: 56, height: "100%" }}>
        <Clip clip="histogram" keys={[[0, 0.2], [120, 2.4], [170, 3.3], [300, 4.4]]} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
          <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
            <div style={{ fontSize: 56, fontWeight: 800, color: COLOR.text }}>ISO の決め方</div>
            <Reveal at={12}>
              <Tag style={{ fontSize: 46 }}>目安 ISO 100〜800</Tag>
            </Reveal>
          </div>
          <Reveal at={120}>
            <div style={{ fontSize: 38, color: COLOR.text }}>
              決め手は <b style={{ color: COLOR.accent }}>ヒストグラム</b>(明るさの分布を表すグラフ)
            </div>
          </Reveal>
          <div style={{ display: "flex", gap: 18 }}>
            <Reveal at={at + 30}>
              <Histogram peak={0.02} verdict="低すぎ" color={COLOR.warn} note="山が左端に張りつく" />
            </Reveal>
            <Reveal at={at + 215}>
              <Histogram peak={0.2} verdict="ちょうどいい" color={COLOR.good} note="左端から少し離れる" />
            </Reveal>
            <Reveal at={at + 120}>
              <Histogram peak={0.68} verdict="高すぎ" color={COLOR.bad} note="真ん中より右" />
            </Reveal>
          </div>
        </div>
      </div>
    </Stage>
  );
};

const SetFocus: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  return (
    <Setting chapter={chapter} n={2} title="ピントは手動で合わせる" phone={<Clip clip="focus" keys={[[0, 0.3], [70, 2.1], [scene.frames, 6.5]]} />}>
      <Reveal at={45}>
        <Value label="焦点距離" value="無限遠" />
      </Reveal>
      <Reveal at={95}>
        <Card color={COLOR.warn} style={{ display: "flex", gap: 30, alignItems: "center" }}>
          {/* ピントが行ったり来たりする星 */}
          <svg width={150} height={110}>
            <circle cx={75} cy={55} r={8 + 30 * Math.abs(Math.sin(frame / 11))} fill="#fff" opacity={0.25 + 0.5 * (1 - Math.abs(Math.sin(frame / 11)))} />
            <circle cx={75} cy={55} r={5} fill="#fff" />
          </svg>
          <div>暗い空では、オートフォーカスが迷ってしまう</div>
        </Card>
      </Reveal>
    </Setting>
  );
};

const SetBurst: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const shots = Math.floor(Math.max(0, frame - 60) / 14);
  return (
    <Setting chapter={chapter} n={3} title="連続撮影" phone={<Clip clip="burst" keys={[[0, 1.1], [scene.frames, 6.3]]} />}>
      <div style={{ display: "flex", gap: 24 }}>
        <Reveal at={40}>
          <Value label="連続撮影" value="無制限" />
        </Reveal>
        <Reveal at={130}>
          <Value label="インターバル" value="0.5秒" color={COLOR.dim} />
        </Reveal>
      </div>
      <Reveal at={70}>
        <Card style={{ fontSize: 34 }}>
          自分で止めるまで、ずっと撮り続ける
          {/* 撮った写真が1枚ずつ増えていく */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, height: 62 }}>
            {Array.from({ length: Math.min(shots, 13) }, (_, i) => (
              <div key={i} style={{ width: 60, height: 60, borderRadius: 6, background: "#0a1020", border: `2px solid ${COLOR.accent}`, position: "relative" }}>
                {[0, 1, 2].map((k) => (
                  <div key={k} style={{ position: "absolute", left: 8 + hash(i, k) * 40, top: 8 + hash(k, i, 5) * 40, width: 4, height: 4, borderRadius: 2, background: "#fff" }} />
                ))}
              </div>
            ))}
            <div style={{ fontSize: 40, color: COLOR.accent, alignSelf: "center" }}>…</div>
          </div>
        </Card>
      </Reveal>
    </Setting>
  );
};

const SetTimer: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [pressAt, leaveAt] = [lineAt(scene, 1), lineAt(scene, 2)];
  const switchAt = 150; // ここで操作動画を「カウントダウン」に替える
  // 押したときの揺れが収まっていく波
  const wave = Array.from({ length: 121 }, (_, i) => {
    const t = i / 120;
    return `${i ? "L" : "M"}${(t * 620).toFixed(1)} ${(50 - 42 * Math.exp(-t * 5) * Math.sin(t * 46 - frame * 0.25)).toFixed(1)}`;
  }).join("");
  return (
    <Setting
      chapter={chapter}
      n={4}
      title="タイマー"
      phone={
        frame < switchAt ? (
          <Clip clip="timer" keys={[[0, 0.8], [50, 2.6], [switchAt, 3.3]]} />
        ) : (
          <Clip clip="start" keys={[[switchAt, 2.2], [pressAt, 5.4], [leaveAt, 11.6], [scene.frames, 17.6]]} />
        )
      }
    >
      <div style={{ display: frame < leaveAt ? "flex" : "none", opacity: 1 - ramp(frame, leaveAt - 12, 12), flexDirection: "column", gap: 22 }}>
        <Reveal at={40}>
          <Value label="タイマー" value="5秒" />
        </Reveal>
        <Reveal at={100}>
          <Card style={{ fontSize: 34, width: 760 }}>
            押したときの揺れが収まってから、撮影を始める
            <svg width={700} height={100} style={{ display: "block", marginTop: 10 }}>
              <line x1={0} y1={50} x2={700} y2={50} stroke={COLOR.line} strokeWidth={2} />
              <path d={wave} fill="none" stroke={COLOR.warn} strokeWidth={4} />
              <line x1={620} y1={6} x2={620} y2={94} stroke={COLOR.good} strokeWidth={4} />
              <text x={612} y={30} fill={COLOR.good} fontSize={28} fontWeight={700} textAnchor="end">
                撮影開始
              </text>
            </svg>
          </Card>
        </Reveal>
      </div>
      {frame >= leaveAt && (
        <div style={{ opacity: ramp(frame, leaveAt, 15), display: "flex", gap: 50, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 96, fontWeight: 800, color: COLOR.good }}>あとは放置</div>
            <div style={{ fontSize: 38, color: COLOR.text, marginTop: 10 }}>家に入って、お茶でも飲んでいればいい</div>
          </div>
          {/* 湯気の立つ湯のみ */}
          <svg width={260} height={300}>
            {[0, 1, 2].map((i) => {
              const t = ((frame + i * 30) % 90) / 90;
              return <path key={i} d={`M${90 + i * 40} ${150 - t * 90} q 16 -20 0 -40 q -16 -20 0 -40`} fill="none" stroke={COLOR.text} strokeWidth={5} strokeLinecap="round" opacity={0.6 * Math.sin(t * Math.PI)} />;
            })}
            <path d="M50 160 L210 160 L196 270 Q130 290 64 270Z" fill="#2a3350" stroke={COLOR.text} strokeWidth={5} />
            <ellipse cx={130} cy={160} rx={80} ry={14} fill={COLOR.good} opacity={0.7} stroke={COLOR.text} strokeWidth={5} />
          </svg>
        </div>
      )}
    </Setting>
  );
};

// ---- 撮影の条件 ----

const Conditions: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  return (
    <Stage chapter={chapter} title="きれいに撮るための4つの条件">
      <div style={{ display: "flex", gap: 36, height: "100%", alignItems: "center", justifyContent: "center" }}>
        {CONDITIONS.map((name, i) => (
          <Reveal key={name} at={50 + i * 18}>
            <Card style={{ width: 380, height: 400, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, transform: `translateY(${Math.sin(frame / 20 + i) * 6}px)` }}>
              <div style={{ fontSize: 44, fontWeight: 800, color: COLOR.accent }}>{i + 1}</div>
              <CondIcon kind={i} size={170} />
              <div style={{ fontSize: 52, fontWeight: 800 }}>{name}</div>
            </Card>
          </Reveal>
        ))}
      </div>
    </Stage>
  );
};

const [PW, PH] = [882, 440]; // 見比べる空の枠

const CondMoon: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const glow = ramp(frame, 20, 90);
  const aimAt = 200;
  return (
    <Stage chapter={chapter}>
      <ConditionBar active={0} />
      <div style={{ display: "flex", gap: 36, marginTop: 14 }}>
        <SkyPanel w={PW} h={390} label="満月の夜" color={COLOR.warn} background={`linear-gradient(rgb(${10 + 34 * glow},${14 + 44 * glow},${26 + 62 * glow}), rgb(${14 + 44 * glow},${20 + 54 * glow},${36 + 70 * glow}))`}>
          <Stars w={PW} h={390} seed={3} limit={tween(frame, 20, 90, 0, 0.62)} />
          <svg width={PW} height={390} style={{ position: "absolute" }}>
            <defs>
              <radialGradient id="ch01moonglow">
                <stop offset="0.25" stopColor="#fff8d8" stopOpacity={0.55} />
                <stop offset="1" stopColor="#fff8d8" stopOpacity={0} />
              </radialGradient>
            </defs>
            <circle cx={640} cy={130} r={230 * glow} fill="url(#ch01moonglow)" />
            <Moon cx={640} cy={130} r={56} phase={0.5} />
          </svg>
          <Tag color={COLOR.warn} style={{ position: "absolute", left: 14, bottom: 14, opacity: ramp(frame, 110, 15) }}>
            空全体が明るい → 暗い星が埋もれる
          </Tag>
        </SkyPanel>
        <SkyPanel w={PW} h={390} label="新月の前後" color={COLOR.good}>
          <Stars w={PW} h={390} seed={3} />
          <Tag color={COLOR.good} style={{ position: "absolute", left: 14, bottom: 14, opacity: ramp(frame, aimAt, 15) }}>
            月が出ていない → 暗い星まで見える
          </Tag>
        </SkyPanel>
      </div>
      {/* 月の満ち欠け。新月の前後を囲む */}
      <svg width={STAGE.w} height={220} style={{ position: "absolute", left: 0, top: 470 }}>
        <rect x={900 - 290} y={10} width={580} height={150} rx={20} fill="rgba(123,224,163,0.12)" stroke={COLOR.good} strokeWidth={4} opacity={ramp(frame, aimAt, 15)} />
        {Array.from({ length: 9 }, (_, i) => (
          <Moon key={i} cx={900 + (i - 4) * 180} cy={84} r={50} phase={0.5 + i / 8} />
        ))}
        <text x={180} y={196} fill={COLOR.dim} fontSize={32} textAnchor="middle">
          満月
        </text>
        <text x={1620} y={196} fill={COLOR.dim} fontSize={32} textAnchor="middle">
          満月
        </text>
        <text x={900} y={200} fill={COLOR.good} fontSize={40} fontWeight={800} textAnchor="middle" opacity={ramp(frame, aimAt, 15)}>
          {frame < lineAt(scene, 2) ? "狙い目は 新月の前後" : "狙い目は 新月の前後(今回の写真も 新月のとき)"}
        </text>
      </svg>
    </Stage>
  );
};

const CondWeather: SceneView = ({ chapter }) => {
  const frame = useCurrentFrame();
  return (
    <Stage chapter={chapter}>
      <ConditionBar active={1} />
      <div style={{ display: "flex", gap: 36, marginTop: 14 }}>
        <SkyPanel w={PW} h={PH} label="雲がある" color={COLOR.warn}>
          <Stars w={PW} h={PH} seed={5} />
          <svg width={PW} height={PH} style={{ position: "absolute" }}>
            {Array.from({ length: 14 }, (_, i) => {
              const x = ((hash(i, 1) * 1300 + frame * (0.5 + hash(i, 2) * 0.5)) % 1300) - 200;
              return <Cloud key={i} x={x} y={60 + hash(i, 3) * 330} scale={1.3 + hash(i, 4) * 1.1} color={`rgb(${66 + i * 3},${76 + i * 3},${100 + i * 3})`} opacity={ramp(frame, 20 + i * 8, 30)} />;
            })}
          </svg>
          <Tag color={COLOR.warn} style={{ position: "absolute", left: 14, bottom: 14, opacity: ramp(frame, 60, 15) }}>
            雲が星を隠す → 写らない
          </Tag>
        </SkyPanel>
        <SkyPanel w={PW} h={PH} label="快晴" color={COLOR.good}>
          <Stars w={PW} h={PH} seed={5} />
          <Tag color={COLOR.good} style={{ position: "absolute", left: 14, bottom: 14, opacity: ramp(frame, 110, 15) }}>
            雲のない快晴の夜を選ぶ
          </Tag>
        </SkyPanel>
      </div>
      <Reveal at={190} style={{ marginTop: 20 }}>
        <Card color={COLOR.dim} style={{ fontSize: 34, display: "inline-block" }}>
          実はこの日は、途中で雲が出てしまった → その話はあとで
        </Card>
      </Reveal>
    </Stage>
  );
};

const CondDark: SceneView = ({ chapter }) => {
  const frame = useCurrentFrame();
  const buildings = Array.from({ length: 13 }, (_, i) => ({ x: i * 70 - 10, w: 56 + hash(i, 7) * 20, h: 70 + hash(i, 8) * 130 }));
  return (
    <Stage chapter={chapter}>
      <ConditionBar active={2} />
      <div style={{ display: "flex", gap: 36, marginTop: 14 }}>
        <SkyPanel w={PW} h={PH} label="街の中" color={COLOR.warn} background="linear-gradient(#1a2238 0%, #3a3644 60%, #6a5040 100%)">
          <Stars w={PW} h={PH - 120} seed={9} limit={tween(frame, 10, 60, 0.2, 0.66)} />
          <svg width={PW} height={PH} style={{ position: "absolute" }}>
            {buildings.map((b, i) => (
              <g key={i}>
                <rect x={b.x} y={PH - b.h} width={b.w} height={b.h} fill="#0c111e" />
                {Array.from({ length: Math.floor(b.h / 26) * 2 }, (_, k) => {
                  // 窓の明かり。ときどき点いたり消えたりする
                  const lit = hash(i, k, Math.floor((frame + hash(i, k) * 90) / 90)) > 0.35;
                  return lit ? <rect key={k} x={b.x + 10 + (k % 2) * 24} y={PH - b.h + 12 + Math.floor(k / 2) * 26} width={12} height={12} fill="#ffd27a" /> : null;
                })}
              </g>
            ))}
          </svg>
          <Tag color={COLOR.warn} style={{ position: "absolute", right: 14, top: 14, opacity: ramp(frame, 50, 15) }}>
            空が明るい
          </Tag>
        </SkyPanel>
        <SkyPanel w={PW} h={PH} label="街から離れた場所" color={COLOR.good}>
          <Stars w={PW} h={PH - 60} seed={9} limit={tween(frame, 70, 60, 0.5, 0)} />
          <svg width={PW} height={PH} style={{ position: "absolute" }}>
            <path d={`M0 ${PH} L0 ${PH - 70} Q200 ${PH - 150} 420 ${PH - 80} T${PW} ${PH - 110} L${PW} ${PH}Z`} fill="#0a0f1a" />
            <path d={`M0 ${PH} L0 ${PH - 30} Q300 ${PH - 90} 600 ${PH - 40} T${PW} ${PH - 50} L${PW} ${PH}Z`} fill="#070a12" />
          </svg>
          <Tag color={COLOR.good} style={{ position: "absolute", right: 14, top: 14, opacity: ramp(frame, 110, 15) }}>
            空が暗い → 暗い星まで写る
          </Tag>
        </SkyPanel>
      </div>
      <Reveal at={60} style={{ marginTop: 20 }}>
        <Card style={{ fontSize: 36, display: "inline-block" }}>街の明かりが少ない場所ほど、空が暗くなる</Card>
      </Reveal>
    </Stage>
  );
};

/** 天文台のドーム。(0,0) が底の中央。 */
const Dome = ({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <rect x={-22} y={-22} width={44} height={22} fill="#dfe6f7" />
    <path d="M-24 -22 A24 24 0 0 1 24 -22Z" fill="#fff" />
    <rect x={-4} y={-46} width={9} height={24} fill="#39415c" />
  </g>
);

const CondAltitude: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [w, h, ground, peak] = [STAGE.w, 620, 560, 210];
  const domeAt = lineAt(scene, 1);
  const beam = ramp(frame, 50, 40);
  return (
    <Stage chapter={chapter}>
      <ConditionBar active={3} />
      <div style={{ position: "absolute", left: 0, top: 70, width: w, height: h, borderRadius: 14, overflow: "hidden", background: "#04060c" }}>
        <Stars w={w} h={150} seed={13} n={120} />
        <svg width={w} height={h} style={{ position: "absolute" }}>
          <defs>
            <linearGradient id="ch01air" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.1" stopColor="#5a7fb8" stopOpacity={0} />
              <stop offset="1" stopColor="#5a7fb8" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={w} height={ground} fill="url(#ch01air)" />
          {/* 星の光が空気を通ってくる道 */}
          {[
            { x: 380, y: ground, color: COLOR.warn },
            { x: 1300, y: peak, color: COLOR.good },
          ].map((o) => (
            <rect key={o.x} x={o.x - 16} y={40} width={32} height={(o.y - 40) * beam} fill={o.color} opacity={0.35} />
          ))}
          {/* ちりや水蒸気。地面に近いほど多い */}
          {Array.from({ length: 420 }, (_, i) => {
            const y = ground - 8 - 420 * Math.pow(hash(i, 21), 2.4);
            const x = (hash(i, 22) * w + frame * (0.2 + hash(i, 23) * 0.5)) % w;
            return <circle key={i} cx={x} cy={y} r={2 + hash(i, 24) * 3} fill={i % 3 ? "#c9b38a" : "#9cc7ff"} opacity={0.6} />;
          })}
          <path d={`M0 ${ground} L760 ${ground} Q1040 ${ground - 40} 1200 ${peak + 60} Q1300 ${peak - 40} 1400 ${peak + 70} Q1560 ${ground - 120} ${w} ${ground - 150} L${w} ${h} L0 ${h}Z`} fill="#141b2e" stroke="#39415c" strokeWidth={3} />
          <PhoneShape x={380} y={ground - 22} scale={0.24} />
          <g opacity={1 - ramp(frame, domeAt, 15)}>
            <PhoneShape x={1300} y={peak - 12} scale={0.24} />
          </g>
          <g opacity={ramp(frame, domeAt, 15)}>
            <Dome x={1300} y={peak + 12} scale={1.5} />
          </g>
        </svg>
        <Reveal at={90} style={{ position: "absolute", left: 420, top: 300 }}>
          <Tag color={COLOR.warn} style={{ fontSize: 34 }}>
            低い場所: 厚い空気ごし
            <div style={{ fontSize: 28, fontWeight: 400 }}>ちりや水蒸気が多い</div>
          </Tag>
        </Reveal>
        <Reveal at={140} style={{ position: "absolute", left: 1340, top: 60 }}>
          <Tag color={COLOR.good} style={{ fontSize: 34 }}>
            高い場所: 薄い空気ごし
            <div style={{ fontSize: 28, fontWeight: 400 }}>空が澄む</div>
          </Tag>
        </Reveal>
        <Reveal at={domeAt + 10} style={{ position: "absolute", left: 860, top: 120 }}>
          <Tag style={{ fontSize: 38 }}>天文台は山の上</Tag>
        </Reveal>
      </div>
    </Stage>
  );
};

// ---- 脱線 すばる望遠鏡とチリ ----

const PLACES = [
  { name: "日本", lat: 36, lon: 138, dx: 16, dy: -14 },
  { name: "ハワイ マウナケア山", lat: 20, lon: -155, dx: 0, dy: 56 },
  { name: "チリ アタカマ砂漠", lat: -24, lon: -69, dx: 0, dy: 56 },
];

/** 陸地を省いた地球の模式図(経線と緯線だけ)。lon0 が正面に来る経度。 */
const Globe = ({ lon0, mark }: { lon0: number; mark: number }) => {
  const frame = useCurrentFrame();
  const [R, lat0] = [270, (8 * Math.PI) / 180];
  const project = (lat: number, lon: number) => {
    const [p, l] = [(lat * Math.PI) / 180, ((lon - lon0) * Math.PI) / 180];
    const z = Math.sin(lat0) * Math.sin(p) + Math.cos(lat0) * Math.cos(p) * Math.cos(l);
    return { x: R * Math.cos(p) * Math.sin(l), y: -R * (Math.cos(lat0) * Math.sin(p) - Math.sin(lat0) * Math.cos(p) * Math.cos(l)), z };
  };
  const curve = (pts: { x: number; y: number; z: number }[]) => {
    let d = "";
    let pen = false;
    for (const q of pts) {
      d += q.z > 0 ? `${pen ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}` : "";
      pen = q.z > 0;
    }
    return d;
  };
  const steps = Array.from({ length: 61 }, (_, i) => i / 60);
  const grid = [...[-60, -30, 0, 30, 60].map((lat) => curve(steps.map((t) => project(lat, t * 360)))), ...Array.from({ length: 12 }, (_, i) => curve(steps.map((t) => project(-90 + t * 180, i * 30))))];
  return (
    <svg width={620} height={STAGE.h} viewBox={`-310 -345 620 ${STAGE.h}`}>
      <circle r={R} fill="#0b1a33" stroke="#39415c" strokeWidth={3} />
      {grid.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={i === 2 ? "#4a6090" : "#24365c"} strokeWidth={i === 2 ? 3 : 2} />
      ))}
      {PLACES.map((p, i) => {
        const q = project(p.lat, p.lon);
        const on = i === mark;
        const pulse = on ? 10 + 8 * Math.abs(Math.sin(frame / 10)) : 0;
        const color = on ? COLOR.accent : COLOR.dim;
        return (
          <g key={p.name} opacity={Math.min(1, Math.max(0, q.z * 6))}>
            {on && <circle cx={q.x} cy={q.y} r={12 + pulse} fill="none" stroke={color} strokeWidth={3} opacity={0.7} />}
            <circle cx={q.x} cy={q.y} r={10} fill={color} />
            <text x={i ? Math.max(-160, Math.min(160, q.x)) : q.x + p.dx} y={q.y + p.dy} textAnchor={i ? "middle" : "start"} fill={on ? COLOR.text : COLOR.dim} fontSize={on ? 32 : 28} fontWeight={700} paintOrder="stroke" stroke="#05070d" strokeWidth={8}>
              {p.name}
            </text>
          </g>
        );
      })}
      <text x={0} y={-300} fill={COLOR.dim} fontSize={28} textAnchor="middle">
        地球の模式図(陸地は省略)
      </text>
    </svg>
  );
};

/** マウナケア山と富士山の高さ比べ。 */
const Heights = ({ fujiAt }: { fujiAt: number }) => {
  const frame = useCurrentFrame();
  const [w, sea, k] = [1140, 640, 0.118]; // k は 1m あたりの画素
  const [mk, fj] = [sea - 4200 * k, sea - 3776 * k];
  return (
    <svg width={w} height={STAGE.h}>
      <path d={`M120 ${sea} Q360 ${mk + 60} 460 ${mk} Q570 ${mk + 60} 820 ${sea}Z`} fill="#27304a" stroke="#4a5678" strokeWidth={3} />
      <g opacity={ramp(frame, fujiAt, 15)}>
        <path d={`M640 ${sea} Q800 ${fj + 150} 850 ${fj} L900 ${fj} Q950 ${fj + 150} 1120 ${sea}Z`} fill="#27304a" stroke="#4a5678" strokeWidth={3} />
        <path d={`M850 ${fj} L900 ${fj} L922 ${fj + 60} L900 ${fj + 44} L876 ${fj + 64} L852 ${fj + 44} L830 ${fj + 60}Z`} fill="#eef2ff" />
        <line x1={300} y1={fj} x2={w} y2={fj} stroke={COLOR.dim} strokeWidth={2} strokeDasharray="8 8" />
        <text x={875} y={fj - 20} fill={COLOR.text} fontSize={36} fontWeight={700} textAnchor="middle">
          富士山 3776m
        </text>
      </g>
      {/* 雲海。山頂は雲より上に出る */}
      {Array.from({ length: 12 }, (_, i) => {
        const x = ((i * 125 + frame * 0.35) % 1400) - 130;
        return <Cloud key={i} x={x} y={sea - 2300 * k + (i % 3) * 16} scale={0.95 + (i % 4) * 0.12} color="#8fa0c4" opacity={0.6 * ramp(frame, 190, 30)} />;
      })}
      <line x1={0} y1={mk} x2={w} y2={mk} stroke={COLOR.accent} strokeWidth={2} strokeDasharray="8 8" />
      <Dome x={460} y={mk + 4} scale={1.2} />
      <text x={500} y={mk - 12} fill={COLOR.accent} fontSize={38} fontWeight={800}>
        すばる望遠鏡
      </text>
      <text x={20} y={mk - 12} fill={COLOR.text} fontSize={34} fontWeight={700} opacity={ramp(frame, 110, 15)}>
        マウナケア山 約4200m
      </text>
      <text x={690} y={sea - 2300 * k + 80} fill="#c7d2ee" fontSize={32} fontWeight={700} textAnchor="middle" opacity={ramp(frame, 200, 15)} paintOrder="stroke" stroke="#05070d" strokeWidth={8}>
        雲より高い → 晴れる夜がとても多い
      </text>
      <line x1={0} y1={sea} x2={w} y2={sea} stroke={COLOR.dim} strokeWidth={3} />
      <text x={w - 8} y={sea + 36} fill={COLOR.dim} fontSize={28} textAnchor="end">
        海面 0m
      </text>
    </svg>
  );
};

const Subaru: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const [fujiAt, nameAt, blueAt, chileAt, endAt] = [lineAt(scene, 1), lineAt(scene, 2), lineAt(scene, 3), lineAt(scene, 4), lineAt(scene, 6)];
  const chile = [
    { at: 150, tag: "標高", text: "標高が高い" },
    { at: 215, tag: "天気", text: "世界でも指折りの乾燥した場所" },
    { at: 300, tag: "天気", text: "雲のない夜が 1年に300日以上(と言われる)" },
    { at: 410, tag: "場所の暗さ", text: "大きな街からも遠い" },
  ];
  return (
    <Stage chapter={chapter}>
      <Phase to={endAt}>
        <Globe lon0={tween(frame, chileAt - 20, 90, -172, -112)} mark={frame < chileAt ? 1 : 2} />
      </Phase>
      <div style={{ position: "absolute", left: 660, top: 0, width: 1140, height: STAGE.h }}>
        <Phase to={nameAt}>
          <Heights fujiAt={fujiAt} />
        </Phase>
        {/* 完成画像のプレアデス星団 */}
        <Phase from={nameAt} to={chileAt}>
          <div style={{ display: "flex", gap: 36, height: "100%" }}>
            <Photo src="img/pleiades.jpg" w={640} h={STAGE.h} aspect={1} from={{ zoom: 1.1, x: 0.5, y: 0.5 }} to={{ zoom: 2.3, x: 0.5, y: 0.5 }} progress={ramp(frame, nameAt + 60, chileAt - nameAt - 120)}>
              <div style={{ position: "absolute", left: "38%", top: "37%", width: "24%", height: "24%", borderRadius: "50%", border: `4px solid ${COLOR.accent}`, opacity: ramp(frame, blueAt, 15) * (0.6 + 0.4 * Math.sin(frame / 8)) }} />
            </Photo>
            <div style={{ display: "flex", flexDirection: "column", gap: 22, flex: 1, justifyContent: "center" }}>
              <Reveal at={nameAt + 20}>
                <div style={{ fontSize: 84, fontWeight: 800, color: COLOR.accent }}>すばる</div>
              </Reveal>
              <Reveal at={nameAt + 70}>
                <Card style={{ fontSize: 34 }}>
                  おうし座の<b style={{ color: COLOR.accent }}>プレアデス星団</b>の、日本での古い呼び名
                </Card>
              </Reveal>
              <Reveal at={nameAt + 180}>
                <Card color={COLOR.good} style={{ fontSize: 34 }}>
                  今回の写真にも写っている
                </Card>
              </Reveal>
            </div>
          </div>
        </Phase>
        <Phase from={chileAt} to={endAt}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 10 }}>
            <div style={{ fontSize: 50, fontWeight: 800, color: COLOR.text }}>
              チリの<span style={{ color: COLOR.accent }}>アタカマ砂漠</span>
              <span style={{ fontSize: 34, fontWeight: 400, color: COLOR.dim, marginLeft: 20 }}>世界中の天文台が集まる</span>
            </div>
            {chile.map((c) => (
              <Reveal key={c.text} at={chileAt + c.at}>
                <Card style={{ fontSize: 36, display: "flex", gap: 22, alignItems: "center", padding: "14px 24px" }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: COLOR.good, border: `2px solid ${COLOR.good}`, borderRadius: 10, padding: "2px 14px", whiteSpace: "nowrap" }}>{c.tag}</span>
                  {c.text}
                </Card>
              </Reveal>
            ))}
            <Reveal at={chileAt + 450}>
              <div style={{ fontSize: 44, fontWeight: 800, color: COLOR.good }}>→ 条件が全部そろっている</div>
            </Reveal>
          </div>
        </Phase>
      </div>
      {/* しめ: 全部そろわなくてもよい */}
      <Phase from={endAt}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 36 }}>
          <div style={{ fontSize: 48, color: COLOR.text, fontWeight: 700 }}>全部そろわなくても大丈夫</div>
          <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
            {["月のない", "晴れた夜に", "少し暗い場所へ"].map((t, i) => (
              <Reveal key={t} at={endAt + 60 + i * 35}>
                <Card color={COLOR.accent} style={{ textAlign: "center", width: 400, padding: "24px 20px", transform: `translateY(${Math.sin(frame / 18 + i) * 5}px)` }}>
                  <CondIcon kind={i} size={150} />
                  <div style={{ fontSize: 46, fontWeight: 800 }}>{t}</div>
                </Card>
              </Reveal>
            ))}
          </div>
          <Reveal at={endAt + 175}>
            <div style={{ fontSize: 56, fontWeight: 800, color: COLOR.good }}>これだけで、ずいぶん違う</div>
          </Reveal>
        </div>
      </Phase>
    </Stage>
  );
};

// 「章ID/場面名」→ 場面の絵
export const ch01: Record<string, SceneView> = {
  "01_shooting/用意するもの": Supplies,
  "01_shooting/アプリ": App,
  "01_shooting/設定1 RAW": SetRaw,
  "01_shooting/設定2 露出": SetExposure,
  "01_shooting/ISOの決め方": IsoGuide,
  "01_shooting/設定3 フォーカス": SetFocus,
  "01_shooting/設定4 連続撮影": SetBurst,
  "01_shooting/設定5 タイマー": SetTimer,
  "01_shooting/撮影条件": Conditions,
  "01_shooting/条件1 月": CondMoon,
  "01_shooting/条件2 天気": CondWeather,
  "01_shooting/条件3 暗さ": CondDark,
  "01_shooting/条件4 標高": CondAltitude,
  "01_shooting/脱線 すばる望遠鏡とチリ": Subaru,
};
