import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";

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
  safeFunding: string;
};

/**
 * Server-only. Loads the manifest written by `forge script script/Deploy.s.sol`
 * so no contract address is ever hand-copied into the app or trusted from the
 * client.
 *
 * Deliberately read at request time rather than imported: importing a JSON file
 * that does not exist yet would fail the build before the contracts are deployed.
 */
export function loadDeployment(): Deployment {
  const chainId = Number(process.env.WITNESS_CHAIN_ID ?? 10143);
  const path = resolve(process.cwd(), "..", "contracts", "deployments", `${chainId}.json`);

  if (!existsSync(path)) {
    throw new Error(
      `No deployment manifest at ${path}. Deploy first: ` +
        `cd contracts && forge script script/Deploy.s.sol --rpc-url <rpc> --broadcast`
    );
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as Deployment;
  if (Number(parsed.chainId) !== chainId) {
    throw new Error(
      `Manifest chain id ${parsed.chainId} does not match WITNESS_CHAIN_ID ${chainId}.`
    );
  }
  return parsed;
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
