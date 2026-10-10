import test from "node:test";
import assert from "node:assert/strict";
import { learningInput } from "./learning-assistant.mjs";
import { validateRegion } from "../shared/region.mjs";
test("region boundary rejects small, fractional, negative, nonfinite and unknown data", () => {
  assert.equal(validateRegion(null), undefined);
  assert.deepEqual(validateRegion({ x: 0, y: 2, width: 8, height: 9 }), {
    x: 0,
    y: 2,
    width: 8,
    height: 9,
  });
  for (const roi of [
    { x: -1, y: 0, width: 8, height: 8 },
    { x: 0.5, y: 0, width: 8, height: 8 },
    { x: 0, y: 0, width: 7, height: 8 },
    { x: 0, y: 0, width: 8, height: Infinity },
    { x: 0, y: 0, width: 8, height: 8, url: "data:image/png;base64,x" },
  ])
    assert.throws(() => validateRegion(roi));
});

test("ROI and source stage are allowlisted metadata; image payloads cannot enter the tutor", () => {
  const roi = { x: 0, y: 3, width: 8, height: 10 };
  const request = {
    action: "result",
    question: "Explain the region",
    context: {
      mode: "studio",
      status: "ready",
      inputStage: "continued",
      roi,
      selected: null,
      sequence: [],
      resultSequence: [],
      resultOperation: null,
      noise: null,
      measurements: {},
    },
  };
  const input = learningInput(request);
  assert.deepEqual(input.context.roi, roi);
  assert.equal(input.context.inputStage, "continued");
  assert.throws(() =>
    learningInput({
      ...request,
      context: { ...request.context, roi: { ...roi, url: "data:image/png;base64,x" } },
    }),
  );
  assert.throws(() =>
    learningInput({
      ...request,
      context: { ...request.context, image: "data:image/png;base64,x" },
    }),
  );
  assert.throws(() =>
    learningInput({ ...request, context: { ...request.context, inputStage: "unknown" } }),
  );
});
