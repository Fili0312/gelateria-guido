import { EmptySection } from '@/components/empty-section';

export default function OrdersPage() {
  return (
    <EmptySection
      title="Ordini"
      description="Il carrello persistente, il confronto del miglior prezzo e la suddivisione per fornitore saranno costruiti su questo spazio."
      phase={12}
      icon="orders"
    />
  );
}
