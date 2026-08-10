import Link from 'next/link';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { DepartmentSplit, SpendChart } from '@/components/dashboard/spend-chart';
import { NewListDialog } from '@/components/new-list-dialog';
import { Badge } from '@/components/ui';
import { euro, numero } from '@/features/products/format';
import { getCurrentUser } from '@/server/auth';
import { dashboardRepository, type DaFare } from '@/server/repositories/dashboard';

export const dynamic = 'force-dynamic';

/**
 * La panoramica.
 *
 * Spesa e azioni restano in cima; sotto ci sono soltanto indicatori che fanno
 * decidere qualcosa: consumo, rincari, risparmio, fornitori e salute dei
 * listini. Ogni numero porta alla schermata da cui nasce.
 */

function Riquadro({
  href,
  etichetta,
  valore,
  nota,
  tono = 'neutro',
}: {
  href: string;
  etichetta: string;
  valore: string;
  nota: string;
  tono?: 'neutro' | 'brand' | 'attenzione';
}) {
  const colore =
    tono === 'brand'
      ? 'border-brand-200 bg-brand-50/60 hover:border-brand-300'
      : tono === 'attenzione'
        ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300'
        : 'border-neutral-200 bg-white hover:border-neutral-300';

  return (
    <Link
      href={href}
      className={`focus-visible:ring-brand-600 block cursor-pointer rounded-xl border px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none ${colore}`}
    >
      <p className="text-xs text-neutral-600">{etichetta}</p>
      <p className="tabellare mt-1 text-2xl font-black tracking-[-0.03em] text-neutral-950">
        {valore}
      </p>
      <p className="mt-0.5 text-xs leading-4 text-neutral-500">{nota}</p>
    </Link>
  );
}

/** Le code di lavoro: si mostrano **solo quando hanno qualcosa dentro**. */
function DaFareList({ daFare }: { daFare: DaFare }) {
  const voci = (
    [
      {
        href: '/convenienti',
        icona: 'sparkles',
        quante: daFare.righeDaAbbinare,
        testo: 'righe da abbinare: finché restano, quei prezzi non si confrontano',
      },
      {
        href: '/listini',
        icona: 'lists',
        quante: daFare.listiniInRevisione,
        testo: 'listini estratti e non ancora applicati',
      },
      {
        href: '/prodotti?classification=unclassified',
        icona: 'products',
        quante: daFare.prodottiDaClassificare,
        testo: 'prodotti senza categoria',
      },
      {
        href: '/prodotti',
        icona: 'warning',
        quante: daFare.confezioniDaDefinire,
        testo: 'offerte senza i pezzi per confezione: non entrano nei confronti',
      },
      {
        href: '/convenienti',
        icona: 'warning',
        quante: daFare.prodottiSenzaConfronto,
        testo: 'prodotti senza un confronto valido tra fornitori',
      },
    ] satisfies { href: string; icona: AppIconName; testo: string; quante: number }[]
  ).filter((v) => v.quante > 0);

  if (voci.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
        <AppIcon name="check" className="h-4 w-4 shrink-0" />
        Non c’è niente in sospeso.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {voci.map((v) => (
        <li key={v.href + v.testo}>
          <Link
            href={v.href}
            className="focus-visible:ring-brand-600 flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-neutral-300 focus-visible:ring-2 focus-visible:outline-none"
          >
            <AppIcon name={v.icona} className="h-4 w-4 shrink-0 text-neutral-400" />
            <span className="tabellare text-lg font-black text-neutral-950">{v.quante}</span>
            <span className="min-w-0 flex-1 text-sm text-neutral-600">{v.testo}</span>
            <AppIcon name="chevron" className="h-4 w-4 shrink-0 text-neutral-300" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const DATA_BREVE = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Rome',
});

const STATI_LISTINO: Record<
  string,
  { testo: string; variante: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }
> = {
  UPLOADED: { testo: 'caricato', variante: 'neutral' },
  EXTRACTING: { testo: 'estrazione', variante: 'brand' },
  EXTRACTED: { testo: 'estratto', variante: 'brand' },
  STRUCTURING: { testo: 'lettura', variante: 'brand' },
  MATCHING: { testo: 'abbinamento', variante: 'brand' },
  REVIEW: { testo: 'da rivedere', variante: 'warning' },
  APPLYING: { testo: 'applicazione', variante: 'brand' },
  APPLIED: { testo: 'applicato', variante: 'success' },
  FAILED: { testo: 'errore', variante: 'danger' },
  DISCARDED: { testo: 'scartato', variante: 'neutral' },
  REVERTED: { testo: 'annullato', variante: 'neutral' },
};

function SchedaDati({
  titolo,
  href,
  nota,
  children,
}: {
  titolo: string;
  href: string;
  nota: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="border-b border-neutral-100 px-5 py-4">
        <Link
          href={href}
          className="focus-visible:ring-brand-600 flex items-center gap-2 rounded font-black text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1">{titolo}</span>
          <AppIcon name="chevron" className="h-4 w-4 shrink-0 text-neutral-300" />
        </Link>
        <p className="mt-1 text-xs leading-5 text-neutral-500">{nota}</p>
      </header>
      {children}
    </section>
  );
}

function NessunDato({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm leading-6 text-neutral-500">{children}</p>;
}

function hrefProdotto(productId: string | null, supplierId: string): string {
  return productId ? `/prodotti/${productId}` : `/fornitori/${supplierId}/prodotti`;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const p = await dashboardRepository(user.organizationId).panoramica(user.id);
  const ultimo = p.ordini.ultimoIl
    ? new Date(p.ordini.ultimoIl).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Rome',
      })
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="brand" dot>
            Situazione
          </Badge>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Panoramica
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewListDialog />
          <Link
            href="/ordini"
            className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {p.bozza.righe > 0 ? 'Riprendi l’ordine' : 'Comincia un ordine'}
          </Link>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Riquadro
          href="/ordini"
          etichetta="Ordine in corso"
          valore={p.bozza.righe > 0 ? euro(p.bozza.netto) : '—'}
          nota={
            p.bozza.righe > 0
              ? `${p.bozza.righe} prodotti · ${p.bozza.confezioni} confezioni · ${p.bozza.fornitori} fornitori`
              : 'Nessun ordine aperto'
          }
          tono={p.bozza.righe > 0 ? 'brand' : 'neutro'}
        />
        <Riquadro
          href="/ordini/storico?giorni=30"
          etichetta="Spesa ultimi 30 giorni"
          valore={p.ordini.confermati > 0 ? euro(p.ordini.spesaUltimi30) : '—'}
          nota={
            p.ordini.confermati > 0
              ? `${p.ordini.ultimi30giorni} ordini · ultimo il ${ultimo}`
              : 'Nessun ordine ancora confermato'
          }
        />
        <Riquadro
          href="/convenienti"
          etichetta="Prodotti confrontabili"
          valore={String(p.catalogo.conConfronto)}
          nota={`su ${p.catalogo.prodotti} a catalogo, da ${p.catalogo.fornitori} fornitori`}
        />
        <Riquadro
          href="/convenienti"
          etichetta="Da sistemare"
          valore={String(
            p.daFare.righeDaAbbinare + p.daFare.listiniInRevisione + p.daFare.confezioniDaDefinire,
          )}
          nota="righe, listini e confezioni in sospeso"
          tono={
            p.daFare.righeDaAbbinare + p.daFare.listiniInRevisione + p.daFare.confezioniDaDefinire >
            0
              ? 'attenzione'
              : 'neutro'
          }
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <Link
              href="/ordini/storico?giorni=365"
              className="focus-visible:ring-brand-600 rounded font-black text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              Spesa negli ultimi 12 mesi
            </Link>
            {p.ordini.confermati > 0 && (
              <span className="text-xs text-neutral-500">
                {p.ordini.confermati} {p.ordini.confermati === 1 ? 'ordine' : 'ordini'} in tutto
              </span>
            )}
          </div>
          <SpendChart punti={p.spesa} />
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <Link
            href="/prodotti"
            className="focus-visible:ring-brand-600 mb-4 inline-block rounded font-black text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Dove va la spesa
          </Link>
          <DepartmentSplit reparti={p.reparti} daBozza={p.repartiDaBozza} />
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-green-200 bg-green-50/60 shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
          <Link
            href="/convenienti"
            className="focus-visible:ring-brand-600 group rounded-xl focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-green-800">
              <AppIcon name="savings" className="h-5 w-5" />
              Risparmio potenziale annuo
            </span>
            <span className="tabellare mt-2 block text-4xl font-black tracking-[-0.04em] text-green-950 group-hover:underline">
              {Number(p.risparmioPotenziale.importoAnnuo) > 0
                ? euro(p.risparmioPotenziale.importoAnnuo)
                : '—'}
            </span>
            <span className="mt-1 block text-sm leading-6 text-green-900/75">
              {p.risparmioPotenziale.prodotti > 0
                ? `${p.risparmioPotenziale.prodotti} prodotti · circa ${p.risparmioPotenziale.incidenzaPct}% della spesa annualizzata`
                : 'Servono acquisti e almeno due offerte confrontabili.'}
            </span>
          </Link>

          <div>
            <p className="mb-2 text-xs leading-5 text-green-900/70">
              Consumi reali degli ultimi {p.periodo.giorniOsservati} giorni, annualizzati e
              moltiplicati per la differenza attuale fra offerta migliore e più cara. È una stima
              massima: minimi d’ordine e consegne possono cambiare la scelta.
            </p>
            {p.risparmioPotenziale.dettaglio.length > 0 && (
              <ul className="divide-y divide-green-200/70 overflow-hidden rounded-xl border border-green-200 bg-white/75">
                {p.risparmioPotenziale.dettaglio.map((prodotto) => (
                  <li key={prodotto.productId}>
                    <Link
                      href={`/prodotti/${prodotto.productId}`}
                      className="focus-visible:ring-brand-600 flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-white focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-neutral-950">
                          {prodotto.nome}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {prodotto.migliore} invece di {prodotto.alternativa}
                        </span>
                      </span>
                      <span className="tabellare shrink-0 font-bold text-green-800">
                        {euro(prodotto.importoAnnuo)}/anno
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SchedaDati
          titolo="Prodotti più acquistati"
          href="/ordini/storico?giorni=365"
          nota="Ordinati per spesa netta: pezzi e confezioni, non omogenei tra articoli, restano visibili."
        >
          {p.prodottiPiuAcquistati.length === 0 ? (
            <NessunDato>Nessun acquisto nel periodo.</NessunDato>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {p.prodottiPiuAcquistati.map((prodotto) => (
                <li key={prodotto.productId ?? `supplier-${prodotto.supplierId}-${prodotto.nome}`}>
                  <Link
                    href={hrefProdotto(prodotto.productId, prodotto.supplierId)}
                    className="focus-visible:ring-brand-600 flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-neutral-950">
                        {prodotto.nome}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {prodotto.confezioni} conf. · {prodotto.ordini}{' '}
                        {prodotto.ordini === 1 ? 'ordine' : 'ordini'} · {euro(prodotto.netto)}
                      </span>
                    </span>
                    <span className="tabellare shrink-0 text-sm font-bold text-neutral-900">
                      {numero(prodotto.pezzi, 0)} unità
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SchedaDati>

        <SchedaDati
          titolo="Fornitori più utilizzati"
          href="/fornitori"
          nota="Per spesa netta confermata negli ultimi 12 mesi."
        >
          {p.fornitoriPiuUsati.length === 0 ? (
            <NessunDato>Nessun fornitore utilizzato nel periodo.</NessunDato>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {p.fornitoriPiuUsati.map((fornitore) => (
                <li key={fornitore.supplierId}>
                  <Link
                    href={`/fornitori/${fornitore.supplierId}/ordini`}
                    className="focus-visible:ring-brand-600 flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-neutral-950">
                        {fornitore.nome}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {fornitore.ordini} {fornitore.ordini === 1 ? 'ordine' : 'ordini'} ·{' '}
                        {fornitore.confezioni} conf. · {Math.round(fornitore.quota)}% della spesa
                      </span>
                    </span>
                    <span className="tabellare shrink-0 text-sm font-bold text-neutral-900">
                      {euro(fornitore.netto)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SchedaDati>

        <SchedaDati
          titolo="Maggiori aumenti di prezzo"
          href="/prodotti"
          nota="Prezzo corrente contro il precedente, per singola offerta."
        >
          {p.aumentiPrezzo.length === 0 ? (
            <NessunDato>Nessun aumento nello storico prezzi.</NessunDato>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {p.aumentiPrezzo.map((aumento) => (
                <li key={aumento.supplierProductId}>
                  <Link
                    href={hrefProdotto(aumento.productId, aumento.supplierId)}
                    className="focus-visible:ring-brand-600 flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-neutral-950">
                        {aumento.prodotto}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">
                        {aumento.fornitore} · {euro(aumento.prima)} → {euro(aumento.adesso)} · dal{' '}
                        {DATA_BREVE.format(new Date(aumento.dal))}
                      </span>
                    </span>
                    <Badge variant="danger" className="tabellare shrink-0">
                      +{numero(aumento.aumentoPct, 1)}%
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SchedaDati>

        <SchedaDati
          titolo="Ultimi listini caricati"
          href="/listini"
          nota="Stato reale della lavorazione, dal più recente."
        >
          {p.ultimiListini.length === 0 ? (
            <NessunDato>Nessun listino caricato.</NessunDato>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {p.ultimiListini.map((listino) => {
                const stato = STATI_LISTINO[listino.stato] ?? {
                  testo: listino.stato.toLocaleLowerCase('it'),
                  variante: 'neutral' as const,
                };
                return (
                  <li key={listino.id}>
                    <Link
                      href={`/listini/${listino.id}`}
                      className="focus-visible:ring-brand-600 flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-neutral-950">
                          {listino.fornitore} · {listino.copertura}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {DATA_BREVE.format(new Date(listino.caricatoIl))} · {listino.righe} righe
                          · {listino.nomeFile}
                        </span>
                      </span>
                      <Badge variant={stato.variante} className="shrink-0">
                        {stato.testo}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SchedaDati>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SchedaDati
          titolo={`Prodotti senza confronto (${p.senzaConfronto.totale})`}
          href="/convenienti"
          nota="Un solo fornitore, prezzo mancante oppure confezione non confrontabile."
        >
          {p.senzaConfronto.prodotti.length === 0 ? (
            <NessunDato>Tutti i prodotti con offerte hanno un confronto valido.</NessunDato>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {p.senzaConfronto.prodotti.map((prodotto) => (
                <li key={prodotto.productId}>
                  <Link
                    href={`/prodotti/${prodotto.productId}`}
                    className="focus-visible:ring-brand-600 flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold text-neutral-950">
                      {prodotto.nome}
                    </span>
                    <span className="max-w-[55%] shrink-0 text-right text-xs text-neutral-500">
                      {prodotto.motivo}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SchedaDati>

        <SchedaDati
          titolo={`Prodotti spariti dai listini (${p.spariti.totale})`}
          href="/prodotti"
          nota="Offerte non più presenti nell'ultima copertura applicata del fornitore."
        >
          {p.spariti.prodotti.length === 0 ? (
            <NessunDato>Nessuna offerta risulta sparita.</NessunDato>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {p.spariti.prodotti.map((prodotto) => (
                <li key={prodotto.supplierProductId}>
                  <Link
                    href={hrefProdotto(prodotto.productId, prodotto.supplierId)}
                    className="focus-visible:ring-brand-600 flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-neutral-950">
                        {prodotto.prodotto}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">
                        {prodotto.fornitore}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {DATA_BREVE.format(new Date(prodotto.sparitoIl))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SchedaDati>
      </div>

      <section className="space-y-3">
        <h2 className="font-black text-neutral-950">Da fare</h2>
        <DaFareList daFare={p.daFare} />
      </section>
    </div>
  );
}
