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
