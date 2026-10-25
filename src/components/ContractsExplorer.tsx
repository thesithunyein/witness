import { useState } from 'react';
import { MEZO_DEPLOYMENT, MONAD_DEPLOYMENT } from '../data/witnessData';
import { ExternalLink, Copy, Check, FileCode, Cpu, Shield, BookOpen, Layers } from 'lucide-react';

export default function ContractsExplorer() {
  const [selectedChain, setSelectedChain] = useState<'mezo' | 'monad'>('mezo');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const deployment = selectedChain === 'mezo' ? MEZO_DEPLOYMENT : MONAD_DEPLOYMENT;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Network Switcher & Header in Webflow Light Theme */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div>
          <span className="text-xs font-mono text-slate-500 uppercase tracking-wider block mb-1">
            Verified Deployments
          </span>
          <h2 className="text-2xl font-semibold text-slate-900">
            Smart Contract Architecture
          </h2>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setSelectedChain('mezo')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition cursor-pointer ${
              selectedChain === 'mezo'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mezo Testnet (31611) — Production
          </button>
          <button
            onClick={() => setSelectedChain('monad')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition cursor-pointer ${
              selectedChain === 'monad'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monad Testnet (10143)
          </button>
        </div>
      </div>

      {/* Contracts Registry Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs text-zinc-700">
            <span className="w-2 h-2 rounded-full bg-[#c2f325]" />
            <span className="font-semibold text-[#0d0d0d]">{deployment.chainName} Contracts</span>
            <span className="text-zinc-400">· Asset: {deployment.assetSymbol}</span>
          </div>
          <span className="text-xs font-mono text-zinc-500">
            Explorer: <a href={deployment.explorerUrl} target="_blank" rel="noreferrer" className="text-[#0d0d0d] font-semibold hover:underline">{deployment.explorerUrl.replace('https://', '')}</a>
          </span>
        </div>

        <div className="divide-y divide-slate-100 text-xs font-mono">
          {Object.entries(deployment.contracts).map(([name, address]) => (
            <div key={name} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 text-sm">{name}</span>
                  {name === 'P256Verifier' && selectedChain === 'mezo' && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-800 font-medium border border-slate-200">
                      Solidity Elliptic Curve Fallback
                    </span>
                  )}
                  {name === 'P256Verifier' && selectedChain === 'monad' && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-[#146ef5] font-medium border border-blue-200">
                      EIP-7212 Native Precompile (0x0100)
                    </span>
                  )}
                  {name === 'DemoSafe' && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-800 font-medium border border-emerald-200">
                      Treasury Vault
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-sans">
                  {name === 'DemoSafe' && 'Holds treasury in MUSD. Verifies intent action hash before value moves.'}
                  {name === 'WitnessVerifier' && 'Validates passkey P-256 assertions against enrolled policy parameters.'}
                  {name === 'WitnessIntentRegistry' && 'Stores policy ceilings, expirations, and enrolled passkey public key coordinates.'}
                  {name === 'P256Verifier' && 'Verifies NIST P-256 (secp256r1) curve signatures with zero-malleability guarantees.'}
                  {name === 'DemoUSD' && 'ERC-20 token backing safe liquidity.'}
                  {name === 'AgentExecutor' && 'Relayer entry point allowing gasless execution while preserving signature enforcement.'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <code className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs select-all">
                  {address.slice(0, 10)}…{address.slice(-8)}
                </code>
                <button
                  onClick={() => copyToClipboard(address)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition"
                  title="Copy address"
                >
                  {copiedAddress === address ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
                <a
                  href={`${deployment.explorerUrl}/address/${address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                  title="View on explorer"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* P-256 Curve Verification Details */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-[#146ef5] font-mono text-xs font-semibold uppercase tracking-wider">
          <Cpu className="w-4 h-4" />
          P256Verifier.sol Elliptic Curve Engine
        </div>

        <h3 className="text-xl font-semibold text-slate-900">
          Solidity P-256 Fallback Architecture
        </h3>

        <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
          Monad features an in-protocol precompile for EIP-7212 (secp256r1 verification at address <code className="text-slate-800 font-mono font-semibold">0x0100</code>). On networks without this precompile (such as Mezo), Witness deploys a gas-optimized Solidity verifier based on Ledger&apos;s FreshCryptoLib, delivering portable hardware passkey security across all EVM environments.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 font-mono text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <span className="text-slate-900 font-semibold block">Strauss-Shamir Method</span>
            <p className="text-slate-600 text-[11px] leading-relaxed font-sans">
              Computes $uG + vQ$ simultaneously in a single loop over 256 bits by processing bitpairs $(u_i, v_i)$, cutting point additions and doublings nearly in half.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <span className="text-slate-900 font-semibold block">XYZZ Projective Representation</span>
            <p className="text-slate-600 text-[11px] leading-relaxed font-sans">
              Avoids modular divisions in the scalar loop by representing points as $(X, Y, ZZ, ZZZ)$ where $ZZ = Z^2$ and $ZZZ = Z^3$.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <span className="text-slate-900 font-semibold block">Fermat Modexp Inversion</span>
            <p className="text-slate-600 text-[11px] leading-relaxed font-sans">
              Computes {'u^(f-2) mod f'} via EVM staticcall to modexp precompile <code className="text-slate-800">0x05</code>, guaranteeing deterministic execution.
            </p>
          </div>
        </div>

        {/* Formatted Code Highlight snippet */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono mb-2">
            <span className="flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-slate-500" />
              P256Verifier.sol (Lines 70-87 Formatted)
            </span>
            <span className="text-emerald-700 font-medium">Foundry style verified</span>
          </div>

          <pre className="p-4 rounded-xl bg-slate-900 text-[11px] text-slate-200 font-mono overflow-x-auto leading-relaxed">
{`// Parameters for the sec256r1 (P256) elliptic curve
// Curve prime field modulus
uint256 constant p = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;
// Short weierstrass first coefficient
uint256 constant a = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC;
// Short weierstrass second coefficient
uint256 constant b = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B;
// Generating point affine coordinates
uint256 constant GX = 0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296;
uint256 constant GY = 0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5;
// Curve order (number of points)
uint256 constant n = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;`}
          </pre>
        </div>
      </div>
    </div>
  );
}
