import { AbsoluteFill, Img, staticFile } from "remotion";
import { COLOR, FONT } from "./theme";

const outline = "0 0 22px #000, 0 0 8px #000, 4px 4px 0 #000";
// 完成画像(1620×2160)を置く位置。プレアデス星団が右上に入る
const PLACE = { position: "absolute" as const, width: 1480, left: -100, top: -470 };

const Label = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ position: "absolute", background: "rgba(0,0,0,0.72)", border: "3px solid #fff", borderRadius: 12, padding: "4px 18px", color: "#fff", fontSize: 34, fontWeight: 800, ...style }}>{children}</div>
);

const Headline = ({ small }: { small?: boolean }) => (
  <div style={{ position: "absolute", left: 48, bottom: 44, color: "#fff", fontWeight: 900, textShadow: outline }}>
    <div style={{ fontSize: 46, color: COLOR.accent }}>星空撮影入門</div>
    <div style={{ fontSize: small ? 104 : 120, lineHeight: 1.1, marginTop: 6 }}>スマホを</div>
    <div style={{ fontSize: small ? 104 : 120, lineHeight: 1.1, color: COLOR.tsumugi }}>置くだけ</div>
    <div style={{ fontSize: 50, marginTop: 18 }}>
      望遠鏡なしで <span style={{ color: COLOR.tsumugi }}>9等星</span>まで
    </div>
  </div>
);

/** 案A: 撮ったままの1枚(左)と、重ねた結果(右)。どちらも実際の画像で、同じ範囲。 */
export const ThumbnailSplit = () => (
  <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: FONT, overflow: "hidden" }}>
    <Img src={staticFile("img/final.jpg")} style={{ ...PLACE, filter: "brightness(1.25) contrast(1.1) saturate(1.25)" }} />
    <AbsoluteFill style={{ clipPath: "polygon(0 0, 54% 0, 44% 100%, 0 100%)" }}>
      <Img src={staticFile("img/asshot.jpg")} style={PLACE} />
    </AbsoluteFill>
    <div style={{ position: "absolute", left: 626, top: -40, width: 6, height: 800, background: "#fff", transform: "rotate(10.1deg)", boxShadow: "0 0 18px #fff" }} />
    <Label style={{ left: 40, top: 30 }}>スマホで撮った1枚</Label>
    <Label style={{ right: 36, top: 30, borderColor: COLOR.tsumugi, color: COLOR.tsumugi }}>394枚を重ねると</Label>
    <Headline small />
  </AbsoluteFill>
);

// origin は、切り出しの中で天体がある位置(%)。そこを中心に2倍に寄せる
const Inset = ({ src, name, note, origin, size = 250, style }: { src: string; name: string; note: string; origin: string; size?: number; style: React.CSSProperties }) => (
  <div style={{ position: "absolute", ...style }}>
    <div style={{ width: size, height: size, borderRadius: "50%", border: "5px solid #fff", overflow: "hidden", boxShadow: "0 0 30px #000" }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", transform: "scale(2)", transformOrigin: origin, filter: "brightness(1.3) contrast(1.1) saturate(1.2)" }} />
    </div>
    <div style={{ textAlign: "center", color: "#fff", fontWeight: 800, textShadow: outline, marginTop: 4 }}>
      <div style={{ fontSize: 34 }}>{name}</div>
      <div style={{ fontSize: 26, color: COLOR.tsumugi }}>{note}</div>
    </div>
  </div>
);

/** 案C: 案Aの対比に、案Bの天体の拡大を合わせたもの。 */
export const ThumbnailCombined = () => (
  <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: FONT, overflow: "hidden" }}>
    <Img src={staticFile("img/final.jpg")} style={{ ...PLACE, filter: "brightness(1.25) contrast(1.1) saturate(1.25)" }} />
    <AbsoluteFill style={{ clipPath: "polygon(0 0, 54% 0, 44% 100%, 0 100%)" }}>
      <Img src={staticFile("img/asshot.jpg")} style={PLACE} />
    </AbsoluteFill>
    <div style={{ position: "absolute", left: 626, top: -40, width: 6, height: 800, background: "#fff", transform: "rotate(10.1deg)", boxShadow: "0 0 18px #fff" }} />
    <Label style={{ left: 40, top: 30 }}>スマホで撮った1枚</Label>
    <Label style={{ left: 716, top: 30, borderColor: COLOR.tsumugi, color: COLOR.tsumugi }}>394枚を重ねると</Label>
    <Inset src="img/pleiades.jpg" name="すばる" note="プレアデス星団" origin="50% 47%" size={220} style={{ right: 34, top: 110 }} />
    <Inset src="img/m31.jpg" name="アンドロメダ銀河" note="250万光年先" origin="44% 50%" size={220} style={{ right: 300, top: 370 }} />
    <Headline small />
  </AbsoluteFill>
);

/** 案B: 完成画像の上に、写っている天体の拡大(実際の画像)を添える。 */
export const ThumbnailObjects = () => (
  <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: FONT, overflow: "hidden" }}>
    <Img src={staticFile("img/final.jpg")} style={{ ...PLACE, filter: "brightness(1.25) contrast(1.1) saturate(1.25)" }} />
    <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0) 100%)" }} />
    <Inset src="img/m31.jpg" name="アンドロメダ銀河" note="250万光年先" origin="44% 50%" style={{ right: 330, top: 300 }} />
    <Inset src="img/pleiades.jpg" name="すばる" note="プレアデス星団" origin="50% 47%" style={{ right: 40, top: 60 }} />
    <Headline />
  </AbsoluteFill>
);
