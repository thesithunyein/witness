/**
 * Mezo trove actions for a vault that owns a trove.
 *
 * Open, add collateral, and repay each need the enrolled passkey over that exact
 * action. This module reads the digest from the contract, computes Mezo's
 * sorted-list hints, and submits through the AgentExecutor. Hints only make the
 * insert cheaper: they are not signed and cannot change an amount or the owner.
 */
import { keccak256, toBytes } from 'viem';
import { publicClient, wallet, reasonOf, emptyAssertion } from './relayer.mjs';

export const TROVE_OPEN = keccak256(toBytes('witness.action.trove.open'));
export const TROVE_ADD_COLL = keccak256(toBytes('witness.action.trove.addcoll'));
export const TROVE_REPAY = keccak256(toBytes('witness.action.trove.repay'));

const ZERO = '0x0000000000000000000000000000000000000000';

/** Mezo testnet (31611) MUSD system, from mezo-org/musd deployments/matsnet. */
const MEZO = {
  troveManager: process.env.MEZO_TROVE_MANAGER ?? '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0',
  hintHelpers: process.env.MEZO_HINT_HELPERS ?? '0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6',
  sortedTroves: process.env.MEZO_SORTED_TROVES ?? '0x722E4D24FD6Ff8b0AC679450F3D91294607268fA',
  priceFeed: process.env.MEZO_PRICE_FEED ?? '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
};

/** Relayer-side caps, on top of the ceiling the human signed. */
const CAP = {
  'trove-open': BigInt(process.env.RELAYER_TROVE_MAX_DEBT ?? '5000000000000000000000'), // 5000 MUSD
  'trove-repay': BigInt(process.env.RELAYER_TROVE_MAX_DEBT ?? '5000000000000000000000'),
  'trove-addcoll': BigInt(process.env.RELAYER_TROVE_MAX_COLL ?? '100000000000000000'), // 0.1 BTC
};

const NICR_PRECISION = 10n ** 20n;

const v = (name, inputs = [], outputs = [{ type: 'uint256' }]) => ({
  type: 'function',
  name,
  stateMutability: 'view',
  inputs,
  outputs,
});

const SAFE_TROVE_ABI = [
  v('borrowerOperations', [], [{ type: 'address' }]),
  v('troveOpenHash', [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [{ type: 'bytes32' }]),
  v('troveAddCollHash', [{ type: 'uint256' }, { type: 'uint256' }], [{ type: 'bytes32' }]),
  v('troveRepayHash', [{ type: 'uint256' }, { type: 'uint256' }], [{ type: 'bytes32' }]),
];

const ASSERTION = {
  name: 'assertion',
  type: 'tuple',
  components: [
    { name: 'authenticatorData', type: 'bytes' },
    { name: 'clientDataJSON', type: 'bytes' },
    { name: 'r', type: 'uint256' },
    { name: 's', type: 'uint256' },
  ],
};

const write = (name, inputs) => ({
  type: 'function',
  name,
  stateMutability: 'nonpayable',
  inputs,
  outputs: [{ name: 'actionHash', type: 'bytes32' }],
});

export const EXECUTOR_TROVE_ABI = [
  write('openTrove', [
    { name: 'intentId', type: 'uint256' },
    { name: 'collateral', type: 'uint256' },
    { name: 'debt', type: 'uint256' },
    { name: 'upperHint', type: 'address' },
    { name: 'lowerHint', type: 'address' },
    ASSERTION,
  ]),
  write('addTroveCollateral', [
    { name: 'intentId', type: 'uint256' },
    { name: 'collateral', type: 'uint256' },
    { name: 'upperHint', type: 'address' },
    { name: 'lowerHint', type: 'address' },
    ASSERTION,
  ]),
  write('repayTroveDebt', [
    { name: 'intentId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'upperHint', type: 'address' },
    { name: 'lowerHint', type: 'address' },
    ASSERTION,
  ]),
  { type: 'error', name: 'Unauthorized', inputs: [{ name: 'reason', type: 'uint8' }] },
  { type: 'error', name: 'NotAuthorized', inputs: [] },
  { type: 'error', name: 'NotBound', inputs: [] },
  { type: 'error', name: 'KeyMismatch', inputs: [] },
  { type: 'error', name: 'NotRelayer', inputs: [] },
  { type: 'error', name: 'HashMismatch', inputs: [] },
  { type: 'error', name: 'BorrowerOperationsUnset', inputs: [] },
  { type: 'error', name: 'FeeRecipientUnset', inputs: [] },
];

const BO_ABI = [
  v('minNetDebt'),
  v('MUSD_GAS_COMPENSATION'),
  v('getBorrowingFee', [{ type: 'uint256' }]),
];

const TM_ABI = [
  v(
    'getEntireDebtAndColl',
    [{ type: 'address' }],
    [
      { name: 'coll', type: 'uint256' },
      { name: 'principal', type: 'uint256' },
      { name: 'interest', type: 'uint256' },
      { name: 'pendingCollateral', type: 'uint256' },
      { name: 'pendingPrincipal', type: 'uint256' },
      { name: 'pendingInterest', type: 'uint256' },
    ]
  ),
  v('getCurrentICR', [{ type: 'address' }, { type: 'uint256' }]),
  v('getTroveStatus', [{ type: 'address' }]),
];

const HINT_ABI = [
  v(
    'getApproxHint',
    [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
    [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }]
  ),
];
const SORTED_ABI = [
  v('findInsertPosition', [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }], [
    { type: 'address' },
    { type: 'address' },
  ]),
];

export const isTroveKind = (kind) =>
  kind === 'trove-open' || kind === 'trove-addcoll' || kind === 'trove-repay';

export const troveTag = (kind) =>
  kind === 'trove-open' ? TROVE_OPEN : kind === 'trove-addcoll' ? TROVE_ADD_COLL : TROVE_REPAY;

export const troveCap = (kind) => CAP[kind];

const read = (address, abi, functionName, args = []) =>
  publicClient.readContract({ address, abi, functionName, args });

async function borrowerOps(safe) {
  const bo = await read(safe, SAFE_TROVE_ABI, 'borrowerOperations');
  if (!bo || bo === ZERO) throw new Error('this vault is not connected to Mezo BorrowerOperations');
  return bo;
}

/** The trove as Mezo sees it, plus what a first trove would need. Null for vaults without one. */
export async function troveStatus(safe) {
  let bo;
  try {
    bo = await read(safe, SAFE_TROVE_ABI, 'borrowerOperations');
  } catch {
    return null; // an older vault without the trove paths
  }
  if (!bo || bo === ZERO) return null;

  const [statusCode, price, btc, minNetDebt, gasComp] = await Promise.all([
    read(MEZO.troveManager, TM_ABI, 'getTroveStatus', [safe]),
    read(MEZO.priceFeed, [v('fetchPrice')], 'fetchPrice'),
    publicClient.getBalance({ address: safe }),
    read(bo, BO_ABI, 'minNetDebt'),
    read(bo, BO_ABI, 'MUSD_GAS_COMPENSATION'),
  ]);
  // Liquity status enum: 1 is an active trove. Only then are debt and ratio meaningful.
  const open = Number(statusCode) === 1;
  let totalColl = 0n;
  let totalDebt = 0n;
  let icr = null;
  if (open) {
    const [coll, principal, interest, pColl, pPrincipal, pInterest] = await read(
      MEZO.troveManager,
      TM_ABI,
      'getEntireDebtAndColl',
      [safe]
    );
    totalColl = coll + pColl;
    totalDebt = principal + interest + pPrincipal + pInterest;
    icr = await read(MEZO.troveManager, TM_ABI, 'getCurrentICR', [safe, price]);
  }

  return {
    borrowerOperations: bo,
    open,
    statusCode: Number(statusCode),
    collateral: totalColl.toString(),
    debt: totalDebt.toString(),
    icr: icr === null ? null : icr.toString(), // 1e18 = 100%
    // Mezo liquidates below 110%: the BTC price at which this trove reaches it.
    liquidationPrice:
      open && totalColl > 0n ? ((totalDebt * 11n * 10n ** 17n) / totalColl).toString() : null,
    price: price.toString(),
    btcInVault: btc.toString(),
    minNetDebt: minNetDebt.toString(),
    gasCompensation: gasComp.toString(),
  };
}

export async function troveDigest({ intentId, kind, amount, collateral, safe }) {
  const id = BigInt(intentId);
  if (kind === 'trove-open') {
    return read(safe, SAFE_TROVE_ABI, 'troveOpenHash', [id, BigInt(collateral), BigInt(amount)]);
  }
  if (kind === 'trove-addcoll') {
    return read(safe, SAFE_TROVE_ABI, 'troveAddCollHash', [id, BigInt(amount)]);
  }
  return read(safe, SAFE_TROVE_ABI, 'troveRepayHash', [id, BigInt(amount)]);
}

/** The trove's nominal ratio after the change, which is what Mezo sorts by. */
async function nicrAfter({ kind, amount, collateral, safe, bo }) {
  if (kind === 'trove-open') {
    const [fee, gasComp] = await Promise.all([
      read(bo, BO_ABI, 'getBorrowingFee', [amount]),
      read(bo, BO_ABI, 'MUSD_GAS_COMPENSATION'),
    ]);
    return (collateral * NICR_PRECISION) / (amount + fee + gasComp);
  }
  const [coll, principal, interest, pColl, pPrincipal, pInterest] = await read(
    MEZO.troveManager,
    TM_ABI,
    'getEntireDebtAndColl',
    [safe]
  );
  let c = coll + pColl;
  let p = principal + pPrincipal;
  if (kind === 'trove-addcoll') c += amount;
  if (kind === 'trove-repay') {
    const owedInterest = interest + pInterest;
    if (amount > owedInterest) p -= amount - owedInterest;
  }
  if (p <= 0n) return null;
  return (c * NICR_PRECISION) / p;
}

async function hints(args) {
  try {
    const nicr = await nicrAfter(args);
    if (nicr === null) return [ZERO, ZERO];
    const [approx] = await read(MEZO.hintHelpers, HINT_ABI, 'getApproxHint', [
      nicr,
      15n,
      BigInt(Date.now()),
    ]);
    const [upper, lower] = await read(MEZO.sortedTroves, SORTED_ABI, 'findInsertPosition', [
      nicr,
      approx,
      approx,
    ]);
    return [upper, lower];
  } catch {
    // Zero hints are valid: Mezo walks the list itself, at a higher gas cost.
    return [ZERO, ZERO];
  }
}

export async function troveExecute({ intentId, kind, amount, collateral, assertion, safe, executor }) {
  const value = BigInt(amount);
  const coll = BigInt(collateral ?? 0);
  if (value <= 0n) return { ok: false, reason: 'amount must be positive', code: null };
  if (value > CAP[kind]) return { ok: false, reason: 'AboveRelayerCap', code: null };
  if (kind === 'trove-open' && coll <= 0n) {
    return { ok: false, reason: 'collateral must be positive', code: null };
  }

  const client = wallet();
  try {
    const bo = await borrowerOps(safe);
    const [upper, lower] = await hints({ kind, amount: value, collateral: coll, safe, bo });
    const a = assertion ?? emptyAssertion;
    const id = BigInt(intentId);
    const call =
      kind === 'trove-open'
        ? { functionName: 'openTrove', args: [id, coll, value, upper, lower, a] }
        : kind === 'trove-addcoll'
          ? { functionName: 'addTroveCollateral', args: [id, value, upper, lower, a] }
          : { functionName: 'repayTroveDebt', args: [id, value, upper, lower, a] };

    // Simulate first, so a refusal comes back as the contract's reason, not a mined revert.
    await publicClient.simulateContract({
      address: executor,
      abi: EXECUTOR_TROVE_ABI,
      ...call,
      account: client.account,
    });
    const hash = await client.writeContract({
      address: executor,
      abi: EXECUTOR_TROVE_ABI,
      ...call,
      account: client.account,
      gas: 2_500_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { ok: receipt.status === 'success', txHash: hash, status: receipt.status, hints: [upper, lower] };
  } catch (err) {
    const typed = reasonOf(err);
    return {
      ok: false,
      code: typed?.code ?? null,
      reason: typed?.reason ?? (err.shortMessage ?? err.message ?? 'Reverted').slice(0, 200),
    };
  }
}
