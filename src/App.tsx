import { useEffect, useState } from 'react';
import ProductHome from './components/ProductHome';
import ConsoleRoute from './components/ConsoleRoute';
import Record from './components/Record';

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
      <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <button onClick={() => go('home')} className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-display text-[1.35rem] leading-none tracking-tight">Witness</span>
          </button>
          <nav className="flex items-center gap-1 text-sm text-muted">
            <NavButton active={view === 'home'} onClick={() => go('home')}>
              Overview
            </NavButton>
            <NavButton active={view === 'vault'} onClick={() => go('vault')}>
              Vault
            </NavButton>
            <NavButton active={view === 'record'} onClick={() => go('record')}>
              Record
            </NavButton>
          </nav>
          <button
            onClick={() => go('vault')}
            className="hidden h-10 rounded-full bg-ink px-4 text-sm font-medium text-paper sm:inline-flex sm:items-center"
          >
            Open vault
          </button>
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
            <img src="/logo.png" alt="" className="h-7 w-7 rounded-md object-cover" />
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
