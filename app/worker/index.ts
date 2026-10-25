/**
 * Witness, Cloudflare Worker server for the deployed site.
 *
 * The deployed app is a static bundle of the page component plus this Worker.
 * This file implements exactly the three routes the page calls:
 *
 *   GET  /api/config                → addresses, the RP identity, the settlement payee
 *   POST /api/intent                → relayed createIntent / revokeIntent (gas only)
 *   POST /api/agent                 → the agent's attempt, executed by the operator key
 *   POST /api/requests              → the agent asks a human for money
 *   GET  /api/requests              → the page reads the queue
 *   GET  /api/requests/:id          → the agent polls for the decision
 *   POST /api/requests/:id/decision → the page reports the decision back
 *
 * Why a Worker and not the Next.js routes in ../app/api: the deployed site is a
 * static bundle served by this Worker (Sites does not run a Node server). The
 * Next routes remain in the repo for `next dev`, and if you change the request or
 * response shapes here, mirror them there.
 *
 * Secrets: WITNESS_OPERATOR_PRIVATE_KEY / WITNESS_RELAYER_PRIVATE_KEY. They are
 * server-side bindings, never sent to the browser. The relayer pays gas; it can
 * never approve an action, because approval requires the enrolled passkey.
 */
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  agentExecutorAbi,
  identityRegistryAbi,
  intentRegistryAbi,
  TRANSFER_ACTION_TYPE,
  TRANSFER_NATIVE_ACTION_TYPE,
} from "../lib/abi";
import { chainFor, decodeUnauthorized } from "../lib/witness";
import {
  encodeRequestToken,
  validateRequest,
  type RequestDecision,
} from "../lib/queue";
import {
  decide as decideRequest,
  enqueue,
  get as getRequest,
  list as listRequests,
  retireSiblings,
} from "../lib/queue-store";
import { DEPLOYMENT } from "./deployment.generated";

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  WITNESS_OPERATOR_PRIVATE_KEY?: string;
  WITNESS_RELAYER_PRIVATE_KEY?: string;
};

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const walletFor = (key: Hex) => {
  const account = privateKeyToAccount(key);
  return {
    account,
    client: createWalletClient({
      account,
      chain: chainFor(DEPLOYMENT.chainId),
      transport: http(),
    }),
  };
};

const publicClient = () =>
  createPublicClient({ chain: chainFor(DEPLOYMENT.chainId), transport: http() });

/**
 * Wait until the write is actually mined before answering the client.
 *
 * Without this, the page can refresh the intent and read pre-transaction state:
 * a just-revoked permission would briefly look active and a fresh intent could
 * not be found yet. Monad's fast blocks make it a real race, not a theoretical
 * one, the test harness hit it. A write that mined but reverted is a genuine
 * failure and throws, so nothing is reported as successful without being real.
 */
async function confirm(hash: Hex): Promise<void> {
  const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 30_000 });
  if (receipt.status === "reverted") {
    throw new Error(`transaction ${hash} reverted on-chain`);
  }
}

const relayerKey = (env: Env) =>
  env.WITNESS_RELAYER_PRIVATE_KEY ?? env.WITNESS_OPERATOR_PRIVATE_KEY;
const operatorKey = (env: Env) =>
  env.WITNESS_OPERATOR_PRIVATE_KEY ?? env.WITNESS_RELAYER_PRIVATE_KEY;

/**
 * A real passkey assertion when the human approved this action, or null when the
 * agent is acting on its own. The empty form is a deliberately invalid assertion:
 * it cannot pass verification, which is what makes the injected attempt revert
 * on-chain rather than being filtered by a client-side check.
 */
type Assertion = {
  authenticatorData: Hex;
  clientDataJSON: Hex;
  r: string;
  s: string;
};

const EMPTY_ASSERTION = {
  authenticatorData: "0x" as Hex,
  clientDataJSON: "0x" as Hex,
  r: 0n,
  s: 0n,
};

const toWei = (whole: string): bigint => {
  const [intPart, fracPart = ""] = String(whole).split(".");
  const frac = (fracPart + "0".repeat(18)).slice(0, 18);
  return BigInt(intPart) * 10n ** 18n + BigInt(frac);
};

// ---------------------------------------------------------------------------
// GET /api/config
// ---------------------------------------------------------------------------

/**
 * The browser gets addresses from the server rather than from the query string,
 * so a visitor cannot redirect the app at arbitrary contracts.
 *
 * rpId/origin must match what the contracts were deployed with (the verifier
 * stores them on-chain), or every passkey prompt fails.
 */
const handleConfig = (): Response =>
  json({
    chainId: DEPLOYMENT.chainId,
    rpId: DEPLOYMENT.rpId,
    origin: DEPLOYMENT.origin,
    contracts: DEPLOYMENT.contracts,
    erc8004IdentityRegistry: DEPLOYMENT.erc8004IdentityRegistry,
    payee: DEPLOYMENT.payee ?? null,
    agentName: DEPLOYMENT.agentName,
    agentId: String(DEPLOYMENT.agentId ?? 0),
    configurationLocked: DEPLOYMENT.configurationLocked ?? false,
    identityEnforced:
      DEPLOYMENT.erc8004IdentityRegistry !== "0x0000000000000000000000000000000000000000",
  });

// ---------------------------------------------------------------------------
// POST /api/intent  { action: "create" | "revoke", ... }
// ---------------------------------------------------------------------------

type CreateBody = {
  action: "create";
  agentWallet: string;
  agentId?: string;
  /** Domain tag of the action being permitted. Defaults to the ERC-20 tag. */
  actionType?: string;
  maxAmount: string;
  /**
   * Absolute unix seconds, not a duration. Absolute, because the digest the human
   * signs contains the resolved expiry, a relative value would make the signed
   * number depend on when the request happened to be read.
   */
  expiry: string;
  policy?: Record<string, unknown> | null;
  qx: string;
  qy: string;
  credentialId: string;
};

type RevokeBody = { action: "revoke"; intentId: string };

const KNOWN_ACTION_TYPES: Record<string, Hex> = {
  [TRANSFER_ACTION_TYPE]: TRANSFER_ACTION_TYPE,
  [TRANSFER_NATIVE_ACTION_TYPE]: TRANSFER_NATIVE_ACTION_TYPE,
};

/** Only action types this deployment enforces are accepted, so a caller cannot
 *  register a permission for a tag no counterparty will ever check. */
function resolveActionType(raw: string | undefined): Hex | null {
  if (!raw) return TRANSFER_ACTION_TYPE;
  const lower = raw.toLowerCase();
  for (const known of Object.keys(KNOWN_ACTION_TYPES)) {
    if (known.toLowerCase() === lower) return known as Hex;
  }
  return null;
}

async function handleIntent(request: Request, env: Env): Promise<Response> {
  let body: CreateBody | RevokeBody;
  try {
    body = (await request.json()) as CreateBody | RevokeBody;
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const key = relayerKey(env);
  if (!key || !KEY_RE.test(key)) {
    return json(
      {
        ok: false,
        error:
          "WITNESS_RELAYER_PRIVATE_KEY is not set on the server. Set it in the site environment.",
      },
      503
    );
  }

  const { client } = walletFor(key as Hex);

  if (body.action === "create") {
    try {
      const actionType = resolveActionType(body.actionType);
      if (!actionType) return json({ ok: false, error: "unsupported action type" }, 400);
      if (!/^\d+$/.test(body.maxAmount ?? "") || !/^\d+$/.test(body.expiry ?? "")) {
        return json(
          { ok: false, error: "maxAmount and expiry must be decimal strings in base units" },
          400
        );
      }

      const expiry = BigInt(body.expiry);
      const policyHash = keccak256(
        toBytes(
          JSON.stringify({
            v: 1,
            agent: body.agentWallet,
            maxAmount: body.maxAmount,
            expiry: body.expiry,
            scope: actionType === TRANSFER_NATIVE_ACTION_TYPE ? "native" : "transfer",
            ...(body.policy ?? {}),
          })
        )
      ) as Hex;

      const txHash = await client.writeContract({
        address: DEPLOYMENT.contracts.WitnessIntentRegistry as Address,
        abi: intentRegistryAbi,
        functionName: "createIntent",
        args: [
          body.agentWallet as Address,
          BigInt(body.agentId ?? "0"),
          actionType,
          BigInt(body.maxAmount),
          expiry,
          policyHash,
          keccak256(toBytes(body.credentialId)) as Hex,
          BigInt(body.qx),
          BigInt(body.qy),
        ],
      });

      // Read the id from the event rather than predicting it: predicting from
      // `nextIntentId` races with any concurrent registration.
      const receipt = await publicClient().waitForTransactionReceipt({ hash: txHash });
      let intentId: string | undefined;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== DEPLOYMENT.contracts.WitnessIntentRegistry.toLowerCase()) {
          continue;
        }
        try {
          const decoded = decodeEventLog({
            abi: intentRegistryAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "IntentCreated") {
            intentId = (decoded.args as { intentId: bigint }).intentId.toString();
            break;
          }
        } catch {
          // Not one of ours; keep looking.
        }
      }

      if (receipt.status === "reverted") {
        throw new Error(`transaction ${txHash} reverted on-chain`);
      }
      return json({ ok: true, txHash, intentId, confirmed: true });
    } catch (err) {
      return json({ ok: false, error: firstLine(err) });
    }
  }

  if (body.action === "revoke") {
    try {
      const txHash = await client.writeContract({
        address: DEPLOYMENT.contracts.WitnessIntentRegistry as Address,
        abi: intentRegistryAbi,
        functionName: "revokeIntent",
        args: [BigInt(body.intentId)],
      });
      await confirm(txHash);
      return json({ ok: true, txHash, confirmed: true });
    } catch (err) {
      return json({ ok: false, error: firstLine(err) });
    }
  }

  return json({ ok: false, error: "unknown action" }, 400);
}

// ---------------------------------------------------------------------------
// POST /api/agent  { intentId, to, amount, assertion | null }
// ---------------------------------------------------------------------------

type AgentBody = {
  intentId: string;
  to: Address;
  /**
   * Base units (wei) as a decimal string. Base units, not whole tokens: this must
   * match what the browser sends, because the amount is one of the fields inside
   * the digest the human's passkey signed. Scaling it again here would make every
   * approval fail as a ChallengeMismatch.
   */
  amount: string;
  /** Which outbound path to attempt. Each has its own action tag on-chain. */
  kind?: "transfer" | "native";
  assertion: Assertion | null;
};

async function handleAgent(request: Request, env: Env): Promise<Response> {
  let body: AgentBody;
  try {
    body = (await request.json()) as AgentBody;
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const key = operatorKey(env);
  if (!key || !KEY_RE.test(key)) {
    return json(
      {
        ok: false,
        error:
          "WITNESS_OPERATOR_PRIVATE_KEY is not set on the server. Set it in the site environment.",
      },
      503
    );
  }

  if (typeof body.intentId !== "string" || !/^\d+$/.test(body.intentId)) {
    return json({ ok: false, error: "intentId must be a decimal string" }, 400);
  }
  if (typeof body.amount !== "string" || !/^\d+$/.test(body.amount)) {
    return json({ ok: false, error: "amount must be a decimal string in base units" }, 400);
  }
  if (body.kind !== undefined && body.kind !== "transfer" && body.kind !== "native") {
    return json({ ok: false, error: 'kind must be "transfer" or "native"' }, 400);
  }

  const { account, client } = walletFor(key as Hex);
  const native = body.kind === "native";

  const assertion = body.assertion
    ? {
        authenticatorData: body.assertion.authenticatorData,
        clientDataJSON: body.assertion.clientDataJSON,
        r: BigInt(body.assertion.r),
        s: BigInt(body.assertion.s),
      }
    : EMPTY_ASSERTION;

  try {
    const txHash = await client.writeContract({
      address: DEPLOYMENT.contracts.AgentExecutor as Address,
      abi: agentExecutorAbi,
      functionName: native ? "executeTransferNative" : "executeTransfer",
      args: [BigInt(body.intentId), body.to, BigInt(body.amount), assertion],
    });

    await confirm(txHash);

    return json({
      ok: true,
      txHash,
      confirmed: true,
      operator: account.address,
      explorer: `${chainFor(DEPLOYMENT.chainId).blockExplorers.default.url}/tx/${txHash}`,
    });
  } catch (err) {
    // The contract already decided why this was refused. Surface that reason
    // instead of a generic failure: it is the difference between "transaction
    // failed" and "that exceeds what you approved".
    const decoded = decodeUnauthorized(err);

    return json({
      ok: false,
      reason: decoded?.name ?? "Reverted",
      reasonCode: decoded?.reason ?? null,
      operator: account.address,
      detail: firstLine(err, 300),
    });
  }
}

// ---------------------------------------------------------------------------
// The agent's request queue
//
// Same shape as app/app/api/requests/*, and the same store module, so the two
// hosts cannot disagree about what an agent asked for. The queue grants nothing:
// only a passkey signature moves money, and the counterparty verifies it.
// ---------------------------------------------------------------------------

/**
 * Does the agent wallet really own the ERC-8004 id the request claims?
 *
 * `null` means no registry is configured, so the honest answer is "not checked"
 * rather than "fine". A registry that cannot answer fails closed.
 */
async function identityHeldBy(agentId: string): Promise<boolean | null> {
  if (agentId === "0") return null;
  const registry = DEPLOYMENT.erc8004IdentityRegistry as Address | undefined;
  if (!registry || registry === "0x0000000000000000000000000000000000000000") return null;
  try {
    const owner = (await publicClient().readContract({
      address: registry,
      abi: identityRegistryAbi,
      functionName: "ownerOf",
      args: [BigInt(agentId)],
    })) as Address;
    return owner.toLowerCase() === DEPLOYMENT.contracts.AgentExecutor.toLowerCase();
  } catch {
    return false;
  }
}

async function handleCreateRequest(request: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const checked = validateRequest(parsed);
  if (!checked.ok) return json({ ok: false, error: checked.error }, 400);

  const identity = await identityHeldBy(checked.value.agentId);
  if (identity === false) {
    return json(
      {
        ok: false,
        error: `agent id ${checked.value.agentId} is not owned by the agent wallet ${DEPLOYMENT.contracts.AgentExecutor}`,
      },
      403
    );
  }

  const stored = enqueue(checked.value);
  if (!stored) {
    return json(
      {
        ok: false,
        error:
          "too many requests are already waiting for this permission; decide some before sending more",
      },
      429
    );
  }

  const origin = new URL(request.url).origin;
  return json({
    ok: true,
    request: stored,
    shareUrl: `${origin}/?req=${encodeRequestToken(stored)}`,
    statusUrl: `${origin}/api/requests/${stored.id}`,
    agentIdentity: identity === true ? "verified" : identity === false ? "false" : "unverified",
    note:
      identity === null
        ? "No ERC-8004 registry is configured on this deployment, so the agent's identity claim was not checked."
        : undefined,
  });
}

const handleListRequests = (request: Request): Response => {
  const intentId = new URL(request.url).searchParams.get("intentId") ?? undefined;
  if (intentId !== undefined && !/^\d+$/.test(intentId)) {
    return json({ ok: false, error: "intentId must be a decimal string" }, 400);
  }
  return json({
    ok: true,
    chainId: DEPLOYMENT.chainId,
    explorer: chainFor(DEPLOYMENT.chainId).blockExplorers.default.url,
    requests: listRequests(intentId),
  });
};

const handleReadRequest = (id: string): Response => {
  const found = getRequest(id);
  if (!found) {
    // A recycled isolate forgets. The agent re-sends; nothing that matters was held.
    return json({ ok: false, error: "unknown request on this instance", retry: true }, 404);
  }
  return json({
    ok: true,
    request: found,
    decided: found.status !== "pending",
    verify: "Check any txHash on-chain before treating it as a receipt.",
  });
};

async function handleDecision(request: Request, id: string): Promise<Response> {
  let body: RequestDecision;
  try {
    body = (await request.json()) as RequestDecision;
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  if (body?.status !== "approved" && body?.status !== "blocked" && body?.status !== "refused") {
    return json({ ok: false, error: 'status must be "approved", "blocked" or "refused"' }, 400);
  }
  if (body.txHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
    return json({ ok: false, error: "txHash must be a 32-byte hex hash" }, 400);
  }

  const updated = decideRequest(id, {
    status: body.status,
    txHash: body.txHash,
    explorer: body.explorer,
    reason: body.reason,
    reasonCode: body.reasonCode ?? null,
  });
  if (!updated) {
    return json({ ok: false, error: "no pending request with that id on this instance" }, 404);
  }

  const retired = retireSiblings(
    updated.intentId,
    updated.id,
    "The permission was used by another request."
  );
  return json({ ok: true, request: updated, retired });
}

// The delivery token in an agent's share URL is decoded by the page, not here:
// it is the same validated payload this Worker handed back, and the page merges it
// into its own view when a cold instance has forgotten the queue. Approving it
// still needs the passkey, so the token carries news, never authority.

const firstLine = (err: unknown, max = 300): string =>
  (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, max);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      // rpId/origin are surfaced so a hostname mismatch with the served origin is
      // visible immediately instead of surfacing as a failed passkey prompt.
      return json({
        ok: true,
        chainId: DEPLOYMENT.chainId,
        rpId: DEPLOYMENT.rpId,
        origin: DEPLOYMENT.origin,
        host: url.host,
        hostMatchesOrigin: url.origin === DEPLOYMENT.origin,
        contracts: DEPLOYMENT.contracts,
      });
    }
    if (url.pathname === "/api/config" && request.method === "GET") {
      return handleConfig();
    }
    if (url.pathname === "/api/intent" && request.method === "POST") {
      return handleIntent(request, env);
    }
    if (url.pathname === "/api/agent" && request.method === "POST") {
      return handleAgent(request, env);
    }
    if (url.pathname === "/api/requests") {
      if (request.method === "POST") return handleCreateRequest(request);
      if (request.method === "GET") return handleListRequests(request);
      return json({ ok: false, error: "method not allowed" }, 405);
    }
    if (url.pathname.startsWith("/api/requests/")) {
      const rest = url.pathname.slice("/api/requests/".length);
      const slash = rest.indexOf("/");
      const id = slash === -1 ? rest : rest.slice(0, slash);
      const action = slash === -1 ? "" : rest.slice(slash + 1);

      if (!id || !/^req_[0-9a-f]{18}$/.test(id)) {
        return json({ ok: false, error: "unknown request id" }, 400);
      }
      if (action === "" && request.method === "GET") return handleReadRequest(id);
      if (action === "decision" && request.method === "POST") {
        return handleDecision(request, id);
      }
      return json({ ok: false, error: "method not allowed" }, 405);
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
