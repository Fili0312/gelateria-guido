import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductAliases } from '@/components/products/product-aliases';
import { ProductOffers } from '@/components/products/product-offers';
import { Badge } from '@/components/ui';
import { CategoryBadge } from '@/components/taxonomy/category-badge';
import { formatoUnitario } from '@/features/products/format';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { productsRepository } from '@/server/repositories/products';

export const dynamic = 'force-dynamic';

function Riquadro({ etichetta, valore }: { etichetta: string; valore: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <dt className="text-xs text-neutral-500">{etichetta}</dt>
      <dd className="mt-1 font-semibold text-neutral-950">{valore}</dd>
    </div>
  );
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  const prodotto = await productsRepository(user.organizationId).get(id);
  if (!prodotto) notFound();

  const daDefinire = prodotto.offersCount - prodotto.comparableOffersCount;

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
            {prodotto.createdBy === 'AI' && <Badge variant="neutral">creato dall’IA</Badge>}
          </p>
        </div>
        <Link
          href={`/prodotti/${prodotto.id}/modifica`}
          className="focus-visible:ring-brand-600 inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
        >
          Modifica
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Riquadro etichetta="Offerte" valore={prodotto.offersCount} />
        <Riquadro etichetta="Confrontabili" valore={prodotto.comparableOffersCount} />
        <Riquadro
          etichetta="Confezione da definire"
          valore={
            daDefinire > 0 ? <span className="text-amber-900">{daDefinire}</span> : <span>0</span>
          }
        />
        <Riquadro etichetta="Codice a barre" valore={prodotto.gtin ?? '—'} />
      </dl>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-neutral-950">Offerte dei fornitori</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Ordinate dal prezzo per unità più basso. È il confronto che risponde alla domanda
              «dove conviene comprarlo».
            </p>
          </div>
          <Link
            href={`/prodotti/${prodotto.id}/offerte/nuova`}
            className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:outline-none"
          >
            Collega un’offerta
          </Link>
        </div>
        <ProductOffers offers={prodotto.offers} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-black text-neutral-950">Sinonimi</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Fanno trovare il prodotto anche quando è scritto in un altro modo. Dalla Fase 9 saranno
            anche la memoria degli abbinamenti già confermati.
          </p>
        </div>
        <ProductAliases
          productId={prodotto.id}
          aliases={prodotto.aliases}
          endpoint={withBasePath('/api/products')}
        />
      </section>
    </div>
  );
}
