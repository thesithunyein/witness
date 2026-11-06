# Wave 2 delta

This is the change log against the Wave 1 Mezo submission. The Wave 1 DemoSafe (`0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6`) still has the drain. Do not point judges at it.

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

## Deployed (Mezo testnet 31611)

The Wave 2 stack is on chain. Admin is locked. The safe holds 100 testnet MUSD. Fee is 10 bps to the deployer. The Stability Pool is set. `keyEnrolled` is still false, so every spend reverts `NotBound` until the human binds the passkey that will sign the demo. `enrollKey` is one shot. Do not enroll a test key or a virtual authenticator.

| Contract | Address |
|---|---|
| WitnessIntentRegistry | `0x84502BA6Bf4A565b84E8eC1747568d54610E71E2` |
| P256Verifier | `0x7836f1bDDdBF491c23a285B5015441a5A147D096` |
| WitnessVerifier | `0x6d9e9Bd86Bcd6D5e0E060DFB3186f52091d858f2` |
| DemoSafe | `0x17fc3f962213bb9156Fd36c856B1FC0B696D9Ac8` |
| AgentExecutor (the only relayer) | `0x7010c0474AA1c8E8039712d314d105D1aDe0a87d` |
| MUSD (canonical testnet, unchanged) | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| Stability Pool | `0x1CCA7E410eE41739792eA0A24e00349Dd247680e` |
| Human / fee recipient | `0xFc31378e13B4Cb7B545bAC58b28916476406439d` |

Source is verified on the Mezo testnet explorer (Blockscout, `Pass - Verified`, solc 0.8.21, via IR). That is a source match, not an audit.

| Contract | Explorer |
|---|---|
| WitnessIntentRegistry | https://explorer.test.mezo.org/address/0x84502BA6Bf4A565b84E8eC1747568d54610E71E2 |
| P256Verifier | https://explorer.test.mezo.org/address/0x7836f1bDDdBF491c23a285B5015441a5A147D096 |
| WitnessVerifier | https://explorer.test.mezo.org/address/0x6d9e9Bd86Bcd6D5e0E060DFB3186f52091d858f2 |
| DemoSafe | https://explorer.test.mezo.org/address/0x17fc3f962213bb9156Fd36c856B1FC0B696D9Ac8 |
| AgentExecutor | https://explorer.test.mezo.org/address/0x7010c0474AA1c8E8039712d314d105D1aDe0a87d |

Repeat calls of `deploy-wave2-contracts` and `deploy-wave2-wire` do not send transactions. `enroll-key` remains, and it must be the phone passkey.

## Wave 1 (unsafe, do not use)

| Contract | Address |
|---|---|
| WitnessIntentRegistry | `0x17dACE260313bEa721a8Ed2254Bbbf19D7a9cF5B` |
| WitnessVerifier | `0xBE66C46f26fE006B4De2B6441011939F930C8C4D` |
| DemoSafe | `0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6` |
| AgentExecutor | `0x6ac484ac42E7eC9942365710b1F8C6106026B45e` |
| P256Verifier | `0x817328dec94122b8eCB7f28a5839003352394430` |

## What this build does not claim

Daily or monthly budgets. Autonomous spend under the ceiling. A Gnosis Safe module. MEZO treasuries or veMEZO locks. BorrowerOperations / trove intents. LangChain, AutoGPT, or Eliza plugins. An audit.

The landing page, the deck, and the security panel match this list. `SUBMISSION.md` is the Wave 1 writeup; do not paste it as the Wave 2 description.

## Still human

1. Open the console on https://witness-agent.vercel.app/app, enroll the phone passkey, and tap **Bind this passkey on chain**.
2. Deposit to the Stability Pool, then show the pool balance, the fee, and a replay revert.
3. Record that as the 2-minute pitch. Do not generate a stand-in video.
4. Resubmit on Akindo before the Wave 2 deadline, describing this delta. Do not paste `SUBMISSION.md`.

## Pitch video (2 minutes)

1. Show `enrollKey` from the human address, then the enrolled `qx`/`qy` on the explorer.
2. Agent proposes a Stability Pool deposit. The human passkey signs the digest from `stabilityDepositHash`.
3. Show the pool's deposit for the safe (net of the fee) and the fee recipient's balance.
4. Replay the same assertion. It reverts.
5. One sentence on what is not in the build: no daily autopilot, no Safe module, not audited, Wave 1 addresses are dead.
