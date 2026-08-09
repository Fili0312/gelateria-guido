import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductPriceHistory } from '@/components/prices/product-price-history';
import { ProductAliases } from '@/components/products/product-aliases';
import { ProductOffers } from '@/components/products/product-offers';
import { Badge } from '@/components/ui';
import { CategoryBadge } from '@/components/taxonomy/category-badge';
import { formatoUnitario } from '@/features/products/format';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { pricesRepository } from '@/server/repositories/prices';
import { comparisonRepository } from '@/server/repositories/comparison';
import { productsRepository } from '@/server/repositories/products';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  const prodotto = await productsRepository(user.organizationId).get(id);
  if (!prodotto) notFound();
  const storiciPrezzo = await pricesRepository(user.organizationId).forProduct(id);
  // Il confronto arriva dal dominio, come per l'elenco «Convenienti»: due
  // calcoli separati potrebbero indicare due «più conveniente» diversi.
  const confronto = (await comparisonRepository(user.organizationId).perProdotto(id))!;

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <Link href="/prodotti" className="text-sm text-neutral-500 hover:underline">
            ← Catalogo
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            {prodotto.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
            <span>{formatoUnitario(prodotto.unitSize, prodotto.unitOfMeasure)}</span>
            {prodotto.brand && <span>· {prodotto.brand}</span>}
            <CategoryBadge categoria={prodotto.category} />
            {prodotto.gtin && <span className="tabellare text-xs">EAN {prodotto.gtin}</span>}
            {prodotto.createdBy === 'AI' && <Badge variant="neutral">creato dall’IA</Badge>}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/prodotti/${prodotto.id}/offerte/nuova`}
            className="focus-visible:ring-brand-600 inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
          >
            Collega un’offerta
          </Link>
          <Link
            href={`/prodotti/${prodotto.id}/modifica`}
            className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            Modifica
          </Link>
        </div>
      </header>

      <ProductOffers offers={prodotto.offers} confronto={confronto} />

      <section id="storico-prezzi" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-black text-neutral-950">Storico prezzi</h2>
        <ProductPriceHistory
          histories={storiciPrezzo}
          endpoint={withBasePath('/api/supplier-products')}
        />
      </section>

      {/* I sinonimi servono di rado e occupavano un terzo della pagina:
          ripiegati restano a portata senza stare in mezzo. */}
      <details className="group rounded-2xl border border-neutral-200 bg-white">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-neutral-800">
          <span>
            Sinonimi{' '}
            <span className="font-normal text-neutral-500">
              ({prodotto.aliases.length}) — fanno trovare il prodotto anche scritto in un altro modo
            </span>
          </span>
          <span aria-hidden className="text-neutral-400 group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="border-t border-neutral-100 p-4">
        <ProductAliases
          productId={prodotto.id}
          aliases={prodotto.aliases}
          endpoint={withBasePath('/api/products')}
        />
        </div>
      </details>
    </div>
  );
}
