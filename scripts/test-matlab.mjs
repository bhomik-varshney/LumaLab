import { spawn } from "node:child_process";
import { resolve } from "node:path";
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const samplePath = quote(resolve("src/assets/lumalab-sample.jpg"));
const expression = `addpath(${quote(resolve("matlab"))}); test_enhancement(${samplePath}); test_spatial_filters(${samplePath}); test_processing_sequence()`;
const child = spawn(process.env.MATLAB_BIN || "matlab", ["-batch", expression], {
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(`Cannot launch MATLAB: ${error.message}. Set MATLAB_BIN to its executable.`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
