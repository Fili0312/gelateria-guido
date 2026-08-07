# FASE 0 — Decisioni e materiale · stato

Ultimo aggiornamento: 2026-08-07

**Obiettivo della fase:** eliminare le incognite che, se scoperte tardi,
costringerebbero a riscrivere. Nessun codice applicativo.

---

## ✅ Fatto (non dipendeva da risposte)

- **Strumento di triage dei listini**: `scripts/analizza-listino.py`.
  Analizza uno o più PDF e produce `tests/fixtures/REPORT.md` rispondendo da
  solo a D0 (serve OCR?), D6 (IVA), D7 (scaglioni), D8 (immagini), più il
  numero e la posizione delle colonne e il vocabolario di unità e confezioni
  di ogni fornitore. Zero dipendenze oltre a poppler, già installato.
  Provato su tre casi costruiti apposta: listino semplice (4 colonne
  riconosciute correttamente), listino a scaglioni con IVA per riga (9 colonne,
  scaglioni segnalati), PDF senza livello di testo (riconosciuto come
  scansionato). Verificato anche su un PDF reale del server.
- **Cartella dei listini** con istruzioni: `tests/fixtures/listini/README.md`.
- **Vincoli del server verificati** (in fondo a [DECISIONI.md](DECISIONI.md)):
  Node 22, pnpm 9.15, Postgres 16 con `pg_trgm`/`unaccent`/`pgcrypto`,
  `pgvector` **assente**, poppler presente, `tesseract` **assente**,
  porta 3030 libera, `/gelateria-guido/` già occupato in nginx.

## ✅ Decisioni prese (2026-08-07)

| #   | Decisione    | Scelta                                                                                                |
| --- | ------------ | ----------------------------------------------------------------------------------------------------- |
| D1  | URL          | `filippo.eventoyou.com/gelateria`, porta 3030 — i blocchi nginx di `/gelateria-guido/` non si toccano |
| D2  | Stack        | monolite Next.js                                                                                      |
| D3  | Database     | Postgres dedicato `gelateria_guido` (per default)                                                     |
| D4  | Login        | **password unica condivisa**, niente account personali                                                |
| D5  | Multi-tenant | `organization_id` da subito, nessuna UI (per default)                                                 |
| D12 | Dispositivi  | **PC + tablet + telefono**: layout adattivo, doppio comando quantità, tastiera completa su desktop    |

**→ La Fase 1 (setup e infrastruttura) è sbloccata e può partire.**

## ⏳ Ancora in attesa

- I **PDF dei listini reali** → `tests/fixtures/listini/`.
  Bloccano la **Fase 2**: se contengono prezzi a scaglioni (D7) lo schema del
  database cambia, e rifarlo dopo significa migrare dati.
- **Chiave DeepSeek e tetto di spesa** (D11) → serve alla Fase 8.
- D6, D7, D8 → le risolve il report appena arrivano i PDF.

---

## Cosa serve da te, in ordine di importanza

### 1. 🔴 I PDF dei listini — sblocca metà del progetto

Mettili in `tests/fixtures/listini/` (bastano 3, meglio 5, di fornitori
diversi: uno semplice, uno complesso, uno mal formattato, e se esiste uno
scansionato). Poi:

```bash
cd /var/www/gelateria-guido && python3 scripts/analizza-listino.py tests/fixtures/listini
```

Da soli rispondono a D6, D7, D8 e dicono se serve l'OCR. Senza, la Fase 7
(estrazione PDF) si progetta su ipotesi e va riscritta.

### 2. Chiave DeepSeek e tetto di spesa (D11)

Serve alla Fase 8, non prima — ma prenderla ora evita di fermarsi a metà.
Ordine di grandezza previsto: pochi euro al mese.

---

## Domande che puoi girare al titolare della gelateria

Non bloccano l'inizio, ma le risposte migliorano il modello dati e alcune
possono emergere anche dai PDF:

- I prezzi di listino sono **al netto o al lordo** dell'IVA? Cambia da
  fornitore a fornitore?
- Esistono **sconti contrattuali** che non compaiono sul listino (a fine anno,
  per volume, fuori fattura)?
- Qualche fornitore fa **prezzi a scaglioni** per quantità?
- Ci sono prodotti a **peso variabile** (torte, sfusi) venduti a pezzo ma
  fatturati a peso?
- **Ogni quanto** arrivano i listini nuovi? (dà la misura di quanto peserà la
  revisione)
- L'Excel dell'ordine **a chi va**: uso interno o si manda al fornitore?
- Quanti **fornitori** e quanti **prodotti** circa? (dimensiona ricerca e liste)
- Oggi come si fa l'ordine? (capire cosa si sta sostituendo è il modo migliore
  per non peggiorarlo)

---

## Criteri di completamento della fase

- [x] strumento di triage funzionante e provato
- [x] cartella fixtures pronta con istruzioni
- [x] vincoli del server verificati e messi per iscritto
- [x] D1, D2, D3, D4, D5, D12 decise e scritte in [DECISIONI.md](DECISIONI.md)
- [ ] ≥3 PDF reali in `tests/fixtures/listini/`
- [ ] `REPORT.md` generato e letto
- [ ] D6, D7, D8 risolte dal report (o confermate a voce)
- [ ] D11: chiave DeepSeek e tetto di spesa
- [ ] elenco delle forme di confezione/unità osservate → test-set di Fase 2

La Fase 1 non aspetta questi punti: si può iniziare. Il primo vero blocco è la
**Fase 2**, che ha bisogno della risposta su D7 (scaglioni) prima di fissare lo
schema.
