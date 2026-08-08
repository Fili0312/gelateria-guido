import 'server-only';

import { SCADENZA_BATTITO_MS } from '@/server/repositories/price-lists';
import { systemPrisma } from '@/server/database/system-client';
import { estraiTesto, PdfIllegibileError, PdfSenzaTestoError } from './pdf/extract-text';
import { segmenta, type RigaGrezza } from './pdf/segment';
import { percorsoAssoluto } from './storage';
import { strutturaListino, type EsitoStrutturazione } from './structure';
import { proponiAbbinamenti } from './matching/proposte';
import type { RigaValidata } from './validate';
import type { ProfiloColonne } from './profile/mapping';
import type { OrganizationJsonInput } from '@/server/db';

/**
 * Il processo che porta un PDF caricato alle sue righe grezze.
 *
 * Gira **dentro il server web**, non in un worker separato. È la scelta giusta
 * a questa scala: i listini sono uno o due alla settimana e l'estrazione dura
 * pochi secondi, mentre un processo a parte porterebbe con sé una coda, un
 * servizio systemd in più e un modo nuovo di rompersi. Il prezzo da pagare è
 * che un riavvio del servizio interrompe il lavoro a metà — ed è esattamente
 * il motivo per cui il job ha checkpoint e ripresa.
 *
 * Il client di sistema serve perché la ripresa all'avvio non ha una sessione
 * da cui ricavare l'organizzazione: non c'è nessun utente, c'è solo un job
 * rimasto appeso. Tutte le query filtrano comunque per listino, che
 * l'organizzazione ce l'ha addosso.
 */

/** A quanti record per volta si scrivono le righe. Un lotto troppo grande
 *  supera i limiti di parametri di PostgreSQL; troppo piccolo moltiplica i
 *  giri di rete su un listino da 500 righe. */
const DIMENSIONE_LOTTO = 100;

export type EsitoLavorazione = 'fatto' | 'annullato' | 'fallito' | 'saltato';

/** Segna che il processo è vivo: è ciò che distingue «sta lavorando» da
 *  «il servizio è morto e il job è rimasto appeso». */
async function battito(jobId: string, dati: Record<string, unknown> = {}): Promise<void> {
  await systemPrisma.importJob.update({
    where: { id: jobId },
    data: { heartbeatAt: new Date(), ...dati },
  });
}

/** Il job è stato annullato mentre lavoravamo? Si controlla fra un lotto e
 *  l'altro: annullare deve avere effetto entro pochi secondi, non alla fine. */
async function annullato(jobId: string): Promise<boolean> {
  const job = await systemPrisma.importJob.findUnique({
    where: { id: jobId },
    select: { phase: true },
  });
  return job?.phase === 'CANCELLED';
}

function righeDaScrivere(
  righe: readonly RigaGrezza[],
  priceListId: string,
  strutturate: ReadonlyMap<RigaGrezza, RigaValidata>,
) {
  return righe.map((riga) => {
    const campi = strutturate.get(riga);
    return {
    priceListId,
    pageNumber: riga.pagina,
    lineNumber: riga.numero,
    rawText: riga.testo,
    rawCells: riga.celle.map((c) => ({ testo: c.testo, colonna: c.colonna, x: Math.round(c.x) })),
    bbox: riga.bbox,
    source: 'PROFILE' as const,
    // `extracted` è la zona in cui la Fase 8 scriverà i campi interpretati.
    // Per ora ci sta solo ciò che il segmentatore sa con certezza: che tipo
    // di riga è, cosa ha assorbito, sotto quale sezione stava.
    extracted: {
      tipo: riga.tipo,
      continuazioni: riga.continuazioni,
      // I codici dichiarati a parte (`EAN: 20561`) stanno qui e non nella
      // descrizione: nei listini Cecconi ripetono il codice articolo, e
      // incollarli al nome sporcherebbe la ricerca della Fase 9.
      codici: riga.codici,
      sezione: riga.sezione,
      // I campi interpretati, quando la riga e' un prodotto. `null` sui
      // titoli di sezione e sulle righe non capite: non e' una mancanza, e'
      // che non c'e' niente da interpretare.
      campi: campi ?? null,
    } as unknown as OrganizationJsonInput,
    confidence: campi ? (campi.importabile ? '1' : '0.5') : null,
    validationErrors: campi?.segnalazioni.length
      ? (campi.segnalazioni as unknown as OrganizationJsonInput)
      : undefined,
    matchStatus: 'PENDING' as const,
    proposedAction: 'AMBIGUOUS' as const,
    };
  });
}

/**
 * Esegue (o riprende) la lavorazione di un listino.
 *
 * È **idempotente**: se il processo muore a metà scrittura, rieseguirla
 * riparte dal checkpoint e non duplica nulla — l'unicità di
 * `(price_list_id, page_number, line_number)` lo garantisce anche se il
 * checkpoint fosse in ritardo.
 */
export async function lavora(priceListId: string): Promise<EsitoLavorazione> {
  const listino = await systemPrisma.priceList.findUnique({
    where: { id: priceListId },
    select: {
      id: true,
      organizationId: true,
      supplierId: true,
      scopeLabel: true,
      storagePath: true,
      job: { select: { id: true, phase: true } },
    },
  });
  if (!listino?.job) return 'saltato';
  const jobId = listino.job.id;
  if (listino.job.phase === 'CANCELLED') return 'annullato';

  try {
    await systemPrisma.importJob.update({
      where: { id: jobId },
      data: { phase: 'EXTRACTING', startedAt: new Date(), heartbeatAt: new Date(), error: null },
    });
    await systemPrisma.priceList.update({
      where: { id: priceListId },
      data: { status: 'EXTRACTING', error: null },
    });

    // poppler legge da un percorso: il file e' gia' su disco e non serve
    // portarselo in memoria, che su un listino da 20 MB sarebbero 20 MB
    // occupati per niente.
    const testo = await estraiTesto(percorsoAssoluto(listino.storagePath));

    if (await annullato(jobId)) return 'annullato';

    await battito(jobId, { phase: 'SEGMENTING', progressTotal: testo.pagine });
    await systemPrisma.priceList.update({
      where: { id: priceListId },
      data: { pageCount: testo.pagine, extractorVersion: testo.versione },
    });

    const esito = segmenta(testo.documento.pagine);

    // ── Strutturazione (Fase 8) ─────────────────────────────────────────
    // Si prova prima a dedurre il profilo dall'aritmetica del documento; il
    // modello si chiama solo se non ci si riesce. Sui listini della gelateria
    // non si chiama mai.
    await battito(jobId, { phase: 'STRUCTURING' });
    const prodottiGrezzi = esito.righe.filter((r) => r.tipo === 'prodotto');
    // Il profilo si cerca per fornitore **e copertura**: lo stesso fornitore
    // impagina i vini diversamente dai liquori, ed e' proprio la ragione per
    // cui la copertura esiste. Senza il filtro sulla copertura, il profilo dei
    // liquori Cecconi finiva applicato ai vini e leggeva 0 righe su 33.
    const archiviato = await systemPrisma.supplierImportProfile.findFirst({
      where: { supplierId: listino.supplierId, scopeLabel: listino.scopeLabel, active: true },
      orderBy: { version: 'desc' },
      select: { columnMapping: true },
    });

    const struttura = await strutturaListino(prodottiGrezzi, {
      organizationId: listino.organizationId,
      priceListId,
      profiloSalvato: profiloSalvato(archiviato?.columnMapping),
      intestazioni: esito.intestazioni.map((i) => i.testo),
    });

    const campiPerRiga = new Map(
      prodottiGrezzi.map((riga, i) => [riga, struttura.validazione.righe[i]!]),
    );

    await battito(jobId, { phase: 'VALIDATING' });
    const daScrivere = righeDaScrivere(esito.righe, priceListId, campiPerRiga);

    // Si riparte da quante righe risultano già scritte, non dal checkpoint
    // dichiarato: dopo un'interruzione il database è la verità, il checkpoint
    // è solo un'ipotesi che poteva non essere stata salvata.
    const giaScritte = await systemPrisma.priceListRow.count({ where: { priceListId } });
    await battito(jobId, { progressTotal: daScrivere.length, progressCurrent: giaScritte });

    for (let i = giaScritte; i < daScrivere.length; i += DIMENSIONE_LOTTO) {
      if (await annullato(jobId)) return 'annullato';
      await systemPrisma.priceListRow.createMany({
        data: daScrivere.slice(i, i + DIMENSIONE_LOTTO),
        skipDuplicates: true,
      });
      await battito(jobId, {
        progressCurrent: Math.min(i + DIMENSIONE_LOTTO, daScrivere.length),
        checkpoint: { righeScritte: Math.min(i + DIMENSIONE_LOTTO, daScrivere.length) },
      });
    }

    // Il profilo si salva **solo se dimostrato**: un profilo dedotto a occhio
    // e messo in archivio verrebbe riusato senza che nessuno lo riveda, e
    // sbaglierebbe in silenzio su tutti i listini successivi.
    if (struttura.fonteProfilo === 'aritmetica') {
      await salvaProfilo(listino.supplierId, listino.scopeLabel, struttura);
    }

    // ── Abbinamento (Fase 9) ────────────────────────────────────────────
    // Propone, non applica: le proposte finiscono sulle righe di staging e
    // la Fase 10 le riconcilia col catalogo. Un import che scrivesse
    // direttamente sul dominio non si potrebbe annullare.
    await battito(jobId, { phase: 'MATCHING' });
    const abbinamento = await proponiAbbinamenti(priceListId, async (fatte) => {
      await battito(jobId, { progressCurrent: fatte });
    });

    const prodotti = prodottiGrezzi.length;
    await systemPrisma.$transaction([
      systemPrisma.importJob.update({
        where: { id: jobId },
        data: {
          phase: 'DONE',
          progressCurrent: daScrivere.length,
          finishedAt: new Date(),
          heartbeatAt: new Date(),
        },
      }),
      systemPrisma.priceList.update({
        where: { id: priceListId },
        data: {
          // `REVIEW`: le righe sono lette, interpretate e con una proposta di
          // abbinamento. Manca solo che qualcuno la guardi (Fase 10).
          status: 'REVIEW',
          stats: {
            righe: daScrivere.length,
            prodotti,
            sezioni: esito.diagnostica.sezioni,
            ignote: esito.righe.filter((r) => r.tipo === 'ignota').length,
            colonne: esito.colonne.map((c) => Math.round(c.centro)),
            intestazioniScartate: esito.intestazioni.length,
            continuazioniUnite: esito.diagnostica.continuazioniUnite,
            profilo: struttura.profilo as unknown as object,
            fonteProfilo: struttura.fonteProfilo,
            confermate: struttura.confermate,
            smentite: struttura.smentite,
            importabili: struttura.validazione.importabili,
            conErrori: struttura.validazione.conErrori,
            conAvvisi: struttura.validazione.conAvvisi,
            chiamateIa: struttura.chiamateIa,
            costoUsd: struttura.costoUsd,
            abbinati: abbinamento.automatici,
            daAbbinare: abbinamento.daRivedere,
            nuoviProdotti: abbinamento.nuovi,
            giaNoti: abbinamento.giaNoti,
          },
        },
      }),
    ]);
    return 'fatto';
  } catch (errore) {
    // Il messaggio che arriva all'operatore è quello degli errori di dominio
    // (PDF scansionato, PDF illeggibile), che sono scritti per essere letti.
    // Tutto il resto diventa una frase generica: il testo di un'eccezione può
    // contenere percorsi del server.
    const suo =
      errore instanceof PdfSenzaTestoError || errore instanceof PdfIllegibileError
        ? errore.message
        : 'La lavorazione non è riuscita per un errore imprevisto.';
    if (!(errore instanceof PdfSenzaTestoError || errore instanceof PdfIllegibileError)) {
      console.error(`Lavorazione del listino ${priceListId} fallita:`, errore);
    }

    await systemPrisma.importJob
      .update({
        where: { id: jobId },
        data: { phase: 'FAILED', error: suo, finishedAt: new Date(), heartbeatAt: new Date() },
      })
      .catch(() => {});
    await systemPrisma.priceList
      .update({ where: { id: priceListId }, data: { status: 'FAILED', error: suo } })
      .catch(() => {});
    return 'fallito';
  }
}

/**
 * Fa ripartire i job rimasti appesi.
 *
 * Chiamata all'avvio del server: un job che risulta in lavorazione ma il cui
 * ultimo segno di vita è vecchio appartiene a un processo che non esiste più
 * — tipicamente perché è stato fatto un deploy mentre lavorava. Senza questa
 * ripresa resterebbe «in corso» per sempre, che è il modo peggiore di
 * fallire: sembra che stia ancora facendo qualcosa.
 */
export async function riprendiJobInterrotti(): Promise<number> {
  const scadenza = new Date(Date.now() - SCADENZA_BATTITO_MS);
  const appesi = await systemPrisma.importJob.findMany({
    where: {
      phase: { notIn: ['DONE', 'FAILED', 'CANCELLED'] },
      OR: [{ heartbeatAt: { lt: scadenza } }, { heartbeatAt: null }],
    },
    select: { priceListId: true },
    take: 20,
  });

  for (const job of appesi) {
    // In sequenza e non in parallelo: all'avvio il server deve rispondere
    // alle richieste, non contendersi la CPU con cinque estrazioni.
    await lavora(job.priceListId).catch((errore: unknown) => {
      console.error(`Ripresa del listino ${job.priceListId} fallita:`, errore);
    });
  }
  return appesi.length;
}

/**
 * Avvia la lavorazione senza aspettarla.
 *
 * La risposta al caricamento deve tornare subito: chi ha caricato guarda
 * l'avanzamento, non una richiesta che pende per venti secondi (e che un
 * proxy chiuderebbe a metà).
 */
export function avviaInBackground(priceListId: string): void {
  void lavora(priceListId).catch((errore: unknown) => {
    console.error(`Lavorazione del listino ${priceListId} fallita:`, errore);
  });
}

/**
 * Rilegge il profilo salvato di un fornitore, se ce n'è uno.
 *
 * Restituisce `null` a ogni minimo dubbio sulla forma: un profilo salvato
 * male leggerebbe le colonne sbagliate su tutti i listini futuri, e siccome
 * non fa fallire niente lo si scoprirebbe dai prezzi.
 */
function profiloSalvato(grezzo: unknown): ProfiloColonne | null {
  if (!grezzo || typeof grezzo !== 'object') return null;
  const p = grezzo as Record<string, unknown>;
  const indice = (v: unknown): number | null =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
  if (indice(p.prezzoListino) === null && indice(p.prezzoNetto) === null) return null;
  return {
    codice: indice(p.codice),
    descrizione: indice(p.descrizione),
    quantita: indice(p.quantita),
    unitaDiVendita: indice(p.unitaDiVendita),
    prezzoListino: indice(p.prezzoListino),
    sconti: Array.isArray(p.sconti)
      ? p.sconti.filter((s): s is number => typeof s === 'number' && Number.isInteger(s) && s >= 0)
      : [],
    prezzoNetto: indice(p.prezzoNetto),
    iva: indice(p.iva),
  };
}

/**
 * Archivia il profilo dimostrato di un fornitore.
 *
 * È ciò che rende l'import successivo dello stesso fornitore completamente
 * deterministico. La versione si incrementa invece di sovrascrivere: un
 * fornitore che cambia impaginazione lascia una traccia di com'era prima.
 */
async function salvaProfilo(
  supplierId: string,
  scopeLabel: string,
  struttura: EsitoStrutturazione,
): Promise<void> {
  try {
    const ultima = await systemPrisma.supplierImportProfile.findFirst({
      where: { supplierId, scopeLabel },
      orderBy: { version: 'desc' },
      select: { version: true, columnMapping: true },
    });

    // Se il profilo non è cambiato non si crea una versione nuova: un
    // archivio pieno di copie identiche non racconta niente.
    if (ultima && JSON.stringify(ultima.columnMapping) === JSON.stringify(struttura.profilo)) {
      return;
    }

    await systemPrisma.$transaction([
      systemPrisma.supplierImportProfile.updateMany({
        where: { supplierId, scopeLabel },
        data: { active: false },
      }),
      systemPrisma.supplierImportProfile.create({
        data: {
          supplierId,
          scopeLabel,
          version: (ultima?.version ?? 0) + 1,
          active: true,
          columnMapping: struttura.profilo as unknown as object,
          createdBy: 'PROFILE',
        },
      }),
    ]);
  } catch (errore) {
    // Non salvare il profilo costa una strutturazione in più al prossimo
    // listino: fastidioso, non grave. Far fallire l'import per questo sì.
    console.error(`Salvataggio del profilo per il fornitore ${supplierId} fallito:`, errore);
  }
}
