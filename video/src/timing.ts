import { Easing, interpolate } from "remotion";
import type { Scene } from "./types";

/** 場面の先頭から数えた、i 番目の台詞が始まるフレーム。台詞の数を超えたら場面の終わり。 */
export const lineAt = (scene: Scene, i: number) => (i < scene.lines.length ? scene.lines[i].from - scene.from : scene.frames);

/** start から dur フレームかけて 0 → 1(なめらかに)。 */
export const ramp = (frame: number, start: number, dur = 15) => interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });

/** 値 a から b へ、start から dur フレームかけて動かす。 */
export const tween = (frame: number, start: number, dur: number, a: number, b: number) => a + (b - a) * ramp(frame, start, dur);

/** 場面全体を 0 → 1 で進む(ゆっくり動かし続けたいもの用)。 */
export const through = (frame: number, scene: Scene) => Math.min(1, Math.max(0, frame / Math.max(1, scene.frames - 1)));
