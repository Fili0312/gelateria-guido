import { SupplierDetailShell } from '@/components/suppliers/supplier-detail-shell';
import { withBasePath } from '@/server/base-path';
import { FutureSupplierSection, loadSupplier } from '../supplier-page';

export default async function SupplierPricesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await loadSupplier(id);

  return (
    <SupplierDetailShell
      supplier={supplier}
      activeTab="prezzi"
      endpoint={withBasePath(`/api/suppliers/${supplier.id}`)}
    >
      <FutureSupplierSection
        title="Storico prezzi"
        description="La Fase 6 mostrerà prezzi correnti, variazioni e serie storiche senza sovrascrivere i valori precedenti."
        phase={6}
        icon="sparkles"
      />
    </SupplierDetailShell>
  );
}
