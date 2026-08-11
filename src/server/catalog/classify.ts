import 'server-only';

import { z } from 'zod';
import { chiediAlModello, leggiRisposta, type ProviderAi } from '@/server/ai';
import { SISTEMA_CLASSIFICA, utenteClassifica, VERSIONE_PROMPT } from '@/server/ai/prompts';
import { prismaForOrganization } from '@/server/db';
import { categoriaSuggerita } from '@/server/domain/catalog/categorie';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';

/**
 * Dare una categoria ai prodotti, in due passi disuguali.
 *
 * **Prima la regola.** `categoriaSuggerita` guarda le parole della
 * descrizione: «AMARO CALAMARO 34%» contiene «amaro». Sul catalogo vero
 * decide poco più della metà, costa zero e non sbaglia mai in modo
 * sorprendente — se sbaglia, si vede quale parola l'ha tratta in inganno.
 *
 * **Poi il modello, solo su quello che resta.** Quello che alla regola
 * sfugge non è ambiguo: è ciò che richiede di sapere *cosa sono le cose*.
 * Che Averna è un amaro, che la Coca Cola è una bibita, che «S.BENED. ACQ.
 * TOWER» è acqua. Nessuna lista di parole ci arriva, e allungarla all'infinito
 * significherebbe riscrivere un'enciclopedia dentro un array.
 *
 * L'ordine non è un'ottimizzazione di spesa: è che **ciò che si può
 * dimostrare non si chiede a un modello**. Il risparmio — metà delle
 * chiamate in meno — viene dietro, gratis.
 */

const rispostaSchema = z.object({
  esiti: z.array(
    z.object({
      indice: z.number().int().min(0),
      categoria: z.string().nullable(),
    }),
  ),
});

/**
 * Quanti prodotti per chiamata, e quanto spazio lasciare alla risposta.
 *
 * Numeri **misurati**, non stimati, perché sbagliarli non dà un errore
 * comprensibile. Il modello configurato ragiona prima di rispondere, e il
 * ragionamento consuma dallo stesso tetto della risposta: con venticinque
 * prodotti e un tetto di 2500 la risposta è tornata **completamente vuota**,
 * avendo speso tutti e 2500 i token a pensare. L'errore che ne usciva —
 * «la risposta non contiene JSON» — non diceva niente di tutto questo.
 *
 * Misure vere su questo catalogo:
 *
 *   5 prodotti  →   348 token in uscita
 *  10 prodotti  → 1.323 token in uscita  (~132 a prodotto, ragionamento incluso)
 *  25 prodotti  → oltre 2.500: vuota
 *
 * Ma la lunghezza del ragionamento **varia col prodotto**: lo stesso lotto da
 * dodici a volte passa e a volte no. Rincorrere il numero magico è una lotta
 * che si perde, quindi il lotto che fallisce si **dimezza e si riprova**, fino
 * al singolo prodotto. È l'unica strategia che non dipende dall'aver indovinato.
 */
const LOTTO = 12;
const TETTO_TOKEN = 4_000;

export interface EsitoClassificazione {
  esaminati: number;
  classificati: number;
  /** Quanti ha deciso la regola, senza spendere niente. */
  dallaRegola: number;
  /** Quanti ha deciso il modello. */
  dalModello: number;
  /** Restano senza categoria: né la regola né il modello se la sono sentita. */
  indecisi: number;
  chiamate: number;
  /**
   * `true` quando non c'è nessuna categoria in cui mettere i prodotti.
   *
   * Non è un errore ed è una situazione normale su un'organizzazione nuova,
   * ma va detta: senza categorie la regola non può agganciare niente e al
   * modello si chiederebbe di scegliere da un elenco vuoto — trecento
   * chiamate pagate per farsi rispondere «non so».
   */
  senzaCategorie: boolean;
}

export interface OpzioniClassificazione {
  /** `false` ferma tutto alla regola: nessuna chiamata, nessuna spesa. */
  usaModello: boolean;
  /** Quanti prodotti al massimo toccare in un giro. */
  massimo?: number;
  provider?: ProviderAi;
}

export async function classificaProdotti(
  organizationId: string,
  opzioni: OpzioniClassificazione,
): Promise<EsitoClassificazione> {
  const db = prismaForOrganization(organizationId);

  // L'elenco chiuso da cui si sceglie. Lasciar inventare la categoria
  // produrrebbe trenta nomi diversi per la stessa cosa, ed è esattamente la
  // ragione per cui la tassonomia esiste.
  const categorie = await db.category.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  /**
   * L'indice passa dalla stessa normalizzazione dei nomi prodotto, non da un
   * semplice `toLowerCase`: così «Amari e liquori», «AMARI E LIQUORI» e
   * «Amari e Liquori » sono lo stesso nome. La regola propone un nome
   * scritto in un modo solo, e una differenza di maiuscole nella tassonomia
   * la faceva mancare in silenzio — con l'effetto che il prodotto finiva al
   * modello, che costa, per una cosa che la regola sapeva già.
   */
  const perNome = new Map(categorie.map((c) => [normalizzaTesto(c.name), c.id] as const));

  const daFare = await db.product.findMany({
    where: { categoryId: null },
    select: {
      id: true,
      name: true,
      supplierProducts: { select: { category: true, rawName: true }, take: 3 },
    },
    take: opzioni.massimo ?? 500,
    orderBy: { name: 'asc' },
  });

  const esito: EsitoClassificazione = {
    esaminati: daFare.length,
    classificati: 0,
    dallaRegola: 0,
    dalModello: 0,
    indecisi: 0,
    chiamate: 0,
    senzaCategorie: categorie.length === 0,
  };
  if (daFare.length === 0) return esito;

  // Senza categorie non si classifica: **le categorie le decide chi usa
  // l'app**, non il programma. Un'app che se le inventa produce trenta nomi
  // diversi per la stessa cosa, ed è esattamente ciò che la tassonomia
  // esiste per impedire. Qui ci si ferma e lo si dice, invece di chiamare il
  // modello trecento volte per farsi rispondere «non so».
  if (categorie.length === 0) {
    esito.indecisi = daFare.length;
    return esito;
  }

  const restano: { id: string; descrizione: string }[] = [];

  // ── Passo 1: la regola ──────────────────────────────────────────────
  for (const prodotto of daFare) {
    // Si prova prima con la categoria scritta dal fornitore, che quando c'è è
    // un'informazione di prima mano, poi col nome del prodotto.
    const testoFornitore = prodotto.supplierProducts.find((o) => o.category)?.category ?? null;
    const nome = categoriaSuggerita(testoFornitore) ?? categoriaSuggerita(prodotto.name);
    const categoryId = nome ? perNome.get(normalizzaTesto(nome)) : undefined;

    if (categoryId) {
      await db.product.update({ where: { id: prodotto.id }, data: { categoryId } });
      esito.dallaRegola += 1;
      esito.classificati += 1;
    } else {
      restano.push({ id: prodotto.id, descrizione: prodotto.name });
    }
  }

  if (!opzioni.usaModello || restano.length === 0) {
    esito.indecisi = restano.length;
    return esito;
  }

  // ── Passo 2: il modello, su ciò che resta ───────────────────────────
  const ammesse = categorie.map((c) => c.name);

  /**
   * Un lotto, con dimezzamento in caso di fallimento.
   *
   * Un lotto che non torna non è un guasto: è una richiesta troppo grossa per
   * il ragionamento che quel particolare insieme di nomi ha richiesto. Si
   * riprova con metà, e con metà di metà. Un singolo prodotto che continua a
   * fallire si lascia da classificare — è il peggio accettabile, e non ferma
   * gli altri centocinquanta.
   */
  async function faiLotto(lotto: { id: string; descrizione: string }[]): Promise<void> {
    if (lotto.length === 0) return;

    try {
      const chiamata = await chiediAlModello(
        {
          sistema: SISTEMA_CLASSIFICA,
          utente: utenteClassifica(
            lotto.map((p, indice) => ({ indice, descrizione: p.descrizione })),
            ammesse,
          ),
          versionePrompt: VERSIONE_PROMPT,
          massimoToken: TETTO_TOKEN,
        },
        { organizationId, scopo: 'CLASSIFY' },
        opzioni.provider,
      );
      esito.chiamate += 1;

      const risposta = leggiRisposta(chiamata.testo, rispostaSchema);
      for (const r of risposta.esiti) {
        const prodotto = lotto[r.indice];
        // Un indice fuori elenco o una categoria inventata si scartano in
        // silenzio: il prodotto resta da classificare, che è il peggio
        // accettabile. Fidarsi produrrebbe una categoria plausibile e falsa.
        if (!prodotto || !r.categoria) continue;
        const categoryId = perNome.get(r.categoria.trim().toLowerCase());
        if (!categoryId) continue;

        await db.product.update({ where: { id: prodotto.id }, data: { categoryId } });
        esito.dalModello += 1;
        esito.classificati += 1;
      }
    } catch (errore) {
      // Il tetto di spesa è un'altra cosa: quello ferma tutto, e deve.
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

  for (let i = 0; i < restano.length; i += LOTTO) {
    await faiLotto(restano.slice(i, i + LOTTO));
  }

  esito.indecisi = esito.esaminati - esito.classificati;
  return esito;
}
