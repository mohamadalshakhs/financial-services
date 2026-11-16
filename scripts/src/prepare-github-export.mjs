// Export only current project files, never the existing Git history or local
// environment settings. Run from the workspace root before creating a new repo.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile, lstat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const destination = resolve(root, "generated-artifacts/github-export");
const candidates = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: root, encoding: "utf8",
}).split("\0").filter(Boolean);
const files = new Map();
const blocked = [];
const privatePaths = /^(?:\.agents|\.conversation|\.cache|\.local|generated-artifacts)(?:\/|$)/;
const credentialFiles = /(?:^|\/)(?:\.env(?:\..*)?|[^/]*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?)$/i;
const secretPattern = /(?:sk-or-v1-[a-zA-Z0-9]{20,}|sb_secret_[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s@]+@|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;

for (const path of candidates) {
  if (privatePaths.test(path) || credentialFiles.test(path)) continue;
  const absolute = resolve(root, path);
  let stat;
  try { stat = await lstat(absolute); } catch (error) {
    if (error.code === "ENOENT") continue; // Deleted tracked files must not return.
    throw error;
  }
  if (!stat.isFile()) throw new Error(`Refusing to export a non-regular file: ${path}`);
  let bytes = await readFile(absolute);
  if (path === ".replit") {
    // Replit's userenv tables can contain credentials. Omit ALL such tables and
    // values rather than attempting to detect secrets by their setting names.
    let inUserEnv = false;
    const safe = bytes.toString("utf8").split("\n").filter((line) => {
      const section = line.match(/^\s*\[\[?([^\]]+)\]\]?\s*$/);
      if (section) inUserEnv = /^userenv(?:\.|$)/.test(section[1]);
      return !inUserEnv;
    }).join("\n");
    bytes = Buffer.from(safe);
  }
  // Inspect without printing matched values. This is an additional guard, not
  // a guarantee that every possible credential format can be recognized.
  if (secretPattern.test(bytes.toString("utf8"))) blocked.push(path);
  files.set(path, { bytes, mode: stat.mode & 0o777 });
}

if (blocked.length) {
  throw new Error(`Export stopped: credential-like content in ${blocked.join(", ")}. No values were printed.`);
}
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const [path, { bytes, mode }] of files) {
  const output = resolve(destination, path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes, { mode });
}
execFileSync("git", ["init", "--initial-branch=main", "--quiet"], { cwd: destination });
execFileSync("git", ["add", "--all"], { cwd: destination });
console.log(`Prepared ${files.size} current files in generated-artifacts/github-export.`);
console.log("Replit environment settings and previous Git history were excluded. No remote was created or contacted.");
