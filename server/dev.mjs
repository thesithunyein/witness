#!/usr/bin/env node
/**
 * Local host for the console plus the relayer API.
 *
 * The deployed app is a static Vite build with the API on Vercel. This serves the
 * same built files and the same endpoint locally, so the real console can be
 * exercised end to end without deploying anything.
 *
 *   npm run build && RELAYER_PRIVATE_KEY=0x... npm run relayer
 *
 * Point WITNESS_RPC at a fork to test without spending testnet funds.
 */

import express from 'express';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatch, isConfigured } from './relayer.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = Number(process.env.PORT ?? 8787);
const ORIGIN = `http://localhost:${PORT}`;

const app = express();
app.use(express.json({ limit: '64kb' }));

app.post('/api/relayer', async (req, res) => {
  res.setHeader('cache-control', 'no-store');

  // Same-origin guard, same rule as the serverless entry point.
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    let ok = false;
    try {
      ok = new URL(origin).host === host || origin === ORIGIN;
    } catch {
      ok = false;
    }
    if (!ok) {
      res.status(403).json({ ok: false, error: 'cross-origin request refused' });
      return;
    }
  }

  const { action, ...payload } = req.body ?? {};
  try {
    const out = await dispatch(String(action ?? ''), payload);
    res.status(out.status).json(out.body);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: (err?.shortMessage ?? err?.message ?? 'relayer failed').slice(0, 300),
    });
  }
});

app.use(express.static(resolve(ROOT, 'dist')));

// The app is a single page with path routes, so everything else gets the shell.
app.get('*', (_req, res) => {
  res.type('html').send(readFileSync(resolve(ROOT, 'dist', 'index.html'), 'utf8'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`console  ${ORIGIN}/app`);
  console.log(`relayer  ${isConfigured() ? 'configured' : 'NO KEY (read-only)'}`);
});
