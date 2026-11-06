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
          <h1 className="rise max-w-[12ch] text-[clamp(40px,5.2vw,72px)] font-normal leading-[1.05] tracking-[-0.03em] text-ink">
            Nothing leaves without your passkey.
          </h1>
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
      <section id="how" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-12 md:py-24">
          <div className="md:col-span-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-dim">How it works</p>
            <h2 className="mt-4 max-w-[10ch] text-4xl text-ink md:text-5xl">Four steps. Then it is spent.</h2>
          </div>
          <ol className="md:col-span-8">
            {[
              ['Bind', 'Create a passkey on this site. It is enrolled once.'],
              ['Ask', 'Software requests a transfer, a deposit, or a withdraw.'],
              ['Sign', 'You approve that amount, that address, and that action.'],
              ['Done', 'The vault pays the net. The same signature cannot run again.'],
            ].map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[auto_1fr] gap-6 border-t border-line py-6">
                <span className="font-mono text-[11px] text-dim">0{i + 1}</span>
                <div>
                  <h3 className="text-2xl text-ink">{title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="faq" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-12 md:py-24">
          <div className="md:col-span-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-dim">FAQ</p>
            <h2 className="mt-4 text-4xl text-ink md:text-5xl">Plain answers.</h2>
          </div>
          <div className="md:col-span-8">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group border-t border-line py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg text-ink">
                  {q}
                  <span className="text-dim group-open:hidden">+</span>
                  <span className="hidden text-dim group-open:inline">–</span>
                </summary>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const FAQ = [
  ['What can leave the vault?', 'A transfer, a Stability Pool deposit, or a withdraw. Each one is its own signature.'],
  ['Can software spend on its own?', 'No. It can ask. The passkey is the only approval, including amounts under the ceiling.'],
  ['What does the fee cover?', '0.10% of the signed amount, taken before the rest moves. It cannot be set above 1%.'],
  ['What if I lose the passkey?', 'There is no recovery. The key is enrolled once. What is already in the vault stays there.'],
  ['Is this audited?', 'No. The source matches the Mezo testnet explorer. That is not an audit.'],
  ['Where does it run?', 'Mezo testnet. Open the vault on this site. A passkey from another address will not verify.'],
] as const;
