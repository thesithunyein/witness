# Witness, submission handoff

Status of every deliverable, and exactly what remains. Written to be picked up cold.

Repo: **https://github.com/thesithunyein/witness** (public, `main`), author *Sithu Nyein*.

| Environment | URL |
|---|---|
| **live site (use this as the live link)** | **https://witness-agent.vercel.app** |
| **deck** | **https://witness-agent.vercel.app/deck** |
| console | https://witness-agent.vercel.app/app |
| docs | https://witness-agent.vercel.app/docs |
| chain the site renders | Mezo testnet, 31611, `contracts/deployments/31611.json` |
| second deployment | Monad testnet, 10143, `contracts/deployments/10143.json` |
| origin the verifier is frozen to | https://witness-agent.vercel.app |

The live site is static and reads the addresses compiled into `src/data/witnessData.ts`, so deploying
new contracts means editing that file and redeploying the site. Two app surfaces exist here: the Vite
site at the repo root, which is what is deployed, and the Next build in `witness-app/`, which owns
the API routes and the relayer. Everything below that names a Monad address describes the second
deployment, not the site's chain.

### Read this before recording or judging

**The submitted link is the origin the contracts accept.** `WitnessVerifier` is frozen to `rpId` =
`witness-agent.vercel.app` and `origin` = `https://witness-agent.vercel.app`, and
`lockConfiguration()` makes both permanent, so the passkey prompt can only be drawn from the URL
above. The console enrolls a passkey against this origin; the approve path itself is exercised by
the contracts and the scripts in `examples/`. Nothing about the deployment depends on
`sithunyein.com` resolving.

This is a deliberate second stack. The first was frozen to `witness.sithunyein.com`; that domain
went NXDOMAIN at the TLD, and because a browser issues a passkey only for its own page's domain,
the approve step became impossible on every host that was still reachable while every read path kept
working. A deployment whose origin cannot be reached is a deployment that cannot demonstrate its
only interaction, so the fix was to redeploy against the origin that actually serves the product:

```bash
RP_ID=witness-agent.vercel.app ORIGIN=https://witness-agent.vercel.app \
  forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
```

The first stack is untouched on-chain and still bound to `witness.sithunyein.com`. If that DNS ever
returns, it changes nothing here: the addresses below are the submission's stack, and the app bakes
its manifest at build time so the site and the chain cannot silently disagree.

---

## 0. Monad stack, second deployment (10143)

The stack has been **redeployed twice** and the trust-critical configuration frozen each time.
Everything below that mentions the *earlier* addresses describes a deployment that is now
superseded: the behaviour it records is still valid, the addresses are not.

| | Monad stack (10143, frozen to the Vercel origin) |
|---|---|
| `WitnessIntentRegistry` | `0x84502BA6Bf4A565b84E8eC1747568d54610E71E2` |
| `WitnessVerifier` | `0x7836f1bDDdBF491c23a285B5015441a5A147D096` |
| `DemoSafe` (holds value) | `0x17fc3f962213bb9156Fd36c856B1FC0B696D9Ac8` |
| `AgentExecutor` | `0x7010c0474AA1c8E8039712d314d105D1aDe0a87d` |
| `DemoUSD` | `0xd5588C6f78d720D4a89929b4b68C546Dc788D65A` |
| ERC-8004 identity | **`#2240`**, owned by `AgentExecutor`, in the official registry `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Accepted origin | `witness-agent.vercel.app` / `https://witness-agent.vercel.app`, frozen |
| Source verification | all five `exact_match` on MonadVision, matchIds `2053971` to `2053975` |

Superseded stacks, kept for the record and still on-chain: the second (`WitnessVerifier`
`0xced20751…`, identity `#2148`) was frozen to `witness.sithunyein.com`, and the first was the
pre-ERC-8004 deployment. Both accept assertions only from an origin that no longer resolves.

### Third pass, the agent actually asks

Everything here is new since §0 was written. The theme: the two things the previous revision only
*claimed* are now real, and the trust claims are now checkable by a stranger.

- **The hero moment is no longer a fixture.** The request on the approval screen used to be three
  constants in `page.tsx`. It is now a real HTTP request: an agent process `POST`s to `/api/requests`,
  the page renders exactly what arrived, and the agent polls `/api/requests/:id` for the decision.
  If nothing has asked, the screen says so and names the command that makes an agent ask, it does not
  invent a request to look finished. `examples/agent-request.mjs` is that agent.
- **The agent verifies the payment itself.** It does not believe the app's "approved": it reads the
  receipt from Monad and exits non-zero if the transaction is missing, reverted, or unconfirmed. A
  queue is a notification; the chain is the receipt.
- **The demo pays a real merchant.** `payee` is recorded in the deployment manifest by the deploy
  script (default: the deployer), so the money lands at an address with an on-chain history instead
  of `0x1111…1111`.
- **`@witness-agent/sdk` is a package**, not four files to copy: `packages/sdk` builds ESM + CJS + type
  declarations from the app's own modules, so the product and the integration surface cannot drift.
  Verified by installing the packed tarball into a separate consumer and importing it three ways.
- **Verified on an explorer, keylessly.** All five contracts are `exact_match` on Sourcify
  (MonadVision), re-checked 2026-10-11: matchIds `2047996` to `2048000`, `runtimeMatch: exact_match`
  on each, so a judge can read the source instead of trusting this document. `contracts/verify.sh`
  reproduces the submission; check each job's result, because submitting is not verifying.
  Monadscan additionally needs `MONADSCAN_API_KEY`.
- **`THREAT-MODEL.md`**, every actor, every attack class with mitigation *and residual risk*, and the
  weaknesses ranked. It says out loud that `AgentExecutor.forwardAsOwner` is a live owner-only
  arbitrary call, that `setOperator` is not locked, and that the relayer owns the permissions it
  creates.
- **`INTEGRATOR-KIT.md`**, the outreach kit: what counts as an integration, the 15-minute offer, and
  three message templates. Outreach itself still needs your hands; that is the one thing here I
  cannot do.

**Verified on production** (against the live host above, so none of this is a claim about a local
checkout):

- `GET /api/config` returns the five addresses below with `identityEnforced: true` and
  `configurationLocked: true` (before this pass it returned the *previous* addresses with
  `identityEnforced: false`, the live product was weaker than the repo said).
- The Settings tab renders *Enforced* / *Frozen*, checked in a real browser.
- A real agent process POSTed a request to production, got back a delivery link, and the page rendered
  "Research Agent wants to spend 0.5 MON on Market Data API" from what arrived. The page's queue poll
  (`GET /api/requests?intentId=…` every 3 s) returns 200 with no console errors.
- The agent polls, observes the human's decision, and reports it: *REFUSED, the contract would not
  allow it*, with the typed reason and code.
- The identity check is live: an id the executor does not own is refused with HTTP 403, and id `#2240`
  is confirmed as owned by `AgentExecutor` on the real registry.
- `/api/agent` on production still refuses a 10× attempt with a decoded `OverLimit`, and an in-limit
  unsigned attempt with `RpIdMismatch`, real reverted transactions, not client checks.

Changed in the second pass:

- **ERC-8004 is now enforced.** The registry is set and the identity is bound, so an intent naming an
  agent id only verifies when the executor owns that id. The old "item 5" below is done.
- **One-way locks.** `lockConfiguration()` on both the verifier (accepted origin + identity registry)
  and the registry (verifier pointer), plus `DemoSafe.lockOwnership()`. `SetRelyingParty.s.sol` was
  removed: it could only revert after the lock. Changing the accepted origin now means deploying a new
  stack, deliberately.
- **Native MON path** with its own action tag, so an ERC-20 approval cannot be replayed as a MON
  payment.
- **40 contract tests** (was 24), including the ERC-721 receiver hook the identity mint needs.
- **`examples/live-e2e.mjs`**, 4/4 live checks against the deployed contracts: approved action moves
  exactly the approved amount, replay refused (`AlreadyConsumed`), 10× unapproved refused
  (`OverLimit`), unowned identity refused (`AgentNotRegistered`). Re-run 2026-10-13 against the
  redeployed stack: 4/4 passed, the approved path landing as tx `0x13d7cd50…` (block 70,639,621,
  status success, 336,107 gas), and the two refused permissions revoked at the end so a run leaves
  no unusable state behind.
- **Consumer UI**: `Approvals / Activity / Agents / Settings`, plain-language approval, everything
  technical behind *Security details*, `/docs` for third parties.

Still outstanding: the passkey **approve** tap recorded end to end, the videos, an external
integrator, named adopters. The hosted site **has been rebuilt and redeployed**, and that is
verified against production rather than assumed: `GET /api/config` there returns the addresses in
`contracts/deployments/10143.json` with `identityEnforced: true` and `configurationLocked: true`, so
the manifest it serves is the current stack, not the previous one.

---

## 1. Verified working, with evidence

### On-chain primitive (both networks)

| Thing | Evidence |
|---|---|
| Monad's P256 precompile is live and validating | `node scripts/probe-p256.mjs` → valid sig `ACCEPT`, tampered `reject`, on **both** mainnet (143) and testnet (10143), with a `sha256` control call so a silently-broken endpoint can't masquerade as a rejecting one. |
| High-S signatures accepted | `node scripts/probe-highs.mjs` → both S forms `ACCEPT`. Platform authenticators are not guaranteed to produce low-S; without this a live passkey demo could fail at random. |
| 40 contract tests pass | `cd contracts && forge test` (exit 0), real P-256 signatures over real action digests through the real precompile. No mocking of the cryptography. (24 in the original suite, 16 added with the native path, the locks, and the identity mint.) |
| Gas, measured | An approved passkey authorized transfer costs **336,107 gas** end to end on testnet (tx `0x13d7cd50…`, block 70,639,621). `forge test --gas-report`: `executeTransfer` 75k to 273k, `executeTransferNative` 78k to 268k, `createIntent` avg 253k. |

### Contracts deployed (Monad testnet), FIRST deployment, superseded

```
DemoUSD                0x817328dec94122b8eCB7f28a5839003352394430
WitnessIntentRegistry  0x17dACE260313bEa721a8Ed2254Bbbf19D7a9cF5B
WitnessVerifier        0xBE66C46f26fE006B4De2B6441011939F930C8C4D
DemoSafe               0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6
AgentExecutor          0x6ac484ac42E7eC9942365710b1F8C6106026B45e
```

These addresses are historical. That deployment predates the native path, the configuration locks
and the ERC-8004 binding, see §0 for the current stack.

Funded via https://faucet.monad.xyz (worked from the shared browser; the Turnstile checkbox needed a
real click). Deployer: `0xFc31378e13B4Cb7B545bAC58b28916476406439d`.

### Deployed app (static bundle + Cloudflare Worker)

`bun install` + `bunx tsc --noEmit` → clean (one real error found and fixed: a `Uint8Array`
`BufferSource` typing in the WebAuthn helper). Both bundles build; the worker builds with
`target: browser`, so any Node-only import fails the build, not the edge.

Exercised **against real testnet state**, through the deployed Worker:

- preview worker relayed `createIntent` and `revokeIntent`, real txs, confirmed receipts
- `POST /api/agent` with 10× the approved amount and no assertion → `{"ok":false,"reason":"OverLimit","reasonCode":8}`, a genuine reverted on-chain transaction, decoded to the protocol's own reason
- in-limit attempt with no assertion → `RpIdMismatch`; after revocation → `Revoked`

Exercised **on production, in a real browser**:

- page renders; `/api/config` serves the deployed addresses; `/healthz` reports `hostMatchesOrigin: true`
- **a real passkey was enrolled** (`navigator.credentials.create`) and the fingerprint was registered
  on-chain as the authority, the UI showed *"Passkey: enrolled in this browser"*, intent #6,
  tx `0xefb2443d…`, permission cap 1.00 DUSD, relying party = the production host
- the final step, **Approve with passkey**, starts the assertion ceremony and waits for the
  device's biometric/PIN prompt. That tap is the human step; everything before it is verified.

### Two bugs found by testing, both fixed

1. **Revert reasons were being lost.** The raw revert bytes sit ~7 causes deep in a
   `writeContract` error, but the walker stopped at 6, every refusal collapsed to "Reverted",
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
2. **Record the videos** (2 min pitch, 3 min demo), the video is what is judged. Suggested beats in
   §4 below.
3. **One external integrator**, worth 20% and cannot be coded. The kit is written
   ([`INTEGRATOR-KIT.md`](INTEGRATOR-KIT.md)): who to contact, three message templates, the
   15-minute offer, and what to ask for in return. It needs a human with a Discord account.
4. **Three named adopters**, worth 25%. Now written up in the README under *Who this is for*,
   each with the "why they would not roll their own" answer. What is missing is an outsider
   agreeing with one of them, which is item 3.
5. ~~Optional: ERC-8004 binding.~~ **DONE**, the registry is configured and verified on-chain, and
   identity `#2148` is owned by `AgentExecutor`. Enforcement is active in the deployed contracts, and
   the hosted app and the chain agree, see item 7.
6. ~~Publish the SDK.~~ **DONE**: `@witness-agent/sdk@0.1.0` is on npm (pushed 2026-10-13).
   The org name `witness` was taken, so the package ships under the `witness-agent` scope created
   for it; the registry serves it (shasum `9e53a41499c100dcac2e1ff7cf82d60a5e3cf5b3`), and
   `npm i @witness-agent/sdk viem` was verified from a clean consumer, ESM and CJS both importing.
   Future versions ship with `cd packages/sdk && npm publish --access public`; `prepublishOnly`
   runs the drift check and the build.

7. ~~Rebuild and redeploy the hosted app.~~ **DONE**, and verified against production rather than
   assumed, see "Verified on production" in §0. Passkeys are bound to the hostname, and the verifier's accepted origin is
   immutable by design, so a future host change means a new deployment, not a settings update.

## 3. The two criteria that are not code

Deadline is Oct 13-14; assume the earlier. These carry 45% of the score.

### Traction (20%), needs one other team

The criterion is "even one other team integrating during the hackathon". A second app built by you
scores nothing. [`INTEGRATOR-KIT.md`](INTEGRATOR-KIT.md) has the messages; the five-line
integration for them:

```solidity
bytes32 actionHash = safe.actionHash(intentId, recipient, amount);
verifier.authorizeAndConsume(
    intentId, WitnessAction.TRANSFER, actionHash, amount, msg.sender, assertion
);
// reverts with Unauthorized(OverLimit | Expired | AlreadyConsumed | ...) otherwise
```

DM teams in the Metropolis Discord, offer to do the integration for them in 15 minutes, and name the
integration in the README and the video. Three levels count, cheapest first: L1 = they run
`examples/monad-app.mjs` against the deployed stack; L2 = their backend asks Witness before releasing
a resource; L3 = their contract calls `authorizeAndConsume` and the tx is on Monadscan. Get one L1
before spending a day on an L3, it is a real third party confirming the integration surface works,
and it takes them fifteen minutes.

### Founder & market readiness (25%), needs named adopters

Name three and say why each would not roll their own:

- **x402 paid endpoints** that need a payer authorization, today's spend controls are per-payment
  client-side caps with no accumulated session budget.
- **Monad DeFi agents**, swaps/transfers gated on human approval.
- **ERC-8004 agent marketplaces**, a listing that can prove human authorization, not just identity.

The "why not roll their own" answer: a receipt is only useful if the counterparty recognises it.
Rolling your own gives you a check nobody else verifies, and you would still have to write the
WebAuthn parsing, the replay/revocation state, and a receipt format, which is exactly this repo.

## 4. Demo video beats

Film on **https://witness-agent.vercel.app**, the origin the contracts were frozen to: the approve
tap needs a passkey, and a browser only issues one for its own page's domain, which is why the
contracts were redeployed against this host. Nothing needs an account, a wallet or testnet funds:
registration and gas are relayed, and the approval is a passkey on the recording device, one tap to
enroll. Re-register a fresh permission immediately before the take, each one is single-use and
expires in 10 minutes.

1. 20s, problem: agent identity ≠ human authorization; a prompt-injected agent still has a valid identity.
2. 60s, live: register a permission with a passkey, approve one transfer, show it execute on MonadScan.
   Open tx `0x13d7cd50…` (block 70,639,621, 336,107 gas, status success) on
   `testnet.monadscan.com` beforehand, so you know what the confirmation screen should look like; it
   is a real approved transfer from 2026-10-11 and the receipt a judge can check.
3. 45s, the injected attempt: 10× the amount, no approval, **rejected on-chain** with the reason
   visible (`OverLimit`). The refusal is a reverted transaction, not a client-side check. Then say
   the five-minute route into this repo for a stranger: `node examples/monad-app.mjs`.
4. 20s, architecture: one passkey signature over the action digest, verified by the counterparty
   through Monad's native P256 precompile.
5. 15s, integrations asked for. Say plainly: no wallet or funds needed to try it.

### Pre-flight, and what goes wrong

Thirty minutes before the take, not during it.

- **Fresh permission, created immediately before you record.** Each one is single-use and expires in
  ten minutes, so a take that starts late has no approve button. Create it, then start within two.
- **The real receipt open in a second tab.** `0x13d7cd50…` on `testnet.monadscan.com`, block
  70,639,621, status success. Know what the confirmation screen looks like before you need it live.
- **Native MON in the safe.** `live-e2e.mjs` spends the safe's 0.5 MON on the approved path, so after
  a run the safe is empty and the native approve beat has nothing to move. Top it up before filming
  (`cast send <safe> --value 0.5ether …`), or film the DemoUSD path, which stays pre-funded with
  1000 valueless tokens and needs no faucet.
- **Terminal already warm.** `npm install` finished at the repo root, so `node examples/agent-request.mjs`
  prints its first line instantly instead of resolving dependencies on camera.
- **Instance alive:** `curl -s https://witness-agent.vercel.app/api/config` returns 200. The queue is
  process memory, so an instance recycle is the one event that can lose a request mid-take. If the
  agent's `POST` returns a `shareUrl`, open that link rather than waiting for the poll: it carries the
  validated request in the URL.
- **Passkey enrolled on the recording device.** The tap needs a platform authenticator on that
  device: fingerprint, face, or the device PIN where there is no biometric sensor. Enrol beforehand.
- **Pick your first frame deliberately.** If a permission already exists in this browser, the screen
  opens on the request card, not the setup form. `Settings` then `Clear this browser's Witness data`
  gives the empty state back.

Two frames have to be readable on screen by the end: the approved transaction on MonadScan with
status success, and the injected attempt showing the contract's own typed reason, `OverLimit`.
Those are the argument. Everything else is commentary.

## 5. Platform caveats worth knowing

- **Hosting paused once.** Mid-session the platform returned 503 "Site temporarily unavailable"
  with quota monitoring "unavailable" ("Sites will resume when monitoring is available"). It
  resumed; if it recurs, publishing is not the cause, re-check the production URL rather than
  redeploying.
- **No local workerd test.** `wrangler`'s `workerd` postinstall fails in this environment; the
  worker was verified under bun (real testnet txs through the actual handlers) and then **on the
  deployed preview**, which is workerd, that is the authoritative check anyway.
- **No D1/R2 needed.** The demo keeps no server state beyond what is on-chain.
- The worker waits for receipts before responding (avoids rendering pre-transaction state) and
  reports a write that mined-and-reverted as a failure.

## 6. Positioning to keep

> ERC-8004 proves which agent is acting. ERC-8196 proves an action fits a policy the owner set once,
> enforced inside the agent's own wallet and signed with the agent's own key. Witness proves **this
> human approved this exact action, right now**, and the **counterparty** that receives the action
> can check it without trusting the agent.

Do not use "proves whether the agent was allowed to act": ERC-8196's stated core question is
literally "Is this action authorized right now?", so that framing reads as a re-skin. The
differentiators are per-action human consent, passkey-signed, verifiable by the receiving contract.

## 7. Honest limits

- The passkey **approve** step has been exercised up to the device prompt, not through it; the
  biometric tap itself is the outstanding human step.
- The request queue is **process memory** on the server. A recycled instance forgets, which is why
  the agent's `POST` also returns a delivery link carrying the validated request. The agent's own
  re-send loop covers the same gap. A production version needs durable storage and an audit trail.
- The **decision** endpoint (`POST /api/requests/:id/decision`) is unauthenticated: anyone can mark a
  request approved with any transaction hash. That spends nothing, the money moves only through
  `/api/agent`, which needs a passkey assertion, and it is why `examples/agent-request.mjs` verifies
  the receipt on-chain instead of trusting the answer. It is still a lying-display surface, and
  `THREAT-MODEL.md` lists it as one.
- **`AgentExecutor.forwardAsOwner` is a live owner-only arbitrary call** on the executor, and
  `setOperator` is not locked. Neither can move the safe's funds, both outbound paths still require
  a passkey assertion, but the executor's own identity token is reachable, and calling that
  "frozen configuration" would be generous.
- No external integrator, no named adopters who agreed to be named, no videos yet. The logo exists,
  at [`assets/logo.png`](assets/logo.png), a 53 KB PNG, inside the 3 MB cap.
- The hosted site was rebuilt and redeployed, and `GET /api/config` on production returns the
  current addresses (verified against the live response, not against the local manifest). Passkeys
  are bound to the hostname and the verifier's accepted origin is immutable, so a future host change
  means a new deployment, not a settings update.
- ERC-8004 enforcement is active on the current deployment (registry set, identity owned, both
  frozen). A test still states the no-registry behaviour explicitly, so the skip can never happen by
  accident.
- The action digest is a domain-separated `keccak256`, not a full EIP-712 envelope. Domain
  separation by chain id and contract is what the security argument needs; EIP-712 is a compatible
  upgrade.
- The demo relay key pays gas for registration. It cannot approve anything: approval requires the
  enrolled passkey, which never leaves the user's device.
