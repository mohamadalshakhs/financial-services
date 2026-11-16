import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const outputDir = fileURLToPath(new URL("../../../generated-artifacts/", import.meta.url));
await mkdir(outputDir, { recursive: true });
const entries = ["guide.test.mjs", "usage.test.mjs", "financial-profiles.test.mjs"];
const outputs = [];
for (const entry of entries) {
  const output = fileURLToPath(new URL(`../../../generated-artifacts/${entry.replace(".mjs", ".cjs")}`, import.meta.url));
  await build({
    entryPoints: [fileURLToPath(new URL(`./${entry}`, import.meta.url))],
    outfile: output,
    platform: "node",
    format: "cjs",
    target: "node24",
    bundle: true,
    logLevel: "warning",
  });
  outputs.push(output);
}
const result = spawnSync(process.execPath, ["--test", ...outputs], {
  stdio: "inherit",
  env: { ...process.env, OPENROUTER_API_KEY: "offline-test-not-a-real-key" },
});
process.exit(result.status ?? 1);
