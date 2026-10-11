#!/usr/bin/env node
/**
 * Style guard: no em dashes (U+2014) or en dashes (U+2013) anywhere a reader can
 * see one.
 *
 * `contracts/**` is EXCLUDED on purpose. The deployed bytecode embeds a metadata
 * hash derived from the source, so editing a Solidity comment would change a
 * fresh rebuild and break the exact-match verification that `contracts/verify.sh`
 * and the README both point at.
 *
 * Run from the repository root:  node scripts/check-style.mjs
 * Exits 1 with a file:line list when it finds one.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// import.meta.dirname needs Node >= 20.11 (the repo's engine floor) and works on Bun.
const root = resolve(import.meta.dirname, "..");
const roots = ["app", "contracts", "examples", "packages", "scripts", ".github"];
const skip = new Set(["node_modules", ".next", "dist", "out", "worker-dist", ".git", "coverage"]);
const exts = [".ts", ".tsx", ".mjs", ".js", ".md", ".json", ".html", ".yml", ".css", ".sh"];
const bad = { "\u2014": "em dash", "\u2013": "en dash" };

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (exts.some((e) => entry.name.endsWith(e))) files.push(full);
  }
  return files;
}

const targets = [];
for (const name of roots) {
  const dir = join(root, name);
  try {
    statSync(dir);
  } catch {
    continue;
  }
  walk(dir, targets);
}
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".md")) targets.push(join(root, entry.name));
}

const hits = [];
for (const file of targets) {
  const rel = relative(root, file).split("\\").join("/");
  // Deliberate exclusion: see the note at the top of this file.
  if (rel.startsWith("contracts/")) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const [char, label] of Object.entries(bad)) {
      if (line.includes(char)) hits.push(`${rel}:${i + 1}  ${label}\n    ${line.trim()}`);
    }
  });
}

if (hits.length > 0) {
  console.error(`Found ${hits.length} em/en dash occurrence(s):\n`);
  console.error(hits.join("\n"));
  console.error(`\nReplace with a comma, a colon, a full stop, or a plain hyphen.`);
  process.exit(1);
}

console.log(`check-style: ${targets.length} files scanned, 0 em/en dashes.`);
