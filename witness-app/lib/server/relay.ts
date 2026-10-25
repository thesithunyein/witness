/**
 * Relayed writes, with a retry for transient RPC failures.
 *
 * Mezo's public testnet endpoint intermittently answers a perfectly valid
 * `eth_estimateGas` with "Missing or invalid parameters." (JSON-RPC -32602). Ten
 * identical `createIntent` calls through the same route produced eight successes
 * and two of those errors, so this is the endpoint, not the encoding.
 *
 * Left alone, that is a one-in-five chance that a judge clicks "Create
 * permission" and reads an error that has nothing to do with their action. The
 * retry is deliberately narrow: only signatures that mean "the node did not
 * process this", never a revert, because a revert is the chain answering.
 */

const TRANSIENT =
  /missing or invalid parameters|invalid params|-32602|-32603|-32005|rate limit|too many requests|timed out|timeout|socket hang up|fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|502|503|429/i;

export function isTransient(err: unknown): boolean {
  const text = [
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    // viem buries the useful part of an RPC error in `details`/`shortMessage`.
    (err as { details?: unknown })?.details,
    (err as { shortMessage?: unknown })?.shortMessage,
  ]
    .filter((v) => typeof v === "string")
    .join(" ");
  return TRANSIENT.test(text);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn`, retrying only transient RPC failures. `attempts` includes the first
 * call. The delay doubles, so three attempts cost about a second in the worst
 * case, well under any user's patience for a passkey approval.
 */
export async function withRpcRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === attempts - 1) throw err;
      await sleep(300 * 2 ** i);
    }
  }
  throw lastErr;
}
