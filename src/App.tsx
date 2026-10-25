import { useState, useEffect } from 'react';
import LandingHero from './components/LandingHero';
import ApprovalsDashboard from './components/ApprovalsDashboard';
import SecurityAndContracts from './components/SecurityAndContracts';
import IntegratorDocs from './components/IntegratorDocs';
import PitchDeck from './components/PitchDeck';
import { ExternalLink, Lock } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'product' | 'console' | 'security' | 'docs' | 'deck'>('product');

  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/deck' || hash === '#deck') {
        setActiveTab('deck');
      } else if (path === '/app' || path === '/console') {
        setActiveTab('console');
      } else if (path === '/docs' || path === '/integrate' || hash === '#docs') {
        setActiveTab('docs');
      } else if (path === '/security') {
        setActiveTab('security');
      }
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    return () => window.removeEventListener('popstate', checkRoute);
  }, []);

  const handleTabChange = (tab: 'product' | 'console' | 'security' | 'docs' | 'deck') => {
    setActiveTab(tab);
    if (tab === 'deck') {
      window.history.pushState(null, '', '/deck');
    } else {
      if (window.location.pathname === '/deck') {
        window.history.pushState(null, '', '/');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f3f1] text-[#111110] font-sans antialiased selection:bg-[#c2f325] selection:text-[#111110] flex flex-col justify-between relative overflow-x-hidden">
      {/* Background ambient lighting matching reference screenshot - scoped to top hero */}
      <div className="absolute top-0 left-0 right-0 h-[600px] pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-white/70 blur-3xl" />
      </div>

      {/* Floating Centered Navigation Bar from Reference Screenshot */}
      <header className="sticky top-4 z-50 w-full px-4 sm:px-6">
        <div className="max-w-2xl mx-auto bg-white/90 backdrop-blur-md border border-zinc-300/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] px-4 py-2 flex items-center justify-between gap-4">
          {/* Logo Mark */}
          <button
            onClick={() => setActiveTab('product')}
            className="flex items-center gap-2 cursor-pointer group select-none shrink-0"
          >
            <img
              src="/logo.png"
              alt="Witness Protocol"
              className="h-7 w-7 rounded-lg object-contain transition-transform group-hover:scale-105 group-hover:rotate-[-3deg] shadow-xs"
            />
            <span
              className="font-luckiest text-base tracking-wider text-[#111110] select-none"
              style={{ fontFamily: "'Luckiest Guy', cursive, sans-serif" }}
            >
              WITNESS
            </span>
          </button>

          {/* Center Navigation Links */}
          <nav className="flex items-center gap-1 sm:gap-4 text-[13px] font-medium text-[#4b4b49]">
            <button
              onClick={() => handleTabChange('product')}
              className={`px-2 py-1 transition cursor-pointer ${
                activeTab === 'product'
                  ? 'text-black font-semibold'
                  : 'hover:text-black'
              }`}
            >
              Home
            </button>

            <button
              onClick={() => handleTabChange('console')}
              className={`px-2 py-1 transition cursor-pointer ${
                activeTab === 'console'
                  ? 'text-black font-semibold'
                  : 'hover:text-black'
              }`}
            >
              Console
            </button>

            <button
              onClick={() => handleTabChange('security')}
              className={`px-2 py-1 transition cursor-pointer ${
                activeTab === 'security'
                  ? 'text-black font-semibold'
                  : 'hover:text-black'
              }`}
            >
              Security
            </button>

            <button
              onClick={() => handleTabChange('docs')}
              className={`px-2 py-1 transition cursor-pointer ${
                activeTab === 'docs'
                  ? 'text-black font-semibold'
                  : 'hover:text-black'
              }`}
            >
              Docs
            </button>
          </nav>

          {/* Right Action: Black Rectangular Button */}
          <button
            onClick={() => handleTabChange('console')}
            className="bg-black hover:bg-neutral-800 text-white text-[13px] font-medium px-4 py-1.5 transition cursor-pointer border border-black active:scale-[0.98] shrink-0 select-none font-luckiest tracking-wide"
          >
            Launch App
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full flex-1 z-10 py-4 sm:py-6">
        {activeTab === 'product' && (
          <LandingHero
            onLaunchConsole={() => handleTabChange('console')}
            onViewContracts={() => handleTabChange('security')}
            onViewDocs={() => handleTabChange('docs')}
          />
        )}
        {activeTab === 'console' && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <ApprovalsDashboard />
          </div>
        )}
        {activeTab === 'security' && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <SecurityAndContracts />
          </div>
        )}
        {activeTab === 'docs' && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <IntegratorDocs />
          </div>
        )}
        {activeTab === 'deck' && (
          <PitchDeck
            onBackToHome={() => handleTabChange('product')}
            onOpenConsole={() => handleTabChange('console')}
          />
        )}
      </main>

      {/* High-Contrast Pitch Black Footer */}
      <footer className="relative z-30 border-t-2 border-zinc-800 bg-[#000000] text-white mt-20 pt-14 pb-12 shadow-[0_-10px_30px_rgba(0,0,0,0.15)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-zinc-800">
            {/* Col 1: Brand Info (5 cols) */}
            <div className="space-y-4 md:col-span-5">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="Witness Protocol"
                  className="h-10 w-10 rounded-xl object-contain shadow-md border-2 border-zinc-700 bg-black shrink-0"
                />
                <span
                  className="font-luckiest text-2xl tracking-wide text-white drop-shadow-sm select-none"
                  style={{ fontFamily: "'Luckiest Guy', cursive, sans-serif" }}
                >
                  WITNESS PROTOCOL
                </span>
              </div>
              <p className="font-inter text-sm text-zinc-200 max-w-sm leading-relaxed">
                Hardware passkey authorization for autonomous treasury workflows. Built on NIST P-256 curves and Safe multi-sig architecture.
              </p>
              <div className="inline-flex items-center gap-2 text-xs font-mono text-zinc-100 bg-[#161616] px-3.5 py-1.5 rounded-full border border-zinc-700 shadow-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-[#c2f325] ring-2 ring-[#c2f325]/40" />
                <span className="font-medium">Contracts verified on Mezo & Monad Testnets</span>
              </div>
            </div>

            {/* Col 2: Navigation Links (2 cols) */}
            <div className="space-y-3 md:col-span-2">
              <h4 className="font-luckiest text-base tracking-wider text-[#c2f325] uppercase">
                Product
              </h4>
              <ul className="space-y-2.5 font-inter text-sm text-zinc-200">
                <li>
                  <button
                    onClick={() => handleTabChange('product')}
                    className="hover:text-[#c2f325] hover:translate-x-0.5 transition-all cursor-pointer font-medium text-left"
                  >
                    Architecture
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleTabChange('console')}
                    className="hover:text-[#c2f325] hover:translate-x-0.5 transition-all cursor-pointer font-medium text-left"
                  >
                    Live Console
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleTabChange('security')}
                    className="hover:text-[#c2f325] hover:translate-x-0.5 transition-all cursor-pointer font-medium text-left"
                  >
                    Security & Audits
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleTabChange('docs')}
                    className="hover:text-[#c2f325] hover:translate-x-0.5 transition-all cursor-pointer font-medium text-left"
                  >
                    Developer Docs
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleTabChange('deck')}
                    className="hover:text-[#c2f325] hover:translate-x-0.5 transition-all cursor-pointer font-medium text-left flex items-center gap-1.5"
                  >
                    <span>Pitch Deck (/deck)</span>
                    <span className="text-[10px] font-luckiest bg-[#c2f325] text-black px-1.5 py-0.5 rounded leading-none">
                      SLIDES
                    </span>
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3: Smart Contracts (2.5 cols) */}
            <div className="space-y-3 md:col-span-3">
              <h4 className="font-luckiest text-base tracking-wider text-[#c2f325] uppercase">
                Contracts & Tech
              </h4>
              <ul className="space-y-2.5 font-inter text-sm text-zinc-200">
                <li>
                  <span className="font-mono text-xs text-[#c2f325] bg-[#161616] px-2.5 py-1 rounded-md border border-zinc-700 inline-block font-bold">
                    P256Verifier.sol
                  </span>
                </li>
                <li>
                  <span className="font-mono text-xs text-[#c2f325] bg-[#161616] px-2.5 py-1 rounded-md border border-zinc-700 inline-block font-bold">
                    Deploy.s.sol
                  </span>
                </li>
                <li className="text-xs text-zinc-300 pt-0.5 font-mono">
                  EIP-7212 Precompile Standard
                </li>
                <li className="text-xs text-zinc-200 font-mono font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#c2f325]" />
                  <span>Foundry Format: 100% Passing</span>
                </li>
              </ul>
            </div>

            {/* Col 4: Resources & External (2 cols) */}
            <div className="space-y-3 md:col-span-2">
              <h4 className="font-luckiest text-base tracking-wider text-[#c2f325] uppercase">
                Ecosystem
              </h4>
              <ul className="space-y-2.5 font-inter text-sm text-zinc-200">
                <li>
                  <a
                    href="https://explorer.test.mezo.org"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[#c2f325] flex items-center gap-1.5 transition-colors font-medium text-zinc-200"
                  >
                    <span>Mezo Explorer</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#c2f325]" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/thesithunyein/witness/"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[#c2f325] flex items-center gap-1.5 transition-colors font-medium text-zinc-200"
                  >
                    <span>GitHub Repo</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#c2f325]" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://eips.ethereum.org/EIPS/eip-7212"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[#c2f325] flex items-center gap-1.5 transition-colors font-medium text-zinc-200"
                  >
                    <span>EIP-7212 Spec</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#c2f325]" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-inter text-xs text-zinc-300">
            <div>
              © 2025 Witness Protocol. Open source protocol under MIT license.
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-zinc-200">
              <span className="px-3 py-1 bg-[#161616] rounded-md border border-zinc-700 text-zinc-200">
                Zero Telemetry
              </span>
              <span className="text-zinc-600">·</span>
              <span className="px-3 py-1 bg-[#161616] rounded-md border border-zinc-700 text-zinc-200">
                Local Enclave Signatures
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
