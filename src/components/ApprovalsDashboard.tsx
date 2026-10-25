import { useState, useEffect } from 'react';
import { AgentRequest, PasskeyData, IntentPolicy } from '../types';
import { MEZO_DEPLOYMENT, INITIAL_REQUESTS, REASON_CODES } from '../data/witnessData';
import {
  Fingerprint,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  PlusCircle,
  Check,
  X,
  Sliders,
  RefreshCw,
  Lock,
} from 'lucide-react';

export default function ApprovalsDashboard() {
  const [safeBalance, setSafeBalance] = useState<number>(1000.0);
  const [passkey, setPasskey] = useState<PasskeyData>({
    credentialId: 'cred_p256_witness_98f12a',
    qx: '0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',
    qy: '0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5',
    algorithm: 'ES256 (NIST P-256 / secp256r1)',
    rpId: 'witness.network',
    enrolledAt: Date.now() - 1000 * 60 * 60 * 2,
  });

  const [policy, setPolicy] = useState<IntentPolicy>({
    ceiling: 50.0,
    currentSpent: 0.0,
    windowMinutes: 10,
    expiresAt: Date.now() + 1000 * 60 * 10,
    singleUse: false,
    assetSymbol: 'MUSD',
  });

  const [requests, setRequests] = useState<AgentRequest[]>(INITIAL_REQUESTS);
  const [selectedRequest, setSelectedRequest] = useState<AgentRequest | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signingStep, setSigningStep] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<string>('09:42');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [tempCeiling, setTempCeiling] = useState(policy.ceiling.toString());
  const [notice, setNotice] = useState<string | null>(null);

  // Expiry countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      const remainingSecs = Math.max(0, Math.floor((policy.expiresAt - Date.now()) / 1000));
      if (remainingSecs <= 0) {
        setTimeLeft('Expired');
      } else {
        const m = Math.floor(remainingSecs / 60);
        const s = remainingSecs % 60;
        setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [policy.expiresAt]);

  const notify = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  // Real WebAuthn Passkey enrollment with simulated fallback
  const handleEnrollPasskey = async () => {
    setIsSigning(true);
    setSigningStep('Prompting biometric authenticator...');

    try {
      if (window.PublicKeyCredential && typeof navigator.credentials?.create === 'function') {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        
        await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'Witness Protocol', id: window.location.hostname || 'witness.network' },
            user: {
              id: new Uint8Array([1, 2, 3, 4]),
              name: 'treasury-owner@witness.network',
              displayName: 'Treasury Admin',
            },
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
            authenticatorSelection: { userVerification: 'required' },
            timeout: 60000,
          },
        }).catch(() => null); // If user cancels or in sandbox iframe, gracefully continue to mock registration
      }
    } catch {
      // Sandbox fallback
    }

    setTimeout(() => {
      const mockQx = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const mockQy = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      setPasskey({
        credentialId: 'cred_p256_' + Math.random().toString(36).substring(2, 9),
        qx: mockQx,
        qy: mockQy,
        algorithm: 'ES256 (NIST P-256 / secp256r1)',
        rpId: window.location.hostname || 'witness.network',
        enrolledAt: Date.now(),
      });
      setIsSigning(false);
      setSigningStep('');
      setShowEnrollModal(false);
      notify('Passkey created in this browser. Enrollment is local to this tab.');
    }, 800);
  };

  // Biometric Intent Approval
  const handleApprove = (req: AgentRequest) => {
    setIsSigning(true);
    setSigningStep('Computing Keccak256 action digest...');

    setTimeout(() => {
      setSigningStep('Biometric prompt: Generating P-256 signature in Secure Enclave...');
      setTimeout(() => {
        setSigningStep('Verifying signature on-chain via P256Verifier.sol...');
        setTimeout(() => {
          setIsSigning(false);
          setSigningStep('');
          const mockTx = '0x2f4d2a75aa9db940170a1306f58962e3755255b71ee2f6532a2a7bbdb047d9d5';
          setRequests((prev) =>
            prev.map((r) =>
              r.id === req.id
                ? { ...r, status: 'approved', txHash: mockTx }
                : r
            )
          );
          setSafeBalance((prev) => Math.max(0, prev - req.amount));
          setPolicy((prev) => ({ ...prev, currentSpent: prev.currentSpent + req.amount }));
          setSelectedRequest(null);
          notify(`Approved ${req.amount} ${req.assetSymbol}. Settled on Mezo Testnet.`);
        }, 800);
      }, 700);
    }, 400);
  };

  const handleBlock = (req: AgentRequest, reason: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === req.id
          ? { ...r, status: 'blocked', revertReason: reason }
          : r
      )
    );
    setSelectedRequest(null);
    notify(`Intent rejected: ${reason}`);
  };

  const handleUpdatePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(tempCeiling);
    if (!isNaN(val) && val > 0) {
      setPolicy((prev) => ({
        ...prev,
        ceiling: val,
        expiresAt: Date.now() + 1000 * 60 * prev.windowMinutes,
      }));
      setShowConfigModal(false);
      notify(`Ceiling updated to ${val} ${policy.assetSymbol}.`);
    }
  };

  const handleResetDemo = () => {
    setRequests(INITIAL_REQUESTS);
    setSafeBalance(1000.0);
    setPolicy((prev) => ({ ...prev, currentSpent: 0.0 }));
    notify('Reset to initial state.');
  };

  return (
    <div className="space-y-6">
      {/* Toast Notice */}
      {notice && (
        <div className="p-3 bg-zinc-900 text-white text-xs font-mono rounded-lg shadow-lg flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Fast Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#e6e6e6]">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider font-semibold text-zinc-500">
            Passkey Control Plane
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.035em] text-[#111110]">Treasury Console</h2>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">
            Mezo Testnet (Chain 31611) · Safe Contract 0x1FeB...1E1E6
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfigModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200/90 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-800 transition cursor-pointer shadow-2xs hover:border-zinc-300"
          >
            <Sliders className="w-3.5 h-3.5" /> Adjust Policy
          </button>
          <button
            onClick={handleResetDemo}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200/90 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-800 transition cursor-pointer shadow-2xs hover:border-zinc-300"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset Demo
          </button>
        </div>
      </div>

      {/* 3 Webflow Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Balance Card */}
        <div className="p-6 rounded-2xl bg-white border border-[#e5e5e5] shadow-xs space-y-1.5">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">Safe Treasury Balance</div>
          <div className="text-3xl font-extrabold text-[#111110] tracking-[-0.035em]">
            {safeBalance.toFixed(2)} <span className="text-sm font-semibold text-zinc-500">{policy.assetSymbol}</span>
          </div>
          <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-100 flex items-center justify-between">
            <span className="font-mono text-[11px]">DemoSafe.sol</span>
            <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Funded
            </span>
          </div>
        </div>

        {/* Policy Ceiling Card */}
        <div className="p-6 rounded-2xl bg-white border border-[#e5e5e5] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
            <span>Spend Ceiling</span>
            <span className="text-zinc-600 flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3 text-zinc-400" /> {timeLeft}
            </span>
          </div>
          <div className="text-3xl font-extrabold text-[#111110] tracking-[-0.035em]">
            {policy.ceiling.toFixed(2)} <span className="text-sm font-semibold text-zinc-500">{policy.assetSymbol}</span>
          </div>
          <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-100 flex items-center justify-between">
            <span className="font-mono text-[11px]">Spent: {policy.currentSpent.toFixed(2)} {policy.assetSymbol}</span>
            <button
              onClick={() => setShowConfigModal(true)}
              className="text-[#111110] font-bold text-[11px] hover:underline cursor-pointer"
            >
              Adjust
            </button>
          </div>
        </div>

        {/* Passkey Enclave Card */}
        <div className="p-6 rounded-2xl bg-white border border-[#e5e5e5] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
            <span>Hardware Passkey</span>
            <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[11px]">
              <Check className="w-3 h-3" /> P-256
            </span>
          </div>
          <div className="text-base font-bold text-[#111110] truncate font-mono">
            {passkey.credentialId}
          </div>
          <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-100 flex items-center justify-between">
            <span className="truncate max-w-[140px] font-mono text-[11px]">{passkey.qx.slice(0, 10)}...</span>
            <button
              onClick={() => setShowEnrollModal(true)}
              className="text-[#111110] font-bold text-[11px] hover:underline cursor-pointer"
            >
              Enroll Key
            </button>
          </div>
        </div>
      </div>

      {/* Pending Intent Queue */}
      <div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-zinc-200 bg-zinc-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">Authorization Queue</h3>
            <span className="text-xs font-mono text-zinc-500">
              ({requests.filter((r) => r.status === 'pending').length} pending)
            </span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">Single-Use Action Digests</span>
        </div>

        <div className="divide-y divide-zinc-100">
          {requests.map((req) => {
            const isCeilingBreach = req.amount > policy.ceiling;

            return (
              <div
                key={req.id}
                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-50/50 transition"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold text-zinc-900">{req.title}</span>
                    {req.status === 'approved' && (
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Approved
                      </span>
                    )}
                    {req.status === 'blocked' && (
                      <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Blocked
                      </span>
                    )}
                    {req.status === 'pending' && isCeilingBreach && (
                      <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-amber-600" /> Ceiling Violation
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-600 leading-relaxed">{req.prompt}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-500 pt-0.5">
                    <span>To: {req.recipientLabel}</span>
                    <span className="text-zinc-300">·</span>
                    <span>{req.recipient.slice(0, 8)}...{req.recipient.slice(-6)}</span>
                    {req.txHash && (
                      <>
                        <span className="text-zinc-300">·</span>
                        <a
                          href={`${MEZO_DEPLOYMENT.explorerUrl}/tx/${req.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#0d0d0d] font-semibold hover:underline inline-flex items-center gap-0.5"
                        >
                          Tx Receipt <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {/* Amount & Actions */}
                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-base font-bold text-zinc-900">
                      {req.amount} <span className="text-xs font-normal text-zinc-500">{req.assetSymbol}</span>
                    </div>
                    {isCeilingBreach && (
                      <div className="text-[10px] font-mono text-red-600 font-medium">
                        Limit: {policy.ceiling} {policy.assetSymbol}
                      </div>
                    )}
                  </div>

                  {req.status === 'pending' && (
                    <button
                      onClick={() => setSelectedRequest(req)}
                      className="px-4 py-2 rounded-lg bg-[#c2f325] hover:bg-[#b4e519] text-[#0d0d0d] text-xs font-bold transition cursor-pointer shadow-xs active:scale-[0.98]"
                    >
                      Review & Sign
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Signing Drawer / Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-start justify-between pb-3 border-b border-zinc-200">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Authorize On-Chain Intent</h3>
                <p className="text-xs text-zinc-500 font-mono">Sign with Touch ID / Face ID</p>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono bg-zinc-50 p-4 rounded-xl border border-zinc-200">
              <div className="flex justify-between">
                <span className="text-zinc-500">Action:</span>
                <span className="font-semibold text-zinc-900">{selectedRequest.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Amount:</span>
                <span className="font-bold text-zinc-900 text-sm">
                  {selectedRequest.amount} {selectedRequest.assetSymbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Destination:</span>
                <span className="text-zinc-800">{selectedRequest.recipientLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Enforcing Safe:</span>
                <span className="text-zinc-800">DemoSafe (0x1FeB...1E1E6)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Action Digest:</span>
                <span className="text-zinc-800 font-semibold truncate max-w-[200px]">
                  keccak256(31611, safe, to, value)
                </span>
              </div>
            </div>

            {/* Ceiling Check Warning */}
            {selectedRequest.amount > policy.ceiling && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  Policy Ceiling Exceeded (Reason 4)
                </div>
                <p className="text-red-700">
                  Requested amount ({selectedRequest.amount} {selectedRequest.assetSymbol}) exceeds your policy ceiling of {policy.ceiling} {policy.assetSymbol}. Smart contract will revert execution.
                </p>
              </div>
            )}

            {isSigning ? (
              <div className="py-4 text-center space-y-2">
                <div className="inline-block animate-spin text-zinc-800">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <div className="text-xs font-mono font-medium text-zinc-800">{signingStep}</div>
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-2">
                {selectedRequest.amount <= policy.ceiling ? (
                  <button
                    onClick={() => handleApprove(selectedRequest)}
                    className="flex-1 py-3 rounded-xl bg-[#c2f325] hover:bg-[#b4e519] text-[#0d0d0d] text-xs font-bold tracking-tight transition cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.98]"
                  >
                    <Fingerprint className="w-4 h-4" /> Authorize with Passkey
                  </button>
                ) : (
                  <button
                    disabled
                    className="flex-1 py-3 rounded-xl bg-zinc-200 text-zinc-500 text-xs font-bold cursor-not-allowed"
                  >
                    Blocked by Ceiling Policy
                  </button>
                )}

                <button
                  onClick={() => handleBlock(selectedRequest, 'Rejected by owner')}
                  className="px-4 py-3 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition cursor-pointer"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Adjust Policy Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdatePolicy}
            className="bg-white rounded-2xl border border-zinc-200 shadow-2xl max-w-sm w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
              <h3 className="text-sm font-bold text-zinc-900">Set Spend Policy</h3>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-700 block">
                Ceiling Limit ({policy.assetSymbol})
              </label>
              <input
                type="number"
                step="5"
                min="1"
                value={tempCeiling}
                onChange={(e) => setTempCeiling(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#c2f325]"
              />
              <p className="text-[11px] text-zinc-500">
                Any automated intent exceeding this ceiling is blocked automatically on-chain.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-[#c2f325] hover:bg-[#b4e519] text-[#0d0d0d] text-xs font-bold transition cursor-pointer"
              >
                Save Ceiling
              </button>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-3 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Enroll Passkey Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
              <h3 className="text-sm font-bold text-zinc-900">Enroll Hardware Key</h3>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              Registers your device Secure Enclave public key on-chain in <code className="font-mono text-zinc-900">WitnessIntentRegistry.sol</code>.
            </p>

            <div className="space-y-2 text-xs font-mono bg-zinc-50 p-3 rounded-lg border border-zinc-200">
              <div>Curve: NIST P-256 (secp256r1)</div>
              <div>Algorithm: ES256 (-7)</div>
              <div>Enclave: Secure Processor / TPM</div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleEnrollPasskey}
                disabled={isSigning}
                className="flex-1 py-2 rounded-lg bg-[#c2f325] hover:bg-[#b4e519] text-[#0d0d0d] text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Fingerprint className="w-4 h-4" /> Create Passkey
              </button>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="px-3 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
