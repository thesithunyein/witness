# Witness Approvals

**Your agent asks. You decide.**

Before an AI agent spends your money, you approve that exact action with a passkey — and the
counterparty that holds the value enforces that approval on-chain.

```
        passkey tap                         on-chain, before funds move
human ──────────────▶ approval ───────────────▶ the contract that holds the value
                      (P256 / WebAuthn)                │
                                                       ├─ Allowed  → execute, and spend the approval
                                                       └─ BLOCKED  → revert + a typed reason
```

An agent can be prompt-injected, can misread a request, or can act on instructions the user never
gave. Agent identity alone (ERC-8004) says nothing about whether a person approved *this* action.
Witness makes that checkable: the approval is a passkey signature over a digest binding the chain,
the enforcing contract, the permission, the action type, the asset, the exact recipient, and the
exact amount — verified on Monad through the native P256 precompile.

---

## Live

| What | Where |
|---|---|
| App | https://witness.sithunyein.com/ |
| Integration page | https://witness.sithunyein.com/integrate |
| Chain | Monad testnet, chain id 10143 |

No wallet and no testnet funds are needed to use it: registration and gas are relayed by the
server, and the approval is a passkey on the visitor's own device. The relayer can never approve
anything — approving requires the enrolled passkey, which never leaves the user's device.

> **The live site serves a build.** Its contract addresses are baked into the app bundle at build
> time from `contracts/deployments/<chainId>.json`, so a redeploy of the contracts requires a
> rebuild and redeploy of the app. Until that happens, the hosted site keeps talking to the
> previous deployment. See [Deploying](#deploying).

### Deployed contracts (Monad testnet 10143)

| Contract | Address |
|---|---|
| `WitnessIntentRegistry` | [`0x3518B7A64D7Cc01e33a0F0A3Fa4111ad2Af3e521`](https://testnet.monadscan.com/address/0x3518B7A64D7Cc01e33a0F0A3Fa4111ad2Af3e521) |
| `WitnessVerifier` | [`0xced20751479A13E76A67cC33C911e8eF61a81165`](https://testnet.monadscan.com/address/0xced20751479A13E76A67cC33C911e8eF61a81165) |
| `DemoSafe` (holds the value) | [`0xcb7187F16c2AE7E8494B82dBc73DDaE18b6e1309`](https://testnet.monadscan.com/address/0xcb7187F16c2AE7E8494B82dBc73DDaE18b6e1309) |
| `AgentExecutor` (agent identity) | [`0x5b451F0700df77293a5A737189BdbA3C37362d23`](https://testnet.monadscan.com/address/0x5b451F0700df77293a5A737189BdbA3C37362d23) |
| `DemoUSD` (valueless asset) | [`0x5Bb70C698F3428802ac3C186EC0Da98a088A6d2c`](https://testnet.monadscan.com/address/0x5Bb70C698F3428802ac3C186EC0Da98a088A6d2c) |
| ERC-8004 Identity Registry | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadscan.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |

The agent's identity is **ERC-8004 token `#2148`**, owned by `AgentExecutor`. The verifier requires
`ownerOf(agentId) == intent.agentWallet`, so the claimed id is a real identity rather than a label
the agent typed. This is enforced, not optional: `identityRegistry` is set at deployment and frozen
by `lockConfiguration()`.

`contracts/deployments/10143.json` is the single source of truth: the deploy script writes it, the
app reads it, and the SDK is constructed from it. No address is ever hand-copied.

---

## Supported environment

| Tool | Version |
|---|---|
| Node | **20.11 ≤ v < 25** (`.nvmrc` pins 22; `engines` enforces it in both `package.json` files) |
| Foundry | forge 1.7.x, `evm_version = "osaka"` (Monad supports the P256 precompile at `0x0100`) |
| Bun | 1.3+ for the Worker build; `npm ci` also works for the scripts |
| Solidity | 0.8.20+ (compiles with 0.8.35) |

The test suite shells out to `node` for real P-256 signatures, so the Node version matters: the
scripts use only stable APIs available in 20.11+, and CI-equivalent runs were verified on Node 23.
Nothing in `scripts/` or `examples/` needs a Node 22+-only feature.

---

## Quickstart

```bash
# 1. contracts — 40 tests, real P-256 signatures through the real precompile
cd contracts
forge test

# 2. the deployed app
cd ../app
bun install            # or npm install
bun run dev            # http://localhost:3000 — the full product, against testnet

# 3. optional: the production bundle (static assets + a Worker for /api/*)
bun run build-static.mjs    # -> app/out
bun run build-worker.mjs    # -> app/worker-dist, and bakes the manifest in
bun run test-worker.mjs     # drives the Worker handlers against testnet
```

Server environment (never exposed to the browser):

```bash
WITNESS_CHAIN_ID=10143
WITNESS_OPERATOR_PRIVATE_KEY=0x…   # drives the agent's attempts
WITNESS_RELAYER_PRIVATE_KEY=0x…    # registers/revokes permissions (may be the same key)
```

Neither key can approve an action. Approving needs the passkey.

### Deploying

```bash
cd contracts
cp ../.env.example ../.env          # then set DEPLOYER_PRIVATE_KEY (fund it from faucet.monad.xyz)
set -a && source ../.env && set +a
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
```

The script deploys the stack, registers the agent's ERC-8004 identity (owned by `AgentExecutor`),
mints demo assets, funds `DemoSafe`, and then **freezes every trust-critical setting**. It writes
`deployments/<chainId>.json`. `RP_ID`/`ORIGIN` must match the hostname that actually serves the app,
or every passkey prompt fails with *"the relying party ID is not a registrable domain suffix of the
current domain"* — the most common way this integration breaks.

`DemoSafe` starts with 1000 DemoUSD. The native MON path needs MON in the safe:

```bash
cast send $DEMO_SAFE --value 1.5ether --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://testnet-rpc.monad.xyz
```

---

## How it works

1. **Enroll.** The human creates a passkey. Its public key is stored in `WitnessIntentRegistry` —
   *not* supplied per call, because P-256 signatures support no public key recovery. A
   caller-supplied key would let anyone authorize anything by signing with their own key.
2. **Authorize.** The human approves one specific action with a passkey tap. The challenge that gets
   signed is the canonical action digest, read from the enforcing contract, so the approval is bound
   to that exact action.
3. **Verify.** Before moving value the counterparty calls the verifier, which checks in order: the
   permission exists, is unrevoked, unexpired, unconsumed; the actor is the registered agent; the
   agent really owns the claimed ERC-8004 id; the action type matches; the amount is within the cap;
   and finally that the passkey signed *this* digest from *our* origin with user verification.
4. **Report.** Every refusal is a distinct typed `Reason` — `OverLimit`, `Expired`,
   `AlreadyConsumed`, `AgentNotRegistered`, … — never a bare revert. Users get an explanation and
   integrators get something to switch on.

### What the passkey signature actually covers

| Check | Why |
|---|---|
| `rpIdHash == sha256(rpId)` | the assertion came from our relying party |
| flags `UP` **and** `UV` set | a human was present *and* verified (biometric/PIN) |
| `type == "webauthn.get"` | a registration ceremony must not authorize an action |
| `challenge == actionDigest` | the human approved *this* action, not "some" approval |
| `origin == expected` | anti-phishing |
| P-256 signature valid | authenticity, via the `0x0100` precompile |

Verifying only the raw precompile signature would accept a signature over *any* digest, which proves
nothing about what the human approved. That distinction is the point of this repo.

### Signature semantics, verified against live chains

```bash
node scripts/probe-p256.mjs    # P256 precompile live on both Monad networks
node scripts/probe-highs.mjs   # platform authenticators work regardless of S normalisation
```

Platform authenticators are not guaranteed to normalise `s` into the lower half of the curve order,
so roughly half of all real WebAuthn signatures can arrive with `s > n/2`. Monad accepts both forms,
so the client does not normalise before submitting.

---

## Contracts

| Contract | Role |
|---|---|
| `WitnessIntentRegistry` | permissions + the enrolled passkey public key; one-time use, expiry, revocation |
| `WitnessVerifier` | the check; returns typed `Reason` values; owns the identity binding and the accepted origin |
| `DemoSafe` | the counterparty; holds funds and has exactly **two** gated outbound paths, `execute` (ERC-20) and `executeNative` (MON) |
| `AgentExecutor` | the agent's on-chain identity and entry point; holds the ERC-8004 token |
| `DemoUSD` | valueless test asset |

**Two outbound paths, one domain tag each.** `WitnessAction.TRANSFER` and
`WitnessAction.TRANSFER_NATIVE` are separate action types, so an approval to move an ERC-20 cannot be
replayed as a MON payment at an identical amount and recipient.

**No privileged way out.** Neither path has an `onlyOwner`/`onlyAgent` gate: authorization *is* the
access control. Any caller may attempt it, and any caller fails unless they are the permission's
registered agent wallet **and** present a signature the human actually produced. An agent that
bypasses `AgentExecutor` entirely and calls `DemoSafe` directly still cannot move a single token.

**The operator can trigger, never approve.** `AgentExecutor.operator` is the off-chain agent
process. It can call `executeTransfer`/`executeTransferNative`, which immediately hits the Witness
check. There is deliberately no operator-callable arbitrary-call function: an earlier revision
exposed `forward(target, data)`, which would have let a prompt-injected agent call anything the
executor could reach — including transferring away its own identity. The only forward is
`forwardAsOwner`, owner-only and used once at setup.

---

## Admin powers: what was locked, and what remains

The previous revision left three trust-critical setters live forever. They are now one-way.

| Setting | Before | Now |
|---|---|---|
| `WitnessVerifier.rpId` / `origin` | owner could change the accepted origin at any time | frozen by `lockConfiguration()` at deploy |
| `WitnessVerifier.identityRegistry` | owner could silently disable the ERC-8004 check, weakening every existing permission | frozen by `lockConfiguration()` |
| `WitnessIntentRegistry.verifier` | owner could point the registry at a contract that consumes permissions without checking | frozen by `lockConfiguration()` |
| `WitnessIntentRegistry.transferOwnership` | owner could hand the registry to a new admin | frozen |
| `DemoSafe.owner` | could be reassigned | frozen by `lockOwnership()`; the fund path never consults it |

`contracts/script/SetRelyingParty.s.sol` was **removed**: after the lock it could only revert. Changing
the accepted origin now requires deploying a new stack — a visible, on-chain action rather than a
silent settings change. That is the intended trade: the deployed configuration is immutable, and
migration is explicit.

**What is still mutable, deliberately:** `AgentExecutor.setOperator` (rotating the agent process key
is normal operational hygiene and grants no approval power), and `AgentExecutor.owner` (the
controller, used once to register the identity).

---

## SDK

`app/lib/sdk/index.ts` wraps the whole loop so an integrating app never reimplements the digest, the
WebAuthn ceremony, or the revert decoding:

| Call | What it does |
|---|---|
| `createIntent` | the human registers a permission (passkey enrolled if needed) |
| `requestApproval` | the human taps; the passkey signs **this** action's digest |
| `checkAuthorization` | read-only preflight returning the contract's typed reason |
| `executeAuthorizedAction` | perform it; the contract enforces or refuses, with a typed reason |

Typed refusals are the point: `result.name` is a stable code (`OverLimit`, `Expired`,
`AlreadyConsumed`, `WrongAgent`, `AgentNotRegistered`, …) and `result.message` is the sentence a
human should read. The SDK is four files with one dependency (viem): `lib/sdk/index.ts`, `lib/abi.ts`,
`lib/witness.ts`, `lib/webauthn.ts`. Copy them, or point your build at the folder.

The digest is always read from the contract (`DemoSafe.actionHash` / `nativeActionHash`), never
recomputed off-chain in parallel, so the bytes the passkey signs and the bytes the contract
recomputes cannot drift.

Worked example: **https://witness.sithunyein.com/integrate** (and `app/app/integrate/page.tsx`),
including a live preflight that calls the deployed verifier from the browser.

---

## Integration examples

```bash
npm install                        # root deps: viem

node examples/monad-app.mjs        # a third-party integration, end to end (read-only)
node examples/monad-app.mjs 3 0.5 0x1111…1111

node examples/live-e2e.mjs         # the deployed stack, with real transactions
```

`examples/monad-app.mjs` is the smallest honest version of "add Witness to my app": it reads the
manifest, reads the permission, asks the contract for the action digest, and preflights. Everything
it prints comes from the chain. It also survives a deployment that is older than the source — a
missing getter is reported as "this deployment predates X" rather than crashing.

`examples/live-e2e.mjs` is the integration test that matters, because it makes claims about the
**deployed** contracts rather than a simulated chain. It needs `DEPLOYER_PRIVATE_KEY` (testnet only)
and the deterministic test key from `contracts/test/vectors/`, and it asserts:

1. an approved action executes and moves exactly the approved amount;
2. replaying it is refused (`AlreadyConsumed`);
3. an unapproved, 10× request is refused (`OverLimit`);
4. an ERC-8004 id the executor does not own is refused (`AgentNotRegistered`).

The two refused permissions are revoked at the end, so a run leaves no unusable state behind.

---

## Tests

```bash
cd contracts && forge test      # 40 passed; 0 failed
```

- `test/Witness.t.sol` — 24 tests: the happy path, every rejection path, the ERC-8004 binding, the
  P256 precompile itself.
- `test/WitnessHardening.t.sol` — 16 tests: the native MON path, ERC-20/native cross-replay,
  the one-way configuration locks, the absence of an operator-callable arbitrary-call surface, and
  the ERC-721 receiver hook the identity mint requires.

These are **not** mocked at the cryptography layer. Each test computes the real canonical digest,
has a Node process produce a genuine P-256 signature over exactly those bytes (raw-digest ECDSA, as a
platform authenticator does), and submits it to contracts that verify through the real precompile. A
passing happy path means the whole path is wired: digest → passkey → precompile → funds moved.

Gas: a full authorization check is ~177k; a transfer runs 70k–270k depending on which check refuses.

---

## Security assumptions and limits

Be precise about what this guarantees, because the guarantee is narrower than "the agent can't spend
your money".

**Enforced.** Only a passkey signature over this chain, this contract, this permission, this action
type, this recipient and this exact amount can move value out of a Witness-checked contract. That
signature must come from the origin and relying party the verifier accepts, with user presence and
user verification. The permission is one-time and dies on expiry or revocation. An agent cannot
manufacture the approval, and a prompt-injected agent cannot widen any field without invalidating the
signature.

**Not enforced.** Witness constrains the contracts that consult it. If an agent has *another* way to
reach your funds — an EOA key, a different vault, an exchange API key — Witness does not constrain
that path. Integration therefore means routing the value through a Witness-checked contract, which is
what `DemoSafe` exists to demonstrate.

**Trust in the deployment.** The relayer pays gas and owns the permission records; it cannot approve,
but it can choose not to submit (a liveness, not a safety, power). The agent operator can trigger
attempts, all of which are checked. `AgentExecutor.owner` can rotate the operator. After deployment,
the verifier's accepted origin and identity binding cannot be changed by anyone, including the
deployer.

**Verified on-chain, testnet only.** The ERC-8004 testnet registry address was verified against live
chain state (a proxy at `0x8004…BD9e` whose implementation exposes `register(string)` /
`ownerOf(uint256)`, and identity `#2148` is minted there). The mainnet address in `Deploy.s.sol`
comes from the ERC-8004 registry list and has **not** been verified on-chain from this repo — check it
before a mainnet deployment.

**Not audited.** No third party has reviewed this code. It is a testnet reference implementation.

---

## Repository layout

```
contracts/
  src/
    WitnessIntentRegistry.sol   permissions + enrolled passkey key
    WitnessVerifier.sol         the check, typed reasons, identity binding, locks
    DemoSafe.sol                counterparty: ERC-20 + native MON paths, both gated
    AgentExecutor.sol           the agent's on-chain identity (holds the ERC-8004 token)
    DemoUSD.sol                 valueless test asset
    libraries/WebAuthn.sol      WebAuthn assertion verification via 0x0100
    libraries/WitnessAction.sol canonical action digests (ERC-20 + native)
    interfaces/IWitness.sol     integration surface + Reason enum
    interfaces/IERC721Receiver.sol  required to receive the ERC-8004 token
  test/
    Witness.t.sol               24 end-to-end tests
    WitnessHardening.t.sol      16 tests: native path, locks, no arbitrary-call surface
  script/Deploy.s.sol           deploy, register identity, lock, write the manifest
  deployments/10143.json        the single source of truth for addresses
scripts/
  gen-assertion.mjs             generate a real WebAuthn assertion fixture
  sign-action.mjs               sign an arbitrary digest (used by the tests)
  probe-p256.mjs                prove the Monad precompile is live
  probe-highs.mjs               prove high-S signatures are accepted
examples/
  monad-app.mjs                 third-party integration, end to end (read-only)
  live-e2e.mjs                  live integration test against the deployed contracts
app/
  app/                          the product: page.tsx (Approvals/Activity/Agents/Settings),
                                integrate/ (developer surface)
  app/api/                      config, intent (register/revoke), agent (attempt execution)
  lib/sdk/index.ts              the SDK
  lib/abi.ts                    ABI fragments; Reason names must match IWitness.sol
  lib/webauthn.ts               passkey enrollment + assertion, DER → r/s
  lib/server/                   manifest loading + server keys
  public/agent.json             the ERC-8004 agent card the identity points at
  build-static.mjs              bundle the page for the static deployment
  build-worker.mjs              bundle the Worker; bakes the manifest in
  test-worker.mjs               exercise the Worker handlers against testnet
```

## License

MIT
