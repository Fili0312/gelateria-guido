import Link from 'next/link';
import { PackagingGroups } from '@/components/products/packaging-groups';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { supplierProductsRepository } from '@/server/repositories/supplier-products';

export const dynamic = 'force-dynamic';

/**
 * Le confezioni che il listino dà per scontate.
 *
 * Molti fornitori scrivono «collo» e la quantità 1, perché fra loro è ovvio
 * che un collo di bibite da 20 cl sia da ventiquattro. Per noi non lo è, e
 * senza quel numero il prezzo al litro esce sbagliato di ventiquattro volte —
 * al punto che l'app preferisce non mostrarlo affatto.
 */
export default async function ConfezioniPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const gruppi = await supplierProductsRepository(user.organizationId).gruppiDaDefinire();
  const articoli = gruppi.reduce((n, g) => n + g.quante, 0);

  return (
    <div className="space-y-5">
      <header>
        <Link href="/prodotti" className="text-sm text-neutral-500 hover:underline">
          ← Catalogo
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Confezioni da definire
          </h1>
          {articoli > 0 && <Badge variant="warning">{articoli} articoli</Badge>}
        </div>
        <p className="mt-2 max-w-3xl leading-6 text-neutral-500">
          Alcuni fornitori scrivono «collo» senza dire di quanti pezzi: fra loro è ovvio che un
          collo di bibite da 20 cl sia da ventiquattro. Finché non lo sappiamo, il prezzo al litro
          di quegli articoli sarebbe calcolato come se il collo fosse una bottiglia sola — e sono
          ventiquattro volte fuori. Per questo restano fuori dai confronti.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
          Si risponde <strong className="text-neutral-800">una volta per formato</strong>, non una
          per articolo: la risposta vale per tutti quelli dello stesso fornitore con lo stesso
          imballo e la stessa misura.
        </p>
      </header>

      <PackagingGroups
        gruppi={gruppi}
        endpoint={withBasePath('/api/supplier-products/confezioni')}
      />
    </div>
  );
}
