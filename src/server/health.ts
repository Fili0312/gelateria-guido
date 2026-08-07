import { systemPrisma } from '@/server/database/system-client';

/**
 * Stato del sistema.
 *
 * Serve a tre cose: la pagina di stato, l'endpoint `/api/health` e la verifica
 * automatica dentro `deploy.sh`. Un deploy che non sa dire se il database
 * risponde non è un deploy, è una speranza.
 */

export interface StatoSistema {
  ok: boolean;
  database: {
    ok: boolean;
    versione?: string;
    latenzaMs?: number;
    estensioni: string[];
    estensioniMancanti: string[];
    errore?: string;
  };
  migrazioniApplicate: number | null;
}

/** Estensioni senza le quali l'app non può funzionare (vedi migrazione 0). */
const ESTENSIONI_RICHIESTE = ['pg_trgm', 'unaccent', 'pgcrypto', 'btree_gin'] as const;

export async function leggiStato(): Promise<StatoSistema> {
  const inizio = Date.now();

  try {
    const [versione] = await systemPrisma.$queryRaw<{ versione: string }[]>`
      SELECT current_setting('server_version') AS versione
    `;
    const estensioni = await systemPrisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension ORDER BY extname
    `;
    const latenzaMs = Date.now() - inizio;

    const presenti = estensioni.map((e) => e.extname);
    const mancanti = ESTENSIONI_RICHIESTE.filter((e) => !presenti.includes(e));

    // Il conteggio delle migrazioni può fallire prima della prima migrazione:
    // non è una condizione di errore, è "non ancora migrato".
    let migrazioniApplicate: number | null = null;
    try {
      const [conteggio] = await systemPrisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL
      `;
      migrazioniApplicate = conteggio ? Number(conteggio.n) : 0;
    } catch {
      migrazioniApplicate = null;
    }

    return {
      ok: mancanti.length === 0,
      database: {
        ok: true,
        versione: versione?.versione,
        latenzaMs,
        estensioni: presenti,
        estensioniMancanti: mancanti,
      },
      migrazioniApplicate,
    };
  } catch (errore) {
    return {
      ok: false,
      database: {
        ok: false,
        estensioni: [],
        estensioniMancanti: [...ESTENSIONI_RICHIESTE],
        errore: errore instanceof Error ? errore.message : String(errore),
      },
      migrazioniApplicate: null,
    };
  }
}
