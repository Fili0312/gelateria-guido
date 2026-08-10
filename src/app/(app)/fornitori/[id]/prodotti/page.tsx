import Link from 'next/link';
import { AppIcon } from '@/components/app-icon';
import { SupplierDetailShell } from '@/components/suppliers/supplier-detail-shell';
import { Badge } from '@/components/ui';
import { withBasePath } from '@/server/base-path';
import { loadSupplier } from '../supplier-page';

export default async function SupplierProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplier = await loadSupplier(id);

  return (
    <SupplierDetailShell
      supplier={supplier}
      activeTab="prodotti"
      endpoint={withBasePath(`/api/suppliers/${supplier.id}`)}
    >
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <Badge variant="success" dot>
          Catalogo operativo
        </Badge>
        <h2 className="mt-3 text-xl font-black tracking-tight text-neutral-950">
          Prodotti del fornitore
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
          Le offerte, le confezioni e i collegamenti ai prodotti canonici si gestiscono dal
          catalogo. Questo fornitore ha attualmente{' '}
          <strong className="text-neutral-800">{supplier.counts.supplierProducts}</strong> offerte.
        </p>
        <Link
          href={`/prodotti?supplierId=${encodeURIComponent(supplier.id)}`}
          className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Apri il catalogo
          <AppIcon name="arrow-right" className="h-4 w-4" />
        </Link>
      </section>
    </SupplierDetailShell>
  );
}
