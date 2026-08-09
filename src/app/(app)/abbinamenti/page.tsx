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
        <p className="mt-2 max-w-3xl leading-6 text-neutral-500">
          Ogni fornitore chiama le cose a modo suo. Qui si decide{' '}
          <strong>quali righe di un listino sono lo stesso articolo</strong> di un prodotto già a
          catalogo — ed è l’unico modo perché due prezzi si possano confrontare.
        </p>

        <div className="mt-4 grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-neutral-900">Perché serve</p>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              «BOLS PEACH 17% CL.70» di Cecconi e «bols PEACH LIQUEUR 0.700» di Barzelli sono la
              stessa bottiglia. Finché restano due prodotti separati, nessuno può dirti quale
              costa meno.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-900">Cosa succede se premi</p>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              <strong>È questo</strong> collega la riga a quel prodotto. Le due offerte restano
              separate, ognuna col suo codice e il suo prezzo: si affiancano, non si fondono.{' '}
              <strong>È un prodotto nuovo</strong> gli dà un prodotto suo.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-900">Ogni conferma insegna</p>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              La descrizione confermata diventa un sinonimo: al listino successivo quella scritta
              si abbina da sola, senza punteggi e senza modelli. Il catalogo non tocca niente
              finché non applichi l’import.
            </p>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-3">
        <Riquadro etichetta="Aspettano una tua decisione" valore={coda.daRivedere} />
        <Riquadro etichetta="Abbinate da sole" valore={coda.automatici} />
        <Riquadro etichetta="Diventeranno prodotti nuovi" valore={coda.nuovi} />
      </dl>

      <MatchingQueue iniziale={coda} endpoint={withBasePath('/api/matching')} />

      <Link href="/listini" className="inline-block text-sm text-neutral-500 hover:underline">
        ← Listini
      </Link>
    </div>
  );
}
