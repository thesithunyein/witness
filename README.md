<p align="center">
  <img src="assets/logo.png" width="72" height="72" alt="Witness" />
</p>

<h1 align="center">Witness</h1>

<p align="center"><strong>Your agent asks. You decide.</strong></p>

<p align="center">
  <a href="https://witness-agent.vercel.app/app"><img src="https://img.shields.io/badge/Open%20the%20app-witness--agent.vercel.app%2Fapp-bcf020?style=for-the-badge&labelColor=10141d" alt="Open the app" /></a>
</p>

<p align="center">
  <a href="https://witness-agent.vercel.app/docs">Docs</a> ·
  <a href="THREAT-MODEL.md">Threat model</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="https://testnet.monadscan.com">Explorer</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" /></a>
  <a href="app/package.json"><img src="https://img.shields.io/badge/node-20.11%2B-3c873a?style=flat-square" alt="node" /></a>
  <a href="contracts/deployments/10143.json"><img src="https://img.shields.io/badge/monad-testnet%2010143-blueviolet?style=flat-square" alt="chain" /></a>
  <a href="#tests"><img src="https://img.shields.io/badge/contract%20tests-40%20passing-brightgreen?style=flat-square" alt="tests" /></a>
  <a href="packages/sdk"><img src="https://img.shields.io/badge/%40witness%2Fsdk-0.1.0-blue?style=flat-square" alt="sdk" /></a>
  <a href="#security"><img src="https://img.shields.io/badge/audit-not%20yet-red?style=flat-square" alt="audit" /></a>
</p>

Before an AI agent spends your money, you approve that exact action with a passkey, and the
contract that holds the funds enforces that approval on-chain.

```
  passkey tap                        on-chain, before funds move
  human  ──────▶  approval  ──────▶  the contract that holds the value
                  (P-256 / WebAuthn)       │
                                           ├─ Allowed   → execute, and spend the approval
                                           └─ Refused   → revert with a typed reason
```

Agent identity alone (ERC-8004) says nothing about whether a person approved *this* action. Witness
makes that checkable: the approval is a passkey signature over a digest binding the chain, the
enforcing contract, the permission, the action type, the asset, the recipient and the exact amount,
verified on Monad through the native P-256 precompile at `0x0100`.

## Live

| What | Where |
|---|---|
| App | https://witness-agent.vercel.app/app |
| Docs | https://witness-agent.vercel.app/docs |
| Live config | https://witness-agent.vercel.app/api/config |
| Chain | Monad testnet, chain id 10143 |

No wallet and no testnet funds are needed. Registration and gas are relayed by the server, and the
approval is a passkey on the visitor's own device. The deployment is frozen to the origin
`witness-agent.vercel.app` by `lockConfiguration()` at deploy time, so the approve step works from
that link and from nowhere else.

## How it works

1. **Enroll.** The human creates a passkey. Its public key is stored in `WitnessIntentRegistry`, not
   supplied per call, because P-256 signatures support no public key recovery.
2. **Authorize.** The human approves one specific action. The signed challenge is the canonical
   action digest, read from the enforcing contract, so the approval is bound to that exact action.
3. **Verify.** Before moving value, the counterparty calls the verifier: the permission exists, is
   unrevoked, unexpired, unconsumed; the actor is the registered agent; the agent owns the claimed
   ERC-8004 id; the action type matches; the amount is within the cap; and the passkey signed *this*
   digest, from *our* origin, with user verification.
4. **Report.** Every refusal is a distinct typed `Reason` (`OverLimit`, `Expired`, `AlreadyConsumed`,
   `AgentNotRegistered`, and others), never a bare revert.

The expiry and the spend ceiling live on the permission record rather than inside the digest: the
passkey signs *what* may happen, and the record bounds *how much* and *for how long*.

### What the passkey signature covers

| Check | Why |
|---|---|
| `rpIdHash == sha256(rpId)` | the assertion came from our relying party |
| flags `UP` and `UV` set | a human was present and verified (biometric or PIN) |
| `type == "webauthn.get"` | a registration ceremony must not authorize an action |
| `challenge == actionDigest` | the human approved this action, not "some" approval |
| `origin == expected` | anti-phishing |
| P-256 signature valid | authenticity, via the `0x0100` precompile |

Verifying the raw precompile signature alone would accept a signature over any digest, which proves
nothing about what the human approved.

## Deployed contracts (Monad testnet 10143)

| Contract | Address |
|---|---|
| `WitnessIntentRegistry` | [`0x84502BA6Bf4A565b84E8eC1747568d54610E71E2`](https://testnet.monadscan.com/address/0x84502BA6Bf4A565b84E8eC1747568d54610E71E2) |
| `WitnessVerifier` | [`0x7836f1bDDdBF491c23a285B5015441a5A147D096`](https://testnet.monadscan.com/address/0x7836f1bDDdBF491c23a285B5015441a5A147D096) |
| `DemoSafe` (holds the value) | [`0x17fc3f962213bb9156Fd36c856B1FC0B696D9Ac8`](https://testnet.monadscan.com/address/0x17fc3f962213bb9156Fd36c856B1FC0B696D9Ac8) |
| `AgentExecutor` (agent identity) | [`0x7010c0474AA1c8E8039712d314d105D1aDe0a87d`](https://testnet.monadscan.com/address/0x7010c0474AA1c8E8039712d314d105D1aDe0a87d) |
| `DemoUSD` (valueless asset) | [`0xd5588C6f78d720D4a89929b4b68C546Dc788D65A`](https://testnet.monadscan.com/address/0xd5588C6f78d720D4a89929b4b68C546Dc788D65A) |
| ERC-8004 Identity Registry | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadscan.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |

The agent's identity is **ERC-8004 token `#2240`**, owned by `AgentExecutor`. The verifier requires
`ownerOf(agentId) == intent.agentWallet`, so a claimed id is a real identity, not a label the agent
typed. `contracts/deployments/10143.json` is the single source of truth: the deploy script writes it,
the app reads it, and the SDK is constructed from it.

The source is published, so none of this has to be taken on trust:

```bash
cd contracts && ./verify.sh   # keyless, via Sourcify (MonadVision)
```

## Quickstart

```bash
# contracts: 40 tests, real P-256 signatures through the real precompile
cd contracts && forge test

# the product against testnet
cd ../app
bun install
bun run dev                  # then open the URL it prints

# the production bundle (static assets plus a Worker for /api/*)
bun run build-static.mjs     # -> app/out
bun run build-worker.mjs     # -> app/worker-dist, bakes the manifest in

# the agent half, as a separate process
cd .. && npm install
node examples/agent-request.mjs         # posts a request and waits for the human
node examples/agent-request.mjs --over  # asks for ten times the limit, for real
```

Server environment (never exposed to the browser):

```bash
WITNESS_CHAIN_ID=10143
WITNESS_RELAYER_PRIVATE_KEY=0x…   # registers and revokes permissions; pays gas
WITNESS_OPERATOR_PRIVATE_KEY=0x…  # submits the agent's attempts
```

Neither key can approve anything: approving needs the passkey.

### Deploying

```bash
cd contracts
cp ../.env.example ../.env          # set DEPLOYER_PRIVATE_KEY (faucet.monad.xyz)
set -a && source ../.env && set +a
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
```

The script deploys the stack, registers the agent's ERC-8004 identity, funds `DemoSafe`, and freezes
every trust-critical setting. `RP_ID` and `ORIGIN` must match the host that serves the app, and a
contract redeploy needs an app redeploy too, because the addresses are baked into the bundle at build
time.

The app is deployed from the repository root, because the Vercel project's root directory is already
`app/`. Running the CLI inside `app/` uploads that directory as the deployment root and the build then
looks for `app/app/package.json`:

```bash
vercel link --project witness   # once, from the repository root
vercel --prod
```

## Tests

```bash
cd contracts && forge test    # 40 passed, 0 failed
```

- `test/Witness.t.sol`, 24 tests: the happy path, every rejection path, the ERC-8004 binding, and the
  P-256 precompile itself.
- `test/WitnessHardening.t.sol`, 16 tests: the native MON path, ERC-20/native cross-replay, the
  one-way configuration locks, the absence of an operator-callable arbitrary-call surface, and the
  ERC-721 receiver hook the identity mint requires.

These are not mocked at the cryptography layer. Each test computes the real digest, has a Node
process produce a genuine P-256 signature over exactly those bytes, and submits it to contracts that
verify through the real precompile. An approved passkey transfer costs **336,107 gas** end to end on
the deployed stack (tx `0x13d7cd50…`, block 70,639,621).

## Verifying it yourself

```bash
cd contracts && ./verify.sh          # source published to an explorer, keyless
cd contracts && forge test           # 40 tests
cd app && bunx tsc --noEmit          # types
cd packages/sdk && bun run check     # the SDK has not drifted from the app
node scripts/check-style.mjs         # no em dashes in prose or copy
```

Or ask production what it is running:

```bash
curl -s https://witness-agent.vercel.app/api/config
```

## Security

| | |
|---|---|
| **Enforced on-chain** | Per-action human consent, bound to chain, contract, permission, action type, asset, recipient and exact amount. One-time use. Typed refusals. ERC-8004 ownership checked against the live registry. |
| **Not enforced** | Anything that does not call the verifier. A prompt-injected agent is assumed, not prevented: it can still ask. |
| **Trusted for liveness** | The relayer and operator keys, which hold no approval power. |
| **Frozen at deploy** | Accepted origin, identity registry, the registry's verifier pointer, `DemoSafe` ownership. |
| **Still mutable** | `AgentExecutor.setOperator` (rotation) and `forwardAsOwner` (owner-only). Neither can move the safe's funds. |
| **Audit status** | Not audited. Testnet reference implementation. |

The guarantee is narrower than "the agent cannot spend your money". Witness constrains the contracts
that consult it. If an agent has another way to reach the funds, an EOA key, a different vault, an
exchange API key, Witness does not constrain that path. Integration means routing the value through a
Witness-checked contract, which is what `DemoSafe` demonstrates.

Full detail: [THREAT-MODEL.md](THREAT-MODEL.md) (actors, ten attack classes with mitigation and
residual risk, ranked weaknesses) and [SECURITY.md](SECURITY.md) (disclosure policy).

## Contracts

| Contract | Role |
|---|---|
| `WitnessIntentRegistry` | permissions and the enrolled passkey public key; one-time use, expiry, revocation |
| `WitnessVerifier` | the check; typed reasons; owns the identity binding and the accepted origin |
| `DemoSafe` | the counterparty; holds funds and has exactly two gated outbound paths, `execute` (ERC-20) and `executeNative` (MON) |
| `AgentExecutor` | the agent's on-chain identity and entry point; holds the ERC-8004 token |
| `DemoUSD` | valueless test asset |

`WitnessAction.TRANSFER` and `WitnessAction.TRANSFER_NATIVE` are separate action types, so an approval
to move an ERC-20 cannot be replayed as a MON payment at the same amount and recipient. Neither exit
has an owner or agent gate: authorization *is* the access control, and an agent that bypasses
`AgentExecutor` entirely still cannot move a token, because the check is a signature the human
produced, not a permission the agent presents.

`AgentExecutor.operator` can trigger attempts, never approve them. There is deliberately no
operator-callable arbitrary-call function.

## SDK

`packages/sdk` builds `@witness-agent/sdk` from the app's own modules (ESM, CJS and type declarations), so
there is one copy of the truth. It installs from the registry as `npm i @witness-agent/sdk viem`.

Releases are tags: pushing `v*` runs `.github/workflows/release.yml`, which publishes only after
the tag, the manifest, the app's types and the tarball's contents all agree.

| Call | What it does |
|---|---|
| `createIntent` | the human registers a permission (passkey enrolled if needed) |
| `requestApproval` | the human taps; the passkey signs this action's digest |
| `checkAuthorization` | read-only preflight returning the contract's typed reason |
| `executeAuthorizedAction` | perform it; the contract enforces or refuses, with a typed reason |

The digest is always read from the contract, never recomputed off-chain in parallel, so the bytes the
passkey signs and the bytes the contract recomputes cannot drift. The worked example, with a live
preflight against the deployed verifier, is at [witness-agent.vercel.app/docs](https://witness-agent.vercel.app/docs)
and in `app/app/docs/page.tsx`.

## Repository layout

```
contracts/          Solidity, immutable once deployed, with 40 tests
app/                the product: Next.js for development, a static bundle plus a Worker in production
  app/              the landing page, the approvals app, the docs page, and the API routes
  lib/              the SDK the app imports, WebAuthn, the queue, server helpers
  worker/           the same routes for the edge deployment
packages/sdk/       @witness-agent/sdk, generated from app/lib, with a drift check
examples/           the agent half, a third-party integration, and a live end-to-end test
scripts/            assertion generation, signing, precompile probes, the style guard
THREAT-MODEL.md     actors, attacks, residual risk
SECURITY.md         disclosure policy
SUBMISSION.md       deliverable-by-deliverable handoff, with evidence
```

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) has the checks every change must pass and the two things that will
be declined: anything that widens the trust story, and anything that skips a test to make a check
pass. The most welcome contribution is a claim in [THREAT-MODEL.md](THREAT-MODEL.md) you can break.

## License

MIT, see [LICENSE](LICENSE). `contracts/lib/forge-std` is a vendored dependency under its own licence
(MIT OR Apache-2.0).
