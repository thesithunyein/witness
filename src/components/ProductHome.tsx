import { useState } from 'react';
import Prism from './Prism';

type Props = { onOpen: () => void; onRecord: () => void };

const TABS = [
  { id: 'transfer', label: 'Transfer', cmd: 'Sign the amount and the address. One use.' },
  { id: 'deposit', label: 'Deposit', cmd: 'MUSD into the Stability Pool. Fee 0.10%.' },
  { id: 'withdraw', label: 'Withdraw', cmd: 'The position comes back to the vault.' },
  { id: 'record', label: 'Record', cmd: 'Mezo testnet. Safe 0x17fc3f…9Ac8.' },
] as const;

export default function ProductHome({ onOpen, onRecord }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('transfer');
  const [swap, setSwap] = useState(false);
  const [copied, setCopied] = useState(false);
  const current = TABS.find((item) => item.id === tab) ?? TABS[0];

  const pick = (id: (typeof TABS)[number]['id']) => {
    if (id === tab) return;
    setSwap(true);
    window.setTimeout(() => {
      setTab(id);
      setSwap(false);
    }, 160);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.cmd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <section className="relative -mt-16 min-h-svh overflow-hidden" aria-label="Witness">
        <Prism />
        <div className="relative z-10 flex min-h-svh max-w-[560px] flex-col justify-center px-[clamp(16px,2.6vw,28px)] pb-16 pt-24">
          <h1 className="rise font-display text-[clamp(72px,8.6vw,124px)] font-normal leading-[0.9] tracking-[-0.035em] text-ink">
            Witness
          </h1>
          <p className="rise rise-2 mt-[clamp(14px,1.8vw,22px)] text-[clamp(28px,3.05vw,44px)] font-normal leading-[1.2] tracking-[-0.025em] text-ink">
            <span className="block">Nothing leaves</span>
            <span className="block">without your passkey.</span>
          </p>
          <div className="rise rise-3 mt-[clamp(24px,2.6vw,36px)] flex flex-wrap items-center gap-2 text-[15px]" role="tablist">
            {TABS.map((item, i) => (
              <span key={item.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-[11px] text-dim">·</span>}
                <button
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => pick(item.id)}
                  className={tab === item.id ? 'text-ink' : 'text-dim hover:text-muted'}
                >
                  {item.label}
                </button>
              </span>
            ))}
          </div>
          <div className="rise rise-4 relative mt-3.5 flex max-w-[440px] items-center justify-between gap-3 border-t border-white/20 pt-3.5 text-[15px] leading-normal">
            <span className={swap ? 'cmd-swap text-muted transition' : 'text-muted transition'}>{current.cmd}</span>
            <button
              onClick={() => void copy()}
              aria-label="Copy"
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] text-dim hover:bg-white/6 hover:text-ink"
            >
              {copied ? '✓' : '⎘'}
            </button>
          </div>
          <div className="mt-8 flex gap-3">
            <button onClick={onOpen} className="h-9 rounded-lg border border-white/15 bg-white/4 px-3 text-sm font-medium text-ink hover:bg-white/8">
              Open vault
            </button>
            <button onClick={onRecord} className="h-9 rounded-lg px-3 text-sm text-muted hover:text-ink">
              Contracts
            </button>
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl md:grid-cols-3">
          {[
            ['01', 'One key', 'The vault accepts a single passkey.'],
            ['02', 'Exact action', 'Amount, recipient, and type are inside the signature.'],
            ['03', 'One use', 'A replay is refused. The fee is 0.10%.'],
          ].map(([n, title, body], i) => (
            <article key={n} className={`px-6 py-10 ${i ? 'border-t border-line md:border-t-0 md:border-l' : ''}`}>
              <p className="font-mono text-[11px] text-dim">{n}</p>
              <h2 className="mt-4 text-3xl text-ink">{title}</h2>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
