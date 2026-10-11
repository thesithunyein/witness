#!/usr/bin/env bun
/**
 * Build @witness/sdk into dist/.
 *
 * Three artefacts, because integrators arrive three ways:
 *
 *   dist/index.js     ESM, for bundlers and Node 20+
 *   dist/index.cjs    CommonJS, for a Node app that is not ready to move
 *   dist/types/*.d.ts declarations, so TypeScript sees the real API
 *
 * The JS is bundled by Bun with `viem` external — viem is a peer dependency, and
 * bundling a second copy of it would give an integrator two `createPublicClient`s
 * with different internals, which fails in ways that look like their bug.
 *
 * Types are emitted by tsc rather than hand-written, so the published types are
 * derived from the same source the app compiles.
 *
 *   bun run build
 */
import { renameSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { sync } from "./sync.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(pkgDir, "dist");

// 1. Regenerate src/ from the app's modules. Never build from a stale copy.
await sync();
console.log("sources synced from app/lib");

// 2. Bundle.
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const entry = resolve(pkgDir, "src", "index.ts");
const shared = {
  entrypoints: [entry],
  target: "node",
  external: ["viem"],
  sourcemap: false,
  minify: false,
};

const esm = await Bun.build({ ...shared, outdir: dist, format: "esm", naming: "[name].js" });
const cjs = await Bun.build({
  ...shared,
  outdir: resolve(dist, "cjs"),
  format: "cjs",
  naming: "[name].js",
});

for (const result of [esm, cjs]) {
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

// Bun names both by entry, so move the CJS build to the extension `require` wants.
const cjsBuilt = resolve(dist, "cjs", "index.js");
if (!existsSync(cjsBuilt)) throw new Error(`expected ${cjsBuilt} from the CJS build`);
renameSync(cjsBuilt, resolve(dist, "index.cjs"));
rmSync(resolve(dist, "cjs"), { recursive: true, force: true });

// 3. Declarations.
const tsc = resolve(pkgDir, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tsc)) {
  console.error(
    "typescript is not installed in packages/sdk. Run `npm install` in packages/sdk first."
  );
  process.exit(1);
}
const typed = spawnSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], {
  cwd: pkgDir,
  stdio: "inherit",
});
if (typed.status !== 0) process.exit(typed.status ?? 1);

for (const file of ["index.js", "index.cjs", "types/index.d.ts"]) {
  const path = resolve(dist, file);
  if (!existsSync(path)) {
    console.error(`build did not produce ${file}`);
    process.exit(1);
  }
  console.log(`  ${file}`);
}
console.log(`@witness/sdk built -> ${dist}`);
