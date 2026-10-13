"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import {
  NATIVE_ACTION_TYPE,
  REASON_MESSAGES,
  WitnessClient,
  type Authorization,
} from "@/lib/sdk";
import { AppBar } from "@/components/chrome";
import { ArrowRightIcon, ExternalLinkIcon } from "@/components/icons";
import { short } from "@/lib/witness";

/**
 * The integration page.
 *
 * This is a developer surface, so it is built the way the documentation this
 * audience already uses is built: a rail on the left that says where you are,
 * numbered steps with their prerequisites stated, and code in a block that
 * carries its own filename and its own copy button. The page never explains
 * itself in prose where a file name and a code block would do.
 *
 * Everything on it is the real API. The steps are calls the SDK this app runs
 * on actually makes, and the preflight at the bottom runs `checkAuthorization`
 * against the live deployment, so an integrator can see a genuine typed reason
 * before wiring anything up.
 */

type Config = {
  chainId: number;
  rpId: string;
  origin: string;
  contracts: {
    DemoUSD: Address;
    WitnessIntentRegistry: Address;
    WitnessVerifier: Address;
    DemoSafe: Address;
    AgentExecutor: Address;
  };
  agentId: string;
  explorer: string;
};

/**
 * What the page is made of, in order.
 *
 * One list: the rail, the section ids and the anchors the landing page's footer
 * links to all read from it, so a section cannot be added to the page and go
 * missing from the navigation above it.
 */
const SECTIONS: { id: string; n: string; label: string }[] = [
  { id: "client", n: "01", label: "Construct the client" },
  { id: "loop", n: "02", label: "Run the loop" },
  { id: "contract", n: "03", label: "Check it in your contract" },
  { id: "calls", n: "04", label: "The four calls" },
  { id: "preflight", n: "05", label: "Try the preflight" },
  { id: "limits", n: "06", label: "Guarantees and limits" },
];

const SNIPPET_SETUP = `import { WitnessClient, NATIVE_ACTION_TYPE } from "@witness/sdk";

const witness = new WitnessClient(
  {
    chainId: 10143,
    rpId: "app.example.com",       // must equal the origin the deployment froze
    contracts: {
      DemoSafe: "0x...",              // the contract that holds the value
      WitnessIntentRegistry: "0x...", // the human's permissions
      WitnessVerifier: "0x...",       // the on-chain decision
      AgentExecutor: "0x...",         // your agent's on-chain identity
    },
  },
  { kind: "relayer", baseUrl: "https://app.example.com" } // or { kind: "wallet", writer }
);`;

const SNIPPET_LOOP = `// 1. The human registers a permission. One payment, one ceiling, one expiry.
const { intentId } = await witness.createIntent({
  actionType: NATIVE_ACTION_TYPE,   // or TRANSFER_ACTION_TYPE for an ERC-20
  maxAmount: 5n * 10n ** 17n,       // 0.5 MON
  expirySeconds: 600,
});

// 2. Your agent wants to act. Ask the human first.
const action = { intentId, kind: "native", to: payee, amount: 5n * 10n ** 17n };
const assertion = await witness.requestApproval(action);

// 3. Preflight. Free, read-only, and it names the exact reason.
const pre = await witness.checkAuthorization(action, { assertion });
if (!pre.allowed) {
  console.log("refused:", pre.name, pre.message);  // e.g. OverLimit
  return;
}

// 4. Perform it. The contract re-derives the digest and enforces it, so an
//    approval for a different recipient, amount, asset or chain cannot be used.
const result = await witness.executeAuthorizedAction(action, assertion);
if (!result.allowed) {
  console.log("refused on-chain:", result.name, result.message);
}`;

const SNIPPET_SERVER = `// The counterparty route: the relayer submits, the contract decides.
export async function POST(req: Request) {
  const { intentId, kind, to, amount, assertion } = await req.json();
  try {
    const hash = await wallet.writeContract({
      address: contracts.AgentExecutor,
      abi: agentExecutorAbi,
      functionName: kind === "native" ? "executeTransferNative" : "executeTransfer",
      args: [BigInt(intentId), to, BigInt(amount), assertion],
    });
    return Response.json({ ok: true, txHash: hash });
  } catch (err) {
    // Do not swallow this. The contract already computed the reason, and "it
    // failed" tells the human nothing. See /api/agent in this app.
    const decoded = decodeUnauthorized(err);
    return Response.json({ ok: false, reason: decoded?.name, reasonCode: decoded?.reason });
  }
}`;

const CALLS: [string, string][] = [
  [
    "createIntent",
    "The human registers a permission: what may be done, up to how much, for how long, by which agent.",
  ],
  [
    "requestApproval",
    "The passkey signs the digest of this exact action. The digest is read from your contract, never recomputed off-chain.",
  ],
  [
    "checkAuthorization",
    "Read-only preflight. Returns the contract's own typed reason, so you can explain a refusal before submitting anything.",
  ],
  [
    "executeAuthorizedAction",
    "Perform it. The contract re-derives the digest and runs every check; a refusal comes back as a typed reason, not a generic failure.",
  ],
];

/** What the integration does and does not cover. The second column is the point. */
const LIMITS: { tone: "ok" | "wait"; tag: string; title: string; body: string }[] = [
  {
    tone: "ok",
    tag: "Enforced",
    title: "An approval bound to one exact action",
    body: "Recipient, amount, asset, your contract, and the chain id are all inside the signed digest. Change any of them and the signature stops verifying.",
  },
  {
    tone: "ok",
    tag: "Enforced",
    title: "One use, expiry, and revocation",
    body: "The approval is consumed before value moves, so it cannot be replayed. Expiry and revocation are checked by the contract on every attempt.",
  },
  {
    tone: "wait",
    tag: "Your side",
    title: "Value has to move through a Witness-checked path",
    body: "It covers the contract that calls the verifier, and nothing else. An agent with another way to spend your funds is not constrained by Witness.",
  },
  {
    tone: "wait",
    tag: "Your side",
    title: "The rp id must be your real origin",
    body: "Passkeys are bound to a relying party, so a deployment for app.example.com needs its own verifier with that rp id. A mismatch fails every prompt, and it is the most common way this integration breaks.",
  },
];

const NEXT: { title: string; body: string; href: string; label: string; external?: boolean }[] = [
  {
    title: "Run an agent against this deployment",
    body: "examples/agent-request.mjs asks a human for one payment, then reads the chain to confirm what happened rather than trusting the reply.",
    href: "https://github.com/thesithunyein/witness",
    label: "Open the repository",
    external: true,
  },
  {
    title: "See what the app itself reads",
    body: "The deployed manifest: chain, addresses, the frozen rp id, and the agent identity the verifier checks ownership of.",
    href: "/api/config",
    label: "GET /api/config",
  },
  {
    title: "Use the reference implementation",
    body: "The app in this deployment is the whole loop with a UI on it: create a permission, let an agent ask, approve one payment, watch a second attempt get refused.",
    href: "/app",
    label: "Open the app",
  },
];

export default function Integrate() {
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Live preflight state.
  const [intentId, setIntentId] = useState("1");
  const [to, setTo] = useState("0x1111111111111111111111111111111111111111");
  const [amountMon, setAmountMon] = useState("0.5");
  const [result, setResult] = useState<Authorization | null>(null);
  const [digest, setDigest] = useState<Hex | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "config unavailable");
        setConfig(j as Config);
      })
      .catch((e) => setConfigError(e instanceof Error ? e.message : String(e)));
  }, []);

  const client = useMemo(
    () =>
      config
        ? new WitnessClient(
            {
              chainId: config.chainId,
              contracts: config.contracts,
              rpId: config.rpId,
              agentId: BigInt(config.agentId),
              explorer: config.explorer,
            },
            { kind: "relayer" }
          )
        : null,
    [config]
  );

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  };

  /**
   * A real preflight against the deployed verifier. No assertion is supplied, so
   * the semantic checks (does it exist, is it revoked, expired, used, over the
   * ceiling, wrong agent) answer honestly and the signature check is the only
   * thing that comes back negative, which is the question an integrator is
   * actually asking here: "is this permission still usable, and if not, why?"
   */
  const runCheck = async () => {
    if (!client) return;
    setChecking(true);
    setCheckError(null);
    setResult(null);
    setDigest(null);
    try {
      let amount: bigint;
      try {
        amount = BigInt(Math.round(Number(amountMon) * 1e6)) * 10n ** 12n;
        if (amount < 0n) throw new Error("negative");
      } catch {
        throw new Error("Amount must be a positive number of MON, like 0.5.");
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error("Recipient must be a 20-byte hex address.");

      const request = { intentId: BigInt(intentId), kind: "native" as const, to: to as Address, amount };
      setDigest(await client.actionDigest(request));
      setResult(await client.checkAuthorization(request));
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const verifier = config?.contracts.WitnessVerifier;

  return (
    <main className="shell">
      <AppBar
        chainId={config?.chainId}
        actions={
          <a className="micro micro--icon" href="/app">
            <span>Open the app</span>
            <ArrowRightIcon size={13} className="micro__arrow" />
          </a>
        }
      />

      <div className="dev">
        <nav className="dev__toc" aria-label="On this page">
          <p className="dev__toc-label">On this page</p>
          <ol className="dev__toc-list">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>
                  <span className="dev__toc-n mono">{s.n}</span>
                  {s.label}
                </a>
              </li>
            ))}
            <li>
              <a href="#next">
                <span className="dev__toc-n mono">07</span>
                Next steps
              </a>
            </li>
          </ol>
        </nav>

        <div className="dev__body">
          <header className="dev__head">
            <p className="micro">Integration guide</p>
            <h1 className="dev__title">
              Add passkey approvals to <em>your</em> app.
            </h1>
            <p className="dev__lede">
              Witness lets the human approve one exact action with a passkey, and lets your contract
              check that approval before anything moves. One SDK, one check on-chain, three steps.
            </p>

            <dl className="dev__facts">
              <div>
                <dt>Package</dt>
                <dd className="mono">@witness/sdk</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{config ? `Monad testnet · ${config.chainId}` : "Monad testnet · 10143"}</dd>
              </div>
              <div>
                <dt>Requires</dt>
                <dd>Node 20.11+, viem, a passkey-capable browser</dd>
              </div>
              <div>
                <dt>Verifier</dt>
                <dd className="mono">
                  {verifier ? (
                    /* The short form keeps the spec table to one line per row; the
                       full address is in the link and in its tooltip. */
                    <a
                      className="link-icon"
                      href={`https://testnet.monadscan.com/address/${verifier}`}
                      title={verifier}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(verifier)}
                      <ExternalLinkIcon size={12} />
                    </a>
                  ) : (
                    "from the deployment manifest"
                  )}
                </dd>
              </div>
            </dl>

            <div className="dev__actions">
              <a className="dev__btn" href="/app">
                Try it in the app first
                <ArrowRightIcon size={14} />
              </a>
              <button
                className="mono"
                onClick={() => copy("install", "npm i @witness/sdk viem")}
                aria-label="Copy the install command"
              >
                {copied === "install" ? "Copied" : "npm i @witness/sdk viem"}
              </button>
            </div>
          </header>

          {configError && (
            <div className="err" role="alert">
              {configError}
            </div>
          )}

          <section className="dev__section" id="client">
            <SectionHead n="01" title="Construct the client">
              Point it at your deployment. The rp id has to be the origin the verifier was frozen
              with: passkeys are bound to a relying party, and a mismatch fails every prompt.
            </SectionHead>
            <CodeBlock
              id="setup"
              label="witness.ts"
              text={SNIPPET_SETUP}
              copied={copied}
              onCopy={copy}
              note="Everything else is derived from this: the digest your human signs comes from your verifier, not from the SDK."
            />
          </section>

          <section className="dev__section" id="loop">
            <SectionHead n="02" title="Run the loop">
              Four calls, in this order. The human's passkey signs the digest, the relayer submits
              it, and the contract decides.
            </SectionHead>
            <CodeBlock
              id="loop"
              label="agent.ts"
              text={SNIPPET_LOOP}
              copied={copied}
              onCopy={copy}
              note="Preflight is free and read-only. Call it before the passkey prompt: an agent should never ask a human to approve something the chain will refuse."
            />
          </section>

          <section className="dev__section" id="contract">
            <SectionHead n="03" title="Check it in your contract">
              Your side of the handshake. If your route swallows the reason, the human gets
              &ldquo;it failed&rdquo; instead of the contract&rsquo;s own answer.
            </SectionHead>
            <CodeBlock
              id="server"
              label="app/api/pay/route.ts"
              text={SNIPPET_SERVER}
              copied={copied}
              onCopy={copy}
              note="Return the reason, not just a status. Every refusal below has a name, and the name is what a human can act on."
            />
          </section>

          <section className="dev__section" id="calls">
            <SectionHead n="04" title="The four calls">
              The whole surface. Four methods, and nothing hidden behind them.
            </SectionHead>
            <ul className="rows">
              {CALLS.map(([name, what]) => (
                <li className="row" key={name}>
                  <code className="mono state state--quiet" style={{ minWidth: 0 }}>
                    {name}
                  </code>
                  <div className="row__main">
                    <p className="row__meta">{what}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="dev__note">
              Install it rather than copying it: <span className="mono">npm i @witness/sdk viem</span>
              , built from the same modules this page uses.
            </p>
          </section>

          <section className="dev__section" id="preflight">
            <SectionHead n="05" title="Try the preflight">
              This calls <span className="mono">WitnessVerifier.check</span> on the deployed testnet
              contracts right now. Set an amount above the permission&rsquo;s ceiling to see the
              refusal an agent would hit.
            </SectionHead>

            {config && (
              <div className="card">
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="i-id">Permission id</label>
                    <input
                      id="i-id"
                      inputMode="numeric"
                      value={intentId}
                      onChange={(e) => setIntentId(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="i-amount">Amount (MON)</label>
                    <input
                      id="i-amount"
                      inputMode="decimal"
                      value={amountMon}
                      onChange={(e) => setAmountMon(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="i-to">Recipient</label>
                  <input
                    id="i-to"
                    className="mono"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>

                <div className="section-actions" style={{ marginTop: 4 }}>
                  <button className="primary" onClick={runCheck} disabled={checking} aria-busy={checking}>
                    {checking ? "Checking…" : "Run preflight"}
                  </button>
                </div>

                {checkError && (
                  <div className="err" role="alert" style={{ marginTop: 14 }}>
                    {checkError}
                  </div>
                )}

                {result && (
                  <div
                    className={`verdict-card ${result.allowed ? "verdict-card--ok" : "verdict-card--bad"}`}
                    role="status"
                    aria-live="polite"
                    style={{ marginTop: 16 }}
                  >
                    <p className="verdict-card__label">
                      {result.allowed ? "Allowed" : result.name}
                    </p>
                    <p className="verdict-card__note">
                      {REASON_MESSAGES[result.name] ?? result.message}
                      {!result.allowed && result.name === "BadSignature" && (
                        <>
                          {" "}
                          Expected here: no assertion was supplied, so only the signature check fails.
                          Every semantic check above it already passed.
                        </>
                      )}
                    </p>
                    {digest && (
                      <dl className="tech-list" style={{ marginTop: 14 }}>
                        <dt>Digest covered by the approval</dt>
                        <dd className="mono" style={{ wordBreak: "break-all" }}>
                          {digest}
                        </dd>
                        <dt>Reason code</dt>
                        <dd>{result.allowed ? 0 : result.code}</dd>
                      </dl>
                    )}
                  </div>
                )}
              </div>
            )}

            {!config && !configError && (
              <p className="dev__note" aria-busy="true">
                Reading the deployment manifest…
              </p>
            )}
          </section>

          <section className="dev__section" id="limits">
            <SectionHead n="06" title="Guarantees and limits">
              Two of these the contract enforces for you. Two are yours to get right, and they are
              the ones that decide whether this holds.
            </SectionHead>
            <ul className="rows">
              {LIMITS.map((item) => (
                <li className="row" key={item.title}>
                  <span className={`state state--${item.tone}`}>
                    <span aria-hidden>{item.tone === "ok" ? "✓" : "•"}</span>
                    {item.tag}
                  </span>
                  <div className="row__main">
                    <p className="row__title">{item.title}</p>
                    <p className="row__meta">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="dev__section" id="next">
            <SectionHead n="07" title="Next steps">
              Three ways on from here, in the order they are useful.
            </SectionHead>
            <ul className="rows">
              {NEXT.map((item) => (
                <li className="row" key={item.title}>
                  <div className="row__main">
                    <p className="row__title">{item.title}</p>
                    <p className="row__meta">{item.body}</p>
                    <p className="row__meta">
                      <a
                        className="link-icon"
                        href={item.href}
                        {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
                      >
                        {item.label}
                        {item.external ? (
                          <ExternalLinkIcon size={12} />
                        ) : (
                          <ArrowRightIcon size={12} />
                        )}
                      </a>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}

/** A step's heading and its one paragraph of context. Shared so all six match. */
function SectionHead({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="dev__section-head">
      <span className="dev__section-n mono">{n}</span>
      <div>
        <h2 className="dev__section-title">{title}</h2>
        <p className="dev__section-lede">{children}</p>
      </div>
    </div>
  );
}

/**
 * A code block that knows what it is.
 *
 * The filename sits in the bar above the code, because "which file does this go
 * in" is the first question a snippet raises, and the copy button sits in the
 * same bar rather than floating over the last line of code, where it covered the
 * thing being copied.
 */
function CodeBlock({
  id,
  label,
  text,
  note,
  copied,
  onCopy,
}: {
  id: string;
  label: string;
  text: string;
  note?: string;
  copied: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  return (
    <figure className="codeblock">
      <figcaption className="codeblock__bar">
        <span className="codeblock__label mono">{label}</span>
        <button
          className="codeblock__copy"
          onClick={() => onCopy(id, text)}
          aria-label={`Copy ${label}`}
        >
          {copied === id ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="mono">{text}</pre>
      {note && <p className="codeblock__note">{note}</p>}
    </figure>
  );
}
