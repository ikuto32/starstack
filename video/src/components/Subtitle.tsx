import { useCurrentFrame } from "remotion";
import { SPEAKER, type Line } from "../types";

const PAGE = 68; // 字幕1枚に載せる文字数の目安(2行分)

// 長い台詞を文の切れ目で字幕数枚に分ける
const pages = (text: string) => {
  const out: string[] = [];
  for (const sentence of text.match(/[^。？！]+[。？！」]*\s*/g) ?? [text]) {
    if (out.length && (out.at(-1) + sentence).length <= PAGE) out[out.length - 1] += sentence;
    else out.push(sentence);
  }
  return out.map((p) => p.trim());
};

// 話者の名前ラベルと字幕。立ち絵を使うことになったら、ここに差し込む
export const Subtitle = ({ line }: { line: Line }) => {
  const frame = useCurrentFrame();
  const { name, color } = SPEAKER[line.speaker];
  // 音声の中での位置は、文字数に比例するとみなす
  const all = pages(line.display);
  const total = all.join("").length;
  let page = 0;
  for (let seen = all[0].length; page < all.length - 1 && frame / line.frames >= seen / total; seen += all[++page].length);
  return (
    <div style={{ position: "absolute", left: 120, right: 120, bottom: 48, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{ background: color, color: "#10131c", fontSize: 30, fontWeight: 700, padding: "4px 22px", borderRadius: "12px 12px 0 0" }}>{name}</div>
      <div style={{ alignSelf: "stretch", background: "rgba(8, 11, 20, 0.86)", border: `3px solid ${color}`, borderRadius: "0 16px 16px 16px", color: "#fff", fontSize: 46, fontWeight: 600, lineHeight: 1.4, padding: "18px 30px", minHeight: 2 * 46 * 1.4 }}>
        {all[page]}
      </div>
    </div>
  );
};
