import { operationRegistry, validateOperation } from "../shared/operations.mjs";
const invalid = (message) => {
  throw Object.assign(new Error(message), { statusCode: 400 });
};
export const processingOptions = validateOperation;

export function sequenceOptions(input, validation = {}) {
  if (
    !Array.isArray(input.steps) ||
    input.steps.length < 1 ||
    input.steps.length > operationRegistry.maxSequenceSteps
  )
    invalid("Add between 1 and 6 operations to the processing sequence.");
  if (["category", "method", "parameters"].some((key) => input[key] !== undefined))
    invalid("Send either a single operation or a sequence of steps.");
  const steps = input.steps.map((step, index) => {
    try {
      if (!step || typeof step !== "object" || Array.isArray(step))
        invalid("Choose a method and its parameters.");
      return processingOptions(step, validation);
    } catch (error) {
      invalid(`Step ${index + 1} failed validation: ${error.message}`);
    }
  });
  if (
    input.runId !== undefined &&
    (typeof input.runId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.runId))
  )
    invalid("Use a valid sequence run ID.");
  return { steps, ...(input.runId ? { runId: input.runId } : {}) };
}
