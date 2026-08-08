import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImportProgress } from '@/components/price-lists/import-progress';
import { RawRows } from '@/components/price-lists/raw-rows';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { priceListsRepository } from '@/server/repositories/price-lists';

export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function Riquadro({ etichetta, valore }: { etichetta: string; valore: string | number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <dt className="text-xs text-neutral-500">{etichetta}</dt>
      <dd className="tabellare mt-1 font-semibold text-neutral-950">{valore}</dd>
    </div>
  );
}

export default async function PriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  const repo = priceListsRepository(user.organizationId);
  const listino = await repo.get(id);
  if (!listino) notFound();

  const righe = await repo.righe(id, { tipo: 'tutte', limite: 500, salta: 0 });

  return (
    <div className="space-y-7">
      <header>
        <Link href="/listini" className="text-sm text-neutral-500 hover:underline">
          ← Listini
        </Link>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          {listino.supplierName} · {listino.scopeLabel}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <span className="max-w-md truncate">{listino.originalFilename}</span>
          <span>· caricato il {DATA.format(new Date(listino.uploadedAt))}</span>
          {listino.pageCount && <Badge variant="neutral">{listino.pageCount} pagine</Badge>}
        </p>
      </header>

      <ImportProgress
        iniziale={listino}
        endpoint={withBasePath(`/api/price-lists/${listino.id}`)}
        endpointAnnulla={withBasePath(`/api/price-lists/${listino.id}/cancel`)}
      />

      {listino.righe > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Riquadro etichetta="Righe estratte" valore={listino.righe} />
            <Riquadro etichetta="Colonne riconosciute" valore={listino.colonne.length} />
            <Riquadro etichetta="Intestazioni scartate" valore={listino.intestazioniScartate} />
            <Riquadro etichetta="Righe a capo unite" valore={listino.continuazioniUnite} />
          </dl>

          <div>
            <h2 className="text-lg font-black text-neutral-950">Righe grezze</h2>
            <p className="mt-1 mb-4 max-w-3xl text-sm leading-6 text-neutral-500">
              È il testo del PDF diviso in celle, non ancora interpretato: nessuno di questi valori
              è ancora un prezzo o un prodotto. Serve a giudicare se l’estrazione ha letto bene il
              documento, <strong>prima</strong> di importare qualsiasi cosa.
            </p>
            <RawRows righe={righe} />
          </div>
        </>
      )}
    </div>
  );
}
