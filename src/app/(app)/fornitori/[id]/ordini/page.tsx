import { SupplierDetailShell } from '@/components/suppliers/supplier-detail-shell';
import { withBasePath } from '@/server/base-path';
import { FutureSupplierSection, loadSupplier } from '../supplier-page';

export default async function SupplierOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await loadSupplier(id);
  const linkedOrderData =
    supplier.counts.orderLines + supplier.counts.orderDocuments + supplier.counts.emailDeliveries;

  return (
    <SupplierDetailShell
      supplier={supplier}
      activeTab="ordini"
      endpoint={withBasePath(`/api/suppliers/${supplier.id}`)}
    >
      <FutureSupplierSection
        title="Ordini al fornitore"
        description="Con le Fasi 15–17 questa sezione raccoglierà storico, documenti generati ed esito degli invii."
        phase={15}
        icon="orders"
        linkedLabel={`${linkedOrderData} elementi d’ordine attualmente collegati`}
      />
    </SupplierDetailShell>
  );
}
