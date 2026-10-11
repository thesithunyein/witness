import { NextResponse } from "next/server";
import { createWalletClient, http, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { intentRegistryAbi, TRANSFER_ACTION_TYPE } from "@/lib/abi";
import { MONAD_MAINNET, MONAD_TESTNET } from "@/lib/witness";
import { loadDeployment, relayerKey } from "@/lib/server/deployment";

export const dynamic = "force-dynamic";

/**
 * Registration and revocation are relayed by the server so a judge can complete
 * the whole flow with no wallet extension and no testnet funds.
 *
 * Be precise about what this does and does not weaken: the *authority* over
 * funds is the passkey, not this relayer. The relayer only pays gas and owns the
 * intent record. It cannot approve an action, because approving requires a
 * signature from the enrolled passkey that the server never possesses.
 */

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

const toWei = (whole: string): bigint => {
  const [intPart, fracPart = ""] = whole.split(".");
  const frac = (fracPart + "0".repeat(18)).slice(0, 18);
  return BigInt(intPart) * 10n ** 18n + BigInt(frac);
};

function client() {
  const deployment = loadDeployment();
  const account = privateKeyToAccount(relayerKey());
  const chain = deployment.chainId === 143 ? MONAD_MAINNET : MONAD_TESTNET;
  const wallet = createWalletClient({ account, chain, transport: http() });
  return { deployment, wallet };
}

export async function POST(req: Request) {
  let body: CreateBody | RevokeBody;
  try {
    body = (await req.json()) as CreateBody | RevokeBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const { deployment, wallet } = client();

    if (body.action === "create") {
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

      const hash = await wallet.writeContract({
        address: deployment.contracts.WitnessIntentRegistry,
        abi: intentRegistryAbi,
        functionName: "createIntent",
        args: [
          body.agentWallet as Hex,
          BigInt(body.agentId ?? "0"),
          TRANSFER_ACTION_TYPE,
          toWei(body.maxAmount),
          expiry,
          policyHash,
          keccak256(toBytes(body.credentialId)),
          BigInt(body.qx),
          BigInt(body.qy),
        ],
      });

      return NextResponse.json({ ok: true, txHash: hash });
    }

    if (body.action === "revoke") {
      const hash = await wallet.writeContract({
        address: deployment.contracts.WitnessIntentRegistry,
        abi: intentRegistryAbi,
        functionName: "revokeIntent",
        args: [BigInt(body.intentId)],
      });
      return NextResponse.json({ ok: true, txHash: hash });
    }

    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message.split("\n")[0].slice(0, 300) : "failed",
      },
      { status: 200 }
    );
  }
}
