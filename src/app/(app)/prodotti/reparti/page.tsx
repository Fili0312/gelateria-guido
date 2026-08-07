import Link from 'next/link';
import { TaxonomyManager } from '@/components/taxonomy/taxonomy-manager';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { taxonomyRepository } from '@/server/repositories/taxonomy';

export const dynamic = 'force-dynamic';

export default async function TaxonomyPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Qui si vede anche cio' che e' disattivato: e' la pagina in cui lo si
  // riattiva, e nasconderlo renderebbe l'operazione impossibile.
  const tassonomia = await taxonomyRepository(user.organizationId).tree({ includiInattivi: true });

  return (
    <div className="max-w-4xl space-y-7">
      <header>
        <Badge variant="brand" dot>
          Catalogo
        </Badge>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          Reparti e categorie
        </h1>
        <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
          Due livelli: il <strong>reparto</strong> è il giro che si fa quando si ordina — bar,
          gelateria, cucina — e la <strong>categoria</strong> è lo scaffale dentro quel giro.
          Servono a raggruppare l’ordine e a filtrare il catalogo, non a cambiare i prezzi.
        </p>
      </header>

      <TaxonomyManager
        iniziale={tassonomia}
        endpointReparti={withBasePath('/api/taxonomy/departments')}
        endpointCategorie={withBasePath('/api/taxonomy/categories')}
      />

      <Link href="/prodotti" className="inline-block text-sm text-neutral-500 hover:underline">
        ← Torna al catalogo
      </Link>
    </div>
  );
}
