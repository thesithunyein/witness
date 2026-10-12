// Probes a Monad RPC endpoint to prove the P256 precompile at 0x0100 is live
// and actually validates signatures (not just accepting everything).
//
// Usage: node scripts/probe-p256.mjs [rpcUrl...]

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const P256 = "0x0000000000000000000000000000000000000100";
const SHA256_PC = "0x0000000000000000000000000000000000000002";

// The vectors live beside the contracts that consume them, not at the repo root.
const VECTOR = "contracts/test/vectors/AssertionVector.json";
const v = JSON.parse(readFileSync(resolve(ROOT, VECTOR), "utf8"));

const cache = new Map();
async function call(rpc, to, data) {
  const key = `${rpc}|${to}|${data}`;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const json = await res.json();
  const out = json.error ? `ERROR: ${json.error.message}` : json.result;
  cache.set(key, out);
  return out;
}

// flip one bit in r -> must be rejected
function tamper(inputHex) {
  const h = inputHex.slice(2);
  const rStart = 64;
  const firstByte = parseInt(h.slice(rStart, rStart + 2), 16) ^ 0x01;
  return (
    "0x" + h.slice(0, rStart) + firstByte.toString(16).padStart(2, "0") + h.slice(rStart + 2)
  );
}

const endpoints = process.argv.slice(2);
if (endpoints.length === 0) {
  endpoints.push(
    "https://rpc.monad.xyz",
    "https://testnet-rpc.monad.xyz",
    "https://rpc-testnet.monadinfra.com"
  );
}

// precompile success encoding is uint256(1) -> 32 bytes, i.e. 64 hex digits
const VALID = "0x" + "0".repeat(63) + "1";

for (const rpc of endpoints) {
  console.log(`\n=== ${rpc} ===`);
  try {
    const chainId = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    })
      .then((r) => r.json())
      .then((j) => j.result);
    console.log(`chainId: ${chainId} (${chainId ? parseInt(chainId, 16) : "?"})`);

    // control: sha256 precompile must work for any of this to be meaningful
    const sha = await call(rpc, SHA256_PC, "0x68656c6c6f");
    const shaExpected =
      "0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
    console.log(
      `control sha256(hello) : ${sha === shaExpected ? "PASS" : "FAIL " + sha}`
    );

    const valid = await call(rpc, P256, v.precompileInput);
    const bad = await call(rpc, P256, tamper(v.precompileInput));
    const short = await call(rpc, P256, "0x" + "ab".repeat(100));

    const ok = (r) => (typeof r === "string" && r.toLowerCase() === VALID ? "ACCEPT" : `reject (${r})`);
    console.log(`valid P-256 signature : ${ok(valid)}`);
    console.log(`tampered r (1 bit)    : ${ok(bad)}`);
    console.log(`malformed 100 bytes   : ${ok(short)}`);

    const verdict =
      valid?.toLowerCase() === VALID && bad?.toLowerCase() !== VALID
        ? "P256 PRECOMPILE LIVE AND VALIDATING"
        : valid?.toLowerCase() !== VALID
          ? "P256 PRECOMPILE NOT ACTIVE (or input shape wrong)"
          : "PRECOMPILE ACCEPTS EVERYTHING (unexpected)";
    console.log(`verdict: ${verdict}`);
  } catch (e) {
    console.log(`unreachable: ${e.message}`);
  }
}
