interface RigaConProdotto {
  productId: string | null;
}

/**
 * Una riga è davvero senza confronto solo se il suo prodotto ha meno di due
 * offerte che il motore è riuscito a confrontare. L'assenza di un avviso non
 * basta: può semplicemente significare che l'offerta scelta è già la migliore.
 */
export function selezionaRigheSenzaConfronto<T extends RigaConProdotto>(
  righe: readonly T[],
  offerteConfrontatePerProdotto: ReadonlyMap<string, number>,
): T[] {
  return righe.filter(
    (riga) =>
      riga.productId === null || (offerteConfrontatePerProdotto.get(riga.productId) ?? 0) < 2,
  );
}

interface SegnalazioniRiepilogo {
  minimiNonRaggiunti: readonly unknown[];
  prezziCambiati: readonly unknown[];
  prezziFermi: readonly unknown[];
  senzaConfronto: readonly unknown[];
}

/** Determina se il contenitore delle segnalazioni deve essere visibile. */
export function haSegnalazioniRiepilogo(riepilogo: SegnalazioniRiepilogo): boolean {
  return (
    riepilogo.minimiNonRaggiunti.length > 0 ||
    riepilogo.prezziCambiati.length > 0 ||
    riepilogo.prezziFermi.length > 0 ||
    riepilogo.senzaConfronto.length > 0
  );
}
