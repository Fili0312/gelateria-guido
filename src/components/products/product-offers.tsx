import Link from 'next/link';
import type { ComparisonRow } from '@/features/reports/dto';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import type { SupplierOffer } from '@/features/products/dto';
import {
  catenaSconti,
  contenutoConfezione,
  etichettaBasis,
  euro,
  formatoConfezione,
  numero,
  prezzoUnitario,
} from '@/features/products/format';

/**
 * Le offerte di un prodotto, ordinate dalla più conveniente.
 *
 * L'ordinamento avviene solo fra le offerte confrontabili: quelle con la
 * confezione non dichiarata restano in fondo e non ricevono una posizione,
 * perché il loro prezzo per unità sarebbe calcolato su pezzi inventati. È la
 * stessa regola che applica `confrontaOfferte` nel dominio, qui resa visibile.
 */
/**
 * La risposta, in una riga, prima della tabella.
 *
 * La tabella contiene già tutto, ma «tutto» va letto: chi apre la scheda
 * vuole sapere dove conviene comprarlo, non ricostruirlo confrontando sette
 * colonne. Quando invece un confronto non c'è, si dice **perché** — un vuoto
 * lascerebbe pensare a un errore.
 */
function Riepilogo({ confronto }: { confronto: ComparisonRow }) {
  if (confronto.state !== 'CONFRONTATO') {
    return (
      <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600">
        {confronto.reason}
      </p>
    );
  }

  return (
    <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-900">
      Conviene da <strong>{confronto.best!.supplierName}</strong>: {euro(confronto.best!.priceNet)}{' '}
      a confezione, cioè{' '}
      <strong>
        {`${euro(confronto.best!.unitPrice, 4)}${etichettaBasis(confronto.best!.unitPriceBasis).slice(1)}`}
      </strong>
      . Sono <strong>{euro(confronto.savingPerPack!)}</strong> in meno su una confezione rispetto a{' '}
      {confronto.worst!.supplierName} ({numero(confronto.savingPct!, 1)}%).
      {confronto.anyStale && ' Attenzione: almeno uno dei prezzi confrontati è fermo da tempo.'}
    </p>
  );
}

/**
 * L'ordine è quello deciso dal dominio, non uno locale.
 *
 * Riordinare qui per conto proprio sembrerebbe innocuo — è pur sempre il
 * prezzo unitario — ma basterebbe una regola diversa su un caso di pareggio o
 * su un'unità non confrontabile perché questa scheda indicasse come «più
 * conveniente» un fornitore diverso da quello dell'elenco «Convenienti». Due
 * schermate in disaccordo, e nessuna delle due sbagliata a guardarla da sola.
 */
function ordina(offerte: readonly SupplierOffer[], classifica: readonly string[]): SupplierOffer[] {
  const posizione = new Map(classifica.map((id, indice) => [id, indice]));
  const confrontate = offerte
    .filter((o) => posizione.has(o.id))
    .sort((a, b) => posizione.get(a.id)! - posizione.get(b.id)!);
  const escluse = offerte.filter((o) => !posizione.has(o.id));
  return [...confrontate, ...escluse];
}

export function ProductOffers({
  offers,
  confronto,
}: {
  offers: SupplierOffer[];
  confronto: ComparisonRow;
}) {
  if (offers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
        Nessun fornitore collegato a questo prodotto. Finché non ce ne sono almeno due, non c’è
        niente da confrontare.
      </p>
    );
  }

  const ordinate = ordina(offers, confronto.ranked.map((o) => o.supplierProductId));
  const idMigliore = confronto.best?.supplierProductId;
  const confrontabili = confronto.offersCompared;

  return (
    <div className="space-y-3">
      <Riepilogo confronto={confronto} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fornitore</TableHead>
            <TableHead>Descrizione</TableHead>
            <TableHead>Confezione</TableHead>
            <TableHead>Listino</TableHead>
            <TableHead>Sconti</TableHead>
            <TableHead>Netto</TableHead>
            <TableHead>Per unità</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordinate.map((offerta) => {
            const eMigliore = idMigliore === offerta.id && confrontabili > 1;
            return (
              <TableRow key={offerta.id}>
                <TableCell>
                  <Link
                    href={`/fornitori/${offerta.supplierId}`}
                    className="font-semibold text-neutral-950 hover:underline"
                  >
                    {offerta.supplierName}
                  </Link>
                  {offerta.supplierCode && (
                    <span className="tabellare ml-2 text-xs text-neutral-500">
                      {offerta.supplierCode}
                    </span>
                  )}
                  {eMigliore && (
                    <Badge variant="success" className="ml-2">
                      più conveniente
                    </Badge>
                  )}
                  {!offerta.active && (
                    <Badge variant="neutral" className="ml-2">
                      non più a listino
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-xs truncate" title={offerta.rawName}>
                  {offerta.rawName}
                </TableCell>
                <TableCell className="tabellare">
                  <span className="block">
                    {formatoConfezione(
                      offerta.unitSize,
                      offerta.unitOfMeasure,
                      offerta.packQuantity,
                    )}
                  </span>
                  {offerta.packQuantityConfirmed ? (
                    <span className="block text-xs text-neutral-500">
                      {contenutoConfezione(offerta.contentPerPack, offerta.baseUnit)}
                    </span>
                  ) : (
                    <Badge variant="warning" className="mt-1">
                      confezione da definire
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="tabellare">
                  {offerta.price ? euro(offerta.price.priceList) : '—'}
                </TableCell>
                <TableCell className="tabellare text-xs">
                  {offerta.price ? catenaSconti(offerta.price.discounts) : '—'}
                </TableCell>
                <TableCell className="tabellare font-semibold">
                  {offerta.price ? euro(offerta.price.priceNet) : '—'}
                </TableCell>
                <TableCell className="tabellare">{prezzoUnitario(offerta)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {confronto.excluded.length > 0 && (
        <p className="text-xs leading-5 text-neutral-500">
          Fuori dal confronto:{' '}
          {confronto.excluded.map((e) => `${e.supplierName} (${e.reason})`).join(' · ')}. Un prezzo
          per unità calcolato su una confezione ignota sarebbe indistinguibile da uno vero.
        </p>
      )}
    </div>
  );
}
