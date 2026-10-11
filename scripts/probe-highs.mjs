// Does Monad's 0x0100 precompile accept high-S P-256 signatures?
//
// This matters far more than it looks. Platform authenticators (Secure Enclave,
// Android Keystore) are not guaranteed to normalise S into the lower half of the
// curve order, so roughly half of all real WebAuthn signatures can have s > n/2.
// If the precompile rejected those, a live passkey demo would fail intermittently
// at random — the worst possible failure mode for a judged demo.
//
// Method: take a known-good low-S signature, derive the equally-valid high-S form
// (s' = n - s), and ask the real chain about both.
//
// Usage: node scripts/probe-highs.mjs [rpcUrl]

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const P256 = "0x0000000000000000000000000000000000000100";
const RPC = process.argv[2] || "https://testnet-rpc.monad.xyz";

// P-256 group order
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const HALF_N = N / 2n;

const v = JSON.parse(
  readFileSync(resolve(ROOT, "contracts/test/vectors/AssertionVector.json"), "utf8")
);

const sha256 = (b) => createHash("sha256").update(b).digest();
const pad32 = (big) => big.toString(16).padStart(64, "0");

const r = BigInt(v.r);
const s = BigInt(v.s);
const qx = BigInt(v.qx);
const qy = BigInt(v.qy);

const sIsLow = s <= HALF_N;
const sOther = N - s; // equally valid signature, opposite S parity

console.log(`chain order n : 0x${N.toString(16)}`);
console.log(`n/2           : 0x${HALF_N.toString(16)}`);
console.log(`r             : 0x${r.toString(16)}`);
console.log(`s             : 0x${s.toString(16)}  (${sIsLow ? "LOW" : "HIGH"})`);
console.log(`alternate s   : 0x${sOther.toString(16)}  (${sOther <= HALF_N ? "LOW" : "HIGH"})`);

// Recompute the signed digest from the fixture so the probe is self-contained.
const authData = Buffer.from(v.authenticatorData.slice(2), "hex");
const clientDataJSON = Buffer.from(v.clientDataJSON, "utf8");
const digest = sha256(Buffer.concat([authData, sha256(clientDataJSON)]));

function input(rHex, sHex) {
  return "0x" + digest.toString("hex") + rHex + sHex + pad32(qx) + pad32(qy);
}

async function call(data) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: P256, data }, "latest"],
    }),
  });
  const j = await res.json();
  return j.error ? `ERROR ${j.error.message}` : j.result;
}

const SUCCESS = "0x" + "0".repeat(63) + "1";

const lowSig = input(pad32(r), pad32(sIsLow ? s : sOther));
const highSig = input(pad32(r), pad32(sIsLow ? sOther : s));

const [lowOut, highOut] = await Promise.all([call(lowSig), call(highSig)]);

console.log(`\nrpc: ${RPC}`);
console.log(`low-S  signature : ${lowOut === SUCCESS ? "ACCEPT" : `reject (${lowOut})`}`);
console.log(`high-S signature : ${highOut === SUCCESS ? "ACCEPT" : `reject (${highOut})`}`);
console.log(
  highOut === SUCCESS
    ? "\nverdict: precompile accepts BOTH S forms -> platform authenticators work regardless of normalisation"
    : "\nverdict: high-S REJECTED -> the client MUST normalise S (s > n/2 ? n - s) before submitting"
);
