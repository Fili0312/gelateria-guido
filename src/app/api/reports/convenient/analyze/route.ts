import { z } from 'zod';
import { chiediAlModello, leggiRisposta } from '@/server/ai';
import { SISTEMA_ANALIZZA, utenteAnalizza, VERSIONE_PROMPT } from '@/server/ai/prompts';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { comparisonRepository } from '@/server/repositories/comparison';

export const dynamic = 'force-dynamic';

const rispostaSchema = z.object({ testo: z.string().min(1) });

/** Quanti confronti mandare al modello: i più grossi, non tutti. */
const QUANTI = 20;

/**
 * Fa leggere il confronto a un modello.
 *
 * **I numeri li calcola il codice, il modello li commenta.** È la distinzione
 * che rende questa chiamata sicura: risparmi, percentuali e totali arrivano
 * dal dominio deterministico e sono già verificati. Al modello si chiede solo
 * da dove cominciare e cosa lasciar stare — che è un giudizio, non un conto.
 * Se sbaglia, sbaglia un consiglio: non può sbagliare un prezzo.
 *
 * Si mandano i venti confronti più grossi e non tutti: il resto è coda lunga
 * che allunga il prompt senza cambiare il consiglio.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const report = await comparisonRepository(user.organizationId).report({ sort: 'saving-desc' });
    if (report.comparisons.length === 0) {
      return jsonError(
        'Non c’è ancora nessun confronto da leggere: serve che due fornitori vendano lo stesso prodotto.',
        422,
      );
    }

    const riassunto = [
      `Catalogo: ${report.totals.products} prodotti con offerte, ${report.totals.compared} confrontabili.`,
      `Prodotti con un solo fornitore: ${report.totals.singleOffer}.`,
      `Risparmio totale possibile comprando una confezione di ciascuno: ${report.totals.savingPerPack} €.`,
      `Soglie impostate: oltre ${report.thresholds.percentage}% e ${report.thresholds.euro} € a confezione.`,
      `Confronti che le superano: ${report.totals.worthAlert}.`,
      '',
      'I confronti, dal più conveniente da cambiare:',
      ...report.comparisons.slice(0, QUANTI).map((r) => {
        const fermo = r.anyStale ? ' (prezzo fermo da tempo)' : '';
        return (
          `- ${r.productName}: conviene da ${r.best!.supplierName} a ${r.best!.priceNet} € ` +
          `(${r.best!.unitPrice} per unità) invece di ${r.worst!.supplierName} a ${r.worst!.priceNet} €. ` +
          `Risparmio ${r.savingPerPack} € a confezione, ${r.savingPct}%${fermo}.`
        );
      }),
    ].join('\n');

    const chiamata = await chiediAlModello(
      {
        sistema: SISTEMA_ANALIZZA,
        utente: utenteAnalizza(riassunto),
        versionePrompt: VERSIONE_PROMPT,
        // Il modello ragiona prima di scrivere, e il ragionamento consuma
        // dallo stesso tetto: con 600 token spendeva tutto a pensare e
        // restituiva una risposta vuota. Il testo chiesto è breve — 200
        // parole — ma il pensiero che lo precede non lo è.
        massimoToken: 4_000,
      },
      { organizationId: user.organizationId, scopo: 'ANALYZE' },
    );

    const risposta = leggiRisposta(chiamata.testo, rispostaSchema);
    return jsonSuccess({
      testo: risposta.testo,
      daCache: chiamata.daCache,
      confrontiLetti: Math.min(report.comparisons.length, QUANTI),
    });
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile leggere il confronto.', [
      { nome: 'AiBudgetError', status: 402 },
      { nome: 'AiError', status: 502 },
    ]);
  }
}
