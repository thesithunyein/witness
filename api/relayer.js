/**
 * The only server endpoint the console talks to.
 *
 * POST /api/relayer  { action }
 *
 *   status   -> is the relayer funded and pointed at a deployment
 *   list     -> intents that exist on chain, with their real state
 *   create   -> createIntent with the browser's real passkey public key
 *   digest   -> the action digest the passkey must sign, read from the contract
 *   execute  -> submit an assertion (or, with none, a real over-limit attempt)
 *   revoke   -> revokeIntent, which only the intent's user may do
 *   policy   -> revoke the standing permission, mint one at the requested ceiling
 *   reset    -> the same swap from three known ceilings, so a take starts clean
 *
 * The key lives in the environment and never reaches the browser. Requests from
 * another origin are refused, because this endpoint can move real testnet funds.
 */

import { dispatch, ORIGIN } from '../server/relayer.mjs';

/** policy and reset write several transactions back to back, so give them room. */
export const config = { maxDuration: 60 };

const SAME_ORIGIN = [
  ORIGIN,
  process.env.APP_ORIGIN,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8787',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8787',
].filter(Boolean);

function allowed(req) {
  const origin = req.headers?.origin;
  // A request with no origin is server-to-server, so it is not the browser.
  if (!origin) return false;
  try {
    if (new URL(origin).host === req.headers?.host) return true;
  } catch {
    return false;
  }
  return SAME_ORIGIN.some((o) => o.replace(/\/$/, '') === origin.replace(/\/$/, ''));
}

/** Best-effort throttle: a demo endpoint should not be a faucet. */
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = Number(process.env.RELAYER_RATE ?? 20);
  const row = hits.get(ip) ?? { at: now, count: 0 };
  if (now - row.at > windowMs) {
    row.at = now;
    row.count = 0;
  }
  row.count += 1;
  hits.set(ip, row);
  return row.count > max;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  if (!allowed(req)) {
    res.status(403).json({ ok: false, error: 'cross-origin request refused' });
    return;
  }

  const ip =
    (req.headers['x-forwarded-for'] ?? '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (throttled(ip)) {
    res.status(429).json({ ok: false, error: 'too many requests, slow down' });
    return;
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {});
  const action = String(body.action ?? '');

  try {
    const out = await dispatch(action, body);
    res.status(out.status).json(out.body);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: (err?.shortMessage ?? err?.message ?? 'relayer failed').slice(0, 300),
    });
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
