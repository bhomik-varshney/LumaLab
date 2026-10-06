import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8080/api/matlab";
const post = async (path, input) => {
  const response = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  assert.equal(response.status, 200, data.error);
  return data;
};
const upload = async (bytes, type) => {
  const response = await fetch(`${base}/images`, {
    method: "POST",
    headers: { "Content-Type": type },
    body: bytes,
  });
  assert.equal(response.status, 200);
  return response.json();
};
function digest(url) {
  const bytes = Buffer.from(url.split(",")[1], "base64"),
    hash = createHash("sha256");
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset),
      name = bytes.subarray(offset + 4, offset + 8).toString();
    if (["IHDR", "PLTE", "IDAT", "tRNS"].includes(name))
      hash.update(bytes.subarray(offset + 4, offset + 8 + size));
    offset += size + 12;
  }
  return hash.digest("hex");
}
const rgb = await upload(await readFile("src/assets/lumalab-sample.jpg"), "image/jpeg");
const sobel = await post("process", { imageId: rgb.imageId, method: "sobel", parameters: {} });
const gray = await upload(Buffer.from(sobel.url.split(",")[1], "base64"), "image/png");
let noisy, filtered;
for (const clean of [rgb, gray])
  for (const noise of [
    { type: "salt-pepper", density: 0.12, seed: 42 },
    { type: "gaussian", standardDeviation: 0.08, seed: 42 },
  ]) {
    noisy = await post("process", { imageId: clean.imageId, noise });
    assert(noisy.noisyImageId);
    assert.equal(noisy.processor, "MATLAB");
    assert.deepEqual(noisy.noise, noise);
    assert.equal(digest(noisy.originalUrl), digest(clean.originalUrl));
    assert.notEqual(digest(noisy.url), digest(clean.url));
    const repeated = await post("process", { imageId: clean.imageId, noise });
    assert.equal(digest(repeated.url), digest(noisy.url));
    const regenerated = await post("process", {
      imageId: clean.imageId,
      noise: { ...noise, seed: 43 },
    });
    assert.notEqual(digest(regenerated.url), digest(noisy.url));
    const independent = await upload(Buffer.from(noisy.url.split(",")[1], "base64"), "image/png");
    for (const method of ["mean", "median"]) {
      const operation = { category: "spatial", method, parameters: { kernelSize: 5 } };
      filtered = await post("process", { imageId: noisy.noisyImageId, ...operation });
      const expected = await post("process", { imageId: independent.imageId, ...operation });
      assert.equal(digest(filtered.originalUrl), digest(noisy.url));
      assert.equal(digest(filtered.url), digest(expected.url));
      assert.deepEqual(filtered.histograms, expected.histograms);
      assert.deepEqual(filtered.enhanced, expected.enhanced);
      const fromClean = await post("process", { imageId: clean.imageId, ...operation });
      assert.notEqual(digest(filtered.url), digest(fromClean.url));
    }
    console.log(
      `PASS: ${clean.original.channels}-channel ${noise.type}, reproducible seed, regeneration, clean preservation, noisy-input mean/median, PNG/histogram/statistics.`,
    );
  }
for (const noise of [
  { type: "salt-pepper", density: 0.4, seed: 42 },
  { type: "gaussian", standardDeviation: 0.3, seed: 42 },
  { type: "gaussian", standardDeviation: 0.05, seed: -1 },
]) {
  const response = await fetch(`${base}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId: rgb.imageId, noise }),
  });
  assert.equal(response.status, 400);
  assert(!(await response.json()).url);
}
if (process.env.TEST_LIVE_GROQ === "1") {
  const measured = (info, bins) => ({
    ...info,
    histogram: {
      pixels: bins.reduce((a, b) => a + b, 0),
      darkPixels: bins.slice(0, 32).reduce((a, b) => a + b, 0),
      brightPixels: bins.slice(224).reduce((a, b) => a + b, 0),
    },
  });
  const response = await post("learning", {
    action: "result",
    question:
      "Explain why a median filter may help with impulse noise, without assuming image contents.",
    context: {
      mode: "noise",
      status: "ready",
      selected: { category: "spatial", method: "median", parameters: { kernelSize: 5 } },
      resultOperation: { category: "spatial", method: "median", parameters: { kernelSize: 5 } },
      sequence: [],
      resultSequence: [],
      noise: noisy.noise,
      measurements: {
        clean: measured(gray.original, gray.histograms.original),
        noisy: measured(noisy.enhanced, noisy.histograms.enhanced),
        filtered: measured(filtered.enhanced, filtered.histograms.enhanced),
      },
    },
  });
  assert.equal(response.generatedBy, "AI · Groq");
  assert(response.explanation.length > 20);
  console.log("PASS: live Groq explanation received through the metadata-only backend.");
}
