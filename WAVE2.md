# Wave 2 delta

This is the change log against the Wave 1 Mezo submission. The Wave 1 DemoSafe (`0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6`) still has the drain. Do not point judges at it.

## The bug

`WitnessIntentRegistry.createIntent` is permissionless and stores whatever P-256 key the caller passes. Wave 1 `DemoSafe.execute` trusted that key. Anyone could register an intent with their own key, sign it, and drain the safe.

`createIntent` stays permissionless. The fix is in `DemoSafe`, which is the contract that holds the value.

## What the code does now

1. **One human key.** Before `lockOwnership`, the owner calls `setHuman`. That address calls `enrollKey(qx, qy)` once. `enrollKey` still works after the lock, and only for that human. Until a key is enrolled, every outbound call reverts `NotBound`. An intent whose `user` or `qx`/`qy` is not the enrolled key reverts `KeyMismatch` before the verifier runs. A missing intent is left for the verifier, which returns `NoSuchIntent`.

2. **Relayer allowlist.** `execute`, `executeNative`, `depositToStabilityPool`, and `withdrawFromStabilityPool` revert `NotRelayer` unless `msg.sender` was allowlisted. The allowlisted caller is the `AgentExecutor` (the intent's `agentWallet`). The operator key drives the executor and pays gas. It is not an authorizer, and it is not a DemoSafe caller.

3. **Mezo Stability Pool.** Deposit and withdraw. (Mezo Borrow, below, was added later in Wave 2.)
   - Testnet (31611): `0x1CCA7E410eE41739792eA0A24e00349Dd247680e`
   - Mainnet (31612): `0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32`
   - Calls match mezo-org/musd with no front-end tag: `provideToSP(uint256)`, `withdrawFromSP(uint256)`.
   - Action tags: `keccak256("witness.action.sp.deposit")` and `keccak256("witness.action.sp.withdraw")`.
   - The hash `to` slot is the pool address, so a signature cannot be replayed against another pool.
   - Deposit: signed `amount` is the gross debit. Fee is transferred first. The net is approved and passed to `provideToSP`. Approval is zeroed after.
   - Withdraw: the pool returns tokens to the safe. The fee is taken from what actually arrived. The rest stays in the safe. It is not sent to a third party.

4. **Fee.** `fee = amount * feeBps / 10_000`, skimmed from the signed gross. `setFee` reverts above 100 bps (1%). Deploy default is 10 bps to the deployer. Tests leave `feeBps` at 0 unless a case sets it, so the older full-amount asserts still hold.

## Tests

`cd contracts && forge test`: 66 passed (35 in `Witness.t.sol`, 16 in `WitnessHardening.t.sol`, 15 in `WitnessTrove.t.sol`). Real P-256 via `node ../scripts/sign-action.mjs`, not a mocked curve.

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

The Wave 2 stack is on chain. Admin is locked. The safe was funded with 100 testnet MUSD. Fee is 10 bps to the deployer. The Stability Pool is set. The human passkey is enrolled (`enrollKey` is one shot and has been used), so the recorded vault answers only to that key.

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

Repeat calls of `deploy-wave2-contracts` and `deploy-wave2-wire` do not send transactions.

## Wave 1 (unsafe, do not use)

| Contract | Address |
|---|---|
| WitnessIntentRegistry | `0x17dACE260313bEa721a8Ed2254Bbbf19D7a9cF5B` |
| WitnessVerifier | `0xBE66C46f26fE006B4De2B6441011939F930C8C4D` |
| DemoSafe | `0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6` |
| AgentExecutor | `0x6ac484ac42E7eC9942365710b1F8C6106026B45e` |
| P256Verifier | `0x817328dec94122b8eCB7f28a5839003352394430` |

## What this build does not claim

Daily or monthly budgets. Autonomous spend under the ceiling. A Gnosis Safe module. MEZO treasuries or veMEZO locks. Closing a trove or withdrawing its collateral. LangChain, AutoGPT, or Eliza plugins. An audit.

The landing page, the deck, and the security panel match this list. The Monad-era writeup is archived at `docs/archive/monad/SUBMISSION.md`; do not paste it as the Wave 2 description.

## Recorded on Mezo testnet (6 Nov 2026)

| Action | Transaction |
|---|---|
| Transfer, 1 MUSD | https://explorer.test.mezo.org/tx/0xdefbe4c371f86f039a466c6f527d0c1129fe5736867fe46e00909a8e13e1c77c |
| Stability Pool deposit, 1 MUSD | https://explorer.test.mezo.org/tx/0x66f8a5aec0e25ca2865d317fad4a59f04bae79d6c1fd6fbe0ac64d58a24070a2 |
| Stability Pool withdraw | https://explorer.test.mezo.org/tx/0xd6b0ab45091b7836de162816e9565a6c066db6f41bbd9bda097bca515be9e53f |
| A second passkey opens its own vault and deposits 1 MUSD; the recorded vault is untouched | https://explorer.test.mezo.org/tx/0x38650d3a1708aabc4705fbdecf3489be9560bf266d4d5c1ebea8f82caf0d4ca7 |

An amount above the ceiling is refused with `OverLimit` and moves nothing. The pitch video is https://youtu.be/zLq3KtyDPtU.

## What the pitch video shows (2 minutes)

1. Show `enrollKey` from the human address, then the enrolled `qx`/`qy` on the explorer.
2. Agent proposes a Stability Pool deposit. The human passkey signs the digest from `stabilityDepositHash`.
3. Show the pool's deposit for the safe (net of the fee) and the fee recipient's balance.
4. Replay the same assertion. It reverts.
5. One sentence on what is not in the build: no daily autopilot, no Safe module, not audited, Wave 1 addresses are dead.

## Mezo Borrow: trove guard (added 11 Nov 2026)

The Wave 1 review asked for "passkey-approved intents that open, top up or repay a trove through BorrowerOperations". This is that.

`DemoSafe` gained `openTrove`, `addTroveCollateral` and `repayTroveDebt`. Each runs the same four checks as every other path (enrolled key, allowlisted relayer, exact digest, one use) before calling Mezo's `BorrowerOperations` as the trove owner. The trove digest binds chain, vault, intent, action, `BorrowerOperations`, collateral and debt. `setBorrowerOperations` refuses a deployment whose debt token is not the vault's MUSD. Hints are computed by the relayer and are not signed: they cannot change an amount or the owner.

Tests: 15 in `WitnessTrove.t.sol` with real P-256 signatures, including a stranger key, replay, over-ceiling, a changed collateral amount, a pool approval used to repay, and the EIP-170 size limit. 66 total, green in CI.

Deployed with `scripts/deploy-trove-vault.mjs`, reusing the locked Wave 2 verifier and registry. Record: `contracts/deployments/31611-trove.json`.

| Contract | Address |
|---|---|
| DemoSafe (trove vault) | `0xd180dd35522d1297b3cbaa5046b34850ae55569d` |
| AgentExecutor | `0x674777ba2c3f4011cffa0fbc34953d1abf3fd213` |
| BorrowerOperations (Mezo) | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |

| Action | Transaction |
|---|---|
| Open trove: 0.043 BTC, 1,800 MUSD | https://explorer.test.mezo.org/tx/0xf941fe81b3559cd1722f529c235c9a7d31dbc0b8d25b349101bc2ab6ac3ff733 |
| Add collateral: 0.005 BTC, ratio 176% | https://explorer.test.mezo.org/tx/0xa54c300e9aa7146a3448b3342fdf8fd2e1fe538978869a350791d3e09997102b |
| Repay: 1 MUSD, debt 2,001.8 to 2,000.8 | https://explorer.test.mezo.org/tx/0x23e3237203c332954ece4098a7ff1c46cd61355805390873cd5fa341c1d4c21e |
| Agent asks for 2x the approved repay, unsigned | Refused `OverLimit`, no transaction |
