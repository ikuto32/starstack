import { AbsoluteFill } from "remotion";
import type { SceneView } from "../types";

// 絵コンテ: まだ絵を作っていない場面に、台本の画面指示をそのまま出す
export const Placeholder: SceneView = ({ chapter, scene }) => (
  <AbsoluteFill style={{ padding: "70px 120px", color: "#c9d4ee" }}>
    <div style={{ fontSize: 34, color: "#7f8db3" }}>{chapter.title}</div>
    <div style={{ fontSize: 64, fontWeight: 700, color: "#fff", marginTop: 8 }}>{scene.name}</div>
    <div style={{ marginTop: 40, fontSize: 38, lineHeight: 1.6, border: "2px dashed #46527a", borderRadius: 16, padding: "28px 36px" }}>
      <div style={{ fontSize: 28, color: "#7f8db3" }}>画面</div>
      {scene.screen}
      {scene.se && <div style={{ fontSize: 30, color: "#9fb0dc", marginTop: 18 }}>効果音: {scene.se}</div>}
    </div>
  </AbsoluteFill>
);
