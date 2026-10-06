import { describe, expect, it } from "vitest";
import {
  gaussianWeights,
  luminanceAt,
  simulatePixel,
  simulationCrop,
} from "@/lib/filter-simulation";
import { isValidKernelSize } from "@/lib/filter-settings";

const image = (width: number, height: number, value: (x: number, y: number) => number) => ({
  width,
  height,
  data: Uint8ClampedArray.from(
    Array.from({ length: width * height }, (_, index) => {
      const sample = value(index % width, Math.floor(index / width));
      return [sample, sample, sample, 255];
    }).flat(),
  ),
});

describe("local spatial walkthrough calculations", () => {
  it("uses real neighborhood values with replicate padding, even on one pixel", () => {
    const impulse = image(3, 3, (x, y) => (x === 0 && y === 0 ? 255 : 0));
    const example = simulatePixel(impulse, 0, 0, "mean", 3, 1, 1);
    expect(example.sum).toBeCloseTo(4 * 255, 9);
    expect(example.output).toBeCloseTo((4 * 255) / 9, 9);
    for (const size of [3, 5, 7, 9, 11, 13, 15]) {
      expect(isValidKernelSize(size)).toBe(true);
      for (const method of ["mean", "gaussian", "median", "unsharp"] as const)
        expect(
          simulatePixel(
            image(1, 1, () => 128),
            0,
            0,
            method,
            size,
            1.7,
            2,
          ).output,
        ).toBeCloseTo(128, 9);
    }
    for (const size of [2, 4, 14, 16, 17, 3.5, NaN]) expect(isValidKernelSize(size)).toBe(false);
  });
  it("sorts actual median values and responds to the selected footprint", () => {
    const region = image(21, 21, (x, y) => (x >= 7 && x <= 13 && y >= 7 && y <= 13 ? 255 : 0));
    const small = simulatePixel(region, 10, 10, "median", 3, 1, 1);
    const large = simulatePixel(region, 10, 10, "median", 15, 1, 1);
    expect(small.output).toBeCloseTo(255, 9);
    expect(large.output).toBe(0);
    expect(large.ordered.map((sample) => sample.value)).toEqual(
      [...large.samples.map((sample) => sample.value)].sort((a, b) => a - b),
    );
  });
  it("normalizes Gaussian weights, keeps sigma independent, and scales unsharp detail", () => {
    const impulse = image(21, 21, (x, y) => (x === 10 && y === 10 ? 160 : 80));
    const weights = gaussianWeights(15, 1.6);
    expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    const gaussian = simulatePixel(impulse, 10, 10, "gaussian", 15, 1.6, 1);
    expect(gaussian.output).toBeCloseTo(80 + 80 * weights[112]!, 10);
    expect(simulatePixel(impulse, 10, 10, "gaussian", 15, 0.5, 1).output).toBeGreaterThan(
      gaussian.output,
    );
    const sharp = simulatePixel(impulse, 10, 10, "unsharp", 15, 1.6, 2);
    expect(sharp.blurred).toBe(gaussian.blurred);
    expect(sharp.unclipped).toBeCloseTo(160 + 2 * (160 - gaussian.output), 10);
    expect(simulatePixel(impulse, 10, 10, "unsharp", 15, 1.6, 0).output).toBeCloseTo(160, 10);
    expect(simulationCrop(impulse, 0, 0, "mean", 15, 1, 1).pixels).toHaveLength(49);
  });
  it("shows RGB luminance rather than pretending to calculate each channel", () => {
    const red = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    expect(luminanceAt(red, 0, 0)).toBeCloseTo(0.299 * 255, 12);
    expect(simulatePixel(red, 0, 0, "mean", 15, 1, 1).output).toBeCloseTo(0.299 * 255, 10);
  });
});
