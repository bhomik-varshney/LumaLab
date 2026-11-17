// Requires a local licensed MATLAB executable and opens only local test ports.
// A private, temporary HTTPS fixture exercises the actual remote transport.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:https";
import { request as httpRequest } from "node:http";

const directory = await mkdtemp(join(tmpdir(), "lumalab-remote-test-"));
const token = "fixture-only-token-not-a-production-secret";
const port = Number(process.env.TEST_PRODUCTION_PORT || 11300);
const workerPort = port + 3,
  tlsPort = port + 4;
const children = [];
let tls;
const start = (script, env) => {
  const child = spawn(process.execPath, [script], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", GROQ_API_KEY: "", GROQ_MODEL: "", ...env },
  });
  // Do not print upstream request bodies, responses or credentials.
  child.stdout.resume();
  child.stderr.resume();
  children.push(child);
  return child;
};
const request = async (path, init) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const data = await response.json();
  assert.equal(response.status, 200, data.error || path);
  return data;
};
const post = (path, data) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
try {
  const cert = join(directory, "cert.pem"),
    key = join(directory, "key.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ],
    { stdio: "ignore" },
  );
  start("bridge/server.mjs", {
    MATLAB_MODE: "local",
    MATLAB_BRIDGE_PORT: String(workerPort),
    MATLAB_BRIDGE_HOST: "127.0.0.1",
    MATLAB_API_TOKEN: token,
    TMPDIR: directory,
  });
  let ready = false;
  for (let i = 0; i < 950; i++) {
    try {
      const state = await fetch(`http://127.0.0.1:${workerPort}/api/matlab/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      ready = (await state.json()).status === "ready";
    } catch {
      /* Starting. */
    }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert(ready, "A licensed MATLAB worker must start; this test cannot pass without it.");
  assert.equal((await fetch(`http://127.0.0.1:${workerPort}/api/matlab/health`)).status, 401);
  tls = createServer({ cert: await readFile(cert), key: await readFile(key) }, (req, res) => {
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: workerPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${workerPort}` },
      },
      (incoming) => {
        res.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(503);
      res.end();
    });
    req.pipe(upstream);
  });
  await new Promise((done) => tls.listen(tlsPort, "127.0.0.1", done));
  start("scripts/production.mjs", {
    PORT: String(port),
    MATLAB_BRIDGE_PORT: String(port + 1),
    LUMALAB_SSR_PORT: String(port + 2),
    MATLAB_MODE: "remote",
    MATLAB_SERVICE_URL: `https://127.0.0.1:${tlsPort}`,
    MATLAB_SERVICE_TOKEN: token,
    NODE_EXTRA_CA_CERTS: cert,
    TMPDIR: directory,
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/api/matlab/health")).status === "ready") break;
    } catch {
      /* Starting. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  const health = await request("/api/matlab/health");
  assert.equal(health.status, "ready");
  assert.equal(health.operations.length, 8);
  const upload = await request("/api/matlab/images", {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: await readFile("src/assets/lumalab-sample.jpg"),
  });
  const operations = [
    { category: "intensity", method: "gamma", parameters: { gamma: 0.7 } },
    { category: "intensity", method: "equalize", parameters: {} },
    { category: "intensity", method: "stretch", parameters: { lowCutoff: 0.1, highCutoff: 0.9 } },
    { category: "spatial", method: "mean", parameters: { kernelSize: 3 } },
    { category: "spatial", method: "gaussian", parameters: { kernelSize: 5, sigma: 1 } },
    { category: "spatial", method: "median", parameters: { kernelSize: 3 } },
    { category: "spatial", method: "unsharp", parameters: { kernelSize: 5, sigma: 1, amount: 1 } },
    { category: "spatial", method: "sobel", parameters: {} },
  ];
  for (const operation of operations) {
    const result = await post("/api/matlab/process", { imageId: upload.imageId, ...operation });
    assert.equal(result.processor, "MATLAB");
    assert.equal(result.method, operation.method);
    assert.equal(result.histograms.enhanced.length, 256);
    assert(result.url.startsWith("data:image/png;base64,"));
  }
  const roi = { x: 28, y: 117, width: 1285, height: 665 };
  const region = await post("/api/matlab/process", {
    imageId: upload.imageId,
    ...operations[0],
    roi,
  });
  assert.deepEqual(region.roi, roi);
  assert(region.roiUrl);
  const sequence = await post("/api/matlab/process", {
    imageId: upload.imageId,
    steps: [operations[0], operations[5]],
    roi,
  });
  assert.equal(sequence.steps.length, 2);
  const progress = await request(`/api/matlab/progress/${sequence.runId}`);
  assert.equal(progress.state, "complete");
  assert.equal(progress.completedSteps, 2);
  const noise = await post("/api/matlab/process", {
    imageId: upload.imageId,
    noise: { type: "salt-pepper", seed: 42, density: 0.1 },
  });
  assert(noise.noisyImageId);
  const filtered = await post("/api/matlab/process", {
    imageId: noise.noisyImageId,
    ...operations[5],
  });
  assert.equal(filtered.original.mean, noise.enhanced.mean);
  const continued = await request("/api/matlab/inputs", {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: Buffer.from(region.url.split(",")[1], "base64"),
  });
  assert.equal(continued.original.width, upload.original.width);
  const oversized = await fetch(`http://127.0.0.1:${port}/api/matlab/images`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  assert.equal(oversized.status, 413);
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${port}/api/matlab/images`, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: "invalid",
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${port}/api/matlab/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: upload.imageId,
          method: "median",
          parameters: { kernelSize: 4 },
        }),
      })
    ).status,
    400,
  );
  console.log(
    "PASS: real local MATLAB through production gateway -> authenticated HTTPS fixture -> licensed bridge: upload, all 8 methods, ROI, sequence/progress, noise/filtering, continued inputs, type/parameter rejection. This is not a Render/Linux verification.",
  );
} finally {
  for (const child of children.reverse()) {
    const stopped =
      child.exitCode !== null ? Promise.resolve() : new Promise((done) => child.once("exit", done));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    await stopped;
    clearTimeout(timer);
  }
  if (tls) {
    tls.closeAllConnections();
    await new Promise((done) => tls.close(done));
  }
  await rm(directory, { recursive: true, force: true });
}
