import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Only this gateway is public. SSR and the API bridge remain on loopback.
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const port = Number(process.env.PORT || 10000);
const bridgePort = Number(process.env.MATLAB_BRIDGE_PORT || 3001);
const ssrPort = Number(process.env.LUMALAB_SSR_PORT || 3002);
if (
  [port, bridgePort, ssrPort].some(
    (value) => !Number.isInteger(value) || value < 1 || value > 65535,
  ) ||
  new Set([port, bridgePort, ssrPort]).size !== 3
)
  throw new Error("PORT, MATLAB_BRIDGE_PORT and LUMALAB_SSR_PORT must be different valid ports.");
await access(resolve(".output/server/index.mjs"));
const { default: build } = await import("../.output/nitro.json", { with: { type: "json" } });
if (build.preset !== "node-server")
  throw new Error("Run npm run build:render before npm start (Node server output required).");
const env = { ...process.env, NODE_ENV: "production" };
// The SSR process has no need for provider or processor credentials.
const ssrEnv = Object.fromEntries(
  Object.entries(env).filter(([key]) => !/^(GROQ_|MATLAB_)/.test(key)),
);
const children = [
  spawn(process.execPath, ["bridge/server.mjs"], {
    stdio: "inherit",
    env: {
      ...env,
      MATLAB_BRIDGE_PORT: String(bridgePort),
      MATLAB_BRIDGE_HOST: "127.0.0.1",
      MATLAB_API_TOKEN: "",
    },
  }),
  spawn(process.execPath, [".output/server/index.mjs"], {
    stdio: "inherit",
    env: { ...ssrEnv, NITRO_PORT: String(ssrPort), NITRO_HOST: "127.0.0.1" },
  }),
];
let stopping = false;
const json = (response, status, value) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
};
const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  const path = request.url?.split("?")[0];
  if (path === "/healthz" && request.method === "GET") {
    try {
      const results = await Promise.all(
        [bridgePort, ssrPort].map((internalPort) =>
          fetch(`http://127.0.0.1:${internalPort}/healthz`, {
            signal: AbortSignal.timeout(2000),
            redirect: "error",
          }),
        ),
      );
      for (const result of results) await result.body?.cancel();
      json(response, results.every((result) => result.ok) && !stopping ? 200 : 503, {
        status: results.every((result) => result.ok) && !stopping ? "ready" : "starting",
      });
    } catch {
      json(response, 503, { status: "starting" });
    }
    return;
  }
  const api = path === "/api" || path?.startsWith("/api/");
  if (api && !path.startsWith("/api/matlab/")) {
    json(response, 404, { error: "Unknown API route." });
    return;
  }
  if (api && request.headers.origin) {
    try {
      const origin = new URL(request.headers.origin);
      if (!["http:", "https:"].includes(origin.protocol) || origin.host !== request.headers.host)
        throw new Error();
    } catch {
      json(response, 403, { error: "Cross-origin API requests are not permitted." });
      return;
    }
  }
  const headers = { ...request.headers, host: `127.0.0.1:${api ? bridgePort : ssrPort}` };
  delete headers.authorization;
  delete headers.cookie;
  if (api) delete headers.origin;
  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: api ? bridgePort : ssrPort,
      path: request.url,
      method: request.method,
      headers,
    },
    (incoming) => {
      response.writeHead(incoming.statusCode || 502, incoming.headers);
      incoming.on("error", () => response.destroy());
      incoming.pipe(response);
    },
  );
  upstream.setTimeout(390000, () => upstream.destroy());
  upstream.on("error", () => {
    if (!response.headersSent)
      json(response, 503, { error: "Application service is unavailable. Retry shortly." });
    else response.destroy();
  });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => {
    if (!response.writableFinished) upstream.destroy();
  });
  request.pipe(upstream);
});
server.requestTimeout = 120000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 8000);
  timer.unref();
  Promise.all(
    children.map((child) =>
      child.exitCode !== null ? Promise.resolve() : new Promise((done) => child.once("exit", done)),
    ),
  ).then(() => {
    clearTimeout(timer);
    process.exit(code);
  });
}
for (const child of children) {
  child.on("error", () => {
    console.error("An application service failed to start.");
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
server.on("error", () => {
  console.error("Cannot bind the production port. Check PORT and internal port settings.");
  stop(1);
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
server.listen(port, "0.0.0.0", () => console.log(`LumaLab production listening on port ${port}`));
