import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Grid,
  FileText,
  CheckCircle2,
  ShieldAlert,
  Lock,
  Fingerprint,
  Cpu,
  Zap,
  ExternalLink,
  Layers,
  Sparkles,
  ArrowRight,
  Terminal,
  ShieldCheck,
  Award,
} from 'lucide-react';

interface PitchDeckProps {
  onBackToHome: () => void;
  onOpenConsole: () => void;
}

const SLIDES = [
  {
    id: 1,
    title: 'Hardware Passkey Authorization for MUSD Treasuries',
    kicker: 'Mezo Buildathon · AKINDO WaveHack',
    type: 'cover',
  },
  {
    id: 2,
    title: 'The Fatal Flaw in Autonomous AI Agents',
    kicker: 'The Problem',
    type: 'problem',
  },
  {
    id: 3,
    title: 'The Solution: Silicon-Level Authorization',
    kicker: 'Witness Protocol',
    type: 'solution',
  },
  {
    id: 4,
    title: 'End-to-End Security Pipeline',
    kicker: 'Architecture',
    type: 'architecture',
  },
  {
    id: 5,
    title: 'Native MUSD Integration on Mezo',
    kicker: 'Mezo Testnet 31611',
    type: 'mezo',
  },
  {
    id: 6,
    title: 'Cryptographic Security Comparison',
    kicker: 'Threat Model & Security',
    type: 'comparison',
  },
  {
    id: 7,
    title: 'Ecosystem Opportunity & Track Fit',
    kicker: 'Market & Access',
    type: 'market',
  },
  {
    id: 8,
    title: 'Wave 2 Roadmap & Next Milestones',
    kicker: 'Looking Forward',
    type: 'roadmap',
  },
];

export default function PitchDeck({ onBackToHome, onOpenConsole }: PitchDeckProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGridView, setIsGridView] = useState(false);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGridView) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        setCurrentSlide((prev) => Math.min(prev + 1, SLIDES.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentSlide((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGridView, isFullscreen]);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={`space-y-6 ${isFullscreen ? 'fixed inset-0 z-50 bg-[#0d0d0d] p-6 overflow-y-auto' : 'max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-16'}`}>
      {/* Top Deck Toolbar */}
      <div className="flex items-center justify-between gap-4 bg-white/90 backdrop-blur-md border border-zinc-200/90 rounded-2xl p-3 px-5 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToHome}
            className="text-xs font-luckiest tracking-wide text-zinc-600 hover:text-black flex items-center gap-1.5 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to App</span>
          </button>
          <span className="text-zinc-300">|</span>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#c2f325]" />
            <span className="font-luckiest text-sm tracking-wide text-zinc-900">
              Witness Project Deck
            </span>
            <span className="hidden sm:inline-block text-[11px] font-mono text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
              Mezo Buildathon
            </span>
          </div>
        </div>

        {/* View Controls & Slide Counter */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 text-xs font-mono text-zinc-600 bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-200">
            <span>Slide {currentSlide + 1} of {SLIDES.length}</span>
          </div>

          <button
            onClick={() => setIsGridView(!isGridView)}
            className={`p-2 rounded-xl border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              isGridView
                ? 'bg-black text-white border-black'
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
            }`}
            title="Toggle Grid View"
          >
            <Grid className="w-4 h-4" />
            <span className="hidden sm:inline font-luckiest text-[11px]">Grid</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Grid Overview Mode */}
      {isGridView ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
          {SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => {
                setCurrentSlide(idx);
                setIsGridView(false);
              }}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between h-48 group ${
                currentSlide === idx
                  ? 'border-black bg-zinc-900 text-white shadow-md'
                  : 'border-zinc-200 bg-white hover:border-zinc-400 text-zinc-900 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-luckiest px-2 py-0.5 rounded bg-[#c2f325] text-black">
                  Slide {slide.id}
                </span>
                <span className="text-[10px] font-mono opacity-60 uppercase">{slide.kicker}</span>
              </div>
              <h4 className="font-luckiest text-sm line-clamp-2 leading-tight">
                {slide.title}
              </h4>
              <div className="text-[11px] opacity-75 font-inter">Click to view slide</div>
            </button>
          ))}
        </div>
      ) : (
        /* Single Slide Presentation Canvas */
        <div className="relative rounded-3xl border border-zinc-300/80 bg-white shadow-xl overflow-hidden min-h-[580px] flex flex-col justify-between">
          {/* Slide Content Area */}
          <div className="p-8 sm:p-14 flex-1 flex flex-col justify-center">
            {/* SLIDE 1: COVER */}
            {currentSlide === 0 && (
              <div className="text-center max-w-3xl mx-auto space-y-6">
                <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#c2f325]/20 border border-[#c2f325]/60 text-xs font-luckiest tracking-wider uppercase text-zinc-900">
                  <Sparkles className="w-4 h-4 text-zinc-900" />
                  <span>Mezo Buildathon · AKINDO WaveHack 2026</span>
                </div>

                <div className="flex items-center justify-center gap-4 py-2">
                  <img src="/logo.png" alt="Witness" className="h-16 w-16 rounded-2xl shadow-lg border-2 border-black" />
                  <h1 className="font-luckiest text-4xl sm:text-6xl text-zinc-900 tracking-tight">
                    WITNESS PROTOCOL
                  </h1>
                </div>

                <p className="text-lg sm:text-xl font-luckiest text-zinc-700 tracking-wide">
                  Hardware Passkey Authorization for Autonomous On-Chain Workflows & MUSD Treasuries
                </p>

                <p className="text-sm text-zinc-600 max-w-xl mx-auto font-inter leading-relaxed">
                  Decoupling autonomous agent intent formulation from execution authority. Your agents ask. You decide. Zero hot private keys.
                </p>

                <div className="pt-4 flex flex-wrap items-center justify-center gap-3 text-xs font-mono">
                  <span className="px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-semibold">
                    Mezo Testnet (Chain ID 31611)
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-semibold">
                    NIST P-256 WebAuthn
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-semibold">
                    EIP-7212 Precompile (~6,900 gas)
                  </span>
                </div>
              </div>
            )}

            {/* SLIDE 2: THE PROBLEM */}
            {currentSlide === 1 && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="inline-block text-xs font-luckiest text-rose-600 uppercase tracking-wider bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                  The Problem Statement
                </div>
                <h2 className="font-luckiest text-3xl sm:text-4xl text-zinc-900 leading-tight">
                  The $100M+ AI Agent Private Key Vulnerability
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 font-inter">
                  <div className="p-6 rounded-2xl bg-rose-50/70 border border-rose-200/80 space-y-3">
                    <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                      <ShieldAlert className="w-5 h-5" />
                      <span>Status Quo: Catastrophic Risk</span>
                    </div>
                    <p className="text-xs text-rose-950/80 leading-relaxed">
                      Developers currently fund autonomous trading bots, indexing agents, and oracle keepers by pasting raw private keys directly into server environment files (`.env`).
                    </p>
                    <ul className="space-y-2 text-xs text-rose-900/90 list-disc list-inside">
                      <li>Prompt injection attacks can trick agents into transferring all funds.</li>
                      <li>Dependency hacks or server breaches expose full custody.</li>
                      <li>No hardware-enforced limits or human-in-the-loop checkpoints.</li>
                    </ul>
                  </div>

                  <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                    <div className="flex items-center gap-2 text-zinc-800 font-bold text-sm font-luckiest">
                      <Lock className="w-5 h-5 text-zinc-800" />
                      <span>ERC-8004 Identity is Not Enough</span>
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Agent identity standards prove *which* agent sent a request, but cannot verify whether a human actually authorized *this specific payment*.
                    </p>
                    <div className="p-3 rounded-xl bg-white border border-zinc-200 text-xs font-mono text-zinc-700">
                      Result: Billions in Bitcoin-backed MUSD capital remains locked out of autonomous AI economies due to key security risks.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SLIDE 3: THE SOLUTION */}
            {currentSlide === 2 && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="inline-block text-xs font-luckiest text-zinc-800 uppercase tracking-wider bg-[#c2f325]/30 px-3 py-1 rounded-full border border-[#c2f325]/70">
                  The Solution
                </div>
                <h2 className="font-luckiest text-3xl sm:text-4xl text-zinc-900 leading-tight">
                  Deterministic Hardware Enclave Authorization
                </h2>

                <p className="text-sm text-zinc-600 font-inter max-w-2xl">
                  Witness decouples agent intent proposal from execution authority. The agent crafts and queues the intent, but cannot move MUSD without cryptographic hardware verification.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 font-inter">
                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <span className="w-8 h-8 rounded-xl bg-black text-[#c2f325] flex items-center justify-center font-luckiest text-xs">
                      01
                    </span>
                    <h4 className="font-luckiest text-base text-zinc-900">Zero Hot Private Keys</h4>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Agents only hold disposable session keys to sign off-chain EIP-712 envelopes. Never long-term treasury custody.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <span className="w-8 h-8 rounded-xl bg-black text-[#c2f325] flex items-center justify-center font-luckiest text-xs">
                      02
                    </span>
                    <h4 className="font-luckiest text-base text-zinc-900">On-Chain Policy Ceiling</h4>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Autonomous execution runs freely within daily MUSD limits. Out-of-policy requests pause for keeper consent.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <span className="w-8 h-8 rounded-xl bg-black text-[#c2f325] flex items-center justify-center font-luckiest text-xs">
                      03
                    </span>
                    <h4 className="font-luckiest text-base text-zinc-900">Touch ID / Face ID</h4>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Cryptographic assertions generated directly inside Apple Secure Enclave or Titan M2 chips using NIST P-256.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SLIDE 4: ARCHITECTURE PIPELINE */}
            {currentSlide === 3 && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="inline-block text-xs font-luckiest text-zinc-800 uppercase tracking-wider bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200">
                  Architecture Overview
                </div>
                <h2 className="font-luckiest text-3xl sm:text-4xl text-zinc-900 leading-tight">
                  The 4-Step Security Verification Pipeline
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 font-inter text-xs">
                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-luckiest text-[#111110]">Step 01</span>
                      <Terminal className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="font-luckiest text-sm text-zinc-900">Agent Proposal</div>
                    <p className="text-zinc-600 leading-relaxed">
                      Agent creates an EIP-712 typed intent with recipient, MUSD amount, and nonce.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-luckiest text-[#111110]">Step 02</span>
                      <ShieldCheck className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="font-luckiest text-sm text-zinc-900">Policy Check</div>
                    <p className="text-zinc-600 leading-relaxed">
                      `WitnessIntentRegistry` verifies parameters against per-tx and daily ceilings.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-luckiest text-[#111110]">Step 03</span>
                      <Fingerprint className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="font-luckiest text-sm text-zinc-900">Hardware Sign</div>
                    <p className="text-zinc-600 leading-relaxed">
                      WebAuthn prompt signed via biometric hardware enclave. Key never leaves silicon.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-luckiest text-[#111110]">Step 04</span>
                      <Zap className="w-4 h-4 text-[#a3d40e]" />
                    </div>
                    <div className="font-luckiest text-sm text-zinc-900">Safe Execution</div>
                    <p className="text-zinc-600 leading-relaxed">
                      `P256Verifier` (~6,900 gas) validates signature and Safe module disburses MUSD.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#0d0d0d] text-zinc-200 font-mono text-xs">
                  <div className="text-[11px] text-zinc-400 mb-1">On-Chain Verified Execution Path:</div>
                  <code>human (Touch ID) ──▶ P256Verifier.sol (EIP-7212) ──▶ WitnessModule.sol ──▶ SafeProxy.execTransactionFromModule()</code>
                </div>
              </div>
            )}

            {/* SLIDE 5: MEZO & MUSD INTEGRATION */}
            {currentSlide === 4 && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="inline-block text-xs font-luckiest text-zinc-900 uppercase tracking-wider bg-[#c2f325] px-3 py-1 rounded-full">
                  Mezo Buildathon Highlight
                </div>
                <h2 className="font-luckiest text-3xl sm:text-4xl text-zinc-900 leading-tight">
                  Deep Native MUSD Integration on Mezo Testnet
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 font-inter text-xs">
                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                    <h4 className="font-luckiest text-sm text-zinc-900">Verified Contracts (Chain 31611)</h4>
                    <ul className="space-y-2 font-mono text-[11px] text-zinc-700">
                      <li className="flex justify-between border-b border-zinc-200 pb-1">
                        <span className="font-semibold">Safe Treasury Vault:</span>
                        <span className="text-zinc-500 truncate max-w-[150px]">0x6fC45e31...3F14</span>
                      </li>
                      <li className="flex justify-between border-b border-zinc-200 pb-1">
                        <span className="font-semibold">WitnessModule:</span>
                        <span className="text-zinc-500 truncate max-w-[150px]">0x489f07aC...86fe</span>
                      </li>
                      <li className="flex justify-between border-b border-zinc-200 pb-1">
                        <span className="font-semibold">P256Verifier:</span>
                        <span className="text-zinc-500 truncate max-w-[150px]">0x918073b6...a8E0</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="font-semibold">Real Testnet MUSD:</span>
                        <span className="text-zinc-500 truncate max-w-[150px]">0x118917a4...c503</span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                    <h4 className="font-luckiest text-sm text-zinc-900">Live Testnet Proof</h4>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      A real passkey-approved 0.05 MUSD payment has been executed on Mezo Testnet:
                    </p>
                    <div className="p-3 rounded-xl bg-white border border-zinc-200 font-mono text-[11px] text-zinc-800 break-all">
                      Tx: 0x2f4d2a75aa9db940170a1306f58962e3755255b71ee2f6532a2a7bbdb047d9d5
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Status: Success · AuthorizedTransfer + MUSD Transfer</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SLIDE 6: SECURITY MATRIX */}
            {currentSlide === 5 && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="inline-block text-xs font-luckiest text-zinc-800 uppercase tracking-wider bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200">
                  Security Benchmarking
                </div>
                <h2 className="font-luckiest text-3xl sm:text-4xl text-zinc-900 leading-tight">
                  Cryptographic Key Security Comparison
                </h2>

                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left font-inter text-xs border border-zinc-200 rounded-xl overflow-hidden">
                    <thead className="bg-zinc-100 text-zinc-800 font-luckiest text-sm uppercase">
                      <tr>
                        <th className="p-3">Model</th>
                        <th className="p-3">Key Storage</th>
                        <th className="p-3">Prompt Injection Defense</th>
                        <th className="p-3">Phishing Defense</th>
                        <th className="p-3">On-Chain Gas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 text-zinc-700">
                      <tr className="bg-rose-50/50">
                        <td className="p-3 font-semibold text-rose-900">Raw Hot Keys (.env)</td>
                        <td className="p-3">Plaintext Server Memory</td>
                        <td className="p-3 text-rose-700 font-bold">ZERO (Drained)</td>
                        <td className="p-3 text-rose-700 font-bold">None</td>
                        <td className="p-3">~21,000 gas</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold">Standard Multi-Sig</td>
                        <td className="p-3">Browser Extensions</td>
                        <td className="p-3">Manual approval only</td>
                        <td className="p-3">Vulnerable</td>
                        <td className="p-3">~65,000 gas</td>
                      </tr>
                      <tr className="bg-emerald-50/60 font-medium">
                        <td className="p-3 font-bold text-zinc-900 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Witness (NIST P-256)</span>
                        </td>
                        <td className="p-3 text-emerald-900 font-semibold">Apple / Titan Secure Enclave</td>
                        <td className="p-3 text-emerald-900 font-bold">Automated Ceilings + Touch ID</td>
                        <td className="p-3 text-emerald-900 font-bold">WebAuthn Domain Locked</td>
                        <td className="p-3 text-emerald-900 font-bold">~6,900 gas (EIP-7212)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-zinc-600 pt-1">
                  <span>Foundry Quality Standard: 40/40 Passing Tests</span>
                  <span>100% Strict `forge fmt` Compliance</span>
                </div>
              </div>
            )}

            {/* SLIDE 7: MARKET & TRACK FIT */}
            {currentSlide === 6 && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="inline-block text-xs font-luckiest text-zinc-800 uppercase tracking-wider bg-[#c2f325]/30 px-3 py-1 rounded-full border border-[#c2f325]/70">
                  Track Alignment & Market Impact
                </div>
                <h2 className="font-luckiest text-3xl sm:text-4xl text-zinc-900 leading-tight">
                  Bringing 2B+ Devices into the Bitcoin Economy
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 font-inter text-xs">
                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <div className="font-luckiest text-base text-zinc-900">Track 2: Access & Distribution</div>
                    <p className="text-zinc-600 leading-relaxed">
                      Every iPhone, Android phone, MacBook, and Windows PC has a built-in cryptographic chip. Witness lets users authenticate directly with biometric hardware without installing wallets or managing seed phrases.
                    </p>
                    <div className="text-[11px] font-mono text-zinc-800 font-semibold">
                      Key metric: Zero onboarding friction for non-technical treasury keepers.
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <div className="font-luckiest text-base text-zinc-900">Track 1: DeFi Treasury Security</div>
                    <p className="text-zinc-600 leading-relaxed">
                      MUSD is Mezo&apos;s Bitcoin-backed stablecoin. To enable institutional DeFi borrow-and-lend strategies, automated managers need programmatic safety ceilings that prevent liquidation exploits.
                    </p>
                    <div className="text-[11px] font-mono text-zinc-800 font-semibold">
                      Key metric: Safeguards MUSD yield loops and auto-compounding vaults.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SLIDE 8: ROADMAP */}
            {currentSlide === 7 && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="inline-block text-xs font-luckiest text-zinc-900 uppercase tracking-wider bg-[#c2f325] px-3 py-1 rounded-full">
                  Wave 2 & Beyond
                </div>
                <h2 className="font-luckiest text-3xl sm:text-4xl text-zinc-900 leading-tight">
                  Roadmap: Compounding Momentum for Wave 2
                </h2>

                <div className="space-y-3 pt-2 font-inter text-xs">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-luckiest text-sm text-emerald-950">Wave 1 Delivered (October 2026)</div>
                      <p className="text-emerald-900/80 leading-relaxed mt-0.5">
                        Mezo Testnet verified deployment (31611), Safe multi-sig MUSD module, NIST P-256 verifier, interactive console, and 40 passing Foundry test suites.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-start gap-3">
                    <Layers className="w-5 h-5 text-zinc-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-luckiest text-sm text-zinc-900">Wave 2 Milestone 1: LangChain & Eliza Plugins</div>
                      <p className="text-zinc-600 leading-relaxed mt-0.5">
                        1-click SDK adapters for Python and TypeScript agent frameworks to request MUSD disbursements with 3 lines of code.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-zinc-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-luckiest text-sm text-zinc-900">Wave 2 Milestone 2: Native MEZO Staking Intent</div>
                      <p className="text-zinc-600 leading-relaxed mt-0.5">
                        Expanding policy modules to support delegated MEZO token staking and automated MUSD/MEZO yield farming.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <div className="text-xs font-mono text-zinc-500">
                    Built for the Mezo Bitcoin Economic Layer
                  </div>
                  <button
                    onClick={onOpenConsole}
                    className="px-5 py-2.5 rounded-xl bg-black hover:bg-zinc-800 text-white font-luckiest text-xs tracking-wide transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Launch Live Console</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Slide Footer Navigation Bar */}
          <div className="border-t border-zinc-200/80 bg-zinc-50/90 px-6 py-4 flex items-center justify-between">
            <button
              onClick={() => setCurrentSlide((prev) => Math.max(prev - 1, 0))}
              disabled={currentSlide === 0}
              className="px-4 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-luckiest tracking-wide transition cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            {/* Slide Dots Indicator */}
            <div className="flex items-center gap-1.5">
              {SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    currentSlide === idx ? 'w-8 bg-black' : 'w-2 bg-zinc-300 hover:bg-zinc-400'
                  }`}
                  title={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>

            <button
              onClick={() => setCurrentSlide((prev) => Math.min(prev + 1, SLIDES.length - 1))}
              disabled={currentSlide === SLIDES.length - 1}
              className="px-4 py-2 rounded-xl bg-black hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-luckiest tracking-wide transition cursor-pointer flex items-center gap-1"
            >
              <span>Next Slide</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
