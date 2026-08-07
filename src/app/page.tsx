import { leggiStato } from '@/server/health';

// Lo stato va letto a ogni richiesta: una pagina di diagnostica memorizzata
// nella cache direbbe che va tutto bene anche mentre il database è spento.
export const dynamic = 'force-dynamic';

function Spia({ ok, testo }: { ok: boolean; testo: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-brand-500' : 'bg-aumento'}`}
      />
      <span className={ok ? 'text-neutral-700' : 'text-aumento font-medium'}>{testo}</span>
    </span>
  );
}

export default async function PaginaStato() {
  const stato = await leggiStato();

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="mb-10">
        <p className="text-brand-700 text-sm font-semibold tracking-wide uppercase">
          Gelateria Guido
        </p>
        <h1 className="mt-1 text-3xl font-bold text-balance sm:text-4xl">
          Gestione listini e ordini
        </h1>
        <p className="mt-3 max-w-prose text-neutral-600">
          L&apos;infrastruttura è in piedi. Le schermate arrivano con le fasi successive: la roadmap
          è in <code className="text-sm">docs/ROADMAP.md</code>.
        </p>
      </header>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 flex items-center justify-between gap-3 text-lg font-semibold">
          Stato del sistema
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              stato.ok ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-aumento'
            }`}
          >
            {stato.ok ? 'operativo' : 'da controllare'}
          </span>
        </h2>

        <dl className="tabellare divide-y divide-neutral-100 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
            <dt className="text-neutral-500">Applicazione</dt>
            <dd>
              <Spia ok testo="Next.js in ascolto" />
            </dd>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
            <dt className="text-neutral-500">Database</dt>
            <dd>
              <Spia
                ok={stato.database.ok}
                testo={
                  stato.database.ok
                    ? `PostgreSQL ${stato.database.versione} — ${stato.database.latenzaMs} ms`
                    : 'non raggiungibile'
                }
              />
            </dd>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
            <dt className="text-neutral-500">Estensioni</dt>
            <dd>
              <Spia
                ok={stato.database.estensioniMancanti.length === 0}
                testo={
                  stato.database.estensioniMancanti.length === 0
                    ? stato.database.estensioni.join(', ')
                    : `mancano: ${stato.database.estensioniMancanti.join(', ')}`
                }
              />
            </dd>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
            <dt className="text-neutral-500">Migrazioni applicate</dt>
            <dd className="text-neutral-700">{stato.migrazioniApplicate ?? '—'}</dd>
          </div>
        </dl>

        {stato.database.errore && (
          <p className="text-aumento mt-4 rounded-lg bg-red-50 p-3 text-sm">
            {stato.database.errore}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-3 text-lg font-semibold">A che punto siamo</h2>
        <ol className="space-y-2 text-sm">
          <li className="flex gap-3">
            <span className="text-brand-600 font-semibold">Fase 0</span>
            <span className="text-neutral-600">
              Decisioni e materiale — chiusa, mancano i PDF dei listini reali
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-brand-600 font-semibold">Fase 1</span>
            <span className="text-neutral-600">Setup e infrastruttura — questa pagina</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-neutral-400">Fase 2</span>
            <span className="text-neutral-500">
              Modello dati e nucleo deterministico (unità di misura, prezzi)
            </span>
          </li>
        </ol>
      </section>
    </main>
  );
}
