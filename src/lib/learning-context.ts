import type { Region, ImageInfo, NoiseSettings, ProcessingOptions } from "./matlab-api";
export type Measurement = ImageInfo & {
  histogram: { pixels: number; darkPixels: number; brightPixels: number };
};
export type LearningContext = {
  mode: "studio" | "noise";
  roi?: Region | null;
  inputStage?: "uploaded" | "continued" | "restored";
  workflow?: "single" | "sequence";
  sequenceInput?: "original" | "noisy";
  resultInput?: "original" | "noisy";
  status: "empty" | "processing" | "ready" | "error" | "stale";
  selected: ProcessingOptions | null;
  sequence: ProcessingOptions[];
  resultSequence: ProcessingOptions[];
  resultOperation: ProcessingOptions | null;
  noise: NoiseSettings | null;
  selectedNoise?: NoiseSettings | null;
  measurements: Partial<
    Record<"original" | "result" | "clean" | "noisy" | "filtered", Measurement>
  >;
};
export function measuredContext(info: ImageInfo, histogram: number[]): Measurement {
  return {
    ...info,
    histogram: {
      pixels: histogram.reduce((a, b) => a + b, 0),
      darkPixels: histogram.slice(0, 32).reduce((a, b) => a + b, 0),
      brightPixels: histogram.slice(224).reduce((a, b) => a + b, 0),
    },
  };
}
export async function explainLearning(
  action: "result" | "sequence" | "next",
  question: string,
  context: LearningContext,
  signal: AbortSignal,
): Promise<LearningAnswer> {
  let response;
  try {
    response = await fetch("/api/matlab/learning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, question, context }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("Cannot reach the assistant backend. Start npm run dev:full and retry.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Assistant backend is unavailable. Check the backend and retry.");
  }
  if (!response.ok)
    throw new Error(payload.error || "The AI assistant is unavailable. Retry shortly.");
  if (typeof payload.explanation !== "string")
    throw new Error("The assistant returned an invalid response. Retry.");
  return payload;
}

export type SequenceRecommendation = {
  type: "sequence_recommendation";
  title: string;
  reason: string;
  input: "original" | "noisy";
  steps: (ProcessingOptions & { explanation: string })[];
};
export type LearningAnswer = {
  explanation: string;
  truncated: boolean;
  recommendation?: SequenceRecommendation | null;
  recommendationIssue?: string;
};
