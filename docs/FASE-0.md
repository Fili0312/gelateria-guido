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

## ✅ Listini analizzati (2026-08-07)

Ricevuti 4 file da 3 fornitori. Report completo in `tests/fixtures/REPORT.md`.

| File | Esito |
| --- | --- |
| `29.04.26 listino BARZELLI.pdf` | 6 pagine, 145 righe prezzo, 8 colonne — testo estraibile ✅ |
| `Cecconi Listino prezzi al 28.02.25.pdf` | 9 pagine, 194 righe, 10 colonne — testo estraibile ✅ |
| `Cecconi Listino Vini e Spumanti al 26.03.25.pdf` | 2 pagine, 37 righe, 9 colonne — testo estraibile ✅ |
| `Listino prezzi AD Beverage dal 01.07.26.xls` | 485 articoli, **zero prezzi** → vedi D15 |

**Cosa hanno risposto:**

- **Niente OCR**: tutti i PDF hanno il livello di testo. `tesseract` non serve.
- **D7 — niente scaglioni**, ma **sconti a cascata** (fino a 5 livelli,
  moltiplicativi). Cambia `supplier_product_price`.
- **D6 — prezzi al netto**, aliquota IVA per riga.
- **D8 — nessuna foto di prodotto** su 331 articoli.
- **Nessun codice a barre reale**: il campo `EAN:` di Cecconi ripete il codice
  interno. Il riconoscimento poggia tutto su alias, trigram e IA.
- **Descrizioni su più righe** (Cecconi): il caso più insidioso della Fase 7,
  confermato presente nei dati veri.
- **Un fornitore = più listini parziali disgiunti**: Cecconi ne manda due con
  1 codice in comune su 220. I «prodotti spariti» vanno calcolati per copertura.
- **Pezzi per collo quasi mai dichiarati** (3%) → D17.

Dettagli e conseguenze sullo schema: [DECISIONI.md](DECISIONI.md) D6, D7, D8,
D15, D16, D17 · [ANALISI.md](ANALISI.md) §3.2, §3.4, §5.1, §5.2.

## ⏳ Ancora in attesa

- Risposte a **D15** (AD Beverage ha una versione con i prezzi?), **D16**
  (sconti contrattuali o per preventivo?), **D17** (pezzi per collo).
  Nessuna blocca la Fase 2: le raccomandazioni scritte in DECISIONI.md
  reggono anche senza risposta.
- **Chiave DeepSeek e tetto di spesa** (D11) → serve alla Fase 8.
- Listini di **altri fornitori**, quando arrivano: ogni fornitore nuovo è un
  layout nuovo, e più ne vediamo prima, meglio è tarato l'estrattore.

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
- [x] ≥3 PDF reali in `tests/fixtures/listini/` (3 PDF + 1 Excel, 3 fornitori)
- [x] `REPORT.md` generato e letto
- [x] D6, D7, D8 risolte
- [x] elenco delle forme di confezione/unità osservate → test-set di Fase 2
- [ ] D11: chiave DeepSeek e tetto di spesa (serve solo dalla Fase 8)

**✅ FASE 0 COMPLETATA.** La Fase 2 è sbloccata: si sa che non servono gli
scaglioni, che servono gli sconti a cascata e che i prezzi sono al netto.
