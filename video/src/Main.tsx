import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Placeholder } from "./scenes/Placeholder";
import { scenes } from "./scenes";
import { Soundtrack } from "./components/Soundtrack";
import { Subtitle } from "./components/Subtitle";
import timeline from "./timeline.json";
import type { Chapter, Scene } from "./types";

const chapters = timeline.chapters as Chapter[];

export const Main = () => (
  <AbsoluteFill style={{ backgroundColor: "#05070d", fontFamily: "'Yu Gothic UI', 'Meiryo', sans-serif" }}>
    <Soundtrack />
    {chapters.flatMap((chapter) =>
      chapter.scenes.map((scene: Scene) => {
        // 場面の絵は scenes/index.ts に「章ID/場面名」で登録する。未登録なら絵コンテを出す
        const View = scenes[`${chapter.id}/${scene.name}`] ?? Placeholder;
        return (
          <Sequence key={`${chapter.id}/${scene.name}`} from={scene.from} durationInFrames={scene.frames} name={`${chapter.id} ${scene.name}`}>
            <View chapter={chapter} scene={scene} />
            {scene.lines.map((line) => (
              <Sequence key={line.from} from={line.from - scene.from} durationInFrames={line.frames + 4} layout="none">
                {line.file && <Audio src={staticFile(line.file)} />}
                <Subtitle line={line} />
              </Sequence>
            ))}
          </Sequence>
        );
      }),
    )}
  </AbsoluteFill>
);
