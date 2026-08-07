import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SupplierForm } from '@/components/suppliers/supplier-form';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { getSupplierDetail } from '@/server/repositories/suppliers';

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { id } = await params;
  const supplier = await getSupplierDetail(user.organizationId, id);
  if (!supplier) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header>
        <Link
          href={`/fornitori/${supplier.id}`}
          className="text-brand-700 text-sm font-bold hover:underline"
        >
          ← Torna alla scheda
        </Link>
        <div className="mt-4">
          <Badge variant={supplier.active ? 'success' : 'neutral'} dot>
            {supplier.active ? 'Fornitore attivo' : 'Fornitore inattivo'}
          </Badge>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Modifica {supplier.name}
          </h1>
          <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
            Aggiorna contatti e condizioni senza alterare prodotti, listini o storico.
          </p>
        </div>
      </header>

      <SupplierForm
        mode="edit"
        endpoint={withBasePath(`/api/suppliers/${supplier.id}`)}
        cancelHref={`/fornitori/${supplier.id}`}
        initialSupplier={supplier}
      />
    </div>
  );
}
