import { useCallback, useState } from "react";
import type { Method, Parameters, ProcessingResult } from "./matlab-api";
import { describeOperation } from "./enhancement-methods";
export type Experiment = {
  id: string;
  at: number;
  source: string;
  result: ProcessingResult;
  noise?: ProcessingResult["noise"];
};
export const HISTORY_LIMIT = 12;
export const HISTORY_BYTES = 48 * 1024 * 1024;
export function operationTitle(operation: { method: Method; parameters: Parameters }) {
  const names = {
    gamma: "Gamma",
    equalize: "Equalization",
    stretch: "Stretch",
    mean: "Mean",
    gaussian: "Gaussian",
    median: "Median",
    unsharp: "Unsharp",
    sobel: "Sobel",
  };
  return `${names[operation.method]} · ${describeOperation(operation)}`;
}
export function experimentParameters(result: ProcessingResult) {
  if (result.steps?.length) return result.steps.map(operationTitle).join(" → ");
  const values = result.noise ?? result.parameters;
  const names: Record<string, string> = {
    gamma: "Gamma",
    lowCutoff: "Low cutoff",
    highCutoff: "High cutoff",
    kernelSize: "Kernel size",
    sigma: "Sigma",
    amount: "Strength",
    type: "Noise",
    density: "Density",
    seed: "Seed",
    standardDeviation: "Standard deviation",
  };
  return (
    Object.entries(values)
      .map(([key, value]) => `${names[key] ?? key}: ${value}`)
      .join(" · ") || "Automatic mapping"
  );
}
export function experimentTitle(result: ProcessingResult) {
  if (result.method === "noise")
    return `${result.noise?.type === "gaussian" ? "Gaussian" : "Salt & pepper"} noise`;
  if (result.method === "sequence") return `Sequence · ${result.steps?.length ?? 0} steps`;
  return operationTitle({ method: result.method, parameters: result.parameters });
}
export function experimentScope(result: ProcessingResult) {
  const roi = result.roi;
  return roi ? `Region ${roi.width} × ${roi.height} at (${roi.x}, ${roi.y})` : "Full image";
}
export function comparisonKey(entry: Experiment) {
  return `${entry.result.imageId}:${JSON.stringify(entry.result.roi ?? null)}`;
}
export function boundedHistory(entries: Experiment[]) {
  const kept: Experiment[] = [];
  const urls = new Set<string>();
  let bytes = 0;
  for (const entry of entries.slice(0, HISTORY_LIMIT)) {
    const additions = [
      ...new Set(
        [
          entry.result.url,
          entry.result.originalUrl,
          entry.result.roiUrl,
          entry.result.roiOriginalUrl,
        ].filter((url): url is string => !!url && !urls.has(url)),
      ),
    ];
    const size = additions.reduce((sum, url) => sum + url.length * 2, 0);
    if (bytes + size > HISTORY_BYTES) continue;
    additions.forEach((url) => urls.add(url));
    bytes += size;
    kept.push(entry);
  }
  return kept;
}
export function useExperiments() {
  const [history, setHistory] = useState<Experiment[]>([]);
  const record = useCallback(
    (result: ProcessingResult, source: string, noise?: ProcessingResult["noise"]) => {
      const entry: Experiment = {
        id: crypto.randomUUID(),
        at: Date.now(),
        source,
        result: structuredClone(result),
        ...(noise ? { noise: structuredClone(noise) } : {}),
      };
      setHistory((previous) => boundedHistory([entry, ...previous]));
      return entry;
    },
    [],
  );
  return { history, setHistory, record };
}
export function saveExperiment(entry: Experiment) {
  const link = document.createElement("a");
  link.href = entry.result.url;
  link.download = `${entry.source.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120)}-${entry.result.method}${entry.result.roi ? "-region" : ""}.png`;
  link.click();
}
