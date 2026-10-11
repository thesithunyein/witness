# Changelog

## 2026-10-11 (later) — the agent actually asks: a real request queue, a real package, a threat model

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
- **`examples/agent-request.mjs`** — the agent as a separate process: it asks, polls
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
  delivery channel, not a trust channel — approving still needs the passkey.
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
  ERC-20 path — the app has used the native MON path since the last revision.

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
- **`THREAT-MODEL.md`** — actors and their powers, ten attack classes with mitigations
  *and residual risks*, an explicit out-of-scope list, and the weaknesses ranked. It
  records the uncomfortable ones: `forwardAsOwner` is a live owner-only arbitrary call,
  `setOperator` is not locked, the relayer owns the permissions it creates, and the
  decision endpoint is unauthenticated (a lying display, not a spending path).
- **`INTEGRATOR-KIT.md`** — outreach: who to contact, three templates, the 15-minute
  offer, and the three levels of "integration" that count.

### Docs

- README: the queue and the agent script, `npm i @witness/sdk`, explorer verification,
  and a *Who this is for* section naming three adopters with the "why not roll their
  own" answer for each.
- SUBMISSION: this pass recorded, and the honest-limits section now names the queue's
  durability boundary and the unauthenticated decision endpoint instead of leaving them
  for a reviewer to find.

## 2026-10-11 — Witness Approvals: consumer experience + real ERC-8004 enforcement

Two goals: make the product usable by someone who has never used a wallet, and make the on-chain
configuration something you can actually rely on. Both required changing the deployed stack, so this
is a redeploy, not a patch.

### Contracts

- **ERC-8004 is enforced, not decorative.** The deploy script registers an agent identity (ERC-8004
  `#2148` on Monad testnet, owned by `AgentExecutor`), points the verifier at the official registry,
  and the verifier requires `ownerOf(agentId) == intent.agentWallet`. Previously the registry was
  unset on the live deployment, so the identity check was skipped entirely.
- **`AgentExecutor.onERC721Received`.** The registry mints with `_safeMint`, so a contract without
  the receiver hook cannot own an identity — the first broadcast of this revision reverted at
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
  origin now means deploying a new stack — a visible on-chain action instead of a silent setting.
- **Removed the operator's arbitrary-call hatch.** `AgentExecutor.forward(target, data)` would have
  let a prompt-injected agent process call anything the executor can reach, including transferring
  away its own identity. The only forward is now `forwardAsOwner`, owner-only, used once at setup.
- `Deploy.s.sol` restructured around `Config`/`Deployed` structs. The flat version hit
  *"stack too deep"* once the ERC-8004 fields were added.

### Tests

- **40/40 passing** (`forge test`): 24 in `Witness.t.sol`, 16 new in `WitnessHardening.t.sol`
  covering the native path, cross-asset replay, the locks, the missing arbitrary-call surface, and
  the receiver-hook regression.
- **`examples/live-e2e.mjs`** — a live integration test against the *deployed* contracts, asserting
  four behaviours with real transactions: the approved action moves exactly the approved amount
  (tx `0xf6c0f6d871bab57c81aa9fb8a0a66992b4f5b2dcfa7a2cb99387f9b29e772978`), a replay is refused
  (`AlreadyConsumed`), an unapproved 10× request is refused (`OverLimit`), and an unowned ERC-8004 id
  is refused (`AgentNotRegistered`). 4/4.

### App — consumer experience

- **Plain language first.** Navigation is now `Approvals / Activity / Agents / Settings`. The approval
  screen is one sentence — *"Research Agent wants to spend 0.5 MON on Market Data API."* — with
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

### App — developer surface

- **`/integrate`** — the four calls, copy-paste snippets that are the real API, a live preflight that
  calls the deployed verifier from the browser (verified returning `Expired` then `NoSuchIntent` for
  real), and an explicit list of what the integrator still has to do.
- **`examples/monad-app.mjs`** — a runnable third-party integration: reads the manifest, reads the
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
