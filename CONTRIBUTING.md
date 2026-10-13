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

## Deployment changes

Anything that publishes, a contract deploy, an app redeploy, a published site,
should be recorded in the README's live table and in `CHANGELOG.md`, with the
evidence (a transaction hash, an `/api/config` response, a verification job id).
"This is deployed" without an artifact is not a status.

## Deploying the app

The Vercel project behind `witness-agent.vercel.app` must have its **Root Directory**
set to `app`. The repository root has a `package.json` too, and it has no `next` in it,
so a build that starts at the root stops with `No Next.js version detected` and the
check on the commit goes red. That setting lives in the project, not in a file: no
`vercel.json` key can move it, and a `vercel.json` in `app/` is invisible to a build
that started at the root.

Because of that, a push to `main` is not by itself the deployment path. The app is
published from its own directory, which is how every live deployment in the README's
table was produced:

```bash
cd app && vercel --prod
```

## Conduct

Participation is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security issues
go through [SECURITY.md](SECURITY.md), not the issue tracker.
