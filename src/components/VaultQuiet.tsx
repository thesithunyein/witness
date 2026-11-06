import { useEffect, useState } from 'react';
import { encodeAbiParameters, keccak256, parseUnits, stringToHex } from 'viem';
import { MEZO_DEPLOYMENT } from '../data/witnessData';
import { fetchVaultBalance } from '../lib/chain';
import { assertDigest, enrollPasskey, type EnrolledPasskey } from '../lib/passkey';

const STORAGE_KEY = 'witness.passkey.v1';

const TYPEHASH = keccak256(
  stringToHex(
    'WitnessAction(uint256 chainId,address domain,uint256 intentId,bytes32 actionType,address token,address to,uint256 amount)'
  )
);

const KINDS = {
  transfer: { label: 'Transfer', tag: keccak256(stringToHex('witness.action.transfer')) },
  deposit: { label: 'Pool deposit', tag: keccak256(stringToHex('witness.action.sp.deposit')) },
  withdraw: { label: 'Pool withdraw', tag: keccak256(stringToHex('witness.action.sp.withdraw')) },
} as const;

type Kind = keyof typeof KINDS;

type Saved = {
  credentialId: string;
  qx: string;
  qy: string;
  credentialHash: `0x${string}`;
  rpId: string;
};

export default function VaultQuiet() {
  const [passkey, setPasskey] = useState<EnrolledPasskey | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceState, setBalanceState] = useState<'loading' | 'live' | 'unread'>('loading');
  const [kind, setKind] = useState<Kind>('transfer');
  const [amount, setAmount] = useState('1.20');
  const [to, setTo] = useState(MEZO_DEPLOYMENT.payee);
  const [busy, setBusy] = useState<'enroll' | 'sign' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Saved;
        setPasskey({ ...parsed, qx: BigInt(parsed.qx), qy: BigInt(parsed.qy) });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    let cancelled = false;
    fetchVaultBalance(MEZO_DEPLOYMENT.contracts.DemoSafe).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setBalance(result.value.toLocaleString(undefined, { maximumFractionDigits: 4 }));
        setBalanceState('live');
      } else {
        setBalanceState('unread');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enroll = async () => {
    setBusy('enroll');
    setError(null);
    try {
      const enrolled = await enrollPasskey('Witness');
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          credentialId: enrolled.credentialId,
          qx: enrolled.qx.toString(),
          qy: enrolled.qy.toString(),
          credentialHash: enrolled.credentialHash,
          rpId: enrolled.rpId,
        })
      );
      setPasskey(enrolled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setBusy(null);
    }
  };

  const sign = async () => {
    if (!passkey) {
      setError('Enroll a passkey first.');
      return;
    }
    setBusy('sign');
    setError(null);
    setSigned(null);
    try {
      const gross = parseUnits(amount || '0', 18);
      if (gross <= 0n) throw new Error('Amount must be greater than zero.');
      const pool = '0x1CCA7E410eE41739792eA0A24e00349Dd247680e' as const;
      const recipient = kind === 'transfer' ? (to as `0x${string}`) : pool;
      const digest = keccak256(
        encodeAbiParameters(
          [
            { type: 'bytes32' },
            { type: 'uint256' },
            { type: 'address' },
            { type: 'uint256' },
            { type: 'bytes32' },
            { type: 'address' },
            { type: 'address' },
            { type: 'uint256' },
          ],
          [
            TYPEHASH,
            BigInt(MEZO_DEPLOYMENT.chainId),
            MEZO_DEPLOYMENT.contracts.DemoSafe as `0x${string}`,
            0n,
            KINDS[kind].tag,
            kind === 'transfer' ? (MEZO_DEPLOYMENT.contracts.DemoUSD as `0x${string}`) : (MEZO_DEPLOYMENT.contracts.DemoUSD as `0x${string}`),
            recipient,
            gross,
          ]
        )
      );
      const assertion = await assertDigest(digest, passkey.credentialId);
      setSigned(`${digest.slice(0, 10)}…${digest.slice(-4)} · r ${assertion.r.toString(16).slice(0, 8)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The passkey prompt failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">Vault</p>
          <h1 className="mt-3 text-5xl text-ink">Sign an action.</h1>
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          The operator that broadcasts is not connected here. A signature stays on this device until it is.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Stat
          label="Balance"
          value={balanceState === 'loading' ? '…' : balanceState === 'live' ? `${balance} MUSD` : '—'}
          foot={balanceState === 'live' ? 'Read from the vault' : 'Mezo did not answer'}
        />
        <Stat
          label="Passkey"
          value={passkey ? 'Enrolled' : 'None'}
          foot={passkey ? passkey.credentialId.slice(0, 14) : 'This browser only'}
        />
        <Stat label="Operator" value="Offline" foot="Nothing is broadcast" />
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink">{error}</p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <section className="rounded-[var(--radius-card)] border border-line bg-card p-6 lg:col-span-5">
          <h2 className="text-2xl text-ink">Your key</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Created in the secure enclave. Witness stores the public key, never the private one.
          </p>
          <button
            onClick={() => void enroll()}
            disabled={busy === 'enroll'}
            className="mt-6 h-11 rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-50"
          >
            {busy === 'enroll' ? 'Waiting…' : passkey ? 'Enroll again' : 'Enroll passkey'}
          </button>
        </section>

        <section className="rounded-[var(--radius-card)] border border-line bg-card p-6 lg:col-span-7">
          <h2 className="text-2xl text-ink">Action</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {(Object.keys(KINDS) as Kind[]).map((key) => (
              <button
                key={key}
                onClick={() => setKind(key)}
                className={`h-10 rounded-full px-4 text-sm ${
                  kind === key ? 'bg-ink text-paper' : 'border border-line text-ink'
                }`}
              >
                {KINDS[key].label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-muted">
              Amount, MUSD
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="mt-1 h-11 w-full rounded-xl border border-line bg-paper px-3 font-mono text-sm text-ink outline-none"
              />
            </label>
            {kind === 'transfer' && (
              <label className="text-xs text-muted sm:col-span-2">
                Recipient
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  spellCheck={false}
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-paper px-3 font-mono text-sm text-ink outline-none"
                />
              </label>
            )}
          </div>

          <button
            onClick={() => void sign()}
            disabled={busy === 'sign'}
            className="mt-6 h-11 rounded-full bg-moss px-5 text-sm font-medium text-paper disabled:opacity-50"
          >
            {busy === 'sign' ? 'Waiting for passkey…' : 'Sign with passkey'}
          </button>

          {signed && (
            <p className="mt-4 font-mono text-xs leading-relaxed text-muted">
              Signed. Not broadcast. {signed}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, foot }: { label: string; value: string; foot: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-card px-5 py-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-3 font-display text-3xl text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{foot}</p>
    </div>
  );
}
