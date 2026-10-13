// Signs an arbitrary action digest the way a platform authenticator would, so
// Foundry tests can exercise the REAL protocol path (real digest, real P-256
// signature, real 0x0100 precompile) instead of mocking the crypto.
//
// Usage:
//   node scripts/sign-action.mjs <challengeHex> [options]
//
// Options (all optional, defaults match the test relying party):
//   --rpId=<string>     relying party id           (default: the manifest's rpId)
//   --origin=<string>   full origin                (default: the manifest's origin)
//   --key=<seed>        key derivation seed; a different seed = a different
//                       passkey, which must be REJECTED against an enrolled key
//   --type=<string>     clientData type            (default: webauthn.get)
//   --flags=<int>       authenticator flags byte   (default: 5 = UP|UV)
//
// Output: six lines of 0x-hex, in this exact order:
//   1 authenticatorData  2 clientDataJSON  3 r  4 s  5 qx  6 qy
//
// Line-oriented output is deliberate: parsing six lines in Solidity is trivial and
// avoids depending on a specific forge-std JSON cheatcode API.

import { p256 } from "@noble/curves/nist.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const challengeHex = args[0];
if (!challengeHex) {
  console.error("usage: sign-action.mjs <challengeHex> [--rpId=..] [--origin=..] [--key=..]");
  process.exit(1);
}

function opt(name, fallback) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

// The default relying party comes from the deployment manifest rather than from
// this file, because the Foundry suite shells out to this script with no options
// at all. A hard-coded default that disagrees with the deployed rpId/origin makes
// every assertion fail `RpIdMismatch`, which tests the signer's defaults instead
// of the contracts. RP_ID/ORIGIN in the environment override, and so do --rpId
// and --origin.
const CHAIN_ID = process.env.WITNESS_CHAIN_ID ?? "10143";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "contracts", "deployments", `${CHAIN_ID}.json`), "utf8")
);

const rpId = opt("rpId", process.env.RP_ID ?? manifest.rpId);
const origin = opt("origin", process.env.ORIGIN ?? manifest.origin);
const keySeed = opt("key", "witness:test:key:1");
const type = opt("type", "webauthn.get");
const flags = parseInt(opt("flags", "5"), 10);

const sha256 = (b) => createHash("sha256").update(b).digest();
const fromHex = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");
const hex = (b) => "0x" + Buffer.from(b).toString("hex");

const challenge = fromHex(challengeHex);
if (challenge.length !== 32) {
  console.error(`challenge must be 32 bytes, got ${challenge.length}`);
  process.exit(1);
}

// Deterministic identity derived from the seed, so a test can produce either the
// enrolled passkey or a different one (the "agent signs with its own key" case).
const priv = sha256(Buffer.from(keySeed));
const pub = p256.getPublicKey(priv, false); // 0x04 || x || y
const qx = pub.subarray(1, 33);
const qy = pub.subarray(33, 65);

// authenticatorData = rpIdHash(32) || flags(1) || signCount(4)
const authenticatorData = Buffer.concat([
  sha256(Buffer.from(rpId)),
  Buffer.from([flags]),
  Buffer.from([0, 0, 0, 1]),
]);

// Field order here matches what browsers emit for the fields we read.
const clientDataJSON = Buffer.from(
  JSON.stringify({
    type,
    challenge: challenge.toString("base64url"),
    origin,
  }),
  "utf8"
);

const messageHash = sha256(
  Buffer.concat([authenticatorData, sha256(clientDataJSON)])
);

// prehash:false -> sign the digest directly, exactly like a real authenticator.
const compact = p256.sign(messageHash, priv, { prehash: false });
if (compact.length !== 64) throw new Error(`bad signature length ${compact.length}`);

console.log(hex(authenticatorData));
console.log(hex(clientDataJSON));
console.log(hex(compact.subarray(0, 32)));
console.log(hex(compact.subarray(32, 64)));
console.log(hex(qx));
console.log(hex(qy));
