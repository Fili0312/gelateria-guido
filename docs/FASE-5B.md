# FASE 5b — Reparti e categorie

Data: 2026-08-07 · **completata, pubblicata e collaudata in produzione**.

## Risultato

Il catalogo ora usa una tassonomia a due livelli:

- il **reparto** rappresenta il giro grande del magazzino: Bar, Gelateria,
  Cucina, Pulizia e consumo;
- la **categoria** rappresenta lo scaffale dentro il reparto: Acqua, Birre,
  Amari e liquori, Basi e semilavorati, e così via;
- il prodotto canonico punta a una categoria tramite `category_id`; se non è
  ancora classificato il valore è `null` e compare in una coda visibile;
- la categoria testuale dell'offerta fornitore resta separata: è un indizio
  grezzo del listino e non crea automaticamente voci nella nostra tassonomia.

La struttura è volutamente di due livelli, non un albero libero. È sufficiente
per il modo in cui si ordina e mantiene semplici filtri, form, query e futura
schermata ordini.

## Interfaccia

### Catalogo — `/prodotti`

L'elenco mostra il badge `Reparto · Categoria` e aggiunge:

- filtro per reparto;
- filtro per categoria;
- filtro `Con categoria / Da classificare`;
- contatore globale dei prodotti da classificare;
- collegamento alla gestione della tassonomia.

La barra di ricerca restituisce lo stesso riferimento strutturato. I join su
categoria e reparto sono `LEFT JOIN`: un prodotto senza categoria resta
ricercabile.

### Gestione — `/prodotti/reparti`

Dalla pagina si possono:

- creare, rinominare, colorare, ordinare, attivare e disattivare reparti;
- creare, rinominare, ordinare, spostare, attivare e disattivare categorie;
- cancellare una categoria con conferma e conteggio dei prodotti coinvolti;
- cancellare soltanto un reparto vuoto;
- aprire direttamente la coda dei prodotti da classificare.

Se si cancella una categoria, i prodotti non vengono cancellati: tornano
`Da classificare`. Un reparto con categorie va prima svuotato o disattivato;
la regola è garantita anche dalla foreign key `RESTRICT`, quindi regge fra
richieste concorrenti.

Nei form prodotto sono selezionabili soltanto reparti e categorie attivi. In
modifica, una categoria poi disattivata resta visibile come `non attiva`, ma
non può essere assegnata di nuovo.

## Tassonomia iniziale

Il bootstrap contiene 4 reparti e 29 categorie:

| Reparto | Categorie |
|---|---:|
| Bar | 10 |
| Gelateria | 10 |
| Cucina | 5 |
| Pulizia e consumo | 4 |

La migrazione crea queste righe per le organizzazioni già presenti al deploy.
Il seed le crea invece quando l'organizzazione nasce su un database vuoto,
dopo l'esecuzione delle migrazioni. Se esiste già un reparto, il seed non
sovrascrive le personalizzazioni.

## Migrazione dei dati

La migrazione `20260807175028_reparti_e_categorie`:

1. crea `department` e `category` con scope organizzazione, indici e vincoli;
2. aggiunge `product.category_id` con `ON DELETE SET NULL`;
3. crea la tassonomia iniziale per ogni organizzazione esistente;
4. traduce le categorie testuali presenti nel catalogo dentro la nuova
   struttura, sempre abbinando la stessa organizzazione;
5. calcola subito le statistiche PostgreSQL usate dalla ricerca.

La vecchia colonna `product.category` resta temporaneamente come
`legacyCategory`. Il codice nuovo non la legge né la scrive: serve soltanto a
permettere alla build precedente di ripartire se il deploy fallisce dopo la
migrazione. Verrà eliminata con una migrazione di pulizia successiva, dopo il
collaudo live.

Sulla copia fresca della produzione la rehearsal ha prodotto:

```text
reparti:                    4
categorie:                 29
prodotti:                  19
prodotti da classificare:   0
categorie legacy preservate: 19
drift Prisma:               nessuno
```

Su un database completamente vuoto, `migrate deploy` seguito dal seed ha dato
gli stessi 4 reparti, 29 categorie, 19 prodotti e zero non classificati.

## Suggerimento deterministico

`categoriaSuggerita()` normalizza il testo del fornitore e propone una delle
categorie note. Le regole più specifiche vengono prima di quelle generiche:
per esempio `GRAPPE E LIQUORI` diventa `Distillati`, mentre `LIQUORI` da solo
diventa `Amari e liquori`.

Quando nessuna regola è affidabile la funzione restituisce `null`: una coda
visibile è preferibile a una classificazione plausibile ma sbagliata.

## API

Gli URL pubblici hanno il prefisso `/gelateria`; qui sono indicati i pathname
applicativi.

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/taxonomy?includiInattivi=false` | albero e conteggi, `200` |
| `POST` | `/api/taxonomy/departments` | crea reparto, `201` |
| `PATCH` | `/api/taxonomy/departments/[id]` | modifica reparto, `200` |
| `DELETE` | `/api/taxonomy/departments/[id]` | cancella se vuoto, `200` o `409` |
| `POST` | `/api/taxonomy/categories` | crea categoria, `201` |
| `PATCH` | `/api/taxonomy/categories/[id]` | modifica/sposta, `200` |
| `DELETE` | `/api/taxonomy/categories/[id]` | cancella e restituisce `productsAffected`, `200` |

Tutte le risposte usano la busta `{ ok, data }` oppure `{ ok, error, fields }`
e `Cache-Control: no-store`. Le mutazioni richiedono sessione, origine fidata,
`Content-Type: application/json`, body massimo 64 KiB e schema Zod strict.

## Isolamento e invarianti

`Department` e `Category` sono modelli direttamente scoped. L'estensione
Prisma aggiunge `organization_id` a letture e scritture e rifiuta assegnazioni
cross-tenant. Repository e ricerca ripetono i controlli nei punti in cui una
relazione potrebbe attraversare lo scope:

- categoria e reparto vengono validati nell'organizzazione corrente prima di
  scrivere;
- una categoria di un'altra organizzazione inviata a un prodotto risponde
  `400` sul campo `categoryId`, non `500`;
- i join SQL grezzi della ricerca richiedono lo stesso `organization_id` del
  prodotto;
- un id appartenente a un'altra organizzazione risulta non trovato.

## Controlli di rilascio

```text
pnpm test          212 test, 53 suite, 0 falliti
pnpm typecheck     pulito
pnpm lint          pulito
pnpm format:check  pulito
prisma validate    schema valido
pnpm build         pulito con le variabili di produzione
git diff --check   pulito
```

La ricerca era già stata misurata su 5.000 prodotti e 9.973 offerte dopo
`ANALYZE`: caso peggiore 50,4 ms, sotto il limite di 100 ms.

## Deploy e collaudo live

Prima della migrazione è stato creato e verificato il dump:

```text
/var/backups/gelateria/gelateria_guido-20260807-183708-616767701.sql.gz
dimensione: 11 KB
storage:    16 KB
dump conservati: 9
```

Il commit di rilascio `bbbc6d2` è stato pubblicato con `scripts/deploy.sh`.
Build, migrazione `20260807175028_reparti_e_categorie`, riavvio e health check
sono riusciti. Il servizio è `active`, lo schema Prisma è aggiornato e sia
l'health check interno sia quello HTTPS rispondono `{ "ok": true }`.

Lo smoke test autenticato ha verificato via HTTP:

- albero iniziale da 4 reparti, 29 categorie e zero prodotti da classificare;
- rendering di catalogo, pagina reparti e modifica prodotto;
- creazione, rinomina, riordino, disattivazione e riattivazione;
- duplicato reparto → `409`;
- cancellazione reparto non vuoto → `409`;
- categoria inesistente sul prodotto → `400` con errore su `categoryId`;
- cancellazione categoria → prodotto conservato, categoria `null` e
  `productsAffected: 1`;
- ricerca `amaro` con risultati in **4,92 ms**;
- cancellazione di tutti i record di collaudo attraverso le API.

Conteggi finali live:

```text
reparti:                  4
categorie:               29
prodotti:                19
prodotti da classificare: 0
```

I database temporanei `gelateria_prova`, `gelateria_collaudo` e
`gelateria_seed_collaudo` sono stati eliminati dopo il collaudo. Il database
live e il backup pre-deploy non sono stati toccati dalla pulizia.

## Passo successivo

**Fase 6 — Storico prezzi.** Implementazione append-only del prezzo corrente,
prezzo alla data, variazioni e grafico nella scheda prodotto.
