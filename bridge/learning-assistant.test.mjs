import { test } from "node:test";
import assert from "node:assert/strict";
import { explainLearning, learningInput } from "./learning-assistant.mjs";
import { noiseOptions } from "./noise.mjs";
const input = {
  action: "result",
  question: "Why median?",
  context: {
    mode: "noise",
    status: "ready",
    selected: { category: "spatial", method: "median", parameters: { kernelSize: 5 } },
    sequence: [],
    resultSequence: [],
    resultOperation: { category: "spatial", method: "median", parameters: { kernelSize: 5 } },
    noise: { type: "salt-pepper", density: 0.1, seed: 42 },
    measurements: {
      clean: {
        width: 3,
        height: 2,
        channels: 3,
        imageClass: "uint8",
        mean: 80,
        deviation: 20,
        histogram: { pixels: 6, darkPixels: 1, brightPixels: 1 },
      },
    },
  },
};
const env = { GROQ_API_KEY: "test-secret-do-not-return", GROQ_MODEL: "provided/test-model" };
test("missing configuration and input validation never call provider", async () => {
  let called = false;
  const fetchImpl = () => {
    called = true;
  };
  for (const config of [{}, { GROQ_API_KEY: env.GROQ_API_KEY }, { GROQ_MODEL: env.GROQ_MODEL }])
    await assert.rejects(
      explainLearning(input, { env: config, fetchImpl }),
      (error) => error.statusCode === 503 && !error.message.includes(env.GROQ_API_KEY),
    );
  for (const invalid of [
    { ...input, context: { ...input.context, image: "data:image/png;base64,..." } },
    { ...input, question: "x".repeat(801) },
    { ...input, question: "gsk_never-send-credentials" },
    { ...input, action: "execute" },
    {
      ...input,
      context: {
        ...input.context,
        measurements: { clean: { ...input.context.measurements.clean, mean: Infinity } },
      },
    },
    {
      ...input,
      context: { ...input.context, selected: { method: "median", parameters: { kernelSize: 4 } } },
    },
  ])
    assert.throws(
      () => learningInput(invalid),
      (error) => error.statusCode === 400,
    );
  assert.equal(called, false);
});
test("configured path constructs only grounded metadata and respects supplied model", async () => {
  let sent;
  const output = await explainLearning(input, {
    env,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      assert.equal(init.headers.Authorization, `Bearer ${env.GROQ_API_KEY}`);
      sent = JSON.parse(init.body);
      return Response.json({
        choices: [
          { message: { content: "Median can suppress impulse noise." }, finish_reason: "stop" },
        ],
      });
    },
  });
  assert.equal(sent.model, env.GROQ_MODEL);
  assert.equal(sent.max_completion_tokens, 2400);
  assert.equal(sent.tools, undefined);
  assert.match(sent.messages[0].content, /never image pixels/);
  assert.deepEqual(JSON.parse(sent.messages[1].content).context.selected.parameters, {
    kernelSize: 5,
  });
  assert(!JSON.stringify(sent).includes("data:image"));
  assert(!JSON.stringify(output).includes(env.GROQ_API_KEY));
  assert.equal(output.truncated, false);
});
test("provider errors, malformed/oversized/secret output and network failures are safe", async () => {
  for (const status of [401, 403, 404, 429, 500])
    await assert.rejects(
      explainLearning(input, {
        env,
        fetchImpl: async () => new Response(env.GROQ_API_KEY, { status }),
      }),
      (error) => [429, 502].includes(error.statusCode) && !error.message.includes(env.GROQ_API_KEY),
    );
  for (const response of [
    Response.json({}),
    new Response("bad json"),
    Response.json({ choices: [{ message: { content: env.GROQ_API_KEY } }] }),
    new Response("x".repeat(65537)),
  ])
    await assert.rejects(
      explainLearning(input, { env, fetchImpl: async () => response }),
      (error) => error.statusCode === 502 && !error.message.includes(env.GROQ_API_KEY),
    );
  await assert.rejects(
    explainLearning(input, {
      env,
      fetchImpl: async () => {
        throw new Error(env.GROQ_API_KEY);
      },
    }),
    (error) => error.statusCode === 502 && !error.message.includes(env.GROQ_API_KEY),
  );
});
test("request timeout aborts provider and returns an actionable safe error", async () => {
  await assert.rejects(
    explainLearning(input, {
      env,
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("private network details"))),
        ),
    }),
    (error) => error.statusCode === 504 && /timed out/.test(error.message),
  );
});
test("noise validation rejects unsafe strengths, seeds and mixed sequence operations", () => {
  for (const noise of [
    { type: "salt-pepper", density: 0.31, seed: 42 },
    { type: "gaussian", standardDeviation: -0.1, seed: 42 },
    { type: "gaussian", standardDeviation: 0.1, seed: 1.2 },
    { type: "gaussian", variance: 0.1, seed: 42 },
  ])
    assert.throws(
      () => noiseOptions({ noise }),
      (error) => error.statusCode === 400,
    );
  assert.throws(() => noiseOptions({ noise: input.context.noise, steps: [] }));
});
