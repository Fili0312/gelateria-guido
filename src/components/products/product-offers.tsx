import Link from 'next/link';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import type { SupplierOffer } from '@/features/products/dto';
import {
  catenaSconti,
  contenutoConfezione,
  euro,
  formatoConfezione,
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
function ordina(offerte: readonly SupplierOffer[]): SupplierOffer[] {
  const confrontabili = offerte.filter((o) => o.packQuantityConfirmed && o.price);
  const resto = offerte.filter((o) => !(o.packQuantityConfirmed && o.price));
  confrontabili.sort((a, b) => Number(a.price!.unitPrice) - Number(b.price!.unitPrice));
  return [...confrontabili, ...resto];
}

export function ProductOffers({ offers }: { offers: SupplierOffer[] }) {
  if (offers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
        Nessun fornitore collegato a questo prodotto. Finché non ce ne sono almeno due, non c’è
        niente da confrontare.
      </p>
    );
  }

  const ordinate = ordina(offers);
  const migliore = ordinate.find((o) => o.packQuantityConfirmed && o.price);
  const confrontabili = ordinate.filter((o) => o.packQuantityConfirmed && o.price).length;

  return (
    <div className="space-y-3">
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
            const eMigliore = migliore?.id === offerta.id && confrontabili > 1;
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
                    {formatoConfezione(offerta.unitSize, offerta.unitOfMeasure, offerta.packQuantity)}
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

      {confrontabili < offers.length && (
        <p className="text-xs text-neutral-500">
          {offers.length - confrontabili} offerte non entrano nel confronto: manca il numero di
          pezzi per confezione, oppure il prezzo. Un prezzo per unità calcolato su una confezione
          ignota sarebbe indistinguibile da uno vero.
        </p>
      )}
    </div>
  );
}
