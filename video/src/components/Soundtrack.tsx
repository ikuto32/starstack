import { Audio, interpolate, Sequence, staticFile } from "remotion";
import timeline from "../timeline.json";
import type { Chapter } from "../types";

const chapters = timeline.chapters as Chapter[];
const BGM_VOLUME = 0.07; // 声の邪魔をしない大きさ
const SE_VOLUME = 0.35;
const FADE = 45;

// 章の番号 → その章から流す曲。次の指定がある章まで、くり返し流す
const BGM: Record<number, string> = { 0: "summer_triangle", 2: "noraneko", 4: "astronaut", 6: "stella", 9: "pendulum", 11: "summer_triangle" };

/** BGM と効果音。効果音は、章の頭、タイトル、「脱線」の場面の頭で鳴らす。 */
export const Soundtrack = () => {
  const starts = Object.keys(BGM).map(Number);
  return (
    <>
      {starts.map((first, k) => {
        const from = chapters[first].from;
        const frames = (k + 1 < starts.length ? chapters[starts[k + 1]].from : timeline.frames) - from;
        const volume = (f: number) => BGM_VOLUME * interpolate(f, [0, FADE, frames - FADE, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <Sequence key={first} from={from} durationInFrames={frames} layout="none">
            <Audio src={staticFile(`bgm/${BGM[first]}.mp3`)} loop volume={volume} />
          </Sequence>
        );
      })}
      {chapters.flatMap((chapter, c) =>
        chapter.scenes.map((scene, s) => {
          const sound = c === 0 && s === 0 ? "sparkle" : scene.name === "タイトル" ? "title" : scene.name.startsWith("脱線") ? "aside" : s === 0 ? "chapter" : null;
          return (
            sound && (
              <Sequence key={`${chapter.id}/${scene.name}`} from={scene.from} durationInFrames={160} layout="none">
                <Audio src={staticFile(`se/${sound}.mp3`)} volume={SE_VOLUME} />
              </Sequence>
            )
          );
        }),
      )}
    </>
  );
};
