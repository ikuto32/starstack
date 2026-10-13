// 動画用の素材を作る: starstack の実行(--stack を付けたときだけ)、画像の切り出し、場面用データ、操作動画の切り出し。
//   node tools/make_assets.mjs --stack   starstack を実行し直してから素材を作る(数分かかる)
//   node tools/make_assets.mjs --subsets 枚数違いの比較用スタックだけ実行し直す
//   node tools/make_assets.mjs           既存の実行結果から素材だけ作り直す
// public/ には空だけが写った画像しか置かない(raw_data4 は前景なし)。
import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const video = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(video, "..");
const exe = join(root, "starstack/target/release/starstack.exe");
const assets = join(video, "assets");
const dump = join(assets, "dump/raw_data4");
const out = join(root, "output/raw_data4");
const img = join(video, "public/img");
const app = join(video, "public/app");
const data = join(video, "src/data");
for (const d of [img, app, data]) mkdirSync(d, { recursive: true });

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 28, ...opts });
const ffmpeg = (...args) => run("ffmpeg", ["-v", "error", "-y", ...args]);

// 重ねる枚数を変えた比較用。基準フレーム(195番)が真ん中に来る連続した区間を使う
const SUBSETS = [16, 48, 128]; // 12 枚未満では starstack が止まる
const REFERENCE = 195;

if (process.argv.includes("--stack")) {
  const log = run(exe, ["raw_data4", join(assets, "metrics_out"), "dark_frame/7mm", "--catalog=catalog", "--metrics-only", `--dump=${dump}`], { cwd: root });
  writeFileSync(join(dump, "log.txt"), log);
}
if (process.argv.includes("--stack") || process.argv.includes("--subsets")) {
  const frames = readdirSync(join(root, "raw_data4")).filter((f) => /\.dng$/i.test(f)).sort();
  for (const n of SUBSETS) {
    const dir = join(assets, "subset", String(n));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const start = REFERENCE - Math.floor(n / 2) + 1;
    for (const f of frames.slice(start, start + n)) linkSync(join(root, "raw_data4", f), join(dir, f));
    writeFileSync(join(assets, `stack_${n}.log`), run(exe, [dir, join(assets, "stack", String(n)), "dark_frame/7mm", "--catalog=catalog"], { cwd: root }));
  }
}
if (process.argv.includes("--stack") || process.argv.includes("--compare")) {
  // ドリズルの比較相手: 色補間してから双3次補間で重ねる、以前の方法
  writeFileSync(join(assets, "stack_nodrizzle.log"), run(exe, ["raw_data4", join(assets, "stack/nodrizzle"), "dark_frame/7mm", "--catalog=catalog", "--without=drizzle"], { cwd: root }));
}

// ---- 画像。センサーの向きの画像は、完成画像と同じ向き(時計回りに90度)に回す
const W = 3048, H = 4064; // 完成画像の大きさ
const sensor = (name) => ["-i", join(dump, `${name}.jpg`), "-vf"];
const toDisplay = "transpose=1,crop=3048:4064:8:8";
const whole = (input, vf, name) => ffmpeg(...input, [vf, "scale=1620:-2"].filter(Boolean).join(","), "-q:v", "3", join(img, `${name}.jpg`));
const final = (name) => ["-i", join(out, `${name}.jpg`), "-vf"];
whole(final("stacked"), "", "final");
whole(final("stacked_annotated"), "", "annotated");
whole(final("star_trails"), "", "trails");
whole(sensor("frame0195_asshot"), toDisplay, "asshot");
whole(sensor("frame0195_raw"), toDisplay, "raw");
whole(sensor("static"), toDisplay, "static");

// 同じ場所の等倍の切り出し(画面中央の 900x900)
const C = { x: W / 2 - 450, y: H / 2 - 450, s: 900 };
const crop = (input, pre, name, c = C) => ffmpeg(...input, [pre, `crop=${c.s}:${c.s}:${c.x}:${c.y}`].filter(Boolean).join(","), "-q:v", "2", join(img, `${name}.jpg`));
crop(sensor("frame0195_raw"), toDisplay, "c_raw");
crop(sensor("frame0195_asshot"), toDisplay, "c_asshot");
crop(sensor("static"), toDisplay, "c_static");
crop(sensor("frame0195_stars"), toDisplay, "c_stars");
crop(sensor("frame0195_stars_stretched"), toDisplay, "c_stars_stretched");
crop(final("stacked"), "", "c_final");
for (const n of SUBSETS) if (existsSync(join(assets, "stack", String(n), "stacked_sky_only.jpg"))) crop(["-i", join(assets, "stack", String(n), "stacked_sky_only.jpg"), "-vf"], "", `c_stack${n}`);
crop(final("stacked_sky_only"), "", "c_stack217");
crop(final("stacked"), "", "pleiades", { x: 1502 - 350, y: 1299 - 350, s: 700 });
crop(final("stacked"), "", "m31", { x: 690 - 300, y: 3431 - 300, s: 600 });
// ノイズを見せる用: RAW 1枚の中央 300 画素角を、補間なしで 3 倍にして画素の粒を残す
ffmpeg(...sensor("frame0195_raw"), `${toDisplay},crop=300:300:${W / 2 - 150}:${H / 2 - 150},scale=900:900:flags=neighbor`, join(img, "noise.png"));
// 超広角カメラの作例(raw_data3)。空だけの出力でも、右上と左下に前景の輪郭が残るので、そこを避けて切り出す
ffmpeg("-i", join(root, "output/raw_data3/stacked_sky_only.jpg"), "-vf", "crop=2400:1600:700:800,scale=1800:-2", "-q:v", "3", join(img, "wide.jpg"));
// ドリズルの比較: 同じ場所を、以前の方法の 1 倍と、ドリズルの 2 倍の出力から(1 倍は最近傍で拡大して画素を見せる)
const D = { x: 1502 - 110, y: 1299 - 110, s: 220 };
ffmpeg("-i", join(assets, "stack/nodrizzle/stacked.jpg"), "-vf", `crop=${D.s}:${D.s}:${D.x}:${D.y},scale=880:880:flags=neighbor`, join(img, "drizzle_1x.png"));
ffmpeg("-i", join(out, "stacked_2x.jpg"), "-vf", `crop=${2 * D.s}:${2 * D.s}:${2 * D.x}:${2 * D.y},scale=880:880:flags=neighbor`, join(img, "drizzle_2x.png"));

// ---- 場面用のデータ(座標は完成画像と同じ向きに直す)
const d = JSON.parse(readFileSync(join(dump, "frames.json"), "utf8"));
const turn = ([x, y, ...rest]) => [Math.round((d.height - 1 - y - 8) * 10) / 10, Math.round((x - 8) * 10) / 10, ...rest];
const brightest = (stars, n) => [...stars].sort((a, b) => b[2] - a[2]).slice(0, n);
const frame = (i, n) => ({ index: i, stars: brightest(d.frames[i].stars, n).map(turn) });
writeFileSync(
  join(data, "frames.json"),
  JSON.stringify({
    width: W,
    height: H,
    reference: d.reference,
    hotCount: d.hot_count,
    // フレームごとの要約: 視野中心のずれ(画面の向き)、対応した星の数、検出した星の数、重ねたか
    track: d.frames.map((f) => ({ offset: f.offset && [-f.offset[1], f.offset[0]], matches: f.matches, stars: f.stars.length, used: f.used })),
    // 追跡の説明用: 基準フレームと、その少し後のフレームの明るい星
    near: [REFERENCE, REFERENCE + 1, REFERENCE + 2, REFERENCE + 20].map((i) => frame(i, 400)),
    // ずらすだけでは合わないことの説明用: 基準フレームの格子が最初のフレームのどこに写るか
    grid: d.frames[0].grid.map(turn),
    gridReference: Array.from({ length: 63 }, (_, k) => turn([((k % 9) / 8) * d.width, (Math.floor(k / 9) / 6) * d.height])),
    series: d.series.map((s) => ({ static: s.static, values: s.values.map((v) => Math.round(v * 10) / 10) })),
    gain: d.gain_grid.map((row) => row.map((g) => Math.round(g * 100) / 100)),
  }),
);
// 等倍の切り出し(c_*.jpg、基準フレーム)の中で、プログラムが実際に検出した星。切り出しの左上を原点に、明るい順
writeFileSync(
  join(data, "crop_stars.json"),
  JSON.stringify(
    brightest(d.frames[REFERENCE].stars, 1e9)
      .map(turn)
      .map(([x, y, flux]) => [Math.round((x - C.x) * 10) / 10, Math.round((y - C.y) * 10) / 10, flux])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < C.s && y < C.s),
  ),
);
// ホットピクセルの実物: 画面中央に近い 1 個を、まわり 48 画素ごと大きく切り出す
const hot = d.hot.map(([x, y]) => ({ x, y, r: Math.hypot(x - d.width / 2, y - d.height / 2) })).filter((p) => p.r > 60).sort((a, b) => a.r - b.r)[0];
ffmpeg("-i", join(dump, "frame0195_raw.jpg"), "-vf", `crop=48:48:${hot.x - 24}:${hot.y - 24},transpose=1,scale=720:720:flags=neighbor`, join(img, "hot.png"));

// ---- Open Camera の操作動画。上端の時計と、通知が映る末尾(126 秒以降)は使わない
const recording = join(root, "動画/アプリ操作動画");
const source = join(recording, readdirSync(recording).find((f) => f.endsWith(".mp4")));
const CLIPS = { main: [0, 4], timer: [4.5, 8], burst: [8, 14.5], raw: [42, 46.5], histogram: [57, 62.5], exposure: [70, 83], focus: [83, 91], start: [96, 114] };
for (const [name, [from, to]] of Object.entries(CLIPS)) {
  if (to > 126) throw new Error("操作動画の 126 秒以降は使わない");
  // 撮影画面の左上には録画したときの時刻が出ているので、黒で塗る
  const clock = ["main", "exposure", "focus", "start"].includes(name) ? "drawbox=x=0:y=468:w=270:h=52:color=black:t=fill," : "";
  ffmpeg("-ss", String(from), "-t", String(to - from), "-i", source, "-vf", `crop=1080:2250:0:100,${clock}scale=480:1000,fps=30`, "-an", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", join(app, `${name}.mp4`));
}
// ---- BGM と効果音(再配布できない素材なので public/ はリポジトリに入れない)
const SOUNDS = {
  "bgm/summer_triangle.mp3": "BGM/しゃろう/SUMMER_TRIANGLE.mp3",
  "bgm/noraneko.mp3": "BGM/しゃろう/野良猫は宇宙を目指した.mp3",
  "bgm/astronaut.mp3": "BGM/しゃろう/宇宙飛行士が最後に見たもの.mp3",
  "bgm/stella.mp3": "BGM/しゃろう/ステラと塔の物語.mp3",
  "bgm/pendulum.mp3": "BGM/しゃろう/魔法使いと振り子時計.mp3",
  "se/sparkle.mp3": "SE/効果音ラボ/演出・アニメ/アニメ/きらきら輝く1.mp3",
  "se/title.mp3": "SE/効果音ラボ/演出・アニメ/アニメ/シャキーン1.mp3",
  "se/chapter.mp3": "SE/効果音ラボ/ボタン・システム音/説明ウインドウが開く.mp3",
  "se/aside.mp3": "SE/効果音ラボ/演出・アニメ/アニメ/ひらめく1.mp3",
};
for (const [to, from] of Object.entries(SOUNDS)) {
  mkdirSync(dirname(join(video, "public", to)), { recursive: true });
  writeFileSync(join(video, "public", to), readFileSync(join(root, "動画", from)));
}

writeFileSync(join(data, "clips.json"), JSON.stringify(Object.fromEntries(Object.entries(CLIPS).map(([k, [a, b]]) => [k, b - a]))));
console.log("素材を作りました");
