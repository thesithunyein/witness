# Security policy

## Where security is discussed

[THREAT-MODEL.md](THREAT-MODEL.md) is the authoritative document: every actor and
the powers it holds, ten attack classes with their mitigation **and residual risk**,
what is explicitly out of scope, and the known weaknesses ranked. If you are about
to argue that Witness is insecure, start there — it likely already names the thing
you found. If it does not, that is the report we most want.

## What this project is

A **testnet reference implementation**. It is not audited, not production-ready, and
its two server keys are ordinary environment variables. Do not deploy it with real
value without reading the threat model and doing §8 of it.

That said, "it is a demo" is not an excuse for a broken cryptography claim: the
WebAuthn semantics check, the digest binding, the one-time consumption and the
ERC-8004 ownership check are meant to be *correct*, and a mistake in them is a
security bug regardless of the deployment.

## Supported versions

| Version | Supported |
|---|---|
| `main` | Yes — fixes land here first |
| Anything else | No |

The contracts are immutable and deployed at fixed addresses. A contract fix means a
new deployment with new addresses, not a patch; the deployment addresses live in
[`contracts/deployments/10143.json`](contracts/deployments/10143.json).

## Reporting a vulnerability

**Please do not open a public issue for a security bug.** Use GitHub's private
advisory flow: *Security → Report a vulnerability* on
[thesithunyein/witness](https://github.com/thesithunyein/witness/security/advisories/new).

Include what you can:

- what is broken, and the claim in the threat model it contradicts
- a reproduction — a failing test, a transaction hash, or a trace. On-chain evidence
  is the most useful thing you can send, because the deployed contracts cannot be
  changed to hide from it
- what an attacker gains, and what they need to start (a key? a browser? a user's
  cooperation?)
- whether funds, the identity binding, or only information are at risk

**Do not** drain, grief or exploit anything to prove a point beyond the minimum
transaction needed to demonstrate it, and do not test against other people's
deployments.

### What to expect

| Step | Target |
|---|---|
| Acknowledgement | 3 days |
| Initial assessment (is it in scope, which claim it breaks) | 10 days |
| Fix or documented limitation | 30 days, or a public note in `THREAT-MODEL.md` if the right answer is "this is a design trade-off" |

Please give us a chance to ship a fix before publishing. If a fix would take longer
than 30 days, you will get an explanation and an interim note rather than silence.

## Scope

In scope: `contracts/src/**` (especially `libraries/WebAuthn.sol` and
`WitnessVerifier.sol`), the verifier's check ordering, the digest binding, replay and
consumption, the ERC-8004 ownership check, and the app's routes in
`app/app/api/**` — including the request queue's trust boundary.

Out of scope: the demo server keys being demo keys; anything in `THREAT-MODEL.md` §5
(Explicitly out of scope); the vendored `contracts/lib/forge-std`; and vulnerabilities
that require an attacker to already control the human's device.

## Hardening already on the list

Named here so a reasonable report is not treated as surprising, and so nobody thinks
these were missed: `AgentExecutor.forwardAsOwner` remains an owner-only arbitrary
call, `AgentExecutor.setOperator` is not frozen, permission creation is relayed rather
than passkey-signed, the queue is process memory, and the app's routes have no rate
limiting. All five are ranked in [THREAT-MODEL.md §6](THREAT-MODEL.md#6-known-weaknesses-ranked).
