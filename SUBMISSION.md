# Witness — submission handoff

Status of every deliverable, and exactly what remains. Written to be picked up cold.

Repo: **https://github.com/thesithunyein/witness** (public, `main`), author *Sithu Nyein*.

| Environment | URL |
|---|---|
| **production (use this as the live link)** | **https://witness.sithunyein.com/** |
| older freebuff.page deployment | https://site-59ccda57b59c482da96dca239a3a1b63.freebuff.page |

Deployed on Monad testnet (10143). Contracts and rpId/origin are recorded in
`contracts/deployments/10143.json`; the app reads them from there, never by hand.

---

## 0. Current state (updated after the second deployment)

The stack was **redeployed** and the trust-critical configuration frozen. Everything below §1 that
mentions the *first* addresses describes a deployment that is now superseded — the behaviour it
records is still valid, the addresses are not.

| | Now |
|---|---|
| `WitnessIntentRegistry` | `0x3518B7A64D7Cc01e33a0F0A3Fa4111ad2Af3e521` |
| `WitnessVerifier` | `0xced20751479A13E76A67cC33C911e8eF61a81165` |
| `DemoSafe` (holds value) | `0xcb7187F16c2AE7E8494B82dBc73DDaE18b6e1309` |
| `AgentExecutor` | `0x5b451F0700df77293a5A737189BdbA3C37362d23` |
| `DemoUSD` | `0x5Bb70C698F3428802ac3C186EC0Da98a088A6d2c` |
| ERC-8004 identity | **`#2148`**, owned by `AgentExecutor`, in the official registry `0x8004A818BFB912233c491871b3d84c89A494BD9e` |

Changed in this pass:

- **ERC-8004 is now enforced.** The registry is set and the identity is bound, so an intent naming an
  agent id only verifies when the executor owns that id. The old "item 5" below is done.
- **One-way locks.** `lockConfiguration()` on both the verifier (accepted origin + identity registry)
  and the registry (verifier pointer), plus `DemoSafe.lockOwnership()`. `SetRelyingParty.s.sol` was
  removed: it could only revert after the lock. Changing the accepted origin now means deploying a new
  stack, deliberately.
- **Native MON path** with its own action tag, so an ERC-20 approval cannot be replayed as a MON
  payment.
- **40 contract tests** (was 24), including the ERC-721 receiver hook the identity mint needs.
- **`examples/live-e2e.mjs`** — 4/4 live checks against the deployed contracts: approved action moves
  exactly the approved amount, replay refused (`AlreadyConsumed`), 10× unapproved refused
  (`OverLimit`), unowned identity refused (`AgentNotRegistered`).
- **Consumer UI**: `Approvals / Activity / Agents / Settings`, plain-language approval, everything
  technical behind *Security details*, `/integrate` for third parties.

Still outstanding (unchanged): the passkey **approve** tap through the device prompt, the videos, an
external integrator, named adopters. And the hosted site must be **rebuilt and redeployed** to pick
up the new addresses — its manifest is baked at build time, so until then it serves the previous
stack.

---

## 1. Verified working — with evidence

### On-chain primitive (both networks)

| Thing | Evidence |
|---|---|
| Monad's P256 precompile is live and validating | `node scripts/probe-p256.mjs` → valid sig `ACCEPT`, tampered `reject`, on **both** mainnet (143) and testnet (10143), with a `sha256` control call so a silently-broken endpoint can't masquerade as a rejecting one. |
| High-S signatures accepted | `node scripts/probe-highs.mjs` → both S forms `ACCEPT`. Platform authenticators are not guaranteed to produce low-S; without this a live passkey demo could fail at random. |
| 40 contract tests pass | `cd contracts && forge test` (exit 0) — real P-256 signatures over real action digests through the real precompile. No mocking of the cryptography. (24 in the original suite, 16 added with the native path, the locks, and the identity mint.) |
| Gas | Full passkey authorization check ≈ **177k gas**; `executeTransfer` 70k–270k. |

### Contracts deployed (Monad testnet) — FIRST deployment, superseded

```
DemoUSD                0x817328dec94122b8eCB7f28a5839003352394430
WitnessIntentRegistry  0x17dACE260313bEa721a8Ed2254Bbbf19D7a9cF5B
WitnessVerifier        0xBE66C46f26fE006B4De2B6441011939F930C8C4D
DemoSafe               0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6
AgentExecutor          0x6ac484ac42E7eC9942365710b1F8C6106026B45e
```

These addresses are historical. That deployment predates the native path, the configuration locks
and the ERC-8004 binding — see §0 for the current stack.

Funded via https://faucet.monad.xyz (worked from the shared browser; the Turnstile checkbox needed a
real click). Deployer: `0xFc31378e13B4Cb7B545bAC58b28916476406439d`.

### Deployed app (static bundle + Cloudflare Worker)

`bun install` + `bunx tsc --noEmit` → clean (one real error found and fixed: a `Uint8Array`
`BufferSource` typing in the WebAuthn helper). Both bundles build; the worker builds with
`target: browser`, so any Node-only import fails the build, not the edge.

Exercised **against real testnet state**, through the deployed Worker:

- preview worker relayed `createIntent` and `revokeIntent` — real txs, confirmed receipts
- `POST /api/agent` with 10× the approved amount and no assertion → `{"ok":false,"reason":"OverLimit","reasonCode":8}` — a genuine reverted on-chain transaction, decoded to the protocol's own reason
- in-limit attempt with no assertion → `RpIdMismatch`; after revocation → `Revoked`

Exercised **on production, in a real browser**:

- page renders; `/api/config` serves the deployed addresses; `/healthz` reports `hostMatchesOrigin: true`
- **a real passkey was enrolled** (`navigator.credentials.create`) and the fingerprint was registered
  on-chain as the authority — the UI showed *"Passkey: enrolled in this browser"*, intent #6,
  tx `0xefb2443d…`, permission cap 1.00 DUSD, relying party = the production host
- the final step — **Approve with passkey** — starts the assertion ceremony and waits for the
  device's biometric/PIN prompt. That tap is the human step; everything before it is verified.

### Two bugs found by testing, both fixed

1. **Revert reasons were being lost.** The raw revert bytes sit ~7 causes deep in a
   `writeContract` error, but the walker stopped at 6 — every refusal collapsed to "Reverted",
   exactly the unhelpful outcome the decoder exists to prevent. Fixed with a deeper bound + cycle
   guard, and the executor ABI now declares the `Unauthorized` error.
2. **rpId used a guessed hostname.** The first deploy derived the host from the project id
   (hyphenated UUID), but the platform serves the hyphen-stripped form; Chrome rejected the passkey
   with *"the relying party ID is not a registrable domain suffix of the current domain"*.
   the relying party is now set at deploy time and then frozen, so it cannot drift from the hostname
   the app is served on.

## 2. What still needs a human

1. **Tap the passkey on the live site.** Open production, *Create permission with passkey* (a
   Windows Hello prompt appears), then *Approve with passkey*. The order that films best: click
   **Simulate prompt injection first** (the on-chain refusal), then approve. Each permission is
   one-time and expires in 10 minutes, so re-register before recording.
2. **Record the videos** (2 min pitch, 3 min demo) — the video is what is judged. Suggested beats in
   §4 below.
3. **One external integrator** — see §3. Worth 20% and cannot be coded.
4. **Three named adopters** — see §3. Worth 25%.
5. ~~Optional: ERC-8004 binding.~~ **DONE** — the registry is configured and verified on-chain, and
   identity `#2148` is owned by `AgentExecutor`. Enforcement is active in the deployed contracts; the
   only step left is rebuilding the hosted site so the app and the chain agree.
6. **Rebuild and redeploy the hosted app.** The addresses are baked into the bundle at build time, so
   `bun run build-worker.mjs` + a Vercel deploy is what makes witness.sithunyein.com talk to the
   current stack. Passkeys are bound to the hostname; the verifier's accepted origin is now immutable
   by design, so a host change means a new deployment rather than a settings update.

## 3. The two criteria that are not code

Deadline is Oct 13–14; assume the earlier. These carry 45% of the score.

### Traction (20%) — needs one other team

The criterion is "even one other team integrating during the hackathon". A second app built by you
scores nothing. A five-line integration for them:

```solidity
bytes32 actionHash = safe.actionHash(intentId, recipient, amount);
verifier.authorizeAndConsume(
    intentId, WitnessAction.TRANSFER, actionHash, amount, msg.sender, assertion
);
// reverts with Unauthorized(OverLimit | Expired | AlreadyConsumed | ...) otherwise
```

DM teams in the Metropolis Discord, offer to do the integration for them in 15 minutes, and name the
integration in the README and the video.

### Founder & market readiness (25%) — needs named adopters

Name three and say why each would not roll their own:

- **x402 paid endpoints** that need a payer authorization — today's spend controls are per-payment
  client-side caps with no accumulated session budget.
- **Monad DeFi agents** — swaps/transfers gated on human approval.
- **ERC-8004 agent marketplaces** — a listing that can prove human authorization, not just identity.

The "why not roll their own" answer: a receipt is only useful if the counterparty recognises it.
Rolling your own gives you a check nobody else verifies, and you would still have to write the
WebAuthn parsing, the replay/revocation state, and a receipt format — which is exactly this repo.

## 4. Demo video beats

1. 20s — problem: agent identity ≠ human authorization; a prompt-injected agent still has a valid identity.
2. 60s — live: register a permission with a passkey, approve one transfer, show it execute on MonadScan.
3. 45s — the injected attempt: 10× the amount, no approval, **rejected on-chain** with the reason
   visible (`OverLimit`). The refusal is a reverted transaction, not a client-side check.
4. 20s — architecture: one passkey signature over the action digest, verified by the counterparty
   through Monad's native P256 precompile.
5. 15s — integrations asked for. Say plainly: no wallet or funds needed to try it.

## 5. Platform caveats worth knowing

- **Hosting paused once.** Mid-session the platform returned 503 "Site temporarily unavailable"
  with quota monitoring "unavailable" ("Sites will resume when monitoring is available"). It
  resumed; if it recurs, publishing is not the cause — re-check the production URL rather than
  redeploying.
- **No local workerd test.** `wrangler`'s `workerd` postinstall fails in this environment; the
  worker was verified under bun (real testnet txs through the actual handlers) and then **on the
  deployed preview**, which is workerd — that is the authoritative check anyway.
- **No D1/R2 needed.** The demo keeps no server state beyond what is on-chain.
- The worker waits for receipts before responding (avoids rendering pre-transaction state) and
  reports a write that mined-and-reverted as a failure.

## 6. Positioning to keep

> ERC-8004 proves which agent is acting. ERC-8196 proves an action fits a policy the owner set once,
> enforced inside the agent's own wallet and signed with the agent's own key. Witness proves **this
> human approved this exact action, right now** — and the **counterparty** that receives the action
> can check it without trusting the agent.

Do not use "proves whether the agent was allowed to act": ERC-8196's stated core question is
literally "Is this action authorized right now?", so that framing reads as a re-skin. The
differentiators are per-action human consent, passkey-signed, verifiable by the receiving contract.

## 7. Honest limits

- The passkey **approve** step has been exercised up to the device prompt, not through it; the
  biometric tap itself is the outstanding human step.
- No external integrator, no named adopters, no videos, no logo.
- The hosted site still serves a build made before the second deployment; its addresses are stale
  until it is rebuilt.
- ERC-8004 enforcement is active on the current deployment (registry set, identity owned, both
  frozen). A test still states the no-registry behaviour explicitly, so the skip can never happen by
  accident.
- The action digest is a domain-separated `keccak256`, not a full EIP-712 envelope. Domain
  separation by chain id and contract is what the security argument needs; EIP-712 is a compatible
  upgrade.
- The demo relay key pays gas for registration. It cannot approve anything: approval requires the
  enrolled passkey, which never leaves the user's device.
