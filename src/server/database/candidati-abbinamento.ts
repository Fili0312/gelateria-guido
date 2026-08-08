import { Prisma } from '@/generated/prisma/client';

/**
 * I candidati all'abbinamento, in SQL.
 *
 * Seconda e ultima deroga dichiarata al divieto di SQL grezzo, per lo stesso
 * motivo della prima (`ricerca-catalogo.ts`): la somiglianza trigram non è
 * esprimibile con l'API di Prisma, e senza indice trigram diventa una
 * scansione dell'intero catalogo per ogni riga importata — su un listino da
 * 189 righe, 189 scansioni.
 *
 * Stesse regole della prima: `organizationId` primo parametro obbligatorio,
 * costruttore puro, test che verificano il filtro in ogni ramo.
 *
 * ── Perché il filtro sul formato NON è qui ──────────────────────────────
 * `product.unit_size` è espresso nell'unità in cui il prodotto è scritto —
 * 33 con `unit_of_measure = CL`, oppure 0,33 con `L` — e riportarlo all'unità
 * base in SQL vorrebbe dire duplicare la tabella di conversione del dominio
 * dentro una query. Due copie della stessa tabella divergono.
 *
 * Qui si filtra quindi solo per **unità base compatibile**, che è un
 * confronto fra enum e non richiede conversioni; la dimensione esatta la
 * verifica `formatiCompatibili` in TypeScript, sui pochi candidati rimasti.
 */

export interface CandidatoGrezzo {
  id: string;
  name: string;
  normalized_name: string;
  unit_size: string;
  unit_of_measure: string;
  base_unit: string;
  trigram: number;
  /** Da dove è arrivato: serve a spiegare la proposta in revisione. */
  via: string;
}

/** Sotto questa somiglianza non si propone nemmeno: si crea un prodotto nuovo. */
export const SOMIGLIANZA_MINIMA = 0.65;

export function costruisciSqlCandidati(
  organizationId: string,
  nucleo: string,
  baseUnit: string,
  limite: number,
  somiglianzaMinima: number = SOMIGLIANZA_MINIMA,
): Prisma.Sql {
  if (!organizationId) {
    throw new Error('organizationId obbligatorio: i candidati non possono essere globali.');
  }
  if (!nucleo.trim()) {
    throw new Error('Nucleo vuoto: non si cercano candidati per una descrizione vuota.');
  }

  return Prisma.sql`
    WITH riscontri AS (
      -- Per nome: è la via normale.
      SELECT p.id, word_similarity(${nucleo}, p.normalized_name)::float8 AS trigram, 'nome' AS via
        FROM product p
       WHERE p.organization_id = ${organizationId}
         AND p.base_unit::text = ${baseUnit}
         AND ${nucleo} <% p.normalized_name
      UNION ALL
      -- Per sinonimo confermato: qui finisce ogni abbinamento che una persona
      -- ha già approvato in passato, ed è il motivo per cui il secondo import
      -- dello stesso fornitore non chiede più niente.
      SELECT a.product_id, word_similarity(${nucleo}, a.normalized_text)::float8, 'alias'
        FROM product_alias a
        JOIN product p ON p.id = a.product_id
       WHERE p.organization_id = ${organizationId}
         AND p.base_unit::text = ${baseUnit}
         AND a.negative = false
         AND ${nucleo} <% a.normalized_text
    ),
    migliori AS (
      SELECT r.id,
             max(r.trigram) AS trigram,
             (array_agg(r.via ORDER BY r.trigram DESC))[1] AS via
        FROM riscontri r
       WHERE r.id IS NOT NULL
       GROUP BY r.id
      HAVING max(r.trigram) >= ${somiglianzaMinima}
       ORDER BY trigram DESC, r.id ASC
       LIMIT ${limite}
    )
    SELECT p.id,
           p.name,
           p.normalized_name,
           p.unit_size::text AS unit_size,
           p.unit_of_measure::text AS unit_of_measure,
           p.base_unit::text AS base_unit,
           m.trigram,
           m.via
      FROM migliori m
      JOIN product p ON p.id = m.id
     ORDER BY m.trigram DESC, p.name ASC
  `;
}

/**
 * I sinonimi **negativi** di un prodotto: «questi due non sono la stessa cosa».
 *
 * Registrano un errore che una persona ha già corretto una volta. Senza,
 * l'abbinamento sbagliato verrebbe riproposto a ogni import, e verrebbe
 * rifiutato ogni volta dalla stessa persona.
 */
export function costruisciSqlEsclusi(organizationId: string, nucleo: string): Prisma.Sql {
  if (!organizationId) throw new Error('organizationId obbligatorio.');
  return Prisma.sql`
    SELECT a.product_id AS id
      FROM product_alias a
      JOIN product p ON p.id = a.product_id
     WHERE p.organization_id = ${organizationId}
       AND a.negative = true
       AND a.normalized_text = ${nucleo}
  `;
}

/**
 * Esegue la ricerca dei candidati.
 *
 * Il client di sistema è importato in modo pigro, come in `ricerca-catalogo`:
 * questo modulo deve restare caricabile dai test, che girano senza database.
 */
export async function cercaCandidati(
  organizationId: string,
  nucleo: string,
  baseUnit: string,
  limite: number,
): Promise<CandidatoGrezzo[]> {
  const { systemPrisma } = await import('./system-client');
  return systemPrisma.$queryRaw<CandidatoGrezzo[]>(
    costruisciSqlCandidati(organizationId, nucleo, baseUnit, limite),
  );
}

export async function prodottiEsclusi(
  organizationId: string,
  nucleo: string,
): Promise<Set<string>> {
  const { systemPrisma } = await import('./system-client');
  const righe = await systemPrisma.$queryRaw<{ id: string }[]>(
    costruisciSqlEsclusi(organizationId, nucleo),
  );
  return new Set(righe.map((r) => r.id));
}
