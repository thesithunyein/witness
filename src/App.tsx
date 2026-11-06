import { useEffect, useState } from 'react';
import ProductHome from './components/ProductHome';
import ConsoleRoute from './components/ConsoleRoute';
import Record from './components/Record';
import Mark from './components/Mark';

type View = 'home' | 'vault' | 'record';

export default function App() {
  const [view, setView] = useState<View>('home');

  useEffect(() => {
    const sync = () => {
      const path = window.location.pathname;
      if (path === '/app' || path === '/console') setView('vault');
      else if (path === '/security' || path === '/docs' || path === '/integrate') setView('record');
      else setView('home');
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const go = (next: View) => {
    setView(next);
    const path = next === 'vault' ? '/app' : next === 'record' ? '/security' : '/';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 bg-paper/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-[clamp(16px,2.6vw,28px)]">
          <div className="flex items-center gap-3.5">
            <button onClick={() => go('home')} className="flex items-center gap-3.5">
              <Mark className="h-7 w-7 text-ink" />
              <span className="text-[22px] font-light text-dim">/</span>
              <span className="font-display text-2xl leading-none tracking-tight">Witness</span>
            </button>
            <nav className="ml-3 hidden items-center gap-5 text-sm text-muted md:flex">
              <NavButton active={view === 'vault'} onClick={() => go('vault')}>Vault</NavButton>
              <NavButton active={view === 'record'} onClick={() => go('record')}>Record</NavButton>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => go('vault')}
              className="hidden h-9 rounded-lg border border-white/12 bg-white/4 px-3 text-sm font-medium text-ink hover:bg-white/8 sm:inline-flex sm:items-center"
            >
              Open vault
            </button>
            <a
              href="https://github.com/thesithunyein/witness"
              aria-label="GitHub"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white/6 hover:text-ink"
            >
              <GitHub />
            </a>
          </div>
        </div>
      </header>

      <main>
        {view === 'home' && <ProductHome onOpen={() => go('vault')} onRecord={() => go('record')} />}
        {view === 'vault' && <ConsoleRoute />}
        {view === 'record' && <Record />}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Mark className="h-6 w-6 text-ink" />
            <p className="text-sm text-muted">Passkey approvals for a treasury.</p>
          </div>
          <a
            href="https://github.com/thesithunyein/witness"
            className="text-sm text-ink underline-offset-4 hover:underline"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

function GitHub() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.32.1-2.75 0 0 .84-.27 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.43.2 2.49.1 2.75.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.81 0 .27.18.59.69.48A10.04 10.04 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-10 rounded-full px-3 ${active ? 'text-ink' : 'hover:text-ink'}`}
    >
      {children}
    </button>
  );
}
