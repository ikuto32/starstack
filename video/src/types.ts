import type { FC } from "react";

export type Line = { speaker: "めたん" | "つむぎ"; display: string; speech: string; file: string | null; from: number; frames: number };
export type Scene = { name: string; screen: string; se: string; lines: Line[]; from: number; frames: number };
export type Chapter = { id: string; title: string; scenes: Scene[]; from: number; frames: number };
export type SceneView = FC<{ chapter: Chapter; scene: Scene }>;

export const SPEAKER = {
  めたん: { name: "四国めたん", color: "#f06aa8" },
  つむぎ: { name: "春日部つむぎ", color: "#f5b82e" },
} as const;
