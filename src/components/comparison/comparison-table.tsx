import Link from 'next/link';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { CategoryBadge } from '@/components/taxonomy/category-badge';
import type { ComparedOffer, ComparisonRow } from '@/features/reports/dto';
import { etichettaBasis, euro, formatoConfezione, numero } from '@/features/products/format';

/**
 * La tabella che risponde a «dove conviene comprarlo».
 *
 * Ogni riga mette la migliore accanto alla più cara, perché il risparmio è
 * una **differenza**: mostrarlo da solo lo renderebbe un numero da credere
 * sulla parola, mentre così si vede da cosa nasce e si può ricontrollare.
 */

function Offerta({ offerta, tono }: { offerta: ComparedOffer; tono: 'buono' | 'neutro' }) {
  const colore = tono === 'buono' ? 'text-green-800' : 'text-neutral-700';
  return (
    <div className="min-w-44">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`font-semibold ${colore}`}>{offerta.supplierName}</span>
        {offerta.stale && (
          <Badge
            variant="warning"
            title={`Il prezzo non si aggiorna dal ${new Date(offerta.validFrom).toLocaleDateString('it-IT')}`}
          >
            prezzo fermo
          </Badge>
        )}
      </div>
      <div className="tabellare mt-0.5 text-sm text-neutral-900">
        {euro(offerta.priceNet)}
        <span className="ml-2 text-xs text-neutral-500">
          {`${euro(offerta.unitPrice, 4)}${etichettaBasis(offerta.unitPriceBasis).slice(1)}`}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-neutral-500">
        {formatoConfezione(offerta.unitSize, offerta.unitOfMeasure, offerta.packQuantity)}
      </div>
    </div>
  );
}

export function ComparisonTable({
  righe,
  confrontiTotali,
}: {
  righe: ComparisonRow[];
  /** Quanti confronti esistono nel catalogo, prima dei filtri. */
  confrontiTotali: number;
}) {
  if (righe.length === 0) {
    // «Nessun risultato» e «non c'è ancora niente da confrontare» sono due
    // situazioni diverse, e confonderle manda a cercare un filtro sbagliato
    // quando invece manca un secondo listino.
    return (
      <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-10 text-center text-sm leading-6 text-neutral-500">
        {confrontiTotali === 0 ? (
          <>
            Non c’è ancora nessun confronto possibile. Serve che <strong>due fornitori</strong>{' '}
            vendano lo stesso prodotto: carica e applica il listino di un secondo fornitore, e i
            prodotti in comune compariranno qui.
          </>
        ) : (
          <>
            Nessuno dei {confrontiTotali} confronti corrisponde ai filtri. Prova ad allargare la
            ricerca o a togliere la soglia.
          </>
        )}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Prodotto</TableHead>
          <TableHead>Conviene da</TableHead>
          <TableHead>Invece che da</TableHead>
          <TableHead className="text-right">Differenza</TableHead>
          <TableHead className="text-right">Risparmio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {righe.map((riga) => (
          <TableRow key={riga.productId}>
            <TableCell>
              <Link
                href={`/prodotti/${riga.productId}`}
                className="focus-visible:ring-brand-600 font-semibold text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {riga.productName}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <CategoryBadge categoria={riga.category} />
                <span className="text-xs text-neutral-500">
                  {riga.offersCompared} offerte a confronto
                </span>
              </div>
              {riga.excluded.length > 0 && (
                <div className="mt-1 text-xs text-neutral-400">
                  {riga.excluded.length === 1
                    ? `1 esclusa: ${riga.excluded[0]!.supplierName} — ${riga.excluded[0]!.reason}`
                    : `${riga.excluded.length} escluse dal confronto`}
                </div>
              )}
            </TableCell>
            <TableCell>
              <Offerta offerta={riga.best!} tono="buono" />
            </TableCell>
            <TableCell>
              <Offerta offerta={riga.worst!} tono="neutro" />
            </TableCell>
            <TableCell className="tabellare text-right text-sm text-neutral-700">
              {`${euro(riga.unitDifference!, 4)}${etichettaBasis(riga.best!.unitPriceBasis).slice(1)}`}
            </TableCell>
            <TableCell className="text-right">
              <span className="tabellare block font-black text-neutral-950">
                {euro(riga.savingPerPack!)}
              </span>
              <span className="tabellare block text-xs text-neutral-500">
                {`−${numero(riga.savingPct!, 1)}%`}
              </span>
              {riga.worthAlert && (
                <Badge variant="success" className="mt-1">
                  vale il cambio
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * I prodotti senza confronto, **separati**.
 *
 * Fonderli con i confronti produrrebbe un elenco in cui non si distingue una
 * scelta fatta da una scelta impossibile. E sono un'informazione utile per sé:
 * dicono dove il catalogo è ancora cieco.
 */
export function NoComparisonTable({ righe }: { righe: ComparisonRow[] }) {
  if (righe.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Prodotto</TableHead>
          <TableHead>Situazione</TableHead>
          <TableHead>Perché</TableHead>
          <TableHead className="text-right">Prezzo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {righe.map((riga) => (
          <TableRow key={riga.productId}>
            <TableCell>
              <Link
                href={`/prodotti/${riga.productId}`}
                className="focus-visible:ring-brand-600 font-semibold text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {riga.productName}
              </Link>
              <div className="mt-1">
                <CategoryBadge categoria={riga.category} />
              </div>
            </TableCell>
            <TableCell>
              {riga.state === 'OFFERTA_UNICA' && <Badge variant="neutral">un solo fornitore</Badge>}
              {riga.state === 'NON_CONFRONTABILE' && (
                <Badge variant="warning">non confrontabile</Badge>
              )}
              {riga.state === 'SENZA_PREZZO' && <Badge variant="neutral">senza prezzo</Badge>}
            </TableCell>
            <TableCell className="max-w-md text-sm text-neutral-600">{riga.reason}</TableCell>
            <TableCell className="text-right">
              {riga.best ? (
                <>
                  <span className="tabellare block text-sm font-semibold text-neutral-900">
                    {euro(riga.best.priceNet)}
                  </span>
                  <span className="block text-xs text-neutral-500">{riga.best.supplierName}</span>
                </>
              ) : (
                <span className="text-sm text-neutral-400">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
