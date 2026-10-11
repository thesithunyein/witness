/**
 * @witness/sdk, the integration surface for third-party Monad apps.
 *
 * Witness lets a human approve one specific action with a passkey, and lets the
 * counterparty that holds the value verify that approval on-chain. This client
 * wraps the whole loop so an integrating app never has to reimplement the digest,
 * the WebAuthn ceremony, or the revert decoding:
 *
 *   createIntent            -> the human registers a permission (passkey enrolled)
 *   requestApproval         -> the human taps; the passkey signs THIS action's digest
 *   checkAuthorization      -> read-only preflight: would this action be allowed?
 *   executeAuthorizedAction -> perform it; the contract enforces or refuses
 *
 * The one thing that must not be reimplemented anywhere: the action digest. It is
 * always read from the contract (`DemoSafe.actionHash` / `nativeActionHash`), never
 * computed off-chain in parallel, so the bytes the passkey signs and the bytes the
 * contract recomputes cannot drift apart.
 *
 * This module is deliberately dependency-light: viem plus three sibling files in
 * `app/lib` (`abi.ts`, `witness.ts`, `webauthn.ts`). To vendor it into your own app,
 * copy those four files. See /integrate for the worked example.
 */

import { createPublicClient, http, keccak256, toBytes, type Address, type Hex, type PublicClient } from "viem";

import {
  REASON_MESSAGES,
  REASON_NAMES,
  TRANSFER_ACTION_TYPE,
  TRANSFER_NATIVE_ACTION_TYPE,
  demoSafeAbi,
  intentRegistryAbi,
  witnessVerifierAbi,
} from "../abi";
import { MONAD_MAINNET, MONAD_TESTNET, decodeUnauthorized, secondsLeft } from "../witness";
import { assertPasskey, enrollPasskey } from "../webauthn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors the Reason enum in contracts/src/interfaces/IWitness.sol, in order. */
export const Reason = {
  Allowed: 0,
  NoSuchIntent: 1,
  Revoked: 2,
  Expired: 3,
  AlreadyConsumed: 4,
  WrongAgent: 5,
  AgentNotRegistered: 6,
  ActionTypeMismatch: 7,
  OverLimit: 8,
  RpIdMismatch: 9,
  NoUserPresence: 10,
  NoUserVerification: 11,
  WrongType: 12,
  ChallengeMismatch: 13,
  OriginMismatch: 14,
  BadSignature: 15,
} as const;

export const NATIVE_ACTION_TYPE = TRANSFER_NATIVE_ACTION_TYPE;

export type ReasonName = (typeof REASON_NAMES)[number];

/**
 * A refusal, carrying the contract's own reason rather than a generic failure.
 * `code` is stable and safe to switch on; `message` is what a human should read.
 */
export type Rejection = {
  allowed: false;
  code: number;
  name: ReasonName | `Unknown(${number})`;
  message: string;
  /** Present when the failure came from a submission rather than a preflight. */
  detail?: string;
};

export type Authorization =
  | { allowed: true; code: typeof Reason.Allowed; name: "Allowed"; message: string }
  | Rejection;

export type WitnessContracts = {
  DemoSafe: Address;
  WitnessIntentRegistry: Address;
  WitnessVerifier: Address;
  AgentExecutor: Address;
  DemoUSD?: Address;
};

export type WitnessConfig = {
  chainId: number;
  contracts: WitnessContracts;
  /** The relying party the human's passkey was created for. Must match the deployment. */
  rpId: string;
  /** ERC-8004 identity the agent acts under. 0 means the binding is not enforced. */
  agentId?: bigint;
  explorer?: string;
};

/**
 * The minimal write capability the SDK needs. A viem `WalletClient` satisfies it,
 * and so does any object with an `account` and a `writeContract` that returns a
 * transaction hash, which keeps the SDK from forcing a specific wallet stack.
 */
export type ContractWriter = {
  account: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writeContract: (args: any) => Promise<Hex>;
};

/**
 * How the client submits state-changing calls.
 *
 *  - `wallet`  : the integrating app holds a wallet client (browser wallet, KMS).
 *  - `relayer` : a server route registers permissions and submits agent actions so
 *                a user needs no wallet and no testnet funds. The reference app uses
 *                this; the relayer pays gas and can never approve anything, because
 *                approving needs the passkey.
 */
export type WriteTransport =
  | { kind: "wallet"; writer: ContractWriter }
  | { kind: "relayer"; baseUrl?: string; fetchImpl?: typeof fetch };

export type ActionRequest = {
  intentId: bigint;
  /** `transfer` moves an ERC-20; `native` moves MON. Different action tags. */
  kind: "transfer" | "native";
  to: Address;
  amount: bigint;
};

export type EnrolledPasskey = { credentialId: string; qx: bigint; qy: bigint };

export type IntentRecord = {
  intentId: bigint;
  user: Address;
  agentWallet: Address;
  agentId: bigint;
  actionType: Hex;
  maxAmount: bigint;
  expiry: bigint;
  revoked: boolean;
  consumed: boolean;
  /** Seconds until expiry; Infinity when the permission has no expiry. */
  secondsLeft: number;
  active: boolean;
};

export type CreateIntentParams = {
  actionType?: Hex;
  maxAmount: bigint;
  /** Seconds from now. 0 means no expiry. */
  expirySeconds: number;
  policy?: Record<string, unknown>;
  passkeyLabel?: string;
  /** Reuse an existing passkey instead of enrolling a second one. */
  passkey?: EnrolledPasskey;
};

export type CreateIntentResult = {
  intentId: bigint;
  txHash?: Hex;
  passkey: EnrolledPasskey;
};

export type ExecuteResult = { allowed: true; txHash: Hex; explorer?: string } | Rejection;

export class WitnessError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "WitnessError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class WitnessClient {
  readonly config: WitnessConfig;
  readonly publicClient: PublicClient;

  private transport: WriteTransport;
  private f: typeof fetch;

  constructor(config: WitnessConfig, transport: WriteTransport) {
    this.config = config;
    this.transport = transport;
    this.f = transport.kind === "relayer" ? (transport.fetchImpl ?? fetch) : fetch;
    this.publicClient = createPublicClient({
      chain: config.chainId === 143 ? MONAD_MAINNET : MONAD_TESTNET,
      transport: http(),
    }) as PublicClient;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** The exact digest a human must sign. Always read from the contract. */
  async actionDigest(request: Omit<ActionRequest, "kind"> & { kind: "transfer" | "native" }): Promise<Hex> {
    const { intentId, kind, to, amount } = request;
    return (await this.publicClient.readContract({
      address: this.config.contracts.DemoSafe,
      abi: demoSafeAbi,
      functionName: kind === "native" ? "nativeActionHash" : "actionHash",
      args: [intentId, to, amount],
    })) as Hex;
  }

  async getIntent(intentId: bigint): Promise<IntentRecord> {
    const it = (await this.publicClient.readContract({
      address: this.config.contracts.WitnessIntentRegistry,
      abi: intentRegistryAbi,
      functionName: "getIntent",
      args: [intentId],
    })) as {
      user: Address;
      agentWallet: Address;
      agentId: bigint;
      actionType: Hex;
      maxAmount: bigint;
      expiry: bigint;
      revoked: boolean;
      consumed: boolean;
    };

    const left = secondsLeft(it.expiry);
    return {
      intentId,
      user: it.user,
      agentWallet: it.agentWallet,
      agentId: it.agentId,
      actionType: it.actionType,
      maxAmount: it.maxAmount,
      expiry: it.expiry,
      revoked: it.revoked,
      consumed: it.consumed,
      secondsLeft: left,
      active: !it.revoked && !it.consumed && left > 0,
    };
  }

  /**
   * Preflight. Answers "would this exact action be allowed right now, and if not,
   * why" without spending anything.
   *
   * Pass the real assertion to get a full answer including the signature check.
   * Without one the semantic checks still report honestly (expiry, cap, agent,
   * revocation) and the signature check is the only thing that comes back negative,
   * which is exactly the "is this permission still usable" question a UI asks.
   */
  async checkAuthorization(
    request: ActionRequest,
    options: { assertion?: EnrolledPasskey & { authenticatorData: Hex; clientDataJSON: Hex; r: bigint; s: bigint }; actor?: Address } = {}
  ): Promise<Authorization> {
    const digest = await this.actionDigest(request);
    const actor = options.actor ?? this.config.contracts.AgentExecutor;
    const a = options.assertion;

    const code = (await this.publicClient.readContract({
      address: this.config.contracts.WitnessVerifier,
      abi: witnessVerifierAbi,
      functionName: "check",
      args: [
        request.intentId,
        request.kind === "native" ? NATIVE_ACTION_TYPE : TRANSFER_ACTION_TYPE,
        digest,
        request.amount,
        actor,
        {
          authenticatorData: a?.authenticatorData ?? "0x",
          clientDataJSON: a?.clientDataJSON ?? "0x",
          r: a?.r ?? 0n,
          s: a?.s ?? 0n,
        },
      ],
    })) as number;

    return toAuthorization(Number(code));
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Register a permission. Enrollment happens first, because the passkey's public
   * key IS the authority the permission names, P-256 supports no public key
   * recovery, so a permission without an enrolled key could never be satisfied.
   */
  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    const passkey =
      params.passkey ?? (await enrollPasskey(this.config.rpId, params.passkeyLabel ?? "Witness human"));
    const expiry = BigInt(Math.floor(Date.now() / 1000) + params.expirySeconds);
    const actionType = params.actionType ?? TRANSFER_ACTION_TYPE;

    if (this.transport.kind === "relayer") {
      const res = await this.f(`${this.transport.baseUrl ?? ""}/api/intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          agentWallet: this.config.contracts.AgentExecutor,
          agentId: (this.config.agentId ?? 0n).toString(),
          actionType,
          maxAmount: params.maxAmount.toString(),
          expiry: expiry.toString(),
          policy: params.policy ?? null,
          credentialId: passkey.credentialId,
          qx: passkey.qx.toString(),
          qy: passkey.qy.toString(),
        }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        intentId?: string;
        txHash?: Hex;
        error?: string;
      };
      if (!j.ok) throw new WitnessError(j.error ?? "could not register the permission");

      return {
        intentId: j.intentId ? BigInt(j.intentId) : await this.latestIntentId(),
        txHash: j.txHash,
        passkey,
      };
    }

    const { writer } = this.transport;
    const txHash = await writer.writeContract({
      account: writer.account,
      address: this.config.contracts.WitnessIntentRegistry,
      abi: intentRegistryAbi,
      functionName: "createIntent",
      args: [
        this.config.contracts.AgentExecutor,
        this.config.agentId ?? 0n,
        actionType,
        params.maxAmount,
        expiry,
        keccak256(toBytes(JSON.stringify({ v: 1, ...(params.policy ?? {}) }))),
        keccak256(toBytes(passkey.credentialId)),
        passkey.qx,
        passkey.qy,
      ],
    });

    return { intentId: await this.latestIntentId(), txHash, passkey };
  }

  /** The newest registered permission id. */
  async latestIntentId(): Promise<bigint> {
    const next = (await this.publicClient.readContract({
      address: this.config.contracts.WitnessIntentRegistry,
      abi: intentRegistryAbi,
      functionName: "nextIntentId",
    })) as bigint;
    return next - 1n;
  }

  /**
   * Ask the human to approve this exact action. The challenge is the on-chain
   * digest, so the signature the human produces covers the recipient, the amount,
   * the asset, this contract and this chain, nothing less.
   */
  async requestApproval(request: ActionRequest) {
    const digest = await this.actionDigest(request);
    return assertPasskey(this.config.rpId, digest);
  }

  /**
   * Perform the action. The counterparty contract re-derives the digest and runs
   * every check; a refusal comes back as a typed Reason, not a generic failure.
   */
  async executeAuthorizedAction(
    request: ActionRequest,
    assertion: { authenticatorData: Hex; clientDataJSON: Hex; r: bigint; s: bigint }
  ): Promise<ExecuteResult> {
    const digest = await this.actionDigest(request);

    try {
      if (this.transport.kind === "relayer") {
        const res = await this.f(`${this.transport.baseUrl ?? ""}/api/agent`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intentId: request.intentId.toString(),
            kind: request.kind,
            to: request.to,
            amount: request.amount.toString(),
            assertion: {
              authenticatorData: assertion.authenticatorData,
              clientDataJSON: assertion.clientDataJSON,
              r: assertion.r.toString(),
              s: assertion.s.toString(),
            },
          }),
        });
        const j = (await res.json()) as {
          ok: boolean;
          txHash?: Hex;
          reason?: string;
          reasonCode?: number | null;
          detail?: string;
          explorer?: string;
          error?: string;
        };

        if (j.ok && j.txHash) {
          return { allowed: true, txHash: j.txHash, explorer: j.explorer };
        }
        if (typeof j.reasonCode === "number") {
          return toRejection(j.reasonCode, j.detail ?? j.reason);
        }
        return {
          allowed: false,
          code: -1,
          name: "Unknown(-1)",
          message: j.error ?? "the relayer could not submit this action",
          detail: j.detail,
        };
      }

      const { writer } = this.transport;
      const txHash = await writer.writeContract({
        account: writer.account,
        address: this.config.contracts.DemoSafe,
        abi: demoSafeAbi,
        functionName: request.kind === "native" ? "executeNative" : "execute",
        args: [
          request.intentId,
          digest,
          request.to,
          request.amount,
          {
            authenticatorData: assertion.authenticatorData,
            clientDataJSON: assertion.clientDataJSON,
            r: assertion.r,
            s: assertion.s,
          },
        ],
      });

      return {
        allowed: true,
        txHash,
        explorer: this.config.explorer ? `${this.config.explorer}/tx/${txHash}` : undefined,
      };
    } catch (err) {
      // The contract already decided why. Surface its reason, never a bare failure.
      const decoded = decodeUnauthorized(err);
      if (decoded) return toRejection(decoded.reason, firstLine(err));
      throw err;
    }
  }

  /** Withdraw a permission. Only the intent's own author can do this. */
  async revokeIntent(intentId: bigint): Promise<Hex> {
    if (this.transport.kind === "relayer") {
      const res = await this.f(`${this.transport.baseUrl ?? ""}/api/intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke", intentId: intentId.toString() }),
      });
      const j = (await res.json()) as { ok: boolean; txHash?: Hex; error?: string };
      if (!j.ok || !j.txHash) throw new WitnessError(j.error ?? "revoke failed");
      return j.txHash;
    }

    const { writer } = this.transport;
    return writer.writeContract({
      account: writer.account,
      address: this.config.contracts.WitnessIntentRegistry,
      abi: intentRegistryAbi,
      functionName: "revokeIntent",
      args: [intentId],
    });
  }

  /** Whether this browser can produce an approval at all. */
  async passkeyAvailable(): Promise<boolean> {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a Reason code to a result an integrating app can render directly. */
export function toAuthorization(code: number, detail?: string): Authorization {
  const name = (REASON_NAMES[code] ?? `Unknown(${code})`) as ReasonName;
  if (code === Reason.Allowed) {
    return {
      allowed: true,
      code: Reason.Allowed,
      name: "Allowed",
      message: REASON_MESSAGES.Allowed,
    };
  }
  return {
    allowed: false,
    code,
    name,
    message: REASON_MESSAGES[name] ?? "The action was refused.",
    detail,
  };
}

/**
 * Narrow a Reason code to a refusal for submission paths.
 *
 * A submission that reports "Allowed" but produced no transaction hash is an
 * inconsistency, not a success, so it is reported as a refusal rather than
 * handing the caller a success object with nothing in it.
 */
export function toRejection(code: number, detail?: string): Rejection {
  const auth = toAuthorization(code, detail);
  if (auth.allowed) {
    return {
      allowed: false,
      code: -1,
      name: "Unknown(-1)",
      message: "the action reported success without a transaction hash",
      detail,
    };
  }
  return auth;
}

function firstLine(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.split("\n")[0].slice(0, 300);
}

export { demoSafeAbi, intentRegistryAbi, REASON_MESSAGES, REASON_NAMES, TRANSFER_ACTION_TYPE };
export type { Assertion as PasskeyAssertion } from "../webauthn";
