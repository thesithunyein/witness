import { useState } from 'react';
import { Copy, Check, Terminal, ExternalLink } from 'lucide-react';
import { MEZO_DEPLOYMENT } from '../data/witnessData';

export default function IntegratorDocs() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const tsExample = `import { WitnessClient } from '@witness/sdk';

// 1. Initialize client with your Safe address
const client = new WitnessClient({
  chainId: 31611, // Mezo Testnet
  safeAddress: '${MEZO_DEPLOYMENT.contracts.DemoSafe}',
});

// 2. Submit payment intent for human passkey authorization
const intent = await client.requestTransfer({
  recipient: '0x3841D61517f694F9c2794A1a7d65B09d437A9F52',
  amount: 0.05,
  asset: '${MEZO_DEPLOYMENT.contracts.DemoUSD}',
  reason: 'ArXiv Indexer API access',
});

// 3. Wait for hardware biometric approval
const { signature, actionDigest } = await intent.waitForApproval();

// 4. Execute on-chain via DemoSafe
const tx = await client.executeWithWitness({ intent, signature });
console.log('Settled:', tx.hash);`;

  const solidityExample = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {P256Verifier} from "./libraries/P256Verifier.sol";

contract SafeEnforcer {
    address public immutable p256Verifier;

    constructor(address _verifier) {
        p256Verifier = _verifier;
    }

    function verifyIntent(
        bytes32 actionDigest,
        uint256 r,
        uint256 s,
        uint256[2] calldata pubKey
    ) external view returns (bool) {
        // EIP-7212 verification
        (bool ok, bytes memory result) = p256Verifier.staticcall(
            abi.encode(actionDigest, r, s, pubKey[0], pubKey[1])
        );
        return ok && abi.decode(result, (uint256)) == 1;
    }
}`;

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      <div className="border-b border-[#e6e6e6] pb-3">
        <div className="text-[11px] font-mono uppercase tracking-wider font-semibold text-zinc-500">
          Developer Documentation
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.035em] text-[#111110]">Developer Integration</h2>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">
          Propose intents from automated processes and enforce signatures in Solidity
        </p>
      </div>

      {/* TypeScript Section */}
      <div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden shadow-xs">
        <div className="px-6 py-3.5 border-b border-[#e5e5e5] bg-zinc-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-zinc-800">
            <Terminal className="w-4 h-4 text-zinc-600" />
            TypeScript SDK Quickstart
          </div>
          <button
            onClick={() => copyCode(tsExample, 1)}
            className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200/90 hover:bg-zinc-50 text-zinc-700 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer shadow-2xs hover:border-zinc-300"
          >
            {copiedIndex === 1 ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedIndex === 1 ? 'Copied' : 'Copy Code'}
          </button>
        </div>
        <pre className="p-6 text-xs font-mono bg-[#0d0d0d] text-zinc-100 overflow-x-auto leading-relaxed">
          <code>{tsExample}</code>
        </pre>
      </div>

      {/* Solidity Section */}
      <div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden shadow-xs">
        <div className="px-6 py-3.5 border-b border-[#e5e5e5] bg-zinc-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-zinc-800">
            <span className="w-2 h-2 rounded-full bg-[#c2f325]" />
            On-Chain Intent Verification (Solidity)
          </div>
          <button
            onClick={() => copyCode(solidityExample, 2)}
            className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200/90 hover:bg-zinc-50 text-zinc-700 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer shadow-2xs hover:border-zinc-300"
          >
            {copiedIndex === 2 ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
            {copiedIndex === 2 ? 'Copied' : 'Copy Code'}
          </button>
        </div>
        <pre className="p-6 text-xs font-mono bg-[#0d0d0d] text-zinc-100 overflow-x-auto leading-relaxed">
          <code>{solidityExample}</code>
        </pre>
      </div>
    </div>
  );
}
