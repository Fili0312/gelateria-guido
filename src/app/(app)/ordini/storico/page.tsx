import Link from 'next/link';
import { Badge, Input, Select } from '@/components/ui';
import { elencoOrdiniSchema } from '@/features/orders/schema';
import { euro } from '@/features/products/format';
import { getCurrentUser } from '@/server/auth';
import { ordersRepository } from '@/server/repositories/orders';
import { suppliersRepository } from '@/server/repositories/suppliers';

export const dynamic = 'force-dynamic';

const ETICHETTE: Record<string, { testo: string; variante: 'success' | 'neutral' | 'warning' }> = {
  CONFIRMED: { testo: 'confermato', variante: 'success' },
  SENT: { testo: 'inviato', variante: 'success' },
  RECEIVED: { testo: 'ricevuto', variante: 'success' },
  CANCELLED: { testo: 'annullato', variante: 'neutral' },
};

export default async function StoricoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const grezzi = await searchParams;
  const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const analizzato = elencoOrdiniSchema.safeParse({
    q: primo(grezzi.q),
    stato: primo(grezzi.stato),
    supplierId: primo(grezzi.supplierId),
    giorni: primo(grezzi.giorni),
    pagina: primo(grezzi.pagina),
  });
  const query = analizzato.success ? analizzato.data : elencoOrdiniSchema.parse({});

  const [elenco, fornitori] = await Promise.all([
    ordersRepository(user.organizationId).elenco(query),
    suppliersRepository(user.organizationId).list({ q: '', status: 'all', sort: 'name-asc' }),
  ]);

  const pagine = Math.max(1, Math.ceil(elenco.totale / elenco.perPagina));
  const conFiltri =
    query.q !== '' || query.stato !== 'tutti' || query.supplierId !== '' || query.giorni !== 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-neutral-950 sm:text-3xl">
            Ordini fatti
          </h1>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Ogni ordine conserva prezzi, descrizioni e confezioni registrati alla conferma.
          </p>
        </div>
        <Link
          href="/ordini"
          className="bg-brand-600 hover:bg-brand-700 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-colors"
        >
          Ordine in corso
        </Link>
      </header>

      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="search">
        <Input
          name="q"
          label="Cerca un prodotto"
          defaultValue={query.q}
          placeholder="Es. amaretto"
        />
        <Select name="stato" label="Stato" defaultValue={query.stato}>
          <option value="tutti">Tutti</option>
          <option value="CONFIRMED">Confermati</option>
          <option value="SENT">Inviati</option>
          <option value="RECEIVED">Ricevuti</option>
          <option value="CANCELLED">Annullati</option>
        </Select>
        <Select name="supplierId" label="Fornitore" defaultValue={query.supplierId}>
          <option value="">Tutti</option>
          {fornitori.items.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        <Select name="giorni" label="Periodo" defaultValue={String(query.giorni)}>
          <option value="0">Sempre</option>
          <option value="30">Ultimi 30 giorni</option>
          <option value="90">Ultimi 3 mesi</option>
          <option value="365">Ultimo anno</option>
        </Select>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="focus-visible:ring-brand-600 min-h-11 cursor-pointer rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
          >
            Filtra
          </button>
          {conFiltri && (
            <Link
              href="/ordini/storico"
              className="min-h-11 cursor-pointer self-center text-sm text-neutral-500 hover:underline"
            >
              Azzera
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-neutral-600">
        <strong className="text-neutral-950">{elenco.totale}</strong>{' '}
        {elenco.totale === 1 ? 'ordine' : 'ordini'}
        {pagine > 1 && ` · pagina ${elenco.pagina} di ${pagine}`}
      </p>

      {elenco.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
          <p className="text-sm leading-6 text-neutral-500">
            {conFiltri
              ? 'Nessun ordine corrisponde ai filtri.'
              : 'Nessun ordine confermato. Gli ordini confermati vengono conservati in questo elenco.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {elenco.items.map((o) => {
            const etichetta = ETICHETTE[o.status] ?? {
              testo: o.status,
              variante: 'neutral' as const,
            };
            const quando = o.confirmedAt ?? o.createdAt;
            return (
              <li key={o.id}>
                <Link
                  href={`/ordini/${o.id}`}
                  className="block cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300"
                >
                  {/* Numero e importo sulla stessa riga, ai due estremi: sono
                      i due dati con cui un ordine si riconosce, e sul
                      telefono devono restare leggibili senza incolonnamenti
                      che si schiacciano. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="tabellare font-bold text-neutral-950">{o.code ?? '—'}</span>
                    <span className="tabellare text-lg font-extrabold text-neutral-950">
                      {euro(o.netto)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-neutral-500">
                    <span>
                      {new Date(quando).toLocaleDateString('it-IT', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-neutral-300">·</span>
                    <span>
                      {o.righe} {o.righe === 1 ? 'riga' : 'righe'} · {o.confezioni} conf.
                    </span>
                    <Badge variant={etichetta.variante}>{etichetta.testo}</Badge>
                  </div>
                  {o.fornitori.length > 0 && (
                    <p className="mt-1 truncate text-[13px] text-neutral-400">
                      {o.fornitori.join(' · ')}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pagine > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagine">
          {query.pagina > 1 ? (
            <Link
              href={`/ordini/storico?${new URLSearchParams({ ...grezzi, pagina: String(query.pagina - 1) } as Record<string, string>)}`}
              className="min-h-11 cursor-pointer rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
            >
              ← Precedenti
            </Link>
          ) : (
            <span />
          )}
          {query.pagina < pagine && (
            <Link
              href={`/ordini/storico?${new URLSearchParams({ ...grezzi, pagina: String(query.pagina + 1) } as Record<string, string>)}`}
              className="min-h-11 cursor-pointer rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
            >
              Successivi →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
