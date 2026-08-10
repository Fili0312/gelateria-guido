import 'server-only';

import { ordineFornitorePdf } from './templates/ordine-fornitore';
import { riepilogoXlsx } from './templates/riepilogo-xlsx';
import type { DocumentTemplate } from './template';

/**
 * Tutti i formati che l'applicazione sa produrre.
 *
 * **Questo è l'unico elenco.** Le API, le schermate e lo zip non nominano mai
 * un template: chiedono qui. Aggiungerne uno è un file in `templates/` più una
 * riga in questo array, e non si tocca niente fuori da `server/export/`.
 */
export const TEMPLATE: readonly DocumentTemplate[] = [ordineFornitorePdf, riepilogoXlsx];

// Una chiave duplicata farebbe scaricare il documento sbagliato senza che
// niente lo segnali: si scopre all'avvio, non in produzione.
{
  const viste = new Set<string>();
  for (const t of TEMPLATE) {
    if (viste.has(t.key)) throw new Error(`Due template con la stessa chiave: ${t.key}`);
    viste.add(t.key);
  }
}

export function templatePerChiave(key: string): DocumentTemplate | undefined {
  return TEMPLATE.find((t) => t.key === key);
}

/** Quelli generati quando si preme «genera i documenti» senza scegliere. */
export function templatePredefiniti(): DocumentTemplate[] {
  return TEMPLATE.filter((t) => t.predefinito);
}

/** L'elenco per le schermate: nessuna pagina deve conoscere le chiavi. */
export function templateInElenco(): {
  key: string;
  label: string;
  format: string;
  ambito: string;
}[] {
  return TEMPLATE.map((t) => ({
    key: t.key,
    label: t.label,
    format: t.format,
    ambito: t.ambito,
  }));
}
