import 'server-only';

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { withBasePath } from '@/server/base-path';
import { percorsoAssoluto } from '@/server/import/storage';

/**
 * Le foto sul nostro disco.
 *
 * ── Perché non si linka la fonte ────────────────────────────────────────
 * Tre ragioni, in ordine di durezza:
 *
 *  1. **La CSP non lo consente.** `img-src 'self' data: blob:`: un `<img>`
 *     verso images.openfoodfacts.org viene bloccato dal browser, e la
 *     pagina mostrerebbe riquadri rotti senza un errore visibile lato
 *     server. Allargare la CSP per delle foto sarebbe il baratto sbagliato.
 *  2. **Sarebbe una richiesta a loro per ogni prodotto e per ogni
 *     apertura.** Quattrocento prodotti aperti tre volte al giorno sono
 *     migliaia di richieste quotidiane a un servizio gratuito, per foto che
 *     non cambiano mai.
 *  3. Un indirizzo esterno può sparire, e con lui la foto.
 *
 * Il nome sul disco è lo **sha256 del contenuto**, come per i PDF dei
 * listini: due prodotti che condividono la stessa foto occupano un posto
 * solo, e nessun nome che arriva da fuori tocca il filesystem.
 */

const TIPI: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function estensioneDi(tipoMime: string): string | null {
  return TIPI[tipoMime.split(';')[0]!.trim().toLowerCase()] ?? null;
}

/** Il tipo MIME da restituire, dedotto dal nome che abbiamo scritto noi. */
export function tipoDi(percorso: string): string {
  if (percorso.endsWith('.png')) return 'image/png';
  if (percorso.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Il percorso relativo di una foto.
 *
 * `immagini/ab/<sha>.jpg`: la sottocartella dai primi due caratteri tiene
 * la cartella ispezionabile a mano anche con qualche migliaio di file.
 */
export function percorsoImmagine(sha: string, estensione: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('Hash dell’immagine non valido.');
  if (!/^[a-z]{3,4}$/.test(estensione)) throw new Error('Estensione dell’immagine non valida.');
  return join('immagini', sha.slice(0, 2), `${sha}.${estensione}`);
}

/** Scrive la foto e restituisce il percorso relativo da mettere a database. */
export async function salvaImmagine(dati: Uint8Array, tipoMime: string): Promise<string | null> {
  const estensione = estensioneDi(tipoMime);
  if (!estensione) return null;

  const sha = createHash('sha256').update(dati).digest('hex');
  const relativo = percorsoImmagine(sha, estensione);
  const assoluto = percorsoAssoluto(relativo);
  await mkdir(dirname(assoluto), { recursive: true });
  // Senza `wx`: stesso contenuto, stesso nome. Riscriverlo è innocuo e
  // costa meno che verificare prima se c'è.
  await writeFile(assoluto, dati);
  return relativo;
}

/** Rilegge una foto salvata. `null` se il file non c'è più. */
export async function leggiImmagine(relativo: string): Promise<Buffer | null> {
  // Solo percorsi che abbiamo scritto noi: la stringa arriva dal database,
  // che è esattamente il caso in cui fra sei mesi nessuno ricorda più da
  // dove venga.
  if (!/^immagini\/[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z]{3,4}$/.test(relativo)) return null;
  try {
    return await readFile(percorsoAssoluto(relativo));
  } catch {
    return null;
  }
}

/**
 * L'indirizzo a cui il browser chiede la foto di un prodotto.
 *
 * Definito qui e non sparso nelle pagine: passa da `withBasePath` perché
 * l'app vive sotto `/gelateria`, e un indirizzo assoluto scritto a mano
 * altrove darebbe una figura rotta solo in produzione.
 */
export function urlImmagine(productId: string): string {
  return withBasePath(`/api/immagini/${encodeURIComponent(productId)}`);
}
