#!/usr/bin/env bun
/**
 * The pack gate's own checks.
 *
 * This exists because the parser read only one of the two shapes `npm pack --json`
 * answers with, which passed on a laptop running npm 11 and failed on the runner, whose
 * workflow upgrades npm to 12 and gets an object keyed by package name. The two
 * fixtures below are trimmed from real output of each version, so the shapes are
 * covered offline; the last check reads whatever npm is actually installed.
 *
 *   node scripts/check-pack.test.mjs    (or: bun run test:pack)
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reportFrom, classify } from "./check-pack.mjs";

const NAME = "@witness-agent/sdk";

/** npm 11: an array of reports, one per package packed. */
const ARRAY_FIXTURE = JSON.stringify([
  {
    id: `${NAME}@0.1.1`,
    name: NAME,
    version: "0.1.1",
    size: 15558,
    unpackedSize: 85301,
    shasum: "509990a3606d5ab4d432b9c3924c675b63ab4249",
    filename: "witness-agent-sdk-0.1.1.tgz",
    files: [
      { path: "LICENSE", size: 1068, mode: 420 },
      { path: "README.md", size: 5827, mode: 420 },
      { path: "dist/index.cjs", size: 23964, mode: 420 },
      { path: "dist/index.js", size: 22475, mode: 420 },
      { path: "dist/types/abi.d.ts", size: 16181, mode: 420 },
      { path: "dist/types/index.d.ts", size: 8798, mode: 420 },
      { path: "dist/types/webauthn.d.ts", size: 2951, mode: 420 },
      { path: "dist/types/witness.d.ts", size: 2591, mode: 420 },
      { path: "package.json", size: 1446, mode: 420 },
    ],
    entryCount: 9,
    bundled: [],
  },
]);

/** npm 12: one object, keyed by the package it packed. */
const OBJECT_FIXTURE = JSON.stringify({
  [NAME]: JSON.parse(ARRAY_FIXTURE)[0],
});

let failures = 0;
const check = (label, condition, detail = "") => {
  console.log(`${condition ? "  ok  " : "  FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
  if (!condition) failures += 1;
};

const shapes = [
  ["npm 11 (an array)", ARRAY_FIXTURE],
  ["npm 12 (an object keyed by name)", OBJECT_FIXTURE],
];

for (const [label, stdout] of shapes) {
  console.log(`\n${label}`);
  const { report, error } = reportFrom(stdout, NAME);
  check("a report is found", !error, error ?? "");
  if (error) continue;
  check("it is this package", report.name === NAME, report.name);
  check("the version came through", report.version === "0.1.1", report.version);

  const { files, stray, missing, misnamed } = classify(report, NAME);
  check("nine files", files.length === 9, String(files.length));
  check("nothing stray", stray.length === 0, stray.join(", "));
  check("nothing missing", missing.length === 0, missing.join(", "));
  check("named as the manifest says", misnamed === null);

  // The failure paths, on a real payload: one file added, one entry point removed,
  // and a tarball that is not this package.
  const withStray = { ...report, files: [...report.files, { path: "scripts/build.mjs", size: 1 }] };
  check("a stray file is caught", classify(withStray, NAME).stray.length === 1);
  const withoutEntry = { ...report, files: report.files.filter((f) => f.path !== "dist/index.js") };
  check("a missing entry point is caught", classify(withoutEntry, NAME).missing.length === 1);
  check("a renamed tarball is caught", classify({ ...report, name: "@someone/else" }, NAME).misnamed === "@someone/else");
}

console.log("\nedge cases");
check("empty output is an error, not a crash", reportFrom("", NAME).error !== undefined);
check("build noise before the report is tolerated", reportFrom(`$ bun run build\n12 files\n${ARRAY_FIXTURE}`, NAME).error === undefined);
check("unparseable output is an error", reportFrom("[\n  {oops\n", NAME).error !== undefined);

console.log("\nthe npm actually installed here");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const live = spawnSync(npm, ["pack", "--dry-run", "--json"], {
  cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 64 * 1024 * 1024,
});
const liveParsed = reportFrom(live.stdout ?? "", NAME);
check("its report parses", liveParsed.error === undefined, liveParsed.error ?? "");
if (!liveParsed.error) {
  const live_ = classify(liveParsed.report, NAME);
  check("and it ships the same nine files", live_.files.length === 9, String(live_.files.length));
}

console.log(failures === 0 ? "\nevery pack check passed" : `\n${failures} pack checks failed`);
process.exit(failures === 0 ? 0 : 1);
