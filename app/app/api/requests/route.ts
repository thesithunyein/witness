import { NextResponse } from "next/server";
import { MONAD_MAINNET, MONAD_TESTNET } from "@/lib/witness";
import { encodeRequestToken, validateRequest } from "@/lib/queue";
import { loadDeployment } from "@/lib/server/deployment";
import { enqueue, identityHeldBy, list } from "@/lib/server/queue";

export const dynamic = "force-dynamic";

/**
 * The agent's endpoint.
 *
 * `POST` is what an agent process calls to ask a human for money. It is the
 * missing half of Witness: the app has always been able to prove what a human
 * *authorized*, and until now it had nothing showing what the agent *asked for*.
 *
 * Two things this endpoint deliberately does not do:
 *
 *   - It does not approve anything. Nothing here can move money; only the human's
 *     passkey can, and the counterparty verifies it on-chain.
 *   - It does not trust the caller. `service`, `note` and `agentName` are rendered
 *     as the agent's own words. `to` and `amount` are treated as an untrusted
 *     proposal that becomes binding only where it belongs, inside the digest the
 *     human's passkey signs.
 *
 * The one claim that can be checked without the human is identity, so it is
 * checked here: an agent that claims an ERC-8004 id must be its owner on-chain.
 * `agentIdentity: "unverified"` in the response means no registry is configured
 * on this deployment, which the page also states in plain language.
 */

type Body = Record<string, unknown>;

export async function POST(request: Request) {
  let parsed: Body;
  try {
    parsed = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const checked = validateRequest(parsed);
  if (!checked.ok) {
    return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
  }

  let deployment;
  try {
    deployment = loadDeployment();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server not configured" },
      { status: 503 }
    );
  }

  // Identity is public state, so the claim is verifiable before a human spends
  // any attention on it. `null` means this deployment does not enforce identity.
  let identity: boolean | null = null;
  try {
    identity = await identityHeldBy(checked.value.agentId, deployment.contracts.AgentExecutor);
  } catch {
    identity = null;
  }

  if (identity === false) {
    return NextResponse.json(
      {
        ok: false,
        error: `agent id ${checked.value.agentId} is not owned by the agent wallet ${deployment.contracts.AgentExecutor}`,
      },
      { status: 403 }
    );
  }

  const stored = enqueue(checked.value);
  if (!stored) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "too many requests are already waiting for this permission; decide some before sending more",
      },
      { status: 429 }
    );
  }

  const origin = new URL(request.url).origin;

  return NextResponse.json({
    ok: true,
    request: stored,
    /** Carries the validated request, so delivery survives a cold instance. */
    shareUrl: `${origin}/?req=${encodeRequestToken(stored)}`,
    statusUrl: `${origin}/api/requests/${stored.id}`,
    agentIdentity: identity === true ? "verified" : identity === false ? "false" : "unverified",
    note:
      identity === null
        ? "No ERC-8004 registry is configured on this deployment, so the agent's identity claim was not checked."
        : undefined,
  });
}

/**
 * The page's queue read.
 *
 * `?intentId=` narrows it to the permission currently on screen, so a second
 * visitor's requests never appear in someone else's approvals. The page is
 * stateless about the queue; this is the only source of truth for what arrived.
 */
export async function GET(request: Request) {
  const intentId = new URL(request.url).searchParams.get("intentId") ?? undefined;
  if (intentId !== undefined && !/^\d+$/.test(intentId)) {
    return NextResponse.json({ ok: false, error: "intentId must be a decimal string" }, { status: 400 });
  }

  // The queue does not depend on the manifest, so an unconfigured deployment can
  // still show what arrived. Only the two presentation fields below come from it.
  let chainId = 10143;
  let explorer: string = MONAD_TESTNET.blockExplorers.default.url;
  try {
    const deployment = loadDeployment();
    chainId = deployment.chainId;
    explorer = (chainId === 143 ? MONAD_MAINNET : MONAD_TESTNET).blockExplorers.default.url;
  } catch {
    // Fall back to testnet presentation rather than failing the read.
  }

  return NextResponse.json({ ok: true, chainId, explorer, requests: list(intentId) });
}
