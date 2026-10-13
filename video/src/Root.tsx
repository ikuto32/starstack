import { Composition, Still } from "remotion";
import { Main } from "./Main";
import { ThumbnailCombined, ThumbnailObjects, ThumbnailSplit } from "./Thumbnail";
import timeline from "./timeline.json";

export const Root = () => (
  <>
    <Composition id="Main" component={Main} width={1920} height={1080} fps={timeline.fps} durationInFrames={timeline.frames} />
    <Still id="ThumbnailSplit" component={ThumbnailSplit} width={1280} height={720} />
    <Still id="ThumbnailObjects" component={ThumbnailObjects} width={1280} height={720} />
    <Still id="ThumbnailCombined" component={ThumbnailCombined} width={1280} height={720} />
  </>
);
