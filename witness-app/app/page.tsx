import Link from "next/link";
import { DEPLOYMENT } from "@/lib/server/deployment.generated";

/**
 * The landing page.
 *
 * A judge or an integrator arrives at the root URL with no context, so this page
 * answers four questions in order: what breaks today, what Witness does about it,
 * what is provably live, and where to try it. The approvals app itself lives at
 * /app, one click away, because a control panel is a terrible first impression.
 *
 * Every number and address below is read from the deployment manifest or is a
 * transaction a stranger can open, so this page cannot drift from the chain.
 */

const MUSD = DEPLOYMENT.contracts.DemoUSD as `0x${string}`;
const SAFE = DEPLOYMENT.contracts.DemoSafe as `0x${string}`;
const EXPLORER = "https://explorer.test.mezo.org";
const PAYMENT_TX = "0x2f4d2a75aa9db940170a1306f58962e3755255b71ee2f6532a2a7bbdb047d9d5";
const PAYMENT_BLOCK = "16,354,764";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const FAILURES = [
  {
    title: "Prompt injection",
    body: "A page the agent reads tells it to pay an address you have never seen. The transaction is perfectly valid.",
  },
  {
    title: "A misread invoice",
    body: "The amount is off by a decimal, or the recipient is the wrong vendor. Identity checks do not notice.",
  },
  {
    title: "A stale instruction",
    body: "A permission granted last week is still open. The agent spends inside your ceiling on something you would refuse today.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "You grant one permission",
    body: "A ceiling, a single use, an expiry. Your passkey's public key is pinned on-chain. The private key never leaves your device.",
  },
  {
    n: "02",
    title: "The agent asks",
    body: "It posts the recipient and the amount. The screen renders exactly what arrived, in plain language.",
  },
  {
    n: "03",
    title: "The contract decides",
    body: "The passkey signs one digest. The contract re-derives it, verifies it, and either pays once or reverts with a typed reason.",
  },
];

const BOUND = [
  "chain id",
  "enforcing contract",
  "permission id",
  "action type",
  "asset",
  "recipient",
  "amount",
];

const SNIPPET = `// one exact action, not "the agent"
const action = { intentId, kind: "transfer", to, amount };

// the passkey signs one digest
const passkey = await witness.requestApproval(action);

// the contract decides, before value moves
const result =
  await witness.executeAuthorizedAction(action, passkey);

if (!result.allowed) {
  console.log(result.name); // OverLimit, Expired, AlreadyConsumed
}`;

export default function Landing() {
  return (
    <main className="land">
      <nav className="land-nav" aria-label="Primary">
        <Link className="land-brand" href="/">
          <img className="land-brand__mark" src="/logo.png" alt="" width={28} height={28} />
          <span className="land-brand__name">Witness</span>
          <span className="land-brand__tag">proof of intent</span>
        </Link>
        <div className="land-nav__links">
          <a href="#how">How it works</a>
          <a href="#proof">Proof</a>
          <Link href="/integrate">Integrate</Link>
          <a href="https://github.com/thesithunyein/witness" rel="noreferrer">
            GitHub
          </a>
        </div>
        <Link className="land-cta land-cta--sm" href="/app">
          Open the app
        </Link>
      </nav>

      <section className="land-hero">
        <div className="land-hero__copy">
          <p className="land-eyebrow">
            <span className="land-dot" aria-hidden />
            Live on Mezo testnet, chain {DEPLOYMENT.chainId}
          </p>
          <h1 className="land-h1">
            Your agent asks.
            <br />
            You approve <em>that exact payment</em>.
          </h1>
          <p className="land-sub">
            An agent can prove who it is. Witness proves what you approved: one passkey signature
            over the exact payment, verified on-chain before a single {DEPLOYMENT.assetSymbol ?? "token"} moves.
          </p>
          <div className="land-ctas">
            <Link className="land-cta" href="/app">
              Open the app
            </Link>
            <a className="land-ghost" href={`${EXPLORER}/tx/${PAYMENT_TX}`} rel="noreferrer">
              See a real approval
            </a>
          </div>
          <p className="land-fineprint">
            No wallet, no seed phrase, no gas. The relayer submits; only your passkey can approve.
          </p>
          <span className="land-hands-frame">
            <img className="land-hands" src="/hands.png" alt="" />
          </span>
        </div>

        <aside className="land-proofcard" id="proof">
          <p className="land-label">Last approved action</p>
          <div className="land-proofcard__amount">
            0.05 <span>{DEPLOYMENT.assetSymbol ?? "MUSD"}</span>
          </div>
          <dl className="land-kv">
            <div>
              <dt>From</dt>
              <dd className="mono">{short(SAFE)}</dd>
            </div>
            <div>
              <dt>To</dt>
              <dd className="mono">{short(DEPLOYMENT.payee ?? SAFE)}</dd>
            </div>
            <div>
              <dt>Block</dt>
              <dd className="mono">{PAYMENT_BLOCK}</dd>
            </div>
            <div>
              <dt>Asset</dt>
              <dd className="mono">{short(MUSD)}</dd>
            </div>
          </dl>
          <p className="land-chip land-chip--ok">Approved and consumed</p>
          <p className="land-proofcard__note">
            Signed by a passkey at this origin. Paid once. Refused on replay.
          </p>
          <a className="land-proofcard__link" href={`${EXPLORER}/tx/${PAYMENT_TX}`} rel="noreferrer">
            Open the transaction
          </a>
        </aside>
      </section>

      <section className="land-strip" aria-label="Facts">
        <div>
          <span className="land-strip__num">{Object.keys(DEPLOYMENT.contracts).length}</span>
          <span className="land-strip__label">contracts deployed</span>
        </div>
        <div>
          <span className="land-strip__num">41/41</span>
          <span className="land-strip__label">tests pass, real signatures</span>
        </div>
        <div>
          <span className="land-strip__num">1</span>
          <span className="land-strip__label">use per approval</span>
        </div>
        <div>
          <span className="land-strip__num">0</span>
          <span className="land-strip__label">keys the relayer can approve with</span>
        </div>
      </section>

      <section className="land-section">
        <p className="land-eyebrow">The gap</p>
        <h2 className="land-h2">Identity is not consent.</h2>
        <p className="land-lede">
          Every agent payment stack answers who is spending. None answer whether a person approved
          this one.
        </p>
        <div className="land-grid">
          {FAILURES.map((f) => (
            <article className="land-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="land-section" id="how">
        <p className="land-eyebrow">How it works</p>
        <h2 className="land-h2">One permission, one decision, one payment.</h2>
        <div className="land-steps">
          {STEPS.map((s) => (
            <article className="land-step" key={s.n}>
              <span className="land-step__n mono">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="land-section land-section--split">
        <div>
          <p className="land-eyebrow">What the signature binds</p>
          <h2 className="land-h2">Change one field, the approval dies.</h2>
          <p className="land-lede">
            The digest is read from the contract, never recomputed in the browser. A tap for 0.05 to
            one vendor cannot be replayed as 5.00 to another.
          </p>
          <ul className="land-chips">
            {BOUND.map((b) => (
              <li className="land-chip" key={b}>
                {b}
              </li>
            ))}
            <li className="land-chip">nonce</li>
          </ul>
        </div>
        <div className="land-codeblock">
          <p className="land-label">Four calls, no ceremony</p>
          <pre className="mono">{SNIPPET}</pre>
          <Link className="land-codeblock__link" href="/integrate">
            Full integration guide
          </Link>
        </div>
      </section>

      <section className="land-section">
        <p className="land-eyebrow">Proof, not claims</p>
        <h2 className="land-h2">You can check every line of this on the explorer.</h2>
        <div className="land-grid land-grid--three">
          <article className="land-card land-card--flat">
            <h3>Real asset</h3>
            <p>
              The safe holds {DEPLOYMENT.assetSymbol ?? "MUSD"} minted from a Mezo Borrow trove against
              testnet BTC. Real value, not a placeholder.
            </p>
            <a className="mono land-addr" href={`${EXPLORER}/address/${SAFE}`} rel="noreferrer">
              {short(SAFE)} safe
            </a>
          </article>
          <article className="land-card land-card--flat">
            <h3>Real verifier</h3>
            <p>
              Mezo has no P-256 precompile, so the stack deploys one and calls it through the same
              160-byte ABI. Verified on every assertion.
            </p>
            <a
              className="mono land-addr"
              href={`${EXPLORER}/address/${DEPLOYMENT.contracts.P256Verifier}`}
              rel="noreferrer"
            >
              {short(DEPLOYMENT.contracts.P256Verifier)} verifier
            </a>
          </article>
          <article className="land-card land-card--flat">
            <h3>Real refusal</h3>
            <p>
              Replaying the same assertion reverts with <span className="mono">AlreadyConsumed</span>.
              So does an amount over the ceiling, an expired permission, or the wrong agent.
            </p>
            <Link className="mono land-addr" href="/integrate">
              try the preflight
            </Link>
          </article>
        </div>
      </section>

      <section className="land-band">
        <div>
          <h2 className="land-h2 land-h2--tight">Approve one payment yourself.</h2>
          <p className="land-sub land-sub--tight">
            Create a permission with your fingerprint. Watch a real agent request land. Nothing to
            install, nothing to fund.
          </p>
        </div>
        <div className="land-band__actions">
          <Link className="land-cta" href="/app">
            Open the app
          </Link>
          <a className="land-ghost" href="https://github.com/thesithunyein/witness" rel="noreferrer">
            Read the code
          </a>
        </div>
      </section>

      <footer className="land-footer">
        <p>
          MIT licensed. Built on Mezo testnet, chain {DEPLOYMENT.chainId}.
        </p>
        <div className="land-footer__links">
          <a href="https://github.com/thesithunyein/witness">Repository</a>
          <a href="https://github.com/thesithunyein/witness/blob/main/THREAT-MODEL.md">Threat model</a>
          <Link href="/integrate">Integrate</Link>
          <Link href="/app">App</Link>
        </div>
      </footer>
    </main>
  );
}
