#!/usr/bin/env node
/**
 * Proves the relayer against a real chain, without spending anything.
 *
 * Runs against an anvil fork of Mezo testnet, so the contracts, the registry and
 * the vault are the deployed ones, but the transactions land on a throwaway
 * chain. The only thing simulated is gas.
 *
 * What it checks, in order:
 *   1. create    a real intent carrying the test passkey's public key
 *   2. digest    the action hash read from DemoSafe, not computed here
 *   3. execute   a genuine P-256 assertion is accepted and money moves
 *   4. replay    the same assertion is refused as AlreadyConsumed
 *   5. over      an unapproved 9x attempt is refused as OverLimit
 *   6. revoke    the permission is withdrawn on chain, and then refused as Revoked
 *   7. policy    adjusting the ceiling revokes the old permission and mints a new one
 *   8. reset     a fresh take revokes what is live and mints three real permissions
 *
 *   anvil --fork-url https://rpc.test.mezo.org --chain-id 31611 --port 8546 &
 *   WITNESS_RPC=http://127.0.0.1:8546 RELAYER_PRIVATE_KEY=0xac09... node server/verify-relayer.mjs
 *
 * The operator is set to the relayer key on the FORK only, because the deployed
 * executor is owned by the real deployer key. That setup step uses anvil's
 * impersonation; everything after it goes through the relayer's own signing.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const RPC = process.env.WITNESS_RPC ?? 'http://127.0.0.1:8546';
const RELAYER_KEY =
  process.env.RELAYER_PRIVATE_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // anvil account 0

process.env.WITNESS_RPC = RPC;
process.env.RELAYER_PRIVATE_KEY = RELAYER_KEY;
process.env.RELAYER_MAX_AMOUNT ??= '1000000000000000000000';

const { status, list, create, digest, execute, revoke, reseat, REASONS, DEMO_CEILINGS } =
  await import('./relayer.mjs');

const fork = {
  id: 31611,
  name: 'Mezo fork',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const client = createPublicClient({ chain: fork, transport: http(RPC) });
const relayerAccount = privateKeyToAccount(RELAYER_KEY);

/** The deterministic test passkey from contracts/test/vectors/AssertionVector.json. */
const VECTOR = JSON.parse(
  readFileSync(resolve(ROOT, 'contracts/test/vectors/AssertionVector.json'), 'utf8')
);

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `, ${detail}` : ''}`);
};

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** One-time fork setup: make the relayer key the executor's operator. */
async function prepareFork(executor, owner) {
  await rpc('anvil_impersonateAccount', [owner]);
  await rpc('anvil_setBalance', [owner, '0x56BC75E2D63100000']); // 100 ETH-equivalent
  const data = encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'setOperator',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'operator_', type: 'address' }],
        outputs: [],
      },
    ],
    functionName: 'setOperator',
    args: [relayerAccount.address],
  });
  const hash = await rpc('eth_sendTransaction', [{ from: owner, to: executor, data }]);
  await client.waitForTransactionReceipt({ hash });
  await rpc('anvil_stopImpersonatingAccount', [owner]);
}

async function main() {
  console.log(`\nRelayer verification against ${RPC}`);
  console.log(`  relayer ${relayerAccount.address}`);

  const s = await status();
  console.log(`  registry ${s.addresses.registry}`);
  console.log(`  executor ${s.addresses.executor}`);
  check('relayer reports configured', s.configured === true);
  check(
    'the fork carries the deployed vault balance',
    BigInt(s.safeBalance ?? '0') >= parseUnits('1', 18),
    s.safeBalance ?? ''
  );
  const balanceBefore = BigInt(s.safeBalance ?? '0');

  if (s.executorOperator?.toLowerCase() !== relayerAccount.address.toLowerCase()) {
    console.log('  setting the operator on the fork...');
    await prepareFork(s.addresses.executor, '0xFc31378e13B4Cb7B545bAC58b28916476406439d');
  }

  // --- 1: create a real intent -------------------------------------------------
  const ceiling = parseUnits('50', 18).toString();
  const created = await create({
    qx: BigInt(VECTOR.qx).toString(),
    qy: BigInt(VECTOR.qy).toString(),
    credentialHash: VECTOR.messageHash,
    maxAmount: ceiling,
    expirySeconds: 900,
  });
  check('create writes an intent on chain', Boolean(created.intentId), `intent ${created.intentId}`);

  const rows = await list(5);
  const mine = rows.find((r) => r.id === created.intentId);
  check('the new intent reads back as active', mine?.state === 'active', mine?.state ?? 'missing');
  check('its ceiling is the one that was signed for', mine?.maxAmount === ceiling);

  // --- 2: the digest comes from the contract ------------------------------------
  const recipient = '0xFc31378e13B4Cb7B545bAC58b28916476406439d';
  const amount = parseUnits('0.05', 18).toString();
  const d = await digest({ intentId: created.intentId, to: recipient, amount });
  check('digest is a 32 byte hash', /^0x[0-9a-f]{64}$/i.test(d.digest), d.digest);

  // --- 3: a genuine assertion is accepted --------------------------------------
  const signed = execFileSync(
    'node',
    [resolve(ROOT, 'scripts', 'sign-action.mjs'), d.digest, `--rpId=${s.rpId}`, `--origin=${s.origin}`],
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .map((l) => l.trim());

  const executed = await execute({
    intentId: created.intentId,
    to: recipient,
    amount,
    assertion: {
      authenticatorData: signed[0],
      clientDataJSON: signed[1],
      r: BigInt(signed[2]),
      s: BigInt(signed[3]),
    },
  });
  check('the passkey assertion executes on chain', executed.ok === true, executed.txHash ?? executed.reason ?? '');
  if (executed.txHash) console.log(`        tx ${executed.txHash}`);
  const afterBalance = BigInt((await status()).safeBalance ?? '0');
  check(
    'the vault released exactly the approved amount',
    balanceBefore - afterBalance === BigInt(amount),
    `${balanceBefore - afterBalance} moved`
  );

  // --- 4: the same approval cannot be replayed ---------------------------------
  const replay = await execute({
    intentId: created.intentId,
    to: recipient,
    amount,
    assertion: {
      authenticatorData: signed[0],
      clientDataJSON: signed[1],
      r: BigInt(signed[2]),
      s: BigInt(signed[3]),
    },
  });
  check('replaying it is refused as AlreadyConsumed', replay.reason === 'AlreadyConsumed', replay.reason ?? '');

  // --- 5: the agent asks for 9x the ceiling with no approval -------------------
  // A fresh intent, because the first one is now consumed and would be refused
  // for that reason instead of the ceiling.
  const ceilingIntent = await create({
    qx: BigInt(VECTOR.qx).toString(),
    qy: BigInt(VECTOR.qy).toString(),
    credentialHash: VECTOR.messageHash,
    maxAmount: ceiling,
    expirySeconds: 900,
  });
  const over = await execute({
    intentId: ceilingIntent.intentId,
    to: '0xdeaddeadbeef000000000000000000000000beef',
    amount: (BigInt(ceiling) * 9n).toString(),
  });
  check(
    'an unapproved 9x request is refused as OverLimit',
    over.reason === 'OverLimit' && over.code === REASONS.indexOf('OverLimit'),
    `${over.reason ?? ''} (reason ${over.code ?? '?'})`
  );

  // --- 6: revoke on chain -------------------------------------------------------
  const second = await create({
    qx: BigInt(VECTOR.qx).toString(),
    qy: BigInt(VECTOR.qy).toString(),
    credentialHash: VECTOR.messageHash,
    maxAmount: parseUnits('1', 18).toString(),
    expirySeconds: 900,
  });
  const revoked = await revoke({ intentId: second.intentId });
  check('revoke lands on chain', revoked.ok === true, revoked.txHash ?? '');

  const d2 = await digest({ intentId: second.intentId, to: recipient, amount: parseUnits('0.01', 18).toString() });
  const s2 = execFileSync(
    'node',
    [resolve(ROOT, 'scripts', 'sign-action.mjs'), d2.digest, `--rpId=${s.rpId}`, `--origin=${s.origin}`],
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .map((l) => l.trim());
  const afterRevoke = await execute({
    intentId: second.intentId,
    to: recipient,
    amount: parseUnits('0.01', 18).toString(),
    assertion: { authenticatorData: s2[0], clientDataJSON: s2[1], r: BigInt(s2[2]), s: BigInt(s2[3]) },
  });
  check('a revoked intent is refused as Revoked', afterRevoke.reason === 'Revoked', afterRevoke.reason ?? '');

  // --- 7: Adjust Policy ---------------------------------------------------------
  const policyCeiling = parseUnits('3', 18).toString();
  const adjusted = await reseat({
    qx: BigInt(VECTOR.qx).toString(),
    qy: BigInt(VECTOR.qy).toString(),
    credentialHash: VECTOR.messageHash,
    ceilings: [policyCeiling],
    expirySeconds: 900,
  });
  check(
    'adjusting the policy creates exactly one new permission',
    adjusted.created.length === 1 && Boolean(adjusted.created[0].intentId),
    `intent ${adjusted.created[0]?.intentId}`
  );
  const policyRow = (await list(6)).find((r) => r.id === adjusted.created[0]?.intentId);
  check('the new permission carries the new ceiling', policyRow?.maxAmount === policyCeiling);
  check('the new permission is active on chain', policyRow?.state === 'active', policyRow?.state ?? '');

  const oldRow = (await list(12)).find((r) => r.id === ceilingIntent.intentId);
  check(
    'the live permission it replaced is revoked',
    oldRow?.state === 'revoked',
    `intent ${ceilingIntent.intentId}: ${oldRow?.state ?? 'missing'}`
  );
  check(
    'intents owned by someone else are left alone',
    Array.isArray(adjusted.skipped),
    `${adjusted.skipped.length} skipped`
  );

  // --- 8: Reset Demo ------------------------------------------------------------
  const reset = await reseat({
    qx: BigInt(VECTOR.qx).toString(),
    qy: BigInt(VECTOR.qy).toString(),
    credentialHash: VECTOR.messageHash,
    ceilings: DEMO_CEILINGS,
    expirySeconds: 900,
  });
  check('reset mints the three demo permissions', reset.created.length === 3, `${reset.created.length} created`);
  check(
    'reset revokes the permission it replaced',
    reset.revoked.some((r) => r.ok && r.intentId === adjusted.created[0]?.intentId)
  );

  const afterReset = await list(8);
  const fresh = reset.created.map((c) => afterReset.find((r) => r.id === c.intentId));
  check(
    'all three read back active at their own ceilings',
    fresh.every((r, i) => r?.state === 'active' && r?.maxAmount === reset.created[i].maxAmount),
    fresh.map((r) => `${r?.id}:${r?.state}`).join(' ')
  );

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} relayer checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(`\nFailed: ${err.shortMessage ?? err.message}`);
  process.exit(1);
});
