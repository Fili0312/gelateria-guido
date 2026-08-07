import Link from 'next/link';
import { AppIcon } from '@/components/app-icon';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import type { SupplierListItem } from '@/features/suppliers/dto';
import { formatDecimalIt, formatEuro, supplierInitials } from '@/features/suppliers/format';

function ContactLine({ supplier }: { supplier: SupplierListItem }) {
  const contact = supplier.contactName ?? supplier.email ?? supplier.phone;
  return <span className="text-xs text-neutral-500">{contact ?? 'Contatto non indicato'}</span>;
}

function EmptySuppliers({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
      <span className="bg-brand-50 text-brand-700 mx-auto grid h-12 w-12 place-items-center rounded-2xl">
        <AppIcon name="suppliers" className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-black text-neutral-950">
        {hasFilters ? 'Nessun fornitore corrisponde ai filtri' : 'Aggiungi il primo fornitore'}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-500">
        {hasFilters
          ? 'Prova a cambiare ricerca o stato per vedere più risultati.'
          : 'L’anagrafica raccoglie fin da subito contatti, IVA e impostazioni per gli ordini.'}
      </p>
      <Link
        href={hasFilters ? '/fornitori' : '/fornitori/nuovo'}
        className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 mt-5 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {hasFilters ? 'Azzera i filtri' : 'Nuovo fornitore'}
      </Link>
    </div>
  );
}

export function SupplierList({
  items,
  hasFilters,
}: {
  items: SupplierListItem[];
  hasFilters: boolean;
}) {
  if (items.length === 0) return <EmptySuppliers hasFilters={hasFilters} />;

  return (
    <>
      <ul className="space-y-3 md:hidden" aria-label="Elenco fornitori">
        {items.map((supplier) => (
          <li key={supplier.id}>
            <Link
              href={`/fornitori/${supplier.id}`}
              className="focus-visible:ring-brand-600 block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none"
            >
              <div className="flex items-start gap-3">
                <span className="bg-brand-50 text-brand-700 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-black">
                  {supplierInitials(supplier.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-black text-neutral-950">{supplier.name}</h2>
                    <Badge variant={supplier.active ? 'success' : 'neutral'} size="sm" dot>
                      {supplier.active ? 'Attivo' : 'Inattivo'}
                    </Badge>
                  </div>
                  <ContactLine supplier={supplier} />
                </div>
                <AppIcon name="arrow-right" className="mt-2 h-4 w-4 shrink-0 text-neutral-400" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3 text-xs">
                <div>
                  <dt className="text-neutral-500">Condizioni</dt>
                  <dd className="mt-0.5 font-bold text-neutral-800">
                    IVA {supplier.pricesIncludeVat ? 'inclusa' : 'esclusa'} ·{' '}
                    {formatDecimalIt(supplier.defaultVatRate, '%')}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Dati collegati</dt>
                  <dd className="mt-0.5 font-bold text-neutral-800">
                    {supplier.counts.supplierProducts} prodotti · {supplier.counts.priceLists}{' '}
                    listini
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table scrollLabel="Elenco dei fornitori">
          <TableHeader>
            <TableRow>
              <TableHead>Fornitore</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Condizioni</TableHead>
              <TableHead>Consegna</TableHead>
              <TableHead numeric>Prodotti</TableHead>
              <TableHead numeric>Listini</TableHead>
              <TableHead className="w-20">
                <span className="sr-only">Azioni</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && <TableEmpty colSpan={7} />}
            {items.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell>
                  <Link
                    href={`/fornitori/${supplier.id}`}
                    className="focus-visible:ring-brand-600 rounded font-bold text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {supplier.name}
                  </Link>
                  <span className="mt-0.5 block">
                    <ContactLine supplier={supplier} />
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={supplier.active ? 'success' : 'neutral'} dot>
                    {supplier.active ? 'Attivo' : 'Inattivo'}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="block font-semibold text-neutral-800">
                    IVA {supplier.pricesIncludeVat ? 'inclusa' : 'esclusa'}
                  </span>
                  <span className="text-xs text-neutral-500">
                    Aliquota {formatDecimalIt(supplier.defaultVatRate, '%')} ·{' '}
                    {formatEuro(supplier.minOrderValue)}
                  </span>
                </TableCell>
                <TableCell>{supplier.deliveryDays ?? 'Non indicata'}</TableCell>
                <TableCell numeric>{supplier.counts.supplierProducts}</TableCell>
                <TableCell numeric>{supplier.counts.priceLists}</TableCell>
                <TableCell>
                  <Link
                    href={`/fornitori/${supplier.id}`}
                    className="text-brand-700 hover:text-brand-900 focus-visible:ring-brand-600 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Apri
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
