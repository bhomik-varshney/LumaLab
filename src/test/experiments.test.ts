import { describe, it, expect } from "vitest";
import { containedBounds, sourcePoint, clampRegion } from "@/lib/region";
import { boundedHistory, comparisonKey, HISTORY_BYTES } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiments";
import type { ProcessingResult } from "@/lib/matlab-api";
const entry = (id: string, source = "input", url = id): Experiment => ({
  id,
  at: 0,
  source,
  result: {
    imageId: source,
    url,
    originalUrl: "original",
    method: "gamma",
    parameters: { gamma: 0.65 },
  } as ProcessingResult,
});
describe("region mapping", () => {
  it("maps letterboxing, translated zoom, CSS scaling and clamps beyond image edges", () => {
    const bounds = containedBounds({ left: 40, top: 50, width: 600, height: 600 }, 1200, 600);
    expect(bounds).toEqual({ left: 40, top: 200, width: 600, height: 300 });
    expect(sourcePoint(340, 350, bounds, 1200, 600)).toEqual({ x: 600, y: 300 });
    const zoomed = containedBounds({ left: -100, top: -200, width: 1200, height: 1200 }, 1200, 600);
    expect(sourcePoint(100, 200, zoomed, 1200, 600)).toEqual({ x: 200, y: 100 });
    expect(sourcePoint(-999, 9999, bounds, 1200, 600)).toEqual({ x: 0, y: 600 });
    expect(clampRegion({ x: 99, y: 99, width: 4, height: 4 }, 100, 100)).toEqual({
      x: 92,
      y: 92,
      width: 8,
      height: 8,
    });
  });
});
describe("experiment retention and identity", () => {
  it("bounds count and actual image memory while retaining latest recoverable outputs", () => {
    expect(boundedHistory(Array.from({ length: 20 }, (_, i) => entry(`${i}`)))).toHaveLength(12);
    const huge = entry("huge", "input", "x".repeat(HISTORY_BYTES / 2));
    expect(boundedHistory([huge, entry("small")]).map((item) => item.id)).toEqual(["small"]);
  });
  it("keeps comparisons on exactly the same source and pixel rectangle", () => {
    const a = entry("a"),
      b = entry("b");
    expect(comparisonKey(a)).toBe(comparisonKey(b));
    b.result.roi = { x: 0, y: 0, width: 8, height: 8 };
    expect(comparisonKey(a)).not.toBe(comparisonKey(b));
    expect(comparisonKey(a)).not.toBe(comparisonKey(entry("c", "different-source")));
  });
});
