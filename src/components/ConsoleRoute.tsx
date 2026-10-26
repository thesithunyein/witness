import { useEffect, useState } from 'react';
import ApprovalsDashboard from './ApprovalsDashboard';
import ChainConsole from './ChainConsole';
import { relayer } from '../lib/relayerClient';

/**
 * One console, two honest modes.
 *
 * If the relayer answers and reports a key, every row is read from the registry
 * and every action goes through the chain. If it does not, the page falls back to
 * the illustrative queue, which is what the static deployment serves today.
 *
 * The probe matters: it means adding the API does not require a second build, and
 * a deployment without one keeps working exactly as before.
 */
export default function ConsoleRoute() {
  const [mode, setMode] = useState<'checking' | 'chain' | 'demo'>('checking');

  useEffect(() => {
    let cancelled = false;
    relayer
      .status()
      .then((res) => {
        if (!cancelled) setMode(res.status.configured ? 'chain' : 'demo');
      })
      .catch(() => {
        if (!cancelled) setMode('demo');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === 'chain') return <ChainConsole />;
  if (mode === 'demo') return <ApprovalsDashboard />;

  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-zinc-500">
        PASSKEY CONTROL PLANE
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-tight text-[#0d0d0d]">Treasury Console</h1>
      <p className="mt-3 text-sm text-zinc-600">Reading the registry...</p>
    </div>
  );
}
