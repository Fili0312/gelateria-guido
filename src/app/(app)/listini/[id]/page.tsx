import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImportProgress } from '@/components/price-lists/import-progress';
import { RawRows } from '@/components/price-lists/raw-rows';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import type { PriceListDetail } from '@/features/price-lists/dto';
import { priceListsRepository } from '@/server/repositories/price-lists';

export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Come si è capito quale colonna fosse quale.
 *
 * `aritmetica` e `ia` non sono la stessa cosa e non vanno mostrate uguali:
 * la prima è dimostrata dal conto che torna su ogni riga, la seconda è la
 * proposta di un modello. Chi rivede un import deve sapere dove guardare con
 * più attenzione.
 */
function ProfiloRiconosciuto({ listino }: { listino: PriceListDetail }) {
  const dimostrato = listino.fonteProfilo === 'aritmetica' || listino.fonteProfilo === 'salvato';
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
        dimostrato ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      {listino.fonteProfilo === 'aritmetica' && (
        <>
          <strong className="font-semibold">Colonne riconosciute e verificate.</strong> Su{' '}
          {listino.righeCheConfermano} righe il conto torna — prezzo di listino meno gli sconti fa
          esattamente il netto dichiarato. Non è una stima: è la prova che le colonne sono state
          lette giuste.
          {listino.righeCheSmentiscono > 0 && (
            <>
              {' '}
              {listino.righeCheSmentiscono === 1
                ? 'Una riga non torna'
                : `${listino.righeCheSmentiscono} righe non tornano`}
              : è il fornitore che ha arrotondato a modo suo. Vale il netto che ha dichiarato lui.
            </>
          )}
        </>
      )}
      {listino.fonteProfilo === 'salvato' && (
        <>
          <strong className="font-semibold">Riusato il profilo di questo fornitore.</strong> Le
          colonne erano già state riconosciute su un listino precedente: nessuna interpretazione
          nuova, nessuna chiamata al modello.
        </>
      )}
      {listino.fonteProfilo === 'ia' && (
        <>
          <strong className="font-semibold">Colonne proposte da un modello.</strong> Il documento
          non dichiara il netto, quindi non c’era modo di verificarle con l’aritmetica. Vale la
          pena controllare qualche riga prima di importare.
        </>
      )}
      {listino.fonteProfilo === 'indizi' && (
        <>
          <strong className="font-semibold">Colonne dedotte dalla forma dei dati.</strong> Non è
          stato possibile verificarle con il conto: controlla qualche riga prima di importare.
        </>
      )}
      {listino.chiamateIa > 0 && (
        <span className="mt-1 block text-xs opacity-80">
          {listino.chiamateIa} {listino.chiamateIa === 1 ? 'chiamata' : 'chiamate'} al modello ·
          costo stimato {listino.costoUsd.toFixed(4)} $
        </span>
      )}
    </div>
  );
}

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
            <Riquadro etichetta="Campi interpretati" valore={listino.importabili} />
            <Riquadro etichetta="Da correggere" valore={listino.conErrori} />
            <Riquadro etichetta="Con avvisi" valore={listino.conAvvisi} />
          </dl>

          {listino.fonteProfilo && (
            <ProfiloRiconosciuto listino={listino} />
          )}

          <div>
            <h2 className="text-lg font-black text-neutral-950">Righe grezze</h2>
            <p className="mt-1 mb-3 max-w-3xl text-sm leading-6 text-neutral-500">
              È il testo del PDF diviso in celle, non ancora interpretato: nessuno di questi valori
              è ancora un prezzo o un prodotto. Serve a giudicare se l’estrazione ha letto bene il
              documento, <strong>prima</strong> di importare qualsiasi cosa.
            </p>
            {/* La domanda che si fa chiunque veda «189 prodotti» e poi il
                catalogo vuoto. Meglio rispondere qui che lasciarla venire. */}
            <p className="mb-4 max-w-3xl rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-600">
              <strong className="font-semibold text-neutral-900">
                Il catalogo non è ancora stato toccato.
              </strong>{' '}
              Queste righe stanno solo qui: non hanno creato prodotti, non hanno cambiato prezzi e
              non compaiono in <em>Prodotti</em>. L’interpretazione dei campi arriva con la Fase 8,
              l’applicazione al catalogo con la Fase 10 — e passerà comunque da una revisione.
            </p>
            <RawRows righe={righe} />
          </div>
        </>
      )}
    </div>
  );
}
