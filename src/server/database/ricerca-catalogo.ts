import { Prisma } from '@/generated/prisma/client';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';

/**
 * La ricerca del catalogo, in SQL.
 *
 * ── Perché qui e non nel repository ─────────────────────────────────────
 * Il client scoped di `@/server/db` nasconde `$queryRaw` dai tipi, di
 * proposito: l'estensione che filtra per organizzazione non può intercettare
 * l'SQL grezzo, quindi la strada è sbarrata invece di essere lasciata aperta
 * con una raccomandazione. La somiglianza trigram però non è esprimibile con
 * l'API di Prisma, e senza indice trigram la ricerca è una scansione.
 *
 * La deroga vive quindi in un modulo solo, con un nome che la dichiara, e con
 * `organizationId` come primo parametro obbligatorio di ogni funzione. Il
 * costruttore dell'SQL è puro e testato: il test verifica che il filtro
 * sull'organizzazione ci sia sempre, cosa che una raccomandazione nel
 * commento non garantirebbe.
 *
 * ── Perché word_similarity e non similarity ─────────────────────────────
 * `similarity()` confronta due testi interi, quindi crolla quando il nome è
 * lungo: sui dati veri della gelateria, cercando «amaro», «braulio amaro
 * riserva» ottiene 0,273 — sotto la soglia di default 0,3, quindi sparirebbe
 * dai risultati. `word_similarity()` confronta il termine con la miglior
 * sequenza di parole del nome e dà 1,0 a tutti e tre gli amari. È l'operatore
 * giusto per cercare una parola dentro una descrizione.
 */

export type StrategiaRicerca = 'prefisso' | 'somiglianza';

/**
 * Sotto i tre caratteri i trigrammi non esistono e l'indice non serve a
 * nulla: si passa al prefisso, che è anche ciò che un utente si aspetta
 * digitando due lettere.
 */
export const LUNGHEZZA_MINIMA_TRIGRAM = 3;

export interface TermineRicerca {
  /** Il termine come è stato digitato, ripulito. */
  originale: string;
  /** Normalizzato con la stessa funzione con cui sono stati scritti i nomi. */
  normalizzato: string;
  strategia: StrategiaRicerca;
}

/**
 * Normalizza il termine con la STESSA funzione usata in scrittura.
 * È l'invariante su cui poggia tutta la ricerca: se le due normalizzazioni
 * divergessero, l'indice conterrebbe una cosa e la query ne cercherebbe
 * un'altra, e il guasto sarebbe invisibile — semplicemente non troverebbe.
 */
export function preparaTermine(grezzo: string): TermineRicerca {
  const originale = grezzo.trim();
  const normalizzato = normalizzaTesto(originale);
  return {
    originale,
    normalizzato,
    strategia: normalizzato.length < LUNGHEZZA_MINIMA_TRIGRAM ? 'prefisso' : 'somiglianza',
  };
}

/** Per un LIKE: le percentuali e i trattini bassi digitati non sono jolly. */
function perLike(valore: string): string {
  return valore.replace(/([%_\\])/g, '\\$1');
}

/**
 * Il peso dei riscontri che arrivano dal nome del fornitore: contano, ma meno
 * del nome canonico, che è quello che l'operatore ha scelto e corretto.
 */
const PESO_NOME_FORNITORE = 0.9;

export function costruisciSqlRicerca(
  organizationId: string,
  termine: TermineRicerca,
  limite: number,
): Prisma.Sql {
  if (!organizationId) {
    throw new Error('organizationId obbligatorio: la ricerca non può essere globale.');
  }

  const q = termine.normalizzato;
  const prefissoCodice = `${perLike(termine.originale.toLowerCase())}%`;

  const riscontri =
    termine.strategia === 'prefisso'
      ? Prisma.sql`
          SELECT p.id AS product_id, 1.0::float4 AS punteggio, 'nome' AS via
            FROM product p
           WHERE p.organization_id = ${organizationId}
             AND (p.normalized_name LIKE ${`${perLike(q)}%`} ESCAPE '\\'
                  OR p.normalized_name LIKE ${`% ${perLike(q)}%`} ESCAPE '\\')
          UNION ALL
          SELECT a.product_id, 0.9::float4, 'alias'
            FROM product_alias a
            JOIN product p ON p.id = a.product_id
           WHERE p.organization_id = ${organizationId}
             AND a.negative = false
             AND (a.normalized_text LIKE ${`${perLike(q)}%`} ESCAPE '\\'
                  OR a.normalized_text LIKE ${`% ${perLike(q)}%`} ESCAPE '\\')
        `
      : Prisma.sql`
          SELECT p.id AS product_id, word_similarity(${q}, p.normalized_name) AS punteggio, 'nome' AS via
            FROM product p
           WHERE p.organization_id = ${organizationId}
             AND ${q} <% p.normalized_name
          UNION ALL
          SELECT a.product_id, word_similarity(${q}, a.normalized_text), 'alias'
            FROM product_alias a
            JOIN product p ON p.id = a.product_id
           WHERE p.organization_id = ${organizationId}
             AND a.negative = false
             AND ${q} <% a.normalized_text
          UNION ALL
          SELECT sp.product_id,
                 word_similarity(${q}, sp.normalized_name) * ${PESO_NOME_FORNITORE}::float4,
                 'fornitore'
            FROM supplier_product sp
            JOIN product p ON p.id = sp.product_id
           WHERE p.organization_id = ${organizationId}
             AND ${q} <% sp.normalized_name
        `;

  // Il codice articolo si cerca sempre a prefisso, in entrambe le strategie:
  // un codice è corto e si digita per intero o per l'inizio, mai «più o meno».
  return Prisma.sql`
    WITH riscontri AS (
      ${riscontri}
      UNION ALL
      SELECT sp.product_id, 1.0::float4, 'codice'
        FROM supplier_product sp
        JOIN product p ON p.id = sp.product_id
       WHERE p.organization_id = ${organizationId}
         AND sp.supplier_code IS NOT NULL
         AND lower(sp.supplier_code) LIKE ${prefissoCodice} ESCAPE '\\'
    ),
    -- Il punteggio si calcola su tutti i candidati, ma il conteggio delle
    -- offerte solo sui pochi che sopravvivono al LIMIT. Farlo prima costava
    -- una sottoquery per ogni prodotto trovato: su un termine frequente come
    -- "birra", trecento conteggi invece di venti — e la ricerca passava da
    -- una decina di millisecondi a novanta.
    migliori AS (
      SELECT r.product_id,
             max(r.punteggio)::float8 AS score,
             (array_agg(r.via ORDER BY r.punteggio DESC))[1] AS via
        FROM riscontri r
       WHERE r.product_id IS NOT NULL
       GROUP BY r.product_id
       ORDER BY score DESC, r.product_id ASC
       LIMIT ${limite}
    )
    SELECT p.id,
           p.name,
           p.brand,
           p.category,
           p.unit_size::text  AS unit_size,
           p.unit_of_measure::text AS unit_of_measure,
           (SELECT count(*) FROM supplier_product s2 WHERE s2.product_id = p.id)::int AS offers_count,
           m.score,
           m.via
      FROM migliori m
      JOIN product p ON p.id = m.product_id
     ORDER BY m.score DESC, p.name ASC
  `;
}

export interface RigaRicerca {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  unit_size: string;
  unit_of_measure: string;
  offers_count: number;
  score: number;
  via: string;
}

/**
 * Esegue la ricerca.
 *
 * Il client di sistema è importato in modo pigro, dentro la funzione, e non in
 * cima al file: `system-client` fallisce all'import se manca `DATABASE_URL`, e
 * questo modulo deve restare caricabile dai test, che girano senza database e
 * senza credenziali. È l'unico punto in cui il costruttore dell'SQL incontra
 * una connessione.
 */
export async function eseguiRicerca(
  organizationId: string,
  termine: TermineRicerca,
  limite: number,
): Promise<RigaRicerca[]> {
  const sql = costruisciSqlRicerca(organizationId, termine, limite);
  const { systemPrisma } = await import('./system-client');
  return systemPrisma.$queryRaw<RigaRicerca[]>(sql);
}
