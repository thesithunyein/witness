import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  keccak256,
  toBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { intentRegistryAbi, TRANSFER_ACTION_TYPE, TRANSFER_NATIVE_ACTION_TYPE } from "@/lib/abi";
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
  /** Domain tag of the action being permitted. Defaults to the ERC-20 transfer tag. */
  actionType?: string;
  maxAmount: string;
  /** Absolute unix seconds. */
  expiry: string;
  policy?: Record<string, unknown> | null;
  credentialId: string;
  qx: string;
  qy: string;
};

type RevokeBody = { action: "revoke"; intentId: string };

const ACTION_TYPES: Record<string, Hex> = {
  [TRANSFER_ACTION_TYPE]: TRANSFER_ACTION_TYPE,
  [TRANSFER_NATIVE_ACTION_TYPE]: TRANSFER_NATIVE_ACTION_TYPE,
};

/** Only action types this deployment enforces are accepted, so a caller cannot
 *  register a permission for a tag no counterparty will ever check. */
function resolveActionType(raw: string | undefined): Hex | null {
  if (!raw) return TRANSFER_ACTION_TYPE;
  const lower = raw.toLowerCase();
  for (const known of Object.keys(ACTION_TYPES)) {
    if (known.toLowerCase() === lower) return known as Hex;
  }
  return null;
}

function client() {
  const deployment = loadDeployment();
  const account = privateKeyToAccount(relayerKey());
  const chain = deployment.chainId === 143 ? MONAD_MAINNET : MONAD_TESTNET;
  const wallet = createWalletClient({ account, chain, transport: http() });
  const pub = createPublicClient({ chain, transport: http() });
  return { deployment, wallet, pub };
}

export async function POST(req: Request) {
  let body: CreateBody | RevokeBody;
  try {
    body = (await req.json()) as CreateBody | RevokeBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const { deployment, wallet, pub } = client();

    if (body.action === "create") {
      const actionType = resolveActionType(body.actionType);
      if (!actionType) {
        return NextResponse.json({ ok: false, error: "unsupported action type" }, { status: 400 });
      }
      if (!/^\d+$/.test(body.maxAmount ?? "") || !/^\d+$/.test(body.expiry ?? "")) {
        return NextResponse.json(
          { ok: false, error: "maxAmount and expiry must be decimal strings" },
          { status: 400 }
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

      const hash = await wallet.writeContract({
        address: deployment.contracts.WitnessIntentRegistry,
        abi: intentRegistryAbi,
        functionName: "createIntent",
        args: [
          body.agentWallet as Hex,
          BigInt(body.agentId ?? "0"),
          actionType,
          BigInt(body.maxAmount),
          expiry,
          policyHash,
          keccak256(toBytes(body.credentialId)),
          BigInt(body.qx),
          BigInt(body.qy),
        ],
      });

      // Read the assigned id from the receipt's event rather than predicting it:
      // predicting from `nextIntentId` races with any concurrent registration.
      const receipt = await pub.waitForTransactionReceipt({ hash });
      let intentId: string | undefined;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== deployment.contracts.WitnessIntentRegistry.toLowerCase()) {
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

      return NextResponse.json({ ok: true, txHash: hash, intentId });
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
