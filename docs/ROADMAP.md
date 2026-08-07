# Gelateria Guido — Roadmap di sviluppo

> Guida operativa per fasi. Il contesto tecnico (architettura, modello dati,
> strategie) sta in [ANALISI.md](ANALISI.md). Le domande aperte in
> [DECISIONI.md](DECISIONI.md).

---

## Principio di ordinamento

Le fasi seguono tre criteri, in ordine di priorità:

1. **Prima il fondamentale, poi il rischioso, poi il comodo.** Il modulo unità
   di misura e lo storico prezzi vengono prima dell'IA, perché tutto il resto
   ci si appoggia sopra e riscriverli dopo significherebbe migrare dati.
2. **L'app deve essere utile prima di essere completa.** Alla fine della Fase 6
   è già possibile inserire fornitori, prodotti e prezzi a mano e vedere lo
   storico. Se l'import PDF si rivelasse più duro del previsto, l'app funziona
   comunque.
3. **Il rischio si affronta presto, non tardi.** L'import PDF e l'abbinamento
   (Fasi 7–10) sono le parti che possono sorprendere: arrivano appena le
   fondamenta reggono, non alla fine.

**Confine MVP:** fine Fase 16. Le Fasi 17–19 sono miglioramenti da fare a
sistema già in uso, con dati veri e feedback reale.

**Fasi parallelizzabili:** 4 e 5 (fornitori e catalogo) sono indipendenti;
16 (Excel) può procedere in parallelo a 15; 17 dipende solo dai dati di 15.

**Ordine di grandezza dello sforzo** (sessioni di lavoro, non giorni di
calendario): Fasi 0–3 ≈ 2–3 · Fasi 4–6 ≈ 3–4 · Fasi 7–10 ≈ 6–9 (la parte
grossa) · Fasi 11–16 ≈ 6–8 · Fasi 17–19 ≈ 4–5.

---

# FASE 0 — Decisioni e materiale

**Obiettivo.** Eliminare le incognite che, se scoperte tardi, costringerebbero
a riscrivere.

**Cosa fare**

- Chiudere le decisioni D1–D14 di [DECISIONI.md](DECISIONI.md).
- **Raccogliere 3–5 PDF di listini reali** di fornitori diversi (uno semplice,
  uno complesso, uno mal formattato).
- Analizzarli a mano rispondendo a: ci sono scaglioni di prezzo? l'IVA è
  inclusa o esclusa? esistono prodotti a peso variabile? le confezioni come
  sono scritte? c'è un codice prodotto stabile? ci sono immagini?
- Estrarre il vocabolario reale delle unità e delle confezioni (diventerà il
  test-set del parser).
- Verificare `pdftotext -layout` su ognuno e giudicare la qualità del testo.

**Tabelle** — nessuna.
**API** — nessuna.
**Frontend** — nessuno.

**Problemi da considerare.** Se anche un solo listino è scansionato, la
questione OCR va decisa ora e non a Fase 7. Se compaiono scaglioni di prezzo,
lo schema della Fase 2 cambia (serve `price_tier`).

**Completata quando**

- [ ] D1–D14 hanno una risposta scritta in DECISIONI.md
- [ ] esistono ≥3 PDF reali in `tests/fixtures/`
- [ ] per ogni PDF è annotato l'esito di `pdftotext -layout` (utilizzabile sì/no)
- [ ] è scritto un elenco delle forme di confezione/unità osservate

---

# FASE 1 — Setup progetto e infrastruttura

**Obiettivo.** Un'app vuota ma **deployata e raggiungibile**, con il ciclo
sviluppo→deploy funzionante fin dal primo giorno.

**Cosa sviluppare**

- `pnpm init`, TypeScript strict, Next 16 + React 19, Tailwind 4, zod, Prisma 7.
- `next.config.mjs` con `basePath` da env; ESLint + Prettier.
- Database Postgres `gelateria_guido` + ruolo dedicato; estensioni `pg_trgm`,
  `unaccent`, `pgcrypto`.
- `.env.example` completo; `.gitignore` (esclude `storage/`, `.env`).
- `gelateria.service` su porta 3030; blocco nginx; `scripts/deploy.sh`;
  `scripts/backup-db.sh` + cron giornaliero.
- Pagina di prova "ciao" raggiungibile in HTTPS.
- Repository git inizializzato con primo commit.

**Tabelle** — nessuna (solo il database vuoto).
**API** — nessuna.
**Frontend** — layout radice, pagina placeholder.

**Problemi da considerare.** Collisione URL (D1). `basePath` va gestito
correttamente anche negli asset e nelle chiamate fetch. Verificare che il
riavvio del servizio non disturbi gli altri servizi Node del VPS.

**Completata quando**

- [ ] `https://filippo.eventoyou.com/gelateria` risponde
- [ ] `systemctl status gelateria` attivo, riavvio automatico verificato
- [ ] `deploy.sh` esegue un ciclo completo senza intervento manuale
- [ ] `psql` si connette con l'utente dell'app; le estensioni sono create
- [ ] il dump di backup produce un file ripristinabile

---

# FASE 2 — Modello dati e nucleo deterministico

**Obiettivo.** Lo schema completo e — soprattutto — il modulo unità/prezzi
corretto e testato. È la fase su cui poggia tutto il resto.

**Cosa sviluppare**

- `schema.prisma` con **tutte** le entità di ANALISI §3 (anche quelle usate
  più avanti: fare le migrazioni in blocco ora costa meno che 8 migrazioni
  incrementali con dati dentro).
- Migrazione iniziale + `seed.ts` (organizzazione, utente, impostazioni,
  2 fornitori e ~20 prodotti finti per poter lavorare).
- Indici: trigram su `product.normalized_name` e `product_alias.normalized_text`;
  `(supplier_id, supplier_code)`; `(supplier_product_id, valid_to)`;
  `(organization_id)` ovunque.
- **`server/domain/packaging/`**: parser di unità e confezioni, conversioni,
  normalizzazione testo, `fingerprint()`.
- **`server/domain/pricing/`**: `unitPrice()`, `variation()`, `priceAt(date)`.
- Suite di test sul vocabolario raccolto in Fase 0.

**Tabelle** — tutte.
**API** — nessuna.
**Frontend** — nessuno.

**Problemi da considerare.** `Decimal` ovunque, mai `float`. Se la Fase 0 ha
rivelato scaglioni di prezzo, aggiungere `price_tier` ora. Le enum vanno
scelte con cura: cambiarle dopo, con dati in produzione, è fastidioso.

**Completata quando**

- [ ] `prisma migrate deploy` va a buon fine da zero
- [ ] il seed popola un database usabile
- [ ] il parser supera ≥95% dei casi raccolti in Fase 0, con i falliti elencati
- [ ] `unitPrice()` risolve correttamente il caso 12×33cl a €9 vs 24×33cl a €16
- [ ] i test del dominio girano senza database e senza rete

---

# FASE 3 — Autenticazione e guscio applicativo

**Obiettivo.** Entrare nell'app e muoversi fra sezioni vuote ma reali.

**Cosa sviluppare**

- Login email/password (argon2), sessione su cookie httpOnly, logout.
- Middleware di protezione delle rotte; helper `getCurrentUser()` e scope
  `organization_id` centralizzato nei repository (mai a mano nelle query).
- Layout applicativo: navigazione laterale/superiore, breadcrumb, toast,
  gestione errori, stati di caricamento.
- Componenti UI di base (bottone, input, tabella, dialog, badge, stepper).
- Pagina impostazioni minima (IVA di default, soglie avviso).

**Tabelle** — `user`, `organization`, `setting`.
**API** — `POST /api/auth/login`, `POST /api/auth/logout`.
**Frontend** — schermate 17, 20 (parziale) + guscio.

**Problemi da considerare.** Il costo di argon2 va tarato. Cookie `secure` +
`sameSite=lax`. Lo scope multi-tenant va imposto in un punto solo, altrimenti
prima o poi qualcuno scrive una query senza filtro.

**Completata quando**

- [ ] login/logout funzionano, la sessione sopravvive al riavvio del servizio
- [ ] una rotta protetta senza sessione reindirizza al login
- [ ] i componenti UI di base sono usati almeno una volta ciascuno
- [ ] nessuna query di dominio può essere scritta senza `organization_id`

---

# FASE 4 — Gestione fornitori

**Obiettivo.** Anagrafica fornitori completa. Prima cosa realmente usabile.

**Cosa sviluppare**

- CRUD fornitore con validazione zod condivisa client/server.
- Lista con ricerca, ordinamento, stato attivo/inattivo.
- Scheda fornitore con i tab già predisposti (listini/prodotti/prezzi/ordini
  inizialmente vuoti).
- Campi importanti da non dimenticare: `prices_include_vat`,
  `default_vat_rate`, `min_order_value`, `delivery_days`.

**Tabelle** — `supplier` (+ `supplier_contact` se serve).
**API** — `GET/POST /api/suppliers`, `GET/PATCH/DELETE /api/suppliers/[id]`.
**Frontend** — schermate 7, 8.

**Problemi da considerare.** Un fornitore non si cancella se ha listini o
ordini: si disattiva. `prices_include_vat` va spiegato bene nella UI perché è
sottile e decisivo.

**Completata quando**

- [ ] si crea, modifica, disattiva un fornitore
- [ ] la scheda mostra i tab (vuoti) senza errori
- [ ] la cancellazione di un fornitore con dati collegati è impedita con
      messaggio comprensibile

---

# FASE 5 — Catalogo prodotti (manuale)

**Obiettivo.** Prodotti normalizzati e prodotti fornitore gestibili a mano,
con ricerca veloce. Rende l'app utile **prima** dell'import PDF e fornisce il
terreno su cui l'import atterrerà.

**Cosa sviluppare**

- CRUD `product` (normalizzato) e `supplier_product`, con collegamento
  manuale fra i due.
- Calcolo automatico di `content_per_pack`, `base_unit`, `fingerprint` alla
  scrittura (dal modulo della Fase 2).
- **Ricerca**: `pg_trgm` + `unaccent` su nome normalizzato, alias e codice
  fornitore; risposta sotto i 100 ms su ~5.000 prodotti.
- Gestione alias manuale.
- Scheda prodotto con l'elenco delle offerte per fornitore.

**Tabelle** — `product`, `supplier_product`, `product_alias`.
**API** — `GET/POST /api/products`, `GET/PATCH /api/products/[id]`,
`GET /api/products/search?q=`, `POST /api/products/[id]/aliases`,
`GET/POST/PATCH /api/supplier-products`.
**Frontend** — schermate 13, 14 (parziale).

**Problemi da considerare.** La ricerca è il cuore della schermata ordine:
va costruita bene ora, con indice GIN trigram e query misurata, non
"sistemata dopo". Va decisa la strategia se il termine cercato è corto (<3
caratteri: prefisso invece di trigram).

**Completata quando**

- [ ] si crea un prodotto normalizzato e vi si collegano 2+ offerte fornitore
- [ ] cercando "birra" compaiono i prodotti giusti in <100 ms su dati di prova
      realistici (≥5.000 righe generate)
- [ ] `content_per_pack` e `base_unit` sono calcolati e corretti
- [ ] la ricerca ignora accenti, maiuscole e punteggiatura

---

# FASE 6 — Storico prezzi

**Obiettivo.** Il meccanismo append-only funzionante e visibile, alimentato a
mano. Quando arriverà l'import, dovrà solo chiamare queste funzioni.

**Cosa sviluppare**

- Servizio `setPrice(supplierProductId, price, validFrom, source, priceListId?)`:
  chiude il precedente, inserisce il nuovo, aggiorna `current_price_id`,
  calcola `unit_price`. Idempotente se il prezzo non cambia.
- Query: prezzo corrente, prezzo alla data, serie storica, variazioni assolute
  e percentuali su finestre.
- UI: tabella storico + grafico nella scheda prodotto, con frecce e colori
  su aumenti/diminuzioni.
- Inserimento e correzione manuale di un prezzo.

**Tabelle** — `supplier_product_price`.
**API** — `GET /api/supplier-products/[id]/prices`,
`POST /api/supplier-products/[id]/prices`.
**Frontend** — schermata 14 (completa).

**Problemi da considerare.** Prezzo retroattivo (inserito con `valid_from`
passato) → va inserito in mezzo alla catena senza romperla. Due prezzi con la
stessa `valid_from` → vince l'ultimo scritto e il precedente si annulla.
Fuso orario: usare `date`, non `timestamp`, per la validità.

**Completata quando**

- [ ] inserendo tre prezzi in sequenza si ottiene la catena 01/05 €9,50 →
      01/06 €9,80 → 01/07 €10,20 con variazioni corrette
- [ ] `priceAt('2026-06-15')` restituisce €9,80
- [ ] inserire lo stesso prezzo due volte non crea una riga in più
- [ ] il grafico mostra la serie correttamente

---

# FASE 7 — Estrazione PDF deterministica (senza IA)

**Obiettivo.** Dal PDF alle righe grezze, **senza una singola chiamata LLM**.
Separare questa fase dall'IA è ciò che permetterà di capire, in caso di
problemi, se la colpa è dell'estrazione o del modello.

**Cosa sviluppare**

- Upload PDF (drag&drop), calcolo sha256, deduplica, salvataggio in `storage/`.
- `import/pdf/extract-text.ts`: `pdftotext -layout` e `-bbox-layout`,
  rilevamento PDF senza testo (→ errore esplicito "scansionato").
- `import/pdf/segment.ts`: rimozione intestazioni/piè ripetuti, individuazione
  colonne dalle coordinate x, riconoscimento righe-prodotto vs righe-sezione,
  propagazione della categoria dalle righe di sezione.
- `import_job` + runner con checkpoint e avanzamento.
- Schermata: caricamento → avanzamento → **elenco righe grezze** con testo
  originale e celle individuate, per ispezione.

**Tabelle** — `price_list`, `price_list_row`, `import_job`.
**API** — `POST /api/price-lists` (upload),
`GET /api/price-lists/[id]`, `GET /api/price-lists/[id]/job`,
`GET /api/price-lists/[id]/rows`, `POST /api/price-lists/[id]/cancel`.
**Frontend** — schermate 9, 10 + vista righe grezze.

**Problemi da considerare.** `client_max_body_size` in nginx. Timeout upload.
PDF con più tabelle per pagina, o con colonne che si spostano fra le pagine.
Righe che vanno a capo (un prodotto su due righe fisiche) — è il caso più
insidioso e va gestito qui, non con l'IA. Il job deve poter essere annullato
e ripreso.

**Completata quando**

- [ ] i PDF della Fase 0 si caricano e producono righe grezze
- [ ] la copertura riga per riga è ≥90% su ciascun PDF di prova (righe di
      prodotto individuate / righe di prodotto reali, contate a mano)
- [ ] un PDF scansionato produce un errore chiaro, non un crash
- [ ] ricaricare lo stesso file viene rifiutato con messaggio
- [ ] il job sopravvive a un riavvio del servizio e riprende

---

# FASE 8 — Provider IA e strutturazione delle righe

**Obiettivo.** Dalle righe grezze ai campi strutturati, con l'IA incapsulata
dietro un'interfaccia e con il **profilo per fornitore** che la rende
progressivamente superflua.

**Cosa sviluppare**

- `server/ai/provider.ts` (interfaccia) + `deepseek.ts` + `mock.ts`
  (+ `claude.ts` se serve un secondo parere).
- Schemi zod di input/output; prompt versionati in `ai/prompts/`.
- `ai/cache.ts` (chiave = provider + versione prompt + input normalizzato) e
  `ai/usage.ts` (token, costo, latenza → `ai_call`), con budget e stop.
- `inferProfile()`: da un campione di righe → mappatura colonne →
  `supplier_import_profile`.
- `applyProfile()`: strutturazione **deterministica** con il profilo salvato.
- `extractRows()`: fallback IA a lotti di 6–10 per le righe residue, con
  seconda passata di revisione.
- `import/validate.ts`: zod + regole di business (prezzo > 0, entro N× la
  mediana di colonna, pack intero, unità nell'enum, variazione ±40% rispetto
  al prezzo precedente).
- Schermata righe con campi estratti, confidenza e errori di validazione.

**Tabelle** — `price_list_row` (campo `extracted`), `supplier_import_profile`,
`ai_call`, `ai_cache`.
**API** — `POST /api/price-lists/[id]/structure`,
`GET/PATCH /api/suppliers/[id]/import-profile`,
`GET /api/ai/usage`.
**Frontend** — vista righe strutturate; editor del profilo colonne.

**Problemi da considerare.** Risposte troncate (lotti piccoli). JSON malformato
(retry ×2, poi revisione manuale). Costo su listini lunghi (cache + profilo).
La chiave API vive **solo** nel processo server: mai nel frontend, mai nei log,
mai a database. Il prompt deve ricevere il testo originale intero della riga,
non una versione già interpretata.

**Completata quando**

- [ ] con `AI_MOCK=1` l'intera pipeline gira senza rete
- [ ] su un PDF reale ≥85% delle righe è strutturato correttamente al primo giro
- [ ] il secondo import dello stesso fornitore usa il profilo e riduce le
      chiamate LLM di ≥80%
- [ ] ogni chiamata è tracciata su `ai_call` con costo stimato
- [ ] superato il budget, il job si ferma e lo comunica
- [ ] cambiare `AI_PROVIDER` non richiede modifiche al codice

---

# FASE 9 — Abbinamento e normalizzazione

**Obiettivo.** Da riga strutturata a `supplier_product` + proposta di `product`
canonico, con la cascata di ANALISI §5.

**Cosa sviluppare**

- `domain/matching/candidates.ts`: generazione candidati (GTIN → codice →
  alias → trigram con filtro formato).
- `domain/matching/score.ts`: punteggio combinato (trigram + overlap token +
  compatibilità formato).
- `domain/matching/decide.ts`: soglie e stato risultante (AUTO / PENDING / NEW).
- `ai/provider.matchProducts()`: arbitrato sulla zona grigia, a lotti.
- Scrittura di `product_match_candidate`; identificazione del `supplier_product`
  esistente (codice o fingerprint).
- Schermata **"Da abbinare"** con candidati proposti, azioni rapide
  (conferma / scegli altro / crea nuovo / ignora) e **scrittura degli alias**.

**Tabelle** — `product_match_candidate`, `supplier_product`, `product`,
`product_alias`.
**API** — `POST /api/price-lists/[id]/match`,
`GET /api/matching/pending`,
`POST /api/matching/[candidateId]/decide`,
`POST /api/supplier-products/[id]/detach`.
**Frontend** — schermata 15.

**Problemi da considerare.** Il filtro sul formato è obbligatorio: senza,
33 cl e 66 cl si fondono. Le soglie vanno tarate sui dati veri e messe in
`setting`, non nel codice. L'arbitrato IA non deve mai decidere da solo sotto
confidenza 0,85. Serve poter annullare un abbinamento e impedire che venga
riproposto.

**Completata quando**

- [ ] i tre esempi della specifica ("Birra XYZ 33cl x12", "XYZ Birra cl.33
      conf. 12pz", "Birra XYZ bottiglia 0,33L 12 pezzi") si abbinano allo
      stesso `product`
- [ ] 33 cl e 66 cl **non** si abbinano mai fra loro
- [ ] confermare un abbinamento crea l'alias, e al secondo import quel prodotto
      si abbina senza chiamate IA (verificato su `ai_call`)
- [ ] un abbinamento si può annullare e non viene riproposto

---

# FASE 10 — Revisione e applicazione dell'import

**Obiettivo.** La schermata intermedia del punto 16 e la transazione che porta
i dati dallo staging al dominio. **È la fase che protegge l'integrità di tutto
il sistema.**

> **Sulla domanda "è tecnicamente consigliata?": sì, senza dubbio.** Tre
> ragioni. (a) L'estrazione da PDF eterogenei non sarà mai al 100%, e un
> prezzo sbagliato che entra in silenzio corrompe storico, confronti e ordini
> in modo invisibile finché non si ordina male. (b) Lo staging dà gratis
> idempotenza, riprocessabilità e annullamento. (c) Ogni correzione umana
> diventa un alias o un profilo, cioè riduce il lavoro futuro: la revisione non
> è un costo ricorrente, è un investimento decrescente. Il costo aggiuntivo è
> una tabella (già prevista) e una schermata. Per non renderla pesante:
> conferma in blocco di tutti i ✓ con un click, e attenzione richiesta solo su
> ⚠ e ✕.

**Cosa sviluppare**

- Schermata di revisione: intestazione con i conteggi
  (`✓ riconosciuti · ⚠ dubbi · + nuovi · ✕ non interpretati · ⚠ variazioni
anomale`), tabella filtrabile per stato, modifica inline di ogni campo,
  conferma in blocco, esclusione righe.
- `import/apply.ts`, **una sola transazione**: crea i nuovi
  `supplier_product`; per ogni prezzo cambiato chiude il precedente e inserisce
  il nuovo; marca `active=false` i prodotti spariti; scrive gli alias
  confermati; consolida il `supplier_import_profile`; ricalcola
  `product_best_offer` per i prodotti toccati; `price_list → APPLIED`.
- Riepilogo import: nuovi, aggiornati, aumentati, diminuiti, invariati,
  spariti — con le variazioni percentuali.
- **Annullamento di un import applicato** (rollback per `price_list_id`).
- Rilevamento "prodotto sparito + prodotto nuovo molto simile" → proposta
  "ha cambiato codice?".

**Tabelle** — tutte quelle dell'import + `supplier_product_price`,
`product_best_offer`.
**API** — `PATCH /api/price-lists/[id]/rows/[rowId]`,
`POST /api/price-lists/[id]/apply`,
`POST /api/price-lists/[id]/revert`,
`GET /api/price-lists/[id]/summary`.
**Frontend** — schermate 11, 12.

**Problemi da considerare.** La transazione su 500 righe deve stare dentro i
limiti (usare `createMany` a lotti dentro la stessa transazione). Lock sul
fornitore per evitare due apply concorrenti. Il rollback deve riaprire
correttamente i `valid_to` dei prezzi precedenti. Una riga esclusa non deve
far sparire il prodotto ("non l'ho importata" ≠ "non c'è più nel listino").

**Completata quando**

- [ ] un import reale arriva fino a `APPLIED` passando dalla revisione
- [ ] i prezzi finiscono nello storico senza perdere i precedenti
- [ ] i prodotti spariti risultano `active=false` e compaiono nel riepilogo
- [ ] `revert` riporta il database esattamente allo stato precedente
      (verificato con confronto)
- [ ] importare due volte lo stesso listino non duplica né altera nulla
- [ ] il secondo listino dello stesso fornitore richiede sensibilmente meno
      interventi manuali del primo

---

# FASE 11 — Confronto prezzi e miglior offerta

**Obiettivo.** Sapere, per ogni prodotto, dove conviene comprarlo. Tutto
deterministico.

**Cosa sviluppare**

- `domain/pricing/comparison.ts`: miglior offerta per prodotto con esclusione
  di inattivi, prezzi scaduti e unità non confrontabili.
- Ricalcolo di `product_best_offer` (incrementale dopo l'apply, e comando
  completo per il ricalcolo totale).
- Pagina **"Prodotti convenienti"**: tabella `Prodotto | Miglior fornitore |
Prezzo | €/unità | Alternativa | Prezzo | Δ | Risparmio`, ordinabile,
  ordinata di default per risparmio potenziale.
- Blocco "offerte" nella scheda prodotto con evidenza del migliore e €/unità.
- Impostazioni: soglie dell'avviso (%, € minimo), età massima di un prezzo.

**Tabelle** — `product_best_offer`, `setting`.
**API** — `GET /api/products/[id]/offers`,
`GET /api/reports/convenient`,
`POST /api/admin/recompute-best-offers`.
**Frontend** — schermate 16, 14 (blocco offerte).

**Problemi da considerare.** Prodotti con una sola offerta: nessun confronto,
vanno segnalati ("nessun confronto disponibile") perché sono un'informazione
utile, non un vuoto. Prezzi vecchi: meglio dichiararli stantii che usarli come
se fossero attuali. Il "risparmio annuo stimato" richiede lo storico ordini
(Fase 15): fino ad allora si mostra solo il risparmio unitario.

**Completata quando**

- [ ] per un prodotto con 3 offerte il migliore è corretto anche a confezioni
      diverse (verifica con il caso 12/24)
- [ ] la pagina convenienti è ordinata per impatto e filtrabile
- [ ] i prodotti non confrontabili sono elencati a parte, non fusi coi confronti
- [ ] il ricalcolo su tutto il catalogo resta sotto qualche secondo

---

# FASE 12 — Creazione ordine

**Obiettivo.** La schermata principale. Deve essere veloce fino a sembrare
banale.

**Cosa sviluppare**

- Barra di ricerca grande, con focus automatico, debounce ~150 ms, ricerca
  server-side, navigazione da tastiera (frecce + invio per aggiungere).
- Risultati: lista densa (default) o griglia con foto; ogni riga mostra nome,
  formato, confezione, prezzo, €/unità, fornitore, badge "miglior prezzo".
- Controllo quantità `[-] N [+]` **e** campo numerico digitabile; aggiunta
  ottimistica (nessuna attesa percepita).
- Ordine `DRAFT` persistente per utente; aggiunta/modifica/rimozione riga.
- **Barra inferiore / drawer** sempre visibile: "12 prodotti · 37 confezioni ·
  €423,50" + "GUARDA RIEPILOGO ORDINE"; apribile per vedere e modificare le
  righe senza lasciare la ricerca.
- Filtri rapidi: solo miglior prezzo, per fornitore, per categoria,
  "già ordinati di recente".

**Tabelle** — `order`, `order_line`.
**API** — `GET /api/products/search?q=`,
`GET /api/orders/current`,
`POST /api/orders/current/lines`,
`PATCH /api/orders/current/lines/[id]`,
`DELETE /api/orders/current/lines/[id]`.
**Frontend** — schermate 1, 2.

**Problemi da considerare.** Latenza percepita: aggiornamento ottimistico con
rollback in caso di errore. Doppio click / doppio invio non deve creare due
righe. La ricerca deve trovare anche per codice fornitore e per alias. Su
tablet i bersagli devono essere grandi. Un prodotto senza prezzo corrente non
deve essere ordinabile (o va segnalato chiaramente).

**Completata quando**

- [ ] da ricerca ad "aggiunto all'ordine" servono ≤2 interazioni
- [ ] l'ordine sopravvive a refresh, chiusura e cambio dispositivo
- [ ] i totali della barra sono sempre coerenti con le righe
- [ ] tutto è utilizzabile con la sola tastiera
- [ ] provata su tablet: nessun bersaglio troppo piccolo

---

# FASE 13 — Avviso prezzo migliore

**Obiettivo.** Informare senza infastidire (punto 8).

**Cosa sviluppare**

- Al momento dell'aggiunta: confronto con `product_best_offer`; avviso solo se
  superate **entrambe** le soglie (default ≥3% e ≥0,30 €/confezione).
- Messaggio: _"Disponibile a €9,80 da Fornitore B. Risparmieresti €0,70 a
  confezione (€2,80 su 4 confezioni)."_
- Pulsante **"USA FORNITORE PIÙ CONVENIENTE"**: sostituisce la riga; se la
  confezione è diversa, ricalcola le confezioni equivalenti, arrotonda e
  **dichiara esplicitamente cosa cambia** ("4×12 = 48 pz → 2×24 = 48 pz").
- Avviso non bloccante e ricordabile ("non avvisarmi più per questo prodotto",
  registrato con `override_reason`).
- Riepilogo del risparmio potenziale complessivo dell'ordine.

**Tabelle** — `order_line` (`best_alternative_snapshot`, `override_reason`),
`setting`.
**API** — `GET /api/products/[id]/best-offer`,
`POST /api/orders/current/lines/[id]/switch-supplier`.
**Frontend** — banner/tooltip nella schermata 1 e nel drawer.

**Problemi da considerare.** Troppi avvisi = avvisi ignorati: le soglie sono la
funzionalità. Lo swap fra confezioni diverse è la parte in cui è facile
sbagliare le quantità: va mostrato, non fatto in silenzio. L'avviso non deve
mai rallentare l'aggiunta (si calcola dopo, non prima).

**Completata quando**

- [ ] l'esempio della specifica (€10,50 vs €9,80) produce l'avviso corretto
- [ ] sotto soglia non compare alcun avviso
- [ ] lo swap fra 12 e 24 pezzi mantiene i pezzi totali e lo dichiara
- [ ] si può ignorare l'avviso e completare l'ordine col fornitore più caro

---

# FASE 14 — Riepilogo e conferma ordine

**Obiettivo.** Vedere tutto con chiarezza e congelarlo.

**Cosa sviluppare**

- Riepilogo: righe con prodotto, quantità, formato, prezzo unitario, totale,
  fornitore, alternativa più economica; **subtotali per fornitore**; totale
  generale netto/IVA/lordo; risparmio potenziale complessivo.
- Segnalazioni: minimo d'ordine per fornitore non raggiunto; prodotti con
  prezzo non aggiornato; righe senza confronto.
- Modifica quantità e rimozione direttamente dal riepilogo.
- **Conferma**: transazione che scrive tutti gli snapshot su `order_line`,
  assegna il codice progressivo, imposta `CONFIRMED` e `confirmed_at`, genera
  l'Excel (Fase 16) e mostra l'esito.
- Note per l'ordine e per singola riga.

**Tabelle** — `order`, `order_line`.
**API** — `GET /api/orders/current/summary`,
`POST /api/orders/current/confirm`.
**Frontend** — schermate 3, 4.

**Problemi da considerare.** Idempotenza della conferma (doppio click →
un ordine solo). Se un prezzo cambia fra l'aggiunta e la conferma, si usa
quello del momento della conferma e **lo si segnala** prima di confermare.
Un ordine confermato non è più modificabile (solo annullabile).

**Completata quando**

- [ ] i subtotali per fornitore e il totale generale sono corretti, IVA inclusa
- [ ] confermando, tutti gli snapshot sono salvati e leggibili senza il catalogo
- [ ] doppio invio non crea due ordini
- [ ] il codice ordine è progressivo e non ha buchi né duplicati

---

# FASE 15 — Storico ordini

**Obiettivo.** Ritrovare e riusare quello che si è ordinato.

**Cosa sviluppare**

- Lista ordini: data, codice, stato, totale, n° prodotti, fornitori coinvolti;
  filtri per periodo, fornitore, stato; ricerca per prodotto contenuto.
- Dettaglio ordine congelato (tutto dagli snapshot).
- **"Riordina"**: duplica in un nuovo `DRAFT` ai prezzi correnti, evidenziando
  cosa è cambiato di prezzo e cosa non è più disponibile.
- Annullamento ordine; stati successivi (`SENT`, `RECEIVED`) se utili.
- Riscarica dell'Excel già generato.

**Tabelle** — `order`, `order_line`, `order_export`.
**API** — `GET /api/orders`, `GET /api/orders/[id]`,
`POST /api/orders/[id]/reorder`, `POST /api/orders/[id]/cancel`.
**Frontend** — schermate 5, 6.

**Problemi da considerare.** Il dettaglio non deve leggere il catalogo attuale,
solo gli snapshot. "Riordina" deve gestire con eleganza i prodotti nel
frattempo spariti. Paginazione fin da subito.

**Completata quando**

- [ ] un ordine di sei mesi fa si apre e mostra i prezzi di allora, anche se
      nel frattempo prodotti e fornitori sono cambiati
- [ ] "riordina" crea una bozza corretta e segnala le differenze di prezzo
- [ ] i filtri funzionano su un volume realistico

---

# FASE 16 — Export Excel _(fine MVP)_

**Obiettivo.** Un file Excel per ogni ordine, con il generatore isolato in modo
che cambiarne il formato non tocchi nient'altro.

**Cosa sviluppare**

- `server/export/excel/`: interfaccia `OrderExportTemplate` con
  `key`, `label`, `build(order): Buffer`; registro dei template; default
  "standard" (una riga per prodotto, raggruppata per fornitore, con totali).
- Variante "un foglio per fornitore" (è il formato che serve davvero se
  l'Excel va mandato ai fornitori).
- Salvataggio in `storage/exports/` + riga in `order_export` per il
  ri-download identico.
- Rigenerazione con un template diverso.

**Tabelle** — `order_export`.
**API** — `POST /api/orders/[id]/export` (con `template_key`),
`GET /api/orders/[id]/export/[exportId]`.
**Frontend** — pulsanti in schermata 4 e 6; scelta template se >1.

**Problemi da considerare.** Il formato definitivo non è ancora definito (D9):
per questo il modulo è a template e il primo è dichiaratamente provvisorio.
Numeri come numeri (non testo), decimali con la virgola in locale italiano,
larghezze colonne, intestazione con dati fornitore e data.

**Completata quando**

- [ ] ogni ordine confermato genera un `.xlsx` apribile senza avvisi
- [ ] il file si riscarica identico dallo storico
- [ ] aggiungere un template nuovo non richiede modifiche fuori da
      `server/export/excel/`
- [ ] i totali del file coincidono al centesimo con quelli dell'app

> **✅ Fine MVP.** A questo punto l'app copre i punti 1–12 della specifica ed è
> utilizzabile in produzione tutti i giorni. Da qui in avanti si lavora con
> dati veri e feedback reale, che è il momento giusto per decidere il resto.

---

# FASE 17 — Statistiche prodotto

**Obiettivo.** Il punto 13 della specifica.

**Cosa sviluppare**

- Aggregazioni su `order_line` (confermati): confezioni ordinate, pezzi totali,
  spesa, numero di ordini, frequenza media, ultimo acquisto, **prezzo medio
  effettivamente pagato** (media pesata sulle quantità, non sui listini),
  confronto con il prezzo attuale e variazione.
- Finestre temporali (30/90/180/365 giorni).
- Blocco statistiche nella scheda prodotto + grafico spesa/prezzo nel tempo.
- Completamento del "risparmio annuo stimato" in Fase 11, ora che i consumi
  reali esistono.

**Tabelle** — `order_line`, `order`, `supplier_product_price`.
**API** — `GET /api/products/[id]/stats?period=`.
**Frontend** — schermata 19 (dentro la 14).

**Problemi da considerare.** Prezzo medio pagato ≠ media dei prezzi di listino.
Attenzione alle performance su storici lunghi: se serve, tabella di aggregazione
mensile. Prodotti abbinati dopo l'ordine: le statistiche vanno calcolate
risalendo da `supplier_product` a `product`.

**Completata quando**

- [ ] l'esempio della specifica è riproducibile (48 conf., €450, media €9,37,
      attuale €10,20, +8,8%)
- [ ] i periodi funzionano e le somme tornano con lo storico ordini

---

# FASE 18 — Dashboard

**Obiettivo.** Il punto 14: la fotografia d'insieme.

**Cosa sviluppare**

- Spesa mensile (ultimi 12 mesi); prodotti più acquistati; maggiori aumenti di
  prezzo; **risparmio potenziale scegliendo sempre il migliore**; fornitori
  più utilizzati; ultimi listini caricati; prodotti senza confronto; prodotti
  spariti dai listini.
- Query aggregate cachate (i dati cambiano solo agli import e alle conferme).

**Tabelle** — tutte, in lettura.
**API** — `GET /api/dashboard`.
**Frontend** — schermata 18.

**Problemi da considerare.** Una dashboard costruita prima di avere dati veri è
un esercizio di stile: per questo sta qui e non in Fase 1. Ogni numero deve
essere cliccabile e portare al dettaglio, altrimenti è decorazione.

**Completata quando**

- [ ] ogni riquadro mostra dati veri e porta alla schermata di dettaglio
- [ ] la pagina si carica sotto il secondo

---

# FASE 19 — Consolidamento

**Obiettivo.** Rendere il sistema sostenibile nel tempo e pronto ad altre
attività.

**Cosa sviluppare**

- Ruoli applicati davvero (OWNER/MANAGER/OPERATOR) e gestione utenti.
- Attivazione piena del multi-tenant (selezione organizzazione, verifica che
  nessuna query sfugga allo scope; eventualmente RLS Postgres).
- `audit_log` sulle operazioni sensibili (apply, revert, conferma, modifica
  prezzo).
- Backup verificato con prova di ripristino; retention dei PDF.
- Monitoraggio: log strutturati, allarme se un job resta appeso, riepilogo
  costi IA.
- Ottimizzazioni su dati reali (indici, cache, paginazione).
- Documentazione d'uso per la gelateria.

**Completata quando**

- [ ] un ripristino da backup su database vuoto è stato provato davvero
- [ ] un utente OPERATOR non può fare ciò che non deve
- [ ] esiste un manuale d'uso di una pagina

---

# Idee fuori perimetro (da valutare quando l'app è in uso)

| Idea                                        | Quando ha senso                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| OCR per listini scansionati                 | se compaiono davvero (Fase 0 lo dirà)                                                |
| Invio ordine al fornitore via email/PDF     | quando l'Excel non basta più                                                         |
| Ricezione merce e controllo bolle vs ordine | è il naturale passo successivo: scopre gli errori di fatturazione                    |
| Giacenze e scorte minime                    | grande valore, ma è un progetto a sé                                                 |
| Import da Excel/CSV oltre al PDF            | economico da aggiungere, alcuni fornitori li mandano già                             |
| Embeddings (pgvector) per l'abbinamento     | solo se trigram + LLM si rivelassero insufficienti; richiede installare l'estensione |
| Suggerimenti d'ordine sui consumi storici   | dopo 6–12 mesi di dati veri                                                          |
| App mobile / PWA offline                    | se l'ordine si fa girando per il magazzino                                           |

---

# Riepilogo delle fasi

| Fase | Titolo                               | Dipende da | MVP |
| ---- | ------------------------------------ | ---------- | --- |
| 0    | Decisioni e materiale                | —          | ✅  |
| 1    | Setup e infrastruttura               | 0          | ✅  |
| 2    | Modello dati e nucleo deterministico | 0, 1       | ✅  |
| 3    | Autenticazione e guscio              | 1, 2       | ✅  |
| 4    | Fornitori                            | 3          | ✅  |
| 5    | Catalogo prodotti (manuale)          | 3          | ✅  |
| 6    | Storico prezzi                       | 5          | ✅  |
| 7    | Estrazione PDF deterministica        | 4, 5       | ✅  |
| 8    | Provider IA e strutturazione         | 7          | ✅  |
| 9    | Abbinamento e normalizzazione        | 8          | ✅  |
| 10   | Revisione e apply                    | 9, 6       | ✅  |
| 11   | Confronto prezzi e miglior offerta   | 6, 10      | ✅  |
| 12   | Creazione ordine                     | 5, 11      | ✅  |
| 13   | Avviso prezzo migliore               | 11, 12     | ✅  |
| 14   | Riepilogo e conferma                 | 12         | ✅  |
| 15   | Storico ordini                       | 14         | ✅  |
| 16   | Export Excel                         | 14         | ✅  |
| 17   | Statistiche prodotto                 | 15         | —   |
| 18   | Dashboard                            | 15, 17     | —   |
| 19   | Consolidamento                       | tutte      | —   |
