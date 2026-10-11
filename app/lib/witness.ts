import { createPublicClient, http, decodeErrorResult, type Address, type Hex } from "viem";
import { REASON_NAMES, witnessVerifierAbi } from "./abi";

export const MONAD_TESTNET = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadScan", url: "https://testnet.monadscan.com" } },
} as const;

export const MONAD_MAINNET = {
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadScan", url: "https://monadscan.com" } },
} as const;

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

// NOTE: loading the deployment manifest touches the filesystem, so it lives in
// lib/server/deployment.ts and must never be imported from a client component.
// The browser learns the addresses from /api/config instead, which keeps the
// configured chain the single source of truth.

export const publicClient = (chainId: number) =>
  createPublicClient({
    chain: chainId === 143 ? MONAD_MAINNET : MONAD_TESTNET,
    transport: http(),
  });

/**
 * Recursively hunt for revert `data` on a viem error, which may be nested.
 *
 * How deep the raw revert bytes sit depends on the call path: viem's
 * `simulateContract` errors carry them around depth 5, while a `writeContract`
 * estimation failure carries them around depth 7. The bound must cover the
 * deepest real chain — an earlier limit of 6 silently collapsed every refusal
 * into "Reverted", which is exactly the unhelpful outcome this function exists
 * to prevent. The WeakSet guards against a cyclic `cause` chain.
 */
function findRevertData(
  err: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): Hex | undefined {
  if (!err || typeof err !== "object" || depth > 12) return undefined;
  if (seen.has(err)) return undefined;
  seen.add(err);
  const e = err as Record<string, unknown>;
  const data = e.data;
  if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
    return data as Hex;
  }
  return findRevertData(e.cause, depth + 1, seen);
}

export type DecodedFailure = { reason: number; name: string };

/**
 * Turn a rejected transaction into the protocol's own reason.
 *
 * This is the point of the Reason enum: the contract already computed why the
 * action was refused, and throwing that away would leave the user staring at
 * "transaction failed" when the real answer is "the amount exceeds what you approved".
 */
export function decodeUnauthorized(err: unknown): DecodedFailure | undefined {
  const data = findRevertData(err);
  if (!data) return undefined;
  try {
    const decoded = decodeErrorResult({ abi: witnessVerifierAbi, data });
    if (decoded.errorName !== "Unauthorized") return undefined;
    const reason = Number((decoded.args as readonly unknown[])[0]);
    return { reason, name: REASON_NAMES[reason] ?? `Unknown(${reason})` };
  } catch {
    return undefined;
  }
}

export const fmt = (value: bigint, decimals = 18, digits = 2): string => {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, digits);
  return `${neg ? "-" : ""}${whole.toLocaleString()}.${fracStr}`;
};

export const short = (a: string, head = 6, tail = 4): string =>
  a.length <= head + tail + 2 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;

export const secondsLeft = (expiry: bigint): number => {
  if (expiry === 0n) return Number.POSITIVE_INFINITY;
  return Number(expiry) - Math.floor(Date.now() / 1000);
};

export const countdown = (secs: number): string => {
  if (!Number.isFinite(secs)) return "no expiry";
  if (secs <= 0) return "expired";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
