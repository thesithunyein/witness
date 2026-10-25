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

/**
 * Pick the report out of `npm pack --json` output.
 *
 * Two npm shapes are live: 11.x answers with an array of reports, 12.x answers with an
 * object keyed by the package it packed. And a lifecycle script (`prepack` runs the
 * build) prints to the same stream before the report, so the JSON has to be located
 * rather than assumed to be the whole output. Reading only one shape is exactly how
 * this gate passed here and failed on the runner, whose npm the workflow upgrades.
 */
export function reportFrom(stdout, name) {
  const start = stdout.search(/(^|\n)\s*[[{]/);
  if (start < 0) return { error: "npm pack --json printed no report" };
  const text = stdout.slice(start);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]")) + 1;
  let parsed;
  try {
    parsed = JSON.parse(text.slice(0, end));
  } catch (err) {
    return { error: `npm pack --json printed no parseable report: ${err.message}` };
  }
  const report = Array.isArray(parsed)
    ? parsed[0]
    : (parsed[name] ?? Object.values(parsed)[0]);
  if (!report || !Array.isArray(report.files)) {
    return { error: "the npm pack report carried no file list" };
  }
  return { report };
}

/** Everything a release would want to hear about one report, worst-first. */
export function classify(report, name) {
  const files = report.files.map((file) => file.path).sort();
  return {
    files,
    misnamed: report.name === name ? null : report.name,
    stray: files.filter((path) => !ALLOWED.some((rule) => rule.test(path))),
    missing: REQUIRED.filter((path) => !files.includes(path)),
  };
}

function main() {
  const manifest = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8"));
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const packed = spawnSync(npm, ["pack", "--dry-run", "--json"], {
    cwd: pkgDir,
    encoding: "utf8",
    // Windows refuses to spawn a .cmd without a shell; no argument here is user input.
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (packed.error) throw packed.error;
  if (packed.status !== 0) {
    process.stderr.write(packed.stderr ?? "");
    throw new Error(`npm pack --dry-run exited ${packed.status}`);
  }

  const { report, error } = reportFrom(packed.stdout ?? "", manifest.name);
  if (error) {
    process.stderr.write(packed.stdout ?? "");
    console.error(`\n${error}`);
    process.exit(1);
  }

  const { files, misnamed, stray, missing } = classify(report, manifest.name);
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
  console.log(
    `${report.name}@${report.version} -> ${report.filename} (${kb(report.size)}, ${kb(report.unpackedSize)} unpacked)`
  );
  for (const file of files) console.log(`  ${file}`);

  if (misnamed) {
    console.error(`\nthe tarball is named ${misnamed}, the manifest says ${manifest.name}`);
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
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("check-pack.mjs")) {
  main();
}
