import { Prisma } from '@/generated/prisma/client';
import type { CodaQuery } from '@/features/matching/schema';
import type { RigaCodaGrezza } from '@/server/domain/matching/queue';

export interface ConteggiCodaAbbinamento {
  automatici: number;
  daRivedere: number;
  nuovi: number;
  totale: number;
  totaleFiltrato: number;
}

export interface PaginazioneCoda {
  paginaCorrente: number;
  pagine: number;
  limite: number;
  offset: number;
  haPrecedente: boolean;
  haSuccessiva: boolean;
}

function verificaOrganizzazione(organizationId: string): void {
  if (!organizationId) {
    throw new Error('organizationId obbligatorio: la coda non può essere globale.');
  }
}

function filtroListino(priceListId: string): Prisma.Sql {
  return priceListId ? Prisma.sql`AND pl.id = ${priceListId}` : Prisma.empty;
}

function filtroStato(query: CodaQuery): Prisma.Sql {
  if (query.stato === 'tutti') return Prisma.empty;
  const soloSenzaProdotto =
    query.stato === 'NEW' ? Prisma.sql`AND r.product_id IS NULL` : Prisma.empty;
  return Prisma.sql`AND r.match_status::text = ${query.stato} ${soloSenzaProdotto}`;
}

/** Deve restare equivalente ai guard puri usati da `applicaImport`. */
function rigaBloccaApplicazioneSql(): Prisma.Sql {
  return Prisma.sql`(
    r.extracted->>'tipo' = 'prodotto'
    AND (
      r.match_status::text = 'PENDING'
      OR coalesce(jsonb_typeof(r.extracted->'campi'), '') <> 'object'
      OR r.extracted->'campi'->>'importabile' = 'false'
      OR jsonb_path_exists(
           coalesce(r.validation_errors, '[]'::jsonb),
           '$[*] ? (@.gravita == "errore")'
         )
    )
  )`;
}

/** Query aggregata: conta tutto ma non porta in memoria alcuna riga del PDF. */
export function costruisciSqlConteggiCoda(organizationId: string, query: CodaQuery): Prisma.Sql {
  verificaOrganizzazione(organizationId);
  const filtroPrezzo = filtroListino(query.priceListId);
  const filtroSelezionato = filtroStato(query);
  const bloccante = rigaBloccaApplicazioneSql();
  return Prisma.sql`
    SELECT count(*) FILTER (WHERE r.match_status::text = 'AUTO')::int AS automatici,
           count(*) FILTER (WHERE r.match_status::text = 'PENDING')::int AS "daRivedere",
           count(*) FILTER (
             WHERE r.match_status::text = 'NEW' AND r.product_id IS NULL
           )::int AS nuovi,
           count(*)::int AS totale,
           count(*) FILTER (WHERE true ${filtroSelezionato})::int AS "totaleFiltrato"
      FROM price_list_row r
      JOIN price_list pl ON pl.id = r.price_list_id
     WHERE pl.organization_id = ${organizationId}
       AND r.excluded = false
       AND (r.reviewed_at IS NULL OR ${bloccante})
       ${filtroPrezzo}
  `;
}

/** Query dati: LIMIT e OFFSET sono sempre parametri e sempre finiti. */
export function costruisciSqlRigheCoda(
  organizationId: string,
  query: CodaQuery,
  offset: number,
): Prisma.Sql {
  verificaOrganizzazione(organizationId);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Offset coda non valido.');
  if (!Number.isSafeInteger(query.limite) || query.limite < 1 || query.limite > 200) {
    throw new Error('Limite coda non valido.');
  }

  const filtroPrezzo = filtroListino(query.priceListId);
  const filtroSelezionato = filtroStato(query);
  const bloccante = rigaBloccaApplicazioneSql();
  return Prisma.sql`
    SELECT r.id,
           r.price_list_id AS "priceListId",
           pl.scope_label AS listino,
           s.name AS fornitore,
           r.page_number AS "pageNumber",
           r.raw_text AS "rawText",
           r.extracted,
           r.validation_errors AS "validationErrors",
           r.match_status::text AS "matchStatus",
           r.product_id AS "productId",
           p.name AS "productName",
           r.reviewed_at AS "reviewedAt",
           ${bloccante} AS "bloccaImport"
      FROM price_list_row r
      JOIN price_list pl ON pl.id = r.price_list_id
      JOIN supplier s
        ON s.id = pl.supplier_id
       AND s.organization_id = pl.organization_id
 LEFT JOIN product p
        ON p.id = r.product_id
       AND p.organization_id = pl.organization_id
     WHERE pl.organization_id = ${organizationId}
       AND r.excluded = false
       AND (r.reviewed_at IS NULL OR ${bloccante})
       ${filtroPrezzo}
       ${filtroSelezionato}
     ORDER BY pl.uploaded_at DESC,
              pl.id DESC,
              r.page_number ASC,
              r.line_number ASC,
              r.id ASC
     LIMIT ${query.limite}
    OFFSET ${offset}
  `;
}

export function calcolaPaginazione(
  totale: number,
  paginaRichiesta: number,
  limite: number,
): PaginazioneCoda {
  if (!Number.isSafeInteger(totale) || totale < 0) throw new Error('Totale coda non valido.');
  if (!Number.isSafeInteger(paginaRichiesta) || paginaRichiesta < 1) {
    throw new Error('Pagina coda non valida.');
  }
  if (!Number.isSafeInteger(limite) || limite < 1 || limite > 200) {
    throw new Error('Limite coda non valido.');
  }

  const pagine = Math.max(1, Math.ceil(totale / limite));
  const paginaCorrente = Math.min(paginaRichiesta, pagine);
  return {
    paginaCorrente,
    pagine,
    limite,
    offset: (paginaCorrente - 1) * limite,
    haPrecedente: paginaCorrente > 1,
    haSuccessiva: paginaCorrente < pagine,
  };
}

/** Il client di sistema resta confinato in questo modulo DB e viene caricato pigramente. */
export async function contaCodaAbbinamento(
  organizationId: string,
  query: CodaQuery,
): Promise<ConteggiCodaAbbinamento> {
  const { systemPrisma } = await import('./system-client');
  const [conteggi] = await systemPrisma.$queryRaw<ConteggiCodaAbbinamento[]>(
    costruisciSqlConteggiCoda(organizationId, query),
  );
  return conteggi ?? { automatici: 0, daRivedere: 0, nuovi: 0, totale: 0, totaleFiltrato: 0 };
}

export async function caricaPaginaCodaAbbinamento(
  organizationId: string,
  query: CodaQuery,
  offset: number,
): Promise<RigaCodaGrezza[]> {
  const { systemPrisma } = await import('./system-client');
  return systemPrisma.$queryRaw<RigaCodaGrezza[]>(
    costruisciSqlRigheCoda(organizationId, query, offset),
  );
}
