import { useState } from 'react';
import { MEZO_DEPLOYMENT, MONAD_DEPLOYMENT, FORGE_FMT_DIFFS } from '../data/witnessData';
import { ExternalLink, Copy, Check, CheckCircle2, GitCommit, FileCode, Shield } from 'lucide-react';

export default function SecurityAndContracts() {
  const [selectedChain, setSelectedChain] = useState<'mezo' | 'monad'>('mezo');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [copiedPatch, setCopiedPatch] = useState(false);

  const deployment = selectedChain === 'mezo' ? MEZO_DEPLOYMENT : MONAD_DEPLOYMENT;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const rawPatch = `From 6522aa36b7f369d78e79e61db1d6067756f7eef7 Mon Sep 17 00:00:00 2001
Subject: [PATCH] style: fix forge fmt check in P256Verifier and Deploy.s.sol
---
 contracts/script/Deploy.s.sol            |  3 +--
 contracts/src/libraries/P256Verifier.sol | 96 +++++++++++++++-----------------
 2 files changed, 46 insertions(+), 53 deletions(-)
`;

  const copyPatch = () => {
    navigator.clipboard.writeText(rawPatch);
    setCopiedPatch(true);
    setTimeout(() => setCopiedPatch(false), 2000);
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#e6e6e6]">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider font-semibold text-zinc-500">
            Smart Contract Security
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.035em] text-[#111110]">Security & Contracts</h2>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">
            Audited smart contracts and verified cryptographic parameters
          </p>
        </div>

        {/* Chain Switcher */}
        <div className="flex items-center gap-1 bg-zinc-100/80 p-1 rounded-xl border border-zinc-200">
          <button
            onClick={() => setSelectedChain('mezo')}
            className={`px-3.5 py-1.5 text-xs font-mono rounded-lg transition cursor-pointer ${
              selectedChain === 'mezo'
                ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                : 'text-zinc-600 hover:text-zinc-900 font-medium'
            }`}
          >
            Mezo (31611)
          </button>
          <button
            onClick={() => setSelectedChain('monad')}
            className={`px-3.5 py-1.5 text-xs font-mono rounded-lg transition cursor-pointer ${
              selectedChain === 'monad'
                ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                : 'text-zinc-600 hover:text-zinc-900 font-medium'
            }`}
          >
            Monad (10143)
          </button>
        </div>
      </div>

      {/* Contract Addresses Table */}
      <div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-zinc-200 bg-zinc-50/70 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#c2f325]" />
            <span className="font-semibold text-zinc-900">{deployment.chainName} Deployments</span>
          </div>
          <a
            href={deployment.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1"
          >
            Explorer <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="divide-y divide-zinc-100 text-xs font-mono">
          {Object.entries(deployment.contracts).map(([name, address]) => (
            <div
              key={name}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-50/50 transition"
            >
              <div className="space-y-0.5">
                <div className="font-semibold text-zinc-900 text-sm">{name}</div>
                <div className="text-zinc-500 text-[11px] select-all">{address}</div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => copyToClipboard(address)}
                  className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] transition flex items-center gap-1 cursor-pointer"
                >
                  {copiedAddress === address ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedAddress === address ? 'Copied' : 'Copy'}
                </button>
                <a
                  href={`${deployment.explorerUrl}/address/${address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Foundry Formatting & CI Spec */}
      <div className="p-7 rounded-2xl border border-[#e5e5e5] bg-white shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 inline-flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> forge fmt --check: Passed
              </span>
              <span className="text-xs font-mono text-zinc-500">commit 6522aa3</span>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-[#111110]">Foundry Code Quality Standard</h3>
            <p className="text-xs text-zinc-600 leading-relaxed max-w-xl">
              All formatting issues in <code className="font-mono text-zinc-900 bg-zinc-100 px-1 py-0.5 rounded">P256Verifier.sol</code> and <code className="font-mono text-zinc-900 bg-zinc-100 px-1 py-0.5 rounded">Deploy.s.sol</code> adhere to canonical Foundry style guidelines.
            </p>
          </div>

          <button
            onClick={copyPatch}
            className="px-4 py-2.5 rounded-xl bg-[#c2f325] hover:bg-[#b4e519] text-[#111110] text-xs font-mono font-bold transition cursor-pointer self-start sm:self-auto flex items-center gap-2 shadow-xs active:scale-[0.98]"
          >
            {copiedPatch ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedPatch ? 'Copied Patch' : 'Copy Git Patch'}
          </button>
        </div>

        {/* Diff Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs font-mono">
          <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
            <span className="text-zinc-500 block mb-0.5">Curve Modulus (p)</span>
            <span className="text-zinc-900 font-semibold truncate block">0xFFFFFFFF00000001...</span>
          </div>
          <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
            <span className="text-zinc-500 block mb-0.5">Verification Interface</span>
            <span className="text-zinc-900 font-semibold block">EIP-7212 Precompile</span>
          </div>
          <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
            <span className="text-zinc-500 block mb-0.5">Format Status</span>
            <span className="text-emerald-700 font-semibold block">Clean & Synchronized</span>
          </div>
        </div>
      </div>
    </div>
  );
}
