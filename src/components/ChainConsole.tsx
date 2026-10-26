import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Fingerprint, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { parseUnits } from 'viem';
import { relayer, formatToken, type ChainIntent, type RelayerStatus } from '../lib/relayerClient';
import { enrollPasskey, assertDigest, type EnrolledPasskey } from '../lib/passkey';
import { MEZO_DEPLOYMENT } from '../data/witnessData';

/**
 * The console when a relayer is configured.
 *
 * Every row is an intent that exists in WitnessIntentRegistry, every approval is
 * a passkey assertion the verifier checks, and every refusal is the contract's
 * own reason code. There is no fixture data and no local "approved" state: if
 * the chain did not accept it, the row does not change.
 */

const STORAGE_KEY = 'witness.passkey.v1';

type Modal = {
  intent: ChainIntent;
  to: string;
  amount: string;
  digest: `0x${string}` | null;
  busy: boolean;
  result: string | null;
  ok: boolean | null;
};

export default function ChainConsole() {
  const [status, setStatus] = useState<RelayerStatus | null>(null);
  const [intents, setIntents] = useState<ChainIntent[]>([]);
  const [passkey, setPasskey] = useState<EnrolledPasskey | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; txs?: string[] } | null>(null);
  const [ceiling, setCeiling] = useState('50');
  const [modal, setModal] = useState<Modal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await relayer.status();
      setStatus(s.status);
      if (s.status.configured) {
        const l = await relayer.list();
        setIntents(l.intents);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the relayer did not answer');
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { credentialId: string; qx: string; qy: string; credentialHash: `0x${string}`; rpId: string };
        setPasskey({ ...parsed, qx: BigInt(parsed.qx), qy: BigInt(parsed.qy) });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    void load();
  }, [load]);

  const active = useMemo(() => intents.filter((i) => i.state === 'active'), [intents]);
  const ceilingIntent = active[0] ?? null;
  const balance = formatToken(status?.safeBalance ?? null);

  const doEnroll = async () => {
    setBusy('enroll');
    setError(null);
    try {
      const enrolled = await enrollPasskey(`witness-${Date.now()}`);
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
      setNotice({ ok: true, text: 'Passkey enrolled in this browser. Its public key is used on the next intent.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'enrollment failed');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Adjust Policy.
   *
   * On chain the ceiling is not a settings value: it is a field of the permission
   * the human granted. So adjusting it means revoking that permission and minting
   * the tighter or looser one, which the relayer does as real transactions and
   * reports hash by hash.
   */
  const applyPolicy = async () => {
    if (!passkey) {
      setError('enroll a passkey first, so the new permission carries your real public key');
      return;
    }
    setBusy('policy');
    setError(null);
    try {
      const amount = parseUnits(ceiling || '0', 18).toString();
      const res = await relayer.policy({
        qx: passkey.qx.toString(),
        qy: passkey.qy.toString(),
        credentialHash: passkey.credentialHash,
        maxAmount: amount,
        expirySeconds: 3600,
      });
      const created = res.result.created[0];
      const revoked = res.result.revoked.filter((r) => r.ok).length;
      setNotice({
        ok: true,
        text: `Policy moved to ${ceiling} MUSD on chain: ${revoked} old permission${revoked === 1 ? '' : 's'} revoked, intent ${created?.intentId ?? '?'} created.`,
        txs: [
          ...res.result.revoked.map((r) => r.txHash).filter((h): h is string => Boolean(h)),
          ...res.result.created.map((c) => c.txHash),
        ],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'adjusting the policy failed');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Reset Demo.
   *
   * Not a restore of fixtures: it revokes what is live and mints three fresh
   * permissions at the demo amounts, so the next take starts from real chain state
   * and every row on screen is a real intent again.
   */
  const resetDemo = async () => {
    if (!passkey) {
      setError('enroll a passkey first, so the fresh permissions carry your real public key');
      return;
    }
    setBusy('reset');
    setError(null);
    try {
      const res = await relayer.reset({
        qx: passkey.qx.toString(),
        qy: passkey.qy.toString(),
        credentialHash: passkey.credentialHash,
        expirySeconds: 3600,
      });
      const revoked = res.result.revoked.filter((r) => r.ok).length;
      setNotice({
        ok: true,
        text: `Reset on chain: ${revoked} revoked, ${res.result.created.length} fresh permissions (${res.result.created
          .map((c) => `${formatToken(c.maxAmount)}`)
          .join(', ')} MUSD).`,
        txs: [
          ...res.result.revoked.map((r) => r.txHash).filter((h): h is string => Boolean(h)),
          ...res.result.created.map((c) => c.txHash),
        ],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the reset failed');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (intent: ChainIntent) => {
    setBusy(`revoke-${intent.id}`);
    setError(null);
    try {
      const res = await relayer.revoke(intent.id);
      setNotice({ ok: true, text: `Intent ${intent.id} revoked on chain.`, txs: [res.result.txHash] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'revoking failed');
    } finally {
      setBusy(null);
    }
  };

  const openReview = async (intent: ChainIntent) => {
    setBusy(`open-${intent.id}`);
    setError(null);
    try {
      const amount = intent.maxAmount;
      const to = MEZO_DEPLOYMENT.payee;
      const res = await relayer.digest({ intentId: intent.id, to, amount });
      setModal({ intent, to, amount, digest: res.digest, busy: false, result: null, ok: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not read the action digest');
    } finally {
      setBusy(null);
    }
  };

  const refreshDigest = async (m: Modal, to: string, amount: string) => {
    try {
      const res = await relayer.digest({ intentId: m.intent.id, to, amount });
      setModal({ ...m, to, amount, digest: res.digest, result: null, ok: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not read the action digest');
    }
  };

  const approve = async () => {
    if (!modal || !modal.digest) return;
    if (!passkey) {
      setError('no passkey in this browser');
      return;
    }
    setModal({ ...modal, busy: true, result: null, ok: null });
    try {
      const assertion = await assertDigest(modal.digest, passkey.credentialId);
      const res = await relayer.execute({
        intentId: modal.intent.id,
        to: modal.to,
        amount: modal.amount,
        assertion: {
          authenticatorData: assertion.authenticatorData,
          clientDataJSON: assertion.clientDataJSON,
          r: assertion.r.toString(),
          s: assertion.s.toString(),
        },
      });
      const r = res.result;
      setModal({
        ...modal,
        busy: false,
        ok: r.ok,
        result: r.ok
          ? 'Signed and executed on Mezo.'
          : `${r.reason ?? 'refused'}${r.code !== null && r.code !== undefined ? ` (reason ${r.code})` : ''}`,
      });
      await load();
    } catch (err) {
      setModal({
        ...modal,
        busy: false,
        ok: false,
        result: err instanceof Error ? err.message : 'the passkey prompt failed',
      });
    }
  };

  /** The agent asking for more than the ceiling, with no approval: a real revert. */
  const overLimitAttempt = async () => {
    if (!ceilingIntent) {
      setError('no active intent to attempt against');
      return;
    }
    setBusy(`attempt-${ceilingIntent.id}`);
    setError(null);
    try {
      const over = (BigInt(ceilingIntent.maxAmount) * 9n).toString();
      const res = await relayer.execute({
        intentId: ceilingIntent.id,
        to: '0xdeaddeadbeef000000000000000000000000beef',
        amount: over,
      });
      const r = res.result;
      setNotice({
        ok: false,
        text: r.ok
          ? 'the chain accepted an amount above the ceiling, which should be impossible'
          : `The contract refused it: ${r.reason}${r.code !== null && r.code !== undefined ? ` (reason ${r.code})` : ''}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the attempt failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-zinc-500">
            ON-CHAIN CONTROL PLANE
          </p>
          <h1 className="mt-1 text-4xl font-black tracking-tight text-[#0d0d0d]">
            Treasury Console
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {status
              ? `${status.chainName} (Chain ${status.chainId}) · Registry ${short(status.addresses.registry)}`
              : 'Reading the registry...'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={doEnroll}
            disabled={busy === 'enroll'}
            className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#0d0d0d] disabled:opacity-50"
          >
            {busy === 'enroll' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            {passkey ? 'Re-enroll passkey' : 'Enroll passkey'}
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#0d0d0d]"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {status && !status.configured && (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">The relayer has no key, so nothing can be signed.</p>
          <p className="mt-1">
            Set <code className="rounded bg-white px-1">RELAYER_PRIVATE_KEY</code> to the
            AgentExecutor owner or operator key. Until then this console cannot create or execute.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          className={`mt-6 rounded-2xl border p-4 text-sm ${
            notice.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <p className="font-semibold">{notice.text}</p>
          {notice.txs && notice.txs.length > 0 && status && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {notice.txs.map((hash) => (
                <a
                  key={hash}
                  href={`${status.explorer}/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs underline"
                >
                  {short(hash)} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card label="VAULT BALANCE" value={`${balance} MUSD`} foot="DemoSafe.balance()" />
        <Card
          label="REAL CEILING"
          value={ceilingIntent ? `${formatToken(ceilingIntent.maxAmount)} MUSD` : 'none'}
          foot={ceilingIntent ? `intent ${ceilingIntent.id}` : 'create an intent'}
        />
        <Card
          label="PASSKEY"
          value={passkey ? `P-256 · ${passkey.credentialId.slice(0, 10)}...` : 'not enrolled'}
          foot={passkey ? `rpId ${passkey.rpId}` : 'enroll to authorize'}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Policy ceiling (MUSD)
            <input
              value={ceiling}
              onChange={(e) => setCeiling(e.target.value)}
              inputMode="decimal"
              className="mt-1 block w-32 rounded-lg border border-black/15 px-3 py-2 text-sm font-medium text-[#0d0d0d]"
            />
          </label>
          <button
            onClick={applyPolicy}
            disabled={busy === 'policy'}
            className="rounded-xl border border-black/15 px-4 py-2 text-sm font-semibold text-[#0d0d0d] disabled:opacity-40"
            title="Revoke the standing permission and mint one at this ceiling"
          >
            {busy === 'policy' ? 'Writing...' : 'Adjust Policy'}
          </button>
          <button
            onClick={resetDemo}
            disabled={busy === 'reset'}
            className="rounded-xl border border-black/15 px-4 py-2 text-sm font-semibold text-[#0d0d0d] disabled:opacity-40"
            title="Revoke live permissions and mint three fresh ones at the demo amounts"
          >
            {busy === 'reset' ? 'Writing...' : 'Reset Demo'}
          </button>
          <button
            onClick={overLimitAttempt}
            disabled={!ceilingIntent || busy?.startsWith('attempt')}
            className="rounded-xl border border-black/15 px-4 py-2 text-sm font-semibold text-[#0d0d0d] disabled:opacity-40"
            title="The agent tries nine times the ceiling with no approval"
          >
            Agent attempts 9x the ceiling
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          The ceiling is a field of the permission, not a setting: adjusting it revokes the
          current intent and mints a new one, and every step is a transaction.
        </p>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-black/10 bg-white">
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
          <h2 className="text-lg font-black uppercase tracking-tight text-[#0d0d0d]">
            Intents ({active.length} active)
          </h2>
          <span className="text-xs text-zinc-500">Read from WitnessIntentRegistry</span>
        </div>

        {intents.length === 0 && (
          <p className="px-6 py-10 text-sm text-zinc-600">
            No intents exist yet. Enroll a passkey, then create one.
          </p>
        )}

        {intents.map((intent) => (
          <div key={intent.id} className="flex flex-wrap items-center gap-4 border-b border-black/5 px-6 py-5 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-[#0d0d0d]">
                Intent #{intent.id} · agent {intent.agentWallet.slice(0, 6)}...
                {intent.agentWallet.slice(-4)}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Created {new Date(intent.createdAt * 1000).toLocaleString()} ·{' '}
                {intent.expiry ? `expires ${new Date(intent.expiry * 1000).toLocaleTimeString()}` : 'no expiry'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-[#0d0d0d]">{formatToken(intent.maxAmount)} MUSD</p>
              <p className="text-xs text-zinc-500">ceiling</p>
            </div>
            <StateChip state={intent.state} />
            <div className="flex gap-2">
              <button
                onClick={() => void openReview(intent)}
                disabled={intent.state !== 'active' || busy === `open-${intent.id}`}
                className="rounded-lg bg-[#c6f24e] px-3 py-2 text-xs font-bold text-[#0d0d0d] disabled:opacity-30"
              >
                Review &amp; Sign
              </button>
              <button
                onClick={() => void revoke(intent)}
                disabled={intent.state !== 'active' || busy === `revoke-${intent.id}`}
                className="rounded-lg border border-black/15 px-3 py-2 text-xs font-semibold text-[#0d0d0d] disabled:opacity-30"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-[#0d0d0d]">Authorize on-chain intent</h3>
            <p className="mt-1 text-xs text-zinc-500">
              The passkey signs this exact digest. Change the amount or the destination and the
              signature no longer verifies.
            </p>

            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Intent" value={`#${modal.intent.id}`} />
              <Row label="Ceiling" value={`${formatToken(modal.intent.maxAmount)} MUSD`} />
              <Row label="Amount" value={`${formatToken(modal.amount)} MUSD`} />
              <label className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">Destination</span>
                <input
                  value={modal.to}
                  onChange={(e) => setModal({ ...modal, to: e.target.value, digest: null })}
                  onBlur={(e) => void refreshDigest(modal, e.target.value, modal.amount)}
                  spellCheck={false}
                  className="w-64 rounded-lg border border-black/15 px-2 py-1 text-right font-mono text-xs text-[#0d0d0d]"
                />
              </label>
              <Row label="Digest" value={modal.digest ? short(modal.digest) : 'recomputing...'} />
            </dl>

            {modal.result && (
              <p
                className={`mt-4 rounded-xl p-3 text-sm ${
                  modal.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'
                }`}
              >
                {modal.ok && <Check className="mr-1 inline h-4 w-4" />}
                {modal.result}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="rounded-xl border border-black/15 px-4 py-2 text-sm font-semibold text-[#0d0d0d]"
              >
                Close
              </button>
              <button
                onClick={approve}
                disabled={modal.busy || !modal.digest}
                className="rounded-xl bg-[#c6f24e] px-4 py-2 text-sm font-bold text-[#0d0d0d] disabled:opacity-50"
              >
                {modal.busy ? 'Waiting for passkey...' : 'Sign with passkey'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, foot }: { label: string; value: string; foot: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#0d0d0d]">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{foot}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-[#0d0d0d]">{value}</dd>
    </div>
  );
}

function StateChip({ state }: { state: ChainIntent['state'] }) {
  const tone =
    state === 'active'
      ? 'bg-amber-100 text-amber-800'
      : state === 'consumed'
        ? 'bg-zinc-100 text-zinc-700'
        : 'bg-red-100 text-red-700';
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${tone}`}>{state}</span>;
}

const short = (value?: string) =>
  value && value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : (value ?? '');
