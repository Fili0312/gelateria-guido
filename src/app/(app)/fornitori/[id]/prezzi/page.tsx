import Link from 'next/link';
import { SupplierDetailShell } from '@/components/suppliers/supplier-detail-shell';
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
import { euro, prezzoUnitario } from '@/features/products/format';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { supplierProductsRepository } from '@/server/repositories/supplier-products';
import { loadSupplier } from '../supplier-page';

export default async function SupplierPricesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await loadSupplier(id);
  const user = await getCurrentUser();
  if (!user) return null;

  const offers = await supplierProductsRepository(user.organizationId).list({
    q: '',
    supplierId: supplier.id,
    status: 'all',
  });
  const withPrice = offers.items.filter((offer) => offer.price).length;

  return (
    <SupplierDetailShell
      supplier={supplier}
      activeTab="prezzi"
      endpoint={withBasePath(`/api/suppliers/${supplier.id}`)}
    >
      <section className="space-y-4">
        <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <Badge variant="success" dot>
            Storico operativo
          </Badge>
          <h2 className="mt-3 text-xl font-extrabold tracking-tight text-neutral-950">
            Prezzi di {supplier.name}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
            {withPrice} delle {offers.items.length} offerte hanno un prezzo corrente. Apri il
            prodotto collegato per vedere il grafico completo, tutte le variazioni o registrare una
            correzione manuale.
          </p>
        </header>

        <Table scrollLabel={`Prezzi correnti di ${supplier.name}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Prodotto / offerta</TableHead>
              <TableHead numeric>Listino</TableHead>
              <TableHead numeric>Netto</TableHead>
              <TableHead numeric>Per unità</TableHead>
              <TableHead>Storico</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.items.length === 0 ? (
              <TableEmpty colSpan={5}>Questo fornitore non ha ancora offerte.</TableEmpty>
            ) : (
              offers.items.map((offer) => (
                <TableRow key={offer.id}>
                  <TableCell>
                    <span className="block font-semibold text-neutral-950">
                      {offer.productName ?? offer.rawName}
                    </span>
                    {offer.productName && (
                      <span className="block max-w-sm truncate text-xs text-neutral-500">
                        {offer.rawName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell numeric>{offer.price ? euro(offer.price.priceList) : '—'}</TableCell>
                  <TableCell numeric className="font-semibold text-neutral-950">
                    {offer.price ? euro(offer.price.priceNet) : '—'}
                  </TableCell>
                  <TableCell numeric>{prezzoUnitario(offer)}</TableCell>
                  <TableCell>
                    {offer.productId ? (
                      <Link
                        href={`/prodotti/${offer.productId}#storico-prezzi-${offer.id}`}
                        className="text-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 items-center rounded-lg text-sm font-bold hover:underline focus-visible:ring-2 focus-visible:outline-none"
                      >
                        Apri storico
                      </Link>
                    ) : (
                      <Badge variant="warning">da collegare</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </SupplierDetailShell>
  );
}
