import type { ProcessingOptions } from "../src/lib/matlab-api";
export type ParameterRule = {
  label?: string;
  default: number;
  min: number | null;
  max: number | null;
  minExclusive?: boolean;
  integer?: boolean;
  odd?: boolean;
  uiMin?: number;
  uiMax?: number;
};
export const operationRegistry: {
  maxSequenceSteps: number;
  input: string;
  noiseRestrictions: string;
  noise: Record<string, { parameter: string; min: number; max: number; default: number }>;
  operations: {
    id: ProcessingOptions["method"];
    category: ProcessingOptions["category"];
    label: string;
    implementation: string;
    parameters: Record<string, ParameterRule>;
    constraints: { lower: string; upper: string; minGap: number }[];
  }[];
};
export function validateOperation(
  input: unknown,
  options?: { strict?: boolean; availableIds?: string[] },
): ProcessingOptions;
