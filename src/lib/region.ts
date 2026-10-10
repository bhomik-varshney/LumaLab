import type { Region } from "./matlab-api";
export type Bounds = { left: number; top: number; width: number; height: number };
export function containedBounds(box: Bounds, width: number, height: number): Bounds {
  const scale = Math.min(box.width / width, box.height / height);
  const w = width * scale,
    h = height * scale;
  return {
    left: box.left + (box.width - w) / 2,
    top: box.top + (box.height - h) / 2,
    width: w,
    height: h,
  };
}
export function sourcePoint(x: number, y: number, bounds: Bounds, width: number, height: number) {
  return {
    x: Math.max(0, Math.min(width, Math.round(((x - bounds.left) * width) / bounds.width))),
    y: Math.max(0, Math.min(height, Math.round(((y - bounds.top) * height) / bounds.height))),
  };
}
export function clampRegion(region: Region, width: number, height: number): Region {
  const w = Math.min(width, Math.max(8, Math.round(region.width))),
    h = Math.min(height, Math.max(8, Math.round(region.height)));
  return {
    x: Math.max(0, Math.min(width - w, Math.round(region.x))),
    y: Math.max(0, Math.min(height - h, Math.round(region.y))),
    width: w,
    height: h,
  };
}
