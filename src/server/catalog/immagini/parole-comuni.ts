import { nomePulito } from './normalizza';

/**
 * Quali parole, in *questo* catalogo, non identificano niente.
 *
 * Si contano i prodotti in cui ogni parola compare. «Vodka» sta in decine di
 * righe: sapere che una scheda contiene «vodka» non dice che sia la nostra
 * vodka. «Baldoni» sta in due: se manca dall'altra parte, l'altra parte è un
 * altro prodotto.
 *
 * ── Perché dal catalogo e non da una lista ──────────────────────────────
 * Una lista scritta a mano andrebbe mantenuta per sempre e sbaglierebbe
 * proprio sui casi che contano: «blanco» sembra un aggettivo qualunque e su
 * una tequila distingue un prodotto da un altro. Contare è gratis, non
 * invecchia, e si adatta da solo quando il catalogo passa dai liquori ai
 * gelati.
 */

/**
 * La soglia, **misurata** sul catalogo vero e non scelta a occhio.
 *
 * Su 536 prodotti e 930 parole distinte la frequenza è piatta: la parola più
 * diffusa («gin») compare 47 volte, la ventesima 12. Un ventesimo del
 * catalogo — 27 occorrenze — lasciava fuori tutto tranne «gin», e con nessuna
 * parola marcata comune la regola dell'identità pretendeva che combaciasse
 * *ogni* parola, scartando tutte le foto giuste insieme a quelle sbagliate.
 *
 * All'1,5% (nove occorrenze qui) entrano `gin sciroppo succo amaro bitter
 * bianco liquore rosso vodka rum brut dry`: sono esattamente i nomi delle
 * famiglie di prodotto, che è ciò che si voleva riconoscere.
 *
 * Il minimo assoluto protegge i cataloghi piccoli: con quaranta prodotti
 * l'1,5% è meno di uno, e una parola vista una volta sola verrebbe
 * dichiarata generica.
 */
const QUOTA = 0.015;
const MINIMO = 6;

export function comuniDaNomi(nomi: readonly string[]): Set<string> {
  const conteggio = new Map<string, number>();
  for (const nome of nomi) {
    // Le stesse parole che vedrà il punteggio: contarne di diverse darebbe
    // una soglia calcolata su un vocabolario che non esiste.
    const viste = new Set(
      nomePulito(nome)
        .split(/\s+/)
        .filter((p) => p.length > 1),
    );
    for (const parola of viste) conteggio.set(parola, (conteggio.get(parola) ?? 0) + 1);
  }

  const soglia = Math.max(MINIMO, Math.ceil(nomi.length * QUOTA));
  const comuni = new Set<string>();
  for (const [parola, quante] of conteggio) {
    if (quante >= soglia) comuni.add(parola);
  }
  return comuni;
}
