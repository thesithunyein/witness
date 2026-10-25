/**
 * The queue store, with no runtime dependencies.
 *
 * Split out of `server/queue.ts` for one reason: the deployed app runs the Next
 * routes on Vercel and the Cloudflare Worker from `worker/index.ts`, and a second
 * implementation of the queue would eventually mean two different answers to
 * "what did the agent ask for". The store is pure data handling, so both hosts
 * can share it; only identity verification needs a chain client, and that stays
 * in the host-specific file.
 *
 * Durability, stated plainly: this is process memory. Each server instance keeps
 * its own copy, and an idle instance is eventually recycled. That is handled, not
 * hidden:
 *
 *   1. `POST /api/requests` also returns a delivery token carrying the validated
 *      request, so a browser's next poll missing a cold instance does not lose the
 *      request, see `encodeRequestToken`.
 *   2. The canonical record of a decision is the chain. The map can be wiped,
 *      filled, or lost and no money can move: only a passkey signature can do
 *      that, and the counterparty verifies it on-chain.
 *
 * A demo-grade queue with honest limits, not a pretend database.
 */

import {
  REQUEST_LIMITS,
  type AgentRequest,
  type RequestDecision,
  type RequestInput,
} from "./queue";

type Store = {
  byId: Map<string, AgentRequest>;
  /** Insertion order, oldest first. Trimmed to REQUEST_LIMITS.stored. */
  order: string[];
};

/**
 * Pinned to the global so Next's dev-mode module reloading does not silently
 * create a second queue, which would make a local run look broken. In the Worker
 * the module is a single long-lived instance, so this is just a plain store there.
 */
const globalForQueue = globalThis as unknown as { __witnessRequestQueue?: Store };

export function queue(): Store {
  globalForQueue.__witnessRequestQueue ??= { byId: new Map(), order: [] };
  return globalForQueue.__witnessRequestQueue;
}

const randomId = (): string => {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `req_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
};

/** Store a validated request. Returns null when the queue refuses it. */
export function enqueue(input: RequestInput): AgentRequest | null {
  const store = queue();

  const pending = store.order
    .map((id) => store.byId.get(id))
    .filter((r): r is AgentRequest => Boolean(r))
    .filter((r) => r.status === "pending" && r.intentId === input.intentId);
  if (pending.length >= REQUEST_LIMITS.pendingPerIntent) return null;

  const request: AgentRequest = {
    ...input,
    id: randomId(),
    createdAt: Date.now(),
    status: "pending",
  };

  store.byId.set(request.id, request);
  store.order.push(request.id);

  while (store.order.length > REQUEST_LIMITS.stored) {
    const oldest = store.order.shift();
    if (oldest) store.byId.delete(oldest);
  }

  return request;
}

/** Requests for one permission, newest first; every request when omitted. */
export function list(intentId?: string): AgentRequest[] {
  const store = queue();
  const all = store.order
    .map((id) => store.byId.get(id))
    .filter((r): r is AgentRequest => Boolean(r));
  const filtered = intentId ? all.filter((r) => r.intentId === intentId) : all;
  return filtered.slice().reverse();
}

export const get = (id: string): AgentRequest | undefined => queue().byId.get(id);

/**
 * Record the human's decision.
 *
 * Only a pending request can be decided, and only once: a one-time permission
 * must not be spent by two tabs racing on the same queued request. Returns the
 * updated record, or undefined when there is nothing decidable with that id.
 */
export function decide(id: string, decision: RequestDecision): AgentRequest | undefined {
  const store = queue();
  const current = store.byId.get(id);
  if (!current || current.status !== "pending") return undefined;

  const updated: AgentRequest = { ...current, ...decision, decidedAt: Date.now() };
  store.byId.set(id, updated);
  return updated;
}

/**
 * Mark every still-pending request under one permission as refused.
 *
 * Called after a decision lands, so a stale request cannot sit in the queue
 * looking actionable after the permission it belongs to has been used or
 * withdrawn. This is presentation hygiene, not enforcement, the chain already
 * refuses the second attempt with `AlreadyConsumed` or `Revoked`.
 */
export function retireSiblings(intentId: string, exceptId: string, reason: string): number {
  let retired = 0;
  for (const [id, r] of queue().byId) {
    if (id === exceptId || r.intentId !== intentId || r.status !== "pending") continue;
    queue().byId.set(id, { ...r, status: "refused", reason, decidedAt: Date.now() });
    retired++;
  }
  return retired;
}
