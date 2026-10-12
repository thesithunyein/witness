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
 * The JS is bundled by Bun with `viem` external, viem is a peer dependency, and
 * bundling a second copy of it would give an integrator two `createPublicClient`s
 * with different internals, which fails in ways that look like their bug.
 *
 * Types are emitted by tsc rather than hand-written, so the published types are
 * derived from the same source the app compiles.
 *
 *   bun run build
 */
import {
  renameSync,
  rmSync,
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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

// 3b. Give the declarations explicit relative extensions.
//
// `moduleResolution: bundler` (above) lets the emitted .d.ts keep extensionless
// relative imports, which is fine for the app and for bundler consumers, but a
// consumer building a Node ESM project with `moduleResolution: nodenext` sees
// TS2834 *inside the shipped file* and cannot fix it from their side. Adding the
// `.js` extension is valid in every modern resolution mode: TypeScript maps
// `./witness.js` back to `witness.d.ts`. Without this, the types work for the
// integrator who uses a bundler and fail for the one who does not.
const typesDir = resolve(dist, "types");
const withExtension = (spec) => (spec.endsWith(".js") ? spec : `${spec}.js`);
for (const file of readdirSync(typesDir).filter((f) => f.endsWith(".d.ts"))) {
  const path = resolve(typesDir, file);
  const source = readFileSync(path, "utf8");
  // Both forms tsc emits: `from "./x"` and the type reference `import("./x").T`.
  const extended = source
    .replace(/(from\s+")(\.\/[^"]+?)(")/g, (_a, head, spec, tail) => head + withExtension(spec) + tail)
    .replace(/(import\(")(\.\/[^"]+?)("\))/g, (_a, head, spec, tail) => head + withExtension(spec) + tail);
  if (extended !== source) {
    writeFileSync(path, extended);
    console.log(`  types/${file} (relative imports given .js extensions)`);
  }
}

for (const file of ["index.js", "index.cjs", "types/index.d.ts"]) {
  const path = resolve(dist, file);
  if (!existsSync(path)) {
    console.error(`build did not produce ${file}`);
    process.exit(1);
  }
  console.log(`  ${file}`);
}
console.log(`@witness/sdk built -> ${dist}`);
