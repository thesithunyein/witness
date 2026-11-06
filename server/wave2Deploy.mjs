/**
 * Deploy the Wave 2 stack with the key the live relayer already holds.
 *
 * The browser never sees that key. This module only sends the bytecode that
 * is already in the repository, then wires the Mezo Stability Pool, the
 * relayer allowlist, and the 10 bps fee. It does not enroll a passkey:
 * enrollKey is one-shot and has to be the key that will sign the demo.
 */
import { encodeDeployData, encodeFunctionData, getContractAddress } from 'viem';
import { bytecode } from './wave2bytecode.mjs';
import { publicClient, wallet, operatorAddress } from './relayer.mjs';

const MUSD = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const STABILITY_POOL = '0x1CCA7E410eE41739792eA0A24e00349Dd247680e';
const RP_ID = 'witness-agent.vercel.app';
const ORIGIN = 'https://witness-agent.vercel.app';
const FEE_BPS = 10n;
const FUND = 100n * 10n ** 18n;

const EMPTY_CTOR = [{ type: 'constructor', stateMutability: 'nonpayable', inputs: [] }];

async function send(tx) {
  try {
    const hash = await wallet().sendTransaction({ ...tx, gas: tx.gas ?? 6_000_000n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`tx reverted ${hash}`);
    return { hash, receipt };
  } catch (err) {
    const bits = [err?.shortMessage, err?.details, err?.cause?.message, err?.message]
      .filter(Boolean)
      .join(' | ');
    throw new Error(bits.slice(0, 280));
  }
}

async function deploy(name, abi, args, from, nonce) {
  const data = encodeDeployData({ abi, bytecode: bytecode[name], args });
  const predicted = getContractAddress({ from, nonce });
  const existing = await publicClient.getBytecode({ address: predicted });
  if (existing && existing !== '0x') {
    return { name, address: predicted, hash: null, skipped: true };
  }
  const { hash, receipt } = await send({ data });
  const address = receipt.contractAddress ?? predicted;
  return { name, address, hash, skipped: false };
}

async function call(to, abi, functionName, args) {
  const data = encodeFunctionData({ abi, functionName, args });
  const { hash } = await send({ to, data, gas: 1_500_000n });
  return hash;
}

const registryAbi = [
  { type: 'function', name: 'setVerifier', stateMutability: 'nonpayable', inputs: [{ name: 'verifier_', type: 'address' }], outputs: [] },
  { type: 'function', name: 'lockConfiguration', stateMutability: 'nonpayable', inputs: [], outputs: [] },
];
const verifierAbi = [
  { type: 'function', name: 'lockConfiguration', stateMutability: 'nonpayable', inputs: [], outputs: [] },
];
const safeAbi = [
  { type: 'function', name: 'setHuman', stateMutability: 'nonpayable', inputs: [{ name: 'human_', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setRelayer', stateMutability: 'nonpayable', inputs: [{ name: 'relayer', type: 'address' }, { name: 'allowed', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'setStabilityPool', stateMutability: 'nonpayable', inputs: [{ name: 'pool', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setFee', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }, { name: 'bps', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'lockOwnership', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'enrollKey', stateMutability: 'nonpayable', inputs: [{ name: 'qx', type: 'uint256' }, { name: 'qy', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'keyEnrolled', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'human', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
];
const erc20Abi = [
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];

/** Deploy every contract. Safe to retry: an address that already has code is skipped. */
export async function deployContracts() {
  const from = operatorAddress();
  let nonce = await publicClient.getTransactionCount({ address: from });
  const steps = [];

  const registry = await deploy('WitnessIntentRegistry', EMPTY_CTOR, [], from, nonce);
  steps.push(registry);
  nonce += 1;

  const p256 = await deploy('P256Verifier', EMPTY_CTOR, [], from, nonce);
  steps.push(p256);
  nonce += 1;

  const verifierAbiCtor = [{
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'registry_', type: 'address' },
      { name: 'rpId_', type: 'string' },
      { name: 'origin_', type: 'string' },
      { name: 'p256Verifier_', type: 'address' },
    ],
  }];
  const verifier = await deploy('WitnessVerifier', verifierAbiCtor, [registry.address, RP_ID, ORIGIN, p256.address], from, nonce);
  steps.push(verifier);
  nonce += 1;

  const safeCtor = [{
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'verifier_', type: 'address' },
      { name: 'token_', type: 'address' },
    ],
  }];
  const safe = await deploy('DemoSafe', safeCtor, [verifier.address, MUSD], from, nonce);
  steps.push(safe);
  nonce += 1;

  const agentCtor = [{
    type: 'constructor',
    stateMutability: 'payable',
    inputs: [
      { name: 'demoSafe_', type: 'address' },
      { name: 'operator_', type: 'address' },
    ],
  }];
  const agent = await deploy('AgentExecutor', agentCtor, [safe.address, from], from, nonce);
  steps.push(agent);

  return {
    deployer: from,
    contracts: {
      WitnessIntentRegistry: registry.address,
      P256Verifier: p256.address,
      WitnessVerifier: verifier.address,
      DemoSafe: safe.address,
      AgentExecutor: agent.address,
      DemoUSD: MUSD,
    },
    steps,
  };
}

/** Point the new contracts at each other, fund the safe, and freeze admin. */
export async function wireContracts(contracts) {
  const from = operatorAddress();
  const txs = [];
  txs.push(['setVerifier', await call(contracts.WitnessIntentRegistry, registryAbi, 'setVerifier', [contracts.WitnessVerifier])]);
  txs.push(['setHuman', await call(contracts.DemoSafe, safeAbi, 'setHuman', [from])]);
  txs.push(['setRelayer', await call(contracts.DemoSafe, safeAbi, 'setRelayer', [contracts.AgentExecutor, true])]);
  txs.push(['setStabilityPool', await call(contracts.DemoSafe, safeAbi, 'setStabilityPool', [STABILITY_POOL])]);
  txs.push(['setFee', await call(contracts.DemoSafe, safeAbi, 'setFee', [from, FEE_BPS])]);

  const held = await publicClient.readContract({
    address: MUSD,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [from],
  });
  const amount = held < FUND ? held : FUND;
  if (amount > 0n) {
    txs.push(['fund', await call(MUSD, erc20Abi, 'transfer', [contracts.DemoSafe, amount])]);
  }

  txs.push(['lockVerifier', await call(contracts.WitnessVerifier, verifierAbi, 'lockConfiguration', [])]);
  txs.push(['lockRegistry', await call(contracts.WitnessIntentRegistry, registryAbi, 'lockConfiguration', [])]);
  txs.push(['lockSafe', await call(contracts.DemoSafe, safeAbi, 'lockOwnership', [])]);

  return {
    stabilityPool: STABILITY_POOL,
    feeBps: FEE_BPS.toString(),
    funded: amount.toString(),
    txs: txs.map(([step, hash]) => ({ step, hash })),
  };
}

export async function enrollHumanKey(safe, qx, qy) {
  const from = operatorAddress();
  const hash = await call(safe, safeAbi, 'enrollKey', [BigInt(qx), BigInt(qy)]);
  return { hash, safe };
}
