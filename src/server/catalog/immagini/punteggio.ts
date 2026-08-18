/**
 * Quanto una scheda trovata somiglia al prodotto che abbiamo in mano.
 *
 * ── Il criterio, prima dei numeri ───────────────────────────────────────
 * **Meglio nessuna foto che la foto sbagliata.** Un riquadro vuoto si vede
 * ed è onesto; una bottiglia sbagliata è credibile, e chi ordina va a colpo
 * d'occhio — è tutto il motivo per cui le foto sono state chieste. Una
 * Vanilia al posto di una Citron non è un difetto grafico: è una cassa
 * sbagliata che arriva lunedì.
 *
 * Per questo il punteggio è **prudente per costruzione**: parte dal nome, e
 * la marca può solo togliere. Non esiste combinazione di parole generiche
 * che superi la soglia da sola.
 */

export interface Candidato {
  /** Il nome della scheda nella fonte. */
  nome: string;
  /** Le marche dichiarate dalla fonte, separate da virgola come le manda. */
  marche: string | null;
  /** La quantità dichiarata: «75 cl», «1 L». */
  quantita: string | null;
  /** Il barcode della scheda. */
  codice: string | null;
}

export interface Riferimento {
  nome: string;
  marca: string | null;
  /** «Citron», «Zero»: cosa distingue questo prodotto dagli altri della marca. */
  variante: string | null;
  formato: string | null;
  ean: string | null;
}

/** Le parole di un testo, minuscole e senza accenti. */
function parole(testo: string): string[] {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1);
}

/**
 * Quanto pesa una parola: le comuni descrivono, le rare identificano.
 *
 * ── Perché non pesano tutte uguale ──────────────────────────────────────
 * Con la copertura piatta «ACQUA PANNA NATURALE» perdeva un terzo del
 * punteggio perché la scheda si chiama solo «Acqua Panna» — e la foto era
 * quella giusta. «ALCHERMES BALDONI» perdeva metà punteggio perché mancava
 * «baldoni» — e lì la foto era di un altro produttore. Stesso calo, due
 * situazioni opposte: il numero non distingueva descrivere da identificare.
 *
 * Quali parole siano comuni **non si decide con una lista scritta a mano**.
 * Una lista di parole generiche va aggiornata per sempre, e sbaglia sui casi
 * che contano: «blanco» sembra un aggettivo, ma su una tequila distingue un
 * prodotto da un altro. Si guarda invece il catalogo vero: una parola che
 * compare in cinquanta prodotti è una categoria, una che compare in due è
 * un nome proprio.
 */
const PESO_COMUNE = 0.25;

function peso(parola: string, comuni: ReadonlySet<string>): number {
  return comuni.has(parola) ? PESO_COMUNE : 1;
}

/**
 * Quanta parte del **nostro** nome è coperta dal loro, a peso.
 *
 * Non è simmetrico, ed è voluto: la scheda della fonte è spesso più
 * ricca della nostra riga di listino («Absolut Vodka Citron Flavoured
 * Sweden»), e penalizzare le parole in più significherebbe scartare proprio
 * le schede fatte bene. Ci interessa che **le nostre** parole ci siano.
 */
function copertura(nostre: string[], loro: Set<string>, comuni: ReadonlySet<string>): number {
  let totale = 0;
  let dentro = 0;
  for (const parola of nostre) {
    const p = peso(parola, comuni);
    totale += p;
    if (loro.has(parola)) dentro += p;
  }
  return totale === 0 ? 0 : dentro / totale;
}

/** Il formato, ridotto a millilitri o grammi per poterlo confrontare. */
export function inBase(testo: string | null): number | null {
  if (!testo) return null;
  const m = /(\d+[.,]?\d*)\s*(l|lt|litro|litri|ml|cl|cc|kg|g|gr|grammi)\b/i.exec(testo);
  if (!m) return null;
  const quanto = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(quanto) || quanto <= 0) return null;
  const fattore: Record<string, number> = {
    l: 1000,
    lt: 1000,
    litro: 1000,
    litri: 1000,
    ml: 1,
    cl: 10,
    cc: 1,
    kg: 1000,
    g: 1,
    gr: 1,
    grammi: 1,
  };
  return quanto * (fattore[m[2]!.toLowerCase()] ?? 1);
}

export interface Esito {
  /** Da 0 a 1. */
  confidenza: number;
  /** Perché, in italiano: finisce nei log del riempimento e va letto. */
  motivo: string;
}

/**
 * Il punteggio.
 *
 * ── Perché l'EAN vale 1 e basta ─────────────────────────────────────────
 * Il barcode **è** l'identità del prodotto: due prodotti con lo stesso EAN
 * sono lo stesso prodotto, e nessun confronto di parole può saperne di più.
 * Quando c'è, il resto non si guarda.
 *
 * ── Perché la marca non aggiunge punti ──────────────────────────────────
 * Se la marca combacia non c'è niente da festeggiare: l'avevamo cercata, era
 * prevedibile che tornasse. Se **non** combacia il candidato è fuori, e non
 * per pochi punti — a nessun grado di somiglianza fra le parole si accetta
 * la bottiglia di un altro produttore. La marca è una porta, non un peso.
 */
export function valuta(
  riferimento: Riferimento,
  candidato: Candidato,
  comuni: ReadonlySet<string> = new Set(),
): Esito {
  const eanNostro = riferimento.ean;
  if (eanNostro && candidato.codice && eanNostro === candidato.codice.replace(/\D/g, '')) {
    return { confidenza: 1, motivo: 'stesso EAN' };
  }

  const nostre = parole(riferimento.nome);
  const loro = new Set([...parole(candidato.nome), ...parole(candidato.marche ?? '')]);
  if (nostre.length === 0) return { confidenza: 0, motivo: 'nome vuoto dopo la pulizia' };

  // ── La regola dell'identità ───────────────────────────────────────────
  //
  // Prima si pretende la **marca**, quando la conosciamo. È il dato che dice
  // chi ha prodotto quella bottiglia, e una scheda di un altro produttore
  // non è una scheda scritta diversamente: è un'altra cosa. Nessun punteggio
  // alto altrove può rimediare.
  //
  // Poi la **variante**, per la stessa ragione a un livello più fine: fra
  // Absolut Citron e Absolut Kurant la marca combacia, il produttore è lo
  // stesso, e le due bottiglie sono diverse. È il caso in cui una foto
  // sbagliata sembra più giusta di tutte — stessa forma, stessa etichetta,
  // colore diverso — ed è esattamente quello che chi ordina non ricontrolla.
  if (riferimento.marca) {
    const nostraMarca = parole(riferimento.marca);
    if (nostraMarca.length > 0 && !nostraMarca.every((p) => loro.has(p))) {
      return { confidenza: 0, motivo: `marca diversa (cercavo «${riferimento.marca}»)` };
    }
  }
  if (riferimento.variante) {
    const nostraVariante = parole(riferimento.variante);
    if (nostraVariante.length > 0 && !nostraVariante.some((p) => loro.has(p))) {
      return { confidenza: 0, motivo: `manca la variante «${riferimento.variante}»` };
    }
  }

  // Senza marca nota resta la regola precedente: **tutte** le parole non
  // comuni devono esserci. È più severa e trova meno foto, ed è giusto che
  // sia così — è il caso in cui non sappiamo di chi sia il prodotto.
  if (!riferimento.marca) {
    const distintive = nostre.filter((p) => !comuni.has(p));
    // Servono **due** parole proprie, non una.
    //
    // «ACQUA LITRO NAT O GAS PET X 12» si riduce a «acqua»: è l'acqua senza
    // marca del fornitore, e con una parola sola qualunque bottiglia
    // d'acqua la copre al cento per cento. Una prima versione le assegnava
    // infatti la prima acqua trovata, con la massima confidenza — la foto
    // sbagliata che sembra giustissima. Quando non sappiamo né chi la
    // produce né come si chiama davvero, non c'è niente da verificare, e la
    // risposta onesta è nessuna foto.
    if (distintive.length < 2) {
      return { confidenza: 0, motivo: 'troppo generico per essere verificato' };
    }
    const mancanti = distintive.filter((p) => !loro.has(p));
    if (mancanti.length > 0) {
      return { confidenza: 0, motivo: `manca «${mancanti.join(' ')}»` };
    }
  }

  let punteggio = copertura(nostre, loro, comuni);
  const pezzi = [`nome ${(punteggio * 100).toFixed(0)}%`];

  if (riferimento.marca) pezzi.push('marca giusta');

  // ── Il formato ────────────────────────────────────────────────────────
  // Tocca poco: una scheda giusta con la quantità scritta male capita, e
  // scartarla per quello butterebbe via foto buone. Ma una differenza di
  // dieci volte non è un errore di trascrizione: è un altro prodotto.
  const nostro = inBase(riferimento.formato);
  const suo = inBase(candidato.quantita);
  if (nostro && suo) {
    const rapporto = Math.max(nostro, suo) / Math.min(nostro, suo);
    if (rapporto <= 1.05) {
      punteggio = Math.min(1, punteggio + 0.05);
      pezzi.push('formato uguale');
    } else if (rapporto >= 5) {
      punteggio *= 0.5;
      pezzi.push('formato molto diverso');
    }
  }

  return {
    confidenza: Math.max(0, Math.min(1, Math.round(punteggio * 1000) / 1000)),
    motivo: pezzi.join(', '),
  };
}

/**
 * La soglia sopra cui una foto si associa da sola.
 *
 * 0,80 e non 0,90: con nomi da listino — abbreviati, senza articoli — la
 * copertura piena è rara, e a 0,90 passavano quasi solo gli EAN. Sotto
 * questa riga non si ripiega su niente: si resta senza foto.
 */
export const SOGLIA_AUTOMATICA = 0.8;
