/**
 * Read-only chain access for the console.
 *
 * The approval queue is illustrative; the treasury balance is not. This reads
 * DemoSafe.balance() straight from the public Mezo testnet RPC — no key, no
 * server, no wallet — so the number on the card can be checked by anyone with
 * the same call.
 */

const RPC_URL = 'https://rpc.test.mezo.org';
/** keccak("balance()") — DemoSafe.balance() returns the vault's token balance. */
const SAFE_BALANCE_SELECTOR = '0xb69ef8a8';
const TIMEOUT_MS = 6000;

export type ChainBalance = { ok: true; value: number } | { ok: false };

export async function fetchVaultBalance(safeAddress: string): Promise<ChainBalance> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: safeAddress, data: SAFE_BALANCE_SELECTOR }, 'latest'],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return { ok: false };

    const body = (await res.json()) as { result?: unknown };
    if (typeof body.result !== 'string' || body.result.length <= 2) return { ok: false };

    return { ok: true, value: Number(BigInt(body.result)) / 1e18 };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}
