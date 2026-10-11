import { NextResponse } from "next/server";
import { get } from "@/lib/server/queue";

export const dynamic = "force-dynamic";

/**
 * The agent's own poll.
 *
 * An agent that asks a human for money should be able to find out what happened
 * without a webhook, so a decision is readable at the URL the POST handed back.
 *
 * What this returns is a *notification*, not a receipt: it is unsigned server
 * memory, and anything on the network can claim to be it. The receipt is the
 * transaction hash, which the agent checks for itself on Monad — see
 * `examples/agent-request.mjs`, which refuses to report success on this response
 * alone. That distinction is the whole reason a queue like this can be allowed to
 * be untrusted: it never carries authority, only news.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const request = get(id);
  if (!request) {
    // A cold instance forgets. The agent re-sends; nothing was lost that mattered,
    // because nothing that moves money ever lived here.
    return NextResponse.json(
      { ok: false, error: "unknown request on this instance", retry: true },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    request,
    decided: request.status !== "pending",
    verify: "Check any txHash on-chain before treating it as a receipt.",
  });
}
