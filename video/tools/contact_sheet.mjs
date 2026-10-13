// 書き出した動画から、場面ごとに1コマずつ取り出して一覧(out/sheet_NN.jpg)にする。目で確認するためのもの。
//   node tools/contact_sheet.mjs [場面の中での位置 0〜1、既定 0.8]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { fps, chapters } = JSON.parse(readFileSync(join(root, "src/timeline.json"), "utf8"));
const at = Number(process.argv[2] ?? 0.8);
const tmp = join(root, "out/sheet_tmp");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const scenes = chapters.flatMap((c) => c.scenes.map((s) => ({ ...s, chapter: c.id })));
scenes.forEach((s, i) => {
  const t = (s.from + s.frames * at) / fps;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", t.toFixed(3), "-i", join(root, "out/main.mp4"), "-frames:v", "1", "-vf", "scale=640:360", join(tmp, `${String(i).padStart(3, "0")}.jpg`)]);
});
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", join(tmp, "%03d.jpg"), "-vf", "tile=3x3:padding=6:color=white", "-q:v", "3", join(root, "out/sheet_%02d.jpg")]);
rmSync(tmp, { recursive: true, force: true });
scenes.forEach((s, i) => console.log(`${Math.floor(i / 9) + 1}-${(i % 9) + 1} ${s.chapter}/${s.name}`));
