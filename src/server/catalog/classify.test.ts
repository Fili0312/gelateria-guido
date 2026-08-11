import assert from 'node:assert/strict';
import test from 'node:test';
import { categoriaSuggerita } from '@/server/domain/catalog/categorie';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';

/**
 * La classificazione sceglie **dentro le categorie esistenti**, sempre.
 *
 * Né la regola né il modello ne creano una: la regola propone un nome e poi
 * lo cerca fra quelle a catalogo — se non c'è, lascia il prodotto senza
 * categoria; al modello si passa l'elenco chiuso con l'istruzione di non
 * inventarne. Questi test fissano il pezzo deterministico, che è quello che
 * si può provare senza chiamare niente.
 */

/** Come fa il classificatore: indice normalizzato, non `toLowerCase`. */
function agganciaA(categorieACatalogo: string[], testo: string): string | null {
  const perNome = new Map(categorieACatalogo.map((n) => [normalizzaTesto(n), n]));
  const proposta = categoriaSuggerita(testo);
  return proposta ? (perNome.get(normalizzaTesto(proposta)) ?? null) : null;
}

test('la regola aggancia il prodotto a una categoria che esiste', () => {
  assert.equal(
    agganciaA(['Amari e liquori', 'Bibite'], 'AMARO CALAMARO 34% CL.70'),
    'Amari e liquori',
  );
});

test('se quella categoria non è a catalogo, non la crea: lascia vuoto', () => {
  // La tassonomia è di chi usa l'app. Se ha deciso di non avere «Bibite», un
  // prodotto che sembra una bibita resta da classificare — non compare una
  // categoria che nessuno ha voluto.
  assert.equal(agganciaA(['Amari e liquori'], 'COCA COLA LATTINA CL.33'), null);
});

test('le differenze di maiuscole e accenti non fanno mancare l’aggancio', () => {
  // La regola propone un nome scritto in un modo solo; la tassonomia la
  // scrive una persona. Prima bastava una maiuscola diversa perché il
  // prodotto finisse al modello — che costa — per una cosa già decidibile.
  for (const scritta of ['CAFFÈ E INFUSI', 'caffe e infusi', 'Caffè E Infusi']) {
    assert.equal(agganciaA([scritta], 'CAFFE ILLY GRANI KG.1'), scritta, scritta);
  }
});

test('senza nessuna categoria non aggancia niente', () => {
  assert.equal(agganciaA([], 'AMARO CALAMARO 34% CL.70'), null);
});
