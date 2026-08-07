import { SupplierDetailShell } from '@/components/suppliers/supplier-detail-shell';
import { withBasePath } from '@/server/base-path';
import { FutureSupplierSection, loadSupplier } from '../supplier-page';

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
      <FutureSupplierSection
        title="Prodotti del fornitore"
        description="La Fase 5 renderà gestibili offerte, confezioni, codici articolo e collegamenti al catalogo normalizzato."
        phase={5}
        icon="products"
        linkedLabel={`${supplier.counts.supplierProducts} prodotti attualmente collegati`}
      />
    </SupplierDetailShell>
  );
}
