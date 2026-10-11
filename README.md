# Witness

**The proof-of-intent layer for AI agents.**

An agent can prove *who it is* with ERC-8004. Witness proves *what the human actually authorized*.

An AI agent can be prompt-injected, can misread a request, or can act on instructions the user
never gave. Agent identity alone does not tell you whether a person approved *this* action. Witness
makes that checkable: before an agent moves value, it must present a **passkey-signed intent
receipt** binding the human, the agent, the exact action, the amount, and an expiry — verified
on-chain through Monad's native P256 precompile.

```
        passkey tap                         on-chain, before funds move
human ──────────────▶ intent receipt ──────────────▶ counterparty (vault, DEX, x402 endpoint)
                       (P256 / WebAuthn)                     │
                                                             ├─ Allowed  → execute
                                                             └─ BLOCKED  → revert + reason
```

---

## Live

| Environment | URL |
|---|---|
| production | https://site-59ccda57b59c482da96dca239a3a1b63.freebuff.page |
| preview | https://site-00aa824871a54fa780926606463225c5.freebuff.page |

Deployed on **Monad testnet (10143)**. Judges need no wallet and no funds: registration and gas are
relayed by the server, and the approval is a passkey on the visitor's own device. The relay key can
never approve anything — approval requires the enrolled passkey, which never leaves the user's
device.

> **Relying party binding.** The verifier stores the `rpId`/`origin` it enforces (the deployed
> hostname). If the host changes, one command updates the chain and the app manifest together —
> they can never drift:
>
> ```bash
> cd contracts
> set -a && source ../.env && set +a
> RP_ID=new-host.example ORIGIN=https://new-host.example \
>   forge script script/SetRelyingParty.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
> cd ../app && bun run build-worker.mjs && # redeploy
> ```
>
> This is not hypothetical: the first deploy here used a hostname guessed from the project id, and
> Chrome rejected the passkey with *"the relying party ID is not a registrable domain suffix of the
> current domain"*. Always bind to the hostname the platform actually serves.

---

## Why this is a primitive, not a feature

A check that lives inside the agent's own code proves nothing — the agent could simply not call it.
So Witness is enforced by the **counterparty** that holds or gates the value:

- `DemoSafe` holds funds and has exactly **one** outbound path, `execute`.
- `execute` requires a P256 signature over a digest binding **chain id, the safe's address, the
  intent id, the action type, the token, the recipient, and the exact amount**.
- A malicious agent that bypasses the agent contract entirely and calls `DemoSafe.execute` directly
  still cannot move a single token.

Any contract, API, or agent runtime can adopt the same check in a few lines.

## How it works

1. **Enroll.** The human creates a passkey. Its public key is stored in
   `WitnessIntentRegistry` — *not* supplied per call, because P-256 signatures support no public key
   recovery. A caller-supplied key would let any attacker authorize anything by signing with their
   own key.
2. **Authorize.** The human approves one specific action with a passkey tap. The challenge signed is
   the canonical action digest, so the approval is bound to that exact action.
3. **Verify.** Before moving value, the counterparty calls the verifier. It checks, in order:
   the intent exists, is unrevoked, unexpired, unconsumed, the actor is the registered agent, the
   agent really owns the claimed ERC-8004 id, the action type matches, the amount is within the cap,
   and finally that the passkey signed *this* digest from *our* origin with user verification.
4. **Report.** Every rejection returns a distinct reason — "expired", "already spent", "over the
   approved amount" — not a bare revert. Wallets and agents get a real explanation.

### What the passkey signature actually covers

Inside `clientDataJSON` the challenge is the action digest, and before trusting the signature the
verifier enforces the WebAuthn semantics that carry the meaning of the approval:

| Check | Why |
|---|---|
| `rpIdHash == sha256(rpId)` | the assertion came from our relying party |
| flags `UP` and `UV` set | a human was present **and** verified (biometric/PIN) |
| `type == "webauthn.get"` | a registration ceremony must not authorize an action |
| `challenge == actionDigest` | the human approved *this* action, not "some" approval |
| `origin == expected` | anti-phishing |
| P-256 signature valid | authenticity, verified by the `0x0100` precompile |

Verifying only the raw precompile signature would accept a signature over *any* digest — which
proves nothing about what the human approved. That distinction is the whole point of this repo.

---

## Contracts

| Contract | Role |
|---|---|
| `WitnessIntentRegistry` | stores permissions and the enrolled passkey public key; enforces one-time use and revocation |
| `WitnessVerifier` | the check itself; returns typed `Reason` values |
| `DemoSafe` | demo counterparty; holds funds, one gated outbound path |
| `AgentExecutor` | the agent's on-chain identity and entry point |
| `DemoUSD` | valueless test asset |

### Verified on Monad

The primitive is proven against **live chain state**, not just a local EVM:

```bash
node scripts/probe-p256.mjs
```

```
=== https://rpc.monad.xyz ===
chainId: 0x8f (143)
control sha256(hello) : PASS
valid P-256 signature : ACCEPT
tampered r (1 bit)    : reject (0x)
malformed 100 bytes   : reject (0x)
verdict: P256 PRECOMPILE LIVE AND VALIDATING

=== https://testnet-rpc.monad.xyz ===
chainId: 0x279f (10143)
valid P-256 signature : ACCEPT
tampered r (1 bit)    : reject (0x)
verdict: P256 PRECOMPILE LIVE AND VALIDATING
```

The `sha256` control call is there on purpose: without it, an endpoint that silently fails to
execute precompiles at all would look identical to a rejecting precompile.

### High-S signatures are accepted (this would otherwise break a live demo)

Platform authenticators are not guaranteed to normalise `s` into the lower half of the curve order,
so roughly half of all real WebAuthn signatures can arrive with `s > n/2`. If the precompile rejected
those, a passkey demo would fail at random.

```bash
node scripts/probe-highs.mjs
```

```
low-S  signature : ACCEPT
high-S signature : ACCEPT
verdict: precompile accepts BOTH S forms -> platform authenticators work regardless of normalisation
```

Verified on both Monad mainnet and testnet. The client therefore does **not** need to normalise `S`
before submitting.

---

## Quickstart

```bash
# 1. contracts
cd contracts
forge build
forge test            # 24 tests, real P-256 signatures over real action digests
forge test --gas-report

# 2. confirm the Monad primitive from your machine
cd ..
npm install
node scripts/gen-assertion.mjs   # real WebAuthn assertion fixture
node scripts/probe-p256.mjs      # mainnet + testnet

# 3. deploy (fund the address from https://faucet.monad.xyz first, chain id 10143)
cd contracts
cp ../.env.example ../.env       # then set DEPLOYER_PRIVATE_KEY
set -a && source ../.env && set +a
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
```

The deploy writes `contracts/deployments/<chainId>.json`, so no address is ever hand-copied into
the app.

### The deployed app is a static bundle + a Worker (not Next SSR)

The site serves the same page component Next renders, bundled as static assets, plus a small
Cloudflare Worker that owns `/api/*` (config, relayed intent registration/revocation, and the
agent's execution attempt). No Node server is needed in production, and the Worker bundle is built
with `target: browser`, so any Node-only import fails the build instead of failing at the edge.

```bash
cd app
bun install
bunx tsc --noEmit        # typechecks the page, the worker, and the build scripts
bun run build-static.mjs # -> app/out        (index.html, main.js, styles.css)
bun run build-worker.mjs # -> app/worker-dist (bakes deployments/<chainId>.json into the bundle)
bun run test-worker.mjs  # drives the worker handlers against testnet: real intents, real refusals
```

The Worker answers `/healthz` with its chain, rpId, origin and `hostMatchesOrigin`, so a hostname
mismatch is visible immediately instead of surfacing as a mysterious failed passkey prompt. It
waits for transaction receipts before responding, so the UI never renders pre-transaction state.

Secrets live only in the server environment: `WITNESS_OPERATOR_PRIVATE_KEY` (drives the agent) and
`WITNESS_RELAYER_PRIVATE_KEY` (registers/revokes permissions). Both may be the same key; neither can
approve an action.

### Tests

```
Ran 24 tests for test/Witness.t.sol:WitnessTest
[PASS] test_primitive_p256PrecompileAcceptsRealSignatureOnly
[PASS] test_happyPath_passkeyApprovedTransferExecutes
[PASS] test_blocked_injectedAmountExceedsApproval
[PASS] test_blocked_approvalDoesNotCoverDifferentRecipient
[PASS] test_blocked_differentAmountIsDifferentAction
[PASS] test_blocked_agentCannotForgeApprovalWithItsOwnKey
[PASS] test_blocked_tamperedSignatureRejected
[PASS] test_blocked_differentAgentCannotUseTheApproval
[PASS] test_blocked_bypassingExecutorIsRejected
[PASS] test_blocked_replayAfterConsumption
[PASS] test_blocked_afterRevocation
[PASS] test_blocked_afterExpiry
[PASS] test_blocked_unknownIntent
[PASS] test_blocked_actionHashMustMatchPerformedAction
[PASS] test_blocked_wrongOrigin
[PASS] test_blocked_wrongRelyingParty
[PASS] test_blocked_registrationCeremonyIsNotAnAssertion
[PASS] test_blocked_userVerificationRequired
[PASS] test_identity_agentIdOwnershipIsEnforced
[PASS] test_identity_checkSkippedWhenNoRegistryConfigured
[PASS] test_registry_onlyUserCanRevoke
[PASS] test_registry_onlyVerifierCanConsume
[PASS] test_registry_rejectsExpiryInPast
Suite result: ok. 24 passed; 0 failed
```

These tests are **not** mocked at the cryptography layer. Each one computes the real canonical
digest, has a Node process produce a genuine P-256 signature over that exact digest (the same bytes
a platform authenticator signs, using raw-digest ECDSA as `prehash:false`), and submits it to
contracts that verify through the real precompile. A passing happy path means the entire path is
wired: digest → passkey → precompile → funds moved.

Gas: a full passkey authorization check is **~177k gas**; `executeTransfer` runs 70k–270k depending
on which check rejects.

## Integrate it

```solidity
// Any contract can gate on Witness. No executor, no allowlist, no trusted caller.
bytes32 actionHash = demoSafe.actionHash(intentId, recipient, amount);
verifier.authorizeAndConsume(
    intentId,
    WitnessAction.TRANSFER,
    actionHash,
    amount,
    msg.sender,      // must be the intent's registered agent
    assertion        // the human's passkey assertion
);
// reverts with Unauthorized(Reason.OverLimit | Expired | AlreadyConsumed | ...) otherwise
```

Prefer `check(...)` for a read-only gate or a UI preflight, and `authorizeAndConsume(...)` when the
call itself consumes the one-time approval.

---

## Design notes

**Domain-separated digest, not full EIP-712.** The security argument depends on domain separation by
chain id and contract address, which this digest provides. Keeping it a plain keccak makes it cheap
to reproduce in a browser, a test, or a hardware wallet. A typed-data envelope is a compatible
upgrade, not a requirement.

**Agent identity is a contract, not an EOA.** The verifier binds an action to the intent's
`agentWallet` and requires `ownerOf(agentId) == agentWallet`. Making the executor the agent wallet
means the agent's identity (the ERC-8004 token) and its authority (the human's intent) are bound to
the same address, so neither can be swapped independently.

**The ERC-8004 check is enforced, not decorative.** With no registry configured the check is skipped,
and a test states that explicitly so the behaviour is never accidental. When configured, an agent id
the agent does not own is rejected with `AgentNotRegistered`.

### Relationship to existing work

- **ERC-8004** gives an agent a portable identity. Witness consumes it; it does not replace it.
- **ERC-8196** (Final) enforces policy compliance *inside the agent's own wallet*, signed by the
  agent's own key, against a policy the owner registered once. Witness answers a different question:
  did **this human** approve **this exact action**, verifiable by the **counterparty** that receives
  it? A compromised agent host can use a different wallet; it cannot produce a passkey signature.
- **ERC-8226 / ERC-8273 / ERC-7780** bound what an agent may ever do. Witness decides whether one
  specific action clears the rules right now, and returns *why* when it does not.
- **BTX / encrypted mempools** are not required. Privacy here comes from construction: only
  commitments, the enrolled public key, and the consumed/revoked flags go on-chain — the policy
  document stays with the user.

## Repository layout

```
contracts/
  src/
    WitnessIntentRegistry.sol   permissions + enrolled passkey key
    WitnessVerifier.sol         the check, with typed reasons
    DemoSafe.sol                counterparty; one gated outbound path
    AgentExecutor.sol           the agent's on-chain identity
    DemoUSD.sol                 valueless test asset
    libraries/WebAuthn.sol      WebAuthn assertion verification via 0x0100
    libraries/WitnessAction.sol canonical action digest
    interfaces/IWitness.sol     integration surface + Reason enum
  test/
    Witness.t.sol               24 end-to-end tests
    vectors/                    generated real assertion fixture
  script/Deploy.s.sol           deploy + write manifest
  script/SetRelyingParty.s.sol  change rpId/origin on-chain AND in the manifest
scripts/
  gen-assertion.mjs             generate a real WebAuthn assertion
  sign-action.mjs               sign an arbitrary digest (used by tests)
  probe-p256.mjs                prove the Monad precompile is live
app/                            the deployed site: static bundle + Worker
  app/                          Next.js dev server for UI iteration
  lib/                          shared client code + ABI fragments (single source of truth)
  static/                       HTML shell + entry for the static bundle
  worker/                       the deployed server: /api/* + asset fallback
  build-static.mjs              bundle the page -> out/
  build-worker.mjs              bundle the worker, bake the deployment manifest
  test-worker.mjs               exercise the worker handlers against testnet
  site.manifest.json            deploy manifest (worker + assets)
```

## License

MIT
