#!/usr/bin/env node
/**
 * Generate this package's sources from the app's copy.
 *
 * The SDK is not a copy of the app's integration layer: it IS the app's
 * integration layer. The reference product imports these exact modules, so a
 * change that would break an integrator breaks the demo first. Keeping one copy
 * of the source and generating the package from it is what makes that true; a
 * hand-maintained second copy would drift within a week.
 *
 *   node scripts/sync.mjs           write src/
 *   node scripts/sync.mjs --check   fail if src/ is not what would be generated
 *
 * `--check` is what CI (and `prepublishOnly`) runs, so a release can never ship
 * sources that lag the app.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pkgDir, "..", "..");

/** `src/` is generated and gitignored; only the app copies are source. */
const MODULES = [
  { from: "app/lib/sdk/index.ts", to: "src/index.ts" },
  { from: "app/lib/abi.ts", to: "src/abi.ts" },
  { from: "app/lib/witness.ts", to: "src/witness.ts" },
  { from: "app/lib/webauthn.ts", to: "src/webauthn.ts" },
];

/**
 * The app keeps these modules side by side in `app/lib`; the package has them
 * flat in `src`, so one relative prefix has to move.
 */
function transform(source, from) {
  const flattened = source.replace(/"\.\.\/(abi|witness|webauthn)"/g, '"./$1"');
  const header =
    `// GENERATED FILE — do not edit.\n` +
    `// Source: ${from} (the same module the reference app imports).\n` +
    `// Regenerate with: bun run build (or node scripts/sync.mjs)\n\n`;
  return header + flattened;
}

export function sync({ check = false } = {}) {
  const plan = MODULES.map((m) => {
    const source = resolve(repoRoot, m.from);
    if (!existsSync(source)) {
      throw new Error(`missing source module ${m.from} (expected at ${source})`);
    }
    return { ...m, generated: transform(readFileSync(source, "utf8"), m.from) };
  });

  const stale = [];
  for (const item of plan) {
    const target = resolve(pkgDir, item.to);
    if (check) {
      const current = existsSync(target) ? readFileSync(target, "utf8") : null;
      if (current !== item.generated) stale.push(item.to);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, item.generated);
  }

  if (check && stale.length > 0) {
    // A stale package is worse than none: it would publish an API the app no
    // longer honours, and the integrator would be the one who finds out.
    throw new Error(
      `generated sources are stale: ${stale.join(", ")}. Run \`node scripts/sync.mjs\` and commit.`
    );
  }

  return plan.map((p) => p.to);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("sync.mjs")) {
  const check = process.argv.includes("--check");
  try {
    const written = sync({ check });
    console.log(
      check
        ? `sdk sources are current (${written.length} files)`
        : `sdk sources generated: ${written.join(", ")}`
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export { MODULES, repoRoot, pkgDir, transform, rmSync };
