/**
 * The agent's request.
 *
 * This is the missing half of the product. Everything else in Witness proves what
 * a human *authorized*; this is the shape of what the agent *asked for*, so the
 * human has something concrete to authorize.
 *
 * Trust boundary, stated once and relied on everywhere:
 *
 *   The agent is untrusted. Every field here is the agent's own claim, delivered
 *   over HTTP from outside this app. Nothing in this file makes a claim true.
 *   The claims become true only when (a) the amount is inside the intent's cap,
 *   (b) the recipient and amount are what the passkey signs, and (c) the
 *   counterparty re-derives that digest on-chain. The UI renders these fields as
 *   the agent's words, never as facts about the world.
 *
 * Deliberately isomorphic: no Node built-ins, no viem, so the same module is used
 * by the Next routes, the Cloudflare Worker, and the browser.
 */

export const REQUEST_LIMITS = {
  /** Longest accepted service name. Long enough for "Market Data API (per call)". */
  service: 80,
  /** Longest accepted free-form note from the agent. */
  note: 280,
  /** Hard cap on stored requests, so an unfriendly caller cannot grow memory. */
  stored: 100,
  /** Pending requests allowed per permission at once. */
  pendingPerIntent: 25,
} as const;

export type RequestKind = "native" | "transfer";

export type RequestStatus = "pending" | "approved" | "blocked" | "refused";

export type AgentRequest = {
  /** Server-assigned. Opaque, stable, and the only handle the agent gets back. */
  id: string;
  createdAt: number;
  /** Which permission the agent is asking to spend under. */
  intentId: string;
  /** ERC-8004 identity the agent claims. Verified against the registry on arrival. */
  agentId: string;
  /** Display name for the agent, from its ERC-8004 metadata where available. */
  agentName: string;
  /** What the payment is for — the merchant's name, in the agent's words. */
  service: string;
  /** Optional: why the agent wants this, in its own words. */
  note?: string;
  kind: RequestKind;
  /** Where the money would go. Bound into the digest the human signs. */
  to: string;
  /** Base units (wei), decimal string. Bound into the digest the human signs. */
  amount: string;

  status: RequestStatus;
  /** When the human decided, in ms. Absent while pending. */
  decidedAt?: number;
  txHash?: string;
  explorer?: string;
  /** The contract's own reason name when it refused, e.g. "OverLimit". */
  reason?: string;
  reasonCode?: number | null;
};

/** What the agent POSTs. The server fills in id/createdAt/status. */
export type RequestInput = Omit<AgentRequest, "id" | "createdAt" | "status" | "decidedAt">;

export type RequestDecision = {
  status: Exclude<RequestStatus, "pending">;
  txHash?: string;
  explorer?: string;
  reason?: string;
  reasonCode?: number | null;
};

export type Validation = { ok: true; value: RequestInput } | { ok: false; error: string };

const isDigits = (s: unknown): s is string => typeof s === "string" && /^\d+$/.test(s);
const isAddress = (s: unknown): s is string => typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Validate an untrusted request body.
 *
 * The rules are strict on purpose: a request that cannot be turned into a signed
 * action is rejected at the door, so the human is never shown a decision they
 * cannot actually make. A malformed amount, for example, must not become a page
 * that offers an Approve button which can only fail.
 */
export function validateRequest(body: unknown): Validation {
  if (!body || typeof body !== "object") return { ok: false, error: "a JSON body is required" };
  const b = body as Record<string, unknown>;

  if (!isDigits(b.intentId)) return { ok: false, error: "intentId must be a decimal integer string" };
  if (!isAddress(b.to)) return { ok: false, error: "to must be a 20-byte hex address" };
  if (!isDigits(b.amount)) return { ok: false, error: "amount must be base units, as a decimal string" };
  if (BigInt(b.amount as string) <= 0n) return { ok: false, error: "amount must be greater than zero" };
  if (b.kind !== "native" && b.kind !== "transfer") {
    return { ok: false, error: 'kind must be "native" or "transfer"' };
  }

  const service = clean(b.service, REQUEST_LIMITS.service);
  if (!service) return { ok: false, error: "service is required" };

  if (b.agentId !== undefined && !isDigits(b.agentId)) {
    return { ok: false, error: "agentId must be a decimal integer string when present" };
  }

  return {
    ok: true,
    value: {
      intentId: b.intentId as string,
      kind: b.kind,
      to: b.to as string,
      amount: b.amount as string,
      service,
      note: clean(b.note, REQUEST_LIMITS.note) || undefined,
      agentId: (b.agentId as string | undefined) ?? "0",
      agentName: clean(b.agentName, REQUEST_LIMITS.service) || "Your agent",
    },
  };
}

/**
 * A request the browser has already decided cannot be decided again. Kept
 * server-side so a second tab cannot double-spend a one-time permission, and
 * checked here so both sides agree on what "already decided" means.
 */
export const isDecidable = (r: AgentRequest): boolean => r.status === "pending";

// ---------------------------------------------------------------------------
// Delivery tokens
//
// The queue lives in the server instance that received the agent's POST. A
// serverless platform gives no sticky sessions, so the browser's next poll can
// land on a different instance and see an empty queue. The agent's POST therefore
// answers with a token that carries the exact validated request; the page merges
// it in when it is present in the URL. The token is a delivery channel, not a
// trust channel: opening it changes nothing on-chain, and the page still requires
// the human's passkey before any money moves.
// ---------------------------------------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToToken(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : "";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "";
  }
  return out;
}

const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

function tokenToBytes(token: string): Uint8Array {
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of token) {
    const v = B64_INDEX[ch.charCodeAt(0)];
    if (v === undefined || v < 0) throw new Error("bad token character");
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** The request payload carried in a link, so delivery survives instance rotation. */
export const encodeRequestToken = (r: AgentRequest): string =>
  bytesToToken(new TextEncoder().encode(JSON.stringify(r)));

/** Inverse of `encodeRequestToken`. Throws on anything that is not a valid request. */
export function decodeRequestToken(token: string): AgentRequest {
  const json = new TextDecoder().decode(tokenToBytes(token));
  const raw = JSON.parse(json) as AgentRequest;
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") {
    throw new Error("not a request token");
  }
  const checked = validateRequest(raw);
  if (!checked.ok) throw new Error(checked.error);
  return {
    ...raw,
    ...checked.value,
    id: raw.id,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    status: raw.status ?? "pending",
  };
}

/** Read the delivery token out of a URL search string, or null when absent. */
export function requestFromSearch(search: string, parse = decodeRequestToken): AgentRequest | null {
  try {
    const raw = new URLSearchParams(search).get("req");
    if (!raw) return null;
    return parse(raw);
  } catch {
    return null;
  }
}

/** Keep the first occurrence of each id, newest first. Used when merging sources. */
export function mergeRequests(...lists: AgentRequest[][]): AgentRequest[] {
  const seen = new Set<string>();
  const merged: AgentRequest[] = [];
  for (const list of lists) {
    for (const r of list) {
      if (!r || typeof r.id !== "string" || seen.has(r.id)) continue;
      seen.add(r.id);
      merged.push(r);
    }
  }
  return merged.sort((a, b) => b.createdAt - a.createdAt);
}

/** The request the human is being asked about: the newest one still pending. */
export const pendingRequest = (list: AgentRequest[]): AgentRequest | null =>
  list.find((r) => r.status === "pending") ?? null;

/**
 * Fold a decision into the page's own copy of a request.
 *
 * The page applies the decision locally the moment the chain has spoken, and the
 * server is told afterwards. If the server has already forgotten the request — a
 * recycled instance — the human still sees the outcome that actually happened,
 * because the transaction is the record and this is only the display.
 */
export function withDecision(
  list: AgentRequest[],
  id: string,
  decision: RequestDecision
): AgentRequest[] {
  return list.map((r) => (r.id === id ? { ...r, ...decision, decidedAt: Date.now() } : r));
}

/**
 * Tell the app which way the human decided, so the agent can stop waiting.
 *
 * Best-effort by design: a failure here costs the agent a poll, never money.
 */
export async function reportDecision(
  id: string,
  decision: RequestDecision,
  f: typeof fetch = fetch
): Promise<boolean> {
  try {
    const res = await f(`/api/requests/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(decision),
    });
    return res.ok;
  } catch {
    return false;
  }
}
