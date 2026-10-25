# Witness, threat model

Written to be attacked. Every claim below names the mechanism that enforces it and
the residual risk that remains, including the ones that are uncomfortable.

Reviewed by: nobody yet. This is the author's own model, published so a reviewer
can disagree with something specific. Treat it as a starting point, not a
certification.

Deployment this describes: chain `10143` (Monad testnet), addresses in
[`contracts/deployments/10143.json`](contracts/deployments/10143.json), source
verified with `exact_match` on Sourcify/MonadVision (`contracts/verify.sh`).

---

## 1. The one invariant

> **An agent cannot manufacture a human's approval, and a human's approval cannot
> be reused for a different action.**

Everything else in this document is either the machinery holding that up, or an
honest list of what it does not cover.

Note what is *not* claimed: Witness does not stop an agent from doing anything it
is authorized to do, does not judge whether a request is a good idea, and does
not constrain any contract that chooses not to call it.

---

## 2. Assets

| Asset | Where it lives | Who can move it |
|---|---|---|
| The passkey private key | The human's device (secure enclave / OS keychain) | The human, via biometric/PIN. Nobody else, ever. |
| Funds in `DemoSafe` (MON and the demo ERC-20) | `DemoSafe` contract | Only a call carrying a valid passkey assertion for that exact action |
| Permission records (`Intent`) | `WitnessIntentRegistry` | Created/revoked by the relayer; **consumed** only by the verifier during a successful authorization |
| ERC-8004 identity `#2148` | Owned by `AgentExecutor` | The executor's owner via `forwardAsOwner` |
| The accepted origin (`rpId`, `origin`) | `WitnessVerifier`, **frozen** | Nobody, locked at deployment |

---

## 3. Actors, and what each one can and cannot do

| Actor | Holds | Can | Cannot |
|---|---|---|---|
| **The human** | The passkey | Approve exactly one action, once; withdraw a permission | Be impersonated without their device; approve without a biometric/PIN step |
| **The agent process** (untrusted; may be prompt-injected) | Nothing secret | Ask for money; submit attempts; choose the recipient and amount it *asks* for | Approve; exceed the cap; spend twice; change the recipient of an approved action; call anything but the executor's two transfer paths |
| **The operator key** (server) | A signing key | Submit an attempt *as* `AgentExecutor` | Approve. `AgentExecutor.executeTransferNative` reaches `DemoSafe`, where the only authority is the passkey assertion |
| **The relayer key** (server) | A signing key | Create and revoke permission records, pay gas | Approve; redirect funds; change who may attempt an action |
| **The deployer** | Contract ownership | Rotate the executor's operator; `forwardAsOwner` on the executor; move the executor's own identity token | Change `rpId`/`origin`/identity registry (locked); change `DemoSafe` ownership (locked); move the safe's funds without a passkey assertion; mint an approval |
| **The app's server** (this repo's routes) | The two keys above, plus the request queue | Ask the browser for an assertion; display anything it likes | Produce a valid assertion. It never sees the passkey private key, so a fully compromised server yields forgeries that fail `BadSignature` |
| **The queue** (in-memory) | Unvalidated agent claims | Show the human a request | Grant anything. Decisions recorded there are notifications; the transaction is the receipt |
| **ERC-8004 Identity Registry** (external) | Identity ownership | Say who owns an agent id | Authorize anything |
| **The Monad RPC endpoint** | Nothing | Return wrong reads | Change state; forge a signature |

### Why the operator/relayer split matters

The operator can *trigger* an action but never *authorize* one; the relayer can
*register* a permission but never *spend* it. Neither key, nor both together, plus
a full server compromise, can move money to an address the human did not sign for.
That is the point of putting the check in the contract that holds the value rather
than in the agent's process.

---

## 4. Attack classes

| Attack | Mitigation | Residual risk |
|---|---|---|
| **Prompt injection**, the agent is told to send 10× the limit | `DemoSafe` checks the amount against the intent's cap; the digest binds the amount; the call reverts `OverLimit` | None for the cap. The agent can still *ask* for anything, and the human can be social-engineered into approving it |
| **Replay**, resubmit an approval that already worked | The intent is consumed on the first success; a second attempt reverts `AlreadyConsumed` | None. Proof: `examples/live-e2e.mjs` asserts it against the live deployment |
| **Cross-contract / cross-chain replay** | The digest includes the chain id and the calling contract address; the verifier is called by that same contract | None while the verifier is immutable and each counterparty uses its own address |
| **Cross-asset replay**, use an ERC-20 approval as a MON payment | Separate action tags (`witness.action.transfer` / `…transfer.native`), compared before the signature is checked | None |
| **Approval captured in transit**, grab the assertion from the network | Ownership: submitting it requires the operator key, and submitting the *same* action twice fails (`AlreadyConsumed`) | Whoever holds the operator key can submit a captured assertion **once**, but only for the exact action the human signed. Reusing it needs the operator key *and* the action to be unspent |
| **Amount or recipient tampering** | Both are inside the signed digest; the verifier recomputes from the calldata | None |
| **Approval for a different action** | `challenge == digest` is checked explicitly (`ChallengeMismatch`) | None |
| **Passkey phishing from another origin** | `clientDataJSON.origin` and `rpIdHash` are compared against the values frozen at deployment (`OriginMismatch`, `RpIdMismatch`) | The human can still be tricked on the *real* origin by a convincing request. That is why the screen shows the amount, the recipient and the service as one sentence |
| **WebAuthn semantic downgrade**, present with `UP` but no `UV` | `NoUserPresence` and `NoUserVerification` are distinct typed failures | None on-chain. Device policies are the device's business |
| **Wrong ceremony**, registration blob used as an assertion | The `webauthn.get` type is required (`WrongType`) | None |
| **Signature forgery** | P-256 verified through Monad's native precompile (`0x0100`, EIP-7951) against the public key stored on the intent. `r`/`s` are passed to the precompile unchanged, so validity is the precompile's answer, not this library's | Unaudited implementation. Note the signature is not restricted to low-`s`, so an ECDSA twin exists for any valid signature, harmless here, because a twin covers the *same* digest, and the digest's one-time use (the `consumed` flag) is what stops a second spend, not signature uniqueness |
| **Identity spoofing**, claim someone else's agent id | `ownerOf(agentId) == intent.agentWallet` against the live registry (`AgentNotRegistered`); the request queue performs the same check on arrival | If no registry is configured, the check is skipped and the app says so. A delegate-call or upgradeable registry could change ownership after the fact, the check is a point-in-time read |
| **Queue poisoning**, flood requests; queue a fake "approved" decision | Per-permission cap (25) and a global cap (100); identity verified on arrival; a forged decision is a display lie only and cannot move money | **Real:** the decision endpoint is unauthenticated, so a caller can mark a request `approved` with any `txHash`. Nothing is spent by that, and the agent must verify on-chain, `examples/agent-request.mjs` exits non-zero if the receipt is missing or reverted |
| **Server compromise** | Forgeries fail `BadSignature`; state-changing keys cannot approve | The compromised server can drain its own gas, show false information, and (with the operator key) spend an *already-signed* unspent action. Treat the demo keys as demo keys |
| **Denial of service**, stop the relayer from relaying | Out of scope for the contracts | The intended action becomes unexecutable. Witness is a gate, so failing closed is the safe direction, but an attacker with the relayer key can also *revoke* the permissions it created |
| **Grief: registering permissions the human did not ask for** | Only the relayer can create them, and the app's flow always enrolls a fresh passkey | A compromised relayer can create a permission naming its own passkey. `AgentNotRegistered`/cap checks still apply, but the *human* is not the authority on that intent. This is the strongest argument for the workspace note in §6 item 3 |

---

## 5. Explicitly out of scope

- **Contracts that do not call the verifier.** Witness constrains the counterparty
  that holds the value. An agent with its own keys and its own funds is not
  governed by anything here.
- **Whether an approved action should have been approved.** No policy engine, no
  spend analytics, no anomaly detection.
- **The agent's own runtime.** Prompt injection is assumed, not prevented.
- **Wallet and key management.** Server keys live in environment variables. That
  is appropriate for a testnet demo and nowhere near production.
- **Privacy.** Occupancy of the intent registry is public; amounts and recipients
  of approved actions are public.
- **Upgrade paths.** All contracts are immutable; the "upgrade" is a redeploy,
  which changes the addresses and therefore the `rpId` story with it.

---

## 6. Known weaknesses, ranked

1. **`AgentExecutor.forwardAsOwner` is a live owner-only arbitrary call.** It
   cannot move the safe's funds (both outbound paths still require a passkey
   assertion), but it can move the executor's own ERC-8004 identity token and call
   whatever else the executor can reach. It exists for the one-time registration
   step. *Hardening:* call it once, then transfer executor ownership to a
   timelock or `address(0)`.
2. **`AgentExecutor.setOperator` is not locked.** The deployer can hand the
   operator role to another key at any time. It grants the ability to *submit*
   attempts and nothing more, but for a deployment presented as "frozen
   configuration" it is an inconsistency worth stating: the *verifier* is frozen,
   the *executor's operator* is not.
3. **The relayer owns the permissions it creates.** The passkey is the authority
   over funds, but the relayer is `intent.user`, so the relayer can revoke. A
   production design would have the human sign the intent creation too (the
   contracts already carry the fields for it, `policyHash`, `credentialHash`,
   `qx`, `qy`, the missing piece is a second WebAuthn ceremony over the intent
   itself, which was out of scope for the demo).
4. **No rate limiting on the app's routes.** `POST /api/intent` and
   `POST /api/agent` will spend the server's gas as fast as a caller can ask.
   They are demo keys with testnet gas, but the pattern does not survive contact
   with a funded deployment.
5. **The queue is process memory.** See §4, queue poisoning: a recycled instance
   forgets requests, which is why the agent also gets a delivery link. Deliberate
   for a demo; wrong for a product that needs an audit trail of what was asked.
6. **No third-party audit.** The WebAuthn parsing and the verifier's check
   ordering are the parts where a mistake would be silent.
7. **Timing.** Permission expiry is `uint64` unix seconds compared against
   `block.timestamp`; on a chain with fast blocks this is fine, but a validator
   can only move it forward, never revive an expired permission.
8. **The relying party was written down in four places.** `rpId`/`origin` are frozen in the
   verifier, and an assertion signed for a different origin is refused with `RpIdMismatch`, which is
   correct but silent in the worst way: the *refusal* tests never need a valid signature, so a fixture
   pinned to the wrong origin passes most of the suite and fails only the approved path. That is
   exactly what a redeploy produced. `scripts/sign-action.mjs` and `scripts/gen-assertion.mjs` now
   read `contracts/deployments/<chain>.json` instead of carrying defaults. Residual: the two Foundry
   test files still declare their own `RP_ID`/`ORIGIN` constants, hand-maintained, with a comment
   pointing at the generator. Deriving them from the fixture at compile time would close it.

---

## 7. What "verified" means here

Two independent kinds of evidence, and neither is a screenshot:

**On-chain source verification.** All five deployed contracts match their source
with `exact_match` on Sourcify, readable at MonadVision. Reproduce:

```
cd contracts && ./verify.sh
```

Every address is read from the deployment manifest, and the script prints the
caveat that a submitted job is not a verified contract. Monadscan additionally
needs `MONADSCAN_API_KEY`; the Sourcify route needs no key, which is why it is the
default.

**Behavioural evidence.**

- `forge test`, 40 tests, including real P-256 signatures over real digests
  verified through the real precompile. No crypto is mocked.
- `node examples/live-e2e.mjs`, four assertions against the *deployed*
  contracts: the approved action moves exactly the approved amount, a replay is
  refused (`AlreadyConsumed`), an unapproved 10× request is refused (`OverLimit`),
  and an unowned ERC-8004 id is refused (`AgentNotRegistered`).
- `node examples/agent-request.mjs`, an out-of-process agent asks for money,
  polls for the decision, and then checks the transaction itself on Monad rather
  than believing the app.

The last one is the load-bearing test of this whole document: it demonstrates the
difference between a notification and a receipt.

---

## 8. For a production deployment

1. Audit `WebAuthn.sol` and `WitnessVerifier.sol`; they are the trust kernel.
2. Move the relayer/operator keys into a KMS or a hardware signer with per-key
   limits, and separate them into different failure domains.
3. Have the human sign intent *creation* as well as each action (see §6.3).
4. Replace the in-memory queue with durable storage that records who asked for
   what, when, and what the human decided, an audit trail, not a scratchpad.
5. Rate-limit and authenticate the app's routes.
6. Freeze the executor: `setOperator` to a fixed key you cannot change, and stop
   using `forwardAsOwner`.
7. Add monitoring on the failure reasons. A spike in `BadSignature` or
   `ChallengeMismatch` is the signature of someone trying to forge approvals, and
   right now nothing would tell you.
