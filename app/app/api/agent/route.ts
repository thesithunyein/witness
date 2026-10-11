import { NextResponse } from "next/server";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentExecutorAbi } from "@/lib/abi";
import { MONAD_MAINNET, MONAD_TESTNET, decodeUnauthorized } from "@/lib/witness";
import { loadDeployment, operatorKey } from "@/lib/server/deployment";

export const dynamic = "force-dynamic";

type Assertion = {
  authenticatorData: Hex;
  clientDataJSON: Hex;
  r: string;
  s: string;
};

type Body = {
  intentId: string;
  /** Which outbound path to attempt. Each has its own action tag on-chain. */
  kind?: "transfer" | "native";
  to: Address;
  /** Base units (wei) as a decimal string. */
  amount: string;
  /**
   * A real passkey assertion when the human approved this action, or null when
   * the agent is acting on its own (i.e. it was injected and has nothing to
   * present). This is the whole demo: the agent process cannot manufacture the
   * second case.
   */
  assertion: Assertion | null;
};

const EMPTY_ASSERTION: Assertion = {
  authenticatorData: "0x",
  clientDataJSON: "0x",
  r: "0",
  s: "0",
};

/**
 * The caller is an untrusted agent, so every field is checked before it is used.
 * Without this, a malformed request threw out of `BigInt` and became an opaque
 * 500; a bad request is a 400 with a reason.
 */
function invalid(body: Body | null | undefined): string | null {
  if (!body || typeof body !== "object") return "a JSON body is required";
  if (typeof body.intentId !== "string" || !/^\d+$/.test(body.intentId)) {
    return "intentId must be the decimal string of an integer";
  }
  if (body.kind !== undefined && body.kind !== "transfer" && body.kind !== "native") {
    return 'kind must be "transfer" or "native"';
  }
  if (typeof body.to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(body.to)) {
    return "to must be a 20-byte hex address";
  }
  if (typeof body.amount !== "string" || !/^\d+$/.test(body.amount)) {
    return "amount must be a decimal string in base units";
  }
  const a = body.assertion;
  if (a && (typeof a.r !== "string" || !/^\d+$/.test(a.r) || !/^\d+$/.test(a.s))) {
    return "assertion r and s must be decimal strings";
  }
  return null;
}

export async function POST(req: Request) {
  let parsed: Body | null;
  try {
    parsed = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const problem = invalid(parsed);
  if (problem) {
    return NextResponse.json({ ok: false, error: problem }, { status: 400 });
  }
  const body = parsed as Body;

  let deployment;
  let key: Hex;
  try {
    deployment = loadDeployment();
    key = operatorKey();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server not configured" },
      { status: 503 }
    );
  }

  const account = privateKeyToAccount(key);
  const chain = deployment.chainId === 143 ? MONAD_MAINNET : MONAD_TESTNET;
  const wallet = createWalletClient({ account, chain, transport: http() });

  const assertion = body.assertion
    ? {
        authenticatorData: body.assertion.authenticatorData,
        clientDataJSON: body.assertion.clientDataJSON,
        r: BigInt(body.assertion.r),
        s: BigInt(body.assertion.s),
      }
    : {
        authenticatorData: EMPTY_ASSERTION.authenticatorData,
        clientDataJSON: EMPTY_ASSERTION.clientDataJSON,
        r: 0n,
        s: 0n,
      };

  const native = body.kind === "native";

  try {
    const hash = await wallet.writeContract({
      address: deployment.contracts.AgentExecutor,
      abi: agentExecutorAbi,
      functionName: native ? "executeTransferNative" : "executeTransfer",
      args: [BigInt(body.intentId), body.to, BigInt(body.amount), assertion],
    });

    return NextResponse.json({
      ok: true,
      txHash: hash,
      operator: account.address,
      explorer: `${chain.blockExplorers.default.url}/tx/${hash}`,
    });
  } catch (err) {
    // The contract already decided why this was refused. Surface that reason
    // instead of a generic failure, it is the difference between the user
    // seeing "transaction failed" and "that exceeds what you approved".
    const decoded = decodeUnauthorized(err);
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        ok: false,
        reason: decoded?.name ?? "Reverted",
        reasonCode: decoded?.reason ?? null,
        operator: account.address,
        detail: message.split("\n")[0].slice(0, 300),
      },
      { status: 200 }
    );
  }
}
