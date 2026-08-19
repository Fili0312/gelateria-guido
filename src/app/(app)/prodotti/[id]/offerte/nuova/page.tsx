import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OfferAttach } from '@/components/products/offer-attach';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { productsRepository } from '@/server/repositories/products';
import { suppliersRepository } from '@/server/repositories/suppliers';
import { supplierProductsRepository } from '@/server/repositories/supplier-products';

export const dynamic = 'force-dynamic';

export default async function AttachOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  const [prodotto, orfane, fornitori] = await Promise.all([
    productsRepository(user.organizationId).get(id),
    supplierProductsRepository(user.organizationId).list({
      q: '',
      supplierId: '',
      status: 'orphan',
    }),
    suppliersRepository(user.organizationId).list({ q: '', status: 'active', sort: 'name-asc' }),
  ]);
  if (!prodotto) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link
          href={`/prodotti/${prodotto.id}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← {prodotto.name}
        </Link>
        <Badge variant="brand" dot className="mt-3 block w-fit">
          Catalogo
        </Badge>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-neutral-950">
          Collega un’offerta
        </h1>
      </header>

      <OfferAttach
        productId={prodotto.id}
        productName={prodotto.name}
        orfane={orfane.items}
        fornitori={fornitori.items.map((f) => ({ id: f.id, name: f.name }))}
        endpointOfferte={withBasePath('/api/supplier-products')}
      />
    </div>
  );
}
