/**
 * Browser client for the relayer. Same origin, POST only, no secrets here.
 */

export type RelayerStatus = {
  configured: boolean;
  chainId: number;
  chainName: string;
  rpId: string;
  origin: string;
  explorer: string;
  addresses: {
    registry?: string;
    executor?: string;
    safe?: string;
    token?: string;
  };
  nextIntentId: number | null;
  safeBalance: string | null;
  operator: string | null;
  executorOperator: string | null;
  reason: string | null;
};

export type ChainIntent = {
  id: number;
  user: string;
  agentWallet: string;
  agentId: number;
  maxAmount: string;
  expiry: number;
  createdAt: number;
  revoked: boolean;
  consumed: boolean;
  expired: boolean;
  state: 'active' | 'consumed' | 'revoked' | 'expired';
};

export type AttemptResult = {
  ok: boolean;
  txHash?: string;
  status?: string;
  reason?: string;
  code?: number | null;
};

export type ReseatResult = {
  revoked: { intentId: number; txHash?: string; ok: boolean; error?: string }[];
  skipped: number[];
  created: { intentId: number | null; txHash: string; maxAmount: string }[];
};

type Reply<T> = { ok: boolean; error?: string } & T;

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<Reply<T>> {
  const res = await fetch('/api/relayer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action, ...payload }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(body.error ?? `relayer returned ${res.status}`));
  }
  return body as Reply<T>;
}

export const relayer = {
  status: () => call<{ status: RelayerStatus }>('status'),
  list: (limit = 24) => call<{ intents: ChainIntent[] }>('list', { limit }),

  create: (input: {
    qx: string;
    qy: string;
    credentialHash: string;
    maxAmount: string;
    expirySeconds?: number;
  }) => call<{ intentId: number | null; txHash: string }>('create', input),

  digest: (input: { intentId: number; to: string; amount: string }) =>
    call<{ digest: `0x${string}`; intentId: number; to: string; amount: string }>(
      'digest',
      input
    ),

  execute: (input: {
    intentId: number;
    to: string;
    amount: string;
    assertion?: {
      authenticatorData: string;
      clientDataJSON: string;
      r: string;
      s: string;
    };
  }) => call<{ result: AttemptResult }>('execute', input),

  revoke: (intentId: number) => call<{ result: { ok: boolean; txHash: string } }>('revoke', { intentId }),

  /** Adjust the policy: revoke the standing permission, mint one at the new ceiling. */
  policy: (input: {
    qx: string;
    qy: string;
    credentialHash: string;
    maxAmount: string;
    expirySeconds?: number;
  }) => call<{ result: ReseatResult }>('policy', input),

  /** Reset: the same swap, from a known set of ceilings, so every take starts clean. */
  reset: (input: {
    qx: string;
    qy: string;
    credentialHash: string;
    ceilings?: string[];
    expirySeconds?: number;
  }) => call<{ result: ReseatResult }>('reset', input),
};

export const formatToken = (value: string | null, decimals = 18) => {
  if (!value) return '0.00';
  const n = Number(value) / 10 ** decimals;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
