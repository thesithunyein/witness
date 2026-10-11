# Changelog

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
