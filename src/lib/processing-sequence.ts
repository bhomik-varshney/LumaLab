import type { ProcessingOptions } from "./matlab-api";

export const MAX_SEQUENCE_STEPS = 6;
export type SequenceStep = ProcessingOptions & { id: string };
export type SequencePhase = "idle" | "running" | "success" | "error";
export const sequenceSignature = (steps: ProcessingOptions[]) =>
  JSON.stringify(
    steps.map((step) => ({
      category: step.category,
      method: step.method,
      parameters: Object.fromEntries(
        Object.entries(step.parameters).sort(([a], [b]) => a.localeCompare(b)),
      ),
    })),
  );
