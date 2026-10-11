# Witness — submission handoff

Status of every deliverable, and exactly what remains. Written to be picked up cold.

Repo: **https://github.com/thesithunyein/witness** (public, `main`), author *Sithu Nyein*.

| Environment | URL |
|---|---|
| **production (use this as the live link)** | **https://site-59ccda57b59c482da96dca239a3a1b63.freebuff.page** |
| preview | https://site-00aa824871a54fa780926606463225c5.freebuff.page |

Deployed on Monad testnet (10143). Contracts and rpId/origin are recorded in
`contracts/deployments/10143.json`; the app reads them from there, never by hand.

---

## 1. Verified working — with evidence

### On-chain primitive (both networks)

| Thing | Evidence |
|---|---|
| Monad's P256 precompile is live and validating | `node scripts/probe-p256.mjs` → valid sig `ACCEPT`, tampered `reject`, on **both** mainnet (143) and testnet (10143), with a `sha256` control call so a silently-broken endpoint can't masquerade as a rejecting one. |
| High-S signatures accepted | `node scripts/probe-highs.mjs` → both S forms `ACCEPT`. Platform authenticators are not guaranteed to produce low-S; without this a live passkey demo could fail at random. |
| 24 contract tests pass | `cd contracts && forge test` (exit 0) — real P-256 signatures over real action digests through the real precompile. No mocking of the cryptography. |
| Gas | Full passkey authorization check ≈ **177k gas**; `executeTransfer` 70k–270k. |

### Contracts deployed (Monad testnet, ~1.1 MON gas)

```
DemoUSD                0x817328dec94122b8eCB7f28a5839003352394430
WitnessIntentRegistry  0x17dACE260313bEa721a8Ed2254Bbbf19D7a9cF5B
WitnessVerifier        0xBE66C46f26fE006B4De2B6441011939F930C8C4D
DemoSafe               0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6
AgentExecutor          0x6ac484ac42E7eC9942365710b1F8C6106026B45e
```

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
   `contracts/script/SetRelyingParty.s.sol` now updates the verifier **and** the manifest in one
   command so they cannot drift.

## 2. What still needs a human

1. **Tap the passkey on the live site.** Open production, *Create permission with passkey* (a
   Windows Hello prompt appears), then *Approve with passkey*. The order that films best: click
   **Simulate prompt injection first** (the on-chain refusal), then approve. Each permission is
   one-time and expires in 10 minutes, so re-register before recording.
2. **Record the videos** (2 min pitch, 3 min demo) — the video is what is judged. Suggested beats in
   §4 below.
3. **One external integrator** — see §3. Worth 20% and cannot be coded.
4. **Three named adopters** — see §3. Worth 25%.
5. **Optional: ERC-8004 binding.** `erc8004IdentityRegistry` is `0x0` in the manifest, so the UI
   shows "not configured". To enforce it: confirm the registry address on-chain (Monad's own doc
   page renders its address section blank — verify before trusting any address), redeploy with
   `ERC8004_IDENTITY_REGISTRY=0x…`, and mint an agent id owned by the executor.
6. **`witness.sithunyein.com` is not attached.** The Sites API exposes no custom-domain parameter —
   only `*.freebuff.page` URLs. Options: attach the domain in the app's Sites UI if offered, or keep
   the freebuff.page link. If the host changes, run `SetRelyingParty` (see README) and redeploy;
   passkeys are bound to the hostname.

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
- `witness.sithunyein.com` cannot be attached with the current platform tooling.
- ERC-8004 is enforced only when a registry is configured; a test states the skip behaviour
  explicitly so it is never accidental.
- The action digest is a domain-separated `keccak256`, not a full EIP-712 envelope. Domain
  separation by chain id and contract is what the security argument needs; EIP-712 is a compatible
  upgrade.
- The demo relay key pays gas for registration. It cannot approve anything: approval requires the
  enrolled passkey, which never leaves the user's device.
