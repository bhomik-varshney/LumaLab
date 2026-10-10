import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8080/api/matlab";
async function post(path, body, type = "application/json", status = 200) {
  const response = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "Content-Type": type },
    body: type === "application/json" ? JSON.stringify(body) : body,
  });
  const data = await response.json();
  assert.equal(response.status, status, data.error);
  return data;
}
function pngDigest(url) {
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
const input = await post("images", await readFile("src/assets/lumalab-sample.jpg"), "image/jpeg");
const roi = { x: 0, y: 3, width: 8, height: 10 };
let result;
for (const operation of [
  { method: "gamma", parameters: { gamma: 0.65 } },
  { method: "gaussian", parameters: { kernelSize: 15, sigma: 1 } },
  { method: "sobel", parameters: {} },
  {
    steps: [
      { method: "gamma", parameters: { gamma: 0.7 } },
      { method: "median", parameters: { kernelSize: 3 } },
    ],
  },
]) {
  result = await post("process", { imageId: input.imageId, roi, ...operation });
  assert.equal(result.processor, "MATLAB");
  assert.deepEqual(result.roi, roi);
  assert.equal(pngDigest(result.originalUrl), pngDigest(input.originalUrl));
  assert.equal(result.enhanced.width, input.original.width);
  assert.equal(result.enhanced.height, input.original.height);
  assert.equal(result.roiAnalysis.enhanced.width, 8);
  assert.equal(result.roiAnalysis.enhanced.height, 10);
  assert.equal(
    result.roiAnalysis.histograms.enhanced.reduce((a, b) => a + b, 0),
    80,
  );
  const region = Buffer.from(result.roiUrl.split(",")[1], "base64");
  assert.equal(region.readUInt32BE(16), 8);
  assert.equal(region.readUInt32BE(20), 10);
  if (operation.method === "sobel") {
    assert.equal(result.outputKind, "roi-composite");
    assert.equal(result.enhanced.channels, 3);
  }
  if (operation.steps) assert.equal(result.steps.length, 2);
}
const continued = await post(
  "inputs",
  Buffer.from(result.url.split(",")[1], "base64"),
  "image/png",
);
assert.notEqual(continued.imageId, input.imageId);
assert.equal(pngDigest(continued.originalUrl), pngDigest(result.url));
const next = await post("process", {
  imageId: continued.imageId,
  method: "gamma",
  parameters: { gamma: 1.2 },
});
assert.equal(pngDigest(next.originalUrl), pngDigest(result.url));
for (const invalid of [
  { ...roi, width: 7 },
  { ...roi, x: 0.5 },
  { ...roi, x: -1 },
  { ...roi, image: "data:image/png;base64,x" },
]) {
  const error = await post(
    "process",
    { imageId: input.imageId, method: "gamma", parameters: { gamma: 0.7 }, roi: invalid },
    "application/json",
    400,
  );
  assert(!error.url);
}
const outside = await post(
  "process",
  { imageId: input.imageId, method: "gamma", roi: { ...roi, x: input.original.width } },
  "application/json",
  422,
);
assert(!outside.url);
await post(
  "process",
  { imageId: input.imageId, noise: { type: "gaussian", standardDeviation: 0.05, seed: 42 }, roi },
  "application/json",
  400,
);
console.log(
  "PASS: live ROI gamma/Gaussian/Sobel/sequence, actual crop dimensions/statistics, original preservation, continued full-output input, and bridge/MATLAB invalid-region failures without output.",
);
