import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Card, Photo, Reveal, Stage, Wipe } from "../components/ui";
import { COLOR, STAGE } from "../theme";
import { lineAt, ramp, through } from "../timing";
import type { SceneView } from "../types";

const ASPECT = 3048 / 4064;

// 完成画像を下へゆっくりなぞり、3つ目の台詞で星座線つきに替える
const Finished: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const p = through(frame, scene);
  const view = { from: { zoom: 3.55, x: 0.5, y: 0.26 }, to: { zoom: 3.55, x: 0.5, y: 0.5 }, progress: p };
  return (
    <Stage chapter={chapter}>
      <Photo src="img/final.jpg" w={STAGE.w} h={STAGE.h} aspect={ASPECT} {...view} />
      <div style={{ position: "absolute", inset: 0, opacity: ramp(frame, lineAt(scene, 2), 30) }}>
        <Photo src="img/annotated.jpg" w={STAGE.w} h={STAGE.h} aspect={ASPECT} {...view} />
      </div>
    </Stage>
  );
};

// 撮ったままの1枚と完成画像を、動く境界線で見比べる
const Compare: SceneView = ({ chapter, scene }) => {
  const frame = useCurrentFrame();
  const split = 0.5 + 0.34 * Math.sin((frame / 30) * 0.9);
  return (
    <Stage chapter={chapter}>
      <div style={{ display: "flex", gap: 60, alignItems: "center", height: "100%" }}>
        <Wipe left="img/c_asshot.jpg" right="img/c_final.jpg" size={STAGE.h} split={split} labels={["撮ったままの1枚", "重ねたあと"]} />
        <div style={{ display: "flex", flexDirection: "column", gap: 28, flex: 1 }}>
          <Reveal at={lineAt(scene, 2)}>
            <Card>
              16秒の写真を <b style={{ color: COLOR.accent, fontSize: 54 }}>394枚</b>
            </Card>
          </Reveal>
          <Reveal at={lineAt(scene, 2) + 45}>
            <Card>雲がかかったものを除いて、計算で重ねる</Card>
          </Reveal>
          <Reveal at={lineAt(scene, 2) + 110}>
            <Card color={COLOR.good}>
              肉眼の限界より <b style={{ color: COLOR.good, fontSize: 54 }}>約16倍</b> 暗い星まで
            </Card>
          </Reveal>
        </div>
      </div>
    </Stage>
  );
};

const Title: SceneView = ({ scene }) => {
  const frame = useCurrentFrame();
  const items = ["撮り方", "1枚の写真に写っているもの", "重ね方"];
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <Photo src="img/final.jpg" w={1920} h={1080} aspect={ASPECT} from={{ zoom: 2.6, x: 0.5, y: 0.6 }} to={{ zoom: 2.6, x: 0.5, y: 0.66 }} progress={through(frame, scene)} style={{ borderRadius: 0 }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", color: COLOR.text }}>
        <div style={{ fontSize: 110, fontWeight: 800, letterSpacing: 6, opacity: ramp(frame, 0, 20) }}>星空撮影入門</div>
        <div style={{ fontSize: 54, fontWeight: 600, color: COLOR.accent, marginTop: 14, opacity: ramp(frame, 12, 20) }}>スマホを外に放置するだけで星空を撮る</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 36, marginTop: 90 }}>
          {items.map((item, i) => (
            <Reveal key={item} at={40 + i * 22}>
              <Card style={{ fontSize: 40 }}>{item}</Card>
            </Reveal>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const ch00 = { "00_hook/完成画像": Finished, "00_hook/1枚との比較": Compare, "00_hook/タイトル": Title };
