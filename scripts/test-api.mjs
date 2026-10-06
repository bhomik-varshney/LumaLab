import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8080/api/matlab";
const image = await readFile("src/assets/lumalab-sample.jpg");
const json = (input) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});
// imwrite adds an encoding timestamp; compare image chunks, excluding metadata.
function pngDigest(url) {
  const png = Buffer.from(url.split(",")[1], "base64");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const hash = createHash("sha256");
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset);
    const name = png.subarray(offset + 4, offset + 8).toString();
    if (["IHDR", "PLTE", "IDAT", "tRNS"].includes(name))
      hash.update(png.subarray(offset + 4, offset + 8 + size));
    offset += size + 12;
  }
  return hash.digest("hex");
}
let response = await fetch(`${base}/images`, {
  method: "POST",
  headers: { "Content-Type": "image/jpeg" },
  body: image,
});
assert.equal(response.status, 200);
const original = await response.json();
assert.equal(original.processor, "MATLAB");
assert.equal(pngDigest(original.url), pngDigest(original.originalUrl));
const pixels = original.original.width * original.original.height;
for (const [method, gamma] of [
  ["gamma", 0.6],
  ["gamma", 1],
  ["gamma", 1.8],
  ["equalize", 1],
  ["stretch", 1],
]) {
  response = await fetch(`${base}/process`, json({ imageId: original.imageId, method, gamma }));
  assert.equal(response.status, 200);
  const result = await response.json();
  for (const bins of [result.histograms.original, result.histograms.enhanced]) {
    assert.equal(bins.length, 256);
    assert.equal(
      bins.reduce((a, b) => a + b),
      pixels,
    );
  }
  const digest = pngDigest(result.url);
  assert(Number.isFinite(result.enhanced.mean) && Number.isFinite(result.enhanced.deviation));
  if (gamma === 0.6) assert(result.enhanced.mean > result.original.mean);
  if (gamma === 1.8) assert(result.enhanced.mean < result.original.mean);
  if (method === "gamma" && gamma === 1) assert.equal(digest, pngDigest(original.url));
  console.log(
    `${method} γ=${gamma}: ${result.original.width}×${result.original.height}, mean=${result.enhanced.mean.toFixed(2)}, deviation=${result.enhanced.deviation.toFixed(2)}`,
  );
}
for (const gamma of [0, -1, "bad"]) {
  response = await fetch(
    `${base}/process`,
    json({ imageId: original.imageId, method: "gamma", gamma }),
  );
  assert.equal(response.status, 400);
}
for (const [method, parameters] of [
  ["mean", { kernelSize: 3 }],
  ["mean", { kernelSize: 15 }],
  ["gaussian", { kernelSize: 5, sigma: 1 }],
  ["gaussian", { kernelSize: 13, sigma: 1.6 }],
  ["median", { kernelSize: 3 }],
  ["median", { kernelSize: 15 }],
  ["unsharp", { kernelSize: 5, sigma: 1, amount: 1 }],
  ["sobel", {}],
]) {
  const started = Date.now();
  response = await fetch(
    `${base}/process`,
    json({ imageId: original.imageId, category: "spatial", method, parameters }),
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.category, "spatial");
  assert.deepEqual(result.parameters, parameters);
  assert.equal(result.enhanced.width, original.original.width);
  assert.equal(result.enhanced.height, original.original.height);
  assert.equal(
    result.histograms.enhanced.reduce((sum, count) => sum + count, 0),
    pixels,
  );
  assert(Number.isFinite(result.enhanced.mean) && Number.isFinite(result.enhanced.deviation));
  if (method === "sobel") {
    assert.equal(result.outputKind, "edge-map");
    assert.equal(result.enhanced.channels, 1);
  }
  pngDigest(result.url);
  assert.equal(pngDigest(result.originalUrl), pngDigest(original.originalUrl));
  console.log(
    `${method}: real MATLAB ${result.enhanced.channels}-channel output, ${Date.now() - started} ms`,
  );
}
for (const input of [
  { category: "intensity", method: "mean", parameters: { kernelSize: 3 } },
  { category: "spatial", method: "mean", parameters: { kernelSize: 4 } },
  ...[2, 14, 16, 17, 3.5, "9", null].map((kernelSize) => ({
    category: "spatial",
    method: "median",
    parameters: { kernelSize },
  })),
  { category: "spatial", method: "gaussian", parameters: { sigma: 0 } },
  { category: "spatial", method: "gaussian", parameters: { sigma: 4 } },
  { category: "spatial", method: "unsharp", parameters: { amount: -1 } },
  { category: "spatial", method: "unsharp", parameters: { amount: 4 } },
  { category: "spatial", method: "sobel", parameters: { kernelSize: 3 } },
  { category: "spatial", method: "mean", parameters: [] },
]) {
  response = await fetch(`${base}/process`, json({ imageId: original.imageId, ...input }));
  assert.equal(response.status, 400);
  assert((await response.json()).error);
}
for (const [lowCutoff, highCutoff] of [
  [0, 1],
  [0.4, 0.6],
]) {
  response = await fetch(
    `${base}/process`,
    json({ imageId: original.imageId, method: "stretch", gamma: 1, lowCutoff, highCutoff }),
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.lowCutoff, lowCutoff);
  assert.equal(result.highCutoff, highCutoff);
  assert.equal(
    result.histograms.enhanced.reduce((sum, count) => sum + count, 0),
    pixels,
  );
  pngDigest(result.url);
}
for (const [lowCutoff, highCutoff] of [
  [0.7, 0.3],
  [0.5, 0.5],
  [-0.1, 0.9],
  [0.1, 1.1],
  ["bad", 1],
  [null, 1],
  [0.5, 0.50000001],
]) {
  response = await fetch(
    `${base}/process`,
    json({ imageId: original.imageId, method: "stretch", gamma: 1, lowCutoff, highCutoff }),
  );
  assert.equal(response.status, 400);
  assert((await response.json()).error.includes("Cutoffs"));
}
response = await fetch(`${base}/images`, {
  method: "POST",
  headers: { "Content-Type": "image/jpeg" },
  body: Buffer.from("invalid"),
});
assert.equal(response.status, 415);
response = await fetch(`${base}/images`, {
  method: "POST",
  headers: { "Content-Type": "image/jpeg" },
  body: Buffer.alloc(10 * 1024 * 1024 + 1),
});
assert.equal(response.status, 413);
response = await fetch(`${base}/process`, json({ imageId: "missing", method: "gamma", gamma: 1 }));
assert.equal(response.status, 404);
console.log(
  "PASS: frontend proxy → bridge → MATLAB, PNG output, gamma identity, histogram totals and input errors.",
);

const steps = [
  { category: "intensity", method: "gamma", parameters: { gamma: 0.7 } },
  { category: "spatial", method: "median", parameters: { kernelSize: 5 } },
  { category: "intensity", method: "stretch", parameters: { lowCutoff: 0.05, highCutoff: 0.95 } },
];
const runId = crypto.randomUUID();
let finished = false;
const running = fetch(`${base}/process`, json({ imageId: original.imageId, steps, runId })).finally(
  () => {
    finished = true;
  },
);
const observedSteps = new Set();
let checkedOverlap = false;
while (!finished) {
  await new Promise((resolve) => setTimeout(resolve, 120));
  const progressResponse = await fetch(`${base}/progress/${runId}`);
  if (progressResponse.ok) {
    const progress = await progressResponse.json();
    assert.equal(progress.total, 3);
    assert.equal(progress.processor, "MATLAB");
    if (progress.state === "processing") observedSteps.add(progress.step);
    if (!checkedOverlap && progress.state === "processing") {
      const duplicate = await fetch(
        `${base}/process`,
        json({ imageId: original.imageId, steps, runId: crypto.randomUUID() }),
      );
      assert.equal(duplicate.status, 409);
      checkedOverlap = true;
    }
  }
}
response = await running;
assert.equal(response.status, 200);
const sequence = await response.json();
assert.equal(sequence.processor, "MATLAB");
assert.equal(sequence.method, "sequence");
assert.equal(sequence.runId, runId);
assert.deepEqual(
  sequence.steps.map(({ category, method, parameters }) => ({ category, method, parameters })),
  steps,
);
assert.equal(pngDigest(sequence.originalUrl), pngDigest(original.originalUrl));
assert(checkedOverlap && observedSteps.size > 0);
const complete = await (await fetch(`${base}/progress/${runId}`)).json();
assert.equal(complete.state, "complete");
assert.equal(complete.completedSteps, 3);

// Independent composition through actual saved PNGs proves that each operation
// consumes the previous output, rather than repeatedly processing the original.
let currentId = original.imageId;
let composed;
for (let index = 0; index < steps.length; index++) {
  response = await fetch(`${base}/process`, json({ imageId: currentId, ...steps[index] }));
  assert.equal(response.status, 200);
  composed = await response.json();
  if (index < steps.length - 1) {
    response = await fetch(`${base}/images`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: Buffer.from(composed.url.split(",")[1], "base64"),
    });
    assert.equal(response.status, 200);
    currentId = (await response.json()).imageId;
  }
}
assert.equal(pngDigest(sequence.url), pngDigest(composed.url));
assert.deepEqual(sequence.histograms.enhanced, composed.histograms.enhanced);
assert.deepEqual(sequence.enhanced, composed.enhanced);
response = await fetch(
  `${base}/process`,
  json({ imageId: original.imageId, steps: [...steps].reverse() }),
);
assert.equal(response.status, 200);
assert.notEqual(pngDigest((await response.json()).url), pngDigest(sequence.url));
for (const invalidSteps of [
  [],
  Array(7).fill(steps[0]),
  [steps[0], { category: "spatial", method: "median", parameters: { kernelSize: 4 } }],
  [steps[0], { method: "unknown", parameters: {} }],
]) {
  response = await fetch(
    `${base}/process`,
    json({ imageId: original.imageId, steps: invalidSteps }),
  );
  assert.equal(response.status, 400);
  const failure = await response.json();
  assert(failure.error);
  assert.equal(failure.url, undefined);
  if (invalidSteps.length === 2) assert(failure.error.includes("Step 2"));
}
console.log(
  `PASS: real MATLAB gamma → median → stretch sequence, previous-output composition, actual final statistics, progress steps ${[...observedSteps].join(",")}, overlap rejection, order changes, and indexed validation failures without partial output.`,
);
