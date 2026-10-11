"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type Address } from "viem";
import { demoSafeAbi, intentRegistryAbi, REASON_MESSAGES } from "@/lib/abi";
import { countdown, fmt, publicClient, secondsLeft, short } from "@/lib/witness";
import { assertPasskey, enrollPasskey, passkeyAvailable } from "@/lib/webauthn";

type Contracts = {
  DemoUSD: Address;
  WitnessIntentRegistry: Address;
  WitnessVerifier: Address;
  DemoSafe: Address;
  AgentExecutor: Address;
};

type Config = {
  chainId: number;
  rpId: string;
  origin: string;
  contracts: Contracts;
  identityEnforced: boolean;
};

type Entry = {
  key: number;
  tone: "ok" | "bad" | "info";
  title: string;
  detail?: string;
  hash?: string;
  link?: string;
};

const RECIPIENT: Address = "0x1111111111111111111111111111111111111111";
const ATTACKER: Address = "0xdead00000000000000000000000000000000dead";

/** What the human approves. The injected attempt is 10x this. */
const APPROVED = "1";
const INJECTED = "10";
const EXPIRES_IN = 600;

export default function Page() {
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [platformOk, setPlatformOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [intentId, setIntentId] = useState<bigint | null>(null);
  const [intent, setIntent] = useState<{
    maxAmount: bigint;
    expiry: bigint;
    revoked: boolean;
    consumed: boolean;
  } | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [verdict, setVerdict] = useState<null | { ok: boolean; label: string; note: string }>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const log = useCallback((e: Omit<Entry, "key">) => {
    setEntries((prev) => [{ ...e, key: Date.now() + Math.random() }, ...prev].slice(0, 8));
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "config unavailable");
        setConfig(j as Config);
      })
      .catch((e) => setConfigError(e instanceof Error ? e.message : String(e)));
    passkeyAvailable().then(setPlatformOk);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const refreshIntent = useCallback(
    async (id: bigint) => {
      if (!config) return;
      const pc = publicClient(config.chainId);
      const it = (await pc.readContract({
        address: config.contracts.WitnessIntentRegistry,
        abi: intentRegistryAbi,
        functionName: "getIntent",
        args: [id],
      })) as {
        maxAmount: bigint;
        expiry: bigint;
        revoked: boolean;
        consumed: boolean;
      };
      setIntent({
        maxAmount: it.maxAmount,
        expiry: it.expiry,
        revoked: it.revoked,
        consumed: it.consumed,
      });
    },
    [config]
  );

  const createPermission = async () => {
    if (!config) return;
    setBusy("create");
    setErr(null);
    try {
      // 1. Enrol the passkey. Its public key becomes the authority.
      const pk = await enrollPasskey(config.rpId);
      setEnrolled(true);

      // 2. Register the permission on-chain, naming the passkey and the agent.
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          agentWallet: config.contracts.AgentExecutor,
          agentId: "0",
          maxAmount: APPROVED,
          expiresInSeconds: EXPIRES_IN,
          qx: pk.qx.toString(),
          qy: pk.qy.toString(),
          credentialId: pk.credentialId,
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "could not register the permission");

      const pc = publicClient(config.chainId);
      const next = (await pc.readContract({
        address: config.contracts.WitnessIntentRegistry,
        abi: intentRegistryAbi,
        functionName: "nextIntentId",
      })) as bigint;
      const id = next - 1n;
      setIntentId(id);
      await refreshIntent(id);

      log({
        tone: "info",
        title: "Permission registered",
        detail: `Intent #${id} — passkey enrolled, agent bound`,
        hash: j.txHash,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const approveAndExecute = async () => {
    if (!config || intentId === null) return;
    setBusy("approve");
    setErr(null);
    setVerdict(null);
    try {
      const pc = publicClient(config.chainId);
      // The digest comes from the contract, so it necessarily matches what the
      // safe will recompute and what the verifier will check.
      const actionHash = (await pc.readContract({
        address: config.contracts.DemoSafe,
        abi: demoSafeAbi,
        functionName: "actionHash",
        args: [intentId, RECIPIENT, BigInt(APPROVED) * 10n ** 18n],
      })) as `0x${string}`;

      // The human approves THIS digest with their passkey.
      const assertion = await assertPasskey(config.rpId, actionHash);

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intentId: intentId.toString(),
          to: RECIPIENT,
          amount: APPROVED,
          assertion: {
            authenticatorData: assertion.authenticatorData,
            clientDataJSON: assertion.clientDataJSON,
            r: assertion.r.toString(),
            s: assertion.s.toString(),
          },
        }),
      });
      const j = await res.json();

      if (j.ok) {
        setVerdict({
          ok: true,
          label: "Verified",
          note: "The human approved this exact action. The agent executed it.",
        });
        log({
          tone: "ok",
          title: "Verified — action executed",
          detail: `${APPROVED}.00 DUSD to ${short(RECIPIENT)}`,
          hash: j.txHash,
          link: j.explorer,
        });
      } else {
        setVerdict({
          ok: false,
          label: "Blocked",
          note: REASON_MESSAGES[j.reason] ?? j.detail ?? "Rejected.",
        });
        log({ tone: "bad", title: `Blocked — ${j.reason}`, detail: j.detail });
      }
      await refreshIntent(intentId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /** The agent, injected, attempts 10x the approved amount with nothing to present. */
  const runInjection = async () => {
    if (!config || intentId === null) return;
    setBusy("attack");
    setErr(null);
    setVerdict(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intentId: intentId.toString(),
          to: ATTACKER,
          amount: INJECTED,
          assertion: null, // the agent cannot manufacture human approval
        }),
      });
      const j = await res.json();

      setVerdict({
        ok: !!j.ok,
        label: j.ok ? "Executed" : "Blocked",
        note: j.ok
          ? "Unexpected: the transfer went through."
          : `${REASON_MESSAGES[j.reason] ?? "Rejected."} Attempted ${INJECTED}.00 DUSD, approved ${APPROVED}.00.`,
      });
      log({
        tone: j.ok ? "bad" : "ok",
        title: `${j.ok ? "EXECUTED" : "BLOCKED"} — prompt injection`,
        detail: `Injected instruction: transfer ${INJECTED} DUSD to ${short(ATTACKER)}`,
        hash: j.txHash,
        link: j.explorer,
      });
      await refreshIntent(intentId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!config || intentId === null) return;
    setBusy("revoke");
    setErr(null);
    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke", intentId: intentId.toString() }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "revoke failed");
      await refreshIntent(intentId);
      log({ tone: "info", title: "Revoked", detail: "The human withdrew this permission", hash: j.txHash });
      setVerdict({
        ok: false,
        label: "Revoked",
        note: "This permission can no longer be used. Try the approved action again.",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remaining = useMemo(() => {
    if (!intent) return Infinity;
    return secondsLeft(intent.expiry) - 1;
    // `now` is referenced so the countdown re-computes each second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, now]);

  const status = useMemo(() => {
    if (!intent) return { tone: "idle" as const, label: "No permission" };
    if (intent.revoked) return { tone: "bad" as const, label: "Revoked" };
    if (intent.consumed) return { tone: "ok" as const, label: "Used" };
    if (remaining <= 0) return { tone: "bad" as const, label: "Expired" };
    return { tone: "warn" as const, label: "Active" };
  }, [intent, remaining]);

  if (configError) {
    return (
      <main className="shell">
        <Masthead />
        <Hero />
        <div className="err" style={{ marginTop: 28 }}>
          <strong>Not configured.</strong> {configError}
        </div>
        <section className="section section--1">
          <div className="section-head">
            <span className="section-num">01</span>
            <p className="section-title">Wiring this up</p>
          </div>
          <p className="note" style={{ marginBottom: 16 }}>
            The app reads its contract addresses from the manifest the deploy script writes. Deploy
            the stack, then set the server environment:
          </p>
          <pre className="mono note" style={{ whiteSpace: "pre-wrap" }}>
{`cd contracts
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast

# server environment (never exposed to the browser)
WITNESS_CHAIN_ID=10143
WITNESS_OPERATOR_PRIVATE_KEY=0x...   # drives the demo agent
WITNESS_RELAYER_PRIVATE_KEY=0x...    # registers/revokes permissions`}
          </pre>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <Masthead identityEnforced={config?.identityEnforced} chainId={config?.chainId} />
      <Hero />

      {platformOk === false && (
        <div className="err">
          This browser reports no platform authenticator. Witness needs a device passkey (Touch ID,
          Windows Hello, or a security key) to produce the approval.
        </div>
      )}
      {err && <div className="err">{err}</div>}

      {/* --- 01. what the human has authorized --- */}
      <section className="section section--1">
        <div className="section-head">
          <span className="section-num">01</span>
          <p className="section-title">Active permission</p>
          <span className={`chip ${status.tone}`}>
            <span aria-hidden>
              {status.tone === "ok" ? "✓" : status.tone === "bad" ? "✕" : "•"}
            </span>
            {status.label}
          </span>
        </div>

        {!intent ? (
          <div className="receipt">
            <p className="receipt-sentence">No permission registered yet.</p>
            <p className="receipt-sub">
              Registering creates a passkey and stores its public key on-chain as the authority for
              this permission. Nothing can move in your name without a signature from it.
            </p>
            <div className="steps">
              <button
                className="primary"
                onClick={createPermission}
                disabled={!config || busy !== null || platformOk === false}
              >
                {busy === "create" ? "Enrolling passkey…" : "Create permission with passkey"}
              </button>
            </div>
          </div>
        ) : (
          <div className="receipt">
            {/* the human sentence, in the display serif: the page's second voice */}
            <p className="receipt-sentence">
              Allow Research Agent to transfer up to <em>{APPROVED}.00 DUSD</em>
            </p>
            <p className="receipt-sub">One use only. Expires in 10 minutes.</p>

            <div className="steps">
              <button
                className="primary"
                onClick={approveAndExecute}
                disabled={busy !== null || !intent || intent.revoked || intent.consumed}
              >
                {busy === "approve" ? "Waiting for passkey…" : "Approve with passkey"}
              </button>
              <button onClick={runInjection} disabled={busy !== null}>
                {busy === "attack" ? "Attempting…" : "Simulate prompt injection"}
              </button>
              <button className="danger" onClick={revoke} disabled={busy !== null || intent.revoked}>
                {busy === "revoke" ? "Revoking…" : "Revoke access"}
              </button>
            </div>

            <dl className="disclosure">
              <dt>Intent</dt>
              <dd>#{intentId?.toString()}</dd>
              <dt>Expires</dt>
              <dd className="countdown">
                {intent.revoked || intent.consumed ? "—" : countdown(remaining)}
              </dd>
              <dt>Permission cap</dt>
              <dd>{fmt(intent.maxAmount)} DUSD</dd>
              <dt>Agent wallet</dt>
              <dd>{config ? config.contracts.AgentExecutor : ""}</dd>
              <dt>ERC-8004 binding</dt>
              <dd>{config?.identityEnforced ? "enforced" : "not configured"}</dd>
              <dt>Relying party</dt>
              <dd>{config?.rpId}</dd>
              <dt>Passkey</dt>
              <dd>{enrolled ? "enrolled in this browser" : "already enrolled"}</dd>
            </dl>
          </div>
        )}

        {intent && (
          <p className="note" style={{ marginTop: 18 }}>
            &ldquo;Simulate prompt injection&rdquo; runs the same agent against the same contract,
            asking for {INJECTED}.00 DUSD to a different address, with no approval to present. The
            refusal is a reverted on-chain transaction, not a client-side check.
          </p>
        )}
      </section>

      {/* --- 02. the verdict: the one loud moment, sized for a room --- */}
      {verdict && (
        <section className={`verdict ${verdict.ok ? "ok" : "bad"}`} role="status" aria-live="polite">
          <div className="section-head">
            <span className="section-num">02</span>
            <p className="section-title">Verdict — decided on-chain</p>
          </div>
          <p className="verdict-label">{verdict.label}</p>
          <p className="verdict-note">{verdict.note}</p>
        </section>
      )}

      {/* --- 03. the record --- */}
      <section className={`section ${verdict ? "section--3" : "section--2"}`}>
        <div className="section-head">
          <span className="section-num">{verdict ? "03" : "02"}</span>
          <p className="section-title">Live action feed</p>
        </div>
        {entries.length === 0 ? (
          <p className="note">Nothing yet. Register a permission, then approve one action.</p>
        ) : (
          <ul className="feed">
            {entries.map((e) => (
              <li className="entry" key={e.key}>
                <span className={`chip ${e.tone === "ok" ? "ok" : e.tone === "bad" ? "bad" : "idle"}`}>
                  <span aria-hidden>{e.tone === "ok" ? "✓" : e.tone === "bad" ? "✕" : "•"}</span>
                  {e.tone === "ok" ? "Allowed" : e.tone === "bad" ? "Rejected" : "Info"}
                </span>
                <div className="entry-main">
                  <div className="entry-reason">{e.title}</div>
                  {e.detail && <div className="entry-detail">{e.detail}</div>}
                  {e.link ? (
                    <div className="entry-hash">
                      <a href={e.link} target="_blank" rel="noreferrer">
                        {short(e.hash ?? "", 14, 8)} ↗
                      </a>
                    </div>
                  ) : (
                    e.hash && <div className="entry-hash">{short(e.hash, 14, 8)}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="note" style={{ marginTop: 24 }}>
        The passkey is the authority. This app relays gas only, so no wallet or testnet funds are
        needed to try it — and the relayed key cannot approve anything, because it does not hold the
        passkey.
      </p>
    </main>
  );
}

/** The asterisk mark: drawn rather than typed, so it never depends on a font. */
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
        <line x1="12" y1="1.5" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="22.5" y2="12" />
        <line x1="4.6" y1="4.6" x2="19.4" y2="19.4" />
        <line x1="19.4" y1="4.6" x2="4.6" y2="19.4" />
      </g>
    </svg>
  );
}

function Masthead({ chainId, identityEnforced }: { chainId?: number; identityEnforced?: boolean }) {
  return (
    <header className="masthead">
      <div className="brand">
        <Mark />
        <span className="brand-name">Witness</span>
      </div>
      <div className="masthead-right">
        <p className="micro">{identityEnforced ? "ERC-8004 enforced" : "ERC-8004 not configured"}</p>
        <span className="pill">
          <span className="pill__dot" aria-hidden />
          {chainId ? (chainId === 143 ? "Monad · 143" : "Monad testnet · 10143") : "Connecting…"}
        </span>
      </div>
    </header>
  );
}

/** The wordmark: one display face, one gradient tail, nothing else. */
function Hero() {
  return (
    <section className="hero">
      <h1 className="hero-word" aria-label="Witness">
        <span className="hero-word__mask">
          <span className="hero-word__inner">
            <span className="hero-word__white">WIT</span>
            <span className="hero-word__accent">NESS</span>
          </span>
        </span>
      </h1>
      <div className="hero-foot">
        <p className="micro">
          An agent can prove who it is.
          <br />
          Witness proves what the human actually authorized.
        </p>
        <p className="micro hero-foot__right">
          Every rejection returns a reason.
          <br />
          Not a bare revert.
        </p>
      </div>
    </section>
  );
}
