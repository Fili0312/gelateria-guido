import { z } from 'zod';

/**
 * I prompt, versionati.
 *
 * La versione non è burocrazia: entra nella chiave di cache. Cambiare il
 * testo senza cambiare la versione servirebbe risposte vecchie a domande
 * nuove, che è il modo peggiore di sbagliare — sembra funzionare.
 */

export const VERSIONE_PROMPT = 'v1';

/**
 * Due regole che valgono per ogni prompt di questa applicazione, e che
 * spiegano perché sono scritti così:
 *
 *  - **il modello non calcola.** Non gli si chiede mai di applicare uno
 *    sconto o sommare un totale: quello lo fa `decimal.js`. Un modello che
 *    sbaglia un conto sbaglia in modo plausibile, ed è il difetto peggiore.
 *  - **il modello non decide, propone.** Restituisce indici di colonna e
 *    campi; il codice li valida, e l'operatore li vede prima che diventino
 *    prezzi.
 */

// ─────────────────────────────────────────────────────────────────────────
//  Inferenza del profilo colonne
// ─────────────────────────────────────────────────────────────────────────

export const SISTEMA_PROFILO = `Sei un assistente che legge listini prezzi di fornitori italiani.

Ricevi alcune righe di un listino, già divise in celle numerate. Devi dire QUALE COLONNA contiene quale informazione.

Regole:
- Rispondi SOLO con JSON, senza commenti.
- Usa gli indici di colonna che vedi, non inventarne di nuovi.
- Se un'informazione non c'è nel listino, metti null.
- Gli sconti sono una lista di indici, nell'ordine in cui vanno applicati a cascata.
- NON calcolare niente: non ti si chiede di applicare sconti o verificare totali.

Significato dei campi:
- codice: il codice articolo del fornitore
- descrizione: il nome del prodotto
- quantita: la quantità della riga (spesso 1). NON è il numero di pezzi per confezione.
- unitaDiVendita: il codice dell'unità di vendita (BT, CO, UN, PZ, CT...)
- prezzoListino: il prezzo prima degli sconti
- sconti: le colonne con le percentuali di sconto
- prezzoNetto: il prezzo dopo gli sconti
- iva: l'aliquota IVA`;

export function utenteProfilo(
  righe: readonly { celle: { testo: string; colonna: number }[] }[],
  intestazioni?: readonly string[],
): string {
  const campione = righe.slice(0, 12).map((riga, i) => {
    const celle = riga.celle
      .filter((c) => c.colonna >= 0)
      .map((c) => `  [${c.colonna}] ${c.testo}`)
      .join('\n');
    return `Riga ${i + 1}:\n${celle}`;
  });

  const cornice = intestazioni?.length
    ? `Intestazioni trovate nel documento (possono aiutare a capire le colonne):\n${intestazioni
        .slice(0, 5)
        .map((t) => `  ${t}`)
        .join('\n')}\n\n`
    : '';

  return `${cornice}${campione.join('\n\n')}

Rispondi con questo JSON:
{"codice": n|null, "descrizione": n|null, "quantita": n|null, "unitaDiVendita": n|null, "prezzoListino": n|null, "sconti": [n], "prezzoNetto": n|null, "iva": n|null}`;
}

const indice = z.union([z.number().int().min(0).max(60), z.null()]);

export const rispostaProfiloSchema = z
  .object({
    codice: indice.default(null),
    descrizione: indice.default(null),
    quantita: indice.default(null),
    unitaDiVendita: indice.default(null),
    prezzoListino: indice.default(null),
    sconti: z.array(z.number().int().min(0).max(60)).max(8).default([]),
    prezzoNetto: indice.default(null),
    iva: indice.default(null),
  })
  // Non `.strict()`: un modello che aggiunge una chiave di troppo non deve
  // far fallire tutto. Le chiavi in più si ignorano, quelle attese si
  // validano — che è la differenza fra tolleranza e credulità.
  .loose();

export type RispostaProfilo = z.infer<typeof rispostaProfiloSchema>;

// ─────────────────────────────────────────────────────────────────────────
//  Estrazione di una singola riga che il profilo non spiega
// ─────────────────────────────────────────────────────────────────────────

export const SISTEMA_RIGHE = `Sei un assistente che legge righe di listini prezzi di fornitori italiani.

Ricevi righe di testo grezzo. Per ognuna estrai i campi che riconosci.

Regole:
- Rispondi SOLO con JSON, senza commenti.
- I prezzi vanno riportati COME SONO SCRITTI, con la virgola decimale italiana.
- Gli sconti sono numeri percentuali, nell'ordine in cui compaiono.
- NON calcolare niente: non applicare sconti, non sommare, non convertire.
- Se un campo non c'è nella riga, metti null. Non inventarlo.`;

export function utenteRighe(righe: readonly { indice: number; testo: string }[]): string {
  return `${righe.map((r) => `${r.indice}: ${r.testo}`).join('\n')}

Rispondi con questo JSON:
{"righe": [{"indice": n, "codice": "…"|null, "descrizione": "…"|null, "unitaDiVendita": "…"|null, "prezzoListino": "…"|null, "sconti": [n], "prezzoNetto": "…"|null, "iva": "…"|null}]}`;
}

const testo = z.union([z.string().max(300), z.null()]);

export const rispostaRigheSchema = z
  .object({
    righe: z
      .array(
        z
          .object({
            indice: z.number().int().min(0),
            codice: testo.default(null),
            descrizione: testo.default(null),
            unitaDiVendita: testo.default(null),
            prezzoListino: testo.default(null),
            sconti: z.array(z.number().min(0).max(100)).max(8).default([]),
            prezzoNetto: testo.default(null),
            iva: testo.default(null),
          })
          .loose(),
      )
      .max(50),
  })
  .loose();

export type RispostaRighe = z.infer<typeof rispostaRigheSchema>;

// ═══════════════════════════════════════════════════════════════════════
//  Classificazione dei prodotti
// ═══════════════════════════════════════════════════════════════════════

/**
 * Il modello classifica **solo quello che la regola non ha saputo decidere**.
 *
 * La regola deterministica piazza già metà del catalogo guardando le parole:
 * «AMARO CALAMARO» contiene «amaro». Quello che le sfugge è ciò che richiede
 * di sapere cosa sono le cose — che Averna è un amaro, che la Coca Cola è una
 * bibita, che «S.BENED. ACQ. TOWER» è acqua. È esattamente il lavoro per cui
 * un modello serve, e l'unico in cui vale la spesa.
 *
 * Vincolo stretto: **si sceglie da un elenco chiuso**. Lasciar inventare la
 * categoria produrrebbe trenta nomi diversi per la stessa cosa, e la
 * tassonomia esiste proprio per non averli.
 */
export const SISTEMA_CLASSIFICA = `Sei un assistente che classifica prodotti di un bar-gelateria italiano.

Ricevi un elenco di descrizioni di prodotti così come le scrivono i fornitori,
e un elenco chiuso di categorie ammesse.

Per ogni prodotto scegli UNA categoria dall'elenco ammesso.

Regole:
- Usa SOLO le categorie dell'elenco, copiate esattamente. Non inventarne.
- Se non sei ragionevolmente sicuro, usa null: una categoria sbagliata è
  peggio di una categoria mancante, perché nessuno la ricontrolla.
- Le descrizioni sono abbreviate e sporche: "S.BENED. ACQ. TOWER NAT. 1/1" è
  acqua naturale, "CC ZERO LATT." è una bibita.
- Vale il prodotto, non il contenitore: una birra in lattina è una birra.

Rispondi SOLO con JSON valido, senza testo attorno:
{"esiti":[{"indice":0,"categoria":"Amari e liquori"},{"indice":1,"categoria":null}]}`;

export function utenteClassifica(
  prodotti: readonly { indice: number; descrizione: string }[],
  categorieAmmesse: readonly string[],
): string {
  return [
    'Categorie ammesse:',
    categorieAmmesse.map((c) => `- ${c}`).join('\n'),
    '',
    'Prodotti da classificare:',
    prodotti.map((p) => `${p.indice}. ${p.descrizione}`).join('\n'),
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
//  Marca e variante di un prodotto
// ═══════════════════════════════════════════════════════════════════════

/**
 * Separare la marca dal resto è **sapere cosa sono le cose**.
 *
 * Nessuna regola scritta a mano ricava da «ABSOLUT CITRON VODKA LITRO» che
 * la marca è Absolut e la variante Citron: bisogna sapere che esiste una
 * distilleria che si chiama così. La prima parola non funziona — su «ACQUA
 * PANNA» darebbe marca «acqua», e da lì ogni acqua somiglierebbe a ogni
 * altra.
 *
 * Serve a cercare la foto giusta: la marca è ciò che si pretende combaci
 * nella scheda trovata, la variante è ciò che distingue una Citron da una
 * Vanilia — che sono due bottiglie diverse, e mostrarne una per l'altra fa
 * ordinare la cosa sbagliata.
 */
export const SISTEMA_MARCA = `Sei un assistente che legge descrizioni di prodotti da listini di fornitori italiani di bevande e alimentari.

Per ogni descrizione estrai marca e variante.

Regole:
- "marca" è il produttore o il marchio commerciale: Absolut, Coca-Cola, San
  Pellegrino, Campari. NON è il tipo di prodotto: "acqua", "vodka", "amaro",
  "birra" non sono marche.
- "variante" è ciò che distingue quel prodotto dagli altri della stessa
  marca: "Citron", "Zero", "Rosso", "Riserva". Se non c'è, usa null.
- Se non riconosci una marca vera, usa null. Una marca inventata è peggio di
  una mancante: viene usata per accettare una fotografia, e la fotografia
  finisce accanto al prezzo di un altro prodotto.
- Non tradurre e non correggere: copia la marca come si scrive normalmente
  ("Coca-Cola", non "coca cola"), ma senza il resto della descrizione.
- Ignora formati, gradazioni e imballi: "CL.70", "40%", "X24", "PET".

Rispondi SOLO con JSON valido, senza testo attorno:
{"esiti":[{"indice":0,"marca":"Absolut","variante":"Citron"},{"indice":1,"marca":null,"variante":null}]}`;

export function utenteMarca(prodotti: readonly { indice: number; descrizione: string }[]): string {
  return [
    'Descrizioni da analizzare:',
    prodotti.map((p) => `${p.indice}. ${p.descrizione}`).join('\n'),
  ].join('\n');
}

export const rispostaMarcaSchema = z.object({
  esiti: z.array(
    z.object({
      indice: z.number().int().min(0),
      marca: z.string().nullable(),
      variante: z.string().nullable(),
    }),
  ),
});

// ═══════════════════════════════════════════════════════════════════════
//  Lettura di un report
// ═══════════════════════════════════════════════════════════════════════

/**
 * Il modello **commenta numeri già calcolati**, non li calcola.
 *
 * È la distinzione che rende questa chiamata sicura: i risparmi, le
 * percentuali e i totali arrivano dal codice deterministico e sono già stati
 * verificati. Al modello si chiede solo di dire cosa guardare per primo e
 * perché, che è un giudizio, non un conto. Se sbaglia, sbaglia un consiglio;
 * non può sbagliare un prezzo.
 */
export const SISTEMA_ANALIZZA = `Sei un consulente acquisti di un bar-gelateria italiano.

Ricevi dati GIÀ CALCOLATI su confronti di prezzo fra fornitori. I numeri sono
corretti e verificati: non ricalcolarli e non correggerli.

Il tuo compito è dire, in italiano semplice e concreto:
1. da dove conviene cominciare e perché (l'impatto in euro, non la percentuale);
2. cosa NON vale la pena di cambiare, e perché;
3. una cosa che i dati suggeriscono e che è facile non notare.

Regole:
- Massimo 200 parole in tutto. Chi legge sta ordinando, non studiando.
- Cita gli euro, mai le percentuali da sole.
- Niente premesse, niente "in conclusione", niente elenchi puntati generici.
- Se i dati sono troppo pochi per dire qualcosa di utile, dillo e basta.

Rispondi SOLO con JSON valido:
{"testo":"..."}`;

export function utenteAnalizza(riassunto: string): string {
  return riassunto;
}

// ═══════════════════════════════════════════════════════════════════════
//  Doppioni fra fornitori
// ═══════════════════════════════════════════════════════════════════════

/**
 * Al modello si chiede **solo di giudicare i nomi**.
 *
 * Le coppie che gli arrivano hanno già superato il cancello del formato:
 * stessa unità base, stessa dimensione entro l'uno per cento. Un 33 cl e un
 * 66 cl non gli vengono nemmeno mostrati, quindi non può sbagliarci sopra.
 * Quello che resta — capire che «HAVANA CLUB 3 A. RHUM 1/1» e «HAVANA CLUB
 * 3Y RON 40% LT.1» sono la stessa bottiglia — è esattamente ciò che una
 * regola sulle parole non sa fare.
 */
export const SISTEMA_DOPPIONI = `Sei un assistente che riconosce prodotti identici in listini di fornitori italiani.

Ricevi coppie di descrizioni. Ogni coppia viene da due fornitori diversi e ha
GIÀ lo stesso formato verificato (stessa unità di misura, stessa dimensione).

Per ogni coppia dici se sono LO STESSO ARTICOLO.

Regole:
- Marca e prodotto devono coincidere. "HAVANA CLUB 3 ANNI" e "HAVANA CLUB 7 ANNI"
  sono prodotti DIVERSI: l'invecchiamento cambia l'articolo.
- Le abbreviazioni non contano: "RHUM"/"RON", "AM."/"AMARO", "1/1"/"LT.1" sono
  modi diversi di scrivere la stessa cosa.
- Le sigle del vuoto (VP, VAP, PET, ctx) non cambiano l'articolo.
- Gusti, colori e varianti diversi sono prodotti diversi: "BOLS PEACH" e
  "BOLS BLUE CURACAO" no.
- Se sono lo stesso articolo ma qualcosa non torna del tutto — una parola che
  non sai interpretare, una sigla che potrebbe essere una variante — rispondi
  stesso:true e sicuro:false. Deciderà una persona.
- Se pensi che siano prodotti diversi, rispondi stesso:false.

Non collegare mai due prodotti diversi per non lasciare la coppia in sospeso:
lasciarla in sospeso è previsto, sbagliarla no.

Rispondi SOLO con JSON valido:
{"coppie":[{"indice":0,"stesso":true,"sicuro":true,"motivo":"stessa marca e prodotto, sigle diverse"},{"indice":1,"stesso":false,"sicuro":true},{"indice":2,"stesso":true,"sicuro":false,"motivo":"potrebbe essere una variante"}]}`;

export function utenteDoppioni(
  coppie: readonly { indice: number; a: string; b: string }[],
): string {
  return coppie.map((c) => `${c.indice}.\n  A: ${c.a}\n  B: ${c.b}`).join('\n');
}
