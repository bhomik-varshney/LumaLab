import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";

const port = Number(process.env.TEST_PRODUCTION_PORT || 11000);
const origin = `http://127.0.0.1:${port}`;
// This smoke test deliberately disables MATLAB and provider credentials. It makes
// no external calls and never loads bridge/.env in production.
const child = spawn(process.execPath, ["scripts/production.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    MATLAB_BRIDGE_PORT: String(port + 1),
    LUMALAB_SSR_PORT: String(port + 2),
    MATLAB_MODE: "disabled",
    GROQ_API_KEY: "",
    GROQ_MODEL: "",
  },
});
let log = "";
child.stdout.on("data", (chunk) => {
  log += chunk;
});
child.stderr.on("data", (chunk) => {
  log += chunk;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Production command exited before readiness.");
    try {
      ready = (await fetch(`${origin}/healthz`)).ok;
    } catch {
      /* Startup. */
    }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert(ready, "Production server became ready");
  const health = await fetch(`${origin}/healthz`);
  assert.deepEqual(await health.json(), { status: "ready" });
  const matlab = await fetch(`${origin}/api/matlab/health`);
  const state = await matlab.json();
  assert.equal(state.status, "offline");
  assert.deepEqual(state.operations, []);
  assert.match(state.detail, /unavailable/);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /LumaLab/);
  const assets = await readdir(".output/public/assets");
  for (const extension of [".js", ".css", ".jpg"]) {
    const asset = await fetch(
      `${origin}/assets/${assets.find((file) => file.endsWith(extension))}`,
    );
    assert.equal(asset.status, 200, `${extension} asset`);
  }
  const missing = await fetch(`${origin}/route-that-does-not-exist`);
  assert.equal(missing.status, 404);
  assert.equal((await fetch(`${origin}/api/unknown`)).status, 404);
  const upload = await fetch(`${origin}/api/matlab/images`, {
    method: "POST",
    headers: { "Content-Type": "image/png", Origin: origin },
    body: Buffer.from("not an image"),
  });
  assert.equal(upload.status, 503);
  assert.match((await upload.json()).error, /unavailable/);
  const blocked = await fetch(`${origin}/api/matlab/learning`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://other.example" },
    body: "{}",
  });
  assert.equal(blocked.status, 403);
  const learning = await fetch(`${origin}/api/matlab/learning`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      action: "result",
      context: {
        mode: "studio",
        status: "empty",
        selected: null,
        sequence: [],
        resultSequence: [],
        resultOperation: null,
        noise: null,
        measurements: {},
      },
    }),
  });
  assert.equal(learning.status, 503);
  assert.match((await learning.json()).error, /GROQ_API_KEY and GROQ_MODEL/);
  assert.equal(learning.headers.get("access-control-allow-origin"), null);
  const oversized = await fetch(`${origin}/api/matlab/learning`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "x".repeat(16385),
  });
  assert.equal(oversized.status, 413);
  console.log(
    "PASS: npm start /healthz, SSR root and assets, direct unknown-route 404, same-origin API, honest unavailable MATLAB, safe missing AI config, cross-origin rejection.",
  );
} catch (error) {
  console.error(error.message);
  console.error("Production startup log (credentials disabled):", log);
  process.exitCode = 1;
} finally {
  const stopped =
    child.exitCode !== null ? Promise.resolve() : new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  await stopped;
  clearTimeout(timer);
}
