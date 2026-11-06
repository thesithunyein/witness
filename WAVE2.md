# Wave 2 delta

This is the change log against the Wave 1 Mezo submission. The Wave 1 contracts on explorer are **not** this build. They still have the drain. Do not point judges at the old DemoSafe until you redeploy.

## The bug

`WitnessIntentRegistry.createIntent` is permissionless and stores whatever P-256 key the caller passes. Wave 1 `DemoSafe.execute` trusted that key. Anyone could register an intent with their own key, sign it, and drain the safe.

`createIntent` stays permissionless. The fix is in `DemoSafe`, which is the contract that holds the value.

## What the code does now

1. **One human key.** Before `lockOwnership`, the owner calls `setHuman`. That address calls `enrollKey(qx, qy)` once. `enrollKey` still works after the lock, and only for that human. Until a key is enrolled, every outbound call reverts `NotBound`. An intent whose `user` or `qx`/`qy` is not the enrolled key reverts `KeyMismatch` before the verifier runs. A missing intent is left for the verifier, which returns `NoSuchIntent`.

2. **Relayer allowlist.** `execute`, `executeNative`, `depositToStabilityPool`, and `withdrawFromStabilityPool` revert `NotRelayer` unless `msg.sender` was allowlisted. The allowlisted caller is the `AgentExecutor` (the intent's `agentWallet`). The operator key drives the executor and pays gas. It is not an authorizer, and it is not a DemoSafe caller.

3. **One Mezo path: Stability Pool.** Not troves, not veMEZO.
   - Testnet (31611): `0x1CCA7E410eE41739792eA0A24e00349Dd247680e`
   - Mainnet (31612): `0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32`
   - Calls match mezo-org/musd with no front-end tag: `provideToSP(uint256)`, `withdrawFromSP(uint256)`.
   - Action tags: `keccak256("witness.action.sp.deposit")` and `keccak256("witness.action.sp.withdraw")`.
   - The hash `to` slot is the pool address, so a signature cannot be replayed against another pool.
   - Deposit: signed `amount` is the gross debit. Fee is transferred first. The net is approved and passed to `provideToSP`. Approval is zeroed after.
   - Withdraw: the pool returns tokens to the safe. The fee is taken from what actually arrived. The rest stays in the safe. It is not sent to a third party.

4. **Fee.** `fee = amount * feeBps / 10_000`, skimmed from the signed gross. `setFee` reverts above 100 bps (1%). Deploy default is 10 bps to the deployer. Tests leave `feeBps` at 0 unless a case sets it, so the older full-amount asserts still hold.

## Tests

`cd contracts && forge test` — 51 passed (35 in `Witness.t.sol`, 16 in `WitnessHardening.t.sol`). Real P-256 via `node ../scripts/sign-action.mjs`, not a mocked curve.

Wave 2 cases:

- stranger `enrollKey` reverts `NotHuman`; a second enroll reverts `AlreadyEnrolled`
- `enrollKey` still works for the human after `lockOwnership`
- an unbound safe reverts `NotBound`
- a stranger intent with their own key, even after `setRelayer`, reverts `KeyMismatch` and moves nothing
- `setFee` above 100 bps reverts `FeeTooHigh`
- `setRelayer` after `lockOwnership` reverts `Locked`
- a plain transfer at 100 bps pays the recipient the net and the fee recipient 1%
- a Stability Pool deposit above the intent ceiling reverts `OverLimit` and does not touch the pool
- a signed deposit (10 bps) puts the net in the pool, the fee with the recipient, and a replay reverts `AlreadyConsumed`
- a following withdraw pulls the position back, takes the fee from the returned amount, and leaves the rest in the safe
- calling deposit with no pool set reverts `StabilityPoolUnset` and does not consume the intent

The signer imports `@noble/curves/nist.js` (v2). That path is not in the 1.9.1 copy viem depends on, so the root `package.json` depends on `@noble/curves` 2.0.1 directly.

## Redeploy (you have to do this)

This environment does not have the deployer key, so nothing new is on Mezo and nothing is explorer-verified.

```bash
# chain 31611, https://rpc.test.mezo.org
# fund the deployer from https://faucet.test.mezo.org first
export DEPLOYER_PRIVATE_KEY=0x...
export RP_ID=witness-agent.vercel.app
export ORIGIN=https://witness-agent.vercel.app
export ASSET_TOKEN=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
export ASSET_SYMBOL=MUSD
# optional; these are the defaults on 31611
# export STABILITY_POOL=0x1CCA7E410eE41739792eA0A24e00349Dd247680e
# export FEE_BPS=10
# export HUMAN=<address that will call enrollKey; default deployer>
# export FEE_RECIPIENT=<default deployer>

cd contracts
forge script script/Deploy.s.sol --rpc-url https://rpc.test.mezo.org --broadcast
# then the repo's verify.sh against the new manifest
```

After broadcast, `HUMAN` (the deployer, if you did not override it) must call `DemoSafe.enrollKey` with the passkey public key the app actually uses. Until that transaction lands, the safe reverts `NotBound` on purpose.

The old addresses are the vulnerable build. Do not reuse them.

| Contract | Wave 1 (unsafe until replaced) |
|---|---|
| WitnessIntentRegistry | `0x17dACE260313bEa721a8Ed2254Bbbf19D7a9cF5B` |
| WitnessVerifier | `0xBE66C46f26fE006B4De2B6441011939F930C8C4D` |
| DemoSafe | `0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6` |
| MUSD (canonical testnet, unchanged) | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| AgentExecutor | `0x6ac484ac42E7eC9942365710b1F8C6106026B45e` |
| P256Verifier | `0x817328dec94122b8eCB7f28a5839003352394430` |

## What this build does not claim

Daily or monthly budgets. Autonomous spend under the ceiling. A Gnosis Safe module. MEZO treasuries or veMEZO locks. BorrowerOperations / trove intents. LangChain, AutoGPT, or Eliza plugins. An audit. Explorer-verified bytecode (that is the verify step after redeploy, not a property of the source).

The landing page, the deck, and the security panel were rewritten to match this list. `SUBMISSION.md` is the Wave 1 writeup; do not paste it as the Wave 2 description.

## Pitch video (2 minutes)

1. Show `enrollKey` from the human address, then the enrolled `qx`/`qy` on the explorer.
2. Agent proposes a Stability Pool deposit. The human passkey signs the digest from `stabilityDepositHash`.
3. Show the pool's deposit for the safe (net of the fee) and the fee recipient's balance.
4. Replay the same assertion. It reverts.
5. One sentence on what is not in the build: no daily autopilot, no Safe module, not audited, old addresses are dead.
