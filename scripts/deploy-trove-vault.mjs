#!/usr/bin/env node
/**
 * Deploy a trove-capable vault on Mezo testnet and wire it, from your machine.
 *
 * Reuses the locked Wave 2 verifier and intent registry, so the passkey origin
 * and every existing check stay exactly as they are. Deploys a new DemoSafe
 * (with open / add collateral / repay) and its AgentExecutor, then:
 *   setHuman(you) -> setRelayer(executor) -> setStabilityPool -> setBorrowerOperations
 *   -> setFee(you, 10 bps) -> send BTC collateral -> lockOwnership
 *
 * It does not enroll a passkey. enrollKey is one shot: do it from the live app
 * with the phone passkey that will sign the demo.
 *
 * Usage (from the repo root):
 *   cd contracts && forge build && cd ..
 *   RELAYER_PRIVATE_KEY=0x... node scripts/deploy-trove-vault.mjs --dry-run
 *   RELAYER_PRIVATE_KEY=0x... node scripts/deploy-trove-vault.mjs
 *
 * Options:
 *   --dry-run            print the plan and checks, send nothing
 *   --btc=0.04           BTC to send to the vault as trove collateral (default 0.04)
 *
 * The key must be the relayer key that runs the live app, so the app can drive
 * the new executor. Writes contracts/deployments/31611-trove.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  formatEther,
  http,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RPC = process.env.MEZO_RPC ?? 'https://rpc.test.mezo.org';
const OUT = join(ROOT, 'contracts/deployments/31611-trove.json');

const MUSD = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const STABILITY_POOL = '0x1CCA7E410eE41739792eA0A24e00349Dd247680e';
const BORROWER_OPERATIONS = '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5';
const FEE_BPS = 10n;

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const DRY = args.has('dry-run');
const BTC = parseEther(String(args.get('btc') ?? '0.04'));

const chain = defineChain({
  id: 31611,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function artifact(name) {
  const p = join(ROOT, `contracts/out/${name}.sol/${name}.json`);
  if (!existsSync(p)) fail(`missing ${p}. Run: cd contracts && forge build`);
  const a = JSON.parse(readFileSync(p, 'utf8'));
  return { abi: a.abi, bytecode: a.bytecode.object };
}

const key = ['RELAYER_PRIVATE_KEY', 'WITNESS_OPERATOR_PRIVATE_KEY']
  .map((n) => process.env[n]?.trim())
  .find((v) => v && /^(0x)?[0-9a-fA-F]{64}$/.test(v));
if (!key) fail('set RELAYER_PRIVATE_KEY to the relayer key that runs the live app');
const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);

const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const wave2 = JSON.parse(readFileSync(join(ROOT, 'contracts/deployments/31611.json'), 'utf8'));
const VERIFIER = wave2.contracts.WitnessVerifier;

const safeArt = artifact('DemoSafe');
const agentArt = artifact('AgentExecutor');

async function send(label, tx) {
  const hash = await wallet.sendTransaction({ gas: 1_500_000n, ...tx });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') fail(`${label} reverted: ${hash}`);
  console.log(`  ✓ ${label.padEnd(22)} ${hash}`);
  return r;
}

async function write(label, address, abi, functionName, fnArgs, extra = {}) {
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName,
    args: fnArgs,
    gas: 300_000n,
    ...extra,
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') fail(`${label} reverted: ${hash}`);
  console.log(`  ✓ ${label.padEnd(22)} ${hash}`);
  return hash;
}

async function main() {
  console.log('Witness: trove-capable vault on Mezo testnet\n');

  const chainId = await pub.getChainId();
  if (chainId !== 31611) fail(`RPC is chain ${chainId}, expected 31611`);

  const boMusd = await pub.readContract({
    address: BORROWER_OPERATIONS,
    abi: [{ type: 'function', name: 'musd', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
    functionName: 'musd',
  });
  if (boMusd.toLowerCase() !== MUSD.toLowerCase()) {
    fail(`BorrowerOperations debt token is ${boMusd}, expected MUSD ${MUSD}`);
  }

  const verifierCode = await pub.getBytecode({ address: VERIFIER });
  if (!verifierCode || verifierCode === '0x') fail(`no code at Wave 2 verifier ${VERIFIER}`);

  const bal = await pub.getBalance({ address: account.address });
  const safeSize = (safeArt.bytecode.length - 2) / 2;
  console.log(`  deployer / human     ${account.address}`);
  console.log(`  BTC balance          ${formatEther(bal)}`);
  console.log(`  verifier (reused)    ${VERIFIER}`);
  console.log(`  BorrowerOperations   ${BORROWER_OPERATIONS} (debt token MUSD ✓)`);
  console.log(`  collateral to send   ${formatEther(BTC)} BTC`);
  console.log(`  DemoSafe initcode    ${safeSize} bytes\n`);

  if (bal < BTC + parseEther('0.002')) {
    fail(`need at least ${formatEther(BTC + parseEther('0.002'))} BTC (collateral + gas)`);
  }
  if (existsSync(OUT) && !args.has('force')) {
    fail(`${OUT} exists. A vault is already deployed. Pass --force to deploy another.`);
  }
  if (DRY) {
    console.log('Dry run: checks passed, nothing sent.');
    return;
  }

  const safeR = await send('deploy DemoSafe', {
    data: encodeDeployData({ abi: safeArt.abi, bytecode: safeArt.bytecode, args: [VERIFIER, MUSD] }),
    gas: 6_000_000n,
  });
  const safe = safeR.contractAddress;

  const agentR = await send('deploy AgentExecutor', {
    data: encodeDeployData({
      abi: agentArt.abi,
      bytecode: agentArt.bytecode,
      args: [safe, account.address],
    }),
    gas: 3_000_000n,
  });
  const executor = agentR.contractAddress;

  const txs = {};
  txs.setHuman = await write('setHuman', safe, safeArt.abi, 'setHuman', [account.address]);
  txs.setRelayer = await write('setRelayer', safe, safeArt.abi, 'setRelayer', [executor, true]);
  txs.setStabilityPool = await write('setStabilityPool', safe, safeArt.abi, 'setStabilityPool', [
    STABILITY_POOL,
  ]);
  txs.setBorrowerOperations = await write(
    'setBorrowerOperations',
    safe,
    safeArt.abi,
    'setBorrowerOperations',
    [BORROWER_OPERATIONS]
  );
  txs.setFee = await write('setFee', safe, safeArt.abi, 'setFee', [account.address, FEE_BPS]);
  const fundR = await send('send BTC collateral', { to: safe, value: BTC, gas: 100_000n });
  txs.fundBtc = fundR.transactionHash;
  txs.lockOwnership = await write('lockOwnership', safe, safeArt.abi, 'lockOwnership', []);

  const record = {
    chainId: 31611,
    deployedAt: new Date().toISOString(),
    human: account.address,
    feeRecipient: account.address,
    feeBps: Number(FEE_BPS),
    contracts: {
      DemoSafe: safe,
      AgentExecutor: executor,
      WitnessVerifier: VERIFIER,
      WitnessIntentRegistry: wave2.contracts.WitnessIntentRegistry,
      MUSD,
      StabilityPool: STABILITY_POOL,
      BorrowerOperations: BORROWER_OPERATIONS,
    },
    fundedBtc: formatEther(BTC),
    keyEnrolled: false,
    deploy: { DemoSafe: safeR.transactionHash, AgentExecutor: agentR.transactionHash },
    txs,
  };
  writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`\nVault    ${safe}`);
  console.log(`Executor ${executor}`);
  console.log(`Saved    contracts/deployments/31611-trove.json`);
  console.log('\nNext: enroll the phone passkey on this vault from the live app. Do not use a test key.');
}

main().catch((e) => fail(e?.shortMessage ?? e?.message ?? String(e)));
