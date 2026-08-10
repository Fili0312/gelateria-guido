import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppIcon } from '@/components/app-icon';
import { Badge } from '@/components/ui';
import { euro, formatoConfezione } from '@/features/products/format';
import { getCurrentUser } from '@/server/auth';
import { prismaForOrganization } from '@/server/db';

export const dynamic = 'force-dynamic';

/**
 * Un ordine confermato.
 *
 * Legge **solo gli snapshot**, mai il catalogo attuale: è la prova che il
 * congelamento ha funzionato. Fra sei mesi questa pagina deve mostrare i
 * prezzi di oggi anche se il prodotto è stato rinominato, il fornitore
 * cambiato e l'offerta cancellata.
 */
export default async function OrdineConfermatoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  const ordine = await prismaForOrganization(user.organizationId).order.findFirst({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      note: true,
      confirmedAt: true,
      totalNet: true,
      totalVat: true,
      totalGross: true,
      lines: {
        select: {
          id: true,
          nameSnapshot: true,
          supplierNameSnapshot: true,
          supplierCodeSnapshot: true,
          packQuantitySnapshot: true,
          unitSizeSnapshot: true,
          uomSnapshot: true,
          quantityPacks: true,
          unitPriceNetSnapshot: true,
          lineTotalNet: true,
          note: true,
        },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!ordine || ordine.status === 'DRAFT') notFound();

  const perFornitore = new Map<string, typeof ordine.lines>();
  for (const riga of ordine.lines) {
    const elenco = perFornitore.get(riga.supplierNameSnapshot) ?? [];
    elenco.push(riga);
    perFornitore.set(riga.supplierNameSnapshot, elenco);
  }

  return (
    <div className="space-y-5">
      <header>
        <Link href="/ordini" className="text-sm text-neutral-500 hover:underline">
          ← Ordini
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Ordine {ordine.code}
          </h1>
          <Badge variant="success">confermato</Badge>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          {ordine.confirmedAt &&
            new Date(ordine.confirmedAt).toLocaleString('it-IT', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
          · {ordine.lines.length} righe · {perFornitore.size}{' '}
          {perFornitore.size === 1 ? 'fornitore' : 'fornitori'}
        </p>
      </header>

      <p className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-900">
        <AppIcon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          L’ordine è congelato: prezzi, confezioni e descrizioni sono quelli del momento della
          conferma e non cambieranno più, qualunque cosa succeda al catalogo.
          <br />
          <span className="text-green-800">
            I documenti per i fornitori e l’invio via email arrivano con le Fasi 16 e 17.
          </span>
        </span>
      </p>

      {[...perFornitore.entries()].map(([fornitore, righe]) => (
        <section
          key={fornitore}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
            <h2 className="font-black text-neutral-950">{fornitore}</h2>
            <p className="tabellare text-sm text-neutral-600">
              {righe.length} righe ·{' '}
              <strong className="text-neutral-950">
                {euro(righe.reduce((n, r) => n + Number(r.lineTotalNet), 0))}
              </strong>
            </p>
          </header>
          <ul className="divide-y divide-neutral-100">
            {righe.map((riga) => (
              <li key={riga.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
                <span className="tabellare w-10 shrink-0 font-bold text-neutral-950">
                  {riga.quantityPacks}×
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-neutral-950">
                    {riga.nameSnapshot}
                  </span>
                  <span className="ml-2 text-xs text-neutral-500">
                    {formatoConfezione(
                      riga.unitSizeSnapshot.toString(),
                      riga.uomSnapshot as 'L',
                      riga.packQuantitySnapshot,
                    )}
                    {riga.supplierCodeSnapshot && ` · cod. ${riga.supplierCodeSnapshot}`}
                  </span>
                </span>
                <span className="tabellare text-xs text-neutral-500">
                  {euro(riga.unitPriceNetSnapshot.toString())}
                </span>
                <span className="tabellare w-20 text-right text-sm font-bold text-neutral-950">
                  {euro(riga.lineTotalNet.toString())}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {ordine.note && (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-700">
          <span className="font-semibold text-neutral-900">Nota:</span> {ordine.note}
        </p>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-neutral-600">
            <dt>Netto</dt>
            <dd className="tabellare">{euro(ordine.totalNet.toString())}</dd>
          </div>
          {Number(ordine.totalVat) > 0 && (
            <div className="flex justify-between text-neutral-600">
              <dt>IVA</dt>
              <dd className="tabellare">{euro(ordine.totalVat.toString())}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-neutral-100 pt-2">
            <dt className="font-semibold text-neutral-900">Totale</dt>
            <dd className="tabellare text-2xl font-black text-neutral-950">
              {euro(ordine.totalGross.toString())}
            </dd>
          </div>
        </dl>
      </section>

      <Link
        href="/ordini"
        className="bg-brand-600 hover:bg-brand-700 inline-flex min-h-11 cursor-pointer items-center rounded-lg px-4 text-sm font-semibold text-white"
      >
        Comincia un nuovo ordine
      </Link>
    </div>
  );
}
