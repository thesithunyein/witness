# Integrator kit, getting one third party to actually use this

**Status: this is the part I cannot do for you.** Everything here is ready to send;
sending it needs a human with a Discord account. Outreach is a day of your time and
it is worth more to the submission than any further code.

The rule this kit is built around: **do not ask anyone to try your thing. Offer to
do the work and name the smallest possible outcome.**

A second app built by you scores nothing. One transaction submitted by somebody
else's contract, on Monadscan, that calls `checkAuthorization`/`authorizeAndConsume`
scores the whole category.

---

## 1. What counts as an integration (aim for the smallest version)

Pick whichever is easiest for them, all three are real, and in order of how much
they cost the other team:

| Level | What they do | Cost to them | Evidence to record |
|---|---|---|---|
| **L3, full** | Their contract calls `authorizeAndConsume` before releasing value | Days | A tx on Monadscan from *their* contract, plus a line in their README |
| **L2, gated call** | Their backend asks Witness before an action proceeds, e.g. a 402 flow that requires a payer authorization | An afternoon | A log line / a screenshot of the refusal with the typed `Reason` |
| **L1, verified read** | They run `examples/monad-app.mjs` against the deployed stack and it works | 15 minutes | Their name in the README, and a quote |

L1 is not a joke and it is not "fake": it is a third party confirming, on their own
machine, that the integration surface works. Get one L1 before you spend a day
chasing an L3.

---

## 2. The offer (say exactly this, then do it)

> I built a small passkey-approval layer for agent payments on Monad. It answers one
> question: **did a human authorize *this* action, right now**, verifiable by the
> contract that's being paid, not by the agent.
>
> It's five lines in your contract:
>
> ```solidity
> bytes32 digest = safe.actionHash(intentId, recipient, amount);
> intentRegistry.checkAndConsume(
>     intentId, actionType, digest, amount, msg.sender, assertion
> );
> // reverts with Unauthorized(OverLimit | Expired | AlreadyConsumed | ...) otherwise
> ```
>
> **Send me the repo and I'll open the PR myself this weekend.** If I can't make it
> fit in an afternoon, I'll tell you and stop rather than leave you a half-done
> branch.

The last sentence is the whole pitch. It is also the thing that makes people reply.

---

## 3. Who to contact, most likely first

| Where | Who | Why them |
|---|---|---|
| Monad Discord → `#builders` / dev channels | Anyone posting about agents, x402, paid APIs, or vault automation | They already have the problem, and they are in the room |
| The hackathon's own Discord/Telegram | Teams building agent tooling or DeFi agents | Peer teams, easiest to trade integrations with |
| x402 / paid-endpoint builders | Projects charging per request | They need a payer authorization their server can verify, the closest fit |
| ERC-8004 explorers and marketplaces | Anyone indexing the identity registry | Their listings prove identity; authorization is the missing half |
| Monad DeFi teams with agent vaults | Router/vault repos | The gate belongs in their contract, which is exactly the integration |

Search terms that find the right posts: "agent", "x402", "402 Payment Required",
"pay-per-call", "vault automation", "ERC-8004", "autonomous agent".

**Do not** blanket-DM a channel. One specific message to one specific repo beats
twenty generic ones, because the reply rate on "I read your contracts and here is
the one function to add" is not comparable.

### 3b. Seven specific targets, checked

Verified by loading the page or the repository, not by reputation. These are the ones
where the fit is structural, which is the only reason a stranger says yes.

| Target | Where | Why the fit is structural |
|---|---|---|
| **Monad x402 Facilitator** | `docs.monad.xyz/tooling-and-infra/agentic-payments` | Its `POST /verify` exists to check a payment authorization before a server releases content. That is the same decision Witness makes, with the missing half: the facilitator can see that a key signed, not that a human approved that exact action |
| **x402 on Monad guide** | `docs.monad.xyz/guides/x402` | Every builder copying a payable endpoint starts here. One optional check documented next to their signature check reaches all of them |
| **Monad Foundation, x402 effort** | `monad.xyz/blog/monad-foundation-joins-x402-foundation`, 29 Jun 2026 | They joined the standard whose stated job is agents that "discover, authorize". Their framing is the pitch, already written |
| **@monad-crypto/mpp** | npm | The MPP SDK is where an authorization step belongs, on their side of the call |
| **erc-8004/erc-8004-contracts** | GitHub | The registry contracts, curated by the standard's authors. Identity plus "who approved this" is the composition they do not have |
| **Monad ERC-8004 guide** | `docs.monad.xyz/guides/erc-8004` | The registration walkthrough agents follow, and the natural place to say what identity does not prove |
| **vistara-apps/erc-8004-example** | GitHub | Small, readable, real. A maintainer there can finish an L1 check in an afternoon |

What is not checked here: handles, Discord invites, or whether a given repo took commits this
month. The honest contact surface is a GitHub issue or a docs PR, which is what engineers
actually read. Offer the PR in the first message, as in §2:

---

## 4. Message templates

### A. To a team with a paid API / x402 flow

> Hey, saw your per-call pricing setup. I'm building Witness on Monad: it lets the
> **server** verify that a human actually authorized a specific payment (passkey-
> signed, bound to that exact amount and recipient), instead of trusting the payer's
> client to respect its own spend cap.
>
> Integrating it is one call in the path you already have, before you release the
> resource. I'll write that patch against your repo if you link it, 15 minutes for me,
> and you can throw it away if it doesn't fit.
>
> Live demo costs you nothing to look at (no wallet, no funds): https://witness-agent.vercel.app

### B. To a Monad DeFi / vault team

> Hi, your vault takes agent signatures. I built the missing check: proof that a
> **human** approved this specific transaction, verifiable inside your vault so a
> prompt-injected agent can't route around it.
>
> One call: `checkAndConsume(intentId, actionType, digest, amount, msg.sender, assertion)`
>, reverts with a typed reason (`OverLimit`, `Expired`, `AlreadyConsumed`).
>
> If you link the repo I'll open the PR myself. If it's a bad fit for your flow I'd
> genuinely rather hear that than guess.

### C. To an ERC-8004 / agent-marketplace builder

> Your listings prove *which* agent is acting. I built the other half: proof that a
> human authorized the action behind it, verifiable by the counterparty.
>
> It binds an ERC-8004 id to the permission, so an agent can't claim an identity it
> doesn't own, and the permission is one-time use. Contract-verified, not
> client-side.
>
> Happy to do the integration myself, send the repo, and tell me no if the shape is
> wrong for you.

### Follow-up (send once, 5-7 days later, then stop)

> Following up once: I integrated Witness into a demo vault so you can see the exact
> patch shape, [link]. If it's not useful, no reply needed, I'll stop here.

Two messages maximum. If they say no, record it in the README's "what we heard" line
only if they agreed to be named.

---

## 5. What to send in the first message (nothing more)

1. https://witness-agent.vercel.app, the product, 30 seconds to understand
2. https://witness-agent.vercel.app/integrate, the developer surface, with a live preflight
3. `packages/sdk`, so they can see it is a package, not a paste (`npm pack` there builds the
   tarball; `@witness/sdk` is the published name, it is not on the registry yet)
4. [THREAT-MODEL.md](THREAT-MODEL.md), **send this one to engineers only.** The
   honest limits section is why they will read the rest

Do not send a deck. Do not send a roadmap. Engineers reply to a diff.

---

## 6. What to ask for in return

Ask for all three in the same message, before they integrate, it is much harder to
ask afterwards:

1. **A named mention**: "Witness" + a link in their README, or one sentence in a
   release note.
2. **The transaction hash**, if they reached L3. That is the artifact that proves it.
3. **One sentence you may quote**, in their words, about why they use it. Ask for
   permission to attribute it.

---

## 7. Proving it afterwards

An integration claim is only credible with an artifact. When someone says yes, record:

- the tx hash on Monadscan, from **their** contract address (L3)
- or the refusal log showing a typed `Reason` (L2)
- or their commit that runs the example (L1)

Then add a row to the README's table:

```
| <Team> | levels | link to their commit or tx | their quote |
```

Right now that table is empty, and the README says so rather than implying
otherwise. Filling one row is the single highest-value change available to this
submission.

---

## 8. Checklist

- [ ] Pick 10 specific repos/people from the lists in §3, not channels, projects
- [ ] Send template A/B/C to each, personalised with one concrete detail from *their* code
- [ ] Offer the PR in every message
- [ ] Log each send (date, who, which level you offered)
- [ ] Follow up once after 5-7 days, then stop
- [ ] Convert the first yes into an artifact in §7
- [ ] Update the README table with the artifact, not the promise
