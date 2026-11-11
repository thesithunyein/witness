import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { assertDigest, type EnrolledPasskey } from '../lib/passkey';
import { call, type ActionKind, type AttemptResult, type RelayerStatus } from '../lib/relayerClient';
import { TROVE_VAULT } from '../data/troveVault';

const STORAGE_KEY = 'witness.passkey.v1';

/** Every call targets the trove vault, whatever vault the rest of the console uses. */
const vaultPayload = { safe: TROVE_VAULT.safe, executor: TROVE_VAULT.executor };

type TroveKind = Extract<ActionKind, 'trove-open' | 'trove-addcoll' | 'trove-repay'>;

const LABEL: Record<TroveKind, string> = {
  'trove-open': 'Open trove',
  'trove-addcoll': 'Add collateral',
  'trove-repay': 'Repay',
};

function readable(reason?: string | null): string {
  if (!reason) return 'The chain refused it.';
  if (reason === 'OverLimit') return 'Refused: above the ceiling the passkey approved. Nothing moved.';
  if (reason === 'AlreadyConsumed') return 'Refused: that approval was already used once.';
  if (reason === 'KeyMismatch') return 'Refused: this is not the passkey bound to the vault.';
  if (reason === 'NotBound') return 'Bind the passkey to this vault first.';
  if (reason === 'ChallengeMismatch') return 'Refused: the action differs from what the passkey signed.';
  if (reason === 'AboveRelayerCap') return 'Above the relayer cap for trove actions.';
  if (/ICR|MCR|TCR|CCR/i.test(reason)) return `Mezo refused the collateral ratio: ${reason}`;
  if (/minimum|MinNetDebt|net debt/i.test(reason)) {
    return "Mezo keeps every open trove at 1,800 MUSD net debt or more, so this repay would go below it. Repay at most the amount shown, or close the trove. Nothing moved.";
  }
  return reason;
}

const fmt = (raw: string | null | undefined, digits = 4) =>
  raw == null
    ? '...'
    : Number(formatUnits(BigInt(raw), 18)).toLocaleString(undefined, {
        maximumFractionDigits: digits,
      });

export default function TrovePanel() {
  const [status, setStatus] = useState<RelayerStatus | null>(null);
  const [passkey, setPasskey] = useState<EnrolledPasskey | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; txs: string[] } | null>(null);
  const [openColl, setOpenColl] = useState('0.043');
  const [openDebt, setOpenDebt] = useState('1800');
  const [addColl, setAddColl] = useState('0.005');
  const [repay, setRepay] = useState('1');

  const load = useCallback(async () => {
    try {
      const res = await call<{ status: RelayerStatus }>('status', vaultPayload);
      setStatus(res.status);
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : 'The relayer did not answer.',
        txs: [],
      });
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const p = JSON.parse(saved) as {
          credentialId: string;
          qx: string;
          qy: string;
          credentialHash: `0x${string}`;
          rpId: string;
        };
        setPasskey({ ...p, qx: BigInt(p.qx), qy: BigInt(p.qy) });
      } catch {
        // ChainConsole owns this key and will reset it.
      }
    }
    void load();
  }, [load]);

  const trove = status?.trove ?? null;
  const explorer = status?.explorer ?? 'https://explorer.test.mezo.org';

  const bind = async () => {
    if (!passkey) {
      setNotice({ ok: false, text: 'Create a passkey above first.', txs: [] });
      return;
    }
    setBusy('bind');
    setNotice(null);
    try {
      const res = await call<{ result: { hash: string } }>('enroll-key', {
        ...vaultPayload,
        qx: passkey.qx.toString(),
        qy: passkey.qy.toString(),
      });
      setNotice({
        ok: true,
        text: 'This passkey is now the only key the trove vault accepts.',
        txs: res.result?.hash ? [res.result.hash] : [],
      });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Binding failed.', txs: [] });
    } finally {
      setBusy(null);
    }
  };

  /**
   * One approval, one action: the relayer records the permission, the passkey
   * signs the digest the contract returns, and the executor submits it.
   * With `refuse`, the agent asks for more than was approved and never signs.
   */
  const run = async (kind: TroveKind, refuse = false) => {
    if (!passkey) {
      setNotice({ ok: false, text: 'Create and bind a passkey first.', txs: [] });
      return;
    }
    setBusy(refuse ? `${kind}-refuse` : kind);
    setNotice(null);
    try {
      const amount =
        kind === 'trove-open'
          ? parseUnits(openDebt || '0', 18)
          : kind === 'trove-addcoll'
            ? parseUnits(addColl || '0', 18)
            : parseUnits(repay || '0', 18);
      const collateral = kind === 'trove-open' ? parseUnits(openColl || '0', 18) : 0n;
      if (amount <= 0n) throw new Error('Amount must be greater than zero.');

      const created = await call<{ intentId: number | null; txHash: string }>('create', {
        ...vaultPayload,
        qx: passkey.qx.toString(),
        qy: passkey.qy.toString(),
        credentialHash: passkey.credentialHash,
        maxAmount: amount.toString(),
        expirySeconds: 3600,
        actionKind: kind,
      });
      if (!created.intentId) throw new Error('The registry did not return an intent id.');

      let result: AttemptResult;
      if (refuse) {
        // The agent asks for double what the human approved, with no signature.
        const res = await call<{ result: AttemptResult }>('execute', {
          ...vaultPayload,
          intentId: created.intentId,
          amount: (amount * 2n).toString(),
          collateral: collateral.toString(),
          kind,
        });
        result = res.result;
      } else {
        const d = await call<{ digest: `0x${string}` }>('digest', {
          ...vaultPayload,
          intentId: created.intentId,
          amount: amount.toString(),
          collateral: collateral.toString(),
          kind,
        });
        const a = await assertDigest(d.digest, passkey.credentialId);
        const res = await call<{ result: AttemptResult }>('execute', {
          ...vaultPayload,
          intentId: created.intentId,
          amount: amount.toString(),
          collateral: collateral.toString(),
          kind,
          assertion: {
            authenticatorData: a.authenticatorData,
            clientDataJSON: a.clientDataJSON,
            r: a.r.toString(),
            s: a.s.toString(),
          },
        });
        result = res.result;
      }

      setNotice({
        ok: refuse ? !result.ok : result.ok,
        text: refuse
          ? result.ok
            ? 'Unexpected: the over-ceiling attempt went through.'
            : readable(result.reason)
          : result.ok
            ? `${LABEL[kind]} confirmed on Mezo. Intent ${created.intentId}, used once.`
            : readable(result.reason),
        txs: [created.txHash, result.txHash].filter((h): h is string => Boolean(h)),
      });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'The action failed.', txs: [] });
    } finally {
      setBusy(null);
    }
  };

  // Mezo's net debt excludes the gas reserve, and must stay at or above the minimum.
  const maxRepay =
    trove?.open && trove.debt
      ? BigInt(trove.debt) - BigInt(trove.gasCompensation) - BigInt(trove.minNetDebt)
      : null;

  const icrPct = trove?.icr ? Number(formatUnits(BigInt(trove.icr), 16)) : null;
  const ratioTone =
    icrPct == null ? 'text-ink' : icrPct < 150 ? 'text-red-400' : icrPct < 200 ? 'text-amber-300' : 'text-moss';

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      <div className="rounded-[var(--radius-card)] border border-line bg-card p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">Mezo Borrow</p>
            <h2 className="mt-2 text-3xl text-ink">Trove guard</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              This vault owns a Mezo trove. Opening it, adding BTC collateral, and repaying MUSD each go
              through BorrowerOperations, and each needs your passkey over that exact action, once.
            </p>
          </div>
          <a
            href={`${explorer}/address/${TROVE_VAULT.safe}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-muted underline"
          >
            {TROVE_VAULT.safe.slice(0, 10)}...{TROVE_VAULT.safe.slice(-4)}
          </a>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Trove" value={!status ? '...' : trove?.open ? 'Open' : 'Not open'} />
          <Stat label="Collateral" value={trove?.open ? `${fmt(trove.collateral)} BTC` : '-'} />
          <Stat label="Debt" value={trove?.open ? `${fmt(trove.debt, 2)} MUSD` : '-'} />
          <Stat
            label="Collateral ratio"
            value={icrPct == null ? '-' : `${icrPct.toFixed(0)}%`}
            tone={ratioTone}
            foot="Liquidated below 110%"
          />
          <Stat
            label="BTC price (Mezo)"
            value={trove ? `$${fmt(trove.price, 0)}` : '...'}
            foot={trove?.liquidationPrice ? `Liquidation at $${fmt(trove.liquidationPrice, 0)}` : undefined}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <span>BTC in vault: {trove ? fmt(trove.btcInVault) : '...'}</span>
          <span>MUSD in vault: {status ? fmt(status.safeBalance, 2) : '...'}</span>
          <span>Minimum borrow: {trove ? `${fmt(trove.minNetDebt, 0)} MUSD` : '...'}</span>
          <span>Passkey bound: {status?.keyEnrolled == null ? '...' : status.keyEnrolled ? 'yes' : 'no'}</span>
        </div>

        {status && status.keyEnrolled === false && (
          <button
            onClick={() => void bind()}
            disabled={busy !== null}
            className="mt-5 h-11 rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-50"
          >
            {busy === 'bind' ? 'Binding...' : 'Bind this passkey to the trove vault'}
          </button>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <ActionCard title="Open trove" foot="Borrowed MUSD lands in the vault, less the 0.10% fee.">
            <Field label="Collateral, BTC" value={openColl} onChange={setOpenColl} />
            <Field label="Borrow, MUSD" value={openDebt} onChange={setOpenDebt} />
            <Go
              onClick={() => void run('trove-open')}
              disabled={busy !== null || trove?.open === true}
              label={busy === 'trove-open' ? 'Waiting for passkey...' : 'Approve and open'}
            />
          </ActionCard>

          <ActionCard title="Add collateral" foot="Raises the ratio. No fee on protective actions.">
            <Field label="Add, BTC" value={addColl} onChange={setAddColl} />
            <Go
              onClick={() => void run('trove-addcoll')}
              disabled={busy !== null || !trove?.open}
              label={busy === 'trove-addcoll' ? 'Waiting for passkey...' : 'Approve top-up'}
            />
          </ActionCard>

          <ActionCard
            title="Repay"
            foot={
              maxRepay != null && maxRepay > 0n
                ? `Burns MUSD from the vault against the debt. No fee. Up to ${fmt(maxRepay.toString(), 2)} MUSD while open: Mezo keeps 1,800 MUSD minimum.`
                : 'Burns MUSD from the vault against the debt. No fee.'
            }
          >
            <Field label="Repay, MUSD" value={repay} onChange={setRepay} />
            <Go
              onClick={() => void run('trove-repay')}
              disabled={busy !== null || !trove?.open}
              label={busy === 'trove-repay' ? 'Waiting for passkey...' : 'Approve repay'}
            />
            <button
              onClick={() => void run('trove-repay', true)}
              disabled={busy !== null || !trove?.open}
              className="mt-2 h-10 w-full rounded-full border border-line text-xs text-ink disabled:opacity-50"
            >
              {busy === 'trove-repay-refuse' ? 'Asking...' : 'Agent asks for 2x, unsigned'}
            </button>
          </ActionCard>
        </div>

        {notice && (
          <div className="mt-5 rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
            <p className={notice.ok ? 'text-ink' : 'text-red-400'}>{notice.text}</p>
            {notice.txs.map((h) => (
              <a
                key={h}
                href={`${explorer}/tx/${h}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block font-mono text-xs text-muted underline"
              >
                {h}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, foot, tone = 'text-ink' }: { label: string; value: string; foot?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={`mt-2 font-display text-2xl tabular-nums ${tone}`}>{value}</p>
      {foot && <p className="mt-1 text-[11px] text-muted">{foot}</p>}
    </div>
  );
}

function ActionCard({ title, foot, children }: { title: string; foot: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-4">
      <h3 className="text-lg text-ink">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">{foot}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="mt-1 h-10 w-full rounded-xl border border-line bg-card px-3 font-mono text-sm text-ink outline-none"
      />
    </label>
  );
}

function Go({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-11 w-full rounded-full bg-moss px-5 text-sm font-medium text-paper disabled:opacity-50"
    >
      {label}
    </button>
  );
}
