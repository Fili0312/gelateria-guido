import Link from 'next/link';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { DepartmentSplit, SpendChart } from '@/components/dashboard/spend-chart';
import { NewListDialog } from '@/components/new-list-dialog';
import { Badge } from '@/components/ui';
import { euro } from '@/features/products/format';
import { getCurrentUser } from '@/server/auth';
import { dashboardRepository, type DaFare } from '@/server/repositories/dashboard';

export const dynamic = 'force-dynamic';

/**
 * La panoramica.
 *
 * Risponde a due domande e basta: **quanto sto spendendo e in cosa**, e **cosa
 * c'è da fare adesso**. I conteggi d'anagrafica non ci sono più: «categorie
 * attive: 29» è un numero vero che non cambia mai e non fa decidere niente.
 *
 * Ogni riquadro è un collegamento. Un numero che non si può aprire è
 * decorazione, e la decorazione occupa lo spazio delle cose che servono.
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
  const voci = ([
    {
      href: '/abbinamenti',
      icona: 'sparkles',
      quante: daFare.righeDaAbbinare,
      testo: 'righe da abbinare a un prodotto',
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
  ] satisfies { href: string; icona: AppIconName; testo: string; quante: number }[]).filter(
    (v) => v.quante > 0,
  );

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

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const p = await dashboardRepository(user.organizationId).panoramica(user.id);
  const ultimo = p.ordini.ultimoIl
    ? new Date(p.ordini.ultimoIl).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
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
          href="/ordini"
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
          href="/abbinamenti"
          etichetta="Da sistemare"
          valore={String(
            p.daFare.righeDaAbbinare + p.daFare.listiniInRevisione + p.daFare.confezioniDaDefinire,
          )}
          nota="righe, listini e confezioni in sospeso"
          tono={
            p.daFare.righeDaAbbinare + p.daFare.listiniInRevisione + p.daFare.confezioniDaDefinire > 0
              ? 'attenzione'
              : 'neutro'
          }
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-black text-neutral-950">Spesa negli ultimi 12 mesi</h2>
            {p.ordini.confermati > 0 && (
              <span className="text-xs text-neutral-500">
                {p.ordini.confermati} {p.ordini.confermati === 1 ? 'ordine' : 'ordini'} in tutto
              </span>
            )}
          </div>
          <SpendChart punti={p.spesa} />
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-black text-neutral-950">Dove va la spesa</h2>
          <DepartmentSplit reparti={p.reparti} daBozza={p.repartiDaBozza} />
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-black text-neutral-950">Da fare</h2>
        <DaFareList daFare={p.daFare} />
      </section>
    </div>
  );
}
