#!/usr/bin/env node
/**
 * Live end-to-end integration test against the deployed Monad testnet contracts.
 *
 * The Foundry suite proves the protocol against a simulated chain. This proves the
 * DEPLOYED stack behaves the same way, on a real chain, with real transactions,
 * which is a different claim, and the one a user actually relies on.
 *
 * What it does, in order:
 *   1. creates a real one-time permission (0.5 MON, 10 minutes, ERC-8004 #agentId)
 *   2. signs the digest the CONTRACT derives, with a real P-256 key
 *   3. executes the approved action and checks the money actually moved
 *   4. replays the same approval            -> must be refused (AlreadyConsumed)
 *   5. asks for 10x the limit, unapproved   -> must be refused (OverLimit)
 *   6. claims an ERC-8004 id it does not own -> must be refused (AgentNotRegistered)
 *
 * Every refusal is asserted to be the contract's own typed `Unauthorized(reason)`,
 * not a generic failure, and the script exits non-zero if any step misbehaves.
 *
 * Requirements and honest limits:
 *   - DEPLOYER_PRIVATE_KEY in the repo .env (testnet only; it pays gas)
 *   - the P-256 key here is the deterministic test key from
 *     contracts/test/vectors/AssertionVector.sol, signed by scripts/sign-action.mjs.
 *     It is NOT a browser passkey, and this script lives outside the product: it
 *     exercises the deployed contracts, not the WebAuthn ceremony, which needs a
 *     real authenticator in a real browser.
 *   - it spends testnet MON from the safe (the funds are deliberately disposable)
 *
 *   node examples/live-e2e.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  keccak256,
  toBytes,
  decodeEventLog,
  decodeErrorResult,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CHAIN_ID = Number(process.env.WITNESS_CHAIN_ID ?? 10143);

const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "contracts", "deployments", `${CHAIN_ID}.json`), "utf8")
);
const C = manifest.contracts;

const chain = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
};
const client = createPublicClient({ chain, transport: http() });

const envFile = readFileSync(resolve(ROOT, ".env"), "utf8");
const envKey = envFile.match(/DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/);
if (!envKey) {
  console.error("DEPLOYER_PRIVATE_KEY not found in .env, cannot run the live test.");
  process.exit(1);
}
const account = privateKeyToAccount(envKey[1]);
const wallet = createWalletClient({ account, chain, transport: http() });

const ZERO = "0x0000000000000000000000000000000000000000";
const TRANSFER = keccak256(toBytes("witness.action.transfer"));
const TRANSFER_NATIVE = keccak256(toBytes("witness.action.transfer.native"));

const registryAbi = [
  {
    type: "function",
    name: "createIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentWallet", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "actionType", type: "bytes32" },
      { name: "maxAmount", type: "uint256" },
      { name: "expiry", type: "uint64" },
      { name: "policyHash", type: "bytes32" },
      { name: "credentialHash", type: "bytes32" },
      { name: "qx", type: "uint256" },
      { name: "qy", type: "uint256" },
    ],
    outputs: [{ name: "intentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "nextIntentId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "IntentCreated",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "agentWallet", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: false },
      { name: "actionType", type: "bytes32", indexed: false },
      { name: "maxAmount", type: "uint256", indexed: false },
      { name: "expiry", type: "uint64", indexed: false },
      { name: "policyHash", type: "bytes32", indexed: false },
      { name: "credentialHash", type: "bytes32", indexed: false },
    ],
  },
];

const safeAbi = [
  {
    type: "function",
    name: "nativeActionHash",
    stateMutability: "view",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "nativeBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const agentAbi = [
  {
    type: "error",
    name: "Unauthorized",
    inputs: [{ name: "reason", type: "uint8" }],
  },
  {
    type: "function",
    name: "executeTransferNative",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      {
        name: "assertion",
        type: "tuple",
        components: [
          { name: "authenticatorData", type: "bytes" },
          { name: "clientDataJSON", type: "bytes" },
          { name: "r", type: "uint256" },
          { name: "s", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
];

const REASON = [
  "Allowed",
  "NoSuchIntent",
  "Revoked",
  "Expired",
  "AlreadyConsumed",
  "WrongAgent",
  "AgentNotRegistered",
  "ActionTypeMismatch",
  "OverLimit",
  "RpIdMismatch",
  "NoUserPresence",
  "NoUserVerification",
  "WrongType",
  "ChallengeMismatch",
  "OriginMismatch",
  "BadSignature",
];

/** The enrolled P-256 key from contracts/test/vectors/AssertionVector.sol. */
const QX = 44702274224498794473545520410227660840283676033840465889383061057408546046121n;
const QY = 21803181121322582768952485833475351927577024584072209868473887740193232502642n;

/** Ask the Node signer for an assertion over `digest`, exactly as a passkey would. */
function signAsPasskey(digest) {
  const out = execFileSync("node", [resolve(ROOT, "scripts", "sign-action.mjs"), digest], {
    encoding: "utf8",
  });
  const lines = out.trim().split("\n").map((l) => l.trim());
  if (lines.length < 4) throw new Error(`unexpected signer output: ${out.slice(0, 200)}`);
  return {
    authenticatorData: lines[0],
    clientDataJSON: lines[1],
    r: BigInt(lines[2]),
    s: BigInt(lines[3]),
  };
}

/** Create a permission owned by `account` and return its real id from the receipt. */
async function createIntent({ agentId, actionType, maxAmount, expirySeconds, qx, qy }) {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + expirySeconds);
  const hash = await wallet.writeContract({
    address: C.WitnessIntentRegistry,
    abi: registryAbi,
    functionName: "createIntent",
    args: [
      C.AgentExecutor,
      agentId,
      actionType,
      maxAmount,
      expiry,
      keccak256(toBytes(JSON.stringify({ v: 1, e2e: true }))),
      keccak256(toBytes("e2e:credential")),
      qx,
      qy,
    ],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== C.WitnessIntentRegistry.toLowerCase()) continue;
    try {
      const d = decodeEventLog({ abi: registryAbi, data: log.data, topics: log.topics });
      if (d.eventName === "IntentCreated") return d.args.intentId;
    } catch {
      // not ours
    }
  }
  throw new Error("IntentCreated event not found in the receipt");
}

/**
 * Find the contract's typed reason inside a viem error.
 *
 * viem nests this differently by call path. When the error is declared in the ABI
 * it parses it eagerly and exposes `{ errorName, args }` on the error object; when
 * it only has raw revert bytes they sit several `cause` levels down (the RPC's own
 * error is at the bottom). Both shapes are searched, because a live run should not
 * report "Reverted" when the chain said exactly which rule was broken.
 */
function findReason(err) {
  let e = err;
  let depth = 0;
  while (e && typeof e === "object" && depth < 12) {
    if (e.errorName === "Unauthorized" && Array.isArray(e.args)) {
      return Number(e.args[0]);
    }
    if (typeof e.data === "string" && e.data.startsWith("0x") && e.data.length >= 10) {
      try {
        const decoded = decodeErrorResult({ abi: agentAbi, data: e.data });
        if (decoded.errorName === "Unauthorized") return Number(decoded.args[0]);
      } catch {
        // not our error signature
      }
    }
    e = e.cause;
    depth += 1;
  }
  return undefined;
}

/** Send the agent's attempt and normalise the outcome to `{ok, reason, hash}`. */
async function attempt(intentId, to, amount, assertion) {
  try {
    const hash = await wallet.writeContract({
      address: C.AgentExecutor,
      abi: agentAbi,
      functionName: "executeTransferNative",
      args: [intentId, to, amount, assertion],
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    return { ok: receipt.status === "success", hash };
  } catch (err) {
    const code = findReason(err);
    if (code !== undefined) {
      return { ok: false, reason: REASON[code] ?? `Unknown(${code})`, code };
    }
    return {
      ok: false,
      reason: "Reverted",
      error: (err.shortMessage ?? err.message ?? "").slice(0, 160),
    };
  }
}

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` , ${detail}` : ""}`);
};

async function main() {
  console.log(`\nLive end-to-end test, ${chain.name} (${chain.id})`);
  console.log(`  deployer  ${account.address}`);
  console.log(`  executor  ${C.AgentExecutor}`);
  console.log(`  safe      ${C.DemoSafe}`);
  console.log(`  identity  ERC-8004 #${manifest.agentId} (${manifest.erc8004IdentityRegistry})`);

  const recipient = getAddress("0x00000000000000000000000000000000c0ffee01");
  const LIMIT = 5n * 10n ** 17n; // 0.5 MON
  const OVER = 5n * 10n ** 18n; // 5 MON

  const safeBefore = await client.readContract({
    address: C.DemoSafe,
    abi: safeAbi,
    functionName: "nativeBalance",
  });
  const toBefore = await client.getBalance({ address: recipient });
  console.log(`\n  safe holds ${formatUnits(safeBefore, 18)} MON; recipient holds ${formatUnits(toBefore, 18)}`);
  if (safeBefore < LIMIT) {
    console.error("  the safe has no native MON to move, fund it first");
    process.exit(1);
  }

  // --- 1+2+3: the approved path -----------------------------------------
  const goodId = await createIntent({
    agentId: BigInt(manifest.agentId),
    actionType: TRANSFER_NATIVE,
    maxAmount: LIMIT,
    expirySeconds: 600,
    qx: QX,
    qy: QY,
  });
  const goodDigest = await client.readContract({
    address: C.DemoSafe,
    abi: safeAbi,
    functionName: "nativeActionHash",
    args: [goodId, recipient, LIMIT],
  });
  const good = await attempt(goodId, recipient, LIMIT, signAsPasskey(goodDigest));
  const safeAfter = await client.readContract({
    address: C.DemoSafe,
    abi: safeAbi,
    functionName: "nativeBalance",
  });
  const toAfter = await client.getBalance({ address: recipient });
  check(
    "approved action executes and moves exactly the approved amount",
    good.ok && safeAfter === safeBefore - LIMIT && toAfter === toBefore + LIMIT,
    good.hash ? `tx ${good.hash}` : good.reason
  );

  // --- 4: replay the same approval --------------------------------------
  const replay = await attempt(goodId, recipient, LIMIT, signAsPasskey(goodDigest));
  check("replaying the same approval is refused", replay.reason === "AlreadyConsumed", replay.reason);

  // --- 5: over the limit, with no approval ------------------------------
  const overId = await createIntent({
    agentId: BigInt(manifest.agentId),
    actionType: TRANSFER_NATIVE,
    maxAmount: LIMIT,
    expirySeconds: 600,
    qx: QX,
    qy: QY,
  });
  const over = await attempt(overId, recipient, OVER, { authenticatorData: "0x", clientDataJSON: "0x", r: 0n, s: 0n });
  check(`an unapproved ${formatUnits(OVER, 18)} MON request is refused as OverLimit`, over.reason === "OverLimit", over.reason);

  // --- 6: a claimed identity the executor does not own ------------------
  const fakeId = await createIntent({
    agentId: 999_999_999n,
    actionType: TRANSFER_NATIVE,
    maxAmount: LIMIT,
    expirySeconds: 600,
    qx: QX,
    qy: QY,
  });
  const fakeDigest = await client.readContract({
    address: C.DemoSafe,
    abi: safeAbi,
    functionName: "nativeActionHash",
    args: [fakeId, recipient, LIMIT],
  });
  const fake = await attempt(fakeId, recipient, LIMIT, signAsPasskey(fakeDigest));
  check(
    "an unowned ERC-8004 identity is refused as AgentNotRegistered",
    fake.reason === "AgentNotRegistered",
    fake.reason
  );

  // Leave no unusable permission behind: the two attempts above are still active.
  for (const id of [overId, fakeId]) {
    const hash = await wallet.writeContract({
      address: C.WitnessIntentRegistry,
      abi: [{ type: "function", name: "revokeIntent", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] }],
      functionName: "revokeIntent",
      args: [id],
    });
    await client.waitForTransactionReceipt({ hash });
  }
  console.log("  (cleaned up: the two refused permissions were revoked)");

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(`\nFailed: ${e.shortMessage ?? (e instanceof Error ? e.message.split("\n")[0] : e)}`);
  process.exit(1);
});
