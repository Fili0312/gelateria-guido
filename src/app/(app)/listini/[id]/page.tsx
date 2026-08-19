import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImportProgress } from '@/components/price-lists/import-progress';
import { RawRows } from '@/components/price-lists/raw-rows';
import { ReviewPanel } from '@/components/price-lists/review-panel';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { prismaForOrganization } from '@/server/db';
import type { PriceListDetail } from '@/features/price-lists/dto';
import { priceListsRepository } from '@/server/repositories/price-lists';
import { anteprima } from '@/server/import/apply';
import { trovaRigheBloccanti } from '@/server/import/apply-guards';

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
        dimostrato
          ? 'border-green-200 bg-green-50 text-green-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'
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
          non dichiara il netto, quindi non c’era modo di verificarle con l’aritmetica. Vale la pena
          controllare qualche riga prima di importare.
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

  // L'anteprima dice cosa succederebbe applicando, senza applicare. Se non si
  // riesce a calcolarla — un listino ancora in lavorazione, per esempio — la
  // pagina si mostra lo stesso: il pannello sparisce, le righe restano.
  const revisione = await anteprima(user.organizationId, id).catch(() => null);
  const righeBloccanti = revisione
    ? trovaRigheBloccanti(
        [...revisione.righe.values()].map((riga) => ({
          id: riga.id,
          excluded: riga.excluded,
          matchStatus: riga.matchStatus,
          importabile: riga.campi.importabile,
          validationErrors: riga.validationErrors,
        })),
      )
    : { pending: [], nonImportabili: [] };

  // Quanti prodotti esistono già: serve a capire se questo listino è stato
  // abbinato contro un catalogo più vuoto di quello di adesso.
  const db = prismaForOrganization(user.organizationId);
  const prodottiACatalogo = await db.product.count();
  // Quante righe propongono un prodotto che esiste già. Zero, con un catalogo
  // pieno, è il segnale che l'abbinamento è stato fatto contro un catalogo
  // diverso da quello di adesso. «Prodotti nuovi» non serve a questo: conta i
  // codici fornitore mai visti, e resta alto anche quando l'aggancio c'è.
  const righeAgganciate = await db.priceList
    .findFirst({
      where: { id },
      select: { _count: { select: { rows: { where: { productId: { not: null } } } } } },
    })
    .then((l) => l?._count.rows ?? 0);

  return (
    <div className="space-y-7">
      <header>
        <Link href="/listini" className="text-sm text-neutral-500 hover:underline">
          ← Listini
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          {listino.supplierName} · {listino.scopeLabel}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <span className="max-w-md truncate">{listino.originalFilename}</span>
          <span>· caricato il {DATA.format(new Date(listino.uploadedAt))}</span>
          {listino.pageCount && <Badge variant="neutral">{listino.pageCount} pagine</Badge>}
          {/* Resta anche dopo l'applicazione: fra sei mesi, guardando cosa è
              successo al catalogo quel giorno, la modalità è la prima cosa da
              sapere. */}
          {listino.mode === 'PARTIAL' && (
            <Badge
              variant="brand"
              title="Aggiorna le sole righe presenti nel file: nessuna offerta viene disattivata"
            >
              aggiornamento parziale
            </Badge>
          )}
        </p>
      </header>

      <ImportProgress
        iniziale={listino}
        endpoint={withBasePath(`/api/price-lists/${listino.id}`)}
        endpointAnnulla={withBasePath(`/api/price-lists/${listino.id}/cancel`)}
      />

      {revisione && listino.prodotti > 0 && (
        <ReviewPanel
          parziale={listino.mode === 'PARTIAL'}
          anteprima={{
            riepilogo: revisione.riepilogo,
            daDecidere: revisione.confronti
              .filter((c) => c.esito === 'CONFEZIONE_CAMBIATA' && !c.confezioneRisolta)
              .map((c) => ({
                rigaId: c.chiaveRiga,
                differenze: c.differenze,
                prezzoPrima: c.prezzoPrima?.toString() ?? null,
                prezzoDopo: c.prezzoDopo?.toString() ?? null,
                nuovaConfezioneApplicabile: c.nuovaConfezioneApplicabile !== false,
              })),
            anomale: revisione.confronti
              .filter((c) => c.variazionePct !== null && c.variazionePct.abs().gt(40))
              .map((c) => ({
                rigaId: c.chiaveRiga,
                variazionePct: c.variazionePct?.toString() ?? null,
                prezzoPrima: c.prezzoPrima?.toString() ?? null,
                prezzoDopo: c.prezzoDopo?.toString() ?? null,
              })),
          }}
          stato={listino.status}
          endpointApply={withBasePath(`/api/price-lists/${listino.id}/apply`)}
          endpointRevert={withBasePath(`/api/price-lists/${listino.id}/revert`)}
          endpointRematch={withBasePath(`/api/price-lists/${listino.id}/rematch`)}
          endpointRows={withBasePath(`/api/price-lists/${listino.id}/rows`)}
          hrefRigheDaDecidere={`/convenienti?priceListId=${encodeURIComponent(listino.id)}`}
          hrefRigheDaCorreggere={`/convenienti?priceListId=${encodeURIComponent(listino.id)}&stato=tutti&limite=200`}
          prodottiACatalogo={prodottiACatalogo}
          righeAgganciate={righeAgganciate}
          righeDaDecidere={righeBloccanti.pending.length}
          righeNonImportabili={righeBloccanti.nonImportabili.length}
        />
      )}

      {listino.righe > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Riquadro etichetta="Righe estratte" valore={listino.righe} />
            <Riquadro etichetta="Campi interpretati" valore={listino.importabili} />
            <Riquadro etichetta="Da correggere" valore={listino.conErrori} />
            <Riquadro etichetta="Con avvisi" valore={listino.conAvvisi} />
          </dl>

          {listino.fonteProfilo && <ProfiloRiconosciuto listino={listino} />}

          <div>
            <h2 className="text-lg font-extrabold text-neutral-950">Righe del listino</h2>
            <p className="mt-1 mb-3 max-w-3xl text-sm leading-6 text-neutral-500">
              Come l’app ha letto il documento, riga per riga. Serve a giudicare se l’ha letto bene{' '}
              <strong>prima</strong> di importare qualsiasi cosa: la casella qui sotto mostra le
              celle originali, che è il modo di capire <em>perché</em> una riga è stata letta così.
            </p>
            {/* La domanda che si fa chiunque veda «189 prodotti» e poi il
                catalogo vuoto. Sparisce quando l'import e' stato applicato,
                perche' a quel punto la risposta e' un'altra. */}
            {listino.status !== 'APPLIED' && (
              <p className="mb-4 max-w-3xl rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-600">
                <strong className="font-semibold text-neutral-900">
                  Il catalogo non è ancora stato aggiornato.
                </strong>{' '}
                Queste righe stanno solo qui finché non premi <em>Applica al catalogo</em>: non
                hanno creato prodotti e non hanno cambiato prezzi. E si può annullare.
              </p>
            )}
            <RawRows righe={righe} />
          </div>
        </>
      )}
    </div>
  );
}
