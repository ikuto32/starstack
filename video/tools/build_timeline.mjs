// 台本(script/*.md)から音声(public/voice/*.wav)とタイムライン(src/timeline.json)を作る。
//   node tools/build_timeline.mjs             VOICEVOX エンジン(127.0.0.1:50021)で合成
//   node tools/build_timeline.mjs --estimate  エンジンなしで、文字数から長さを見積もる(音声なし)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "http://127.0.0.1:50021";
const FPS = 30;
const SPEED = 1.2;
// 台詞の後ろに置く間(秒)
const GAP = { line: 0.22, scene: 0.55, chapter: 0.9 };
const SPEAKERS = { めたん: "四国めたん", つむぎ: "春日部つむぎ" };
const estimate = process.argv.includes("--estimate");

const dictionary = Object.entries(JSON.parse(readFileSync(join(root, "tools/dictionary.json"), "utf8"))).sort((a, b) => b[0].length - a[0].length);

// {表記|よみ} を字幕用と音声用に分け、音声用には辞書の読みを当てる
function readings(text) {
  const display = text.replace(/\{([^|}]+)\|[^}]+\}/g, "$1");
  let speech = text.replace(/\{[^|}]+\|([^}]+)\}/g, "$1");
  for (const [word, reading] of dictionary) speech = speech.split(word).join(reading);
  return { display, speech };
}

function parse(file) {
  const chapter = { id: file.replace(/\.md$/, ""), title: "", scenes: [] };
  let scene = null;
  for (const raw of readFileSync(join(root, "script", file), "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^# (.+)$/))) chapter.title = m[1].replace(/[((]\d+:\d+.*$/, "").trim();
    else if ((m = line.match(/^## 場面: (.+)$/))) chapter.scenes.push((scene = { name: m[1], screen: "", se: "", lines: [] }));
    else if (!scene) continue;
    else if ((m = line.match(/^> 画面: (.+)$/))) scene.screen = m[1];
    else if ((m = line.match(/^> 効果音: (.+)$/))) scene.se = m[1];
    else if ((m = line.match(/^(めたん|つむぎ): (.+)$/))) scene.lines.push({ speaker: m[1], ...readings(m[2]) });
  }
  return chapter;
}

async function styleIds() {
  const speakers = await (await fetch(`${ENGINE}/speakers`)).json();
  return Object.fromEntries(
    Object.entries(SPEAKERS).map(([key, name]) => {
      const style = speakers.find((s) => s.name === name)?.styles.find((s) => s.name === "ノーマル");
      if (!style) throw new Error(`VOICEVOX に ${name}(ノーマル)がありません`);
      return [key, style.id];
    }),
  );
}

async function synthesize(line, ids) {
  const id = ids[line.speaker];
  const hash = createHash("sha1").update(`${id}|${SPEED}|${line.speech}`).digest("hex").slice(0, 16);
  const file = `voice/${hash}.wav`;
  const path = join(root, "public", file);
  if (!existsSync(path)) {
    const query = await (await fetch(`${ENGINE}/audio_query?speaker=${id}&text=${encodeURIComponent(line.speech)}`, { method: "POST" })).json();
    Object.assign(query, { speedScale: SPEED, prePhonemeLength: 0.05, postPhonemeLength: 0.05 });
    const res = await fetch(`${ENGINE}/synthesis?speaker=${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) });
    if (!res.ok) throw new Error(`合成に失敗: ${line.display}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const wav = readFileSync(path);
  return { file, seconds: (wav.length - 44) / wav.readUInt32LE(28) };
}

mkdirSync(join(root, "public/voice"), { recursive: true });
const ids = estimate ? null : await styleIds();
const chapters = readdirSync(join(root, "script")).filter((f) => /^\d\d_.+\.md$/.test(f)).sort().map(parse);
const frames = (seconds) => Math.round(seconds * FPS);
let now = 0;
for (const chapter of chapters) {
  chapter.from = now;
  for (const scene of chapter.scenes) {
    scene.from = now;
    for (const line of scene.lines) {
      const voice = estimate ? { file: null, seconds: line.display.length / 7.5 + 0.3 } : await synthesize(line, ids);
      Object.assign(line, { file: voice.file, from: now, frames: frames(voice.seconds) });
      now += line.frames + frames(GAP.line);
    }
    now += frames(GAP.scene - GAP.line);
    scene.frames = now - scene.from;
  }
  now += frames(GAP.chapter - GAP.scene);
  chapter.scenes.at(-1).frames = now - chapter.scenes.at(-1).from;
  chapter.frames = now - chapter.from;
}
writeFileSync(join(root, "src/timeline.json"), JSON.stringify({ fps: FPS, frames: now, chapters }, null, 1));

const clock = (f) => `${Math.floor(f / FPS / 60)}:${String(Math.floor(f / FPS) % 60).padStart(2, "0")}`;
for (const c of chapters) console.log(`${clock(c.from)}  ${c.title}  (${(c.frames / FPS).toFixed(0)}秒)`);
console.log(`合計 ${clock(now)}${estimate ? "(見積もり)" : ""}`);
