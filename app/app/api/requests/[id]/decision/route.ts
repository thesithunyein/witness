import { NextResponse } from "next/server";
import { decide, retireSiblings } from "@/lib/server/queue";
import type { RequestDecision } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * Close the loop on one request, so the agent learns the outcome.
 *
 * Called by the page after the human has decided and the transaction has been
 * submitted through `/api/agent`. Ordering matters: the decision is recorded
 * *after* the chain has spoken, never before. If the recording fails, the human's
 * decision still happened and is still on-chain — the agent simply has to look at
 * the chain, which is where the truth lives anyway.
 *
 * This endpoint cannot approve anything. POSTing `{"status":"approved"}` here
 * fabricates a notification, never a payment: the money moves only through
 * `/api/agent`, which requires a passkey assertion the caller does not have.
 */

const STATUSES = new Set(["approved", "blocked", "refused"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  let body: RequestDecision;
  try {
    body = (await request.json()) as RequestDecision;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (!STATUSES.has(body?.status)) {
    return NextResponse.json(
      { ok: false, error: 'status must be "approved", "blocked" or "refused"' },
      { status: 400 }
    );
  }
  if (body.txHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
    return NextResponse.json({ ok: false, error: "txHash must be a 32-byte hex hash" }, { status: 400 });
  }

  const updated = decide(id, {
    status: body.status,
    txHash: body.txHash,
    explorer: body.explorer,
    reason: body.reason,
    reasonCode: body.reasonCode ?? null,
  });

  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "no pending request with that id on this instance" },
      { status: 404 }
    );
  }

  // The permission is one-time, so anything else still queued under it can no
  // longer be honoured. Retiring the siblings keeps the queue from offering a
  // decision that could only fail.
  const retired = retireSiblings(updated.intentId, updated.id, "The permission was used by another request.");

  return NextResponse.json({ ok: true, request: updated, retired });
}
