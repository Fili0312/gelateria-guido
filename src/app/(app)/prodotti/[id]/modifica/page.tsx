import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductForm } from '@/components/products/product-form';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { productsRepository } from '@/server/repositories/products';
import { suppliersRepository } from '@/server/repositories/suppliers';
import { taxonomyRepository } from '@/server/repositories/taxonomy';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  const prodotto = await productsRepository(user.organizationId).get(id);
  if (!prodotto) notFound();

  const fornitori = await suppliersRepository(user.organizationId).list({
    q: '',
    status: 'active',
    sort: 'name-asc',
  });
  const { departments } = await taxonomyRepository(user.organizationId).tree({
    // La categoria corrente può essere stata disattivata dopo la creazione
    // del prodotto. Va mostrata (ma non resa nuovamente selezionabile),
    // altrimenti il controllo appare vuoto pur conservando un id nascosto.
    includiInattivi: true,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Badge variant="brand" dot>
          Catalogo
        </Badge>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950">
          Modifica prodotto
        </h1>
        <p className="mt-2 text-sm text-neutral-500">{prodotto.name}</p>
      </header>

      <ProductForm
        mode="edit"
        endpoint={withBasePath(`/api/products/${prodotto.id}`)}
        reparti={departments}
        fornitori={fornitori.items.map((f) => ({ id: f.id, name: f.name }))}
        endpointOfferte={withBasePath('/api/supplier-products')}
        endpointPrezzi={withBasePath('/api/supplier-products/{id}/prices')}
        iniziale={{
          name: prodotto.name,
          brand: prodotto.brand,
          categoryId: prodotto.category?.id ?? null,
          unitSize: prodotto.unitSize,
          unitOfMeasure: prodotto.unitOfMeasure,
          gtin: prodotto.gtin,
        }}
      />

      <Link
        href={`/prodotti/${prodotto.id}`}
        className="inline-block text-sm text-neutral-500 hover:underline"
      >
        ← Torna alla scheda
      </Link>
    </div>
  );
}
