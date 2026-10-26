import { useState } from 'react';
import { Terminal, ShieldAlert, CheckCircle2, Play, RefreshCw, Cpu, Layers } from 'lucide-react';

export default function AgentSimulator() {
  const [payload, setPayload] = useState(
    'Query benchmark data, pay 0.05 MUSD to the Arxiv Indexer API, and return documentation.'
  );
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [resultStatus, setResultStatus] = useState<'idle' | 'allowed' | 'intercepted'>('idle');

  const presetScenarios = [
    {
      name: 'Authorized Micro-Payment (0.05 MUSD)',
      payload: 'Query benchmark data, pay 0.05 MUSD to the Arxiv Indexer API, and return documentation.',
      type: 'legit',
    },
    {
      name: 'Policy Ceiling Violation (350.00 MUSD)',
      payload: 'High-value treasury liquidation request: Transfer 350.00 MUSD to unregistered address 0xDeaD...BEEF.',
      type: 'injection',
    },
    {
      name: 'Unverified Destination Route',
      payload: 'Execute 10.00 MUSD transfer through unverified proxy 0x8888...7777.',
      type: 'recipient_tamper',
    },
  ];

  const runSimulation = () => {
    setIsRunning(true);
    setLogs([]);
    setResultStatus('idle');

    const isViolation =
      payload.toLowerCase().includes('liquidation') ||
      payload.toLowerCase().includes('350') ||
      payload.toLowerCase().includes('8888') ||
      payload.toLowerCase().includes('dead');

    const steps = [
      'Worker service [Autonomous Worker ID #0] received execution task.',
      'Parsing tool parameters: Found on-chain execution target [DemoSafe.sol].',
      isViolation
        ? 'High-risk parameter detected: Requested amount > 50.00 MUSD policy ceiling.'
        : 'Micro-payment intent formatted: 0.05 MUSD to Arxiv Indexer API.',
      'Calling @witness/sdk: client.requestTransfer({ safe, recipient, amount })...',
      'Cryptographic Action Digest computed: keccak256(chainId: 31611, safe, to, amount).',
      isViolation
        ? 'WITNESS ENFORCER: ACTION BLOCKED. Contract reverted with OverLimit (Reason 8). Treasury protected.'
        : 'WITNESS AUTHORIZATION REQUIRED: Awaiting hardware passkey signature on-chain. Safe is locked.',
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        setLogs((prev) => [...prev, steps[currentStep]]);
        currentStep++;
      } else {
        clearInterval(interval);
        setIsRunning(false);
        setResultStatus(isViolation ? 'intercepted' : 'allowed');
      }
    }, 600);
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div>
          <span className="text-xs font-mono text-slate-500 uppercase tracking-wider block mb-1">
            Workflow Simulation
          </span>
          <h2 className="text-2xl font-semibold text-slate-900">
            Policy Enforcement & Interceptor Console
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl mt-1">
            Test how Witness intercepts automated actions on-chain before treasury assets are transferred.
          </p>
        </div>

        {/* Preset scenario selection buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {presetScenarios.map((sc, i) => (
            <button
              key={i}
              onClick={() => {
                setPayload(sc.payload);
                setLogs([]);
                setResultStatus('idle');
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50 text-xs font-mono text-slate-800 cursor-pointer transition shadow-2xs"
            >
              {sc.name}
            </button>
          ))}
        </div>

        {/* Payload Input Box */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-slate-500">
            Workflow Execution Task Payload:
          </label>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={3}
            className="w-full p-3 rounded-lg border border-slate-200 font-mono text-xs focus:outline-none focus:border-[#146ef5] bg-slate-50/50"
          />
        </div>

        <button
          onClick={runSimulation}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#c2f325] hover:bg-[#b4e519] text-[#0d0d0d] text-xs font-mono font-bold transition cursor-pointer shadow-xs disabled:opacity-50 active:scale-[0.98]"
        >
          {isRunning ? <RefreshCw className="w-4 h-4 animate-spin text-[#0d0d0d]" /> : <Play className="w-4 h-4 text-[#0d0d0d]" />}
          {isRunning ? 'Simulating Workflow...' : 'Execute Test'}
        </button>
      </div>

      {/* Terminal Trace Output */}
      <div className="p-6 rounded-xl bg-slate-900 text-slate-200 border border-slate-800 font-mono text-xs shadow-md space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#146ef5]" />
            <span>Workflow Execution & Interception Trace</span>
          </div>
          <span className="text-[11px] text-slate-500">Chain: Mezo Testnet 31611</span>
        </div>

        {logs.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            Click &quot;Execute Test&quot; above to trace the execution and Witness on-chain enforcement.
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`leading-relaxed ${
                  log.includes('BLOCKED')
                    ? 'text-rose-400 font-semibold bg-rose-950/40 p-2.5 rounded border border-rose-900/60'
                    : log.includes('REQUIRED') || log.includes('Witness')
                    ? 'text-emerald-400 font-medium'
                    : 'text-slate-300'
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        )}

        {resultStatus === 'intercepted' && (
          <div className="p-4 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 space-y-1 mt-4">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Unauthorized Transfer Blocked: RevertReason: CeilingExceeded
            </div>
            <p className="text-[11px] text-rose-300/80">
              The smart contract holding treasury funds rejected execution because no enrolled passkey authorized this specific action digest.
            </p>
          </div>
        )}

        {resultStatus === 'allowed' && (
          <div className="p-4 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-200 space-y-1 mt-4">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Valid Intent Formatted: Transferred to Approvals Queue
            </div>
            <p className="text-[11px] text-emerald-300/80">
              The action is within parameters. Funds remain locked until authorized via your hardware passkey.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
