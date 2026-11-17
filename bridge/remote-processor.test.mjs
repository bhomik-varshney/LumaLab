import { test } from "node:test";
import assert from "node:assert/strict";
import { remoteProcessor } from "./remote-processor.mjs";

const env = {
  MATLAB_SERVICE_URL: "https://processor.example",
  MATLAB_SERVICE_TOKEN: "fixture-only-token-with-32-characters",
};
test("remote processor requires HTTPS, no embedded credentials/path, and a private token", () => {
  for (const url of [
    "http://processor.example",
    "https://user:password@processor.example",
    "https://processor.example/path",
    "https://processor.example?x=1",
    "bad",
  ])
    assert.throws(() => remoteProcessor({ ...env, MATLAB_SERVICE_URL: url }), /HTTPS origin/);
  assert.throws(
    () => remoteProcessor({ ...env, MATLAB_SERVICE_TOKEN: "" }),
    /private MATLAB_SERVICE_TOKEN/,
  );
});
test("remote health advertises only real registered operations and sanitizes private detail", async () => {
  const remote = remoteProcessor(env, async (url, init) => {
    assert.equal(url, "https://processor.example/api/matlab/health");
    assert.equal(init.headers.Authorization, `Bearer ${env.MATLAB_SERVICE_TOKEN}`);
    assert.equal(init.redirect, "error");
    return Response.json({
      status: "ready",
      processor: "MATLAB",
      detail: "private host path",
      operations: ["gamma", "invented"],
    });
  });
  assert.deepEqual(await remote("/api/matlab/health"), {
    processor: "MATLAB",
    status: "ready",
    detail: "Remote MATLAB is ready.",
    operations: ["gamma"],
  });
});
test("remote errors, redirects, non-MATLAB payloads and credential echoes stay private", async () => {
  for (const response of [
    new Response(env.MATLAB_SERVICE_TOKEN, { status: 401 }),
    Response.json({ processor: "Python" }),
    Response.json({ processor: "MATLAB", detail: env.MATLAB_SERVICE_TOKEN }),
    new Response("private error"),
  ]) {
    const remote = remoteProcessor(env, async () => response);
    await assert.rejects(
      remote("/api/matlab/health"),
      (error) =>
        error.statusCode === 503 &&
        !error.message.includes(env.MATLAB_SERVICE_TOKEN) &&
        !error.message.includes("private error"),
    );
  }
});
test("remote processing forwards exact validated bytes and content type without browser credentials", async () => {
  const bytes = Buffer.from(
    JSON.stringify({ imageId: "fixture", method: "gamma", parameters: { gamma: 0.8 } }),
  );
  const remote = remoteProcessor(env, async (url, init) => {
    assert.equal(url, "https://processor.example/api/matlab/process");
    assert.equal(init.method, "POST");
    assert.equal(init.body, bytes);
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.equal(init.headers.Cookie, undefined);
    return Response.json({ processor: "MATLAB", method: "gamma", parameters: { gamma: 0.8 } });
  });
  assert.equal(
    (await remote("/api/matlab/process", { method: "POST", bytes, type: "application/json" }))
      .parameters.gamma,
    0.8,
  );
});
