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

/**
 * The integration page.
 *
 * The point of this page is to be copy-pasteable, so the snippets below are the
 * real API, every call in the "Steps" section is a method of the SDK the app
 * itself uses. Nothing here is illustrative-only: the preflight panel at the
 * bottom runs `checkAuthorization` against the live deployment, so an integrator
 * can see a genuine typed reason before wiring anything up.
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

const SNIPPET_SETUP = `import { WitnessClient, NATIVE_ACTION_TYPE } from "@witness/sdk";

const witness = new WitnessClient(
  {
    chainId: 10143,
    rpId: "<your rp id>",
    contracts: {
      DemoSafe: "0x...",              // the contract that holds the value
      WitnessIntentRegistry: "0x...", // the human's permissions
      WitnessVerifier: "0x...",       // the on-chain decision
      AgentExecutor: "0x...",         // your agent's on-chain identity
    },
  },
  { kind: "relayer", baseUrl: "https://<your app>" } // or { kind: "wallet", writer }
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

  return (
    <main className="shell">
      <AppBar
        actions={
          <a className="micro" href="/">
            ← Back to the app
          </a>
        }
      />

      <section className="section">
        <div className="section-head">
          <span className="section-num">01</span>
          <h1 className="page-title">
            Add approvals to <em>your Monad app</em>
          </h1>
        </div>
        <p className="note" style={{ marginBottom: 18 }}>
          Witness lets the human approve one exact action with a passkey, and lets your contract check
          that approval before anything moves.
        </p>

        <div className="integrate-grid">
          <Step n="1" title="Construct the client">
            <Copy id="setup" onCopy={copy} copied={copied} text={SNIPPET_SETUP} />
          </Step>
          <Step n="2" title="Run the loop">
            <Copy id="loop" onCopy={copy} copied={copied} text={SNIPPET_LOOP} />
          </Step>
          <Step n="3" title="Check approval in your contract">
            <Copy id="server" onCopy={copy} copied={copied} text={SNIPPET_SERVER} />
          </Step>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="section-num">02</span>
          <p className="section-title">The four calls</p>
        </div>
        <ul className="rows">
          {[
            ["createIntent", "The human registers a permission: what may be done, up to how much, for how long, by which agent."],
            ["requestApproval", "The passkey signs the digest of this exact action. The digest is read from your contract, never recomputed off-chain."],
            ["checkAuthorization", "Read-only preflight. Returns the contract's own typed reason, so you can explain a refusal before submitting anything."],
            ["executeAuthorizedAction", "Perform it. The contract re-derives the digest and runs every check; a refusal comes back as a typed reason, not a generic failure."],
          ].map(([name, what]) => (
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
        <p className="note" style={{ marginTop: 16 }}>
          Install it rather than copying it: <span className="mono">npm i @witness/sdk viem</span>, built
          from the same modules this page uses. Runnable examples:{" "}
          <span className="mono">examples/monad-app.mjs</span> reads a permission, and{" "}
          <span className="mono">examples/agent-request.mjs</span> is an agent that asks a human and
          then checks the payment on-chain.
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="section-num">03</span>
          <p className="section-title">Try the preflight (live)</p>
        </div>
        <p className="note" style={{ marginBottom: 16 }}>
          This calls <span className="mono">WitnessVerifier.check</span> on the deployed testnet
          contracts right now. Set an amount above the permission&rsquo;s ceiling to see the refusal
          an agent would hit.
        </p>

        {configError && (
          <div className="err" role="alert">
            {configError}
          </div>
        )}

        {config && (
          <div className="card">
            <div className="field-grid">
              <div className="field">
                <label htmlFor="i-id">Permission id</label>
                <input id="i-id" inputMode="numeric" value={intentId} onChange={(e) => setIntentId(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="i-amount">Amount (MON)</label>
                <input id="i-amount" inputMode="decimal" value={amountMon} onChange={(e) => setAmountMon(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="i-to">Recipient</label>
              <input id="i-to" className="mono" value={to} onChange={(e) => setTo(e.target.value)} />
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
      </section>

      <section className="section">
        <div className="section-head">
          <span className="section-num">04</span>
          <p className="section-title">What you get, and what you must still do</p>
        </div>
        <ul className="rows">
          <li className="row">
            <span className="state state--ok">
              <span aria-hidden>✓</span>Enforced
            </span>
            <div className="row__main">
              <p className="row__title">An approval bound to one exact action</p>
              <p className="row__meta">
                Recipient, amount, asset, your contract, and the chain id are all inside the signed
                digest. Change any of them and the signature stops verifying.
              </p>
            </div>
          </li>
          <li className="row">
            <span className="state state--ok">
              <span aria-hidden>✓</span>Enforced
            </span>
            <div className="row__main">
              <p className="row__title">One use, expiry, and revocation</p>
              <p className="row__meta">
                The approval is consumed before value moves, so it cannot be replayed. Expiry and
                revocation are checked by the contract on every attempt.
              </p>
            </div>
          </li>
          <li className="row">
            <span className="state state--wait">
              <span aria-hidden>•</span>Your side
            </span>
            <div className="row__main">
              <p className="row__title">You must route value through a Witness-checked path</p>
              <p className="row__meta">
                It covers the contract that calls the verifier, DemoSafe on this demo, and nothing
                else. An agent with another way to spend your funds is not constrained by Witness.
              </p>
            </div>
          </li>
          <li className="row">
            <span className="state state--wait">
              <span aria-hidden>•</span>Your side
            </span>
            <div className="row__main">
              <p className="row__title">The rp id must be your real origin</p>
              <p className="row__meta">
                Passkeys are bound to a relying party, so a deployment for{" "}
                <span className="mono">app.example.com</span> needs its own verifier with that rp id.
                A mismatch fails every prompt, the most common way this integration breaks.
              </p>
            </div>
          </li>
        </ul>
      </section>
    </main>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="integrate-step">
      <div className="section-head" style={{ marginBottom: 10 }}>
        <span className="section-num">{n}</span>
        <p className="section-title" style={{ margin: 0 }}>
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

function Copy({
  id,
  text,
  copied,
  onCopy,
}: {
  id: string;
  text: string;
  copied: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  return (
    <div className="code">
      <pre className="mono">{text}</pre>
      <button className="code__copy" onClick={() => onCopy(id, text)} aria-label={`Copy ${id} example`}>
        {copied === id ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
