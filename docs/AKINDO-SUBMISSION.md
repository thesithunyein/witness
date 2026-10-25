# Witness: Mezo submission

Everything below is copy-paste ready, and every number in it was read from the live chain, not
remembered. Match each block to the field of the same name in the AKINDO form; if a field is missing
from the form, fold its content into the description.

---

## Project name

`Witness, passkey approvals for AI agents`

## Tagline (one line, ≤ 90 chars)

`Your agent asks. You approve that exact payment with a passkey; the chain enforces it.`

## Logo

`assets/logo.png` in the repo (square, transparent).

## Track / category

Payments · AI agents · Account abstraction / smart accounts. It is infrastructure: an approval layer
any agent-facing payment product can adopt, demonstrated on Mezo with MUSD.

## Short description (≤ 300 chars)

An agent can be prompt-injected, misread a request, or spend money you never authorised. Witness
makes one human approval checkable on-chain: a passkey signs the exact action (chain, asset,
recipient, amount), and the contract holding the funds verifies it before moving a single unit.

## Links

| Field | Value |
|---|---|
| Live app | https://witness-agent.vercel.app (landing page) |
| The console | https://witness-agent.vercel.app/app |
| Integration docs | https://witness-agent.vercel.app/docs |
| Pitch deck | https://witness-agent.vercel.app/deck |
| Repository | https://github.com/thesithunyein/witness |
| Demo video | *(paste your recording URL; see "What to show" below)* |
| X post | *(paste your post URL)* |

Use `witness-agent.vercel.app`, not the custom domain: the verifier is frozen to that origin, and a
passkey enrolled on any other hostname cannot produce an assertion it accepts.

---

## Description (long form, paste as markdown)

### The problem

Agentic payments fail at the same place every time: the agent decides, and the human finds out
afterwards. Agent identity alone (ERC-8004, an API key, a wallet the agent controls) proves *who* is
spending, never that a person approved *this* payment. Prompt injection, a misread invoice, or a
stale instruction all produce a transaction that is perfectly authorised and completely unwanted.

### What Witness does

1. **The human sets one permission.** A ceiling, a single use, and an expiry. Enrolling a passkey
   pins a P-256 public key to that permission on-chain. No private key, no biometric, no secret ever
   reaches the server.
2. **The agent asks.** It `POST`s the recipient and amount to the app; the page renders exactly what
   arrived, in plain language.
3. **The human approves that exact action.** The passkey signs a digest binding the chain, the
   enforcing contract, the permission id, the action type, the asset, the exact recipient and the
   exact amount. Change any one of them and the signature no longer verifies.
4. **The contract decides.** The contract that holds the funds re-derives the digest and verifies the
   assertion before it pays. A refusal is a reverted transaction with a typed reason
   (`OverLimit`, `Expired`, `WrongAgent`, `RpIdMismatch`, `AlreadyConsumed`), not a greyed-out button.
5. **One use, provably.** A consumed approval cannot be replayed: the same assertion is refused with
   `AlreadyConsumed`.

The relayer that submits the transaction can never approve anything. It only pays gas.

### How it uses Mezo and MUSD

- The safe holds **real testnet MUSD**, not a demo token: `DemoSafe` was funded by opening a Mezo
  Borrow trove against testnet BTC (0.034 BTC collateral, MUSD minted, ICR ~137%), so every payment
  in the demo moves an asset with real on-chain backing.
- P-256 verification is **deployed, not assumed**. Mezo has no RIP-7212 / `0x0100` precompile. I
  probed it with a valid signature and got `0x` back, so the stack carries a pure-Solidity P-256
  verifier (`P256Verifier`, daimo's implementation, vendored) with the identical 160-byte ABI.
  `WitnessVerifier` holds it as an immutable, so the passkey check is a real contract call on Mezo.
- Deployed on **Mezo testnet, chain id 31611**, with the trust-critical configuration frozen
  (`configurationLocked: true`): the accepted origin and verifier pointers cannot be changed, only a
  fresh deployment changes them.

### What is live right now

| Contract | Mezo testnet address |
|---|---|
| `DemoSafe` (holds MUSD) | `0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6` |
| `WitnessVerifier` | `0xBE66C46f26fE006B4De2B6441011939F930C8C4D` |
| `WitnessIntentRegistry` | `0x17dACE260313bEa721a8Ed2254Bbbf19D7a9cF5B` |
| `AgentExecutor` | `0x6ac484ac42E7eC9942365710b1F8C6106026B45e` |
| `P256Verifier` | `0x817328dec94122b8eCB7f28a5839003352394430` |
| MUSD (Mezo) | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |

**Proof, end to end, from the production URL.** A browser enrolled a passkey, created a 0.05 MUSD
permission, received an agent request, approved it with the passkey, and the safe paid it:

- Permission registered: [`0xe4dc387c…`](https://explorer.test.mezo.org/tx/0xe4dc387ce3112629e5c998650d0620c263d9c4e52fc1b899e0880dd528f59c0a)
- Payment: [`0x2f4d2a75…`](https://explorer.test.mezo.org/tx/0x2f4d2a75aa9db940170a1306f58962e3755255b71ee2f6532a2a7bbdb047d9d5), status 1, 5 logs:
  `AuthorizedTransfer`, `Verified`, the registry consumption and the MUSD `Transfer`
- Safe went 4.85 → **4.80 MUSD**, payee 1795.05 → **1795.10**
- The approval reads `consumed = true`; replaying it is refused with `AlreadyConsumed`

### Not mocked

- **40/40 contract tests** sign real digests with a real P-256 key through the real verifier, no
  cryptography is stubbed (`cd contracts && forge test`).
- The SDK has three write paths (`relayer`, `wallet`, `server`) and the app uses the relayer one, so a
  visitor needs no wallet and no gas.
- `@witness/sdk` is a published package shape; the app and the integration page import the same
  modules, so the demo and the API cannot drift.

### What is honest about the limits

- The demo's browser run used a **virtual platform authenticator** (real WebAuthn ceremony, real
  ES256 signature over the real challenge); a human tap in Chrome changes only which authenticator
  produces that signature. The contract side is identical.
- Agent identity enforcement is off on this deployment (`erc8004IdentityRegistry` is zero), and the
  app says so on the page in plain language: the approval and the spend limit are enforced, the
  identity claim is not.
- The request queue is per server instance, so a decision report can 404 on a cold instance. The UI
  is correct regardless because the delivery token carries the request; the accounting lives on-chain.

### What is next

Hosted permissions with several agents per human, MUSD-native payouts for agent marketplaces, and an
integrator kit so a marketplace can add "approve this exact payout with your passkey" in an afternoon.

---

## What to show in the demo video (90 seconds)

Record in Chrome or Edge, starting on the landing page at `https://witness-agent.vercel.app`, not in
an embedded browser, because platform passkeys need a real browser window.

1. Landing page, then click **Open the app**. Header reads **MEZO TESTNET · 31611**, amounts read MUSD. (8s)
2. Type `0.05`, click **Create permission with passkey**, approve the Windows Hello / Touch ID prompt.
   The permission appears with an expiry and *one payment*. (20s)
3. Cut to the agent: `POST /api/requests` returned a link; open it. The card says
   "Research Agent wants to spend 0.05 MUSD on …". (15s)
4. Click **Approve with passkey**, approve the prompt. Verdict: **Approved, the permission is used
   up, so this cannot be replayed.** (20s)
5. Explorer: the `AuthorizedTransfer` log and the MUSD `Transfer`. Then re-submit the same assertion
   and show the revert. (20s)
6. Close on the sentence: *the relayer can never approve; only the passkey can.*

---

## Rubric mapping

| Criterion | Weight | Where it is answered |
|---|---|---|
| Mezo integration | 30% | Real MUSD in the safe, real P-256 verification deployed because Mezo has no precompile, live on 31611 with frozen config |
| Viability | 30% | A missing primitive for every agent that can spend; works with any asset or account abstraction; SDK + integrator kit |
| Technical | 20% | Passkey digest binds chain/contract/permission/action/asset/recipient/amount; one-time consumption; typed refusal reasons; 40/40 tests; relayer cannot approve |
| UX | 10% | One screen, plain language, no wallet, no seed phrase, no gas, technical detail behind *Security details* |
| Materials | 10% | This document, `README.md`, `THREAT-MODEL.md`, `docs/live-passkey-approval.png`, explorer links |

## Team

**Sithu Nyein**, solo. Contracts, app, SDK, deployment and this writeup.
