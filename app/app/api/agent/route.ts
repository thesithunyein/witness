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
  to: Address;
  /** Human-readable amount in whole DUSD; scaled server-side. */
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

const toWei = (whole: string): bigint => {
  const [intPart, fracPart = ""] = whole.split(".");
  const frac = (fracPart + "0".repeat(18)).slice(0, 18);
  return BigInt(intPart) * 10n ** 18n + BigInt(frac);
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

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

  const amount = toWei(body.amount);
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

  try {
    const hash = await wallet.writeContract({
      address: deployment.contracts.AgentExecutor,
      abi: agentExecutorAbi,
      functionName: "executeTransfer",
      args: [BigInt(body.intentId), body.to, amount, assertion],
    });

    return NextResponse.json({
      ok: true,
      txHash: hash,
      operator: account.address,
      explorer: `${chain.blockExplorers.default.url}/tx/${hash}`,
    });
  } catch (err) {
    // The contract already decided why this was refused. Surface that reason
    // instead of a generic failure — it is the difference between the user
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
