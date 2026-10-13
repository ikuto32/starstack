// 台詞ごとに、VOICEVOX がどう読むか(カナ)を一覧にする。読み間違いを探すためのもの。
//   node tools/check_readings.mjs [絞り込む文字列]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "http://127.0.0.1:50021";
const filter = process.argv[2];
const { chapters } = JSON.parse(readFileSync(join(root, "src/timeline.json"), "utf8"));
for (const chapter of chapters) {
  for (const scene of chapter.scenes) {
    for (const line of scene.lines) {
      if (filter && !line.display.includes(filter)) continue;
      const query = await (await fetch(`${ENGINE}/audio_query?speaker=2&text=${encodeURIComponent(line.speech)}`, { method: "POST" })).json();
      // アクセントの記号を外して、読みだけにする
      console.log(`${chapter.id.slice(0, 2)} ${line.display}\n   ${query.kana.replace(/['_]/g, "")}`);
    }
  }
}
