// YouTube の概要欄(publish/description.txt)を、タイムラインの章の開始時刻から作る。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { fps, chapters } = JSON.parse(readFileSync(join(root, "src/timeline.json"), "utf8"));
const clock = (f) => `${Math.floor(f / fps / 60)}:${String(Math.floor(f / fps) % 60).padStart(2, "0")}`;
// 章の見出しから番号を外し、最初の章は「はじめに」にする(YouTube の章は 0:00 から始める必要がある)
const titles = chapters.map((c, i) => (i === 0 ? "はじめに" : c.title.replace(/^\d+\.\s*/, "")));

const text = `スマホを外に置いて連写するだけで、星空の写真を撮る方法と、その裏側の計算を解説します。
望遠鏡も、星を追いかける機械も使いません。

■ 目次
${chapters.map((c, i) => `${clock(c.from)} ${titles[i]}`).join("\n")}

■ 使ったもの
スマホ: Pixel 11 Pro
撮影アプリ: Open Camera https://opencamera.org.uk/
重ねるプログラム(自作、MIT License): https://github.com/ikuto32/starstack

■ 撮影の設定
保存形式: DNG (RAW) only / シャッター速度: 16秒 / ISO: 100(機種に合わせて調整)
フォーカス: 手動で無限遠 / 連続撮影: 無制限 / タイマー: 5秒

■ クレジット
VOICEVOX:四国めたん
VOICEVOX:春日部つむぎ
BGM: しゃろう
効果音: 効果音ラボ
星表・星座線: d3-celestial
動画制作: Remotion
`;
mkdirSync(join(root, "publish"), { recursive: true });
writeFileSync(join(root, "publish/description.txt"), text);
console.log(text);
