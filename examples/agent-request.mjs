#!/usr/bin/env node
/**
 * The agent, actually asking.
 *
 * This is a separate process from the app. It is the thing the product said was
 * there and wasn't: an agent that decides it needs to pay for something, sends
 * the request over HTTP, and then waits to find out what the human decided.
 *
 * The loop is four real steps:
 *
 *   1. POST /api/requests   — the agent asks, with a real recipient and amount.
 *   2. The human decides    — in the browser, with a passkey, in the app.
 *   3. GET  /api/requests/:id — the agent polls until the request is decided.
 *   4. Verify on-chain      — the agent does NOT trust the response. It reads the
 *                             transaction receipt from Monad and only reports a
 *                             payment when the chain says one happened.
 *
 * Step 4 is the point. A queue that tells you "approved" is worth nothing; a
 * transaction hash you can check yourself is worth everything. Run this against
 * a stale or hostile server and it will still tell you the truth about the money.
 *
 * Run it:
 *
 *   npm install                       # root deps (viem)
 *   node examples/agent-request.mjs   # newest permission, 0.50 MON, manifest payee
 *
 *   node examples/agent-request.mjs --intent 12 --amount 0.25 --service "Market Data API"
 *   node examples/agent-request.mjs --over        # 10x the amount: the attack, for real
 *   node examples/agent-request.mjs --url https://witness.sithunyein.com --wait 180
 *
 * The default recipient comes from the deployment manifest's `payee`, which the
 * deploy script records — so the demo pays a real, on-chain-visible merchant
 * rather than a placeholder address nobody controls.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, formatUnits, parseUnits, getAddress } from "viem";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const CHAIN_ID = Number(process.env.WITNESS_CHAIN_ID ?? 10143);
const manifestPath = resolve(ROOT, "contracts", "deployments", `${CHAIN_ID}.json`);
if (!existsSync(manifestPath)) {
  console.error(`No deployment manifest at ${manifestPath}. Deploy the contracts first.`);
  process.exit(1);
}
const deployment = JSON.parse(readFileSync(manifestPath, "utf8"));

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next === undefined || next.startsWith("--") ? true : next;
};

const APP = String(flag("url", process.env.WITNESS_APP_URL ?? deployment.origin)).replace(/\/$/, "");
const OVER = flag("over", false) === true;
const SERVICE = String(flag("service", "Market Data API"));
const NOTE = String(
  flag("note", OVER ? "Urgent: vendor requires the annual plan, prepay now." : "Per-call price for a market data feed.")
);
const AMOUNT_MON = String(flag("amount", "0.5"));
const RECIPIENT = getAddress(String(flag("to", deployment.payee ?? deployment.deployer)));
const WAIT_SECONDS = Number(flag("wait", 180));
/** `native` moves MON; `transfer` moves the demo ERC-20. Different on-chain action tags. */
const KIND = String(flag("kind", "native"));
const AGENT_NAME = String(flag("agent", deployment.agentName ?? "Research Agent"));

/** The attack: ten times what the human set. A real injected instruction looks like this. */
const requestedMon = OVER ? (Number(AMOUNT_MON) * 10).toString() : AMOUNT_MON;
const amountWei = parseUnits(requestedMon, 18);

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

const MONAD_TESTNET = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
};
const MONAD_MAINNET = {
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
};

const chain = CHAIN_ID === 143 ? MONAD_MAINNET : MONAD_TESTNET;
const explorer = CHAIN_ID === 143 ? "https://monadscan.com" : "https://testnet.monadscan.com";
const publicClient = createPublicClient({ chain, transport: http() });

const INTENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "nextIntentId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isActive",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getIntent",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    // The full struct, in declaration order. A partial tuple here would decode
    // the wrong fields (viem reads positionally) and report a policy hash as a
    // boolean — which is exactly what an earlier version of this script did.
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
];

/** Newest registered permission, when none was named. */
async function newestIntentId() {
  const next = await publicClient.readContract({
    address: deployment.contracts.WitnessIntentRegistry,
    abi: INTENT_REGISTRY_ABI,
    functionName: "nextIntentId",
  });
  return next - 1n;
}

async function intentById(id) {
  return publicClient.readContract({
    address: deployment.contracts.WitnessIntentRegistry,
    abi: INTENT_REGISTRY_ABI,
    functionName: "getIntent",
    args: [id],
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mon = (wei) => {
  const s = formatUnits(wei, 18);
  return `${s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s} MON`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response (a proxy error page, a truncation). Status carries the news.
  }
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

async function main() {
  const intentId = flag("intent") !== undefined ? BigInt(String(flag("intent"))) : await newestIntentId();

  console.log(`agent      ${AGENT_NAME} (ERC-8004 #${deployment.agentId})`);
  console.log(`app        ${APP}`);
  console.log(`permission #${intentId}`);

  const active = await publicClient.readContract({
    address: deployment.contracts.WitnessIntentRegistry,
    abi: INTENT_REGISTRY_ABI,
    functionName: "isActive",
    args: [intentId],
  });
  const intent = await intentById(intentId);
  if (!active) {
    console.error(`Permission #${intentId} is not active (used, withdrawn or expired).`);
    console.error("Create a fresh one in the app — a one-time permission cannot be reused.");
    process.exit(1);
  }
  console.log(`limit      ${mon(intent.maxAmount)}   agent wallet ${intent.agentWallet}`);

  if (OVER) {
    console.log("");
    console.log("### INJECTED REQUEST ###");
    console.log("The instruction this agent is following did not come from its owner.");
    console.log(`It asks for ${mon(amountWei)} against a ${mon(intent.maxAmount)} limit, with no approval.`);
    console.log("");
  }

  const payload = {
    intentId: intentId.toString(),
    kind: KIND,
    to: RECIPIENT,
    amount: amountWei.toString(),
    service: SERVICE,
    note: NOTE,
    agentId: String(deployment.agentId ?? "0"),
    agentName: AGENT_NAME,
  };

  let sent = await post(`${APP}/api/requests`, payload);
  if (sent.status !== 200 || !sent.json?.ok) {
    console.error(`The app refused the request (HTTP ${sent.status}): ${sent.json?.error ?? "no detail"}`);
    if (sent.status === 403) {
      console.error("That is the identity check: an agent cannot queue a request under an id it does not own.");
    }
    process.exit(1);
  }

  let request = sent.json.request;
  log(`request sent to the app: ${SERVICE} — ${mon(amountWei)} to ${RECIPIENT}`);
  if (sent.json.agentIdentity === "verified") log("the app confirmed this agent owns the claimed ERC-8004 id");
  if (sent.json.agentIdentity === "unverified") log(`identity not checked: ${sent.json.note}`);

  console.log("");
  console.log(`Open this to see exactly what arrived:  ${sent.json.shareUrl}`);
  console.log(`Waiting for a human to decide (up to ${WAIT_SECONDS}s)…`);
  console.log("");

  const deadline = Date.now() + WAIT_SECONDS * 1000;
  let statusUrl = sent.json.statusUrl;

  while (Date.now() < deadline) {
    await sleep(2500);
    const poll = await fetch(`${APP}/api/requests/${request.id}`);

    if (poll.status === 404) {
      // The instance that held the request went away. Re-send rather than fail:
      // a request is idempotent in intent, and nothing has been spent yet.
      const again = await post(`${APP}/api/requests`, payload);
      if (again.json?.ok) {
        request = again.json.request;
        statusUrl = again.json.statusUrl;
        log("the app's instance forgot the request; re-sent it");
        console.log(`  ${again.json.shareUrl}`);
      }
      continue;
    }

    const json = await poll.json().catch(() => null);
    if (!json?.ok) continue;
    const decided = json.request;
    if (decided.status === "pending") continue;

    console.log("");
    if (decided.status === "approved" && decided.txHash) {
      return reportApproved(decided);
    }
    return reportRefused(decided);
  }

  console.log("");
  console.log(`No decision within ${WAIT_SECONDS}s. The request is still queued at ${statusUrl}`);
  console.log("The agent gives up and reports failure. Nothing was spent.");
  process.exit(1);
}

/** Never take the server's word for it: read the receipt from Monad. */
async function reportApproved(decision) {
  log(`the app reports: approved  (${decision.explorer ?? `${explorer}/tx/${decision.txHash}`})`);
  log("verifying on-chain — the queue is a notification, not a receipt…");

  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash: decision.txHash, timeout: 45_000 });
  } catch (err) {
    console.error(`Could not confirm ${decision.txHash} on-chain: ${err.message}`);
    console.error("Treating the payment as UNCONFIRMED. Check the explorer before trusting it.");
    process.exit(2);
  }

  if (receipt.status !== "success") {
    console.error(`Transaction ${decision.txHash} is on-chain but REVERTED. No money moved.`);
    process.exit(2);
  }

  console.log("");
  console.log("PAID — confirmed by the chain, not by the app.");
  console.log(`  tx        ${decision.txHash}`);
  console.log(`  block     ${receipt.blockNumber}`);
  console.log(`  explorer  ${decision.explorer ?? `${explorer}/tx/${decision.txHash}`}`);
  console.log(`  note      ${SERVICE}: ${mon(BigInt(decision.amount))} to ${decision.to}`);
  console.log("");
  console.log("The human's passkey signature is what authorized this. This process never had it.");
}

function reportRefused(decision) {
  const headline =
    decision.status === "blocked"
      ? "REFUSED — the human did not approve it."
      : "REFUSED — the contract would not allow it.";
  console.log(headline);
  if (decision.reason) console.log(`  reason    ${decision.reason}`);
  if (decision.reasonCode !== undefined && decision.reasonCode !== null) {
    console.log(`  code      ${decision.reasonCode}`);
  }
  console.log(`  asked for ${mon(BigInt(decision.amount))} to ${decision.to}`);
  console.log("");
  console.log("No transaction was written, so no fee was paid and nothing moved.");
  console.log("This is the outcome the design exists to produce: the refusal is not a");
  console.log("client-side check, it is the counterparty contract declining to spend.");
}

main().catch((err) => {
  console.error(`agent failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
