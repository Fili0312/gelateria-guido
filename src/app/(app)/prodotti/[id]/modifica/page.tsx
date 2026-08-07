import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductForm } from '@/components/products/product-form';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { productsRepository } from '@/server/repositories/products';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  const prodotto = await productsRepository(user.organizationId).get(id);
  if (!prodotto) notFound();

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
        iniziale={{
          name: prodotto.name,
          brand: prodotto.brand,
          category: prodotto.category,
          unitSize: prodotto.unitSize,
          unitOfMeasure: prodotto.unitOfMeasure,
          gtin: prodotto.gtin,
        }}
      />

      <Link href={`/prodotti/${prodotto.id}`} className="inline-block text-sm text-neutral-500 hover:underline">
        ← Torna alla scheda
      </Link>
    </div>
  );
}
