/**
 * Witness relayer.
 *
 * The console never holds a key. It shows intents that exist on Mezo, asks the
 * human's passkey for a signature over the action digest, and posts that
 * assertion here. This process is the only thing that pays gas, and it is the
 * AgentExecutor's operator, so it can submit an attempt but cannot manufacture
 * the approval: the passkey in the intent decides.
 *
 * Every function here is a thin wrapper over the deployed contracts. Nothing is
 * simulated. If the chain refuses an action, the refusal comes back as the
 * contract's own typed reason code.
 */

import { DEPLOYMENTS, DEFAULT_CHAIN_ID } from './deployment.mjs';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
  decodeErrorResult,
  decodeEventLog,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const CHAIN_ID = Number(process.env.WITNESS_CHAIN_ID ?? DEFAULT_CHAIN_ID);
/** Deployed addresses are public, so they are defaults rather than secrets. */
const deployment = DEPLOYMENTS[CHAIN_ID];
if (!deployment) throw new Error(`unsupported chain id ${CHAIN_ID}`);

const chain = {
  id: CHAIN_ID,
  name: deployment.chainName,
  nativeCurrency:
    CHAIN_ID === 31611
      ? { name: 'Bitcoin', symbol: 'BTC', decimals: 18 }
      : { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.WITNESS_RPC ?? deployment.rpc] },
  },
};

const ADDRESSES = {
  registry: process.env.WITNESS_REGISTRY ?? deployment.contracts?.WitnessIntentRegistry,
  executor: process.env.WITNESS_EXECUTOR ?? deployment.contracts?.AgentExecutor,
  safe: process.env.WITNESS_SAFE ?? deployment.contracts?.DemoSafe,
  token: process.env.WITNESS_TOKEN ?? deployment.contracts?.DemoUSD,
};

export const RP_ID = process.env.RP_ID ?? deployment.rpId ?? 'witness-agent.vercel.app';
export const ORIGIN = process.env.ORIGIN ?? deployment.origin ?? 'https://witness-agent.vercel.app';

const TRANSFER = keccak256(toBytes('witness.action.transfer'));
const ZERO = '0x0000000000000000000000000000000000000000';

export const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'createIntent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentWallet', type: 'address' },
      { name: 'agentId', type: 'uint256' },
      { name: 'actionType', type: 'bytes32' },
      { name: 'maxAmount', type: 'uint256' },
      { name: 'expiry', type: 'uint64' },
      { name: 'policyHash', type: 'bytes32' },
      { name: 'credentialHash', type: 'bytes32' },
      { name: 'qx', type: 'uint256' },
      { name: 'qy', type: 'uint256' },
    ],
    outputs: [{ name: 'intentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'revokeIntent',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'intentId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'nextIntentId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getIntent',
    stateMutability: 'view',
    inputs: [{ name: 'intentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'user', type: 'address' },
          { name: 'agentWallet', type: 'address' },
          { name: 'agentId', type: 'uint256' },
          { name: 'actionType', type: 'bytes32' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'expiry', type: 'uint64' },
          { name: 'policyHash', type: 'bytes32' },
          { name: 'credentialHash', type: 'bytes32' },
          { name: 'qx', type: 'uint256' },
          { name: 'qy', type: 'uint256' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'revoked', type: 'bool' },
          { name: 'consumed', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'event',
    name: 'IntentCreated',
    inputs: [
      { name: 'intentId', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'agentWallet', type: 'address', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: false },
      { name: 'actionType', type: 'bytes32', indexed: false },
      { name: 'maxAmount', type: 'uint256', indexed: false },
      { name: 'expiry', type: 'uint64', indexed: false },
      { name: 'policyHash', type: 'bytes32', indexed: false },
      { name: 'credentialHash', type: 'bytes32', indexed: false },
    ],
  },
];

export const SAFE_ABI = [
  {
    type: 'function',
    name: 'actionHash',
    stateMutability: 'view',
    inputs: [
      { name: 'intentId', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'balance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

export const EXECUTOR_ABI = [
  {
    type: 'function',
    name: 'executeTransfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'intentId', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      {
        name: 'assertion',
        type: 'tuple',
        components: [
          { name: 'authenticatorData', type: 'bytes' },
          { name: 'clientDataJSON', type: 'bytes' },
          { name: 'r', type: 'uint256' },
          { name: 's', type: 'uint256' },
        ],
      },
    ],
    outputs: [{ name: 'actionHash', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'operator',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'error',
    name: 'Unauthorized',
    inputs: [{ name: 'reason', type: 'uint8' }],
  },
  { type: 'error', name: 'NotAuthorized', inputs: [] },
];

/**
 * The contract's own enum, copied from AgentExecutor / WitnessVerifier so the
 * console cannot invent a friendlier meaning for a refusal. Index is the code.
 */
export const REASONS = [
  'Allowed',
  'NoSuchIntent',
  'Revoked',
  'Expired',
  'AlreadyConsumed',
  'WrongAgent',
  'AgentNotRegistered',
  'ActionTypeMismatch',
  'OverLimit',
  'RpIdMismatch',
  'NoUserPresence',
  'NoUserVerification',
  'WrongType',
  'ChallengeMismatch',
  'OriginMismatch',
  'BadSignature',
];

/**
 * Per-call cap, as a last line of defence behind the passkey.
 *
 * A call without a valid assertion can never move funds, so this is not the
 * security boundary; it bounds what a future caller could ask for if the key in
 * this process is ever misused. Keep it above the demo ceiling, or the "9x the
 * ceiling" attempt is refused here instead of by the contract.
 */
const MAX_AMOUNT = BigInt(process.env.RELAYER_MAX_AMOUNT ?? '1000000000000000000000'); // 1000 MUSD

/** The three amounts the console starts a fresh demo from, in whole MUSD. */
export const DEMO_CEILINGS = ['0.05', '1.25', '5'].map((v) =>
  BigInt(Math.round(Number(v) * 1e6)) * 10n ** 12n
);

export const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });

/**
 * The key that pays gas, under one name.
 *
 * The earlier spellings are still read so an existing deployment does not have
 * to be renamed to start working, but the value is shape-checked: a placeholder
 * that is not 32 bytes of hex is ignored rather than accepted and then thrown
 * out of `privateKeyToAccount` on the first request.
 */
const KEY_NAMES = ['RELAYER_PRIVATE_KEY', 'WITNESS_OPERATOR_PRIVATE_KEY', 'WITNESS_RELAYER_PRIVATE_KEY'];
const KEY_HEX = /^(0x)?[0-9a-fA-F]{64}$/;

const RELAYER_KEY = (() => {
  for (const name of KEY_NAMES) {
    const value = process.env[name]?.trim();
    if (value && KEY_HEX.test(value)) return value;
  }
  return null;
})();

let cachedWallet = null;
let cachedAccount = null;

export function isConfigured() {
  return Boolean(RELAYER_KEY && ADDRESSES.registry && ADDRESSES.executor);
}

function account() {
  if (!cachedAccount) cachedAccount = privateKeyToAccount(RELAYER_KEY);
  return cachedAccount;
}

function wallet() {
  if (!isConfigured()) throw new Error('relayer is not configured');
  if (!cachedWallet) {
    cachedWallet = createWalletClient({
      account: account(),
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });
  }
  return cachedWallet;
}

export const operatorAddress = () => (isConfigured() ? account().address : null);

/** Read the deployed state the console needs, in one round trip where possible. */
export async function status() {
  const configured = isConfigured();
  const out = {
    configured,
    chainId: CHAIN_ID,
    chainName: chain.name,
    rpId: RP_ID,
    origin: ORIGIN,
    explorer: process.env.WITNESS_EXPLORER ?? deployment.explorer,
    addresses: ADDRESSES,
    nextIntentId: null,
    safeBalance: null,
    operator: null,
    executorOperator: null,
    reason: configured
      ? null
      : 'no signing key: set RELAYER_PRIVATE_KEY to the executor\'s operator key',
  };
  if (!ADDRESSES.registry || !ADDRESSES.safe) return out;

  const [nextId, balance] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.registry,
      abi: REGISTRY_ABI,
      functionName: 'nextIntentId',
    }),
    publicClient.readContract({
      address: ADDRESSES.safe,
      abi: SAFE_ABI,
      functionName: 'balance',
    }),
  ]);
  out.nextIntentId = Number(nextId);
  out.safeBalance = balance.toString();
  out.operator = operatorAddress();
  if (ADDRESSES.executor) {
    out.executorOperator = await publicClient.readContract({
      address: ADDRESSES.executor,
      abi: EXECUTOR_ABI,
      functionName: 'operator',
    });
  }
  return out;
}

/** Every intent the registry holds, newest first, with its real state. */
export async function list(limit = 24) {
  if (!ADDRESSES.registry) return [];
  const nextId = Number(
    await publicClient.readContract({
      address: ADDRESSES.registry,
      abi: REGISTRY_ABI,
      functionName: 'nextIntentId',
    })
  );
  const ids = [];
  for (let id = nextId - 1; id >= 1 && ids.length < limit; id -= 1) ids.push(id);

  const rows = await Promise.all(
    ids.map(async (id) => {
      try {
        const i = await publicClient.readContract({
          address: ADDRESSES.registry,
          abi: REGISTRY_ABI,
          functionName: 'getIntent',
          args: [BigInt(id)],
        });
        const expiry = Number(i.expiry);
        const expired = expiry !== 0 && expiry * 1000 < Date.now();
        return {
          id,
          user: i.user,
          agentWallet: i.agentWallet,
          agentId: Number(i.agentId),
          actionType: i.actionType,
          maxAmount: i.maxAmount.toString(),
          expiry,
          credentialHash: i.credentialHash,
          qx: i.qx.toString(),
          qy: i.qy.toString(),
          createdAt: Number(i.createdAt),
          revoked: i.revoked,
          consumed: i.consumed,
          expired,
          state: i.consumed
            ? 'consumed'
            : i.revoked
              ? 'revoked'
              : expired
                ? 'expired'
                : 'active',
        };
      } catch {
        return null;
      }
    })
  );
  return rows.filter(Boolean);
}

/** Create a real permission. The human's passkey public key goes in it. */
export async function create({
  qx,
  qy,
  credentialHash,
  maxAmount,
  expirySeconds = 3600,
  agentId = deployment.agentId ?? 0,
  policyHash,
}) {
  if (!qx || !qy) throw new Error('a real passkey public key (qx, qy) is required');
  if (BigInt(maxAmount) <= 0n) throw new Error('maxAmount must be positive');
  if (BigInt(maxAmount) > MAX_AMOUNT) throw new Error('maxAmount above the relayer cap');

  const expiry = BigInt(Math.floor(Date.now() / 1000) + Number(expirySeconds));
  const client = wallet();
  const hash = await client.writeContract({
    address: ADDRESSES.registry,
    abi: REGISTRY_ABI,
    functionName: 'createIntent',
    args: [
      ADDRESSES.executor,
      BigInt(agentId),
      TRANSFER,
      BigInt(maxAmount),
      expiry,
      policyHash ?? keccak256(toBytes(JSON.stringify({ v: 1, at: Date.now() }))),
      credentialHash ?? keccak256(toBytes('witness:passkey')),
      BigInt(qx),
      BigInt(qy),
    ],
    account: client.account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ADDRESSES.registry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: REGISTRY_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'IntentCreated') {
        return { intentId: Number(decoded.args.intentId), txHash: hash, status: receipt.status };
      }
    } catch {
      // not the event we want
    }
  }
  return { intentId: null, txHash: hash, status: receipt.status };
}

/** The exact digest the passkey has to sign. Read from the contract, never derived here. */
export async function digest({ intentId, to, amount }) {
  if (!to || to === ZERO) throw new Error('a destination address is required');
  const value = BigInt(amount);
  if (value <= 0n) throw new Error('amount must be positive');
  const hash = await publicClient.readContract({
    address: ADDRESSES.safe,
    abi: SAFE_ABI,
    functionName: 'actionHash',
    args: [BigInt(intentId), to, value],
  });
  return { digest: hash, intentId: Number(intentId), to, amount: value.toString() };
}

/** Pull the contract's typed reason, if this failure had one, out of a viem error. */
function reasonOf(err) {
  let e = err;
  let depth = 0;
  while (e && typeof e === 'object' && depth < 12) {
    if (e.errorName === 'Unauthorized' && Array.isArray(e.args)) {
      const code = Number(e.args[0]);
      return { code, reason: REASONS[code] ?? `Unknown(${code})` };
    }
    if (typeof e.data === 'string' && e.data.startsWith('0x') && e.data.length >= 10) {
      try {
        const decoded = decodeErrorResult({ abi: EXECUTOR_ABI, data: e.data });
        if (decoded.errorName === 'Unauthorized') {
          const code = Number(decoded.args?.[0]);
          return { code, reason: REASONS[code] ?? `Unknown(${code})` };
        }
      } catch {
        // not our error
      }
    }
    e = e.cause;
    depth += 1;
  }
  return null;
}

/**
 * Submit an attempt.
 *
 * With no assertion this is the agent asking for money the human never approved,
 * which is exactly how the console demonstrates a ceiling: the transaction is
 * real, it goes to the chain, and the contract refuses it on its own.
 */
export async function execute({ intentId, to, amount, assertion }) {
  const value = BigInt(amount);
  if (value > MAX_AMOUNT) return { ok: false, reason: 'AboveRelayerCap', code: null };

  const client = wallet();
  const args = [
    BigInt(intentId),
    to,
    value,
    assertion ?? {
      authenticatorData: '0x',
      clientDataJSON: '0x',
      r: 0n,
      s: 0n,
    },
  ];

  try {
    // Simulate first so a refusal is reported as the contract's reason instead of
    // a mined reverted transaction, which would cost gas to learn nothing.
    await publicClient.simulateContract({
      address: ADDRESSES.executor,
      abi: EXECUTOR_ABI,
      functionName: 'executeTransfer',
      args,
      account: client.account,
    });

    const hash = await client.writeContract({
      address: ADDRESSES.executor,
      abi: EXECUTOR_ABI,
      functionName: 'executeTransfer',
      args,
      account: client.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { ok: receipt.status === 'success', txHash: hash, status: receipt.status };
  } catch (err) {
    const typed = reasonOf(err);
    return {
      ok: false,
      code: typed?.code ?? null,
      reason: typed?.reason ?? (err.shortMessage ?? err.message ?? 'Reverted').slice(0, 200),
    };
  }
}

/** Revoke the permission on chain. Only the intent's user can, so the relayer is that user. */
export async function revoke({ intentId }) {
  const client = wallet();
  const hash = await client.writeContract({
    address: ADDRESSES.registry,
    abi: REGISTRY_ABI,
    functionName: 'revokeIntent',
    args: [BigInt(intentId)],
    account: client.account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { ok: receipt.status === 'success', txHash: hash };
}

/**
 * Replace the human's standing permission with a fresh one.
 *
 * There is no global policy contract to write to: on chain the ceiling lives in
 * the intent the human signed off on. So "adjust the policy" is revoke the old
 * permission and mint the new one, which is two real transactions, and "reset"
 * is the same thing with a known set of amounts. Both report every hash so the
 * page can link each transaction instead of asserting that something happened.
 */
export async function reseat({ qx, qy, credentialHash, ceilings, expirySeconds = 3600, revokeActive = true }) {
  if (!qx || !qy) throw new Error('a real passkey public key (qx, qy) is required');
  const amounts = ceilings.map((c) => BigInt(c));
  if (amounts.length === 0) throw new Error('at least one ceiling is required');
  if (amounts.some((a) => a <= 0n || a > MAX_AMOUNT)) throw new Error('a ceiling is out of range');

  const me = operatorAddress().toLowerCase();
  const revoked = [];
  const skipped = [];

  if (revokeActive) {
    const active = (await list(12)).filter((i) => i.state === 'active');
    for (const intent of active) {
      // revokeIntent is user-only, so an intent someone else owns would revert.
      if (intent.user.toLowerCase() !== me) {
        skipped.push(intent.id);
        continue;
      }
      try {
        const r = await revoke({ intentId: intent.id });
        revoked.push({ intentId: intent.id, txHash: r.txHash, ok: r.ok });
      } catch (err) {
        revoked.push({
          intentId: intent.id,
          ok: false,
          error: (err.shortMessage ?? err.message ?? 'revoke failed').slice(0, 120),
        });
      }
    }
  }

  const created = [];
  for (const amount of amounts) {
    const made = await create({
      qx,
      qy,
      credentialHash,
      maxAmount: amount.toString(),
      expirySeconds,
    });
    created.push({ ...made, maxAmount: amount.toString() });
  }

  return { revoked, skipped, created };
}

/**
 * One dispatch table, used by the serverless entry point and the local host, so
 * there is only one place where an action name becomes a chain call.
 */
export async function dispatch(action, payload = {}) {
  switch (action) {
    case 'status':
      return { status: 200, body: { ok: true, status: await status() } };

    case 'list':
      return { status: 200, body: { ok: true, intents: await list(Number(payload.limit ?? 24)) } };

    case 'create': {
      const created = await create({
        qx: payload.qx,
        qy: payload.qy,
        credentialHash: payload.credentialHash,
        maxAmount: payload.maxAmount,
        expirySeconds: payload.expirySeconds,
        agentId: payload.agentId,
        policyHash: payload.policyHash,
      });
      return { status: 200, body: { ok: true, ...created } };
    }

    case 'digest': {
      const d = await digest({
        intentId: payload.intentId,
        to: payload.to,
        amount: payload.amount,
      });
      return { status: 200, body: { ok: true, ...d } };
    }

    case 'execute': {
      const result = await execute({
        intentId: payload.intentId,
        to: payload.to,
        amount: payload.amount,
        assertion: payload.assertion,
      });
      return { status: 200, body: { ok: result.ok, result } };
    }

    case 'revoke': {
      const result = await revoke({ intentId: payload.intentId });
      return { status: 200, body: { ok: result.ok, result } };
    }

    case 'policy': {
      const result = await reseat({
        qx: payload.qx,
        qy: payload.qy,
        credentialHash: payload.credentialHash,
        ceilings: [payload.maxAmount],
        expirySeconds: payload.expirySeconds,
      });
      return { status: 200, body: { ok: true, result } };
    }

    case 'reset': {
      const result = await reseat({
        qx: payload.qx,
        qy: payload.qy,
        credentialHash: payload.credentialHash,
        ceilings: payload.ceilings ?? DEMO_CEILINGS,
        expirySeconds: payload.expirySeconds,
      });
      return { status: 200, body: { ok: true, result } };
    }

    default:
      return { status: 400, body: { ok: false, error: `unknown action ${action || '(none)'}` } };
  }
}

export const ACTION_TRANSFER = TRANSFER;
