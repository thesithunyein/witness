/**
 * Browser side of the real ceremony.
 *
 * Two halves, both genuine WebAuthn:
 *   enroll()  asks the platform authenticator for a passkey and reads its P-256
 *             public key out of the attestation, because the registry stores the
 *             key the human enrolled rather than trusting one supplied per call.
 *   assert()  asks that same passkey to sign the action digest the console
 *             receives from the contract, and returns the four fields the
 *             verifier checks.
 *
 * Nothing here falls back to a software key. If the browser has no authenticator,
 * the flow fails loudly instead of inventing a signature.
 */

import { keccak256, toHex } from 'viem';

export type EnrolledPasskey = {
  credentialId: string;
  qx: bigint;
  qy: bigint;
  credentialHash: `0x${string}`;
  rpId: string;
};

export type Assertion = {
  authenticatorData: `0x${string}`;
  clientDataJSON: `0x${string}`;
  r: bigint;
  s: bigint;
};

const toB64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromB64url = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const hex = (bytes: Uint8Array): `0x${string}` =>
  `0x${bytes.reduce((acc, b) => acc + b.toString(16).padStart(2, '0'), '')}` as `0x${string}`;

/* ---------------------------------------------------------------------------
 * Minimal CBOR reader. Only what an attestation object needs: a map whose
 * "authData" entry is a byte string, and the COSE key map nested inside it.
 * ------------------------------------------------------------------------- */

type Cbor = { value: unknown; next: number };

function readCbor(buf: Uint8Array, at: number): Cbor {
  const first = buf[at];
  const major = first >> 5;
  const info = first & 0x1f;
  let offset = at + 1;
  let length = info;

  if (info === 24) {
    length = buf[offset];
    offset += 1;
  } else if (info === 25) {
    length = (buf[offset] << 8) | buf[offset + 1];
    offset += 2;
  } else if (info === 26) {
    length =
      (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
    offset += 4;
  } else if (info === 31) {
    throw new Error('indefinite length CBOR is not supported here');
  }

  if (major === 0) return { value: length, next: offset };
  if (major === 1) return { value: -1 - length, next: offset };

  if (major === 2) {
    return { value: buf.slice(offset, offset + length), next: offset + length };
  }
  if (major === 3) {
    const text = new TextDecoder().decode(buf.slice(offset, offset + length));
    return { value: text, next: offset + length };
  }
  if (major === 4) {
    const out: unknown[] = [];
    let cursor = offset;
    for (let i = 0; i < length; i += 1) {
      const item = readCbor(buf, cursor);
      out.push(item.value);
      cursor = item.next;
    }
    return { value: out, next: cursor };
  }
  if (major === 5) {
    const out: Record<string, unknown> = {};
    let cursor = offset;
    for (let i = 0; i < length; i += 1) {
      const key = readCbor(buf, cursor);
      const val = readCbor(buf, key.next);
      out[String(key.value)] = val.value;
      cursor = val.next;
    }
    return { value: out, next: cursor };
  }
  if (major === 7) {
    return { value: null, next: offset };
  }
  throw new Error(`unsupported CBOR major type ${major}`);
}

/** authData: rpIdHash(32) flags(1) counter(4) aaguid(16) len(2) id(n) COSE key. */
function publicKeyFromAuthData(authData: Uint8Array) {
  const credentialIdLength = (authData[53] << 8) | authData[54];
  const credentialId = authData.slice(55, 55 + credentialIdLength);
  const cose = readCbor(authData, 55 + credentialIdLength).value as Record<string, unknown>;

  const x = cose['-2'];
  const y = cose['-3'];
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
    throw new Error('the authenticator returned no P-256 public key');
  }
  const toBigInt = (bytes: Uint8Array) => BigInt(hex(bytes));
  return {
    credentialId,
    qx: toBigInt(x),
    qy: toBigInt(y),
  };
}

/* ---------------------------------------------------------------------------
 * DER signature -> r, s
 * ------------------------------------------------------------------------- */

function derToRS(signature: Uint8Array) {
  if (signature[0] !== 0x30) throw new Error('assertion signature is not DER');
  let offset = 2;
  if (signature[1] & 0x80) offset += signature[1] & 0x7f;

  if (signature[offset] !== 0x02) throw new Error('malformed DER integer');
  const rLength = signature[offset + 1];
  const rBytes = signature.slice(offset + 2, offset + 2 + rLength);
  offset += 2 + rLength;

  if (signature[offset] !== 0x02) throw new Error('malformed DER integer');
  const sLength = signature[offset + 1];
  const sBytes = signature.slice(offset + 2, offset + 2 + sLength);

  return { r: BigInt(hex(rBytes)), s: BigInt(hex(sBytes)) };
}

/* ---------------------------------------------------------------------------
 * The ceremony
 * ------------------------------------------------------------------------- */

export async function enrollPasskey(label: string): Promise<EnrolledPasskey> {
  if (!window.PublicKeyCredential) {
    throw new Error('this browser has no WebAuthn support, so no passkey can be enrolled');
  }
  const rpId = window.location.hostname;
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId, name: 'Witness' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: label,
        displayName: label,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('the passkey prompt was dismissed');

  const response = credential.response as AuthenticatorAttestationResponse;
  const attestation = readCbor(new Uint8Array(response.attestationObject), 0).value as Record<
    string,
    unknown
  >;
  const authData = attestation['authData'];
  if (!(authData instanceof Uint8Array)) throw new Error('attestation carried no authenticator data');

  const { credentialId, qx, qy } = publicKeyFromAuthData(authData);

  return {
    credentialId: toB64url(new Uint8Array(credential.rawId)),
    qx,
    qy,
    credentialHash: keccak256(toHex(credentialId)),
    rpId,
  };
}

export async function assertDigest(
  digest: `0x${string}`,
  credentialId: string
): Promise<Assertion> {
  // The challenge is the digest itself: the browser base64url-encodes these bytes
  // into clientDataJSON, and the contract compares that against base64url(digest).
  const challenge = hexToBytes(digest);
  const rawId = fromB64url(credentialId);

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [{ type: 'public-key', id: rawId }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error('the passkey prompt was dismissed');

  const response = assertion.response as AuthenticatorAssertionResponse;
  const { r, s } = derToRS(new Uint8Array(response.signature));

  return {
    authenticatorData: hex(new Uint8Array(response.authenticatorData)),
    clientDataJSON: hex(new Uint8Array(response.clientDataJSON)),
    r,
    s,
  };
}

function hexToBytes(value: `0x${string}`) {
  const clean = value.slice(2);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
