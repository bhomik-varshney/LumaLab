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
