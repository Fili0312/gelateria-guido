import Link from 'next/link';
import { ProductForm } from '@/components/products/product-form';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { suppliersRepository } from '@/server/repositories/suppliers';
import { taxonomyRepository } from '@/server/repositories/taxonomy';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const fornitori = await suppliersRepository(user.organizationId).list({
    q: '',
    status: 'active',
    sort: 'name-asc',
  });
  const { departments } = await taxonomyRepository(user.organizationId).tree({
    includiInattivi: false,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Badge variant="brand" dot>
          Catalogo
        </Badge>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950">
          Nuovo prodotto
        </h1>
        <p className="mt-2 leading-6 text-neutral-500">
          Il prodotto canonico non ha una confezione: quella appartiene alle offerte dei fornitori.
          È proprio questo che permette di confrontare un collo da 12 con uno da 24.
        </p>
      </header>

      <ProductForm
        mode="create"
        endpoint={withBasePath('/api/products')}
        reparti={departments}
        fornitori={fornitori.items.map((f) => ({ id: f.id, name: f.name }))}
        endpointOfferte={withBasePath('/api/supplier-products')}
        endpointPrezzi={withBasePath('/api/supplier-products/{id}/prices')}
      />

      <Link href="/prodotti" className="inline-block text-sm text-neutral-500 hover:underline">
        ← Torna al catalogo
      </Link>
    </div>
  );
}
