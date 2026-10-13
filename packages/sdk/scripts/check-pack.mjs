#!/usr/bin/env bun
/**
 * Fail if the tarball a release would upload carries anything the package does not
 * intend to ship.
 *
 * `files` in package.json is the allowlist; this reads the allowlist's output. It runs
 * `npm pack --dry-run --json` and inspects the file list npm reports for the real
 * tarball, which also means `prepack` has run, so what is inspected was built now
 * rather than left in `dist/` by somebody else's run.
 *
 *   node scripts/check-pack.mjs    (or: bun run check:pack)
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8"));

/** Everything the tarball may contain, and nothing else. */
const ALLOWED = [
  { what: "the built package (dist/)", test: (path) => path.startsWith("dist/") },
  { what: "the page npm shows", test: (path) => path === "README.md" },
  { what: "the licence", test: (path) => path === "LICENSE" },
  { what: "the manifest", test: (path) => path === "package.json" },
];

/**
 * Without these the tarball installs into nothing: the three entry points the
 * `exports` map names, plus the two files npm prints for a reader.
 */
const REQUIRED = [
  "dist/index.js",
  "dist/index.cjs",
  "dist/types/index.d.ts",
  "README.md",
  "LICENSE",
  "package.json",
];

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const packed = spawnSync(npm, ["pack", "--dry-run", "--json"], {
  cwd: pkgDir,
  encoding: "utf8",
  // Windows refuses to spawn a .cmd without a shell; no argument here is user input.
  shell: process.platform === "win32",
  maxBuffer: 32 * 1024 * 1024,
});

if (packed.error) throw packed.error;
if (packed.status !== 0) {
  process.stderr.write(packed.stderr ?? "");
  throw new Error(`npm pack --dry-run exited ${packed.status}`);
}

// The report goes to stdout, but a lifecycle script that prints anything can appear
// before it, so the array is located rather than assumed to start the output.
const stdout = packed.stdout ?? "";
const start = stdout.search(/(^|\n)\s*\[/);
if (start < 0) {
  process.stderr.write(stdout);
  throw new Error("npm pack --dry-run printed no JSON report");
}
const json = stdout.slice(start, stdout.lastIndexOf("]") + 1);
const report = JSON.parse(json)[0];

const files = report.files.map((file) => file.path).sort();
const stray = files.filter((path) => !ALLOWED.some((rule) => rule.test(path)));
const missing = REQUIRED.filter((path) => !files.includes(path));

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
console.log(
  `${report.name}@${report.version} -> ${report.filename} (${kb(report.size)}, ${kb(report.unpackedSize)} unpacked)`
);
for (const file of files) console.log(`  ${file}`);

if (report.name !== manifest.name) {
  console.error(`\nthe tarball is named ${report.name}, the manifest says ${manifest.name}`);
  process.exit(1);
}
if (missing.length > 0) {
  console.error(`\nmissing from the tarball: ${missing.join(", ")}`);
  process.exit(1);
}
if (stray.length > 0) {
  console.error(
    `\n${stray.length} file(s) outside the allowlist (${ALLOWED.map((rule) => rule.what).join(", ")}):`
  );
  for (const file of stray) console.error(`  ${file}`);
  process.exit(1);
}
console.log(`\n${files.length} files, nothing outside the allowlist`);
