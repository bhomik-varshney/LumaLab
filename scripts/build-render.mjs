import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
  env: { ...process.env, NITRO_PRESET: "node-server" },
});
child.on("error", () => {
  console.error("Cannot start the production build.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
