import 'server-only';

import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { chiediAlModello, leggiRisposta, type ProviderAi } from '@/server/ai';
import { SISTEMA_DOPPIONI, utenteDoppioni, VERSIONE_PROMPT } from '@/server/ai/prompts';
import { prismaForOrganization } from '@/server/db';
import { unisciProdotti } from './merge';
import {
  formatiCompatibili,
  nucleoPerAbbinamento,
  sovrapposizioneParole,
} from '@/server/domain/matching/score';
import { inUnitaBase, type BaseUnit, type UnitOfMeasure } from '@/server/domain/packaging/units';

/**
 * Trovare lo stesso articolo venduto da due fornitori.
 *
 * L'abbinamento della Fase 9 lavora **al momento dell'import**, riga per riga
 * contro il catalogo di allora. Questo lavora dopo, sul catalogo intero, e
 * cerca una cosa diversa: due prodotti già creati che sono la stessa
 * bottiglia scritta in due modi. «HAVANA CLUB 3 A. RHUM 1/1» di Barzelli e
 * «HAVANA CLUB 3Y RON 40% LT.1» di Cecconi.
 *
 * ── Il formato resta un cancello, e il modello non lo può aprire ────────
 * I candidati si trovano **prima** con la regola deterministica: stessa unità
 * base e stessa dimensione entro l'uno per cento. Al modello si chiede solo
 * di giudicare i nomi, che è l'unica cosa che una regola non sa fare. Se il
 * modello dicesse che un 33 cl e un 66 cl sono lo stesso prodotto, non
 * verrebbe creduto: quella coppia non gli è nemmeno stata mostrata.
 *
 * ── I pezzi per confezione NON devono coincidere ────────────────────────
 * È il punto che sembra sbagliato e non lo è. Un collo da 24 e uno da 12
 * della stessa acqua sono **lo stesso prodotto** in due confezioni: pretendere
 * che i pezzi coincidano farebbe perdere proprio gli abbinamenti che servono.
 * La differenza di confezione non si perde — si sposta dove va guardata, cioè
 * nel prezzo per litro, che è già calcolato e già confrontato. Dodici euro per
 * venti pezzi contro cinque per tre: il primo conviene, e il confronto lo dice
 * da solo senza bisogno che i due colli siano uguali.
 */

const rispostaSchema = z.object({
  coppie: z.array(
    z.object({
      indice: z.number().int().min(0),
      stesso: z.boolean(),
      sicuro: z.boolean().default(true),
      motivo: z.string().max(200).optional(),
    }),
  ),
});

/** Quante coppie per chiamata. Il ragionamento consuma, vedi `classify.ts`. */
const LOTTO = 10;
const TETTO_TOKEN = 4_000;

/** Sotto questa somiglianza di parole non si disturba nemmeno il modello. */
const SOGLIA_MINIMA = 0.25;
/** Quante coppie candidate al massimo: oltre, è un catalogo da rivedere a mano. */
const MASSIME_COPPIE = 120;

export interface OffertaDelDoppione {
  supplierName: string;
  supplierCode: string | null;
  priceNet: string | null;
  unitPrice: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
}

export interface Doppione {
  aId: string;
  aNome: string;
  aFormato: string;
  aOfferte: OffertaDelDoppione[];
  bId: string;
  bNome: string;
  bFormato: string;
  bOfferte: OffertaDelDoppione[];
  /** Somiglianza fra i nuclei, 0..1: spiega l'ordine, non decide. */
  somiglianza: number;
  motivo: string | null;
  /**
   * `false` quando il modello li ha riconosciuti ma con riserva. Non è un
   * difetto: è la risposta giusta quando una sigla potrebbe essere una
   * variante, e serve a mandare la coppia da una persona invece che nel
   * mucchio delle certe.
   */
  sicuro: boolean;
  /**
   * Quanto si risparmierebbe a confezione unendoli, se i prezzi per unità si
   * possono confrontare. È il numero che rende evidente perché conviene.
   */
  risparmioPerConfezione: string | null;
}

export interface EsitoDoppioni {
  prodottiEsaminati: number;
  coppieCandidate: number;
  coppieConfermate: number;
  chiamate: number;
  /** Coppie riconosciute con sicurezza. */
  doppioni: Doppione[];
  /** Coppie riconosciute con riserva: le decide una persona. */
  daDecidere: Doppione[];
  /** Quante coppie sono state collegate davvero, quando lo si è chiesto. */
  collegati: number;
}

type ProdottoRecord = {
  id: string;
  name: string;
  normalizedName: string;
  unitSize: { toString(): string };
  unitOfMeasure: string;
  baseUnit: string;
  supplierProducts: {
    supplierId: string;
    supplierCode: string | null;
    packQuantity: number;
    packQuantityConfirmed: boolean;
    supplier: { name: string };
    currentPrice: { priceNet: { toString(): string }; unitPrice: { toString(): string } } | null;
  }[];
};

function formatoLeggibile(p: ProdottoRecord): string {
  return `${p.unitSize.toString()} ${p.unitOfMeasure}`;
}

function offerteDi(p: ProdottoRecord): OffertaDelDoppione[] {
  return p.supplierProducts.map((o) => ({
    supplierName: o.supplier.name,
    supplierCode: o.supplierCode,
    priceNet: o.currentPrice?.priceNet.toString() ?? null,
    unitPrice: o.currentPrice?.unitPrice.toString() ?? null,
    packQuantity: o.packQuantity,
    packQuantityConfirmed: o.packQuantityConfirmed,
  }));
}

/** Il migliore prezzo per unità fra le offerte di un prodotto, se calcolabile. */
function unitarioMigliore(p: ProdottoRecord): Decimal | null {
  const validi = p.supplierProducts
    .filter((o) => o.currentPrice && o.packQuantityConfirmed)
    .map((o) => new Decimal(o.currentPrice!.unitPrice.toString()));
  return validi.length > 0 ? Decimal.min(...validi) : null;
}

export async function cercaDoppioni(
  organizationId: string,
  opzioni: {
    usaModello: boolean;
    /**
     * Collega subito le coppie di cui il modello è **sicuro**.
     *
     * Le incerte non si toccano mai in automatico: «non ne sono sicuro» è una
     * risposta, e trattarla come un sì la butterebbe via.
     */
    collegaSicuri?: boolean;
    provider?: ProviderAi;
  } = { usaModello: true },
): Promise<EsitoDoppioni> {
  const db = prismaForOrganization(organizationId);

  const prodotti = (await db.product.findMany({
    select: {
      id: true,
      name: true,
      normalizedName: true,
      unitSize: true,
      unitOfMeasure: true,
      baseUnit: true,
      supplierProducts: {
        where: { active: true },
        select: {
          supplierId: true,
          supplierCode: true,
          packQuantity: true,
          packQuantityConfirmed: true,
          supplier: { select: { name: true } },
          currentPrice: { select: { priceNet: true, unitPrice: true } },
        },
      },
    },
  })) as unknown as ProdottoRecord[];

  // ── Passo 1: le coppie possibili, per regola ────────────────────────
  //
  // Solo fra prodotti che **non condividono già un fornitore**: due prodotti
  // dello stesso fornitore sono due articoli suoi, non un doppione — se lui li
  // tiene distinti a listino, un motivo ce l'ha.
  const candidate: { a: ProdottoRecord; b: ProdottoRecord; somiglianza: number }[] = [];

  for (let i = 0; i < prodotti.length; i++) {
    for (let j = i + 1; j < prodotti.length; j++) {
      const a = prodotti[i]!;
      const b = prodotti[j]!;
      // Servono offerte **con un prezzo** da entrambe le parti: collegare due
      // prodotti di cui uno non ha prezzo non fa nascere nessun confronto, e
      // riempirebbe l'elenco di coppie che non servono a niente.
      if (!a.supplierProducts.some((o) => o.currentPrice)) continue;
      if (!b.supplierProducts.some((o) => o.currentPrice)) continue;

      const fornitoriA = new Set(a.supplierProducts.map((o) => o.supplierId));
      if (b.supplierProducts.some((o) => fornitoriA.has(o.supplierId))) continue;

      const formato = formatiCompatibili(
        {
          unitSize: new Decimal(a.unitSize.toString()),
          unitOfMeasure: a.unitOfMeasure as UnitOfMeasure,
          baseUnit: a.baseUnit as BaseUnit,
        },
        {
          unitSize: new Decimal(b.unitSize.toString()),
          unitOfMeasure: b.unitOfMeasure as UnitOfMeasure,
          baseUnit: b.baseUnit as BaseUnit,
        },
      );
      if (!formato.compatibile) continue;

      const somiglianza = sovrapposizioneParole(
        nucleoPerAbbinamento(a.normalizedName),
        nucleoPerAbbinamento(b.normalizedName),
      );
      if (somiglianza < SOGLIA_MINIMA) continue;

      candidate.push({ a, b, somiglianza });
    }
  }

  candidate.sort((x, y) => y.somiglianza - x.somiglianza);
  const coppie = candidate.slice(0, MASSIME_COPPIE);

  const esito: EsitoDoppioni = {
    prodottiEsaminati: prodotti.length,
    coppieCandidate: coppie.length,
    coppieConfermate: 0,
    chiamate: 0,
    doppioni: [],
    daDecidere: [],
    collegati: 0,
  };
  if (coppie.length === 0) return esito;

  const componi = (
    c: (typeof coppie)[number],
    motivo: string | null,
    sicuro: boolean,
  ): Doppione => {
    const ua = unitarioMigliore(c.a);
    const ub = unitarioMigliore(c.b);
    let risparmio: string | null = null;
    if (ua && ub && Decimal.max(ua, ub).gt(0)) {
      // Il risparmio si esprime su **un pezzo**, e il prezzo unitario è per
      // unità BASE: il formato va quindi convertito in litri o chili prima di
      // moltiplicare. Usare `unitSize` così com'è dava «69 € di differenza» su
      // una bottiglia di brandy da 70 cl — cento volte il vero, perché 70 è
      // in centilitri e il prezzo è al litro.
      const contenuto = inUnitaBase(
        new Decimal(c.a.unitSize.toString()),
        c.a.unitOfMeasure as UnitOfMeasure,
      );
      risparmio = Decimal.max(ua, ub)
        .minus(Decimal.min(ua, ub))
        .mul(contenuto.gt(0) ? contenuto : new Decimal(1))
        .toDecimalPlaces(2)
        .toString();
    }
    return {
      aId: c.a.id,
      aNome: c.a.name,
      aFormato: formatoLeggibile(c.a),
      aOfferte: offerteDi(c.a),
      bId: c.b.id,
      bNome: c.b.name,
      bFormato: formatoLeggibile(c.b),
      bOfferte: offerteDi(c.b),
      somiglianza: Number(c.somiglianza.toFixed(3)),
      motivo,
      sicuro,
      risparmioPerConfezione: risparmio,
    };
  };

  if (!opzioni.usaModello) {
    // Senza modello nessuna coppia è «certa»: la regola ha verificato il
    // formato, non ha letto i nomi. Vanno tutte decise a mano.
    esito.daDecidere = coppie.map((c) => componi(c, null, false));
    return esito;
  }

  // ── Passo 2: il modello giudica i nomi ──────────────────────────────
  async function faiLotto(lotto: typeof coppie): Promise<void> {
    if (lotto.length === 0) return;
    try {
      const chiamata = await chiediAlModello(
        {
          sistema: SISTEMA_DOPPIONI,
          utente: utenteDoppioni(
            lotto.map((c, indice) => ({
              indice,
              a: `${c.a.name} (${formatoLeggibile(c.a)})`,
              b: `${c.b.name} (${formatoLeggibile(c.b)})`,
            })),
          ),
          versionePrompt: VERSIONE_PROMPT,
          massimoToken: TETTO_TOKEN,
        },
        { organizationId, scopo: 'MATCH_PRODUCT' },
        opzioni.provider,
      );
      esito.chiamate += 1;

      const risposta = leggiRisposta(chiamata.testo, rispostaSchema);
      for (const r of risposta.coppie) {
        const coppia = lotto[r.indice];
        if (!coppia || !r.stesso) continue;
        const doppione = componi(coppia, r.motivo ?? null, r.sicuro);
        if (r.sicuro) esito.doppioni.push(doppione);
        else esito.daDecidere.push(doppione);
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

  for (let i = 0; i < coppie.length; i += LOTTO) {
    await faiLotto(coppie.slice(i, i + LOTTO));
  }

  // Dai più convenienti da unire: il risparmio è la ragione per cui si unisce.
  const perRisparmio = (x: Doppione, y: Doppione) =>
    Number(y.risparmioPerConfezione ?? 0) - Number(x.risparmioPerConfezione ?? 0);
  esito.doppioni.sort(perRisparmio);
  esito.daDecidere.sort(perRisparmio);
  esito.coppieConfermate = esito.doppioni.length;

  if (opzioni.collegaSicuri && esito.doppioni.length > 0) {
    esito.collegati = await collegaTutti(organizationId, esito.doppioni);
  }

  return esito;
}

/**
 * Collega in fila le coppie sicure.
 *
 * Il punto delicato è la **catena**: se A e B si collegano e poi arriva la
 * coppia B–C, B non esiste più. Si tiene quindi una mappa di chi è finito
 * dentro chi, e si rilegge l'id prima di ogni collegamento. Senza, la seconda
 * coppia fallirebbe con «uno dei due prodotti non esiste» e il collegamento
 * andrebbe perso proprio dove ce n'erano tre uguali.
 */
async function collegaTutti(organizationId: string, coppie: readonly Doppione[]): Promise<number> {
  const finitoDentro = new Map<string, string>();
  const risolvi = (id: string): string => {
    let corrente = id;
    // Le catene sono cortissime, ma un ciclo va comunque impedito.
    for (let salti = 0; salti < 10; salti++) {
      const dopo = finitoDentro.get(corrente);
      if (!dopo) return corrente;
      corrente = dopo;
    }
    return corrente;
  };

  let collegati = 0;
  for (const coppia of coppie) {
    const a = risolvi(coppia.aId);
    const b = risolvi(coppia.bId);
    if (a === b) continue;
    try {
      const esito = await unisciProdotti(organizationId, a, b);
      const assorbito = esito.sopravvissutoId === a ? b : a;
      finitoDentro.set(assorbito, esito.sopravvissutoId);
      collegati += 1;
    } catch {
      // Una coppia che non si collega non ferma le altre: resta da fare a
      // mano, e la si ritrova al prossimo giro.
    }
  }
  return collegati;
}
