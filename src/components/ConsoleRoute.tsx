import { useEffect, useState } from 'react';
import ChainConsole from './ChainConsole';
import VaultQuiet from './VaultQuiet';
import TrovePanel from './TrovePanel';
import { relayer } from '../lib/relayerClient';

export default function ConsoleRoute() {
  const [mode, setMode] = useState<'checking' | 'chain' | 'quiet'>('checking');

  useEffect(() => {
    let cancelled = false;
    relayer
      .status()
      .then((res) => {
        if (!cancelled) setMode(res.status.configured ? 'chain' : 'quiet');
      })
      .catch(() => {
        if (!cancelled) setMode('quiet');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === 'chain') {
    return (
      <>
        <ChainConsole />
        <TrovePanel />
      </>
    );
  }
  if (mode === 'quiet') return <VaultQuiet />;

  return (
    <div className="mx-auto max-w-6xl px-5 py-24">
      <p className="text-sm text-muted">Reading the vault…</p>
    </div>
  );
}
