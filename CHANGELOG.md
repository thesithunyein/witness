# Changelog

## 2026-10-13 - a release is a tag, and the gates travel with it

Publishing was a command the maintainer had to remember, run from the right directory, with the
right account, and the drift check that keeps the package equal to the app only ran because
somebody knew to run it. A release now carries its checks in a workflow instead of in a head.

- **`.github/workflows/release.yml` publishes a `v*` tag.** It refuses to publish unless the tag
  equals the version in `packages/sdk/package.json`, that version is not already on the registry,
  the app the package is generated from typechecks, the generated sources agree with `app/lib`,
  the prose guard passes, and the tarball carries nothing unexpected.
- **`packages/sdk/scripts/check-pack.mjs`** is that last gate, and it runs locally too
  (`bun run check:pack`). It reads the file list npm reports for the real tarball via
  `npm pack --dry-run --json`, so nothing reaches the registry because nobody looked, and a
  missing entry point fails as loudly as a stray file.
- **Trusted publishing first, token second.** npm mints a short-lived OIDC token for the workflow,
  so the repository holds no long-lived publish credential, and provenance is automatic for a
  public repository. The `NPM_TOKEN` secret is used only if it exists, with `--provenance` asked
  for explicitly on that path.
- **A manual run rehearses.** `workflow_dispatch` executes every gate and ends in
  `npm publish --dry-run`, which is how the pipeline can be proven before a tag exists. Only a tag
  push, or a manual run with the dry-run input switched off, uploads anything.
- **CONTRIBUTING.md** documents both credential paths, the fact that a trusted publisher
  configuration created after Sep 3, 2026 allows staged publishing until `npm publish` is allowed
  explicitly, and its two-day expiry when the first publish does not succeed.
- **The package moves to 0.1.1.** The manifest is part of the published tarball, so the pack gate
  and its script are a package change, and the release refuses a version the registry already
  serves, which is why the next release cannot be 0.1.0.

## 2026-10-13 - the SDK ships from the registry

- **The package publishes as `@witness-agent/sdk`.** The npm org name `witness` was already taken
  at the registry, so the package ships under the `witness-agent` scope, created for this project
  and matching the app's own hostname. Every file that named `@witness/sdk` was renamed: the
  manifest and lockfile, both READMEs, the SDK sources and its build script, the docs page,
  `SUBMISSION.md` and `INTEGRATOR-KIT.md`. The tarball is `witness-agent-sdk-0.1.0.tgz` (9 files,
  15.6 kB), and `0.1.0` was pushed on 2026-10-13 (`+ @witness-agent/sdk@0.1.0`). A brand-new scope
  can take a few minutes before the registry serves reads; the local build and the published
  tarball share shasum `9e53a41499c100dcac2e1ff7cf82d60a5e3cf5b3`.
- **The docs point at the published name.** `npm i @witness-agent/sdk viem` replaces the
  "not on the registry yet" notes in the root README, the SDK's README and the integrator kit.

## 2026-10-13 - the front door names the pages it links to

The site had three names for the same developer surface, a footer whose links did not all resolve, and
a README that argued its case at length before it said where to go.

- **`/integrate` is now `/docs`.** The page is named for what it is. The old address forwards rather
  than 404s: a permanent redirect in `next.config.mjs` for the server render, and a 308 in the Worker
  for the static bundle, where `app/static/main.tsx` mounts the same component at the new path. Every
  reference moved with it: the README, `SUBMISSION.md`, `INTEGRATOR-KIT.md`, and the SDK's own header
  comment.
- **The app bar lost its Integrate link.** The guide is one link away on the front door, and a second
  way to it printed inside the screen an operator is using answered a question nobody there had. The
  bar also no longer repeats the chain under the brand; the chain id has its own row in Settings.
- **The landing footer is three columns, and every link resolves:** Product (`/app`, the two anchors on
  the page itself), Developers (`/docs`, its four calls, its live preflight), and On-chain (the three
  deployed addresses and the explorer). A footer is the easiest place in a product to invent a Privacy
  page nobody wrote, so nothing here is invented. The one outbound identity link is the project's own X
  account, an icon with no username beside it, and no page on the site links to GitHub.
- **One call to action, in the bar.** "Open the app" is the only button in the navigation and it stays
  visible while the page is read; the hero points at the argument and at the docs instead of repeating
  it. Copy that promised "three steps" now says what the page actually shows: four calls, one check
  on-chain.
- **The README is a front door, not an argument.** It went from 806 lines to about 270: the app link is
  a button at the top, before the first paragraph, and the rest is the flow, the addresses, the honest
  limits, and the commands that reproduce all of it. What repeated the same guarantee three ways did
  not survive the edit.
- **The landing band is ink on transparency.** `halftone-hands.png` no longer carries a baked page
  colour, so the page's own background is the paper and the band has no visible box.

## 2026-10-13 - redeployed against the origin that serves the product

The submission link and the origin the contracts accept were different hosts. `WitnessVerifier`
freezes `rpId`/`origin` at deploy and `lockConfiguration()` makes them permanent, so the deployed
stack accepted assertions signed only from `https://witness.sithunyein.com`, and that domain had gone
NXDOMAIN at the TLD. Every read path kept working and the one interaction the product exists for
could not be drawn on any host a judge could reach.

The fix is a second deployment frozen to `witness-agent.vercel.app`, the URL the submission actually
uses. The first stack is untouched on-chain; it is simply bound to an origin nobody can visit.

- **New stack, same source.** `WitnessIntentRegistry` `0x84502BA6…`, `WitnessVerifier` `0x7836f1bD…`,
  `DemoSafe` `0x17fc3f96…`, `AgentExecutor` `0x7010c047…`, `DemoUSD` `0xd5588C6f…`, ERC-8004 identity
  `#2240` owned by the new executor. All five verified `exact_match` on MonadVision (matchIds
  2053971 to 2053975). `configurationLocked: true`, identity enforced, operator and relayer keys
  unchanged, so the hosted app needed no environment change: only the baked manifest.
- **The relying party is now read from the manifest, not hard-coded.** `scripts/sign-action.mjs`,
  `scripts/gen-assertion.mjs`, the Foundry fixture and the two test files all carried their own copy
  of `witness.sithunyein.com`. That is why the first live run after the redeploy reported
  `RpIdMismatch` on the approved path while the refusals passed: the refusals never need a valid
  signature, so they cannot catch a fixture pinned to the wrong origin. Both scripts now default to
  `contracts/deployments/<chain>.json`, and the tests were updated to match it.
- **Live evidence re-run against the new stack**, not carried over: `examples/live-e2e.mjs` 4/4, the
  approved path landing as tx `0x13d7cd50…` in block 70,639,621 (336,107 gas, status success).
- **`agent.json` points at the host that answers.** The ERC-8004 `tokenURI` is
  `https://witness-agent.vercel.app/agent.json`, and the document's own `image` and service endpoints
  now name the same origin instead of the dead one.
- **The README says what replaces a wallet, precisely enough to be wrong if it were loose:** the
  signed digest binds chain, contract, intent, action type, asset, recipient and amount, and does
  *not* contain the expiry, which lives on the permission record; and the relayer owns the permission
  it registers, because `createIntent` takes the author from `msg.sender`.

## 2026-10-12 (app) - the landing page left, and an app screen arrived

The first screen was a pitch. A 46px headline, a four-line lede, three explainer cards
and a four-tile grid of statistics, all of it above the thing the page exists for, so
anyone who opened it to approve a payment had to scroll past the argument for why they
should. The argument was not wrong, it was in the wrong place. This is the interface
half of the submission pass, and no contract, route, SDK or passkey behaviour changed.

- **The app opens with state, not a claim.** `DashboardHeader` became `StatusStrip`:
  the name of the screen, one line of context, and the four facts the app actually
  knows (spending limit and its clock, requests waiting, agent verified, settings
  locked), each one read from the chain. The headline, the lede and the three-step
  explainer are gone from the top of the app.
- **Two columns where there is room for them.** On a desktop the approvals screen is a
  workspace: the decision on the left, and on the right the agent that may act, its
  withdrawal control, and the last three decisions. The setup screen puts "How it
  works" in that column instead, because that is the moment a reader needs it.
- **One sentence per place.** Twenty-odd long strings were cut, including all eight
  refusal messages, which had each ended in the same clause about the request being
  refused. The three-step explainer moved into Settings and beside the setup card as a
  single `HowItWorks` component, so the two copies cannot drift.
- **A real bug in the risk label.** An expired or already-used permission reported
  "Expiring soon", because the countdown check ran before the check for whether the
  permission is active at all, so the page named a refusal the contract would never
  give. It reads "No longer active" now. The same sentence used to end "(used)
  (expired)" and now says which one happened, once.
- **The tabs carry the work.** The approvals tab shows a count while something is
  waiting, which is the honest replacement for the removed jump button.

Verified: `tsc --noEmit` clean, `next build` passes with five routes, `build-static`
passes, `check-style` clean across 97 files. All four panels and the developer page
checked in the browser at 1440px and 430px, including the waiting state rendered from a
live testnet permission (id 1, inactive) and seeded local history. No console errors.

## 2026-10-11 (submission) - the claims a judge can check, and the one that was broken

A pass over the things a judge can verify in a minute, so that every claim in the repo
is either checkable or corrected. Nothing here changes behaviour.

- **`scripts/probe-p256.mjs` runs again.** It resolved its vector from the repo root while
the vectors live at `contracts/test/vectors/`, so the one script that proves Monad's P256
precompile validates (rather than accepting everything) crashed before it made a single
call. Fixed, and re-run against both testnet (10143) and mainnet (143): `valid ACCEPT`,
`tampered reject`, with the sha256 control call alongside it.
- **The SDK's install claims are true now.** The package is not on the public registry, and
three files said `npm i @witness/sdk` as a present-tense fact. The README, the integrator
kit and the SDK's own README now say what is true: a real package with a version and a
build, `npm pack` produces the tarball, and the registry name is where it lands when the
maintainer publishes it.
- **Two statements in `SUBMISSION.md` were wrong in the direction that costs points.** It
still said there was no logo and that the hosted site served a pre-deployment build. The
logo is in `assets/`, and production serves the current manifest. Both corrected, and the
production claim was re-checked against the live response instead of assumed.
- **The Founder section answers "why not roll your own" with numbers.** 1,194 lines of
Solidity, 1,223 lines of client TypeScript, 40 tests, 1,146 lines of docs, then the four
things a from-scratch attempt gets wrong: P-256 has no signature recovery, the signature is
the easy half of WebAuthn, consumption and revocation, and typed refusals.
- **The gas figure was wrong, and is now measured.** The docs said a full authorization check was
about 177k gas. The real approved passkey authorized transfer costs **326,925 gas** end to end (tx
`0x59616dd8…`, block 70,155,898), so the published number understated it by roughly 85 percent.
Replaced with measured values from `forge test --gas-report`.
- **The two heavyweight claims were re-run, not restated.** All five contracts came back
`exact_match` on Sourcify (matchIds 2047996 to 2048000, `runtimeMatch: exact_match` on each), and
`examples/live-e2e.mjs` passed 4/4 against the deployed contracts, with the approved path landing as
a real transaction and the two refused permissions revoked afterwards.
- **The Founder section says who the market is, not just what category it is.** x402's move to the
Linux Foundation's x402 Foundation (22 members), Coinbase's reported 69,000 agents and 165 million
transactions at roughly $0.30 per call, and the exact gap: in a 402 flow the payer's own key
approves, so the resource server cannot tell a human approval from an agent's own decision. The
honest limit of that case is stated too, one approval is one use while a sub-dollar call does not
deserve a biometric tap, with the capped session as the next piece.
- **Shipped declarations work under `nodenext`.** `moduleResolution: bundler` let the emitted
`.d.ts` files keep extensionless relative imports, so a consumer building a Node ESM project
saw TS2834 errors inside our own published file and could not fix them from their side. The
build now rewrites both forms tsc emits, `from "./x"` and `import("./x").T`. Verified by
packing the tarball, extracting it into a separate consumer, and importing it three ways:
ESM, CommonJS, and a strict `nodenext` type check, all exit 0.

## 2026-10-11 (brand) - one logo, and an interface that matches it

The mark is the winking bear on a lime tile: black on lime, thick rounded shapes,
and a tile whose corner radius is generous. That is the whole design rule now.

- **One file, four places.** The logo is `app/public/logo.png` (the supplied
  artwork, trimmed to the tile and squared, so no redrawing of it exists anywhere).
  Next serves it as the tab icon via `icons.icon`, `build-static.mjs` copies it into
  the static bundle, `Mark()` in `chrome.tsx` is an `<img>` pointing at it, and the
  README shows `assets/logo.png`, the same bytes. Before this the bar drew an
  asterisk and the tab drew a serif W, so the two never agreed.
- **Lime and ink, from the logo.** The old indigo to teal ramp is gone. Lime is used
  as a FILL only (primary buttons, the step badges, the avatar tile, the accent rules
  at the top of cards), always carrying ink on top, exactly as the logo does. Every
  place lime was previously a text colour now uses `--accent-text`, a dark olive that
  clears 7:1 on white, because bright lime as body text is unreadable and the logo
  never does it either.
- **Rounder everywhere.** Card radius 16 to 22, inner surfaces 11 to 14, and every
  single-line control is a pill: buttons, the primary action, and the tab row, which
  became a segmented control. The step badges turned from rounded squares into
  circles. Display type went to 700, matching the weight of the mark.

Verified in the running app: the bar shows the bear, the tab icon is the same file,
body text is Inter with Space Grotesk headings, cards are 22px, controls 999px, no
em dashes in the source or the rendered text, and no horizontal overflow.

## 2026-10-11 (light) - a light surface, plainer words, no em dashes

Five changes to one thing: how the product reads to the person actually using it.

- **Light theme.** Two surfaces (a near-white page and white cards), depth from a
  hairline plus a two-layer shadow, and the indigo-to-teal ramp used only for fills
  and display words. Both ramp stops clear 4.5:1 against white text (6.29 and 5.36),
  and no body copy is set in a gradient. Theme colour and `color-scheme` follow.
- **Plain words first.** The header opens with a three-step explainer written for
  someone who has never seen a wallet: the agent asks, you approve one payment, the
  contract pays. Stat tiles read "Spending limit", "Requests to review", "Agent
  verified", "Settings locked", and values read "Yes", "No", "Not set" instead of
  dashes and jargon. The technique still exists, one click behind "Security details".
- **Em dashes removed** from 38 files: app copy, API comments, README, threat model,
  security policy, submission and changelog. `contracts/**` is deliberately excluded,
  because the deployed bytecode embeds a metadata hash derived from the source, so
  editing a Solidity comment would break the exact-match verification the README
  points at. A one-rule guard, `scripts/check-style.mjs`, keeps it that way: it fails
  the build on a stray dash in anything a reader sees, and CI runs it first because it
  needs no install.
- **The tab icon exists.** The live site was answering 404 for `/favicon.ico`, so a
  browser tab showed the blank page glyph. `app/app/icon.svg` is the brand mark now,
  and Next emits it as `<link rel="icon" type="image/svg+xml">`. The static bundle
  carries the same mark inline.
- **The Worker harness works again.** `test-worker.mjs` still posted
  `expiresInSeconds` while both `/api/intent` hosts had moved to an absolute `expiry`,
  so the run died on its fourth check and the four security assertions behind it
  (10x injection refused, unapproved transfer refused, revoke, revoked-then-refused)
  never executed. Fixed, and all nine checks now pass against a real Monad testnet
  stack, with real transaction hashes in the output.

Verified on the deployed origin: light background and text colours (page `#f5f6f8`,
body text `#0d1526`, 16.9:1), `color-scheme: light`, a live `/icon.svg` at
`image/svg+xml`, all four panels plus the developer page, zero em dashes or en dashes
in the rendered DOM of either page, no horizontal overflow at 1440px or 390px, and an
automated contrast scan over every text element in all four panels. Its only flag was
a code chip on a 10% tinted background, which the scan reads as opaque; composited it
is 6.2:1.

## 2026-10-11 (ui), the poster became a control panel

The design concept changed; the behaviour did not. Nothing about the contracts, the
API routes, the SDK or the passkey ceremony is touched here, and the deploying origin
and `rpId` are unchanged, which is what keeps passkeys enrolled before this commit
valid after it.

- **Navigation moved into a sticky app bar.** All four sections are one click away from
  anywhere on the page. The tabs render on the first paint rather than after the config
  fetch, so the bar no longer grows a row under the reader as it loads.
- **The poster hero is gone.** It opened with the wordmark set 232px wide, which said
  nothing and spent the entire first screen. In its place is a dashboard header with four
  live tiles: the standing permission and when it expires, how many requests are waiting on
  the human, whether the ERC-8004 identity check is enforced, and whether the deployment's
  configuration is frozen. Every value is read from the chain; none is asserted in copy.
- **One brand ramp, indigo → cyan**, carries the mark, the amount inside the permission
  sentence, the primary action and the request panel's own frame. Amber, green and red stay
  strictly semantic, waiting, approved, refused, and still always arrive with an icon and
  a label rather than as colour alone.
- **Type is functional now**: Inter for the interface, Space Grotesk for display lines,
  JetBrains Mono for every figure and identifier, all self-hosted by `next/font`. Digits are
  tabular, so the countdown ticking does not reflow the row it sits in.
- **Verified on the deployed origin**, not just locally: all four panels switch, the
  developer page renders, all three fonts load, no console errors, and no horizontal
  overflow at 1440px or 390px.

## 2026-10-11 (fix), the SDK builds from a clean install, and formatting is a gate that passes

Two things the docs pass exposed, both fixed at the cause.

- **`@witness/sdk` could not emit declarations from a fresh `npm install`**: `tsc` reported
  `TS2742` because the inferred type of `publicClient` named viem's internal module paths.
  Fixed in the source both packages share, `app/lib/witness.ts` now annotates the return type
  as viem's public `PublicClient`, so the emitted `dist/types` imports only `"viem"` and an
  integrator can actually resolve it. Verified: `bun run check` and `bun run build` pass, and
  the generated `.d.ts` files were grepped to confirm they reference nothing internal.
- **Formatting is enforced rather than aspirational.** `.github/workflows/ci.yml` runs
  `forge fmt --check`, which the contracts did not pass, so `forge fmt` was applied across nine
  Solidity files (whitespace only) and `forge test` re-run afterwards: 40 passed, 0 failed.

## 2026-10-11 (docs), the repository reads like a product, not a scratchpad

No behaviour changed. This is the front door, and the missing paperwork.

- **README**: status badges (all of them describing something verified, none of them
  aspirational, including an honest `audit: not yet`), two Mermaid diagrams (the trust
  boundaries, and the request→approval→on-chain-verification sequence including the step
  where the agent reads the receipt itself), a full project tree, a security posture table,
  and a *Verifying it yourself* section listing the commands behind every claim.
- **`THREAT-MODEL.md` and `SECURITY.md`** are now linked from the README's Security section
  rather than buried; the badges link to both.
- New: [LICENSE](LICENSE) (MIT, with the vendored-dependency note), [CONTRIBUTING.md](CONTRIBUTING.md)
  (the four checks, the Worker/Next parity rule, and what will be declined),
  [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) (Contributor Covenant 2.1), and
  [SECURITY.md](SECURITY.md) (private advisories, response targets, and the hardening already
  on the list so nobody reports it as a discovery).
- New: `.github/workflows/ci.yml`, contracts, app types + bundles, and the SDK drift check.
  **Written but not yet executed on Actions**; the same commands pass locally, and the first
  run is the real test of the workflow itself.
- Both Mermaid diagrams were parsed with mermaid 11 (the version GitHub renders) rather than
  eyeballed, so they render instead of showing a syntax error to a reviewer.

## 2026-10-11 (later), the agent actually asks: a real request queue, a real package, a threat model

Three things the previous revision only claimed are now real: the agent asks over
HTTP, the integration surface is an installable package, and the trust claims are
checkable by a stranger.

### The request queue (this is the big one)

- **The hero moment is no longer a fixture.** "Research Agent wants to spend 0.50 MON
  on Market Data API" was three constants in `page.tsx`. It is now an agent process
  POSTing to `POST /api/requests`, with the page rendering exactly what arrived.
- **The empty state is honest.** If nothing has asked, the approval screen says so and
  shows the one command that makes an agent ask. It does not invent a request to look
  finished.
- **`examples/agent-request.mjs`**, the agent as a separate process: it asks, polls
  `GET /api/requests/:id` for the decision, and then **reads the receipt from Monad
  itself** rather than believing the app. It exits non-zero when the transaction is
  missing, reverted, or unconfirmed. `--over` sends the prompt-injection attack for real.
- **Identity is checked on arrival.** A request claiming an ERC-8004 id is verified
  against the registry (`ownerOf(id) == AgentExecutor`) before it reaches a human, so a
  queue entry cannot claim an identity the agent wallet does not hold. Unconfigured
  registry ⇒ reported as "not checked", never as "verified".
- **The demo pays a real merchant.** `payee` is written into the deployment manifest by
  `Deploy.s.sol` (`DEMO_PAYEE`, defaulting to the deployer). No more `0x1111…1111`.
- **Delivery survives a cold instance.** The queue is process memory, so the POST also
  returns a link carrying the validated request; the page merges it in. The link is a
  delivery channel, not a trust channel, approving still needs the passkey.
- **One store, two hosts.** `lib/queue-store.ts` is dependency-free and shared by the
  Next routes and the Cloudflare Worker, so the two deployments cannot disagree about
  what an agent asked for.

### Fixed a real bug in the Worker deployment path

The Worker's routes had drifted from the SDK's contract and would have failed on first
use:

- `/api/intent` expected `expiresInSeconds` while the SDK sends an absolute `expiry`
  (so `BigInt(NaN)`), ignored `actionType`, and returned no `intentId`.
- `/api/agent` scaled the amount a second time (the browser already sends base units),
  which would have made every approval a `ChallengeMismatch`, and only supported the
  ERC-20 path, the app has used the native MON path since the last revision.

Both now mirror the Next routes, including reading `intentId` from the `IntentCreated`
event rather than predicting it.

### `@witness/sdk` is a package now

- `packages/sdk` builds ESM + CJS + type declarations from the app's own modules, with
  `viem` as a peer. A `sync.mjs --check` gate runs before publish, so the package can
  never ship sources that lag the app.
- Verified by packing the tarball and installing it into a separate consumer: ESM
  import, CJS `require`, and a strict `tsc` pass over a file using the exported types.
  The tarball is 16 kB and contains only `dist`, the README and the licence.

### The claims are now checkable

- **All five contracts are `exact_match` on Sourcify** (readable on MonadVision),
  verified 2026-10-11. This needs no API key, which is why `contracts/verify.sh`
  defaults to it; Monadscan additionally needs `MONADSCAN_API_KEY`.
- **`THREAT-MODEL.md`**, actors and their powers, ten attack classes with mitigations
  *and residual risks*, an explicit out-of-scope list, and the weaknesses ranked. It
  records the uncomfortable ones: `forwardAsOwner` is a live owner-only arbitrary call,
  `setOperator` is not locked, the relayer owns the permissions it creates, and the
  decision endpoint is unauthenticated (a lying display, not a spending path).
- **`INTEGRATOR-KIT.md`**, outreach: who to contact, three templates, the 15-minute
  offer, and the three levels of "integration" that count.

### Docs

- README: the queue and the agent script, `npm i @witness/sdk`, explorer verification,
  and a *Who this is for* section naming three adopters with the "why not roll their
  own" answer for each.
- SUBMISSION: this pass recorded, and the honest-limits section now names the queue's
  durability boundary and the unauthenticated decision endpoint instead of leaving them
  for a reviewer to find.

## 2026-10-11, Witness Approvals: consumer experience + real ERC-8004 enforcement

Two goals: make the product usable by someone who has never used a wallet, and make the on-chain
configuration something you can actually rely on. Both required changing the deployed stack, so this
is a redeploy, not a patch.

### Contracts

- **ERC-8004 is enforced, not decorative.** The deploy script registers an agent identity (ERC-8004
  `#2148` on Monad testnet, owned by `AgentExecutor`), points the verifier at the official registry,
  and the verifier requires `ownerOf(agentId) == intent.agentWallet`. Previously the registry was
  unset on the live deployment, so the identity check was skipped entirely.
- **`AgentExecutor.onERC721Received`.** The registry mints with `_safeMint`, so a contract without
  the receiver hook cannot own an identity, the first broadcast of this revision reverted at
  registration *after* the token was minted. Found and fixed by running the deploy, then pinned with
  a regression test plus a mock that reproduces the real `_safeMint` behaviour.
- **Native MON path.** `DemoSafe` gained a second gated outbound path, `executeNative`, with its own
  action domain tag (`witness.action.transfer.native`). An ERC-20 approval can no longer be replayed
  as a MON payment at an identical amount and recipient, and vice versa.
- **One-way configuration locks.** `WitnessVerifier.lockConfiguration()` freezes the accepted
  origin (rpId) and the identity registry; `WitnessIntentRegistry.lockConfiguration()` freezes the
  verifier pointer and ownership; `DemoSafe.lockOwnership()` freezes ownership, which the fund path
  never consults anyway. Deployment performs all three.
  Removed `script/SetRelyingParty.s.sol`: after the lock it could only revert. Changing the accepted
  origin now means deploying a new stack, a visible on-chain action instead of a silent setting.
- **Removed the operator's arbitrary-call hatch.** `AgentExecutor.forward(target, data)` would have
  let a prompt-injected agent process call anything the executor can reach, including transferring
  away its own identity. The only forward is now `forwardAsOwner`, owner-only, used once at setup.
- `Deploy.s.sol` restructured around `Config`/`Deployed` structs. The flat version hit
  *"stack too deep"* once the ERC-8004 fields were added.

### Tests

- **40/40 passing** (`forge test`): 24 in `Witness.t.sol`, 16 new in `WitnessHardening.t.sol`
  covering the native path, cross-asset replay, the locks, the missing arbitrary-call surface, and
  the receiver-hook regression.
- **`examples/live-e2e.mjs`**, a live integration test against the *deployed* contracts, asserting
  four behaviours with real transactions: the approved action moves exactly the approved amount
  (tx `0xf6c0f6d871bab57c81aa9fb8a0a66992b4f5b2dcfa7a2cb99387f9b29e772978`), a replay is refused
  (`AlreadyConsumed`), an unapproved 10× request is refused (`OverLimit`), and an unowned ERC-8004 id
  is refused (`AgentNotRegistered`). 4/4.

### App, consumer experience

- **Plain language first.** Navigation is now `Approvals / Activity / Agents / Settings`. The approval
  screen is one sentence, *"Research Agent wants to spend 0.5 MON on Market Data API."*, with
  Approve and Block. Hashes, addresses, digests, chain ids and the identity id moved behind
  **Security details**.
- **Honest states.** Risk is derived from the permission on-chain (`Within your limit`,
  `Expiring soon`, `Over your limit`), not asserted. A dismissed passkey prompt is treated as the
  human's own refusal, not an error. Every refusal is the contract's typed reason in plain words.
- **The example request is labelled as an example**, in the UI, because this build has no request
  queue. The permission, the approval and every refusal are real transactions.
- **Craft.** Typed passkey-cancel handling, `aria-live` verdicts, roving tabindex with arrow-key tab
  navigation, 40px+ tap targets, visible focus rings, pressed states, AA contrast, reduced-motion
  support, no `transition: all`. Responsive at 375 / 768 / 1280; the four tabs fit at 375 without a
  hidden horizontal scroll. Metadata and copy rewritten user-first (*Witness Approvals*).
- The SDK now backs the app itself, so the product and the integration surface cannot drift.

### App, developer surface

- **`/integrate`**, the four calls, copy-paste snippets that are the real API, a live preflight that
  calls the deployed verifier from the browser (verified returning `Expired` then `NoSuchIntent` for
  real), and an explicit list of what the integrator still has to do.
- **`examples/monad-app.mjs`**, a runnable third-party integration: reads the manifest, reads the
  permission, fetches the digest from the contract, preflights, and prints the exact write path.
  Tolerates a deployment older than the source instead of crashing.

### Fixes

- Permission registration sent the ERC-20 action tag while the demo executes the native path, so
  every native attempt would have failed with `ActionTypeMismatch`. Now `NATIVE_ACTION_TYPE`.
- `app/lib/abi.ts` was missing `executeTransferNative` and `nativeActionHash`.
- The `/api/config` route read manifest fields the `Deployment` type did not declare.
- The "Security details" code identifiers rendered uppercase (`CREATEINTENT`) because they borrowed
  the status-pill styling.

### Toolchain and docs

- `.nvmrc` (22) and `engines: {"node": ">=20.11 <25"}` in both packages. The ffi scripts use only
  Node 20-compatible APIs; both were verified on Node 23.
- README rewritten: exact setup, supported versions, live addresses with explorer links, the supported
  flow, architecture, SDK usage, and a security-assumptions section that is explicit about what is
  **not** covered.
- `viem` added as a root dev dependency so the examples run without a build step.

### Redeployment

The stack was redeployed to Monad testnet and the trust-critical configuration locked; the app's
baked manifest was regenerated. **The hosted site still serves the previous build** and needs a
rebuild + redeploy to point at the new contracts.
