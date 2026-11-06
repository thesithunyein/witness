import { MEZO_DEPLOYMENT } from '../data/witnessData';

const ROWS: { name: string; address: string }[] = [
  { name: 'Vault', address: MEZO_DEPLOYMENT.contracts.DemoSafe },
  { name: 'MUSD', address: MEZO_DEPLOYMENT.contracts.DemoUSD },
  { name: 'Registry', address: MEZO_DEPLOYMENT.contracts.WitnessIntentRegistry },
  { name: 'Verifier', address: MEZO_DEPLOYMENT.contracts.WitnessVerifier },
  { name: 'Executor', address: MEZO_DEPLOYMENT.contracts.AgentExecutor },
];

export default function Record() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-14">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">Record</p>
      <h1 className="mt-3 text-5xl text-ink">Mezo testnet.</h1>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
        Chain {MEZO_DEPLOYMENT.chainId}. The contracts are tested, not audited. A spend still needs
        the passkey enrolled for that vault.
      </p>

      <ul className="mt-10 divide-y divide-line border-y border-line">
        {ROWS.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-4 py-4">
            <span className="text-sm text-ink">{row.name}</span>
            <a
              href={`${MEZO_DEPLOYMENT.explorerUrl}/address/${row.address}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              {row.address.slice(0, 6)}…{row.address.slice(-4)}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm leading-relaxed text-muted">
        Stability Pool on this chain is{' '}
        <span className="font-mono text-[11px] text-ink">0x1CCA…680e</span>.
        Source is on GitHub.
      </p>
    </div>
  );
}
