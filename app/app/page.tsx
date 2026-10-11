"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, type Address } from "viem";
import {
  NATIVE_ACTION_TYPE,
  WitnessClient,
  type Authorization,
  type EnrolledPasskey,
  type IntentRecord,
} from "@/lib/sdk";
import { short } from "@/lib/witness";
import { AppBar } from "@/components/chrome";
import {
  mergeRequests,
  pendingRequest,
  reportDecision,
  requestFromSearch,
  withDecision,
  type AgentRequest,
  type RequestDecision,
} from "@/lib/queue";

/* --------------------------------------------------------------------------
   What is real here, and what is not.

     REAL   — the request. An agent process POSTs it to /api/requests, and this
              page renders exactly what arrived. There is no fixture and no
              constant standing in for it: if nobody has asked for anything, the
              screen says so and tells you how to make the agent ask.
     REAL   — the permission, the passkey enrollment, the approval, and every
              refusal. Each is a transaction against the deployed contracts, and
              a refusal is the contract's own typed Reason.
     HONEST — the queue is process memory on the server. A request can be
              delivered by the link the agent prints instead of by a poll; the
              page accepts both and shows the same thing. A decision reported
              back to the server is a notification, never a receipt — the
              transaction is the receipt, and the agent checks it on-chain.
   -------------------------------------------------------------------------- */
const DEFAULT_LIMIT_MON = "0.5";
const DEFAULT_WINDOW_MINUTES = 10;
/** What a prompt-injected agent asks for: this many times the human's limit. */
const INJECTION_MULTIPLIER = 10n;
const FALLBACK_LIMIT_WEI = 5n * 10n ** 17n;

type View = "approvals" | "activity" | "agents" | "settings";

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
  erc8004IdentityRegistry: Address;
  /** Where the demo agent's payments settle. From the deployment manifest. */
  payee?: Address;
  agentName: string;
  agentURI: string | null;
  agentId: string;
  identityEnforced: boolean;
  configurationLocked: boolean;
  explorer: string;
};

type Entry = {
  key: string;
  tone: "ok" | "bad" | "info";
  title: string;
  detail: string;
  at: number;
  /** The contract's own reason name, kept for Security details. */
  reason?: string;
  hash?: string;
  explorer?: string;
};

type Verdict = {
  tone: "ok" | "bad";
  label: string;
  note: string;
  reason?: string;
};

const KEYS = {
  passkey: "witness.passkey.v1",
  intent: "witness.intent.v1",
  activity: "witness.activity.v1",
};

/** localStorage access that never throws (private mode, blocked storage). */
function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience here, never a requirement.
  }
}

const mon = (wei: bigint): string => `${trimZeros(formatUnits(wei, 18))} MON`;

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

const clock = (secs: number): string => {
  if (!Number.isFinite(secs)) return "no expiry";
  if (secs <= 0) return "expired";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const when = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Plain language for a typed refusal.
 *
 * The contract distinguishes sixteen reasons on purpose. This is where that
 * precision turns into something a non-technical person can act on, and the raw
 * reason name is still available under Security details.
 */
function plainReason(auth: Authorization): string {
  if (auth.allowed) return auth.message;
  switch (auth.name) {
    case "OverLimit":
      return "This request asks for more than the limit you set. Nothing was sent.";
    case "Expired":
      return "This permission had already expired, so the request was refused.";
    case "Revoked":
      return "You had already withdrawn this permission, so the request was refused.";
    case "AlreadyConsumed":
      return "This one-time permission was already used, so the request was refused.";
    case "ChallengeMismatch":
    case "BadSignature":
      return "There was no approval for this request, so it was refused.";
    case "NoSuchIntent":
      return "This permission no longer exists, so the request was refused.";
    case "WrongAgent":
      return "A different agent tried to use your permission, so it was refused.";
    case "AgentNotRegistered":
      return "The agent could not prove the identity it claimed, so it was refused.";
    default:
      return auth.message || "The request was refused.";
  }
}

export default function Page() {
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [view, setView] = useState<View>("approvals");

  const [passkey, setPasskey] = useState<EnrolledPasskey | null>(null);
  const [intentId, setIntentId] = useState<bigint | null>(null);
  const [intent, setIntent] = useState<IntentRecord | null>(null);
  const [activity, setActivity] = useState<Entry[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [limitMon, setLimitMon] = useState(DEFAULT_LIMIT_MON);
  const [expiryMinutes, setExpiryMinutes] = useState(String(DEFAULT_WINDOW_MINUTES));

  /** What agents have asked for, from the app's queue. Never synthesised. */
  const [requests, setRequests] = useState<AgentRequest[]>([]);
  /** A request delivered by link rather than by poll, for a cold server instance. */
  const [delivered, setDelivered] = useState<AgentRequest | null>(null);
  const [queueErr, setQueueErr] = useState<string | null>(null);

  const tabsRef = useRef<HTMLDivElement>(null);

  const client = useMemo(() => {
    if (!config) return null;
    return new WitnessClient(
      {
        chainId: config.chainId,
        contracts: config.contracts,
        rpId: config.rpId,
        agentId: BigInt(config.agentId),
        explorer: config.explorer,
      },
      { kind: "relayer" }
    );
  }, [config]);

  const addEntry = useCallback((e: Omit<Entry, "key" | "at">) => {
    setActivity((prev) => {
      const next = [{ ...e, key: `${Date.now()}-${Math.random()}`, at: Date.now() }, ...prev].slice(0, 30);
      writeLocal(KEYS.activity, next);
      return next;
    });
  }, []);

  // --- load ---------------------------------------------------------------

  useEffect(() => {
    fetch("/api/config")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "config unavailable");
        setConfig(j as Config);
      })
      .catch((e) => setConfigError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    setPasskey(readLocal<EnrolledPasskey | null>(KEYS.passkey, null));
    setActivity(readLocal<Entry[]>(KEYS.activity, []));
    const stored = readLocal<string | null>(KEYS.intent, null);
    if (stored) {
      try {
        setIntentId(BigInt(stored));
      } catch {
        setIntentId(null);
      }
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /**
   * A request reaches this page two ways, and both are the same validated payload:
   *
   *   1. the agent POSTs it to the app, and this page polls the queue out, or
   *   2. the agent prints a link carrying it (?req=…), which the human opens.
   *
   * The second exists because a serverless instance does not stay warm, and a
   * demo that silently shows an empty queue would be worse than useless. The link
   * grants nothing: approving still needs the passkey, and the amount is still
   * checked against the permission on-chain.
   */
  useEffect(() => {
    setDelivered(requestFromSearch(window.location.search));
  }, []);

  useEffect(() => {
    if (intentId === null) return;
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/requests?intentId=${intentId}`, { cache: "no-store" });
        const j = (await res.json()) as { ok: boolean; requests?: AgentRequest[]; error?: string };
        if (stopped) return;
        if (!j.ok) {
          setQueueErr(j.error ?? "could not read the requests queue");
          return;
        }
        setQueueErr(null);
        // Merge rather than replace: an instance that forgets must not wipe a
        // request the human is already looking at.
        setRequests((prev) => mergeRequests(j.requests ?? [], prev));
      } catch (e) {
        if (!stopped) setQueueErr(e instanceof Error ? e.message : String(e));
      }
    };

    void poll();
    const t = setInterval(poll, 3000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [intentId]);

  const refreshIntent = useCallback(
    async (id: bigint) => {
      if (!client) return;
      try {
        setIntent(await client.getIntent(id));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [client]
  );

  useEffect(() => {
    if (client && intentId !== null) void refreshIntent(intentId);
  }, [client, intentId, refreshIntent]);

  // --- the permission -----------------------------------------------------

  const createPermission = async () => {
    if (!client || !config) return;
    setBusy("setup");
    setErr(null);
    setVerdict(null);

    let limitWei: bigint;
    try {
      limitWei = BigInt(Math.round(Number(limitMon) * 1e6)) * 10n ** 12n;
      if (limitWei <= 0n) throw new Error("positive");
    } catch {
      setErr("Enter a limit above zero, like 0.5.");
      setBusy(null);
      return;
    }

    try {
      const created = await client.createIntent({
        // The MON path has its own action tag. Registering a permission under the
        // ERC-20 tag would make every native attempt fail with ActionTypeMismatch,
        // which is exactly the mismatch this tag exists to catch.
        actionType: NATIVE_ACTION_TYPE,
        maxAmount: limitWei,
        expirySeconds: Math.max(60, Math.round(Number(expiryMinutes) * 60) || 600),
        passkey: passkey ?? undefined,
        passkeyLabel: config.agentName,
        policy: { agent: config.agentName, scope: "native", limitMon },
      });

      setPasskey(created.passkey);
      writeLocal(KEYS.passkey, created.passkey);
      setIntentId(created.intentId);
      writeLocal(KEYS.intent, created.intentId.toString());
      await refreshIntent(created.intentId);

      addEntry({
        tone: "info",
        title: "Permission created",
        detail: `${config.agentName} may spend up to ${mon(limitWei)}, once, for ${expiryMinutes} minutes.`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // --- the queue ----------------------------------------------------------

  /**
   * What agents have actually asked for. `delivered` goes first so a link the
   * agent printed still wins over whatever copy the server happens to hold.
   */
  const queue = useMemo(
    () => mergeRequests(delivered ? [delivered] : [], requests),
    [delivered, requests]
  );
  /** The newest request still waiting on a human. Only this one is decidable. */
  const asked = useMemo(() => pendingRequest(queue), [queue]);
  /** What to render: the pending request, or the one just decided, as a record. */
  const shown = asked ?? queue[0] ?? null;

  const request = useMemo(
    () =>
      !asked || intentId === null
        ? null
        : ({
            intentId,
            kind: asked.kind,
            to: asked.to as Address,
            amount: BigInt(asked.amount),
          } as const),
    [asked, intentId]
  );

  /**
   * Record a decision here first, then tell the server so the waiting agent stops.
   *
   * Local first, because the transaction is what happened; the server notification
   * is a courtesy. If the notification is lost the human still sees the truth, and
   * so does the agent once it reads the chain.
   */
  const settle = useCallback(async (id: string, decision: RequestDecision) => {
    const stamped = { ...decision, decidedAt: Date.now() };
    setRequests((prev) => withDecision(prev, id, decision));
    setDelivered((prev) => (prev && prev.id === id ? { ...prev, ...stamped } : prev));
    await reportDecision(id, decision);
  }, []);

  /** Approve: the human taps, the passkey signs this exact action, the chain enforces. */
  const approve = async () => {
    if (!client || !request || !asked) return;
    setBusy("approve");
    setErr(null);
    setVerdict(null);
    try {
      const assertion = await client.requestApproval(request);
      const result = await client.executeAuthorizedAction(request, assertion);

      if (result.allowed) {
        await settle(asked.id, {
          status: "approved",
          txHash: result.txHash,
          explorer: result.explorer,
        });
        setVerdict({
          tone: "ok",
          label: "Approved",
          note: `${config?.agentName ?? "The agent"} can now complete this action. The permission is used up, so it cannot be replayed.`,
        });
        addEntry({
          tone: "ok",
          title: "Approved and paid",
          detail: `${mon(request.amount)} to ${asked.service}`,
          hash: result.txHash,
          explorer: result.explorer,
        });
      } else {
        await settle(asked.id, {
          status: "refused",
          reason: result.name,
          reasonCode: result.code,
        });
        setVerdict({
          tone: "bad",
          label: "Not approved",
          note: plainReason(result),
          reason: result.name,
        });
        addEntry({
          tone: "bad",
          title: "Approval refused",
          detail: plainReason(result),
          reason: result.name,
        });
      }
      await refreshIntent(request.intentId);
    } catch (e) {
      // A cancelled passkey prompt is the human's own "no", not an error. Returning
      // to idle quietly is the whole point of the control they just pressed.
      if (isCancellation(e)) {
        setVerdict({
          tone: "bad",
          label: "Cancelled",
          note: "The passkey prompt was dismissed, so nothing was approved and nothing moved. The request is still waiting.",
        });
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
    }
  };

  /**
   * Block: the human does not approve, and the agent's attempt is refused on-chain.
   * That order matters — the refusal is produced by the contract, not by this UI.
   */
  const block = async () => {
    if (!client || !request || !asked) return;
    setBusy("block");
    setErr(null);
    setVerdict(null);
    try {
      const result = await client.executeAuthorizedAction(request, NO_APPROVAL);
      if (result.allowed) {
        // Should be unreachable: the contract refuses an unsigned action.
        setVerdict({
          tone: "bad",
          label: "Unexpected",
          note: "The action went through without an approval. This should be impossible — report it.",
        });
        return;
      }
      await settle(asked.id, {
        status: "blocked",
        reason: result.name,
        reasonCode: result.code,
      });
      setVerdict({
        tone: "bad",
        label: "Blocked",
        note: `${plainReason(result)} Nothing was sent.`,
        reason: result.name,
      });
      addEntry({
        tone: "bad",
        title: "You blocked a request",
        detail: `${config?.agentName ?? "The agent"} asked for ${mon(request.amount)}; you did not approve it.`,
        reason: result.name,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Where an injected instruction would send money: the merchant this agent is
   * actually working with, or the deployment's own payee when nothing is queued.
   * Never a made-up address — the point of the attack is that it is real.
   */
  const injectionTarget = useMemo(
    () => (asked?.to as Address | undefined) ?? config?.payee ?? null,
    [asked, config]
  );
  /** Ten times the limit the human actually set, not a constant. */
  const injectionAmount = (intent?.maxAmount ?? FALLBACK_LIMIT_WEI) * INJECTION_MULTIPLIER;
  const canInject = Boolean(intent?.active && !busy && intentId !== null && injectionTarget);

  /**
   * The adversary simulation: a prompt-injected agent asks for ten times the limit
   * with no approval to present. Kept in Agents rather than next to Approve, so it
   * never competes with the one action that matters on the approval screen.
   */
  const simulateInjection = async () => {
    if (!client || intentId === null || !injectionTarget) return;
    setBusy("attack");
    setErr(null);
    setVerdict(null);
    try {
      const over = {
        intentId,
        kind: "native",
        to: injectionTarget,
        amount: injectionAmount,
      } as const;
      const result = await client.executeAuthorizedAction(over, NO_APPROVAL);
      setVerdict({
        tone: result.allowed ? "bad" : "ok",
        label: result.allowed ? "Executed" : "Blocked",
        note: result.allowed
          ? "The oversized request went through. This should be impossible — report it."
          : `${plainReason(result)} It asked for ${mon(injectionAmount)} against your ${mon(intent?.maxAmount ?? FALLBACK_LIMIT_WEI)} limit.`,
        reason: result.allowed ? undefined : result.name,
      });
      addEntry({
        tone: result.allowed ? "bad" : "ok",
        title: "Unapproved request blocked",
        detail: `An injected instruction asked for ${mon(injectionAmount)}; the chain refused it.`,
        reason: result.allowed ? undefined : result.name,
      });
      await refreshIntent(intentId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!client || intentId === null) return;
    setBusy("revoke");
    setErr(null);
    try {
      await client.revokeIntent(intentId);
      await refreshIntent(intentId);
      addEntry({
        tone: "bad",
        title: "Permission withdrawn",
        detail: `${config?.agentName ?? "The agent"} can no longer act under this permission.`,
      });
      setVerdict({
        tone: "bad",
        label: "Withdrawn",
        note: "This permission is gone. Any further request under it will be refused.",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const resetBrowser = () => {
    setPasskey(null);
    setIntentId(null);
    setIntent(null);
    setVerdict(null);
    setActivity([]);
    setRequests([]);
    setDelivered(null);
    setQueueErr(null);
    for (const k of Object.values(KEYS)) {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }
  };

  // --- derived ------------------------------------------------------------

  const remaining = intent ? Math.max(0, intent.expiry === 0n ? Infinity : Number(intent.expiry) - Math.floor(now / 1000)) : Infinity;

  /**
   * Risk is derived from the request against the permission that is on-chain — it
   * is never asserted. A request above the limit is labelled as such before any
   * passkey prompt, because the human should know the answer the chain will give.
   */
  const risk = useMemo(() => {
    if (!intent) return null;
    if (asked && BigInt(asked.amount) > intent.maxAmount)
      return { tone: "bad" as const, label: "Over your limit" };
    if (remaining <= 60) return { tone: "wait" as const, label: "Expiring soon" };
    if (!intent.active) return { tone: "bad" as const, label: "No longer active" };
    return { tone: "ok" as const, label: "Within your limit" };
  }, [intent, remaining, asked]);

  /** There is nothing to decide until an agent has actually asked for something. */
  const canDecide = Boolean(intent?.active && asked && !busy);

  const tabs: { id: View; label: string }[] = [
    { id: "approvals", label: "Approvals" },
    { id: "activity", label: "Activity" },
    { id: "agents", label: "Agents" },
    { id: "settings", label: "Settings" },
  ];

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === view);
    if (e.key === "ArrowRight") {
      setView(tabs[(i + 1) % tabs.length].id);
    } else if (e.key === "ArrowLeft") {
      setView(tabs[(i - 1 + tabs.length) % tabs.length].id);
    }
  };

  // --- render -------------------------------------------------------------

  if (configError) {
    return (
      <main className="shell">
        <AppBar />
        <div className="err">
          <strong>Not configured.</strong> {configError}
        </div>
        <section className="section">
          <div className="section-head">
            <span className="section-num">01</span>
            <p className="section-title">Wiring this up</p>
          </div>
          <p className="note" style={{ marginBottom: 16 }}>
            The app reads its contract addresses from the manifest the deploy script writes. Deploy
            the stack, then set the two server variables it needs:
          </p>
          <pre className="mono note" style={{ whiteSpace: "pre-wrap" }}>
{`cd contracts
DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol \\
  --rpc-url https://testnet-rpc.monad.xyz --broadcast

# server environment (never exposed to the browser)
WITNESS_CHAIN_ID=10143
WITNESS_OPERATOR_PRIVATE_KEY=0x...   # submits the agent's attempts`}
          </pre>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <AppBar
        chainId={config?.chainId}
        locked={config?.configurationLocked}
        actions={
          <a className="micro" href="/integrate">
            Integrate →
          </a>
        }
      >
        {/* Rendered unconditionally: the tabs are pure view state, so gating them
            on the config fetch would grow the bar by a row the moment it resolves
            — a layout shift on every load, and no navigation while it loads. */}
        <div className="tabs" role="tablist" aria-label="Sections" onKeyDown={onTabKey}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className="tab"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={view === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={view === t.id ? 0 : -1}
              onClick={() => setView(t.id)}
            >
              {t.label}
              {t.id === "activity" && activity.length > 0 && (
                <span className="tab__count">{activity.length}</span>
              )}
            </button>
          ))}
        </div>
      </AppBar>

      <DashboardHeader
        config={config}
        intent={intent}
        pendingCount={asked ? 1 : 0}
        onJump={view === "approvals" ? undefined : () => setView("approvals")}
      />

      {config === null && (
        <p className="note" aria-busy="true">
          Loading your permissions…
        </p>
      )}

      {config && (
        <>
          {err && (
            <div className="err" role="alert">
              {err}
            </div>
          )}

          {config.identityEnforced === false && (
            <p className="notice">
              <strong>Identity registry not configured on this deployment.</strong> The approval and
              the spend limit are still enforced on-chain; only the ERC-8004 agent-identity binding
              is inactive.
            </p>
          )}

          {view === "approvals" && (
            <section id="panel-approvals" role="tabpanel" aria-labelledby="tab-approvals">
              {verdict && <VerdictCard verdict={verdict} onDismiss={() => setVerdict(null)} />}

              {intentId === null ? (
                <SetupCard
                  agentName={config.agentName}
                  limitMon={limitMon}
                  expiryMinutes={expiryMinutes}
                  busy={busy === "setup"}
                  onLimit={setLimitMon}
                  onExpiry={setExpiryMinutes}
                  onSubmit={createPermission}
                />
              ) : (
                <>
                  {shown === null ? (
                    <WaitingForAgent agentName={config.agentName} queueErr={queueErr} />
                  ) : (
                    <div className="request">
                      <div className="request__agent">
                        <AgentAvatar />
                        <div>
                          <p className="micro" style={{ color: "var(--ink-dim)" }}>
                            {asked ? "Waiting for you" : "Already decided"}
                          </p>
                          <p className="card__title">{config.agentName}</p>
                        </div>
                      </div>

                      <h2 className="request__sentence">
                        {config.agentName} wants to spend <em>{mon(BigInt(shown.amount))}</em> on{" "}
                        {shown.service}.
                      </h2>
                      <p className="request__sub">
                        {asked
                          ? `One payment, to ${shown.service}. Nothing moves until you approve it.`
                          : outcomeLine(shown)}
                      </p>

                      {shown.note && <p className="note">{shown.note}</p>}

                      <dl className="facts">
                        <div className="fact">
                          <dt>Amount</dt>
                          <dd className="mono">{mon(BigInt(shown.amount))}</dd>
                        </div>
                        <div className="fact">
                          <dt>Expires in</dt>
                          <dd className="mono">{clock(remaining)}</dd>
                        </div>
                        <div className="fact">
                          <dt>{asked ? "Risk" : "Outcome"}</dt>
                          <dd>
                            {asked ? (
                              <span className={`state state--${risk?.tone ?? "quiet"}`}>
                                <span aria-hidden>
                                  {risk?.tone === "ok" ? "✓" : risk?.tone === "bad" ? "✕" : "•"}
                                </span>
                                {risk?.label ?? "Checking…"}
                              </span>
                            ) : (
                              <span
                                className={`state ${shown.status === "approved" ? "state--ok" : "state--bad"}`}
                              >
                                <span aria-hidden>{shown.status === "approved" ? "✓" : "✕"}</span>
                                {shown.status === "approved"
                                  ? "Approved"
                                  : shown.status === "blocked"
                                    ? "You blocked it"
                                    : "Refused"}
                              </span>
                            )}
                          </dd>
                        </div>
                      </dl>

                      <div className="decide">
                        <button
                          className="primary decide__primary"
                          onClick={approve}
                          disabled={!canDecide}
                          aria-busy={busy === "approve"}
                        >
                          {busy === "approve" ? "Waiting for your passkey…" : "Approve with passkey"}
                        </button>
                        <button className="block" onClick={block} disabled={!canDecide}>
                          {busy === "block" ? "Blocking…" : "Block"}
                        </button>
                      </div>

                      {!intent?.active && (
                        <p className="field__hint" style={{ marginTop: 14 }}>
                          This permission is no longer active
                          {intent?.consumed ? " (already used)" : intent?.revoked ? " (withdrawn)" : ""}
                          {remaining <= 0 ? " (expired)" : ""}. Create a new one to keep going.
                        </p>
                      )}

                      <SecurityDetails
                        config={config}
                        intent={intent}
                        passkey={passkey}
                        request={shown}
                      />
                    </div>
                  )}

                  <Notice>
                    <strong>This request came from outside this app.</strong> An agent process POSTed
                    it to <span className="mono">/api/requests</span>, and it is rendered here exactly
                    as it arrived — recipient, amount, and the agent&rsquo;s own words. Nothing on this
                    screen is a fixture.
                  </Notice>

                  <ActivityPreview entries={activity} onSeeAll={() => setView("activity")} />

                  {!intent?.active && (
                    <div className="section-actions">
                      <button onClick={resetBrowser}>Set up a new permission</button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {view === "activity" && (
            <section id="panel-activity" role="tabpanel" aria-labelledby="tab-activity">
              {activity.length === 0 ? (
                <p className="note">
                  Nothing yet. Decisions you make will appear here, newest first.
                </p>
              ) : (
                <ul className="rows">
                  {activity.map((e) => (
                    <li className="row" key={e.key}>
                      <span
                        className={`state ${
                          e.tone === "ok" ? "state--ok" : e.tone === "bad" ? "state--bad" : "state--quiet"
                        }`}
                      >
                        <span aria-hidden>{e.tone === "ok" ? "✓" : e.tone === "bad" ? "✕" : "•"}</span>
                        {e.tone === "ok" ? "Allowed" : e.tone === "bad" ? "Refused" : "Info"}
                      </span>
                      <div className="row__main">
                        <p className="row__title">{e.title}</p>
                        <p className="row__meta">{e.detail}</p>
                        {e.explorer && e.hash && (
                          <p className="row__meta">
                            <a href={e.explorer} target="_blank" rel="noreferrer">
                              View the transaction ↗
                            </a>
                          </p>
                        )}
                      </div>
                      <span className="row__time">{when(e.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Notice>
                <strong>This history lives in this browser</strong>, not on a server. The underlying
                decisions are on-chain; the list is a local record of them.
              </Notice>
            </section>
          )}

          {view === "agents" && (
            <section id="panel-agents" role="tabpanel" aria-labelledby="tab-agents">
              {verdict && <VerdictCard verdict={verdict} onDismiss={() => setVerdict(null)} />}

              <div className="card">
                <div className="card__head">
                  <AgentAvatar large />
                  <div>
                    <h2 className="card__title">{config.agentName}</h2>
                    <p className="card__sub">
                      {intent
                        ? `May spend up to ${mon(intent.maxAmount)}, once, until ${new Date(
                            Number(intent.expiry) * 1000
                          ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "No permission yet"}
                    </p>
                  </div>
                  <span
                    className={`state ${
                      intent?.active ? "state--wait" : intent ? "state--bad" : "state--quiet"
                    }`}
                    style={{ marginLeft: "auto" }}
                  >
                    <span aria-hidden>•</span>
                    {intent?.active ? "Active" : intent ? "Inactive" : "No permission"}
                  </span>
                </div>

                {intent && (
                  <div className="section-actions" style={{ marginTop: 4 }}>
                    <button className="block" onClick={revoke} disabled={busy !== null || !intent.active}>
                      {busy === "revoke" ? "Withdrawing…" : "Withdraw access"}
                    </button>
                  </div>
                )}

                <SecurityDetails config={config} intent={intent} passkey={passkey} />
              </div>

              <div className="card">
                <div className="card__head">
                  <div>
                    <h2 className="card__title">Try to break it</h2>
                    <p className="card__sub">
                      Run the attack this design exists to stop: an agent, prompt-injected, asking for
                      ten times the limit with no approval to present.
                    </p>
                  </div>
                </div>
                <div className="section-actions" style={{ marginTop: 0 }}>
                  <button onClick={simulateInjection} disabled={!canInject} aria-busy={busy === "attack"}>
                    {busy === "attack"
                      ? "Attempting…"
                      : `Send an unapproved ${mon(injectionAmount)} request`}
                  </button>
                </div>
                <p className="note" style={{ marginTop: 14 }}>
                  {injectionTarget
                    ? `${mon(injectionAmount)} is ten times your limit, sent to ${short(injectionTarget)} with no approval attached. `
                    : "Set a permission first, then this sends ten times its limit with no approval attached. "}
                  The refusal is a reverted transaction from the contract that holds the funds — not a
                  check in the agent&rsquo;s code, and not a check in this page.
                </p>
              </div>
            </section>
          )}

          {view === "settings" && (
            <section id="panel-settings" role="tabpanel" aria-labelledby="tab-settings">
              <div className="card">
                <div className="card__head">
                  <div>
                    <h2 className="card__title">How this is enforced</h2>
                    <p className="card__sub">What is checked before any money moves.</p>
                  </div>
                </div>
                <ul className="rows">
                  <li className="row">
                    <span className={`state ${config.identityEnforced ? "state--ok" : "state--quiet"}`}>
                      <span aria-hidden>{config.identityEnforced ? "✓" : "•"}</span>
                      {config.identityEnforced ? "Enforced" : "Not configured"}
                    </span>
                    <div className="row__main">
                      <p className="row__title">Agent identity</p>
                      <p className="row__meta">
                        The agent must own the ERC-8004 identity it claims, checked on-chain.
                      </p>
                    </div>
                  </li>
                  <li className="row">
                    <span className={`state ${config.configurationLocked ? "state--ok" : "state--wait"}`}>
                      <span aria-hidden>{config.configurationLocked ? "✓" : "•"}</span>
                      {config.configurationLocked ? "Frozen" : "Mutable"}
                    </span>
                    <div className="row__main">
                      <p className="row__title">Configuration</p>
                      <p className="row__meta">
                        {config.configurationLocked
                          ? "The accepted origin and identity registry were frozen at deployment and cannot be changed by anyone, including the deployer."
                          : "This deployment still allows the operator to change the accepted origin. Re-deploy with the lock enabled."}
                      </p>
                    </div>
                  </li>
                  <li className="row">
                    <span className="state state--ok">
                      <span aria-hidden>✓</span>
                      Enforced
                    </span>
                    <div className="row__main">
                      <p className="row__title">Exact action binding</p>
                      <p className="row__meta">
                        The approval covers this recipient and this amount, on this contract, on this
                        chain. A change to any of them invalidates it.
                      </p>
                    </div>
                  </li>
                </ul>
                <SecurityDetails config={config} intent={intent} passkey={passkey} defaultOpen />
              </div>

              <div className="card">
                <div className="card__head">
                  <div>
                    <h2 className="card__title">This browser</h2>
                    <p className="card__sub">
                      Your passkey is held by your device. This page only keeps its public key and your
                      local history.
                    </p>
                  </div>
                </div>
                <div className="section-actions" style={{ marginTop: 0 }}>
                  <button onClick={resetBrowser}>Clear this browser&rsquo;s Witness data</button>
                </div>
              </div>
            </section>
          )}

          <p className="note" style={{ marginTop: 26 }}>
            The passkey is the authority. Witness relays gas only, so no wallet and no testnet funds
            are needed to try it — and the relaying key cannot approve anything, because it does not
            hold your passkey.
          </p>
        </>
      )}
    </main>
  );
}

/* --------------------------------------------------------------------------
   Components
   -------------------------------------------------------------------------- */

/** No approval was produced: the empty assertion the contract must refuse. */
const NO_APPROVAL = {
  authenticatorData: "0x" as `0x${string}`,
  clientDataJSON: "0x" as `0x${string}`,
  r: 0n,
  s: 0n,
};

/** A dismissed passkey prompt is a decision, not a failure. */
function isCancellation(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  return name === "NotAllowedError" || name === "AbortError";
}

function AgentAvatar({ large }: { large?: boolean }) {
  return (
    <span className={`agent-avatar${large ? " agent-avatar--lg" : ""}`} aria-hidden>
      <svg viewBox="0 0 24 24" width={large ? 22 : 18} height={large ? 22 : 18} focusable="false">
        <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <line x1="12" y1="2" x2="12" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </g>
        <circle cx="12" cy="12" r="3.4" fill="currentColor" />
      </svg>
    </span>
  );
}

function VerdictCard({ verdict, onDismiss }: { verdict: Verdict; onDismiss: () => void }) {
  return (
    <div
      className={`verdict-card ${verdict.tone === "ok" ? "verdict-card--ok" : "verdict-card--bad"}`}
      role="status"
      aria-live="polite"
    >
      <p className="verdict-card__label">{verdict.label}</p>
      <p className="verdict-card__note">{verdict.note}</p>
      <div className="section-actions verdict-card__actions">
        <button onClick={onDismiss}>Done</button>
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="notice">{children}</p>;
}

/**
 * No agent has asked for anything yet.
 *
 * This state used to be filled with a fixed example request, which made the
 * product look finished and was the least honest thing on the screen. The promise
 * is "your agent asks" — so when nothing has asked, the page says so, and shows
 * the one command that makes an agent ask for real.
 */
function WaitingForAgent({ agentName, queueErr }: { agentName: string; queueErr: string | null }) {
  return (
    <div className="request">
      <div className="request__agent">
        <AgentAvatar />
        <div>
          <p className="micro" style={{ color: "var(--ink-dim)" }}>
            Waiting
          </p>
          <p className="card__title">{agentName}</p>
        </div>
      </div>

      <h2 className="request__sentence">No request waiting.</h2>
      <p className="request__sub">
        Your permission is live. When {agentName} wants to spend, it posts a request to this app.
        Run the agent from the repository and it will appear here on its own.
      </p>

      <pre className="mono note" style={{ whiteSpace: "pre-wrap" }}>{`npm install
node examples/agent-request.mjs`}</pre>

      <p className="field__hint">
        This page reads the queue every 3 seconds. Nothing is approved until you tap.
      </p>

      {queueErr && (
        <p className="field__hint">
          <strong>The queue could not be read:</strong> {queueErr}. The agent may still be able to
          deliver a request by link.
        </p>
      )}
    </div>
  );
}

/** What happened to a request the human has already decided. */
function outcomeLine(r: AgentRequest): string {
  switch (r.status) {
    case "approved":
      return `You approved this${r.explorer ? ", and the transaction is on the chain" : ""}. The permission is used up, so it cannot be replayed.`;
    case "blocked":
      return "You refused this. Nothing was sent.";
    case "refused":
      return `The contract refused this${r.reason ? ` (${r.reason})` : ""}, so nothing was sent.`;
    default:
      return `One payment, to ${r.service}.`;
  }
}

function ActivityPreview({ entries, onSeeAll }: { entries: Entry[]; onSeeAll: () => void }) {
  return (
    <div className="disclosure-block">
      <div className="section-head" style={{ marginBottom: 12 }}>
        <p className="section-title" style={{ margin: 0 }}>
          Recent activity
        </p>
        {entries.length > 0 && (
          <button
            onClick={onSeeAll}
            style={{ marginLeft: "auto", padding: "8px 14px", minHeight: 36, border: "none" }}
          >
            See all
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="note">Nothing yet. Approve or block a request and it will show up here.</p>
      ) : (
        <ul className="rows">
          {entries.slice(0, 3).map((e) => (
            <li className="row" key={e.key}>
              <span
                className={`state ${
                  e.tone === "ok" ? "state--ok" : e.tone === "bad" ? "state--bad" : "state--quiet"
                }`}
              >
                <span aria-hidden>{e.tone === "ok" ? "✓" : e.tone === "bad" ? "✕" : "•"}</span>
                {e.tone === "ok" ? "Allowed" : e.tone === "bad" ? "Refused" : "Info"}
              </span>
              <div className="row__main">
                <p className="row__title">{e.title}</p>
                <p className="row__meta">{e.detail}</p>
              </div>
              <span className="row__time">{when(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetupCard({
  agentName,
  limitMon,
  expiryMinutes,
  busy,
  onLimit,
  onExpiry,
  onSubmit,
}: {
  agentName: string;
  limitMon: string;
  expiryMinutes: string;
  busy: boolean;
  onLimit: (v: string) => void;
  onExpiry: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="request">
      <div className="request__agent">
        <AgentAvatar />
        <div>
          <p className="micro" style={{ color: "var(--ink-dim)" }}>
            Step 1 of 1
          </p>
          <p className="card__title">Set what {agentName} may do</p>
        </div>
      </div>

      <p className="request__sentence">Nothing needs your approval yet.</p>
      <p className="request__sub">
        Create one permission. It covers a single payment, and your passkey is what approves it — so
        no one else, including this site, can spend in your name.
      </p>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="limit">Maximum amount</label>
          <input
            id="limit"
            inputMode="decimal"
            value={limitMon}
            onChange={(e) => onLimit(e.target.value)}
            aria-describedby="limit-hint"
          />
          <p className="field__hint" id="limit-hint">
            In MON. A request above this is refused on-chain.
          </p>
        </div>
        <div className="field">
          <label htmlFor="expiry">Expires in</label>
          <select id="expiry" value={expiryMinutes} onChange={(e) => onExpiry(e.target.value)}>
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
          </select>
          <p className="field__hint">After this, the permission stops working on its own.</p>
        </div>
      </div>

      <div className="decide">
        <button className="primary decide__primary" onClick={onSubmit} disabled={busy} aria-busy={busy}>
          {busy ? "Waiting for your passkey…" : "Create permission with passkey"}
        </button>
      </div>

      <p className="field__hint" style={{ marginTop: 14 }}>
        Your device will ask for your fingerprint, face, or PIN. That passkey is the only thing that
        can approve a payment.
      </p>
    </div>
  );
}

/**
 * Everything technical lives here. The approval screen stays a plain sentence
 * about money; digests, addresses and identity ids are one disclosure away.
 */
function SecurityDetails({
  config,
  intent,
  passkey,
  request,
  defaultOpen,
}: {
  config: Config;
  intent: IntentRecord | null;
  passkey: EnrolledPasskey | null;
  /** The request currently on screen, when there is one. */
  request?: AgentRequest | null;
  defaultOpen?: boolean;
}) {
  return (
    <div className="disclosure-block">
      <details className="security" open={defaultOpen}>
        <summary>Security details</summary>
        <dl className="tech-list">
          <dt>Status</dt>
          <dd>
            {intent
              ? intent.active
                ? "Active — one use remaining"
                : intent.consumed
                  ? "Used"
                  : intent.revoked
                    ? "Withdrawn"
                    : "Expired"
              : "No permission registered"}
          </dd>
          <dt>Permission id</dt>
          <dd>{intent ? `#${intent.intentId.toString()}` : "—"}</dd>
          <dt>Spend limit</dt>
          <dd>{intent ? `${intent.maxAmount.toString()} wei` : "—"}</dd>
          <dt>Expiry</dt>
          <dd>
            {intent && intent.expiry !== 0n
              ? `${new Date(Number(intent.expiry) * 1000).toISOString()}`
              : "—"}
          </dd>
          <dt>Agent identity</dt>
          <dd>
            ERC-8004 id {config.agentId === "0" ? "not set" : `#${config.agentId}`}
            {config.identityEnforced ? " — enforced" : " — not enforced"}
          </dd>
          <dt>Identity registry</dt>
          <dd>
            {config.erc8004IdentityRegistry === "0x0000000000000000000000000000000000000000" ? (
              "not configured"
            ) : (
              <a
                href={`${config.explorer}/address/${config.erc8004IdentityRegistry}`}
                target="_blank"
                rel="noreferrer"
              >
                {config.erc8004IdentityRegistry} ↗
              </a>
            )}
          </dd>
          <dt>Agent wallet</dt>
          <dd>{config.contracts.AgentExecutor}</dd>
          <dt>Enforcing contract</dt>
          <dd>
            <a
              href={`${config.explorer}/address/${config.contracts.DemoSafe}`}
              target="_blank"
              rel="noreferrer"
            >
              {config.contracts.DemoSafe} ↗
            </a>
          </dd>
          <dt>Permission registry</dt>
          <dd>{config.contracts.WitnessIntentRegistry}</dd>
          <dt>Verifier</dt>
          <dd>{config.contracts.WitnessVerifier}</dd>
          <dt>Relying party</dt>
          <dd>{config.rpId}</dd>
          <dt>Passkey</dt>
          <dd>
            {passkey
              ? `enrolled in this browser — credential ${short(passkey.credentialId, 10, 6)}`
              : "not enrolled in this browser"}
          </dd>
          {request ? (
            <>
              <dt>Request</dt>
              <dd className="mono">
                {request.id} · arrived {when(request.createdAt)}
              </dd>
              <dt>Asked for by</dt>
              <dd>
                {request.service}
                {request.agentId !== "0" ? ` · ERC-8004 #${request.agentId}` : ""}
              </dd>
              <dt>Paying to</dt>
              <dd>
                <a
                  href={`${config.explorer}/address/${request.to}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {request.to} ↗
                </a>
              </dd>
            </>
          ) : (
            <>
              <dt>Request</dt>
              <dd>none waiting — the agent has not asked for anything</dd>
              <dt>Settlement address</dt>
              <dd>
                {config.payee ? (
                  <a
                    href={`${config.explorer}/address/${config.payee}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {config.payee} ↗
                  </a>
                ) : (
                  "not recorded in the deployment manifest"
                )}
              </dd>
            </>
          )}
          <dt>Chain</dt>
          <dd>
            {config.chainId === 143 ? "Monad mainnet" : "Monad testnet"} · {config.chainId}
          </dd>
          <dt>Verification state</dt>
          <dd>
            {config.configurationLocked
              ? "configuration frozen at deployment"
              : "configuration still mutable"}
          </dd>
        </dl>
      </details>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Chrome
   -------------------------------------------------------------------------- */

/**
 * The dashboard header.
 *
 * The previous concept opened with the wordmark set 232px wide, which says
 * nothing and costs the whole first screen. This opens with the state of the
 * account instead: what the agent is allowed to do, whether anything is waiting
 * on the human, and which guarantees the deployment actually enforces.
 *
 * Every tile is derived from the chain's own answers — none of it is asserted
 * in copy, so a stranger reading it learns the real posture of this deployment.
 */
function DashboardHeader({
  config,
  intent,
  pendingCount,
  onJump,
}: {
  config: Config | null;
  intent: IntentRecord | null;
  pendingCount: number;
  /** Absent while the approvals tab is already open — nothing to jump to. */
  onJump?: () => void;
}) {
  const limit = intent ? mon(intent.maxAmount) : null;
  const until = intent
    ? new Date(Number(intent.expiry) * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <section className="hero" aria-labelledby="dashboard-title">
      <p className="micro">
        {config ? `Live on Monad · chain ${config.chainId}` : "Reading the deployment…"}
      </p>
      <h1 className="hero__title" id="dashboard-title">
        Your agent asks. <em>You decide.</em>
      </h1>
      <p className="hero__lede">
        A passkey signs one exact action — this recipient, this amount, this contract — and the
        contract that holds the funds checks that signature before anything moves. Nothing here
        trusts the agent. Nothing here trusts this page either.
      </p>

      <div className="stats">
        <div className="stat">
          <p className="stat__label">Permission</p>
          <p className="stat__value">{limit ?? "None yet"}</p>
          <p className="stat__hint">
            {intent
              ? intent.active
                ? `One use, until ${until}`
                : "No longer active"
              : "Create one so the agent can ask"}
          </p>
        </div>

        <div className="stat">
          <p className="stat__label">Waiting on you</p>
          <p className="stat__value">{pendingCount}</p>
          <p className="stat__hint">
            {pendingCount > 0 ? "A request needs a decision" : "No requests pending"}
          </p>
        </div>

        <div className="stat">
          <p className="stat__label">Agent identity</p>
          <p
            className={`stat__value ${config?.identityEnforced ? "stat__value--ok" : "stat__value--warn"}`}
          >
            {config === null ? "—" : config.identityEnforced ? "Enforced" : "Not configured"}
          </p>
          <p className="stat__hint">
            {config?.agentId && config.agentId !== "0"
              ? `Ownership of ERC-8004 #${config.agentId}`
              : "Ownership checked by the verifier"}
          </p>
        </div>

        <div className="stat">
          <p className="stat__label">Configuration</p>
          <p
            className={`stat__value ${config?.configurationLocked ? "stat__value--ok" : "stat__value--warn"}`}
          >
            {config === null ? "—" : config.configurationLocked ? "Frozen" : "Mutable"}
          </p>
          <p className="stat__hint">Accepted origin and registry, fixed at deploy</p>
        </div>
      </div>

      {onJump && (
        <div className="hero-foot">
          <button className="primary" onClick={onJump}>
            Go to the pending request
          </button>
        </div>
      )}
    </section>
  );
}
