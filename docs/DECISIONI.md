# Decisioni da prendere prima di iniziare

> Ogni decisione ha una raccomandazione. Dove non serve un tuo intervento, si
> procede con la raccomandazione. Le decisioni marcate 🔴 **bloccano** la fase
> indicata: senza risposta si rischia di lavorare due volte.
> Stato: `APERTA` / `DECISA: <scelta>` — aggiorna qui man mano.

---

## 🔴 D0 — I PDF reali dei fornitori (blocca la Fase 7)

**Stato:** APERTA

Servono **3–5 listini veri**, di fornitori diversi, il più possibile
rappresentativi: uno pulito e tabellare, uno complesso (più colonne, sezioni,
sconti), uno mal formattato. Vanno messi in `tests/fixtures/listini/`.

Lo strumento che li analizza è già pronto:

```bash
cd /var/www/gelateria-guido && python3 scripts/analizza-listino.py tests/fixtures/listini
```

Produce `tests/fixtures/REPORT.md` e risponde da solo a **D6, D7, D8** e alla
domanda «serve l'OCR?».

Perché è la cosa più importante di tutte: l'estrattore PDF si progetta sui dati
reali, non sulle ipotesi. Con i PDF veri si può anche scrivere il test-set fin
dall'inizio e misurare i progressi in modo oggettivo ("su 412 righe reali ne
estraiamo correttamente 398"). Senza, la Fase 7 va riscritta due volte.

Da questi PDF si risponde automaticamente anche a D6, D7, D8 e in parte D14.

---

## ✅ D1 — URL della webapp

**Stato:** **DECISA (2026-08-07): `filippo.eventoyou.com/gelateria`** — opzione A.
I blocchi nginx esistenti di `/gelateria-guido/` e `/gelteria-guido/` restano
dove sono e non vengono toccati. La cartella del codice resta
`/var/www/gelateria-guido`. Porta interna 3030.

`/etc/nginx/sites-available/filippo` contiene **già** blocchi
`^~ /gelateria-guido/` (e il refuso `/gelteria-guido/`) che servono file
statici da `/var/www/gelateria-guido/dist/` — cartella che oggi **non esiste**
(erano predisposti per un sito vetrina mai pubblicato).

| Opzione                           | Conseguenze                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **A. `/gelateria` (consigliata)** | non tocca nulla di esistente, zero rischio, un blocco nuovo in nginx                                            |
| B. `/gelateria-guido`             | vanno rimossi i 6 blocchi statici esistenti; se un domani serve la vetrina, il percorso è occupato dalla webapp |
| C. sottodominio dedicato          | più pulito a lungo termine, richiede DNS su Aruba + certificato Certbot nuovo                                   |

La cartella del codice resta comunque `/var/www/gelateria-guido` come hai chiesto.

---

## ✅ D2 — Stack: monolite o monorepo

**Stato:** **DECISA (2026-08-07): monolite Next.js** — opzione A.

| Opzione                                                    | Pro                                                                        | Contro                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **A. Next.js monolite (consigliata)**                      | un servizio systemd, un deploy, un build; superficie minima; RAM contenuta | l'import gira nello stesso processo della UI (mitigato: è I/O-bound e ha checkpoint)     |
| B. Monorepo stile `china` (pnpm+Turbo, NestJS+Next+worker) | separazione netta, worker isolato                                          | 3 servizi, build system, package interni: costo alto per 1–3 utenti su un VPS già carico |

Il codice è comunque organizzato (`server/domain`, `server/ai`,
`server/import` senza dipendenze da React/Next) in modo che la conversione a
monorepo sia meccanica se un giorno servisse.

---

## ✅ D3 — Database

**Stato:** **DECISA per default (2026-08-07)**, nessuna obiezione: database Postgres dedicato
`gelateria_guido` + ruolo `gelateria`, estensioni `pg_trgm`, `unaccent`,
`pgcrypto`.

Postgres 16 è già attivo e ospita `china_sourcing`. MySQL è pure presente ma
Postgres è quello che usiamo con Prisma e ha il trigram che serve alla ricerca.
Verificato: `pg_trgm` 1.6, `unaccent` 1.1, `pgcrypto` 1.3 disponibili.
**`pgvector` non è disponibile** — quindi niente embeddings senza installarlo.

---

## ✅ D4 — Autenticazione

**Stato:** **DECISA (2026-08-07): password unica condivisa.**
Niente account personali: si entra con una sola password, senza email.

Implementazione: hash argon2 della password in `.env`, sessione su cookie
httpOnly, form con il solo campo password.

Nota di progetto: la tabella `user` resta nello schema con **una riga sola**
seedata («Gelateria»), perché `order.created_by_id` e `price_list.uploaded_by_id`
puntano lì. Non cambia nulla nell'uso — si entra sempre con una password sola —
ma il giorno in cui servissero account personali basta aggiungere righe e un
campo email, senza migrare gli ordini già fatti.

---

## ✅ D5 — Multi-tenant

**Stato:** **DECISA per default (2026-08-07)**, nessuna obiezione: `organization_id` su tutte le tabelle
di dominio fin da subito, con una sola organizzazione e nessuna UI dedicata.

Costo oggi: una colonna e un filtro centralizzato nei repository.
Costo se aggiunto dopo: una migrazione su tutte le tabelle con dati dentro e
la revisione di ogni singola query. Il rapporto è schiacciante.

---

## 🔴 D6 — IVA: i listini sono IVA inclusa o esclusa? (blocca la Fase 2)

**Stato:** APERTA · **Raccomandazione:** flag `prices_include_vat` per
fornitore + `default_vat_rate`; confronti sempre sul **netto**.

Serve la risposta dai PDF reali. Una gelateria ha aliquote miste (4% / 10% /
22%) e confrontare un prezzo lordo con uno netto falsa ogni confronto in modo
plausibile — cioè difficile da accorgersene.

Domande collegate: l'IVA compare riga per riga nei listini? Gli ordini vanno
gestiti al netto o al lordo?

---

## 🔴 D7 — Prezzi a scaglioni (blocca la Fase 2)

**Stato:** APERTA · **Raccomandazione:** verificare sui PDF; se presenti,
aggiungere una tabella `price_tier` **prima** della Fase 2.

Se un listino dice "1-10 pz €12,00 / 11-50 pz €11,20 / 51+ €10,50", il modello
"un prezzo per prodotto" non basta e cambierebbero schema, confronto e ordine.
È molto meno costoso saperlo ora.

---

## D8 — Immagini dei prodotti

**Stato:** APERTA · **Raccomandazione:** v1 senza immagini automatiche; upload
manuale opzionale per prodotto. Estrazione da PDF (`pdfimages`) valutata dopo.

Associare in modo affidabile un'immagine estratta alla riga giusta di un PDF è
un problema più difficile di quanto sembri (posizione ≠ appartenenza), e la
specifica dice esplicitamente che l'app non deve dipendere dalle foto.

---

## D9 — Formato dell'Excel

**Stato:** APERTA (per tua ammissione: "lo definirò successivamente")
**Raccomandazione:** modulo a template con un formato "standard" provvisorio.

Domande a cui servirà rispondere: un file unico o uno per fornitore? Quali
colonne? Va mandato al fornitore o è per uso interno? Serve un'intestazione con
i dati della gelateria? Serve anche un PDF?

La scelta della libreria (`xlsx` vs `exceljs`) dipende da questo: `exceljs`
solo se serve formattazione ricca (colori, larghezze, formule).

---

## D10 — Invio dell'ordine al fornitore

**Stato:** APERTA · **Raccomandazione:** fuori MVP.

Se in futuro serve (email con Excel/PDF allegato al fornitore), va deciso il
canale SMTP — nota: sul progetto `filippo` le email sono ancora su log in
attesa delle credenziali Aruba, quindi la questione andrebbe risolta lì prima.

---

## D11 — Budget IA

**Stato:** APERTA · **Raccomandazione:** DeepSeek `deepseek-v4-flash`, tetto
mensile configurabile (ordine di grandezza previsto: **pochi euro al mese**).

A ~$0,14/$0,28 per milione di token, un listino da 150 righe costa nell'ordine
dei centesimi, e dal secondo import dello stesso fornitore scende ancora
grazie al profilo salvato. Serve: chiave API DeepSeek e cifra del tetto oltre
la quale il sistema si ferma e chiede conferma.

Domanda collegata: vuoi poter confrontare DeepSeek con Claude sulla stessa
importazione (come fatto in `china`)? Se sì si implementano due provider
dall'inizio, il costo aggiuntivo è basso.

---

## ✅ D12 — Dispositivi d'uso

**Stato:** **DECISA (2026-08-07): tutti e tre** — PC in ufficio, tablet in
magazzino, telefono.

Conseguenze concrete sulla schermata ordine (Fase 12), da tenere presenti fin
dai componenti di base (Fase 3):

- **layout a tre respiri**: griglia multi-colonna su desktop, due colonne su
  tablet, colonna singola su telefono — stessa schermata, non tre schermate;
- **doppio comando quantità**: campo digitabile (veloce da tastiera) **e**
  stepper `[-] [+]` con bersagli ≥44 px (necessari al tocco), sempre entrambi
  presenti;
- **tastiera completa su desktop**: focus automatico sulla ricerca, frecce per
  scorrere i risultati, invio per aggiungere, senza mai toccare il mouse;
- **carrello adattivo**: barra inferiore fissa su telefono e tablet, drawer
  laterale su desktop;
- **niente hover come unico veicolo di informazione**: su tablet e telefono non
  esiste. Ogni informazione mostrata in hover deve essere raggiungibile anche
  con un tocco.

Costo: contenuto, se messo in conto dall'inizio. Caro, se aggiunto dopo.

---

## D13 — Backup e conservazione

**Stato:** APERTA · **Raccomandazione:** `pg_dump` giornaliero con retention 30
giorni + PDF originali conservati per sempre in `storage/` (inclusi nel backup).

Lo storico prezzi non è ricostruibile se non ricaricando tutti i PDF: è il dato
più prezioso dell'applicazione e oggi sul VPS **non esiste alcuna routine di
backup Postgres**.

---

## D14 — Perimetro funzionale

**Stato:** APERTA · **Raccomandazioni:** tutte fuori MVP, ma il modello dati non
le preclude.

- Ricezione merce / controllo bolle contro ordine → è il naturale passo
  successivo e scopre gli errori di fatturazione. Vale la pena tenerlo a mente.
- Giacenze e scorte minime → progetto a sé.
- Prodotti a peso variabile (torte, sfusi) → **verificare sui listini**: se
  esistono, serve un flag e cambia il confronto.
- Sconti contrattuali fuori listino → esiste `discount_pct` sul prezzo; serve
  capire se ne serve uno a livello di fornitore.
- Import da Excel/CSV oltre al PDF → economico da aggiungere; alcuni fornitori
  mandano già file strutturati, e sarebbero i più facili da trattare.

---

## Vincoli tecnici già verificati sul server (non sono decisioni, sono fatti)

| Elemento            | Stato                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Node                | v22.22.2 · pnpm 9.15.9                                                                                  |
| PostgreSQL          | 16.14 su 127.0.0.1:5432 · `china_sourcing` esistente                                                    |
| Estensioni Postgres | `pg_trgm` ✅ `unaccent` ✅ `pgcrypto` ✅ `btree_gin` ✅ · **`pgvector` ❌**                             |
| Redis               | 7.0.15 attivo (non necessario per l'MVP)                                                                |
| PDF                 | `pdftotext` e `pdfimages` (poppler 24.02) ✅ · **`tesseract` ❌ (niente OCR)**                          |
| Porte libere        | 3030 (3010 menu-digitale, 3020 china-web, 3021 china-api)                                               |
| Risorse             | 4 core · 7 GB RAM (già carichi: 2 servizi china, menu-digitale, MySQL, Postgres, Redis) · 115 GB liberi |
| nginx               | `filippo.eventoyou.com`, HTTPS via Certbot, pattern a sottopercorsi con `proxy_pass`                    |
| ⚠                   | `/gelateria-guido/` già presente in nginx come alias statico verso una cartella inesistente (vedi D1)   |
