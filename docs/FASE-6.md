# FASE 6 — Storico prezzi

Data: 2026-08-07 · **implementata e pronta al collaudo di rilascio**.

## Risultato

Ogni offerta fornitore ha ora uno storico temporale consultabile e alimentabile
a mano. Un nuovo prezzo non sovrascrive quello precedente: ne chiude il periodo
di validità, aggiunge una nuova riga e aggiorna il riferimento denormalizzato al
prezzo corrente.

Il servizio generico `setPrice` è anche il punto di ingresso dell'import dei
listini nelle fasi successive: accetta fonte, listino di provenienza e, soltanto
dal codice server, il netto dichiarato dal documento. Netto e prezzo unitario
non sono invece accettati dall'API manuale.

## Regole temporali

La validità usa giorni di calendario e intervalli **`[validFrom, validTo)`**:
il giorno iniziale è compreso, quello finale è il giorno in cui entra in vigore
il prezzo seguente.

- un prezzo successivo chiude quello corrente e diventa il nuovo corrente;
- un prezzo retroattivo spezza l'intervallo che era valido in quella data,
  senza cambiare il prezzo corrente se esiste già un periodo successivo;
- una correzione con la stessa data annulla la riga precedente impostando un
  intervallo vuoto `[giorno, giorno)`; la riga rimane visibile per audit, ma non
  entra nel grafico, nelle variazioni o nella lettura alla data;
- una fotografia commerciale identica a quella già efficace è un no-op e non
  crea una riga duplicata;
- listino, sequenza degli sconti, netto, IVA, valuta e prezzo unitario fanno
  parte della fotografia: cambiare uno di questi valori è una correzione
  tracciabile.

Non si possono programmare prezzi futuri. Con il solo puntatore
`current_price_id` una riga futura apparirebbe corrente prima del suo giorno;
finché non esisterà un processo di attivazione pianificata, il repository
rifiuta date successive al giorno civile della gelateria in `Europe/Rome`.

Le scritture avvengono in una transazione PostgreSQL `Serializable`. Se due
richieste concorrenti si sovrappongono, il conflitto `P2034` viene ritentato
dopo aver riletto la catena aggiornata. Ogni operazione parte dall'offerta
scoped per organizzazione; lo storico non è accessibile come delegate Prisma
diretto e non può attraversare il tenant.

## Calcoli

Per ogni riga il server:

1. applica gli sconti in cascata nell'ordine ricevuto;
2. arrotonda il netto con la regola half-even del dominio, oppure conserva il
   netto dichiarato quando arriva dal servizio interno di import;
3. divide il netto per `content_per_pack`;
4. salva il prezzo per `L`, `kg` o pezzo insieme alla sua base;
5. calcola la variazione assoluta e percentuale rispetto al prezzo effettivo
   precedente.

Netto e prezzo unitario vengono controllati contro precisione e range delle
colonne prima della query Prisma: un arrotondamento a zero o un overflow
rispondono come errore di validazione e non diventano un `500` del database.
Quando un'offerta possiede già uno storico, non è inoltre possibile cambiarne
fornitore o contenuto totale della confezione con un semplice `PATCH`: il
prezzo unitario salvato resterebbe associato a un denominatore diverso. Una
correzione futura dovrà aggiornare il formato e appendere atomicamente un nuovo
snapshot; fino ad allora l'operazione viene bloccata con `409`.

La percentuale è riferita al prezzo precedente. Per esempio, da €9,80 a
€10,20 la variazione è `+€0,40`, cioè `+4,08%`.

## Interfaccia

La scheda `/prodotti/[id]` contiene una sezione per ogni offerta collegata:

- prezzo netto corrente;
- grafico a gradini, coerente con periodi in cui il prezzo resta costante;
- variazioni del netto su finestre di 30, 90 e 180 giorni;
- tabella con validità, stato, listino, sconti, netto, prezzo per unità,
  variazione e origine;
- freccia rossa per gli aumenti, verde per le diminuzioni e indicazione
  esplicita dei valori invariati;
- dialog per inserire un prezzo manuale o correggere una data già presente.

Le righe sostituite sono visibili ma barrate e marcate `sostituito`. Se la
quantità della confezione non è confermata, il prezzo unitario non viene
presentato come dato affidabile. Il grafico usa il netto, quindi resta valido
anche in quel caso.

La tab `/fornitori/[id]/prezzi` riepiloga invece le offerte con prezzo
corrente e porta, con un collegamento profondo, allo storico specifico nella
scheda prodotto.

## API

Gli URL pubblici hanno il prefisso `/gelateria`; qui sono indicati i pathname
applicativi.

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/supplier-products/[id]/prices` | intero storico, `200` |
| `GET` | `/api/supplier-products/[id]/prices?at=AAAA-MM-GG` | storico e `priceAt`, `200` |
| `POST` | `/api/supplier-products/[id]/prices` | nuovo prezzo, `201`; duplicato idempotente, `200` |

Il `POST` accetta soltanto:

```json
{
  "priceList": "9.80",
  "discounts": [6, 10],
  "vatRate": "22",
  "validFrom": "2026-06-01"
}
```

Lo schema è strict. Data reale `AAAA-MM-GG`, prezzo positivo con al massimo
quattro decimali, massimo dieci sconti fra 0 e 100 e IVA opzionale. Fonte,
netto, valuta, prezzo unitario, id e organizzazione non sono controllabili dal
client.

Il repository espone inoltre il contratto interno
`setPrice(supplierProductId, input, createdById?)`. Una fonte `PRICE_LIST`
richiede un `priceListId` della stessa organizzazione e dello stesso fornitore;
può fornire il netto autorevole letto dal documento e aggiorna sempre
`last_seen_at`, ultimo listino e stato dell'offerta, anche quando il prezzo è
invariato. Le fonti `MANUAL` e `ORDER` non possono fingersi collegate a un
listino; la fonte manuale richiede l'utente che ha effettuato l'inserimento.

Le risposte usano `{ ok, data }` oppure `{ ok, error, fields }` e
`Cache-Control: no-store`. Tutte le richieste richiedono sessione; il `POST`
richiede inoltre origine fidata, JSON valido e body massimo 64 KiB. Un id
inesistente o appartenente a un'altra organizzazione risponde `404`.

## Schema e migrazione

Non serve una nuova migrazione. `supplier_product_price`, le relazioni dello
storico e `supplier_product.current_price_id` erano già stati creati dalla
migrazione iniziale perché lo schema completo era una decisione della Fase 2.
La Fase 6 rende operativo quel modello senza cambiare lo schema live.

## Controlli prima del rilascio

I test coprono schema strict, decimali senza errori floating-point, date reali
e giorno `Europe/Rome`, limiti dei valori derivati, inserimento in mezzo alla
timeline, lettura alla data, correzione nello stesso giorno, idempotenza della
fotografia commerciale, finestre 30/90/180 e proiezione del grafico. Prima
della pubblicazione vengono inoltre eseguiti l'intera suite, typecheck, lint,
Prettier, validazione Prisma, build con le variabili live, backup e smoke test
autenticato.

## Passo successivo

**Fase 7 — Estrazione PDF deterministica.** Caricamento con fornitore e nome
del listino obbligatori, conservazione del documento, estrazione senza IA e
anteprima delle righe grezze prima di qualsiasi import.
