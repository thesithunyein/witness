# Witness — submission handoff

Status of every deliverable, and exactly what remains. Written to be picked up cold.

Repo: **https://github.com/thesithunyein/witness** (public, `main`)
Commits: `372da59` contracts · `d42e8a5` app + probes · author *Sithu Nyein <sithunyein.mailto@gmail.com>*

---

## 1. Verified working

| Thing | Evidence |
|---|---|
| Monad's P256 precompile is live and validating | `node scripts/probe-p256.mjs` → valid sig `ACCEPT`, tampered `reject`, on **both** mainnet (143) and testnet (10143). Includes a `sha256` control call so a silently-broken endpoint can't masquerade as a rejecting one. |
| High-S signatures accepted | `node scripts/probe-highs.mjs` → both S forms `ACCEPT`. Platform authenticators are not guaranteed to produce low-S, so without this a live passkey demo could fail at random. |
| 24 contract tests pass | `cd contracts && forge test` — real P-256 signatures over real action digests, verified through the real precompile. No mocking of the cryptography. |
| Deploy script works | Verified end-to-end against local anvil; writes `contracts/deployments/<chainId>.json`. |
| Gas | Full passkey authorization check ≈ **177k gas**; `executeTransfer` 70k–270k. |

Tests that matter most, because a system that only says "yes" proves nothing:

```
test_blocked_injectedAmountExceedsApproval        (the headline demo)
test_blocked_agentCannotForgeApprovalWithItsOwnKey (agent signs with its own key -> BadSignature)
test_blocked_approvalDoesNotCoverDifferentRecipient
test_blocked_differentAmountIsDifferentAction
test_blocked_replayAfterConsumption
test_blocked_afterRevocation / afterExpiry
test_blocked_differentAgentCannotUseTheApproval
test_blocked_bypassingExecutorIsRejected
test_blocked_wrongOrigin / wrongRelyingParty / registrationCeremony / userVerificationRequired
test_identity_agentIdOwnershipIsEnforced
```

## 2. Blocked — needs you

### a. Fund the deployer, then deploy to Monad testnet

Generated deployer address (key is in `witness/.env`, gitignored, never printed):

```
0xFc31378e13B4Cb7B545bAC58b28916476406439d
```

1. Open **https://faucet.monad.xyz** (Monad Testnet, chain id **10143**) and request MON for that
   address. The faucet needs a browser — it cannot be scripted.
2. Then:
   ```bash
   cd witness/contracts
   set -a && source ../.env && set +a
   ERC8004_IDENTITY_REGISTRY=0x8004A818BFB912233c491871b3d84c89A494BD9e \
     forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
   ```
   The identity registry is optional but recommended: it makes the ERC-8004 agent-id binding
   *enforced* (`ownerOf(agentId) == agentWallet`) rather than a self-declared label. Verify the
   address on-chain first — Monad's own ERC-8004 doc page renders its address section blank.
3. Addresses land in `contracts/deployments/10143.json`. The app reads them from there.

### b. Finish the app build

`npm install` inside `app/` does not complete reliably in the sandbox used here — it was still
extracting after several minutes and is not a code problem. On a normal machine:

```bash
cd witness/app
npm install
npx tsc --noEmit      # app source has NOT yet been typechecked
npm run build
npm run dev           # then open http://localhost:3000
```

The app source is complete but **unverified** — it has never been compiled. Treat the first
`tsc --noEmit` as a real step, not a formality.

Server env (never sent to the browser):

```
WITNESS_CHAIN_ID=10143
WITNESS_OPERATOR_PRIVATE_KEY=0x...   # drives the demo agent
WITNESS_RELAYER_PRIVATE_KEY=0x...    # registers/revokes permissions
```

### c. Host it on witness.sithunyein.com

Any Node host works (Vercel/Netlify/Fly). Set the three env vars above there, then point DNS:

| Type | Name | Value |
|---|---|---|
| CNAME | `witness` | the host's target (Vercel → `cname.vercel-dns.com`) |

**Set `RP_ID=witness.sithunyein.com` and `ORIGIN=https://witness.sithunyein.com` before deploying.**
The passkey is bound to the relying party, so the deployed origin must match or every passkey prompt
fails for judges. `localhost` works for local dev; production will not work from `localhost` and
vice versa.

Because the app needs server-side keys, a static-only host will not run the agent route.

## 3. Still to make, not code

- [ ] **Logo** — JPG/JPEG/PNG/WEBP, ≤3MB
- [ ] **3-minute technical demo video** — live product, not slides or a code walkthrough.
      Suggested beats: 20s problem → 60s live approve-and-execute → 45s the injected attempt
      blocked on-chain with the reason visible → 20s architecture → 15s integrations.
      **Record it over a working build as early as possible**; the video is what is judged.
- [ ] **2-minute pitch video** — team, problem, why
- [ ] **Live link + access instructions** — state plainly that judges need no wallet or funds:
      registration and gas are relayed, and they approve with a passkey on their own device.
- [ ] Repo reachable by `metropolis@hackathon.monad.xyz` (it is public, so this is satisfied)
- [ ] Confirm the project was created and the track selected **before** the deadline

## 4. The two criteria that are not code

Deadline is Oct 13–14; assume the earlier. These carry 45% of the score and no commit can satisfy
them.

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

DM teams in the Metropolis Discord today, offer to do the integration for them in 15 minutes, and
name the integration in the README and the video.

### Founder & market readiness (25%) — needs named adopters

Name three and say why each would not roll their own:

- **x402 paid endpoints** that need a payer authorization — cite the known gap that today's spend
  controls are per-payment client-side caps with no accumulated session budget.
- **Monad DeFi agents** — swaps/transfers gated on human approval.
- **ERC-8004 agent marketplaces** — a listing that can prove human authorization, not just identity.

The "why not roll their own" answer: a receipt is only useful if the counterparty recognises it.
Rolling your own gives you a check nobody else verifies, and you would still have to write the
WebAuthn parsing, the replay/revocation state, and a receipt format — which is exactly this repo.
Anchoring to ERC-8004 for identity and to ERC-8196's policy field names for interop is the
network-effect argument.

## 5. Positioning to keep live in the demo

> ERC-8004 proves which agent is acting. ERC-8196 proves an action fits a policy the owner set once,
> enforced inside the agent's own wallet and signed with the agent's own key. Witness proves **this
> human approved this exact action, right now** — and the **counterparty** that receives the action
> can check it without trusting the agent.

Do not use the phrase "proves whether the agent was allowed to act": ERC-8196's stated core question
is literally "Is this action authorized right now?", so that framing reads as a re-skin. The
differentiators are per-action human consent, passkey-signed, verifiable by the receiving contract.

## 6. Honest limits

- Not yet done: no testnet deployment, no built/typechecked app, no hosted URL, no videos, no logo,
  no external integrator.
- The app is relayed for gas and registration so judges need no wallet. The relay key cannot approve
  anything — approval requires the enrolled passkey, which never leaves the user's device.
- ERC-8004 is enforced only when `ERC8004_IDENTITY_REGISTRY` is set; a test states the skip
  behaviour explicitly so it is never accidental.
- The action digest is a domain-separated `keccak256`, not a full EIP-712 envelope. Domain separation
  by chain id and contract is what the security argument needs; EIP-712 would be a compatible upgrade.
