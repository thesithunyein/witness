#!/usr/bin/env bun
/**
 * Builds the deployable static site into app/out/.
 *
 * The deployed site is not a Next.js server. It is this static bundle (the same
 * page component Next renders) plus the Worker in worker/index.ts. This script
 * exists so the deploy artifact is produced by one reproducible command:
 *
 *   bun run build-static.mjs
 */
import { rmSync, mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = import.meta.dir;
const outDir = resolve(appRoot, "out");

/** Resolve the `@/...` alias the page component uses (tsconfig paths). */
const aliasPlugin = {
  name: "at-alias",
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => {
      const base = resolve(appRoot, args.path.slice(2));
      const candidates = [
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.mjs`,
        base,
        resolve(base, "index.ts"),
        resolve(base, "index.tsx"),
      ];
      const found = candidates.find((c) => existsSync(c) && statSync(c).isFile());
      if (!found) throw new Error(`cannot resolve alias ${args.path}`);
      return { path: found };
    });
  },
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [resolve(appRoot, "static/main.tsx")],
  outdir: outDir,
  target: "browser",
  minify: true,
  sourcemap: false,
  naming: "[name].[ext]",
  plugins: [aliasPlugin],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// The HTML shell links /styles.css and /main.js; keep those names stable.
copyFileSync(resolve(appRoot, "static/index.html"), resolve(outDir, "index.html"));
copyFileSync(resolve(appRoot, "app/globals.css"), resolve(outDir, "styles.css"));
// The favicon is the same file Next serves from public/, not a second copy.
copyFileSync(resolve(appRoot, "public/logo.png"), resolve(outDir, "logo.png"));

for (const o of result.outputs) {
  const name = o.path.split(/[\\/]/).pop();
  console.log(`  ${name}  ${(o.size / 1024).toFixed(1)} kB`);
}
console.log(`static site built -> ${outDir}`);
