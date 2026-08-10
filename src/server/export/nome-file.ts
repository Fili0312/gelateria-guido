import { businessCalendarDay } from '@/features/prices/date';

/**
 * I nomi dei file scaricati.
 *
 * Finiscono nella cartella Download di chi ordina, insieme a tutto il resto,
 * e ci restano. Due proprietà contano più dell'eleganza:
 *
 *  - **ordinabili**: la data per prima, in `AAAA-MM-GG`. Ordinando per nome
 *    si ordina per data, che è come si cerca un ordine di tre mesi fa;
 *  - **riconoscibili senza aprirli**: fornitore e numero d'ordine dentro il
 *    nome. `documento(3).pdf` costringe ad aprirli tutti.
 *
 * Niente accenti, spazi o barre: questi nomi passano per un header HTTP, per
 * un allegato email e per filesystem che non la pensano allo stesso modo.
 */

/** `Caffè Molinari S.r.l.` → `caffe-molinari-s-r-l` */
export function pezzoDiNome(testo: string): string {
  const senzaAccenti = testo
    .normalize('NFD')
    // Via i segni diacritici: `è` è già diventata `e` + accento combinante.
    .replace(/[̀-ͯ]/g, '');
  const ripulito = senzaAccenti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Un nome fatto di soli simboli lascerebbe il campo vuoto e due underscore
  // attaccati: meglio una parola che si legge.
  return ripulito.slice(0, 40) || 'senza-nome';
}

/** La data in `AAAA-MM-GG`, nel fuso fisso della gelateria. */
export function giorno(data: Date): string {
  return businessCalendarDay(data);
}

export function nomeFile(parti: {
  data: Date;
  /** Il codice dell'ordine; per una bozza non c'è ancora. */
  codice: string | null;
  /** Il pezzo che distingue questo file dagli altri dello stesso ordine. */
  qualifica: string;
  estensione: string;
}): string {
  const ordine = parti.codice ? `ordine-${pezzoDiNome(parti.codice)}` : 'ordine-in-bozza';
  return `${giorno(parti.data)}_${ordine}_${pezzoDiNome(parti.qualifica)}.${parti.estensione}`;
}

/**
 * Il nome per l'header `Content-Disposition`.
 *
 * `filename*` in UTF-8 per i browser moderni, `filename` ripulito come
 * riserva: un nome con una virgoletta dentro romperebbe l'header e il file
 * arriverebbe chiamato come l'URL.
 */
export function contentDisposition(nome: string): string {
  const sicuro = nome.replace(/["\\\r\n]/g, '_');
  return `attachment; filename="${sicuro}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}
