import { test } from "node:test";
import assert from "node:assert/strict";
import { operationRegistry, validateOperation } from "../shared/operations.mjs";
import { processingOptions, sequenceOptions } from "./processing.mjs";
import { validateRecommendation, parseLearningAnswer } from "./recommendations.mjs";
import { explainLearning } from "./learning-assistant.mjs";
const context = {
  mode: "studio",
  status: "ready",
  selected: { category: "intensity", method: "gamma", parameters: { gamma: 1 } },
  sequence: [],
  resultSequence: [],
  noise: null,
  measurements: {
    original: {
      width: 2,
      height: 2,
      channels: 1,
      imageClass: "uint8",
      mean: 80,
      deviation: 20,
      histogram: { pixels: 4, darkPixels: 0, brightPixels: 0 },
    },
  },
};
const recommendation = {
  type: "sequence_recommendation",
  title: "Tone then smooth",
  reason: "Compare brightness and impulse suppression.",
  input: "original",
  steps: [
    {
      operation: "gamma",
      parameters: { gamma: 0.7 },
      explanation: "Brighten normalized midtones.",
    },
    {
      operation: "median",
      parameters: { kernelSize: 5 },
      explanation: "Suppress isolated impulses.",
    },
  ],
};
test("one registry powers defaults, processing validation, recommendations and capability context", async () => {
  for (const definition of operationRegistry.operations) {
    const options = processingOptions({ method: definition.id });
    assert.equal(options.category, definition.category);
    assert.deepEqual(
      options.parameters,
      Object.fromEntries(
        Object.entries(definition.parameters).map(([key, rule]) => [key, rule.default]),
      ),
    );
  }
  const result = validateRecommendation(recommendation, context);
  assert.deepEqual(
    result.steps.map(({ category, method, parameters }) => ({ category, method, parameters })),
    sequenceOptions({
      steps: recommendation.steps.map((step) => ({
        method: step.operation,
        parameters: step.parameters,
      })),
    }).steps,
  );
  let sent;
  const output = await explainLearning(
    { action: "next", context },
    {
      env: { GROQ_API_KEY: "test-only-secret", GROQ_MODEL: "given-model" },
      availableIds: ["gamma", "median"],
      fetchImpl: async (_url, init) => {
        sent = JSON.parse(init.body);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  explanation: "## What to try next\nTry **gamma** then median.",
                  recommendation,
                }),
              },
              finish_reason: "stop",
            },
          ],
        });
      },
    },
  );
  assert.deepEqual(
    JSON.parse(sent.messages[1].content).availableModules.operations,
    operationRegistry.operations.filter((item) => ["gamma", "median"].includes(item.id)),
  );
  assert.deepEqual(sent.response_format, { type: "json_object" });
  assert(output.recommendation);
  assert(!JSON.stringify(sent).includes("data:image"));
  assert(!JSON.stringify(output).includes("test-only-secret"));
});
test("unsupported IDs, missing/extra/nonfinite/out-of-range parameters and even kernels cannot execute", () => {
  for (const step of [
    { operation: "clahe", parameters: {} },
    { operation: "median", parameters: {} },
    { operation: "median", parameters: { kernelSize: 4 } },
    { operation: "median", parameters: { kernelSize: 17 } },
    { operation: "gaussian", parameters: { kernelSize: 5, sigma: 4 } },
    { operation: "unsharp", parameters: { kernelSize: 5, sigma: 1, amount: -1 } },
    { operation: "gamma", parameters: { gamma: Infinity } },
    { operation: "gamma", parameters: { gamma: 0.7, unsupported: 2 } },
    { operation: "stretch", parameters: { lowCutoff: 0.8, highCutoff: 0.2 } },
    { operation: "equalize" },
  ]) {
    const bad = { ...recommendation, steps: [{ explanation: "Try this.", ...step }] };
    assert.throws(() => validateRecommendation(bad, context));
    const parsed = parseLearningAnswer(
      JSON.stringify({ explanation: "General guidance.", recommendation: bad }),
      context,
      operationRegistry.operations.map((item) => item.id),
    );
    assert.equal(parsed.recommendation, null);
    assert.match(parsed.recommendationIssue, /Step 1/);
    assert.equal(parsed.explanation, "General guidance.");
  }
});
test("unavailable operations and unavailable/noisy/mismatched inputs block application", () => {
  assert.throws(() => validateRecommendation(recommendation, context, ["gamma"]), /Step 2/);
  assert.throws(() => validateRecommendation(recommendation, context, []), /MATLAB is not ready/);
  assert.throws(
    () => validateRecommendation({ ...recommendation, input: "noisy" }, context),
    /noisy image/,
  );
  const noise = { type: "salt-pepper", density: 0.1, seed: 42 };
  const noisy = {
    ...context,
    mode: "noise",
    noise,
    selectedNoise: noise,
    measurements: { clean: context.measurements.original, noisy: context.measurements.original },
  };
  assert.equal(validateRecommendation({ ...recommendation, input: "noisy" }, noisy).input, "noisy");
  assert.throws(
    () =>
      validateRecommendation(
        { ...recommendation, input: "noisy" },
        { ...noisy, selectedNoise: { ...noise, seed: 43 } },
      ),
    /settings changed/,
  );
});
test("malformed JSON, missing explanation and truncated sequences never expose executable output", () => {
  for (const text of [
    '{"explanation":',
    "[malformed",
    'Here is a suggestion: {"recommendation": invalid}',
  ]) {
    const value = parseLearningAnswer(text, context, []);
    assert.equal(value.recommendation, null);
    assert(!value.explanation.includes("{"));
  }
  assert.throws(
    () => parseLearningAnswer('{"recommendation":{}}', context, []),
    /invalid explanation/,
  );
  const truncated = parseLearningAnswer(
    JSON.stringify({ explanation: "General guidance.", recommendation }),
    context,
    operationRegistry.operations.map((item) => item.id),
    true,
  );
  assert.equal(truncated.recommendation, null);
  assert.match(truncated.recommendationIssue, /length limit/);
  assert.equal(parseLearningAnswer("A normal **explanation**.", context, []).recommendation, null);
});
test("ordinary execution validates availability and never substitutes a missing parameter for an AI step", () => {
  assert.throws(() => validateOperation({ method: "median", parameters: {} }, { strict: true }));
  assert.throws(
    () =>
      sequenceOptions(
        {
          steps: [
            { method: "gamma", parameters: { gamma: 1 } },
            { method: "median", parameters: { kernelSize: 5 } },
          ],
        },
        { availableIds: ["gamma"] },
      ),
    /Step 2/,
  );
});
