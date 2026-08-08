import type { ProviderAi, RichiestaAi, RispostaAi } from './provider';

/**
 * Il provider finto: fa girare tutta la pipeline senza rete e senza spendere.
 *
 * E' il primo criterio della Fase 8, e non e' una comodita' da sviluppo: e'
 * cio' che permette di collaudare import, validazione e schermate senza
 * dipendere da un servizio esterno, e di farlo in un test automatico.
 *
 * Le risposte sono **deterministiche** e derivano dall'input: due esecuzioni
 * uguali danno lo stesso risultato, come dev'essere per poter asserire
 * qualcosa.
 */

export type RispostaFinta = (richiesta: RichiestaAi) => string;

/** Di default risponde con un oggetto vuoto: chi vuole altro lo dichiara. */
const PREDEFINITA: RispostaFinta = () => '{}';

export function creaMock(rispondi: RispostaFinta = PREDEFINITA): ProviderAi {
  return {
    nome: 'mock',
    modello: 'mock',

    async chiedi(richiesta: RichiestaAi): Promise<RispostaAi> {
      const testo = rispondi(richiesta);
      // I token si stimano a un quarto dei caratteri: non serve precisione,
      // serve che il contatore e il budget abbiano qualcosa da contare anche
      // in modalita' finta, cosi' quel codice non resta mai non provato.
      const tokenIngresso = Math.ceil((richiesta.sistema.length + richiesta.utente.length) / 4);
      return {
        testo,
        tokenIngresso,
        tokenUscita: Math.ceil(testo.length / 4),
        costoUsd: 0,
        modello: 'mock',
        latenzaMs: 0,
      };
    },
  };
}
