import 'server-only';

import { chiediAlModello, leggiRisposta, type ProviderAi } from '@/server/ai';
import {
  rispostaMarcaSchema,
  SISTEMA_MARCA,
  utenteMarca,
  VERSIONE_PROMPT,
} from '@/server/ai/prompts';
import { prismaForOrganization } from '@/server/db';

/**
 * Chiedere al modello **chi produce** ogni prodotto.
 *
 * ── Perché questo passo esiste ──────────────────────────────────────────
 * Senza la marca, cercare una foto è indovinare. Con la marca si può
 * *pretendere* che la scheda trovata sia dello stesso produttore, ed è
 * quella pretesa — non la soglia — a impedire che l'alchermes di Baldoni
 * prenda la foto dell'alchermes di un altro.
 *
 * ── Perché tocca al modello e non a una regola ──────────────────────────
 * È lo stesso confine della classificazione in `classify.ts`: la regola sa
 * togliere il rumore, non sa riconoscere il mondo. Che «Absolut» sia una
 * distilleria e «acqua» no non è deducibile dal testo. La prima parola non
 * funziona («ACQUA PANNA» darebbe «acqua»), e una lista di marche scritta a
 * mano sarebbe un'enciclopedia da tenere aggiornata per sempre.
 *
 * La marca finisce in `Product.brand`, che esisteva già ed era vuota su
 * tutti e cinquecento i prodotti: non è una colonna nuova, è una colonna
 * finalmente compilata. Si vede anche in scheda prodotto, gratis.
 */

const LOTTO = 15;
const TETTO_TOKEN = 4_000;

export interface EsitoMarche {
  esaminati: number;
  conMarca: number;
  senzaMarca: number;
  chiamate: number;
}

export interface OpzioniMarche {
  massimo?: number;
  /** Ripassa anche i prodotti che hanno già una marca. */
  rifai?: boolean;
  provider?: ProviderAi;
}

export async function estraiMarche(
  organizationId: string,
  opzioni: OpzioniMarche = {},
): Promise<EsitoMarche> {
  const db = prismaForOrganization(organizationId);

  const daFare = await db.product.findMany({
    where: opzioni.rifai ? {} : { brand: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: opzioni.massimo ?? 1000,
  });

  const esito: EsitoMarche = {
    esaminati: daFare.length,
    conMarca: 0,
    senzaMarca: 0,
    chiamate: 0,
  };
  if (daFare.length === 0) return esito;

  /**
   * Un lotto, con dimezzamento in caso di fallimento — come la
   * classificazione, e per la stessa ragione: un lotto che non torna non è
   * un guasto, è una richiesta troppo grossa per il ragionamento che *quei*
   * nomi hanno richiesto. Rincorrere il numero giusto è una lotta che si
   * perde; dimezzare no.
   */
  async function faiLotto(lotto: { id: string; name: string }[]): Promise<void> {
    if (lotto.length === 0) return;

    try {
      const chiamata = await chiediAlModello(
        {
          sistema: SISTEMA_MARCA,
          utente: utenteMarca(lotto.map((p, indice) => ({ indice, descrizione: p.name }))),
          versionePrompt: VERSIONE_PROMPT,
          massimoToken: TETTO_TOKEN,
        },
        { organizationId, scopo: 'CLASSIFY' },
        opzioni.provider,
      );
      esito.chiamate += 1;

      const risposta = leggiRisposta(chiamata.testo, rispostaMarcaSchema);
      for (const r of risposta.esiti) {
        const prodotto = lotto[r.indice];
        if (!prodotto) continue;
        const marca = r.marca?.trim();
        if (!marca) {
          esito.senzaMarca += 1;
          continue;
        }
        // Una «marca» che è tutta la descrizione non è una marca: è il
        // modello che ha rinunciato copiando l'ingresso. Accettarla
        // renderebbe l'identità sempre soddisfatta, cioè inutile.
        if (marca.length > 40 || marca.length < 2) {
          esito.senzaMarca += 1;
          continue;
        }
        await db.product.update({ where: { id: prodotto.id }, data: { brand: marca } });
        esito.conMarca += 1;
      }
    } catch (errore) {
      if ((errore as Error).name === 'AiBudgetError') throw errore;
      if (lotto.length === 1) {
        esito.chiamate += 1;
        return;
      }
      const meta = Math.ceil(lotto.length / 2);
      await faiLotto(lotto.slice(0, meta));
      await faiLotto(lotto.slice(meta));
    }
  }

  for (let i = 0; i < daFare.length; i += LOTTO) {
    await faiLotto(daFare.slice(i, i + LOTTO));
  }

  return esito;
}
