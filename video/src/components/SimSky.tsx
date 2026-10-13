import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { SIM, toImageData } from "../sim/sky";

/** 模式図の星空(光量の配列)を、画素が見える拡大で描く。 */
export const SimSky = ({ image, lo = 0, hi = 9, scale = 5, style }: { image: Float32Array; lo?: number; hi?: number; scale?: number; style?: CSSProperties }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    ref.current?.getContext("2d")?.putImageData(toImageData(image, lo, hi), 0, 0);
  }, [image, lo, hi]);
  return <canvas ref={ref} width={SIM.w} height={SIM.h} style={{ width: SIM.w * scale, height: SIM.h * scale, imageRendering: "pixelated", borderRadius: 10, ...style }} />;
};
