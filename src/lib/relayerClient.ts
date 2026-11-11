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
  keyEnrolled: boolean | null;
  feeBps: number | null;
  poolDeposit: string | null;
  enrolledQx: string | null;
  enrolledQy: string | null;
  guest: boolean;
  reason: string | null;
  /** Present only for a vault that owns a Mezo trove. Raw 18-decimal strings. */
  trove?: TroveStatus | null;
};

export type TroveStatus = {
  borrowerOperations: string;
  open: boolean;
  statusCode: number;
  collateral: string;
  debt: string;
  icr: string | null;
  liquidationPrice: string | null;
  price: string;
  btcInVault: string;
  minNetDebt: string;
  gasCompensation: string;
};

export type ActionKind =
  | 'transfer'
  | 'sp-deposit'
  | 'sp-withdraw'
  | 'trove-open'
  | 'trove-addcoll'
  | 'trove-repay';

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

const VAULT_KEY = 'witness.vault.v1';

export function savedVault(): { safe: string; executor: string } | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(VAULT_KEY) || 'null') as { safe?: string; executor?: string } | null;
    if (parsed?.safe && parsed?.executor) return { safe: parsed.safe, executor: parsed.executor };
  } catch {
    localStorage.removeItem(VAULT_KEY);
  }
  return null;
}

export function saveVault(vault: { safe: string; executor: string } | null) {
  if (!vault) localStorage.removeItem(VAULT_KEY);
  else localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

export async function call<T>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<Reply<T>> {
  const vault = action === 'open-vault' ? {} : (savedVault() ?? {});
  const res = await fetch('/api/relayer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action, ...vault, ...payload }),
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
    actionKind?: ActionKind;
  }) => call<{ intentId: number | null; txHash: string }>('create', input),

  digest: (input: {
    intentId: number;
    to?: string;
    amount: string;
    collateral?: string;
    kind?: ActionKind;
  }) =>
    call<{ digest: `0x${string}`; intentId: number; to: string | null; amount: string }>(
      'digest',
      input
    ),

  execute: (input: {
    intentId: number;
    to?: string;
    amount: string;
    collateral?: string;
    kind?: ActionKind;
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

  /** One-shot. Binds the browser passkey on DemoSafe. A second call reverts AlreadyEnrolled. */
  bind: (input: { qx: string; qy: string }) =>
    call<{ result: { hash: string; safe: string } }>('enroll-key', input),

  /** A new unbound vault for a passkey that is not the one already on the recorded safe. */
  openVault: () =>
    call<{ result: { safe: string; executor: string; funded: string; txs: string[] } }>('open-vault'),
};

export const formatToken = (value: string | null, decimals = 18) => {
  if (!value) return '0.00';
  const n = Number(value) / 10 ** decimals;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
