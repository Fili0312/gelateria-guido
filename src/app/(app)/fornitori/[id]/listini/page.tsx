import { SupplierDetailShell } from '@/components/suppliers/supplier-detail-shell';
import { withBasePath } from '@/server/base-path';
import { FutureSupplierSection, loadSupplier } from '../supplier-page';

export default async function SupplierPriceListsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplier = await loadSupplier(id);

  return (
    <SupplierDetailShell
      supplier={supplier}
      activeTab="listini"
      endpoint={withBasePath(`/api/suppliers/${supplier.id}`)}
    >
      <FutureSupplierSection
        title="Listini del fornitore"
        description="Qui compariranno i PDF caricati, la copertura, lo stato dell’import e le date di validità."
        phase={7}
        icon="lists"
        linkedLabel={`${supplier.counts.priceLists} listini attualmente collegati`}
      />
    </SupplierDetailShell>
  );
}
