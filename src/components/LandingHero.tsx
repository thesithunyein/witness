import { useState } from 'react';
import {
  ArrowRight,
  Lock,
  KeyRound,
  ShieldCheck,
  Cpu,
  Check,
  Sliders,
  ExternalLink,
  Zap,
  Smartphone,
  Fingerprint,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Layers,
  Terminal,
  CheckCircle2,
} from 'lucide-react';

interface FAQItem {
  category: 'General' | 'Mezo & MUSD' | 'Security' | 'Architecture' | 'Developers';
  question: string;
  answer: string;
  highlight?: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    category: 'General',
    question: 'What is Witness Protocol and what problem does it solve?',
    answer:
      'Witness Protocol is a hardware passkey authorization layer built for autonomous on-chain agents. Autonomous AI agents need to pay for RPCs, indexers, data feeds, and DeFi rebalancing. However, giving agents unfettered private key access risks complete treasury drainage upon prompt injections or software exploits. Witness lets agents draft and queue intents, while transactions exceeding policy ceilings require instant biometric confirmation from your iPhone, Android, or hardware key.',
    highlight: 'Zero hot private keys stored in agent memory or cloud servers.',
  },
  {
    category: 'Mezo & MUSD',
    question: 'How does Witness support MUSD and MEZO on the Mezo Network?',
    answer:
      'Witness is natively deployed on the Mezo Testnet (Chain ID 31611) to safeguard MUSD and MEZO treasuries. Using the Treasury Console, owners set active spending ceilings (e.g., 5.00 MUSD/day). Automated agent workflows transfer MUSD within normal parameters autonomously, but any intent above the ceiling triggers a cryptographic WebAuthn hardware challenge, keeping your Bitcoin-backed stablecoins completely protected.',
    highlight: 'Full native compatibility with Mezo Testnet Safe treasuries and MUSD.',
  },
  {
    category: 'Security',
    question: 'Why use NIST P-256 Passkeys instead of standard Web3 seed phrases?',
    answer:
      'Standard EVM wallets use secp256k1 curves, which can be extracted from memory, phishing websites, or stolen laptop filesystems. NIST P-256 is the global hardware security standard used by Apple Secure Enclave, Android Titan M2, and FIDO2 YubiKeys. Private keys are generated inside isolated physical silicon chips and can never be read or exported—even if your operating system is compromised.',
    highlight: 'Hardware-level protection with Touch ID, Face ID, and Windows Hello.',
  },
  {
    category: 'Architecture',
    question: 'How does Witness verify passkey signatures on-chain without high gas fees?',
    answer:
      'Witness calls one verifier at one address shape. On Monad that is the native 0x0100 precompile, about 6,900 gas. Mezo has no such precompile, so the same 160-byte ABI is served by a deployed P256Verifier contract, which costs more but needs no chain support. The integration does not change either way.',
    highlight: 'One verifier ABI, native on Monad and deployed on Mezo.',
  },
  {
    category: 'Security',
    question: 'How does the vault integration work?',
    answer:
      'Witness authorizes a purpose-built vault contract, DemoSafe, which holds the MUSD and has exactly two gated outbound paths. On a request, DemoSafe calls WitnessVerifier, which checks the enrolled passkey signature against the exact action digest, then releases the funds and consumes the permission. There is no module and no Safe proxy: the check lives inside the contract that holds the value.',
    highlight: 'Non-custodial, modular design compatible with battle-tested Safe vaults.',
  },
  {
    category: 'Developers',
    question: 'How do developers integrate Witness into their AI agent frameworks?',
    answer:
      'Developers can integrate with 3 lines of TypeScript using @witness/sdk. The agent submits a request and holds no key that can move funds; the human passkey signs the canonical action digest read from DemoSafe, and the relayer submits it. Every action needs that tap, and the permission ceiling bounds what the tap can authorize.',
    highlight: 'Works with LangChain, AutoGPT, Eliza, and custom TypeScript agents.',
  },
  {
    category: 'Developers',
    question: 'Are the contracts audited and compliant with Foundry standards?',
    answer:
      'Yes. All contracts—including P256Verifier.sol and Deploy.s.sol—are 100% compliant with canonical Foundry formatting (forge fmt) and tested across comprehensive unit and invariant test suites. Configuration parameters (origin and rpId) are immutably locked on-chain to prevent cross-site replay attacks.',
    highlight: '41/41 test suites passing with zero formatting discrepancies.',
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Agent Formulates Intent',
    subtitle: 'Off-chain non-custodial proposal',
    desc: 'Autonomous AI agents or bots draft transaction parameters in MUSD while holding no key that can move funds. Nothing is signed at this stage: the agent can only ask, and the approval that authorizes the transfer is the human passkey over the canonical action digest.',
    badge: 'Unsigned Request',
    codeSnippet: `// Agent submits intent without private keys
const intent = await witness.createIntent({
  token: 'MUSD',
  amount: parseEther('1.20'),
  recipient: '0x8841...e319',
  action: 'ORACLE_KEEPER_REFUEL'
});`,
    icon: Terminal,
  },
  {
    step: '02',
    title: 'Policy Engine Evaluates',
    subtitle: 'Automated ceiling enforcement',
    desc: 'WitnessIntentRegistry holds the ceiling and expiry the human set when granting the permission. The ceiling is a bound, not an autopilot: it caps what a single approval can authorize, and an attempt above it is refused on chain even if a signature is present.',
    badge: 'On-Chain Policy Guard',
    codeSnippet: `// WitnessIntentRegistry.sol
if (intent.amount <= policy.ceilingPerTx &&
    dailySpent + intent.amount <= policy.dailyCeiling) {
  emit IntentAutoApproved(intent.nonce);
} else {
  revert REQUIRES_BIOMETRIC_CONSENT();
}`,
    icon: Sliders,
  },
  {
    step: '03',
    title: 'Hardware Biometric Consent',
    subtitle: 'Silicon-level signature generation',
    desc: 'Every action that moves value carries a fresh WebAuthn assertion. A Touch ID, Face ID, or YubiKey tap triggers the physical Secure Enclave to generate an authentic NIST P-256 signature, and an over-ceiling attempt is refused before anyone is asked to tap.',
    badge: 'NIST P-256 Enclave',
    codeSnippet: `// Browser WebAuthn API to Secure Enclave
const assertion = await navigator.credentials.get({
  publicKey: {
    challenge: intentHash,
    rpId: 'witness-agent.vercel.app',
    userVerification: 'required' // Touch ID
  }
});`,
    icon: Fingerprint,
  },
  {
    step: '04',
    title: 'Treasury Disbursal',
    subtitle: '~327k gas measured end to end',
    desc: 'The verifier checks the assertion, natively on Monad and through a deployed contract on Mezo. AgentExecutor submits the call to DemoSafe, which releases MUSD to the destination and consumes the permission.',
    badge: 'DemoSafe Treasury',
    codeSnippet: `// AgentExecutor.sol -> DemoSafe.sol
executor.executeTransfer(intentId, recipient, amount, assertion);
// DemoSafe -> WitnessVerifier: Allowed, and the permission is consumed`,
    icon: ShieldCheck,
  },
];

interface LandingHeroProps {
  onLaunchConsole: () => void;
  onViewContracts: () => void;
  onViewDocs: () => void;
}

const DEMO_INTENTS = [
  {
    id: 'indexer',
    title: 'Research Indexer API',
    agent: 'SubQuery Node #4',
    amount: '0.05 MUSD',
    numericAmount: 0.05,
    recipient: '0x8841...e319',
    nonce: 184,
  },
  {
    id: 'keeper',
    title: 'Oracle Keeper Gas Refuel',
    agent: 'Gelato Keeper Task',
    amount: '1.20 MUSD',
    numericAmount: 1.20,
    recipient: '0x43b2...a891',
    nonce: 185,
  },
  {
    id: 'rebalance',
    title: 'Uniswap v3 LP Rebalance',
    agent: 'Autonomous Arbitrageur',
    amount: '14.50 MUSD',
    numericAmount: 14.50,
    recipient: '0x17f9...cc02',
    nonce: 186,
  },
];

export default function LandingHero({ onLaunchConsole, onViewContracts, onViewDocs }: LandingHeroProps) {
  const [selectedIntentIndex, setSelectedIntentIndex] = useState(0);
  const [signedIntentId, setSignedIntentId] = useState<string | null>(null);
  const [isSimulatingSign, setIsSimulatingSign] = useState(false);
  const [ceilingSliderValue, setCeilingSliderValue] = useState(50);
  const [selectedAuthDevice, setSelectedAuthDevice] = useState<'touchid' | 'faceid' | 'yubikey'>('touchid');

  // How It Works state
  const [activeHowStep, setActiveHowStep] = useState(0);

  // FAQ interactive state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<string>('All');

  const filteredFaqs =
    selectedFaqCategory === 'All'
      ? FAQ_ITEMS
      : FAQ_ITEMS.filter((f) => f.category === selectedFaqCategory);

  const currentIntent = DEMO_INTENTS[selectedIntentIndex];
  const isOverCeiling = currentIntent.numericAmount > ceilingSliderValue;

  const handleSimulateSign = () => {
    setIsSimulatingSign(true);
    setTimeout(() => {
      setIsSimulatingSign(false);
      setSignedIntentId(currentIntent.id);
    }, 700);
  };

  const scrollToFeatures = () => {
    const el = document.getElementById('features-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-20 pb-16">
      {/* 1. HERO CANVAS MATCHING USER REFERENCE SCREENSHOT (image_6a91da7b.png) */}
      <section className="max-w-6xl mx-auto px-2 sm:px-4">
        <div className="relative rounded-3xl border border-zinc-200/90 halftone-grid shadow-[0_20px_70px_rgba(0,0,0,0.04)] overflow-hidden pt-16 sm:pt-24 pb-0 flex flex-col items-center text-center">
          
          {/* Subtle top micro-spec */}
          <div className="mb-6 inline-flex items-center gap-2 text-[11px] font-mono text-zinc-500 bg-white/80 px-3 py-1 rounded-full border border-zinc-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c2f325] ring-2 ring-[#c2f325]/30" />
            <span>Witness Protocol · NIST P-256 Passkeys</span>
          </div>

          {/* Headline matching user reference image */}
          <h1 className="text-4xl sm:text-5xl md:text-[64px] lg:text-[70px] font-semibold tracking-[-0.035em] text-[#111110] leading-[1.12] max-w-4xl mx-auto px-4">
            Your agent asks.<br />
            You approve that exact payment.
          </h1>

          {/* Subtitle matching user reference image */}
          <p className="text-[14px] sm:text-[16px] text-[#555552] font-normal leading-relaxed max-w-xl mx-auto px-4 mt-5 tracking-[-0.015em]">
            One passkey signature over the chain, the contract, the asset, the recipient and the amount, checked before value moves.
          </p>

          {/* Two Rectangular CTA Buttons matching user reference image */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-7 z-10">
            <button
              onClick={onLaunchConsole}
              className="bg-black hover:bg-neutral-800 text-white text-[13px] font-medium px-5 py-2.5 border border-black transition cursor-pointer active:scale-[0.98] select-none"
            >
              Open the console
            </button>

            <button
              onClick={scrollToFeatures}
              className="bg-white hover:bg-neutral-50 text-black text-[13px] font-medium px-5 py-2.5 border border-black transition cursor-pointer active:scale-[0.98] select-none"
            >
              See how it works
            </button>
          </div>

          <p className="text-[12px] text-zinc-500 mt-4 max-w-md mx-auto px-4">
            No wallet, no seed phrase, no gas. The relayer submits; only your passkey can approve.
          </p>

          {/* Halftone Hands Graphic Spanning the Bottom Viewport from Reference Image */}
          <div className="w-full mt-6 sm:mt-10 overflow-hidden relative flex items-center justify-center select-none pointer-events-none">
            <img
              src="/handshake.png"
              alt="Two hands meeting in a halftone field"
              className="w-full max-w-5xl object-contain opacity-100 transition-transform duration-700"
            />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8 pt-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-200/80 pb-6">
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#c2f325]/20 border border-[#c2f325]/50 text-xs font-luckiest tracking-wider uppercase text-zinc-900">
              <Layers className="w-3.5 h-3.5 text-zinc-900" />
              <span>4-Step Security Pipeline</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.035em] text-[#111110]">
              How Witness Works
            </h2>
            <p className="text-sm text-zinc-600 max-w-2xl font-inter">
              From autonomous agent proposal to biometric hardware verification and treasury disbursal on Mezo.
            </p>
          </div>

          <div className="flex items-center gap-2 self-center sm:self-auto text-xs font-mono text-zinc-500 bg-white px-3 py-1.5 rounded-xl border border-zinc-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#c2f325] animate-pulse" />
            <span>Interactive Workflow Explorer</span>
          </div>
        </div>

        {/* 4 Step Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {HOW_IT_WORKS_STEPS.map((item, idx) => {
            const Icon = item.icon;
            const isSelected = activeHowStep === idx;
            return (
              <button
                key={item.step}
                onClick={() => setActiveHowStep(idx)}
                className={`p-6 rounded-3xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-4 group relative ${
                  isSelected
                    ? 'bg-black text-white border-black shadow-md scale-[1.02]'
                    : 'bg-white text-zinc-900 border-[#e5e5e5] hover:border-zinc-300 hover:shadow-xs'
                }`}
              >
                {/* Top: Step Number & Icon */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs font-luckiest px-2.5 py-1 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-[#c2f325] text-black border-[#c2f325]'
                        : 'bg-zinc-100 text-zinc-700 border-zinc-200 group-hover:bg-[#c2f325] group-hover:text-black group-hover:border-[#c2f325]'
                    }`}
                  >
                    STEP {item.step}
                  </span>
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-zinc-800 text-[#c2f325]'
                        : 'bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200 group-hover:text-black'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                </div>

                {/* Middle: Title & Subtitle */}
                <div className="space-y-1">
                  <h3
                    className={`text-lg font-bold tracking-tight ${
                      isSelected ? 'text-white' : 'text-[#111110]'
                    }`}
                  >
                    {item.title}
                  </h3>
                  <div
                    className={`text-xs font-medium font-inter ${
                      isSelected ? 'text-zinc-300' : 'text-zinc-500'
                    }`}
                  >
                    {item.subtitle}
                  </div>
                </div>

                {/* Description */}
                <p
                  className={`text-xs leading-relaxed font-inter line-clamp-3 ${
                    isSelected ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  {item.desc}
                </p>

                {/* Badge Tag */}
                <div className="pt-2 border-t border-zinc-200/40">
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded-md inline-block font-semibold ${
                      isSelected
                        ? 'bg-zinc-800 text-[#c2f325] border border-zinc-700'
                        : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Live Interactive Step Inspector */}
        <div className="rounded-3xl border border-[#e5e5e5] bg-white p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-[#c2f325] text-black font-luckiest flex items-center justify-center text-xs shrink-0">
                {HOW_IT_WORKS_STEPS[activeHowStep].step}
              </span>
              <div>
                <h4 className="font-luckiest text-lg text-zinc-900 tracking-wide">
                  Stage Details: {HOW_IT_WORKS_STEPS[activeHowStep].title}
                </h4>
                <div className="text-xs font-inter text-zinc-500">
                  {HOW_IT_WORKS_STEPS[activeHowStep].subtitle}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400">Step {activeHowStep + 1} of 4</span>
              <div className="flex gap-1">
                {HOW_IT_WORKS_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveHowStep(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                      activeHowStep === i ? 'bg-black w-6' : 'bg-zinc-300 hover:bg-zinc-400'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left: Detailed explanation */}
            <div className="lg:col-span-6 space-y-4 font-inter">
              <p className="text-sm text-zinc-700 leading-relaxed">
                {HOW_IT_WORKS_STEPS[activeHowStep].desc}
              </p>

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-zinc-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {activeHowStep === 0 && 'Non-custodial intent submission: Agent holds no long-term funds.'}
                    {activeHowStep === 1 && 'Instant policy check before any funds move: refuses a rogue agent transaction.'}
                    {activeHowStep === 2 && 'Cryptographic passkey signing: Hardware enclave isolation via NIST P-256.'}
                    {activeHowStep === 3 && 'On-chain Safe module execution: Verified on Mezo Testnet (Chain 31611).'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-zinc-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {activeHowStep === 0 && 'The canonical action digest binds chain, contract, recipient and amount.'}
                    {activeHowStep === 1 && 'One ceiling per permission, bound to the exact action a human signed.'}
                    {activeHowStep === 2 && 'Biometric assertion completed via WebAuthn API on physical device.'}
                    {activeHowStep === 3 && 'Native precompile on Monad, a deployed verifier on Mezo.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Code / Contract Snippet */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl bg-[#0d0d0d] border border-zinc-800 p-4 font-mono text-xs text-zinc-300 space-y-2 overflow-x-auto shadow-inner">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 pb-2 border-b border-zinc-800">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500/80" />
                    <span className="w-2 h-2 rounded-full bg-yellow-500/80" />
                    <span className="w-2 h-2 rounded-full bg-green-500/80" />
                  </span>
                  <span>{HOW_IT_WORKS_STEPS[activeHowStep].badge}</span>
                </div>
                <pre className="text-[12px] leading-relaxed text-zinc-200">
                  {HOW_IT_WORKS_STEPS[activeHowStep].codeSnippet}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. INTERACTIVE INTENT PLAYGROUND & BIOMETRIC PASSKEY SIMULATOR */}
      <section id="features-section" className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8 pt-8">
        <div className="space-y-2 text-center sm:text-left">
          <div className="text-[11px] font-mono uppercase tracking-wider font-semibold text-zinc-500">
            Protocol Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.035em] text-[#111110]">
            Deterministic security for delegated execution.
          </h2>
          <p className="text-zinc-600 text-sm max-w-2xl">
            Software proposes cryptographic action digests. You authorize via Touch ID or Face ID. DemoSafe verifies P-256 signatures and rate limits on-chain.
          </p>
        </div>

        {/* Live Intent Authorization Card */}
        <div className="rounded-3xl border border-[#e5e5e5] bg-white shadow-xs overflow-hidden">
          <div className="px-6 py-3.5 border-b border-[#e5e5e5] bg-zinc-50/80 flex items-center justify-between text-xs font-mono text-zinc-500">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#c2f325]" />
              <span className="font-semibold text-zinc-800">Biometric Intent Authorization Simulator</span>
            </div>
            <span>secp256r1 Verifier · Mezo Testnet</span>
          </div>

          <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Intent Selector & Params */}
            <div className="lg:col-span-7 space-y-5">
              <div className="space-y-2">
                <span className="text-xs font-mono font-semibold text-zinc-500 uppercase">1. Select Automated Task</span>
                <div className="grid grid-cols-3 gap-2.5">
                  {DEMO_INTENTS.map((intent, idx) => (
                    <button
                      key={intent.id}
                      onClick={() => {
                        setSelectedIntentIndex(idx);
                        setSignedIntentId(null);
                      }}
                      className={`p-3 text-left rounded-xl border text-xs transition cursor-pointer ${
                        selectedIntentIndex === idx
                          ? 'border-black bg-zinc-50 shadow-2xs font-semibold'
                          : 'border-zinc-200 hover:border-zinc-300 text-zinc-600'
                      }`}
                    >
                      <div className="truncate text-xs font-bold text-zinc-900">{intent.title}</div>
                      <div className="text-[11px] font-mono text-zinc-500 mt-0.5">{intent.amount}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Digest Data */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-mono text-zinc-700 space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Target Recipient:</span>
                  <span className="text-zinc-900 font-semibold">{currentIntent.recipient}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Proposed Amount:</span>
                  <span className="text-zinc-900 font-semibold">{currentIntent.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Replay Nonce:</span>
                  <span className="text-zinc-900 font-semibold">#{currentIntent.nonce}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-200/80 pt-2">
                  <span className="text-zinc-500">Spend Ceiling Guard:</span>
                  <span className={isOverCeiling ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                    ${ceilingSliderValue}.00 MUSD ({isOverCeiling ? 'VIOLATION' : 'PERMITTED'})
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Biometric Signing Trigger */}
            <div className="lg:col-span-5 flex flex-col justify-between p-5 rounded-2xl bg-zinc-50 border border-zinc-200/90 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-mono font-semibold text-zinc-500 uppercase">2. Hardware Consent</div>
                <div className="text-sm font-bold text-zinc-900">
                  {signedIntentId === currentIntent.id
                    ? 'Signature Generated & Verified'
                    : 'Authorize with Device Passkey'}
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Signs the canonical action digest inside your Secure Enclave. Private key never leaves hardware.
                </p>
              </div>

              {signedIntentId === currentIntent.id ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" /> Settled in Block #284192
                  </div>
                  <div className="text-[11px] text-emerald-700 truncate">r: 0x98f12a...7c0f9e</div>
                  <div className="text-[11px] text-emerald-700 truncate">s: 0x4fe342...33576b</div>
                </div>
              ) : (
                <button
                  onClick={handleSimulateSign}
                  disabled={isSimulatingSign || isOverCeiling}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    isOverCeiling
                      ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                      : 'bg-[#c2f325] hover:bg-[#b4e519] text-[#111110]'
                  }`}
                >
                  <Fingerprint className="w-4 h-4" />
                  {isSimulatingSign ? 'Reading Secure Enclave...' : 'Authorize with Touch ID / Face ID'}
                </button>
              )}

              <div className="pt-2 border-t border-zinc-200 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                <span>Curve: secp256r1</span>
                <button
                  onClick={onLaunchConsole}
                  className="text-black font-semibold hover:underline flex items-center gap-1"
                >
                  Open Full Console <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. BENTO GRID ARCHITECTURE (12-Columns) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Bento 1 (7 cols): Secure Enclave */}
        <div className="md:col-span-7 p-8 rounded-3xl bg-white border border-[#e5e5e5] shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-900">
              <KeyRound className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[#111110]">
              Zero Private Key Exposure
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Keys remain sealed inside your Apple Secure Enclave, Android Titan, or YubiKey hardware token. No keys in browser storage, environment files, or remote servers.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/90 space-y-2">
            <div className="text-xs font-semibold text-zinc-600 font-mono">SUPPORTED PASSKEY AUTHENTICATORS</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                onClick={() => setSelectedAuthDevice('touchid')}
                className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                  selectedAuthDevice === 'touchid'
                    ? 'bg-white border-black font-bold text-black shadow-xs'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Fingerprint className="w-4 h-4 mx-auto mb-1 text-zinc-800" />
                Touch ID
              </button>
              <button
                onClick={() => setSelectedAuthDevice('faceid')}
                className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                  selectedAuthDevice === 'faceid'
                    ? 'bg-white border-black font-bold text-black shadow-xs'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Smartphone className="w-4 h-4 mx-auto mb-1 text-zinc-800" />
                Face ID
              </button>
              <button
                onClick={() => setSelectedAuthDevice('yubikey')}
                className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                  selectedAuthDevice === 'yubikey'
                    ? 'bg-white border-black font-bold text-black shadow-xs'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Lock className="w-4 h-4 mx-auto mb-1 text-zinc-800" />
                YubiKey 5
              </button>
            </div>
          </div>
        </div>

        {/* Bento 2 (5 cols): Spend Ceiling Slider */}
        <div className="md:col-span-5 p-8 rounded-3xl bg-white border border-[#e5e5e5] shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-900">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[#111110]">
              Deterministic Spend Ceilings
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Safe contracts enforce maximum allowances per time window. If an agent loops or submits an out-of-bounds transfer, the contract reverts.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/90 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-mono text-zinc-500">ACTIVE CEILING</span>
              <span className="font-bold font-mono text-sm text-[#111110]">${ceilingSliderValue}.00 MUSD</span>
            </div>

            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={ceilingSliderValue}
              onChange={(e) => setCeilingSliderValue(Number(e.target.value))}
              className="w-full accent-black cursor-pointer"
            />

            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
              <span>$10 Strict</span>
              <span>$50 Standard</span>
              <span>$100 Open</span>
            </div>
          </div>
        </div>

        {/* Bento 3 (4 cols): verifier cost per chain */}
        <div className="md:col-span-4 p-8 rounded-3xl bg-white border border-[#e5e5e5] shadow-xs space-y-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-900">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-[#111110]">
            Verifier Cost by Chain
          </h3>
          <p className="text-xs text-zinc-600 leading-relaxed">
            Monad calls the native secp256r1 precompile. Mezo has none, so the same call runs through a deployed P256Verifier contract.
          </p>

          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Monad 0x0100:</span>
              <span className="font-bold text-emerald-700">6,900 gas</span>
            </div>
            <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-[10%]" />
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-zinc-500">Mezo deployed:</span>
              <span className="text-zinc-600">more gas</span>
            </div>
            <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-zinc-400 h-full w-[90%]" />
            </div>
          </div>
        </div>

        {/* Bento 4 (4 cols): Mezo & Monad Deployments */}
        <div className="md:col-span-4 p-8 rounded-3xl bg-white border border-[#e5e5e5] shadow-xs space-y-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-900">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-[#111110]">
            Mezo & Monad Testnets
          </h3>
          <p className="text-xs text-zinc-600 leading-relaxed">
            Deployed live on Mezo Bitcoin Layer 2 and Monad EVM. Compatible with Gnosis Safe multisig modules.
          </p>

          <div className="space-y-2 text-xs font-mono">
            <a
              href="https://explorer.test.mezo.org/address/0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6"
              target="_blank"
              rel="noreferrer"
              className="p-2.5 rounded-xl border border-zinc-200 hover:border-zinc-300 bg-zinc-50 flex items-center justify-between text-zinc-700 transition"
            >
              <span>Mezo Testnet (31611)</span>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            </a>

            <button
              onClick={onViewContracts}
              className="w-full p-2.5 rounded-xl border border-zinc-200 hover:border-zinc-300 bg-zinc-50 flex items-center justify-between text-zinc-700 transition cursor-pointer text-left"
            >
              <span>View Deployed Contracts</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Bento 5 (4 cols): Developer SDK */}
        <div className="md:col-span-4 p-8 rounded-3xl bg-white border border-[#e5e5e5] shadow-xs space-y-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-900">
            <Sliders className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-[#111110]">
            TypeScript SDK & CLI
          </h3>
          <p className="text-xs text-zinc-600 leading-relaxed">
            Submit intents with 3 lines of TypeScript. Hand off to a passkey over the canonical action digest.
          </p>

          <button
            onClick={onViewDocs}
            className="w-full py-2.5 px-4 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-semibold transition cursor-pointer flex items-center justify-between"
          >
            <span>Read SDK Quickstart</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* 4. FREQUENTLY ASKED QUESTIONS (FAQ) SECTION */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl bg-white border border-[#e5e5e5] p-6 sm:p-10 shadow-xs space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-zinc-100 pb-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#c2f325]/20 border border-[#c2f325]/50 text-xs font-luckiest tracking-wider uppercase text-zinc-900">
                <HelpCircle className="w-3.5 h-3.5 text-zinc-900" />
                <span>Knowledge Base & Specs</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.035em] text-[#111110]">
                Frequently Asked Questions
              </h2>
              <p className="text-sm text-zinc-600 max-w-xl font-inter">
                Everything you need to know about autonomous agent intent delegation, MUSD spend limits, and biometric passkey authorization.
              </p>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 self-start md:self-auto">
              {(['All', 'Mezo & MUSD', 'Security', 'Architecture', 'Developers'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedFaqCategory(cat);
                    setOpenFaqIndex(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-luckiest tracking-wide transition-all cursor-pointer ${
                    selectedFaqCategory === cat
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-black'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Accordion List */}
          <div className="space-y-3">
            {filteredFaqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isOpen
                      ? 'border-black bg-zinc-50/80 shadow-2xs'
                      : 'border-zinc-200/90 bg-white hover:border-zinc-300'
                  }`}
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full py-4 px-5 sm:px-6 flex items-center justify-between gap-4 text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-zinc-100 group-hover:bg-[#c2f325] text-zinc-700 group-hover:text-black flex items-center justify-center text-xs font-luckiest shrink-0 transition-colors">
                        Q{index + 1}
                      </span>
                      <span className="font-luckiest text-base sm:text-lg text-zinc-900 group-hover:text-black tracking-wide">
                        {faq.question}
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-zinc-100 group-hover:bg-zinc-200/80 flex items-center justify-center shrink-0 transition-transform">
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-zinc-800" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 sm:px-6 pb-5 pt-1 space-y-3 border-t border-zinc-200/60 font-inter">
                      <p className="text-sm text-zinc-700 leading-relaxed">
                        {faq.answer}
                      </p>
                      {faq.highlight && (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#c2f325]/15 border border-[#c2f325]/40 text-xs font-mono text-zinc-900 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#a3d40e]" />
                          <span>Key takeaway: {faq.highlight}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. BOTTOM ACTION STRIP */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl bg-black text-white p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-2xl font-bold">Start testing on Mezo Testnet</h3>
            <p className="text-xs text-zinc-400">
              Interactive console with hardware biometric passkeys and verified Safe contracts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onLaunchConsole}
              className="px-6 py-3 rounded-lg bg-[#c2f325] hover:bg-[#b4e519] text-black text-xs font-bold transition cursor-pointer"
            >
              Open Console
            </button>
            <button
              onClick={onViewContracts}
              className="px-5 py-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-mono transition cursor-pointer"
            >
              View Contracts
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
