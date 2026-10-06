export type Category = "intensity" | "spatial";
export type Method =
  "gamma" | "equalize" | "stretch" | "mean" | "gaussian" | "median" | "unsharp" | "sobel";
export type Parameters = {
  gamma?: number;
  lowCutoff?: number;
  highCutoff?: number;
  kernelSize?: number;
  sigma?: number;
  amount?: number;
};
export type ProcessingOptions = { category: Category; method: Method; parameters: Parameters };
export type ImageInfo = {
  width: number;
  height: number;
  channels: number;
  imageClass: string;
  mean: number;
  deviation: number;
};
export type ProcessingResult = {
  imageId: string;
  url: string;
  originalUrl: string;
  original: ImageInfo;
  enhanced: ImageInfo;
  histograms: { original: number[]; enhanced: number[] };
  processor: "MATLAB";
  category: Category | "sequence" | "noise";
  method: Method | "sequence" | "noise";
  parameters: Parameters;
  outputKind: "enhanced" | "edge-map";
  gamma: number;
  lowCutoff: number;
  highCutoff: number;
  steps?: (ProcessingOptions & { output: ImageInfo })[];
  runId?: string;
  noise?: NoiseSettings;
  noisyImageId?: string;
};
export type SequenceProgress = {
  state: "queued" | "processing" | "exporting" | "complete" | "error";
  step: number;
  total: number;
  completedSteps: number;
  method?: Method;
  error?: string;
};
export type Health = {
  status: "starting" | "ready" | "offline";
  detail: string;
  operations?: Method[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/matlab/${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Cannot reach the MATLAB bridge. Start npm run dev:full, then retry.");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "MATLAB bridge is unavailable. Start npm run dev:full and check the backend terminal.",
    );
  }
  if (!response.ok)
    throw new Error(data.error || "MATLAB processing failed. Check the backend terminal.");
  return data as T;
}

export const checkMatlab = () => request<Health>("health");
export const uploadImage = (image: Blob, signal: AbortSignal) =>
  request<ProcessingResult>("images", {
    method: "POST",
    headers: { "Content-Type": image.type },
    body: image,
    signal,
  });
export const enhanceImage = (imageId: string, options: ProcessingOptions, signal: AbortSignal) =>
  request<ProcessingResult>("process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId, ...options }),
    signal,
  });
export const runSequence = (
  imageId: string,
  steps: ProcessingOptions[],
  runId: string,
  signal: AbortSignal,
) =>
  request<ProcessingResult>("process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId, steps, runId }),
    signal,
  });
export const checkSequenceProgress = (runId: string, signal: AbortSignal) =>
  request<SequenceProgress>(`progress/${runId}`, { signal });

export type NoiseSettings =
  | { type: "salt-pepper"; density: number; seed: number }
  | { type: "gaussian"; standardDeviation: number; seed: number };
export const addNoise = (imageId: string, noise: NoiseSettings, signal: AbortSignal) =>
  request<ProcessingResult>("process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId, noise }),
    signal,
  });
