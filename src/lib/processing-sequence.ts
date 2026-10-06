import type { ProcessingOptions } from "./matlab-api";

import { operationRegistry } from "../../shared/operations.mjs";
export const MAX_SEQUENCE_STEPS = operationRegistry.maxSequenceSteps;
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

export type NoisySequenceInput = {
  imageId: string;
  cleanImageId: string;
  url: string;
  label: string;
  noise: import("./matlab-api").NoiseSettings;
  info: import("./matlab-api").ImageInfo;
  histogram: number[];
};
