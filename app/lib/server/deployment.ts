import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";
import { DEPLOYMENT as BAKED } from "./deployment.generated";

export type Deployment = {
  chainId: number;
  deployer: Address;
  rpId: string;
  origin: string;
  contracts: {
    DemoUSD: Address;
    WitnessIntentRegistry: Address;
    WitnessVerifier: Address;
    DemoSafe: Address;
    AgentExecutor: Address;
  };
  erc8004IdentityRegistry: Address;
  /**
   * Where the demo agent's payments settle. Written by the deploy script; absent
   * in an older manifest, in which case the app reports no settlement address
   * rather than inventing one.
   */
  payee?: Address;
  safeFunding: string;
  /**
   * ERC-8004 binding, written by the deploy script. These are optional so a
   * manifest from an older deploy still loads, the app then reports the binding
   * as not enforced rather than claiming an enforcement that is not there.
   */
  agentName?: string;
  agentURI?: string;
  /** The minted identity id. "0" means no identity was registered. */
  agentId?: string;
  /** True once the trust-critical configuration was frozen at deployment. */
  configurationLocked?: boolean;
};

/**
 * Loads the deployment configuration.
 *
 * Two sources, one order of preference:
 *
 *   1. Local development, the manifest file written by `forge script`
 *      (`contracts/deployments/<chainId>.json`), so a fresh deploy is picked up
 *      immediately without a rebuild.
 *   2. Deployed serverless (Vercel), the manifest baked into this bundle at
 *      build time by `bun run build-worker.mjs`. On Vercel, `../contracts` is
 *      outside the function's file-tracing root, so the file is simply not
 *      there at runtime; without the baked copy /api/config would 503.
 */
export function loadDeployment(): Deployment {
  const chainId = Number(process.env.WITNESS_CHAIN_ID ?? BAKED.chainId);
  const path = resolve(process.cwd(), "..", "contracts", "deployments", `${chainId}.json`);

  if (existsSync(path)) {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Deployment;
    if (Number(parsed.chainId) !== chainId) {
      throw new Error(
        `Manifest chain id ${parsed.chainId} does not match WITNESS_CHAIN_ID ${chainId}.`
      );
    }
    return parsed;
  }

  const baked = BAKED as unknown as Deployment;
  if (Number(baked.chainId) !== chainId) {
    throw new Error(
      `Baked deployment chain id ${baked.chainId} does not match WITNESS_CHAIN_ID ${chainId}.`
    );
  }
  return baked;
}

/** The agent runtime's key. Server-side only; never reaches the browser. */
export function operatorKey(): `0x${string}` {
  const key = process.env.WITNESS_OPERATOR_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "WITNESS_OPERATOR_PRIVATE_KEY is missing or malformed. " +
        "This key drives the demo agent; keep it in the server environment only."
    );
  }
  return key as `0x${string}`;
}

/** The key that registers and revokes permissions on the human's behalf. */
export function relayerKey(): `0x${string}` {
  const key = process.env.WITNESS_RELAYER_PRIVATE_KEY ?? process.env.WITNESS_OPERATOR_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "WITNESS_RELAYER_PRIVATE_KEY (or WITNESS_OPERATOR_PRIVATE_KEY) is missing or malformed."
    );
  }
  return key as `0x${string}`;
}
