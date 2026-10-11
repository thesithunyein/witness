# @witness/sdk

**An agent can prove who it is. Witness proves what the human actually authorized.**

Your agent asks to spend money. The human approves *that exact action* with a
passkey. Your contract verifies the approval on-chain before it moves anything —
without trusting the agent, and without asking the human to hold a wallet.

```
npm i @witness/sdk viem
```

Used by the reference app at [witness.sithunyein.com](https://witness.sithunyein.com),
which imports this package's source directly — so the product and the integration
surface cannot drift apart.

## What it does

| The agent | The human | Your contract |
|---|---|---|
| asks for 0.5 MON to `0x…` | taps a passkey | calls `authorizeAndConsume` |
| cannot sign | signs one digest | verifies it with Monad's P-256 precompile |
| cannot retry | one use only | moves the money, or reverts with a typed reason |

The digest binds the chain id, your contract, the permission, the recipient and
the amount. Change any one of them and the signature no longer applies — so an
approval cannot be replayed against a different contract, a different chain, or a
different number.

## Quickstart

```ts
import { WitnessClient, NATIVE_ACTION_TYPE } from "@witness/sdk";

const client = new WitnessClient(
  {
    chainId: 10143,
    contracts: {
      DemoSafe: "0x…",              // the contract that holds the funds
      WitnessIntentRegistry: "0x…",
      WitnessVerifier: "0x…",
      AgentExecutor: "0x…",         // the agent wallet that will act
    },
    rpId: "your.app",               // must match the origin the human visits
    agentId: 2148n,                 // optional ERC-8004 identity to bind
  },
  { kind: "relayer" }               // or { kind: "wallet", writer }
);

// 1. The human registers one permission. Their passkey is enrolled here; its
//    public key IS the authority the permission names.
const { intentId } = await client.createIntent({
  actionType: NATIVE_ACTION_TYPE,
  maxAmount: 5n * 10n ** 17n,       // 0.5 MON
  expirySeconds: 600,
});

// 2. The agent asks, and the human answers with a biometric prompt.
const action = { intentId, kind: "native", to: "0x…", amount: 5n * 10n ** 17n };
const assertion = await client.requestApproval(action);

// 3. Perform it. Your counterparty checks the signature and the cap on-chain; a
//    refusal comes back as the contract's own Reason, not a generic failure.
const result = await client.executeAuthorizedAction(action, assertion);
if (!result.allowed) {
  console.log(result.name, result.message);   // e.g. OverLimit
}
```

### Verifying instead of spending

If you are the counterparty — the API being paid, the vault, the marketplace —
you do not need this client's write path at all. You need one call:

```solidity
bytes32 digest = safe.actionHash(intentId, recipient, amount);
intentRegistry.checkAndConsume(intentId, actionType, digest, amount, msg.sender, assertion);
// reverts with Unauthorized(OverLimit | Expired | AlreadyConsumed | ...) otherwise
```

Preflight it from your UI with the read-only `client.checkAuthorization(action)`,
which reports the same typed reasons without spending anything.

## Transports

- `{ kind: "relayer", baseUrl? }` — a server route registers permissions and
  submits agent actions, so a user needs **no wallet and no testnet funds**. The
  relayer pays gas and can never approve anything: approving needs the passkey,
  which never leaves the human's device. This is what the reference app uses.
- `{ kind: "wallet", writer }` — you hold a wallet client (browser wallet, KMS).
  Anything with `account` and `writeContract` satisfies the `ContractWriter` type;
  the SDK does not force a wallet stack.

## Guarantees, precisely

- **The digest is never computed off-chain.** It is read from your contract
  (`actionHash` / `nativeActionHash`), so the bytes the passkey signs and the bytes
  the contract recomputes cannot drift.
- **One action, one use.** An approval is consumed by the call that uses it.
  `AlreadyConsumed` is what a replay attempt sees.
- **Semantics are checked, not just the signature.** `rpIdHash`, the user-presence
  and user-verification flags, the `webauthn.get` type, challenge-versus-digest,
  and the origin are all validated on-chain before the P-256 precompile runs.
- **Refusals are typed.** Sixteen `Reason` values, so a UI can say "that is above
  what you approved" instead of "transaction failed".

## Limits, stated plainly

- **Not audited.** The contracts and this client are a working reference, not a
  reviewed production system. Read them before you rely on them.
- **Passkeys still need a real ceremony.** The browser APIs the client calls only
  work at your registered origin; a mismatched `rpId` fails every prompt. That is
  the system working, but it is the most common way a first integration breaks.
- **Witness constrains only what consults it.** A contract that never calls the
  verifier is not protected by it. The check has to live in the counterparty that
  holds the value — that is the design, not an oversight.
- **`agentId` is enforced only when your deployment configures a registry.** When
  it does not, the binding is skipped, and this SDK reports the same typed reasons
  the chain does rather than claiming an enforcement that is not happening.

## Building from source

`src/` is generated from the reference app's modules so there is one copy of the
truth:

```
npm install
npm run build      # sync src/, bundle ESM + CJS, emit declarations
npm run check      # fail if src/ lags the app
```

MIT.
