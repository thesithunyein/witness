# Monad-era material (archived)

Witness was first built on Monad testnet (chain `10143`) in October 2026, where
P-256 is checked by the native `0x0100` precompile. It was then ported to Mezo
testnet (chain `31611`), which has no such precompile, so the same 160-byte call
goes to a deployed `P256Verifier` contract instead.

The files here describe the Monad deployment and the outreach plan written for
it. They are kept for history. They are **not** the Mezo submission.

| File | What it is |
|---|---|
| [SUBMISSION.md](SUBMISSION.md) | The Monad writeup, including the Monad addresses and demo script |
| [INTEGRATOR-KIT.md](INTEGRATOR-KIT.md) | Outreach plan aimed at Monad builders |

For the current Mezo deployment, see the [README](../../../README.md) and
[WAVE2.md](../../../WAVE2.md).
