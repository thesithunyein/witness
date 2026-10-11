/**
 * Witness — Cloudflare Worker server for the deployed site.
 *
 * The deployed app is a static bundle of the page component plus this Worker.
 * This file implements exactly the three routes the page calls:
 *
 *   GET  /api/config   → the deployed contract addresses and the RP identity
 *   POST /api/intent   → relayed createIntent / revokeIntent (gas only)
 *   POST /api/agent    → the agent's attempt, executed by the operator key
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
  http,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentExecutorAbi, intentRegistryAbi, TRANSFER_ACTION_TYPE } from "../lib/abi";
import { MONAD_MAINNET, MONAD_TESTNET, decodeUnauthorized } from "../lib/witness";
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

const chainFor = (chainId: number) => (chainId === 143 ? MONAD_MAINNET : MONAD_TESTNET);

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
 * one — the test harness hit it. A write that mined but reverted is a genuine
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
  maxAmount: string;
  expiresInSeconds: number;
  qx: string;
  qy: string;
  credentialId: string;
};

type RevokeBody = { action: "revoke"; intentId: string };

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
      const expiry = BigInt(Math.floor(Date.now() / 1000) + body.expiresInSeconds);
      const policyHash = keccak256(
        toBytes(
          JSON.stringify({
            v: 1,
            agent: body.agentWallet,
            maxAmount: body.maxAmount,
            expiry: expiry.toString(),
            scope: "transfer",
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
          TRANSFER_ACTION_TYPE,
          toWei(body.maxAmount),
          expiry,
          policyHash,
          keccak256(toBytes(body.credentialId)) as Hex,
          BigInt(body.qx),
          BigInt(body.qy),
        ],
      });

      await confirm(txHash);
      return json({ ok: true, txHash, confirmed: true });
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
  /** Human-readable amount in whole DUSD; scaled server-side. */
  amount: string;
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

  const { account, client } = walletFor(key as Hex);

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
      functionName: "executeTransfer",
      args: [BigInt(body.intentId), body.to, toWei(body.amount), assertion],
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
    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
