import { operationRegistry } from "../../shared/operations.mjs";
import type { Category, Method, Parameters, ProcessingResult } from "./matlab-api";

export const categories: { id: Category; name: string; description: string }[] = [
  {
    id: "intensity",
    name: "Intensity Transformations",
    description: "Remap each pixel’s intensity without mixing neighboring pixels.",
  },
  {
    id: "spatial",
    name: "Spatial Filtering",
    description: "Use nearby pixels to smooth, sharpen, or reveal edges.",
  },
];
const descriptions: {
  id: Method;
  category: Category;
  name: string;
  short: string;
  explanation: string;
}[] = [
  {
    id: "gamma",
    category: "intensity",
    name: "Gamma correction",
    short: "Gamma",
    explanation: "Below 1 brightens midtones. Above 1 darkens them.",
  },
  {
    id: "equalize",
    category: "intensity",
    name: "Histogram equalization",
    short: "Histogram",
    explanation: "Redistribute tones using the cumulative histogram to improve global contrast.",
  },
  {
    id: "stretch",
    category: "intensity",
    name: "Contrast stretching",
    short: "Stretch",
    explanation:
      "Expand the selected brightness range. Tones outside it are clipped to black or white.",
  },
  {
    id: "mean",
    category: "spatial",
    name: "Mean",
    short: "Mean",
    explanation:
      "Average nearby pixels to smooth small variations. Large neighborhoods blur more detail.",
  },
  {
    id: "gaussian",
    category: "spatial",
    name: "Gaussian",
    short: "Gaussian",
    explanation:
      "Apply a weighted blur that gives nearby pixels more influence. Smooth small variations and noise.",
  },
  {
    id: "median",
    category: "spatial",
    name: "Median",
    short: "Median",
    explanation:
      "Use the neighborhood’s middle value. Especially useful for salt-and-pepper noise.",
  },
  {
    id: "unsharp",
    category: "spatial",
    name: "Unsharp Mask",
    short: "Unsharp",
    explanation:
      "Add detail back after blurring to sharpen edges. Higher strength can emphasize noise.",
  },
  {
    id: "sobel",
    category: "spatial",
    name: "Sobel",
    short: "Sobel",
    explanation: "Highlight edges by measuring horizontal and vertical intensity changes.",
  },
];

export const methods = operationRegistry.operations.map((definition) => ({
  ...descriptions.find((item) => item.id === definition.id)!,
  id: definition.id,
  category: definition.category,
  name: definition.label,
}));

export function describeResult(result: ProcessingResult) {
  const { method, parameters: p } = result;
  if (method === "sequence")
    return `${result.steps?.length ?? 0}-step processing sequence${result.outputKind === "edge-map" ? " · edge map" : ""}`;
  if (method === "noise")
    return result.noise?.type === "salt-pepper"
      ? `Salt-and-pepper · ${result.noise.density * 100}%`
      : `Gaussian noise · σ ${result.noise?.standardDeviation}`;
  if (method === "gamma") return `γ ${result.gamma.toFixed(2)}`;
  if (method === "stretch")
    return `${Number((result.lowCutoff * 100).toFixed(4))}–${Number((result.highCutoff * 100).toFixed(4))}% input`;
  if (method === "equalize") return "Automatic equalization";
  if (method === "sobel") return "Sobel · grayscale edge map";
  const name = methods.find((item) => item.id === method)!.name;
  return `${name} · ${p.kernelSize}×${p.kernelSize}${p.sigma !== undefined ? ` · σ ${p.sigma.toFixed(2)}` : ""}${p.amount !== undefined ? ` · strength ${p.amount.toFixed(2)}` : ""}`;
}

export function describeOperation(operation: { method: Method; parameters: Parameters }) {
  const p = operation.parameters;
  if (operation.method === "gamma") return `γ ${p.gamma?.toFixed(2)}`;
  if (operation.method === "stretch")
    return `low ${Number(((p.lowCutoff ?? 0.1) * 100).toFixed(4))}%, high ${Number(((p.highCutoff ?? 0.9) * 100).toFixed(4))}%`;
  if (operation.method === "equalize") return "Automatic CDF mapping";
  if (operation.method === "sobel") return "3×3 · grayscale edge map";
  return `${p.kernelSize}×${p.kernelSize}${p.sigma !== undefined ? `, σ ${p.sigma}` : ""}${p.amount !== undefined ? `, strength ${p.amount}` : ""}`;
}
