import Link from 'next/link';
import { MatchingQueue } from '@/components/matching/queue';
import { Badge } from '@/components/ui';
import { codaQuerySchema } from '@/features/matching/schema';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { matchingRepository } from '@/server/repositories/matching';

export const dynamic = 'force-dynamic';

function Riquadro({ etichetta, valore }: { etichetta: string; valore: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <dt className="text-xs text-neutral-500">{etichetta}</dt>
      <dd className="tabellare mt-1 text-2xl font-black text-neutral-950">{valore}</dd>
    </div>
  );
}

export default async function AbbinamentiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const grezzi = await searchParams;
  const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const analizzato = codaQuerySchema.safeParse({
    priceListId: primo(grezzi.priceListId),
    stato: primo(grezzi.stato),
  });
  const query = analizzato.success ? analizzato.data : codaQuerySchema.parse({});
  const coda = await matchingRepository(user.organizationId).coda(query);

  return (
    <div className="space-y-7">
      <header>
        <Badge variant="brand" dot>
          Importazione
        </Badge>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          Da abbinare
        </h1>
        <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
          Le righe su cui l’app non se l’è sentita di decidere da sola. Ogni conferma{' '}
          <strong>insegna</strong>: al listino successivo quella descrizione si abbina da sé, senza
          punteggi e senza modelli.
        </p>
      </header>

      <dl className="grid grid-cols-3 gap-3">
        <Riquadro etichetta="Da decidere" valore={coda.daRivedere} />
        <Riquadro etichetta="Abbinate da sole" valore={coda.automatici} />
        <Riquadro etichetta="Prodotti nuovi" valore={coda.nuovi} />
      </dl>

      <MatchingQueue iniziale={coda} endpoint={withBasePath('/api/matching')} />

      <Link href="/listini" className="inline-block text-sm text-neutral-500 hover:underline">
        ← Listini
      </Link>
    </div>
  );
}
