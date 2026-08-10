# FASE 18 — Statistiche prodotto

Data: 2026-08-10 · **completata**.

## Risultato

La scheda prodotto mostra, per gli ultimi 30, 90, 180 o 365 giorni:

- confezioni e pezzi acquistati;
- spesa netta e numero di ordini;
- ultimo acquisto e frequenza media fra ordini;
- prezzo medio realmente pagato, pesato sulle confezioni;
- migliore prezzo corrente e variazione rispetto alla media storica;
- risparmio annuo potenziale, stimato sui consumi reali;
- andamento di spesa e prezzo pagato, con il dettaglio degli ordini.

Il primo caricamento è renderizzato sul server. Cambiare periodo interroga
`GET /api/products/[id]/stats?period=30|90|180|365` senza ricaricare la scheda.

## Quali ordini contano

Entrano solo `CONFIRMED`, `SENT` e `RECEIVED`. `DRAFT` non è ancora un
acquisto e `CANCELLED` non lo è più: includerli gonfierebbe sia consumi sia
spesa con numeri plausibili ma falsi.

Ogni metrica della storia legge gli snapshot di `order_line`:
`quantityPacks`, `packQuantitySnapshot`, `unitPriceNetSnapshot` e
`lineTotalNet`. Il totale netto fotografato vince su un ricalcolo dal prezzo
unitario, perché contiene già l'arrotondamento al centesimo confermato
nell'ordine.

L'unico dato vivo è, per definizione, il prezzo corrente. Arriva dallo stesso
dominio di confronto usato da «Convenienti» e dalla scheda offerte, così due
schermate non possono scegliere due fornitori diversi.

## Un abbinamento successivo vale anche per gli ordini vecchi

La ricerca dà precedenza a `order_line.supplierProduct` e alla sua associazione
corrente col prodotto canonico. Se un'offerta era ancora da abbinare quando è
stato confermato l'ordine e viene riconosciuta dopo, l'acquisto compare nella
scheda giusta senza modificare lo snapshot storico. Se oggi l'offerta viene
invece scollegata, `order_line.productId` resta il ripiego: lo storico non
scompare in attesa del nuovo abbinamento.

La query parte comunque da `order`, che possiede `organizationId`: lo scope
dell'organizzazione resta obbligatorio anche se `order_line` non lo possiede.

## Media e confronto corrente

Il prezzo medio pagato è:

```
somma dei netti fotografati / confezioni acquistate
```

Non è la media semplice dei prezzi e non usa i listini: due confezioni a 10 €
e otto a 8 € danno `(2×10 + 8×8) / 10`, non `(10+8)/2`.

Se tutte le confezioni storiche hanno la stessa quantità di quella corrente,
la variazione si calcola sul prezzo della confezione. Se nel tempo il collo è
cambiato — per esempio da 12 a 24 pezzi — il confronto passa automaticamente
al prezzo per pezzo. Confrontare 24 € a collo con 44 € a collo senza guardare
il contenuto farebbe sembrare il secondo più caro anche quando costa meno.

L'esempio della specifica torna con la precisione completa: `450 / 48 =
9,375`, prezzo corrente `10,20`, variazione `+8,8%`. La UI monetaria mostra la
media arrotondata a `9,38 €`; il calcolo percentuale usa `9,375`, non il valore
già arrotondato.

## Risparmio annuo potenziale

La stima non moltiplica il numero di confezioni per una differenza a collo:
nel frattempo una confezione può essere passata da 12 a 24 pezzi. Per ogni
snapshot ricostruisce invece il consumo fisico:

```
quantità ordinarie × pezzi per confezione × formato del pezzo
```

Il formato viene convertito nella base corretta (`CL` in `L`, `G` in `kg`, o
pezzi), il consumo osservato viene riportato proporzionalmente a 365 giorni e
moltiplicato per la differenza unitaria **corrente** fra migliore e alternativa
confrontabile. La differenza è quella dello stesso dominio «Convenienti» e
comprende gli sconti extra concordati.

Esempio verificato: 2 colli × 12 bottiglie × 33 cl in 30 giorni sono 7,92 L,
cioè 96,36 L annualizzati. Con 0,50 €/L di differenza il risparmio potenziale è
48,18 €.

La scheda dichiara fornitore migliore, alternativa, consumo osservato,
consumo annualizzato e differenza unitaria. È esplicitamente una proiezione,
non un risparmio già contabilizzato. Senza due offerte confrontabili, senza
acquisti o con unità incompatibili non mostra zero: spiega perché la stima non
è disponibile.

## Frequenza e finestre

La finestra è un intervallo esatto indietro dal momento della richiesta. La
frequenza è la media dei giorni trascorsi fra ordini distinti:

```
(ultimo ordine - primo ordine) / (numero ordini - 1)
```

Con un solo ordine non si inventa una frequenza: l'API restituisce `null` e la
scheda spiega che serve un secondo acquisto.

## Interfaccia e accessibilità

Il selettore è una normale `select` con etichetta, bersaglio di 44 px, stato di
caricamento annunciato tramite `aria-live` ed errore con `role="alert"`.

Il grafico raggruppa per giorno nella finestra da 30 e per mese nelle finestre
più lunghe. Non è l'unico modo di leggere i dati: una tabella sottostante
espone date, ordini, confezioni, pezzi, medie e spesa esatte, con link al
dettaglio congelato dell'ordine. Il grafico dichiara inoltre un nome completo
alle tecnologie assistive.

## API

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/products/[id]/stats?period=365` | statistiche, confronto corrente e acquisti nel periodo |

Il periodo omesso vale 365. Qualunque valore diverso da 30, 90, 180 o 365
risponde `400`; prodotto fuori dall'organizzazione o inesistente risponde
`404`; senza sessione risponde `401`. Le risposte mantengono il contratto
comune `{ ok, data | error }` e `Cache-Control: no-store`.

## Verifica

La logica è pura e coperta da sei casi:

| Criterio | Esito |
|---|---|
| esempio 48 confezioni, 450 €, media 9,375, corrente 10,20 | ✅ `+8,8%` |
| due offerte dello stesso prodotto nello stesso ordine | ✅ un ordine, somme unite |
| bozze, annullati e acquisti fuori finestra | ✅ esclusi |
| frequenza fra tre ordini | ✅ media degli intervalli |
| cambio confezione 12 → 24 | ✅ confronto per pezzo |
| nessun acquisto | ✅ zeri espliciti, medie `null` |
| consumo 7,92 L/30 giorni, differenza 0,50 €/L | ✅ 96,36 L/anno, 48,18 € |
| storico in kg contro confronto in litri | ✅ stima rifiutata |

Controlli eseguiti:

- test Fase 18: **8/8**;
- typecheck dell'intero progetto: superato;
- ESLint sui file della fase: superato;
- query read-only sul database reale: un prodotto acquistato ha restituito un
  ordine, 8 confezioni, 8 pezzi, 116,63 € e una proiezione annua di 37,92 €;
  il prezzo corrente è stato letto dallo stesso confronto della scheda
  offerte.

Il controllo sul database non crea, modifica né annulla ordini.
