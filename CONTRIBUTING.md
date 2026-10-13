# Contributing

Witness is a small, opinionated codebase. The fastest way to get a change merged is
to make the claim it touches **checkable**, a failing test, a transaction hash, or a
trace beats an argument every time.

## Before you start

| Need | Version |
|---|---|
| Node | `>=20.11 <25` (`.nvmrc` pins 22) |
| Bun | 1.3+ (the app and SDK builds) |
| Foundry | forge 1.7.x |

```bash
npm install                    # root: viem, for the examples
cd app && bun install          # the product
cd contracts && forge build    # the contracts
```

## The checks that must pass

```bash
cd contracts && forge fmt --check          # the formatter CI runs first
cd contracts && forge test                 # 40 tests, real P-256 signatures
cd app && bunx tsc --noEmit                # types
cd app && bun run build-worker.mjs         # the Worker bundle must build
cd packages/sdk && bun run check           # the SDK must not lag the app
node scripts/check-style.mjs               # no em dashes in prose or copy
```

`check-style.mjs` is a one-rule guard: nothing a reader sees may contain an em dash
or an en dash. `contracts/**` is exempt, because the deployed bytecode embeds a
metadata hash derived from the Solidity source, so editing a comment there would
change a fresh rebuild and break the exact-match verification the README points at.

If you change any route's request or response shape, change **both** hosts: the Next
routes in `app/app/api/**` and the Worker in `app/worker/index.ts`. They had drifted
before, and the failure mode was silent until someone used the second deployment,
that is exactly what this rule exists to prevent.

If you change the deployed contracts' behaviour, the address manifest, or the
verifier's accepted origin, say so loudly in the pull request: the app bakes the
manifest at build time, so a contract change without an app redeploy leaves the site
talking to a stack the source no longer describes.

## What is welcome

- **Breaking a claim.** A test that shows the digest binding, the replay guard, the
  identity check or the one-time consumption can be bypassed.
- **Filling in the threat model.** An attack class it does not list, with its
  residual risk, including attacks you cannot fix.
- **Integration experience.** A report from a real app that tried to integrate, even
  (especially) if the API did not fit.
- **Docs that are wrong.** If the README says something the code does not do, that is
  a bug, not a nit.

## What will be declined

Features that widen the trust story rather than narrow it. Concretely: an
operator-callable path that reaches the safe, a mutable accepted origin, a
client-side-only spend cap, or any "convenience" admin function on a contract that
holds value. The current design is deliberately narrow, and the narrowness is the
product.

Also declined: changes that skip a test to make a check pass, or that weaken an
assertion rather than fixing the cause. If a test is wrong, say why in the pull
request.

## Test conventions

The contract tests do **not** mock the cryptography. Each one computes the real
canonical digest, has a Node process produce a genuine P-256 signature over exactly
those bytes, and submits it to a contract that verifies through the real precompile.
A new test that needs a signature should follow that path rather than injecting a
stubbed verifier.

`examples/live-e2e.mjs` is different in kind: it makes claims about the **deployed**
contracts with real transactions and needs `DEPLOYER_PRIVATE_KEY` and testnet funds.
It is the place to prove something "on-chain" rather than "on an anvil fork".

## Commits and pull requests

- Commit subjects follow the history: `feat:`, `fix:`, `chore(scope):`, `docs:`.
- Explain *why* in the body. The interesting part of a contract change is the attack
  it closes, not the diff.
- Small pull requests. One claim per change.

## Releasing the SDK

A release is a tag, and the tag is the version:

```bash
# bump packages/sdk/package.json, add the CHANGELOG entry, commit
git tag v0.1.1
git push origin v0.1.1
```

`.github/workflows/release.yml` does the rest: it checks the tag against the manifest, refuses a
version the registry already serves, typechecks the app the package is generated from, rebuilds
the sources from `app/lib`, verifies the tarball's contents, and publishes. A manual run of that
workflow executes every gate and stops at `npm publish --dry-run`, which is how a release is
rehearsed without a tag.

Publishing needs one of two credentials, and the first is preferred:

| Credential | One-time setup | What the workflow sends |
|---|---|---|
| Trusted publishing | npmjs.com, the package’s Settings, Trusted publishing: GitHub Actions, repository `thesithunyein/witness`, workflow `release.yml`, with `npm publish` among the allowed actions | an OIDC token, no secret in the repository |
| `NPM_TOKEN` | an npm granular token with publish rights, added under the repository’s Settings, Secrets and variables, Actions | that token, with `--provenance` |

Trusted publishing needs npm CLI 11.5.1 or newer and Node 22.14 or newer, so the workflow upgrades
npm rather than trusting the runner's. A configuration created after Sep 3, 2026 starts with
staged publishing only, so `npm publish` has to be allowed explicitly, and it expires if its first
publish does not succeed within two days, so create it just before the release you intend to make.

## Deployment changes

Anything that publishes, a contract deploy, an app redeploy, a published site,
should be recorded in the README's live table and in `CHANGELOG.md`, with the
evidence (a transaction hash, an `/api/config` response, a verification job id).
"This is deployed" without an artifact is not a status.

## Deploying the app

The Vercel project behind `witness-agent.vercel.app` builds with its **Root Directory**
set to `app`, and it has to stay that way. The repository root has a `package.json`
too, and it carries no `next`, so a build that starts at the root stops with
`No Next.js version detected` before it reads a line of the app, which is what turns
the Vercel check on a commit red while every Actions job is green.

The setting lives in the project rather than in a file. No `vercel.json` key can move
it, and the `vercel.json` inside `app/` is invisible to a build that started at the
root, so the repository cannot describe its own build root. Read it back with:

```bash
vercel api "/v9/projects/<projectId>?teamId=<teamId>"   # prints rootDirectory
vercel api "/v9/projects/<projectId>?teamId=<teamId>" --method PATCH --field rootDirectory=app
```

Publishing by hand is still the fastest path, and it is how every live deployment in
the README's table was produced:

```bash
cd app && vercel --prod
```

## Conduct

Participation is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security issues
go through [SECURITY.md](SECURITY.md), not the issue tracker.
