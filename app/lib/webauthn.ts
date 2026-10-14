/**
 * Browser passkey (WebAuthn) helpers for Witness.
 *
 * Two things here are easy to get wrong and both would break the protocol:
 *
 * 1. Public key extraction. P-256 signatures support no public key recovery, so the
 *    enrolled key must be captured at registration. We take the DER SPKI blob from
 *    `getPublicKey()` and slice the uncompressed point out of it, which avoids a
 *    CBOR parser entirely. The P-256 SPKI layout is fixed: the final 65 bytes are
 *    `0x04 || x(32) || y(32)`.
 *
 * 2. Signature encoding. WebAuthn returns ECDSA signatures DER-encoded, while
 *    Monad's precompile wants compact `r || s`. The conversion must strip DER's
 *    leading zero padding and left-pad back to exactly 32 bytes each.
 */

export type EnrolledPasskey = {
  credentialId: string;
  qx: bigint;
  qy: bigint;
};

export type Assertion = {
  authenticatorData: `0x${string}`;
  clientDataJSON: `0x${string}`;
  r: bigint;
  s: bigint;
};

const b64urlToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToHex = (b: Uint8Array): `0x${string}` =>
  ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`;

const bytesToB64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const bytesToBigInt = (b: Uint8Array): bigint =>
  BigInt("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));

/**
 * WebAuthn requires the challenge as bytes. We pass the canonical action digest
 * directly, so the signature covers exactly the action being authorized.
 */
const hexToBytes = (hex: `0x${string}`): Uint8Array<ArrayBuffer> => {
  const h = hex.slice(2);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export async function enrollPasskey(rpId: string, label = "Witness human"): Promise<EnrolledPasskey> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new Error("This browser does not support WebAuthn passkeys.");
  }

  const cred = (await navigator.credentials.create({
    publicKey: {
      // Registration challenge is not security-critical in the same way as an
      // assertion: no funds move here, and the enrolled key is bound to the
      // human's account by the transaction that stores it.
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: rpId, name: "Witness" },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: label,
        displayName: label,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 / P-256
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("Passkey creation was cancelled.");

  const resp = cred.response as AuthenticatorAttestationResponse;
  if (typeof resp.getPublicKey !== "function") {
    throw new Error(
      "This browser cannot expose the passkey public key (getPublicKey unsupported). Try Chrome, Edge, or Safari."
    );
  }

  const spki = new Uint8Array(resp.getPublicKey()!);
  // P-256 SPKI ends with the uncompressed point: 0x04 || x || y
  const point = spki.slice(spki.length - 65);
  if (point[0] !== 0x04) {
    throw new Error("Unexpected public key format; expected an uncompressed P-256 point.");
  }

  return {
    credentialId: cred.id,
    qx: bytesToBigInt(point.slice(1, 33)),
    qy: bytesToBigInt(point.slice(33, 65)),
  };
}

export async function assertPasskey(
  rpId: string,
  actionHash: `0x${string}`,
  credentialId?: string
): Promise<Assertion> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: hexToBytes(actionHash),
    rpId,
    userVerification: "required",
    timeout: 60_000,
  };

  // Pin the credential the permission names. Without this, the platform may answer
  // with any passkey it holds for this rpId, and a stale one from an earlier
  // enrollment produces a signature the contract refuses as BadSignature, which
  // reads to the human as "there was no approval" for an approval they just gave.
  if (credentialId) {
    publicKey.allowCredentials = [{ type: "public-key", id: b64urlToBytes(credentialId) }];
  }

  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;

  if (!cred) throw new Error("Passkey approval was cancelled.");

  const resp = cred.response as AuthenticatorAssertionResponse;
  const { r, s } = derToRaw(new Uint8Array(resp.signature));

  return {
    authenticatorData: bytesToHex(new Uint8Array(resp.authenticatorData)),
    clientDataJSON: bytesToHex(new Uint8Array(resp.clientDataJSON)),
    r,
    s,
  };
}

/**
 * Convert a DER-encoded ECDSA signature to r/s integers.
 *
 * DER: 0x30 <len> 0x02 <lenR> <r> 0x02 <lenS> <s>
 * Integers are signed, so a value whose high bit is set carries a leading 0x00
 * that must be removed and then re-padded to 32 bytes for the precompile.
 */
export function derToRaw(der: Uint8Array): { r: bigint; s: bigint } {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("DER: expected SEQUENCE");
  let len = der[i++];
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | der[i++];
  }
  if (der[i++] !== 0x02) throw new Error("DER: expected INTEGER (r)");
  const rLen = der[i++];
  const rBytes = der.slice(i, i + rLen);
  i += rLen;
  if (der[i++] !== 0x02) throw new Error("DER: expected INTEGER (s)");
  const sLen = der[i++];
  const sBytes = der.slice(i, i + sLen);
  return { r: bytesToBigInt(stripLeadingZero(rBytes)), s: bytesToBigInt(stripLeadingZero(sBytes)) };
}

const stripLeadingZero = (b: Uint8Array): Uint8Array =>
  b.length > 1 && b[0] === 0x00 ? stripLeadingZero(b.slice(1)) : b;

/**
 * Whether this page can produce an approval the deployed verifier will accept.
 *
 * Two independent gates must pass, and they fail differently:
 *
 *   1. The browser. WebAuthn only issues a passkey for the page's own domain or
 *      a parent of it. Ask for any other `rpId` and `navigator.credentials.*`
 *      throws a SecurityError before a prompt is ever drawn.
 *   2. The contract. `WitnessVerifier` stores the accepted `rpId` and `origin`
 *      from deploy time and compares them against the assertion. Deployment
 *      calls `lockConfiguration()`, so they can never be changed: a page on any
 *      other origin is refused on-chain with OriginMismatch, even if the browser
 *      did hand over an assertion.
 *
 * So serving this same app from a second hostname is not cosmetic. The passkey
 * flow works on exactly one origin, the one the contracts were deployed with.
 * This function exists so the app states that plainly instead of failing with a
 * raw DOMException that reads like a bug in the app.
 */
export function passkeyOriginFits(
  rpId: string,
  origin: string
): { ok: boolean; problem: string | null } {
  // Server render, or a build with no window: nothing to compare yet.
  if (typeof window === "undefined") return { ok: true, problem: null };

  const here = window.location.host;
  if (here !== rpId && !here.endsWith(`.${rpId}`)) {
    return {
      ok: false,
      problem:
        `A browser only issues a passkey for its own domain, and this page is on ${here}. ` +
        `The passkey is bound to ${rpId}, so no prompt can appear here.`,
    };
  }

  if (window.location.origin !== origin) {
    return {
      ok: false,
      problem:
        `The deployed verifier only accepts assertions signed from ${origin}, ` +
        `and this page is on ${window.location.origin}.`,
    };
  }

  return { ok: true, problem: null };
}

/** Whether the passkey platform is usable here at all. */
export async function passkeyAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export { bytesToB64url, b64urlToBytes };
