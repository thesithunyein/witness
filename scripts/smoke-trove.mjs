#!/usr/bin/env node
/**
 * Read-only check of the trove relayer path against Mezo testnet. Sends nothing
 * and needs no key: it reads the trove vault's status and asks the vault for the
 * digest a passkey would sign to open a trove.
 *
 *   node scripts/smoke-trove.mjs
 */
import { readFileSync } from 'node:fs';
import { troveStatus, troveDigest } from '../server/trove.mjs';

const rec = JSON.parse(readFileSync(new URL('../contracts/deployments/31611-trove.json', import.meta.url)));
const safe = rec.contracts.DemoSafe;

const s = await troveStatus(safe);
console.log('trove status', s);
if (!s) {
  console.error('no trove status: the vault does not report BorrowerOperations');
  process.exit(1);
}
const d = await troveDigest({
  intentId: 0n,
  kind: 'trove-open',
  amount: 1800n * 10n ** 18n,
  collateral: 43n * 10n ** 15n,
  safe,
});
console.log('open digest for intent 0', d);
console.log('ok');
