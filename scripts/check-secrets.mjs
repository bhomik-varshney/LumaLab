import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const patterns = [ /gsk_[A-Za-z0-9]{20,}/, /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/, /AKIA[A-Z0-9]{16}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ ];
const secrets = [process.env.GROQ_API_KEY, process.env.MATLAB_SERVICE_TOKEN, process.env.MATLAB_API_TOKEN].filter((value) => value?.length >= 16);
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const failures = [];
for (const file of tracked) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example")) failures.push(file);
  const contents = await readFile(file);
  const text = contents.toString();
  if (patterns.some((pattern) => pattern.test(text)) || secrets.some((secret) => text.includes(secret))) failures.push(file);
}
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else {
      const text = (await readFile(path)).toString();
      if (patterns.some((pattern) => pattern.test(text)) || secrets.some((secret) => text.includes(secret)) || /https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/api\/matlab/.test(text)) failures.push(path);
    }
  }
}
await scan(".output/public");
if (failures.length) { console.error(`Secret/deployment scan failed in: ${[...new Set(failures)].join(", ")}. Values are not printed.`); process.exitCode = 1; }
else console.log("PASS: tracked files and public build contain no detected credentials; no tracked secret env files or loopback API URLs in public output. Ignored secret files were not read.");
