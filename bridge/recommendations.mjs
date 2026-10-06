import { operationRegistry, validateOperation } from "../shared/operations.mjs";
export function validateRecommendation(
  value,
  context,
  availableIds = operationRegistry.operations.map((item) => item.id),
) {
  const invalid = (message) => {
    throw new Error(message);
  };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["type", "title", "reason", "input", "steps"].includes(key))
  )
    invalid("The suggested sequence has an invalid format. Ask for another suggestion.");
  if (value.type !== "sequence_recommendation" || !["original", "noisy"].includes(value.input))
    invalid("The suggestion must identify a supported sequence and its input.");
  for (const key of ["title", "reason"])
    if (
      typeof value[key] !== "string" ||
      !value[key].trim() ||
      value[key].length > (key === "title" ? 100 : 600)
    )
      invalid("The sequence title or reason is missing or too long.");
  if (
    !Array.isArray(value.steps) ||
    !value.steps.length ||
    value.steps.length > operationRegistry.maxSequenceSteps
  )
    invalid("A suggested sequence must have between one and six steps.");
  if (!availableIds.length)
    invalid("MATLAB is not ready. Reconnect it and request a new suggestion.");
  if (value.input === "original" && !context.measurements.original && !context.measurements.clean)
    invalid("Load a clean original before using this sequence.");
  if (value.input === "noisy") {
    if (
      (context.mode !== "noise" && context.sequenceInput !== "noisy") ||
      !context.noise ||
      !context.measurements.noisy
    )
      invalid("This sequence needs an existing noisy image. Generate noise first.");
    if (
      context.selectedNoise &&
      (context.selectedNoise.type !== context.noise.type ||
        context.selectedNoise.seed !== context.noise.seed ||
        (context.noise.type === "salt-pepper"
          ? context.selectedNoise.density !== context.noise.density
          : context.selectedNoise.standardDeviation !== context.noise.standardDeviation))
    )
      invalid("Noise settings changed. Generate the intended noisy image and ask again.");
  }
  const steps = value.steps.map((step, index) => {
    try {
      if (
        !step ||
        typeof step !== "object" ||
        Array.isArray(step) ||
        Object.keys(step).some((key) => !["operation", "parameters", "explanation"].includes(key))
      )
        invalid("Invalid step format.");
      if (
        typeof step.explanation !== "string" ||
        !step.explanation.trim() ||
        step.explanation.length > 400
      )
        invalid("A short step explanation is required.");
      return {
        ...validateOperation(
          { method: step.operation, parameters: step.parameters },
          { strict: true, availableIds },
        ),
        explanation: step.explanation.trim(),
      };
    } catch (error) {
      invalid(`Step ${index + 1} cannot be used: ${error.message}`);
    }
  });
  return {
    type: value.type,
    title: value.title.trim(),
    reason: value.reason.trim(),
    input: value.input,
    steps,
  };
}
export function parseLearningAnswer(answer, context, availableIds, truncated = false) {
  let parsed;
  const source = answer
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "");
  try {
    parsed = JSON.parse(source);
  } catch {
    if (
      source.startsWith("{") ||
      source.startsWith("[") ||
      /"sequence_recommendation"|"recommendation"\s*:/.test(source)
    )
      return {
        explanation:
          "The assistant returned an unreadable structured response. Ask again for a concise explanation or sequence.",
        recommendation: null,
        recommendationIssue: "No executable sequence was returned.",
      };
    return { explanation: answer.trim(), recommendation: null }; // Explanatory text remains readable.
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.explanation !== "string" ||
    !parsed.explanation.trim() ||
    parsed.explanation.length > 8000
  )
    throw Object.assign(new Error("Groq returned an invalid explanation. Retry."), {
      statusCode: 502,
    });
  const output = { explanation: parsed.explanation.trim(), recommendation: null };
  if (parsed.recommendation != null) {
    try {
      if (truncated)
        throw new Error("The response reached its length limit. Ask for a shorter sequence.");
      output.recommendation = validateRecommendation(parsed.recommendation, context, availableIds);
    } catch (error) {
      output.recommendationIssue = error.message;
    }
  }
  return output;
}
