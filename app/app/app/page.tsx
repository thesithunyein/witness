"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { formatUnits, type Address } from "viem";
import {
  NATIVE_ACTION_TYPE,
  WitnessClient,
  type Authorization,
  type EnrolledPasskey,
  type IntentRecord,
} from "@/lib/sdk";
import { short } from "@/lib/witness";
import { passkeyOriginFits } from "@/lib/webauthn";
import { AppBar } from "@/components/chrome";
import {
  ArrowRightIcon,
  BotIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CodeIcon,
  CoinIcon,
  DotIcon,
  ExternalLinkIcon,
  FingerprintIcon,
  InboxIcon,
  KeyIcon,
  LockIcon,
  PulseIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
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

     REAL     the request. An agent process POSTs it to /api/requests, and this
              page renders exactly what arrived. There is no fixture and no
              constant standing in for it: if nobody has asked for anything, the
              screen says so and tells you how to make the agent ask.
     REAL     the permission, the passkey enrollment, the approval, and every
              refusal. Each is a transaction against the deployed contracts, and
              a refusal is the contract's own typed Reason.
     HONEST   the queue is process memory on the server. A request can be
              delivered by the link the agent prints instead of by a poll; the
              page accepts both and shows the same thing. A decision reported
              back to the server is a notification, never a receipt. The
              transaction is the receipt, and the agent checks it on-chain.
   -------------------------------------------------------------------------- */
const DEFAULT_LIMIT_MON = "0.5";
const DEFAULT_WINDOW_MINUTES = 10;
/** What a prompt-injected agent asks for: this many times the human's limit. */
const INJECTION_MULTIPLIER = 10n;
const FALLBACK_LIMIT_WEI = 5n * 10n ** 17n;

type View = "approvals" | "activity" | "agents" | "settings";

/**
 * The four screens, with the one line of context each opens with.
 *
 * One list, so the tab label and the strip above it cannot disagree, and the app
 * has one place to look to see what it is made of.
 */
const VIEWS: { id: View; label: string; caption: string }[] = [
  {
    id: "approvals",
    label: "Approvals",
    caption: "One exact payment, checked on-chain.",
  },
  { id: "activity", label: "Activity", caption: "Every decision made in this browser, newest first." },
  { id: "agents", label: "Agents", caption: "Who may act for you, and what it may spend." },
  {
    id: "settings",
    label: "Settings",
    caption: "What this deployment enforces on-chain, and what is up to you.",
  },
];

/** The tab's own icon, keyed by the same id the tab uses, so neither can lose one. */
const VIEW_ICONS: Record<View, ComponentType<{ size?: number }>> = {
  approvals: CheckCircleIcon,
  activity: PulseIcon,
  agents: BotIcon,
  settings: SettingsIcon,
};

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
      return "This asks for more than the limit you set, so nothing was sent.";
    case "Expired":
      return "This permission had already expired.";
    case "Revoked":
      return "You had already withdrawn this permission.";
    case "AlreadyConsumed":
      return "This one-time permission was already used.";
    case "ChallengeMismatch":
    case "BadSignature":
      return "There was no approval for this request.";
    case "NoSuchIntent":
      return "This permission no longer exists.";
    case "WrongAgent":
      return "A different agent tried to use your permission.";
    case "AgentNotRegistered":
      return "The agent could not prove the identity it claimed.";
    default:
      return auth.message || "The request was refused.";
  }
}

export default function Page() {
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  /**
   * Whether this host can sign an approval at all. Resolved in an effect rather
   * than during render: the answer depends on `window.location`, so computing it
   * while rendering would make the server's HTML and the browser's disagree and
   * trip hydration.
   */
  const [originFit, setOriginFit] = useState<{ ok: boolean; problem: string | null } | null>(
    null
  );
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
    if (!config) return;
    setOriginFit(passkeyOriginFits(config.rpId, config.origin));
  }, [config]);

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
      // A browser refuses a passkey for a domain the page does not belong to
      // with a SecurityError whose text names the spec, not the problem. The
      // preflight above already explained it, so lead with that instead.
      const raw = e instanceof Error ? e.message : String(e);
      setErr(originFit && !originFit.ok ? `${originFit.problem} (${raw})` : raw);
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
          note: "The permission is used up, so this cannot be replayed.",
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
          note: "The prompt was dismissed, so nothing moved. The request is still waiting.",
        });
      } else {
        // Same reasoning as the setup path: a refused passkey origin arrives as a
        // DOMException naming the spec, so lead with the plain explanation.
        const raw = e instanceof Error ? e.message : String(e);
        setErr(originFit && !originFit.ok ? `${originFit.problem} (${raw})` : raw);
      }
    } finally {
      setBusy(null);
    }
  };

  /**
   * Block: the human does not approve, and the agent's attempt is refused on-chain.
   * That order matters: the refusal is produced by the contract, not by this UI.
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
          note: "The action went through without an approval. This should be impossible. Report it.",
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
   * Never a made-up address: the point of the attack is that it is real.
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
          ? "The oversized request went through. This should be impossible. Report it."
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

  /**
   * Clearing the log is not a security action.
   *
   * The chain keeps the record; this forgets the convenience copy of it. It sits
   * on the log's own screen rather than buried in Settings, because that screen is
   * where a reader realises the log is local and wants it gone.
   */
  const clearActivity = () => {
    setActivity([]);
    writeLocal(KEYS.activity, []);
  };

  // --- derived ------------------------------------------------------------

  const remaining = intent ? Math.max(0, intent.expiry === 0n ? Infinity : Number(intent.expiry) - Math.floor(now / 1000)) : Infinity;

  /**
   * Risk is derived from the request against the permission that is on-chain. It
   * is never asserted. A request above the limit is labelled as such before any
   * passkey prompt, because the human should know the answer the chain will give.
   */
  /**
   * Risk is derived from the request against the permission that is on-chain. It
   * is never asserted. A request above the limit is labelled as such before any
   * passkey prompt, because the human should know the answer the chain will give.
   *
   * A permission that is already gone is checked first: an expired or used one has
   * no time left, and calling that "expiring soon" would name the wrong refusal.
   */
  const risk = useMemo(() => {
    if (!intent) return null;
    if (!intent.active) return { tone: "bad" as const, label: "No longer active" };
    if (asked && BigInt(asked.amount) > intent.maxAmount)
      return { tone: "bad" as const, label: "Over your limit" };
    if (remaining <= 60) return { tone: "wait" as const, label: "Expiring soon" };
    return { tone: "ok" as const, label: "Within your limit" };
  }, [intent, remaining, asked]);

  /** Why a permission stopped working, in one clause rather than three brackets. */
  const inactiveWhy = intent?.consumed
    ? "it was already used"
    : intent?.revoked
      ? "you withdrew it"
      : "the time on it ran out";

  /** There is nothing to decide until an agent has actually asked for something. */
  const canDecide = Boolean(intent?.active && asked && !busy);

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = VIEWS.findIndex((t) => t.id === view);
    if (e.key === "ArrowRight") {
      setView(VIEWS[(i + 1) % VIEWS.length].id);
    } else if (e.key === "ArrowLeft") {
      setView(VIEWS[(i - 1 + VIEWS.length) % VIEWS.length].id);
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
    <main className="shell shell--app">
      <AppBar
        chainId={config?.chainId}
        locked={config?.configurationLocked}
        actions={
          <a className="micro micro--icon" href="/integrate">
            <CodeIcon size={13} />
            {/* Labelled in a span so the small-screen layout can clip the word
                without taking it out of the link's accessible name. */}
            <span>Integrate</span>
            <ArrowRightIcon size={13} className="micro__arrow" />
          </a>
        }
      />

      {/*
        The frame: navigation beside the work on a desktop, and the same
        navigation at the thumb's end of the screen on a phone. Rendered
        unconditionally, because the sections are pure view state and a rail
        that grows in once the config resolves is a layout shift on every load.
      */}
      <div className="appframe">
        <AppNav
          view={view}
          onSelect={setView}
          onKeyDown={onTabKey}
          pending={asked !== null}
          activityCount={activity.length}
        />

        <div className="appframe__main">
          <StatusStrip view={view} config={config} intent={intent} pendingCount={asked ? 1 : 0} />

      {config === null && (
        <p className="note" aria-busy="true">
          Loading…
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
              <strong>Agent identity is not enforced on this deployment.</strong> The approval and
              the spend limit still are.
            </p>
          )}          {
            /*
            The passkey is bound to one origin, and the contracts froze which one
            at deploy time. Saying so beats letting someone click the button and
            read a SecurityError.

            Only on Approvals: that is the one screen with the passkey action this
            explains. Printed above the log and the settings it was a warning about
            something those screens cannot do, on every screen.
          */}
          {view === "approvals" && originFit && !originFit.ok && (
            <p className="notice" role="status">
              <strong>Approvals need one specific address.</strong> {originFit.problem} Everything
              else here is real, the permission, the spend limit and the on-chain check included.
              To approve a payment, open the app from that address.
            </p>
          )}

          {view === "approvals" && (
            <section id="panel-approvals" role="tabpanel" aria-labelledby="tab-approvals">
              <div className="workspace">
                <div className="workspace__main">
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
                  ) : shown === null ? (
                    <WaitingForAgent agentName={config.agentName} queueErr={queueErr} />
                  ) : (
                    <div className="request">
                      <div className="request__agent">
                        <AgentAvatar />
                        <div>
                          <p className="micro" style={{ color: "var(--ink-dim)" }}>
                            {asked ? "The request" : "Already decided"}
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
                          ? "Posted by the agent process and shown exactly as it arrived."
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
                                {risk?.tone === "ok" ? (
                                  <CheckIcon size={13} />
                                ) : risk?.tone === "bad" ? (
                                  <XIcon size={13} />
                                ) : (
                                  <DotIcon size={13} />
                                )}
                                {risk?.label ?? "Checking…"}
                              </span>
                            ) : (
                              <span
                                className={`state ${shown.status === "approved" ? "state--ok" : "state--bad"}`}
                              >
                                {shown.status === "approved" ? <CheckIcon size={13} /> : <XIcon size={13} />}
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
                          <FingerprintIcon size={16} />
                          {busy === "approve" ? "Waiting for your passkey…" : "Approve with passkey"}
                        </button>
                        <button className="block" onClick={block} disabled={!canDecide}>
                          <XIcon size={14} />
                          {busy === "block" ? "Blocking…" : "Block"}
                        </button>
                      </div>

                      {!intent?.active && (
                        <p className="field__hint" style={{ marginTop: 14 }}>
                          This permission is no longer active, because {inactiveWhy}. Create a new one
                          to keep going.
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

                  {intentId !== null && !intent?.active && (
                    <div className="section-actions">
                      <button onClick={resetBrowser}>Set up a new permission</button>
                    </div>
                  )}
                </div>

                <div className="workspace__side">
                  <AgentPanel config={config} intent={intent} busy={busy} onRevoke={revoke} />
                  {/* The decision beside its own trail: whichever screen you are on,
                      the panel shows what happened, not how the product works. */}
                  <ActivityPanel entries={activity} onSeeAll={() => setView("activity")} />
                </div>
              </div>
            </section>
          )}

          {view === "activity" && (
            <section id="panel-activity" role="tabpanel" aria-labelledby="tab-activity">
              {activity.length === 0 ? (
                <div className="card">
                  <div className="card__head">
                    <div>
                      <h2 className="card__title">Nothing decided yet</h2>
                      <p className="card__sub">
                        A decision appears here the moment you approve or block a request.
                      </p>
                    </div>
                  </div>
                  <p className="note">
                    This log lives in this browser. The decisions themselves are on-chain, so an
                    empty log is not evidence that nothing happened.
                  </p>
                </div>
              ) : (
                <div className="card">
                  <div className="card__head">
                    <div>
                      <h2 className="card__title">
                        {activity.length} decision{activity.length === 1 ? "" : "s"}
                      </h2>
                      <p className="card__sub">
                        Newest first. Kept in this browser only.
                      </p>
                    </div>
                    <button className="card__action" onClick={clearActivity}>
                      <TrashIcon size={14} />
                      Clear log
                    </button>
                  </div>
                  <ul className="rows">
                    {activity.map((e) => (
                      <li className="row" key={e.key}>
                        <span
                          className={`state ${
                            e.tone === "ok" ? "state--ok" : e.tone === "bad" ? "state--bad" : "state--quiet"
                          }`}
                        >
                          {e.tone === "ok" ? (
                            <CheckIcon size={13} />
                          ) : e.tone === "bad" ? (
                            <XIcon size={13} />
                          ) : (
                            <DotIcon size={13} />
                          )}
                          {e.tone === "ok" ? "Allowed" : e.tone === "bad" ? "Refused" : "Info"}
                        </span>
                        <div className="row__main">
                          <p className="row__title">{e.title}</p>
                          <p className="row__meta">{e.detail}</p>
                          {e.explorer && e.hash && (
                            <p className="row__meta">
                            <a
                              className="link-icon"
                              href={e.explorer}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View the transaction
                              <ExternalLinkIcon size={12} />
                            </a>
                            </p>
                          )}
                        </div>
                        <span className="row__time">{when(e.at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {view === "agents" && (
            <section id="panel-agents" role="tabpanel" aria-labelledby="tab-agents">
              {verdict && <VerdictCard verdict={verdict} onDismiss={() => setVerdict(null)} />}

              <AgentPanel
                config={config}
                intent={intent}
                passkey={passkey}
                busy={busy}
                onRevoke={revoke}
                details
              />

              <div className="card">
                <div className="card__head">
                  <div>
                    <h2 className="card__title">Attack simulation</h2>
                    <p className="card__sub">
                      An unapproved payment, ten times the limit.
                    </p>
                  </div>
                </div>
                <div className="section-actions" style={{ marginTop: 0 }}>
                  <button onClick={simulateInjection} disabled={!canInject} aria-busy={busy === "attack"}>
                    {busy === "attack"
                      ? "Attempting…"
                      : `Send ${mon(injectionAmount)} with no approval`}
                  </button>
                </div>
                <p className="note" style={{ marginTop: 14 }}>
                  {injectionTarget
                    ? `${mon(injectionAmount)} is ten times your limit, sent to ${short(injectionTarget)} with no approval. `
                    : "Set a permission first, then this sends ten times its limit. "}
                  The contract refuses it on-chain.
                </p>
              </div>
            </section>
          )}

          {view === "settings" && (
            <section id="panel-settings" role="tabpanel" aria-labelledby="tab-settings">
              <SettingsPanel
                config={config}
                intent={intent}
                passkey={passkey}
                originFit={originFit}
                limitMon={limitMon}
                expiryMinutes={expiryMinutes}
                activityCount={activity.length}
                onLimit={setLimitMon}
                onExpiry={setExpiryMinutes}
                onClearLog={clearActivity}
                onForget={resetBrowser}
                onOpenApprovals={() => setView("approvals")}
              />
            </section>
          )}
        </>
      )}
        </div>
      </div>
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

/**
 * The agent's face.
 *
 * The same bot the Agents tab carries, at the size of an avatar, so the sidebar,
 * the request and the tab all show one thing. It used to be a crosshair, which
 * said "target" about the party being authorized, and a target is the wrong word
 * for the process acting on your behalf.
 */
function AgentAvatar({ large }: { large?: boolean }) {
  return (
    <span className={`agent-avatar${large ? " agent-avatar--lg" : ""}`} aria-hidden>
      <BotIcon size={large ? 22 : 18} />
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

/**
 * No agent has asked for anything yet.
 *
 * This state used to be filled with a fixed example request, which made the
 * product look finished and was the least honest thing on the screen. The promise
 * is "your agent asks", so when nothing has asked, the page says so, and shows
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
        Your permission is live. A request appears here the moment {agentName} asks.
      </p>

      {queueErr && (
        <p className="field__hint">
          <strong>The queue could not be read:</strong> {queueErr}
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

/**
 * The last few decisions, as a panel beside the work.
 *
 * It is the same list the Activity tab shows, cut to three rows, because the
 * answer to "what just happened" should not need a tab change. The full list is
 * one click away rather than on the screen at all times.
 */
function ActivityPanel({ entries, onSeeAll }: { entries: Entry[]; onSeeAll: () => void }) {
  return (
    <div className="card">
      <div className="card__head">
        <h2 className="card__title">Recent activity</h2>
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
        <p className="note">No decisions in this browser yet.</p>
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

/**
 * The section navigation.
 *
 * One tablist, two shells: a rail beside the work where there is room for one,
 * and a bar across the foot of the screen on a phone, where the thumb already is.
 * The markup is shared on purpose. A second copy for the small screen would mean
 * two tablists sharing ids, two sets of arrow-key handling and two sets of counts
 * to keep in step, which is exactly how navigation drifts from the thing it
 * navigates.
 *
 * The rail carries a heading, because four words stacked with nothing above them
 * read as a list of links. The bar drops it: "Workspace" printed above a 60px bar
 * is a word sitting on the content.
 */
function AppNav({
  view,
  onSelect,
  onKeyDown,
  pending,
  activityCount,
}: {
  view: View;
  onSelect: (v: View) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** True while an agent is waiting on a human: the count beside Approvals. */
  pending: boolean;
  activityCount: number;
}) {
  return (
    <nav className="appnav" aria-label="Sections">
      <p className="appnav__label">Workspace</p>
      <div className="appnav__list" role="tablist" aria-label="Sections" onKeyDown={onKeyDown}>
        {VIEWS.map((t) => {
          const Icon = VIEW_ICONS[t.id];
          return (
            <button
              key={t.id}
              className="navitem"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={view === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={view === t.id ? 0 : -1}
              onClick={() => onSelect(t.id)}
            >
              <Icon size={15} />
              <span className="navitem__label">{t.label}</span>
              {t.id === "approvals" && pending ? <span className="navitem__count">1</span> : null}
              {t.id === "activity" && activityCount > 0 ? (
                <span className="navitem__count">{activityCount}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Who may act, and under what permission.
 *
 * The assumptions screen and the Agents screen are the same question at two
 * scales, so they are one component: the sidebar shows the state and the
 * withdrawal control, the Agents tab adds the technical disclosure.
 */
function AgentPanel({
  config,
  intent,
  passkey,
  busy,
  onRevoke,
  details,
}: {
  config: Config;
  intent: IntentRecord | null;
  passkey?: EnrolledPasskey | null;
  busy: string | null;
  onRevoke: () => Promise<void>;
  /** Adds the disclosure, which needs the width of the Agents screen. */
  details?: boolean;
}) {
  const state = intent?.active ? "Active" : intent ? "Inactive" : "No permission";

  return (
    <div className="card">
      <div className="card__head">
        {/* One item, so a long permission line wraps the status chip onto its own
            row rather than pushing the avatar off the name it belongs to. */}
        <div className="card__head-main">
          <AgentAvatar large={details} />
          <div>
            <h2 className="card__title">{config.agentName}</h2>
            {intent && <p className="card__sub">{permissionLine(intent)}</p>}
          </div>
        </div>
        <span
          className={`state ${intent?.active ? "state--wait" : intent ? "state--bad" : "state--quiet"}`}
          style={{ marginLeft: "auto" }}
        >
          <DotIcon size={13} />
          {state}
        </span>
      </div>

      {intent && (
        <div className="section-actions" style={{ marginTop: 0 }}>
          <button className="block" onClick={onRevoke} disabled={busy !== null || !intent.active}>
            <XIcon size={14} />
            {busy === "revoke" ? "Withdrawing…" : "Withdraw access"}
          </button>
        </div>
      )}

      {details && <SecurityDetails config={config} intent={intent} passkey={passkey ?? null} />}
    </div>
  );
}

/** A permission's expiry as a clock time. One definition, used wherever it is shown. */
function timeOf(intent: IntentRecord): string {
  return new Date(Number(intent.expiry) * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One line for what the permission allows. Shared, so it reads the same anywhere.
 *
 * Only called when a permission exists. With none, the card's own state chip
 * says so and the setup card beside it is the instruction, so printing "nothing
 * may be spent until you set a limit" was a third way of saying the same thing.
 */
function permissionLine(intent: IntentRecord): string {
  return intent.expiry === 0n
    ? `May spend up to ${mon(intent.maxAmount)} once, with no expiry`
    : `May spend up to ${mon(intent.maxAmount)} once, until ${timeOf(intent)}`;
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
            Setup
          </p>
          <p className="card__title">{agentName}</p>
        </div>
      </div>

      <p className="request__sentence">Give {agentName} one spend limit.</p>
      <p className="request__sub">
        It covers a single payment, and only your passkey can approve it.
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
            In MON. A larger request is refused on-chain.
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
          <p className="field__hint">Then it expires on its own.</p>
        </div>
      </div>

      <div className="decide">
        <button className="primary decide__primary" onClick={onSubmit} disabled={busy} aria-busy={busy}>
          <FingerprintIcon size={16} />
          {busy ? "Waiting for your passkey…" : "Create permission with passkey"}
        </button>
      </div>

      <p className="field__hint" style={{ marginTop: 14 }}>
        Your device will ask for your fingerprint, face, or PIN. That passkey, and nothing else,
        approves a payment.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Settings
   -------------------------------------------------------------------------- */

/**
 * A user's settings screen, not a debug readout.
 *
 * Four questions, in the order somebody actually asks them:
 *
 *   Signing       what can approve money for me, and is it still valid here
 *   Defaults      what my next permission will be worth before I make it
 *   Enforcement   what the chain checks without asking anyone, including me
 *   This device   what is stored in this browser, and how to get rid of it
 *
 * The rules: every control here does something the app really does, every row
 * carries one fact, and the technical disclosure stays a disclosure instead of
 * being the whole screen. Settings shows state; it never argues.
 */
function SettingsPanel({
  config,
  intent,
  passkey,
  originFit,
  limitMon,
  expiryMinutes,
  activityCount,
  onLimit,
  onExpiry,
  onClearLog,
  onForget,
  onOpenApprovals,
}: {
  config: Config;
  intent: IntentRecord | null;
  passkey: EnrolledPasskey | null;
  originFit: { ok: boolean; problem: string | null } | null;
  limitMon: string;
  expiryMinutes: string;
  activityCount: number;
  onLimit: (v: string) => void;
  onExpiry: (v: string) => void;
  onClearLog: () => void;
  onForget: () => void;
  onOpenApprovals: () => void;
}) {
  const originOk = originFit?.ok ?? true;

  return (
    <div className="panel-grid">
      <div className="card">
        <div className="card__head">
          <div>
            <h2 className="card__title">Signing</h2>
            <p className="card__sub">The only thing that can approve a payment: your passkey.</p>
          </div>
        </div>
        <ul className="rows">
          <li className="row">
            <span className={`state ${passkey ? "state--ok" : "state--quiet"}`}>
              {passkey ? <CheckIcon size={13} /> : <DotIcon size={13} />}
              {passkey ? "Registered" : "Not set up"}
            </span>
            <div className="row__main">
              <p className="row__title">Device passkey</p>
              <p className="row__meta">
                {passkey
                  ? `Credential ${passkey.credentialId.slice(0, 12)}…, held by this device. This page keeps the public half only.`
                  : "Created the first time you set up a permission. The private key never leaves your device."}
              </p>
            </div>
          </li>
          <li className="row">
            <span className={`state ${originOk ? "state--ok" : "state--bad"}`}>
              {originOk ? <CheckIcon size={13} /> : <XIcon size={13} />}
              {originOk ? "Matches" : "Wrong address"}
            </span>
            <div className="row__main">
              <p className="row__title">Accepted origin</p>
              <p className="row__meta">
                {originOk
                  ? `A passkey is bound to one address, and ${config.origin} was frozen at deploy time. Open the app here and approvals work.`
                  : originFit?.problem}
              </p>
            </div>
          </li>
        </ul>
        <div className="section-actions">
          <button onClick={onOpenApprovals}>
            <FingerprintIcon size={15} />
            {passkey ? "Set up a new passkey" : "Set up a passkey"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <div>
            <h2 className="card__title">Approval defaults</h2>
            <p className="card__sub">
              What your next permission starts as. The chain enforces the number you create, never
              this screen.
            </p>
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="set-limit">Maximum amount</label>
            <input
              id="set-limit"
              inputMode="decimal"
              value={limitMon}
              onChange={(e) => onLimit(e.target.value)}
              aria-describedby="set-limit-hint"
            />
            <p className="field__hint" id="set-limit-hint">
              In MON. A larger request is refused on-chain.
            </p>
          </div>
          <div className="field">
            <label htmlFor="set-expiry">Expires in</label>
            <select id="set-expiry" value={expiryMinutes} onChange={(e) => onExpiry(e.target.value)}>
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
            </select>
            <p className="field__hint">Then it expires on its own.</p>
          </div>
        </div>
        <p className="note" style={{ marginTop: 18 }}>
          These are the numbers the Approvals screen opens with. Changing them here changes nothing
          that already exists on-chain.
        </p>
      </div>

      <div className="card">
        <div className="card__head">
          <div>
            <h2 className="card__title">Enforcement</h2>
            <p className="card__sub">What is checked before any money moves.</p>
          </div>
        </div>
        <ul className="rows">
          <li className="row">
            <span className={`state ${config.identityEnforced ? "state--ok" : "state--quiet"}`}>
              {config.identityEnforced ? <CheckIcon size={13} /> : <DotIcon size={13} />}
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
              {config.configurationLocked ? <CheckIcon size={13} /> : <DotIcon size={13} />}
              {config.configurationLocked ? "Frozen" : "Mutable"}
            </span>
            <div className="row__main">
              <p className="row__title">Configuration</p>
              <p className="row__meta">
                {config.configurationLocked
                  ? "The accepted origin and identity registry were frozen at deploy and cannot be changed by anyone."
                  : "This deployment still lets the operator change the accepted origin. Re-deploy with the lock enabled."}
              </p>
            </div>
          </li>
          <li className="row">
            <span className="state state--ok">
              <CheckIcon size={13} />
              Enforced
            </span>
            <div className="row__main">
              <p className="row__title">Exact action binding</p>
              <p className="row__meta">
                The approval covers this recipient, this amount, this contract and this chain.
              </p>
            </div>
          </li>
        </ul>
        <SecurityDetails config={config} intent={intent} passkey={passkey} />
      </div>

      <div className="card">
        <div className="card__head">
          <div>
            <h2 className="card__title">This device</h2>
            <p className="card__sub">
              The app runs without a wallet and without testnet funds, so the only state it keeps is
              local.
            </p>
          </div>
        </div>
        <ul className="rows">
          <li className="row">
            <span className="state state--quiet">
              <DotIcon size={13} />
              Local
            </span>
            <div className="row__main">
              <p className="row__title">Decision log</p>
              <p className="row__meta">
                {activityCount === 0
                  ? "Empty. A decision appears here the moment you approve or block a request."
                  : `${activityCount} ${activityCount === 1 ? "decision" : "decisions"} kept in this browser. The on-chain record is the real one; this is a copy.`}
              </p>
            </div>
          </li>
          <li className="row">
            <span className="state state--quiet">
              <CoinIcon size={13} />
              Relayed
            </span>
            <div className="row__main">
              <p className="row__title">Gas</p>
              <p className="row__meta">
                Witness pays the gas. The relaying key cannot approve anything, because it does not
                hold your passkey.
              </p>
            </div>
          </li>
        </ul>
        <div className="section-actions">
          <button onClick={onClearLog} disabled={activityCount === 0}>
            <TrashIcon size={15} />
            Clear the decision log
          </button>
          <button onClick={onForget}>
            <XIcon size={15} />
            Forget this browser
          </button>
        </div>
        <p className="note" style={{ marginTop: 18 }}>
          Forgetting removes the passkey pointer, the permission id and the log from this browser.
          It cannot withdraw a permission: do that from Agents, which is one transaction.
        </p>
      </div>
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
        <summary>
          <ChevronRightIcon size={14} className="disclosure-caret" />
          Security details
        </summary>
        <dl className="tech-list">
          <dt>Status</dt>
          <dd>
            {intent
              ? intent.active
                ? "Active, one use remaining"
                : intent.consumed
                  ? "Used"
                  : intent.revoked
                    ? "Withdrawn"
                    : "Expired"
              : "No permission registered"}
          </dd>
          <dt>Permission id</dt>
          <dd>{intent ? `#${intent.intentId.toString()}` : "not registered"}</dd>
          <dt>Spend limit</dt>
          <dd>{intent ? `${intent.maxAmount.toString()} wei` : "not set"}</dd>
          <dt>Expiry</dt>
          <dd>
            {intent && intent.expiry !== 0n
              ? `${new Date(Number(intent.expiry) * 1000).toISOString()}`
              : "no expiry"}
          </dd>
          <dt>Agent identity</dt>
          <dd>
            ERC-8004 id {config.agentId === "0" ? "not set" : `#${config.agentId}`}
            {config.identityEnforced ? ", enforced" : ", not enforced"}
          </dd>
          <dt>Identity registry</dt>
          <dd>
            {config.erc8004IdentityRegistry === "0x0000000000000000000000000000000000000000" ? (
              "not configured"
            ) : (
              <a
                className="link-icon"
                href={`${config.explorer}/address/${config.erc8004IdentityRegistry}`}
                target="_blank"
                rel="noreferrer"
              >
                {config.erc8004IdentityRegistry}
                <ExternalLinkIcon size={12} />
              </a>
            )}
          </dd>
          <dt>Agent wallet</dt>
          <dd>{config.contracts.AgentExecutor}</dd>
          <dt>Enforcing contract</dt>
          <dd>
            <a
              className="link-icon"
              href={`${config.explorer}/address/${config.contracts.DemoSafe}`}
              target="_blank"
              rel="noreferrer"
            >
              {config.contracts.DemoSafe}
              <ExternalLinkIcon size={12} />
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
              ? `enrolled in this browser (credential ${short(passkey.credentialId, 10, 6)})`
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
                  className="link-icon"
                  href={`${config.explorer}/address/${request.to}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {request.to}
                  <ExternalLinkIcon size={12} />
                </a>
              </dd>
            </>
          ) : (
            <>
              <dt>Request</dt>
              <dd>none waiting, the agent has not asked for anything</dd>
              <dt>Settlement address</dt>
              <dd>
                {config.payee ? (
                  <a
                    className="link-icon"
                    href={`${config.explorer}/address/${config.payee}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {config.payee}
                    <ExternalLinkIcon size={12} />
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
 * The strip the app opens with.
 *
 * This is state, not a pitch. It used to lead with a headline, a four-line lede
 * and three explainer cards, which is a landing page sitting on top of a tool:
 * whoever came to approve something had to scroll past the argument for why they
 * should. What is left is the four facts the app actually knows, all of them
 * derived from the chain's own answers, directly above the work.
 *
 * The line beside the screen name is the caption from VIEWS, so it follows the
 * tab and cannot drift from what the tab is.
 */
function StatusStrip({
  view,
  config,
  intent,
  pendingCount,
}: {
  view: View;
  config: Config | null;
  intent: IntentRecord | null;
  pendingCount: number;
}) {
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0];

  return (
    <section className="status" aria-label={`${current.label} status`}>
      {/* The screen's name is the selected tab directly above, so the heading is
          the one line that says what this screen is for. Printing the name here as
          well put the same word on screen twice, 40px apart. */}
      <div className="status__head">
        <h1 className="status__title status__title--lead">{current.caption}</h1>
      </div>

      {/* The four facts, on the screen that acts on them. Activity is a log and
          Settings is a reference: both already carry these facts in their own
          rows, so printing the strip above them was four cards, four times.

          Each hint says something the value does not: it used to read "Not set /
          None yet" and "0 / Nothing waiting", the same sentence twice. */}
      {view === "approvals" && (
        <div className="metrics">
          <div className="metric">
            <p className="metric__label">
              <CoinIcon size={13} />
              Spending limit
            </p>
            <p className={intent ? "metric__value metric__value--num" : "metric__value"}>
              {intent ? mon(intent.maxAmount) : "Not set"}
            </p>
            <p className="metric__hint">
              {!intent
                ? "A request above it is refused on-chain."
                : !intent.active
                  ? "No longer active."
                  : intent.expiry === 0n
                    ? "One payment, no expiry."
                    : `One payment, up to ${timeOf(intent)}.`}
            </p>
          </div>

          <div className="metric">
            <p className="metric__label">
              <InboxIcon size={13} />
              Waiting for you
            </p>
            <p className="metric__value metric__value--num">{pendingCount}</p>
            <p className="metric__hint">
              {pendingCount > 0 ? "Decide it below." : "Nothing has asked yet."}
            </p>
          </div>

          <div className="metric">
            <p className="metric__label">
              <ShieldCheckIcon size={13} />
              Agent verified
            </p>
            <p
              className={`metric__value ${
                config?.identityEnforced ? "metric__value--ok" : "metric__value--warn"
              }`}
            >
              {config === null ? "…" : config.identityEnforced ? "Yes" : "No"}
            </p>
            <p className="metric__hint">
              {config?.agentId && config.agentId !== "0"
                ? `Agent #${config.agentId}, owned on-chain.`
                : "Ownership is checked on-chain."}
            </p>
          </div>

          <div className="metric">
            <p className="metric__label">
              <LockIcon size={13} />
              Settings locked
            </p>
            <p
              className={`metric__value ${
                config?.configurationLocked ? "metric__value--ok" : "metric__value--warn"
              }`}
            >
              {config === null ? "…" : config.configurationLocked ? "Yes" : "No"}
            </p>
            {/* This hint said "Frozen at deploy" whether or not it was frozen. */}
            <p className="metric__hint">
              {config?.configurationLocked
                ? "Fixed when it was deployed."
                : "The operator can still change it."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
