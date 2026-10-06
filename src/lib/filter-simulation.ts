import { isValidKernelSize } from "./filter-settings";
import type { Method } from "./matlab-api";

export type WalkthroughMethod = "mean" | "gaussian" | "median" | "unsharp";
export type SimulationImage = { width: number; height: number; data: Uint8ClampedArray };
export const hasWalkthrough = (method: Method): method is WalkthroughMethod =>
  ["mean", "gaussian", "median", "unsharp"].includes(method);
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function luminanceAt(image: SimulationImage, x: number, y: number) {
  const index = (clamp(y, 0, image.height - 1) * image.width + clamp(x, 0, image.width - 1)) * 4;
  return (
    0.299 * image.data[index]! + 0.587 * image.data[index + 1]! + 0.114 * image.data[index + 2]!
  );
}

// Same normalized Gaussian weights and replicated boundary as spatial_filter.m.
// This is a browser-decoded luminance illustration, never the export pipeline.
export function gaussianWeights(size: number, sigma: number) {
  const radius = (size - 1) / 2;
  const raw = Array.from({ length: size * size }, (_, index) => {
    const dx = (index % size) - radius,
      dy = Math.floor(index / size) - radius;
    return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  });
  const sum = raw.reduce((total, value) => total + value, 0);
  return raw.map((value) => value / sum);
}

export function simulatePixel(
  image: SimulationImage,
  x: number,
  y: number,
  method: WalkthroughMethod,
  size: number,
  sigma: number,
  amount: number,
) {
  if (
    !isValidKernelSize(size) ||
    !Number.isFinite(sigma) ||
    sigma < 0.3 ||
    sigma > 3 ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 3
  )
    throw new Error("Choose a valid odd kernel size, sigma, and sharpening strength.");
  const radius = (size - 1) / 2;
  const weights =
    method === "gaussian" || method === "unsharp"
      ? gaussianWeights(size, sigma)
      : Array(size * size).fill(1 / (size * size));
  const samples = weights.map((weight: number, index: number) => {
    const dx = (index % size) - radius,
      dy = Math.floor(index / size) - radius;
    const value = luminanceAt(image, x + dx, y + dy);
    return { index, dx, dy, value, weight, contribution: value * weight };
  });
  const sum = samples.reduce((total, sample) => total + sample.value, 0);
  const blurred = samples.reduce((total, sample) => total + sample.contribution, 0);
  const ordered = [...samples].sort((a, b) => a.value - b.value || a.index - b.index);
  const original = luminanceAt(image, x, y);
  const detail = original - blurred;
  const unclipped =
    method === "median"
      ? ordered[Math.floor(ordered.length / 2)]!.value
      : method === "unsharp"
        ? original + amount * detail
        : blurred;
  return {
    samples,
    ordered,
    sum,
    blurred,
    original,
    detail,
    unclipped,
    output: clamp(unclipped, 0, 255),
  };
}

export function simulationCrop(
  image: SimulationImage,
  x: number,
  y: number,
  method: WalkthroughMethod,
  size: number,
  sigma: number,
  amount: number,
) {
  const width = Math.min(7, image.width),
    height = Math.min(7, image.height);
  const left = clamp(x - Math.floor(width / 2), 0, image.width - width);
  const top = clamp(y - Math.floor(height / 2), 0, image.height - height);
  const pixels = Array.from({ length: width * height }, (_, index) => {
    const column = left + (index % width),
      row = top + Math.floor(index / width);
    return { x: column, y: row, ...simulatePixel(image, column, row, method, size, sigma, amount) };
  });
  return { width, height, pixels };
}

export function loadSimulationImage(url: string): Promise<SimulationImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const width = image.naturalWidth,
          height = image.naturalHeight;
        if (!width || !height || width * height > 16_000_000)
          throw new Error("Use an image with at most 16 million pixels for the walkthrough.");
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Your browser could not read this image’s pixels.");
        context.drawImage(image, 0, 0);
        resolve({ width, height, data: context.getImageData(0, 0, width, height).data });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () =>
      reject(new Error("Could not read the image. Load a PNG or JPEG and try again."));
    image.src = url;
  });
}
