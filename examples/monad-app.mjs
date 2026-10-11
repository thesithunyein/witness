#!/usr/bin/env node
/**
 * A working third-party integration, end to end.
 *
 * This is the smallest honest version of "add Witness to my Monad app": it reads
 * the deployed contracts, reads the human's permission, asks the contract for the
 * digest of the action it wants to take, and preflights that action. Everything it
 * prints comes from the chain, so running it against a live deployment is a real
 * check of the integration surface, not a mock.
 *
 * Run it:
 *
 *   npm install                 # root deps (viem, @noble/curves)
 *   node examples/monad-app.mjs
 *   node examples/monad-app.mjs 3 0.5 0x1111111111111111111111111111111111111111
 *                               ^  ^   ^
 *                        intentId  MON  recipient
 *
 * With no arguments it uses the newest registered permission, the ceiling amount,
 * and a placeholder recipient.
 *
 * What it does NOT do: produce an approval. That needs a human passkey, which only
 * exists in the human's browser at their real origin. The last section prints the
 * exact call your server makes once the browser has produced one; the reference
 * implementation of that route is app/app/api/agent/route.ts.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  formatUnits,
  parseUnits,
  getAddress,
  keccak256,
  toBytes,
} from "viem";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// ---------------------------------------------------------------------------
// Deployment: one source of truth, never a hand-copied address.
// ---------------------------------------------------------------------------

const CHAIN_ID = Number(process.env.WITNESS_CHAIN_ID ?? 10143);
const manifestPath = resolve(ROOT, "contracts", "deployments", `${CHAIN_ID}.json`);
if (!existsSync(manifestPath)) {
  console.error(`No deployment manifest at ${manifestPath}. Deploy the contracts first.`);
  process.exit(1);
}
const deployment = JSON.parse(readFileSync(manifestPath, "utf8"));

const CHAINS = {
  10143: {
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  },
  143: {
    id: 143,
    name: "Monad",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  },
};

const chain = CHAINS[CHAIN_ID];
if (!chain) {
  console.error(`Unsupported chain ${CHAIN_ID}. Add it to CHAINS in this file.`);
  process.exit(1);
}

const client = createPublicClient({ chain, transport: http() });

// ---------------------------------------------------------------------------
// The three ABI reads this integration needs. Copied verbatim from
// app/lib/abi.ts so this file has no dependency on the app's build.
// ---------------------------------------------------------------------------

const demoSafeAbi = [
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
];

const intentRegistryAbi = [
  {
    type: "function",
    name: "getIntent",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "agentWallet", type: "address" },
          { name: "agentId", type: "uint256" },
          { name: "actionType", type: "bytes32" },
          { name: "maxAmount", type: "uint256" },
          { name: "expiry", type: "uint64" },
          { name: "policyHash", type: "bytes32" },
          { name: "credentialHash", type: "bytes32" },
          { name: "qx", type: "uint256" },
          { name: "qy", type: "uint256" },
          { name: "createdAt", type: "uint64" },
          { name: "revoked", type: "bool" },
          { name: "consumed", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "nextIntentId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const witnessVerifierAbi = [
  {
    type: "function",
    name: "check",
    stateMutability: "view",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "actionType", type: "bytes32" },
      { name: "actionHash", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "actor", type: "address" },
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
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "rpId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "origin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "identityRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "configurationLocked",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
];

/** Mirrors the Reason enum in contracts/src/interfaces/IWitness.sol, in order. */
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

/**
 * keccak256("witness.action.transfer.native"), see WitnessAction.sol.
 * Derived rather than hardcoded, so it cannot drift from the contract constant.
 */
const NATIVE_ACTION_TYPE = keccak256(toBytes("witness.action.transfer.native"));

// ---------------------------------------------------------------------------
// The integration
// ---------------------------------------------------------------------------

const { DemoSafe, WitnessVerifier, WitnessIntentRegistry, AgentExecutor } = deployment.contracts;

const [argIntent, argAmount, argTo] = process.argv.slice(2);

/**
 * Read a getter that may not exist yet.
 *
 * A deployed contract and the source in this repo can be at different revisions,
 * "the deployment is older than the source" is a real state that an integration has
 * to survive rather than crash on, and a missing getter is the signal for it.
 */
async function safeRead(args) {
  try {
    return await client.readContract(args);
  } catch {
    return undefined;
  }
}

async function main() {
  console.log(`\nWitness integration check, ${chain.name} (${chain.id})`);
  console.log(`  manifest    ${manifestPath}`);
  console.log(`  DemoSafe    ${DemoSafe}`);
  console.log(`  verifier    ${WitnessVerifier}`);
  console.log(`  executor    ${AgentExecutor}`);

  const [rpId, origin, registry, locked] = await Promise.all([
    safeRead({ address: WitnessVerifier, abi: witnessVerifierAbi, functionName: "rpId" }),
    safeRead({ address: WitnessVerifier, abi: witnessVerifierAbi, functionName: "origin" }),
    safeRead({
      address: WitnessVerifier,
      abi: witnessVerifierAbi,
      functionName: "identityRegistry",
    }),
    safeRead({
      address: WitnessVerifier,
      abi: witnessVerifierAbi,
      functionName: "configurationLocked",
    }),
  ]);

  const ZERO = "0x0000000000000000000000000000000000000000";
  console.log(`\nDeployment posture`);
  console.log(`  rp id                ${rpId ?? "unavailable"}`);
  console.log(`  accepted origin      ${origin ?? "unavailable"}`);
  console.log(
    `  identity registry    ${
      registry === undefined ? "unavailable on this deployment" : registry === ZERO ? "not configured" : registry
    }`
  );
  console.log(
    `  config locked        ${
      locked === undefined
        ? "unknown, this deployed verifier predates the lock; re-deploy the stack"
        : locked
          ? "yes (identity binding and accepted origin are immutable)"
          : "NO, still mutable"
    }`
  );
  console.log(`  your origin must be  ${origin ?? "?"}  (a passkey from any other origin is refused)`);

  // An agent id that claims to be bound while the registry is unset is not bound.
  // Say so here rather than letting an integrator infer enforcement from nothing.
  if (registry === ZERO || registry === undefined) {
    console.log(
      "  note                 ERC-8004 binding is NOT active: an intent naming an agent id is\n" +
        "                       not checked against identity ownership on this deployment."
    );
  }

  // 1. Which permission are we acting under?
  let intentId;
  if (argIntent) {
    intentId = BigInt(argIntent);
  } else {
    const next = await client.readContract({
      address: WitnessIntentRegistry,
      abi: intentRegistryAbi,
      functionName: "nextIntentId",
    });
    intentId = next - 1n;
  }

  const intent = await client.readContract({
    address: WitnessIntentRegistry,
    abi: intentRegistryAbi,
    functionName: "getIntent",
    args: [intentId],
  });

  if (intent.user === "0x0000000000000000000000000000000000000000") {
    console.error(`\nPermission #${intentId} does not exist. Create one in the app first.`);
    process.exit(1);
  }

  const left = intent.expiry === 0n ? Infinity : Number(intent.expiry) - Math.floor(Date.now() / 1000);
  console.log(`\nPermission #${intentId}`);
  console.log(`  human               ${intent.user}`);
  console.log(`  agent wallet        ${intent.agentWallet}`);
  console.log(`  agent identity      ${intent.agentId === 0n ? "none claimed" : `ERC-8004 #${intent.agentId}`}`);
  console.log(`  ceiling             ${formatUnits(intent.maxAmount, 18)} MON`);
  console.log(`  expires             ${Number.isFinite(left) ? `${left}s from now` : "never"}`);
  console.log(
    `  state               ${
      intent.consumed ? "used" : intent.revoked ? "revoked" : left <= 0 ? "expired" : "active"
    }`
  );

  // 2. The action this app wants to take.
  const amount = argAmount ? parseUnits(argAmount, 18) : intent.maxAmount;
  const to = getAddress((argTo ?? "0x1111111111111111111111111111111111111111").toLowerCase());

  // 3. The digest comes FROM THE CONTRACT. Never recompute it here: the bytes the
  //    human's passkey signs and the bytes the contract recomputes must be the
  //    same bytes, and only the contract can guarantee that.
  console.log(`\nAction this app wants to take`);
  console.log(`  pay ${formatUnits(amount, 18)} MON to ${to}`);

  const digest = await safeRead({
    address: DemoSafe,
    abi: demoSafeAbi,
    functionName: "nativeActionHash",
    args: [intentId, to, amount],
  });

  if (!digest) {
    console.log(
      "  digest              unavailable: this deployed DemoSafe has no native path\n" +
        "                      (it predates executeNative / nativeActionHash). Re-deploy the\n" +
        "                      stack from this repo to exercise the MON flow."
    );
  } else {
    console.log(`  digest the passkey must have signed:\n    ${digest}`);

    // 4. Preflight. No assertion is available here (that requires the human's
    //    browser), so the semantic checks answer and the signature check is the only
    //    negative. Against a used/expired/over-limit permission the reason is already
    //    the real one, which is the point of preflighting before you submit.
    const code = await client.readContract({
      address: WitnessVerifier,
      abi: witnessVerifierAbi,
      functionName: "check",
      args: [
        intentId,
        NATIVE_ACTION_TYPE,
        digest,
        amount,
        intent.agentWallet,
        { authenticatorData: "0x", clientDataJSON: "0x", r: 0n, s: 0n },
      ],
    });

    const reason = REASON[Number(code)] ?? `Unknown(${code})`;
    console.log(`\nPreflight (WitnessVerifier.check, read-only)`);
    console.log(`  decision            ${reason} (code ${code})`);
    if (reason === "BadSignature") {
      console.log(
        "  reading             every semantic check passed; no passkey assertion was supplied,\n" +
          "                      so this is the expected answer for a usable permission."
      );
    }
  }

  // 5. The write path, once the browser has produced an approval.
  console.log(`\nTo act (after the human approves in the browser)`);
  console.log(`  POST /api/agent  (your server, or the reference route)`);
  console.log(
    JSON.stringify(
      {
        intentId: intentId.toString(),
        kind: "native",
        to,
        amount: amount.toString(),
        assertion: { authenticatorData: "0x…", clientDataJSON: "0x…", r: "0x…", s: "0x…" },
      },
      null,
      2
    )
  );
  console.log(
    "\n  The assertion is produced by the human's passkey in their browser, over the action\n" +
      "  digest the contract derives. Your server cannot manufacture it, which is exactly\n" +
      "  why relaying the transaction is safe.\n"
  );
}

main().catch((e) => {
  console.error(`\nFailed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  process.exit(1);
});
