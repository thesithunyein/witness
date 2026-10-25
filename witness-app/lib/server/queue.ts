import type { Address } from "viem";
import { identityRegistryAbi } from "../abi";
import { publicClient } from "../witness";
import { loadDeployment } from "./deployment";

/**
 * Server-side queue access.
 *
 * The store itself lives in `lib/queue-store.ts` so the Next routes and the
 * Cloudflare Worker cannot drift into two different ideas of what the agent asked
 * for. What is host-specific is here: verifying an ERC-8004 identity claim, which
 * needs the deployment manifest (a filesystem read, so Node-only).
 */
export { decide, enqueue, get, list, queue, retireSiblings } from "../queue-store";

/**
 * Verify the ERC-8004 identity an agent claims.
 *
 * Returns `null` when no registry is configured (the deployment then does not
 * enforce identity, and the UI says so), `false` when the claim is not true, and
 * `true` when the agent wallet really owns the id.
 *
 * This runs on arrival rather than at approval time because it is the one claim
 * that *can* be checked without the human: identity is public state. The human's
 * decision is about the payment, not about who the agent is.
 */
export async function identityHeldBy(
  agentId: string,
  agentWallet: Address
): Promise<boolean | null> {
  if (agentId === "0") return null;
  const deployment = loadDeployment();
  const registry = deployment.erc8004IdentityRegistry as Address | undefined;
  if (!registry || registry === "0x0000000000000000000000000000000000000000") return null;

  try {
    const owner = (await publicClient(deployment.chainId).readContract({
      address: registry,
      abi: identityRegistryAbi,
      functionName: "ownerOf",
      args: [BigInt(agentId)],
    })) as Address;
    return owner.toLowerCase() === agentWallet.toLowerCase();
  } catch {
    // A registry that cannot answer (no such token, RPC down) fails closed here:
    // an unverifiable identity claim is reported as unverified, never as verified.
    return false;
  }
}
