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
import type { ComparedOffer, ComparisonRow } from '@/features/reports/dto';
import { etichettaBasis, euro, numero } from '@/features/products/format';
import { ColloBadge } from '@/components/products/collo-badge';

/**
 * La tabella che risponde a «dove conviene comprarlo».
 *
 * Ogni riga mette la migliore accanto alla più cara, perché il risparmio è
 * una **differenza**: mostrarlo da solo lo renderebbe un numero da credere
 * sulla parola, mentre così si vede da cosa nasce e si può ricontrollare.
 */

function Offerta({ offerta, tono }: { offerta: ComparedOffer; tono: 'buono' | 'neutro' }) {
  const buono = tono === 'buono';
  return (
    <div
      className={`min-w-52 rounded-lg border px-3 py-2 ${
        buono ? 'border-emerald-200 bg-emerald-50/60' : 'border-neutral-200 bg-neutral-50/60'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`text-sm font-bold ${buono ? 'text-emerald-900' : 'text-neutral-700'}`}>
          {offerta.supplierName}
        </span>
        {offerta.supplierCode && (
          <span className="tabellare text-[11px] text-neutral-400">
            cod. {offerta.supplierCode}
          </span>
        )}
        {offerta.stale && (
          <Badge
            variant="warning"
            title={`Il prezzo non si aggiorna dal ${new Date(offerta.validFrom).toLocaleDateString('it-IT')}`}
          >
            prezzo fermo
          </Badge>
        )}
      </div>

      {/* Come lo chiama **questo** fornitore. È la riga che permette di
          accorgersi che l'abbinamento è sbagliato: due descrizioni affiancate
          si controllano a colpo d'occhio, e un confronto fra due articoli
          diversi è peggio di nessun confronto — fa cambiare fornitore per
          risparmiare su una cosa che non si sta comprando. */}
      <p className="mt-1 text-xs leading-4 text-neutral-600" title={offerta.rawName}>
        {offerta.rawName}
      </p>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="tabellare text-sm font-bold text-neutral-950">
          {euro(offerta.priceNet)}
        </span>
        {/* Con lo sconto extra il numero che conta è il secondo: il primo è
            quello che si paga, il secondo quanto costa davvero. Mostrarne uno
            solo farebbe scegliere sul dato sbagliato in un verso o nell'altro. */}
        {Number(offerta.extraDiscountPct) > 0 && (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800">
            {euro(offerta.priceEffective)} con −{numero(offerta.extraDiscountPct, 2)}%
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <ColloBadge confezione={offerta} />
        {/* Il prezzo per litro resta **qui**: è il numero su cui il confronto
            si regge, ed è l'unico posto in cui serve davvero. */}
        <span className="tabellare text-[11px] text-neutral-500">
          {`${euro(offerta.unitPrice, 4)}${etichettaBasis(offerta.unitPriceBasis).slice(1)}`}
        </span>
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
          <TableHead>Conviene da — controlla che sia lo stesso articolo</TableHead>
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
              <div className="mt-1 text-xs text-neutral-500">
                {riga.offersCompared} offerte a confronto
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
