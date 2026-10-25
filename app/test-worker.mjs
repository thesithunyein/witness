#!/usr/bin/env bun
/**
 * Exercises the Worker's handlers directly under bun, including real testnet
 * transactions, before any deploy. This is the fast feedback loop; the
 * deployed preview (workerd) is the authoritative check.
 *
 *   cd app && bun run test-worker.mjs
 *
 * Reads keys from the gitignored repo .env (../.env). Never prints them.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = import.meta.dir;

const fileEnv = {};
const envPath = resolve(appRoot, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) fileEnv[m[1]] = m[2].trim();
  }
}

const key = fileEnv.DEPLOYER_PRIVATE_KEY;
if (!key) {
  console.error("DEPLOYER_PRIVATE_KEY missing from ../.env, cannot run write tests.");
  process.exit(1);
}

const worker = (await import("./worker/index.ts")).default;

const env = {
  // The executor's operator is the deployer (AgentExecutor constructor arg).
  WITNESS_OPERATOR_PRIVATE_KEY: key,
  WITNESS_RELAYER_PRIVATE_KEY: key,
  ASSETS: {
    async fetch() {
      return new Response("asset fallback", { status: 200 });
    },
  },
};

const call = (path, init) => worker.fetch(new Request(`http://local${path}`, init), env);
const post = (path, body) =>
  call(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let failures = 0;
const check = (name, cond, detail) => {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` , ${detail}` : ""}`);
};

// 1. health
const health = await (await call("/healthz")).json();
check("healthz answers with the deployed chain", health.chainId === 10143, JSON.stringify(health.contracts));

// 2. config
const config = await (await call("/api/config")).json();
check("config serves rpId/origin from the manifest", !!config.rpId && !!config.origin, `${config.rpId} / ${config.origin}`);
check("config exposes all five contracts", Object.keys(config.contracts ?? {}).length === 5);

// 3. static fallback
const asset = await call("/");
check("non-api routes fall through to assets", asset.status === 200);

// 3b. the app path serves the same shell (the bundle routes on pathname)
const appShell = await call("/app");
check("/app serves the static shell", appShell.status === 200);

// 3c. the agent share link points at the app path
const shareReq = await (
  await post("/api/requests", {
    intentId: "1",
    kind: "transfer",
    to: "0x000000000000000000000000000000000000dEaD",
    amount: "1",
    service: "worker share-url shape check",
    agentId: "0",
    agentName: "test-agent",
  })
).json();
check(
  "agent share URL points at /app",
  typeof shareReq.shareUrl === "string" && shareReq.shareUrl.includes("/app?req="),
  shareReq.error ?? shareReq.shareUrl
);

// 4. create intent (real tx)
const createRes = await (
  await post("/api/intent", {
    action: "create",
    agentWallet: config.contracts.AgentExecutor,
    agentId: "0",
    maxAmount: "1",
    // Absolute unix seconds, matching /api/intent (and the SDK, which does this
    // conversion itself). A relative value here is rejected with a 400.
    expiry: String(Math.floor(Date.now() / 1000) + 600),
    // Not a usable P-256 point on purpose: registration stores it; verification
    // is what tests the key, and the rejection paths below do that.
    qx: "1",
    qy: "2",
    credentialId: `harness-${Date.now()}`,
  })
).json();
check("createIntent is relayed successfully", createRes.ok === true, createRes.error ?? createRes.txHash);

if (!createRes.ok) {
  console.log("\nCannot continue without an intent.");
  process.exit(1);
}

const { publicClient } = await import("./lib/witness.ts");
const { intentRegistryAbi } = await import("./lib/abi.ts");
const pc = publicClient(config.chainId);
const next = await pc.readContract({
  address: config.contracts.WitnessIntentRegistry,
  abi: intentRegistryAbi,
  functionName: "nextIntentId",
});
const intentId = (next - 1n).toString();

// 5. injection: 10x the approved amount, no assertion -> OverLimit
const inject = await (
  await post("/api/agent", {
    intentId,
    to: "0xdead00000000000000000000000000000000dead",
    amount: "10",
    assertion: null,
  })
).json();
check("injected 10x transfer is refused with OverLimit", inject.ok === false && inject.reason === "OverLimit", `reason=${inject.reason}`);

// 6. no approval at all, within limit -> signature/rp checks refuse
const noAssertion = await (
  await post("/api/agent", {
    intentId,
    to: "0x1111111111111111111111111111111111111111",
    amount: "1",
    assertion: null,
  })
).json();
check(
  "unapproved in-limit transfer is refused before the signature check",
  noAssertion.ok === false && noAssertion.reason === "RpIdMismatch",
  `reason=${noAssertion.reason}`
);

// 7. revoke, then re-attempt
const revoke = await (await post("/api/intent", { action: "revoke", intentId })).json();
check("revoke is relayed successfully", revoke.ok === true, revoke.error ?? revoke.txHash);

const afterRevoke = await (
  await post("/api/agent", {
    intentId,
    to: "0x1111111111111111111111111111111111111111",
    amount: "1",
    assertion: null,
  })
).json();
check("revoked intent is refused with Revoked", afterRevoke.reason === "Revoked", `reason=${afterRevoke.reason}`);

console.log(failures === 0 ? "\nAll local worker checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
