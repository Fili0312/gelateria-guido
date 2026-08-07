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

Implementazione: hash argon2 nel file di ambiente root-only, sessione su cookie
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

## ✅ D6 — IVA: i listini sono IVA inclusa o esclusa?

**Stato:** **DECISA (2026-08-07) sui listini veri: prezzi al NETTO (imponibile),
aliquota indicata riga per riga.**

Entrambi i fornitori hanno una colonna `IVA` con l'aliquota (22% ovunque nei
file esaminati) accanto a un prezzo che la esclude. Quindi:

- `supplier.prices_include_vat = false` per Barzelli e Cecconi;
- `vat_rate` per riga resta necessario (una gelateria compra anche 4% e 10%:
  qui non compaiono solo perché questi due fornitori vendono bevande e alcolici);
- tutti i confronti e i totali si fanno **sul netto**, l'IVA si aggiunge solo
  in fondo al riepilogo.

Il flag `prices_include_vat` resta comunque nel modello: serve al primo
fornitore che manderà un listino al lordo, e non costa nulla averlo.

⚠️ Attenzione a un falso amico: in questi documenti **«netto» significa "dopo
gli sconti", non "senza IVA"**. `IMPORTO NETTO` di Barzelli è il prezzo
scontato, IVA comunque esclusa. Nel codice si useranno nomi non ambigui
(`price_list`, `price_net`, `price_gross_vat`).

---

## ✅ D7 — Prezzi a scaglioni

**Stato:** **DECISA (2026-08-07) sui listini veri: NIENTE SCAGLIONI.**
Non serve la tabella `price_tier`. Un prezzo per prodotto basta.

Lo script aveva segnalato «sospetti scaglioni» su tutti e tre i PDF (99–100%
di righe con 2+ prezzi), ma la verifica a mano dice altro: quei numeri sono
**prezzo di listino → sconti → totale netto**, non fasce di quantità.

**Scoperta al posto degli scaglioni: gli sconti sono a cascata.**

| Fornitore | Colonne prezzo |
| --- | --- |
| Barzelli | `PREZZO UNITARIO · SC.1% · SC.2% · IMPORTO NETTO · IVA` |
| Cecconi | `Prezzo · % · % · % · % · % · Tot. netto · IVA (%)` |

Sono sconti **moltiplicativi in sequenza**, verificati sull'aritmetica:

```
Barzelli  4,61 × (1−0,06) × (1−0,10) = 3,90  ✓
Barzelli 18,33 × (1−0,06) × (1−0,04) = 16,54 ✓
Cecconi  10,30 × (1−0,24)            = 7,83  ✓
```

Conseguenza sullo schema (già recepita in ANALISI §3.4): `supplier_product_price`
memorizza **listino + catena di sconti + netto**, non un solo `discount_pct`.
Il netto entra in ogni confronto; listino e sconti servono a distinguere un
rincaro del fornitore da un peggioramento delle condizioni commerciali.

---

## ✅ D8 — Immagini dei prodotti

**Stato:** **DECISA (2026-08-07): v1 senza immagini.** Confermata dai file veri.

Cecconi: zero immagini. Barzelli: 6 immagini su 6 pagine — cioè una per pagina,
quindi intestazione/logo, non foto di prodotto. Su 331 articoli reali non
esiste **nessuna** foto. L'interfaccia si progetta come lista densa, e le foto
restano un di più eventuale con upload manuale.

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

## ✅ D10 — Invio dell'ordine al fornitore

**Stato:** **DECISA (2026-08-07): DENTRO l'MVP.** Ribaltata rispetto alla
raccomandazione iniziale, su richiesta esplicita.

Alla conferma dell'ordine il sistema genera **un PDF per ogni fornitore**
(nome file con fornitore e data) e lo **manda per email** all'indirizzo
dell'anagrafica. Diventano le Fasi 16 e 17 della roadmap, e spostano il
confine dell'MVP dalla Fase 16 alla 17.

Il motivo per cui vale la pena: senza questo pezzo l'app fa risparmiare tempo
sull'analisi ma lo lascia perdere sull'ultimo passo, che è quello che si fa
tutte le settimane. Il costo è contenuto perché il PDF si genera con il
Chromium headless già presente sul server e l'invio è nodemailer su un account
Aruba già configurato.

Vedi **D18** per il prerequisito vero, che è l'autorizzazione a spedire.

---

## ~~D10 (versione precedente)~~ — Invio dell'ordine al fornitore

**Stato:** superata dalla decisione qui sopra. · Raccomandazione era: fuori MVP.

Se in futuro serve (email con Excel/PDF allegato al fornitore), va deciso il
canale SMTP — nota: sul progetto `filippo` le email sono ancora su log in
attesa delle credenziali Aruba, quindi la questione andrebbe risolta lì prima.

---

## ✅ D11 — Budget IA

**Stato:** **DECISA (2026-08-07)** — DeepSeek `deepseek-v4-flash`, chiave presa
dal progetto `china`, **tetto 5 al mese**.

Configurato in `/etc/gelateria/gelateria.env`:

```
DEEPSEEK_API_KEY   copiata da /var/www/china/.env (voce DEEP_SEEK_API)
DEEPSEEK_MODEL     deepseek-v4-flash
AI_MONTHLY_BUDGET_USD  5
```

Chiave verificata il 2026-08-07: risponde, ed espone i modelli
`deepseek-v4-flash` e `deepseek-v4-pro`.

A ~$0,14/$0,28 per milione di token, un listino da 150 righe costa nell'ordine
dei centesimi, e dal secondo import dello stesso fornitore scende ancora grazie
al profilo salvato. Il tetto di 5 basta ampiamente.

**Due avvertenze che restano.**

*Il tetto è in dollari, il credito pure.* La variabile si chiama
`AI_MONTHLY_BUDGET_USD` perché DeepSeek fattura in USD. 5 $ sono circa 4,60 €,
quindi il tetto configurato sta **sotto** i 5 € autorizzati, non sopra.

*Il credito vero sul conto è 1,84 $*, non 5. È il vincolo che conta per primo,
ed è **condiviso con il progetto `china`**: quando si esaurisce si fermano
entrambi. Da ricaricare prima di lanciare l'import di un listino intero
(Fase 7). Il contatore di spesa dell'applicazione va quindi letto come «quanto
ho speso io», non come «quanto resta».

Domanda ancora aperta, minore: vuoi poter confrontare DeepSeek con Claude sulla
stessa importazione (come fatto in `china`)? Se sì si implementano due provider
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

## 🆕 Domande nate dai listini veri (2026-08-07)

### ✅ D15 — Il file di AD Beverage non ha prezzi

**Stato:** **CHIUSA (2026-08-07): si lascia così.** Filippo caricherà lui i
listini quando li avrà. AD Beverage non è un fornitore bloccante e non guida
nessuna scelta tecnica: l'import da Excel resta fuori perimetro finché non
arriva un file che vale la pena importare.

Resta valido quanto segue come descrizione del file esaminato.

`Listino prezzi AD Beverage dal 01.07.26.xls` contiene **485 articoli e zero
prezzi**: la colonna «Prezzo u.» è vuota su tutte le righe, e in tutto il file
non c'è **una sola cella numerica**. È un catalogo, non un listino.

Ha però due cose preziose che agli altri mancano: una **categoria merceologica**
per ogni articolo (30 categorie: ACQUA, AMARO, BIRRA, GIN…) e, spesso, i
**pezzi per confezione** dentro la descrizione (`CL.33X24`, `LITRO PETX12`) —
proprio il dato che manca a Cecconi e Barzelli.

Serve sapere: esiste una versione con i prezzi? Arrivano a parte? Oppure quel
file va usato come **catalogo di riferimento** e i prezzi si inseriscono a mano?

Nota: è un `.xls`, non un PDF. L'import da Excel era «fuori perimetro» nella
roadmap: se AD Beverage conta, va rimesso dentro — costa comunque molto meno
dell'import da PDF, perché i dati sono già in celle.

### D16 — Gli sconti sono contrattuali o legati al singolo preventivo?

I due file non sono listini generici ma **documenti intestati alla gelateria**
(un «PREVENTIVO» Barzelli, un «Ordine di vendita» Cecconi), con sconti già
applicati riga per riga. Se quegli sconti sono le condizioni stabili del
cliente, il prezzo netto è il prezzo vero e non c'è altro da sapere. Se invece
cambiano da preventivo a preventivo, va deciso se confrontare i fornitori sul
netto (condizioni attuali) o sul lordo (listino puro).

**Raccomandazione:** confrontare sul netto in ogni caso — è quello che si paga —
e tenere lordo e sconti a fianco per capire da dove viene una variazione.

### 🔴 D18 — Autorizzazione a spedire email (prerequisito della Fase 17)

Le email ai fornitori sono l'unica cosa che questa applicazione manda fuori, e
sono irreversibili: un ordine spedito per sbaglio a un fornitore vero non si
richiama indietro.

**Situazione sul server, verificata.** Esiste già un account SMTP Aruba
configurato per il progetto `filippo`:

```
MAIL_HOST=smtps.aruba.it   MAIL_PORT=587
MAIL_USERNAME=noreply@eventoyou.com
MAIL_MAILER=log      ← le email NON partono, finiscono su file
```

È in modalità `log` da mesi, in attesa dell'autorizzazione a usare le
credenziali. Non c'è nessun MTA locale (`postfix` inattivo).

**Serve decidere tre cose:**

1. **Quale casella** manda gli ordini. `noreply@eventoyou.com` funziona
   tecnicamente ma è pessima come mittente di un ordine: il fornitore
   risponderà, e la risposta finirebbe nel vuoto. Meglio una casella vera
   della gelateria (`ordini@…`), con `Reply-To` corretto.
2. **Quando si passa da `log` a `smtp`.** Raccomandazione: si sviluppa e si
   collauda tutto in `log`, si fa una prova reale verso un indirizzo tuo, e
   solo dopo si accende verso i fornitori.
3. **Automatico o con conferma.** Raccomandazione: **conferma esplicita** come
   default (l'app mostra a chi sta per scrivere, tu clicchi «invia»), con
   l'automatismo pieno attivabile nelle impostazioni quando ti fidi. La
   differenza di tempo è un click; la differenza in caso di errore è un ordine
   sbagliato mandato a cinque fornitori.

Finché D18 non è chiusa la Fase 17 si sviluppa e si completa lo stesso: in
modalità `log` funziona tutto, le email si possono leggere su file, solo non
escono dal server.

### D17 — Pezzi per collo, quando non sono scritti

Nell'85% delle righe si compra il pezzo singolo (`BT`, `UN`) e il prezzo
unitario è diretto. Nel restante 15% si compra a collo (`CO`, `CT`) e **i pezzi
per confezione non sono quasi mai indicati** (3% delle righe): «ALISEA
NATURALE CL.50 PET — CO — 5,25 €» non dice quante bottiglie ci sono.

Senza quel numero il prezzo al litro non è calcolabile. Le opzioni:

1. **(consigliata)** si mostra il prezzo a collo, si marca «confezione da
   definire», e l'utente inserisce il numero **una volta sola**: resta sul
   prodotto per sempre, come un alias. Sono ~35 prodotti sui due listini, cioè
   mezz'ora di lavoro una tantum.
2. Si prova a dedurlo dal catalogo AD Beverage, che spesso lo dichiara
   (`CL.50 PET X24`) — ma è un'inferenza fra fornitori diversi e può sbagliare.
3. Non si calcola il prezzo al litro per quei prodotti e si confrontano solo
   colli con colli.

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
