import { getCurrentUser } from '@/server/auth';
import { leggiImmagine, tipoDi } from '@/server/catalog/immagini/archivio';
import { prismaForOrganization } from '@/server/db';

export const dynamic = 'force-dynamic';

type Contesto = { params: Promise<{ productId: string }> };

/**
 * La foto di un prodotto.
 *
 * ── Perché passa da qui e non da `public/` ──────────────────────────────
 * Le foto stanno nello storage, fuori dalla cartella servita staticamente,
 * e si raggiungono **per id di prodotto**: chi non è dentro l'organizzazione
 * non vede né la foto né l'esistenza del prodotto. Servire la cartella così
 * com'è renderebbe il catalogo sfogliabile da chiunque conosca un hash.
 *
 * ── La cache ────────────────────────────────────────────────────────────
 * `immutable` con un anno di validità: il nome del file **è** l'impronta del
 * contenuto, quindi una foto diversa è un file diverso. La conseguenza che
 * conta è che scorrendo il catalogo avanti e indietro il browser non richiede
 * niente. `private` perché la risposta dipende da chi sei, e una cache
 * condivisa non deve tenerne copia.
 */
export async function GET(_richiesta: Request, { params }: Contesto) {
  const user = await getCurrentUser();
  if (!user) return new Response('Autenticazione richiesta.', { status: 401 });

  const { productId } = await params;
  const prodotto = await prismaForOrganization(user.organizationId).product.findFirst({
    where: { id: productId },
    select: { imagePath: true },
  });
  if (!prodotto?.imagePath) return new Response('Nessuna foto.', { status: 404 });

  const dati = await leggiImmagine(prodotto.imagePath);
  // Il file può mancare pur essendo a database: uno storage ripristinato da
  // un backup più vecchio, o una pulizia a mano. Un 404 lascia comparire il
  // segnaposto della card, che è esattamente il comportamento voluto.
  if (!dati) return new Response('Foto non disponibile.', { status: 404 });

  return new Response(new Uint8Array(dati), {
    headers: {
      'Content-Type': tipoDi(prodotto.imagePath),
      'Content-Length': String(dati.byteLength),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
