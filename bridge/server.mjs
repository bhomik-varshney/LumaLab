import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rename, rm, readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = await mkdtemp(join(tmpdir(), "lumalab-"));
const port = Number(process.env.MATLAB_BRIDGE_PORT || 3001);
const maxBytes = 10 * 1024 * 1024;
const images = new Map();
let worker;
let status = "offline";
let detail = "Starting MATLAB…";
let version;
let toolbox = false;
let starting;
let pending = 0;
let closing = false;
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const quoteMatlab = (value) => `'${value.replaceAll("'", "''")}'`;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

async function executable() {
  if (process.env.MATLAB_BIN) return process.env.MATLAB_BIN;
  for (const directory of (process.env.PATH || "").split(":")) {
    const candidate = join(directory, "matlab");
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* Continue discovery. */
    }
  }
  if (process.platform === "darwin") {
    const apps = (await readdir("/Applications"))
      .filter((name) => /^MATLAB.*\.app$/.test(name))
      .sort()
      .reverse();
    for (const app of apps) {
      const candidate = join("/Applications", app, "bin", "matlab");
      try {
        await access(candidate);
        return candidate;
      } catch {
        /* Continue discovery. */
      }
    }
  }
  throw fail(
    "MATLAB was not found. Set MATLAB_BIN to your MATLAB executable, then restart npm run backend.",
    503,
  );
}

async function startWorker() {
  if (closing || status === "ready") return;
  if (starting) return starting;
  starting = (async () => {
    status = "starting";
    detail = "Starting MATLAB and checking optional Image Processing Toolbox…";
    await rm(join(workDir, "ready.json"), { force: true });
    try {
      const bin = await executable();
      const expression = `addpath(${quoteMatlab(join(root, "matlab"))}); lumalab_worker(${quoteMatlab(workDir)})`;
      const child = spawn(bin, ["-batch", expression], { stdio: ["ignore", "pipe", "pipe"] });
      worker = child;
      let log = "";
      const capture = (chunk) => {
        log = (log + chunk.toString()).slice(-4000);
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      child.on("error", (error) => {
        if (worker !== child) return;
        status = "offline";
        detail = `Cannot launch MATLAB: ${error.message}. Check MATLAB_BIN and restart the backend.`;
      });
      child.on("exit", (code) => {
        if (worker !== child || closing) return;
        status = "offline";
        detail = `MATLAB exited (${code}). Check its activation and the MATLAB error below; restart the backend. ${log.trim()}`;
        console.error(detail);
      });
      const deadline = Date.now() + 90000;
      while (status === "starting" && Date.now() < deadline && !closing) {
        try {
          const ready = JSON.parse(await readFile(join(workDir, "ready.json"), "utf8"));
          version = ready.version;
          toolbox = ready.toolbox;
          status = "ready";
          detail = `MATLAB ${version} ready · ${toolbox ? "Image Processing Toolbox installed" : "base MATLAB algorithms (Image Processing Toolbox not installed)"}`;
          console.log(detail);
          return;
        } catch {
          await delay(200);
        }
      }
      if (status === "starting") {
        status = "offline";
        detail =
          'MATLAB startup timed out. Run matlab -batch "disp(version)" to check activation, then restart the backend.';
        child.kill("SIGTERM");
      }
    } catch (error) {
      status = "offline";
      detail = error.message;
    }
  })().finally(() => {
    starting = undefined;
  });
  return starting;
}

async function body(request, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit)
      throw fail(
        `Upload is too large. Maximum file size is ${limit === maxBytes ? "10 MB" : "4 KB"}.`,
        413,
      );
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function processImage(imageId, method, gamma) {
  if (status !== "ready") throw fail(detail, 503);
  const image = images.get(imageId);
  if (!image) throw fail("Image expired or was not uploaded. Upload it again.", 404);
  if (!["gamma", "equalize", "stretch"].includes(method))
    throw fail("Choose gamma, equalize, or stretch.");
  if (typeof gamma !== "number" || !Number.isFinite(gamma) || gamma <= 0)
    throw fail("Gamma must be a finite positive number.");
  if (pending >= 8) throw fail("MATLAB is busy. Wait for processing to finish and retry.", 429);
  image.usedAt = Date.now();
  const id = randomUUID();
  const requestPath = join(workDir, `${id}.request.json`);
  const responsePath = join(workDir, `${id}.response.json`);
  const outputPath = join(workDir, `${id}.png`);
  const originalPath = join(workDir, `${id}.original.png`);
  pending += 1;
  try {
    await writeFile(
      `${requestPath}.tmp`,
      JSON.stringify({ inputPath: image.path, outputPath, originalPath, method, gamma }),
    );
    await rename(`${requestPath}.tmp`, requestPath);
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (status !== "ready") throw fail(detail, 503);
      let raw;
      try {
        raw = await readFile(responsePath, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await delay(100);
        continue;
      }
      const payload = JSON.parse(raw);
      if (!payload.ok) throw fail(`MATLAB could not process this image: ${payload.error}`, 422);
      const [output, original] = await Promise.all([readFile(outputPath), readFile(originalPath)]);
      return {
        ...payload.result,
        imageId,
        url: `data:image/png;base64,${output.toString("base64")}`,
        originalUrl: `data:image/png;base64,${original.toString("base64")}`,
      };
    }
    status = "offline";
    detail = "MATLAB processing timed out. Restart the backend and upload a smaller image.";
    worker?.kill("SIGTERM");
    throw fail(detail, 504);
  } finally {
    pending -= 1;
    await Promise.all(
      [requestPath, `${requestPath}.tmp`, responsePath, outputPath, originalPath].map((path) =>
        rm(path, { force: true }),
      ),
    );
  }
}

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  const send = (code, value) => {
    response.writeHead(code);
    response.end(JSON.stringify(value));
  };
  try {
    if (request.method === "GET" && request.url === "/api/matlab/health") {
      send(200, { status, detail, version, toolbox, processor: "MATLAB" });
    } else if (request.method === "POST" && request.url === "/api/matlab/images") {
      if (status !== "ready") throw fail(detail, 503);
      const type = request.headers["content-type"];
      if (!["image/png", "image/jpeg"].includes(type))
        throw fail("Only PNG and JPEG uploads are supported.", 415);
      const bytes = await body(request, maxBytes);
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!(type === "image/png" ? png : jpeg))
        throw fail("File contents do not match a valid PNG or JPEG image.", 415);
      if (images.size >= 32)
        throw fail(
          "Upload limit reached. Restart the backend or wait for old images to expire.",
          429,
        );
      const imageId = randomUUID();
      const path = join(workDir, `${imageId}${png ? ".png" : ".jpg"}`);
      await writeFile(path, bytes);
      images.set(imageId, { path, usedAt: Date.now() });
      try {
        send(200, await processImage(imageId, "gamma", 1));
      } catch (error) {
        images.delete(imageId);
        await rm(path, { force: true });
        throw error;
      }
    } else if (request.method === "POST" && request.url === "/api/matlab/process") {
      if (request.headers["content-type"] !== "application/json")
        throw fail("Use application/json.", 415);
      let input;
      try {
        input = JSON.parse((await body(request, 4096)).toString());
      } catch (error) {
        if (error.statusCode) throw error;
        throw fail("Invalid JSON request.");
      }
      if (!input || typeof input.imageId !== "string")
        throw fail("A valid uploaded imageId is required.");
      send(200, await processImage(input.imageId, input.method, input.gamma));
    } else send(404, { error: "Unknown API route." });
  } catch (error) {
    send(error.statusCode || 500, {
      error: error.statusCode
        ? error.message
        : "Bridge failure. Check the backend terminal and retry.",
    });
    if (!error.statusCode) console.error(error);
  }
});

const expiry = setInterval(() => {
  if (pending) return;
  for (const [id, image] of images) {
    if (Date.now() - image.usedAt > 30 * 60 * 1000) {
      images.delete(id);
      void rm(image.path, { force: true });
    }
  }
}, 60000);
expiry.unref();
server.listen(port, "127.0.0.1", () => {
  console.log(`MATLAB bridge: http://127.0.0.1:${port} (local only)`);
  void startWorker();
});
server.on("error", (error) => {
  console.error(error.message);
  void shutdown(1);
});
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  clearInterval(expiry);
  server.close();
  if (worker && worker.exitCode === null) {
    const exited = new Promise((done) => worker.once("exit", done));
    worker.kill("SIGTERM");
    await Promise.race([exited, delay(3000)]);
    if (worker.exitCode === null) worker.kill("SIGKILL");
  }
  await rm(workDir, { recursive: true, force: true });
  process.exit(code);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
