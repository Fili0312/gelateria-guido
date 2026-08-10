import { budgetMensile, chiediAlModello, creaMock, spesaDelMese } from '../src/server/ai/index.js';
import { AiBudgetError } from '../src/server/ai/provider.js';
import { systemPrisma } from '../src/server/database/system-client.js';

/**
 * I criteri della Fase 8 che riguardano il modello: contabilità, tetto di
 * spesa e scambio del provider.
 *
 * Girano contro un database vero perché è lì che vivono `ai_call` e
 * `ai_cache`: un test che li simulasse verificherebbe il simulatore.
 *
 * ATTENZIONE: scrive righe di contabilità finte. Si rifiuta di partire sul
 * database di produzione.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo AI_MOCK=1 \
 *     tsx --conditions=react-server scripts/collaudo-ia.ts
 */

const DATABASE_LIVE = 'gelateria_guido';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === `/${DATABASE_LIVE}`) {
  throw new Error(`Questo script scrive dati finti e non va eseguito su "${DATABASE_LIVE}".`);
}

function esito(ok: boolean, testo: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const provider = creaMock(() => '{"codice":0,"descrizione":1}');

  console.log('\n═══ criterio 4: ogni chiamata è tracciata su ai_call ═══');
  await systemPrisma.aiCall.deleteMany({ where: { organizationId: org.id } });
  await systemPrisma.aiCache.deleteMany({});

  const prima = await chiediAlModello(
    { sistema: 'S', utente: `unico-${Date.now()}`, versionePrompt: 'v1' },
    { organizationId: org.id, scopo: 'INFER_PROFILE' },
    provider,
  );
  const righe = await systemPrisma.aiCall.count({ where: { organizationId: org.id } });
  esito(righe === 1, `una riga di contabilità per una chiamata (trovate ${righe})`);
  esito(prima.daCache === false, 'la prima chiamata non viene dalla cache');

  console.log('\n═══ la cache: la stessa domanda non si paga due volte ═══');
  const dopo = await chiediAlModello(
    { sistema: 'S', utente: prima.testo === '' ? 'x' : `unico-cache`, versionePrompt: 'v1' },
    { organizationId: org.id, scopo: 'INFER_PROFILE' },
    provider,
  );
  const ripetuta = await chiediAlModello(
    { sistema: 'S', utente: `unico-cache`, versionePrompt: 'v1' },
    { organizationId: org.id, scopo: 'INFER_PROFILE' },
    provider,
  );
  esito(
    dopo.daCache === false && ripetuta.daCache === true,
    'la seconda identica arriva dalla cache',
  );
  const conCosto = await systemPrisma.aiCall.aggregate({
    where: { organizationId: org.id, cacheHit: true },
    _sum: { costUsd: true },
  });
  esito(
    Number(conCosto._sum.costUsd ?? 0) === 0,
    'una risposta dalla cache è contabilizzata a costo zero',
  );

  console.log('\n═══ il prompt versionato invalida solo ciò che dipende da lui ═══');
  const v2 = await chiediAlModello(
    { sistema: 'S', utente: `unico-cache`, versionePrompt: 'v2' },
    { organizationId: org.id, scopo: 'INFER_PROFILE' },
    provider,
  );
  esito(v2.daCache === false, 'cambiando versione del prompt la cache non risponde');

  console.log('\n═══ criterio 5: superato il budget, la lavorazione si ferma ═══');
  const tetto = budgetMensile();
  await systemPrisma.aiCall.create({
    data: {
      organizationId: org.id,
      provider: 'deepseek',
      model: 'finto',
      purpose: 'INFER_PROFILE',
      promptVersion: 'v1',
      costUsd: tetto + 1,
    },
  });
  const speso = await spesaDelMese(org.id);
  esito(speso > tetto, `spesa del mese ${speso.toFixed(2)} oltre il tetto di ${tetto}`);

  let fermato = false;
  let messaggio = '';
  try {
    await chiediAlModello(
      { sistema: 'S', utente: `oltre-il-tetto-${Date.now()}`, versionePrompt: 'v1' },
      { organizationId: org.id, scopo: 'INFER_PROFILE' },
      provider,
    );
  } catch (errore) {
    fermato = errore instanceof AiBudgetError;
    messaggio = (errore as Error).message;
  }
  esito(fermato, 'la chiamata viene rifiutata con AiBudgetError');
  esito(/tetto di spesa/i.test(messaggio), `e lo dice: «${messaggio.slice(0, 80)}…»`);

  console.log('\n  ma una risposta già in cache continua a servire:');
  const dallaCache = await chiediAlModello(
    { sistema: 'S', utente: `unico-cache`, versionePrompt: 'v1' },
    { organizationId: org.id, scopo: 'INFER_PROFILE' },
    provider,
  );
  esito(dallaCache.daCache, 'leggere un appunto già scritto non costa, quindi non si rifiuta');

  await systemPrisma.aiCall.deleteMany({ where: { organizationId: org.id } });
  await systemPrisma.$disconnect();
  console.log(
    process.exitCode ? '\n✗ Almeno un criterio non è soddisfatto.' : '\n✓ Tutti passano.',
  );
}

main().catch(async (errore: unknown) => {
  console.error(errore);
  await systemPrisma.$disconnect();
  process.exitCode = 1;
});
