type Props = { onOpen: () => void; onRecord: () => void };

const RULES = [
  {
    n: '01',
    title: 'One key',
    body: 'The vault accepts a single passkey. A different key cannot spend.',
  },
  {
    n: '02',
    title: 'Exact action',
    body: 'Chain, contract, amount, recipient, and type sit inside the signature.',
  },
  {
    n: '03',
    title: 'One use',
    body: 'The permission is consumed. A replay is refused.',
  },
];

const MOVES = [
  { name: 'Transfer', detail: 'MUSD to an address you can read before you tap.' },
  { name: 'Pool deposit', detail: 'MUSD into the Mezo Stability Pool.' },
  { name: 'Pool withdraw', detail: 'Back into the vault. The fee is taken on the way.' },
];

export default function ProductHome({ onOpen, onRecord }: Props) {
  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-16 px-5 pb-20 pt-16 lg:grid-cols-12 lg:pt-24">
        <div className="lg:col-span-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Treasury control
          </p>
          <h1 className="mt-5 max-w-[12ch] text-[3.25rem] leading-[0.95] text-ink sm:text-7xl">
            Nothing leaves without your passkey.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            Software may request a payment. You sign the exact action. Then that permission is gone.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={onOpen}
              className="h-12 rounded-full bg-ink px-6 text-sm font-medium text-paper"
            >
              Open the vault
            </button>
            <button
              onClick={onRecord}
              className="h-12 rounded-full border border-line px-6 text-sm font-medium text-ink"
            >
              Contracts
            </button>
          </div>
        </div>

        <div className="relative lg:col-span-6">
          <Specimen />
        </div>
      </section>

      <section className="border-y border-line">
        <div className="mx-auto grid max-w-6xl md:grid-cols-3">
          {RULES.map((rule, i) => (
            <article
              key={rule.n}
              className={`px-6 py-10 ${i > 0 ? 'border-t border-line md:border-t-0 md:border-l' : ''}`}
            >
              <p className="font-mono text-[11px] text-muted">{rule.n}</p>
              <h2 className="mt-4 text-3xl text-ink">{rule.title}</h2>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{rule.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 className="text-4xl text-ink">Three moves.</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Each one is a separate signature. A transfer approval cannot be reused as a pool deposit.
          </p>
        </div>
        <ol className="lg:col-span-8">
          {MOVES.map((move) => (
            <li
              key={move.name}
              className="flex items-baseline justify-between gap-6 border-t border-line py-5 last:border-b"
            >
              <span className="font-display text-2xl text-ink">{move.name}</span>
              <span className="max-w-xs text-right text-sm text-muted">{move.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] border border-line bg-card px-8 py-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-3xl text-ink">The fee is 0.10%.</h2>
            <p className="mt-2 max-w-md text-sm text-muted">
              Taken from the signed amount. The recipient gets the rest. Capped at 1%.
            </p>
          </div>
          <button
            onClick={onOpen}
            className="h-12 shrink-0 rounded-full bg-moss px-6 text-sm font-medium text-paper"
          >
            Sign in the vault
          </button>
        </div>
      </section>
    </div>
  );
}

function Specimen() {
  return (
    <div className="relative mx-auto h-[400px] w-full max-w-[520px] overflow-hidden [perspective:1400px] sm:h-[460px]">
      <svg
        className="seal-spin absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 text-ink/15 sm:h-[440px] sm:w-[440px]"
        viewBox="0 0 200 200"
        aria-hidden
      >
        <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="0.4" />
        <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeWidth="0.4" />
        {Array.from({ length: 72 }).map((_, i) => {
          const a = (i / 72) * Math.PI * 2;
          const inner = i % 6 === 0 ? 84 : 88;
          const x1 = 100 + Math.cos(a) * inner;
          const y1 = 100 + Math.sin(a) * inner;
          const x2 = 100 + Math.cos(a) * 96;
          const y2 = 100 + Math.sin(a) * 96;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={i % 6 === 0 ? 0.8 : 0.35} />;
        })}
      </svg>

      <div className="specimen absolute left-1/2 top-1/2 w-[min(100%,320px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] border border-line bg-card p-5">
        <div className="flex items-center justify-between">
          <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-cover" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">What you sign</span>
        </div>
        <p className="mt-8 font-display text-5xl leading-none tracking-tight text-ink">1.20</p>
        <p className="mt-1 text-sm text-muted">MUSD · transfer</p>
        <dl className="mt-6 space-y-2 border-t border-line pt-4 text-sm">
          <SpecRow k="To" v="0x8841…e319" />
          <SpecRow k="Ceiling" v="50.00" />
          <SpecRow k="Fee" v="0.0012" />
          <SpecRow k="Use" v="Once" />
        </dl>
        <div className="mt-5 flex items-center gap-2 text-xs text-moss">
          <span className="h-1.5 w-1.5 rounded-full bg-moss" />
          Waiting for the passkey
        </div>
      </div>
    </div>
  );
}

function SpecRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="font-mono text-[13px] text-ink">{v}</dd>
    </div>
  );
}
