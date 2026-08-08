# FASE 10 — Revisione e applicazione dell'import

Data: 2026-08-08 · **in produzione**. È la fase che chiude il giro: dal PDF al
catalogo, con revisione e annullamento.

## Risultato

Sulla scheda di un listino c'è un pannello che dice **cosa succederà** — nuovi,
prezzi aggiornati, invariati, confezioni cambiate, spariti — e un pulsante.
Premuto, i prodotti entrano in catalogo e i prezzi nello storico. Premuto
l'altro, tutto torna com'era.

Da qui `/prodotti` smette di essere vuoto.

## La regola di riconciliazione

`reconcile.ts` è **puro**: nessun database, nessuna rete. È la logica che
decide se il catalogo resta pulito, e la si prova su casi costruiti a mano
perché su dati veri non si può far succedere apposta il caso che serve.

### Il perimetro

Si confronta **solo** ciò che appartiene allo stesso fornitore e alla stessa
copertura. Mai oltre. È la ragione per cui la copertura esiste: senza,
caricare «liquori» di Cecconi farebbe risultare spariti tutti i suoi vini — il
modo peggiore di sbagliare, perché sembra un aggiornamento riuscito.

### L'identità di un prodotto

Codice fornitore **e** confezione **e** pezzi **e** formato. Non il solo
codice: un fornitore che passa dal collo da 24 a quello da 12 riusa lo stesso
codice, e aggiornare solo il prezzo farebbe sembrare un dimezzamento di prezzo
quello che è un dimezzamento di confezione.

| Caso | Cosa succede |
|---|---|
| tutto coincide, prezzo diverso | si aggiorna solo il prezzo |
| tutto coincide, prezzo uguale | **non si scrive niente** |
| stesso codice, confezione o formato diversi | ⚠ **non si decide da soli**: blocca l'applicazione |
| codice mai visto | si crea |
| a catalogo ma non nel file | si disattiva, mai si cancella |
| stesso codice due volte nel file | si salta la seconda |

## Tre casi che si dimenticano sempre

**Una riga esclusa non fa sparire il prodotto.** «Non l'ho importata» non è
«non c'è più nel listino»: confonderle disattiverebbe prodotti che il
fornitore vende ancora.

**Un'offerta già disattivata non risparisce a ogni import.**

**Lo stesso codice due volte nello stesso file.** Succede davvero: il
preventivo Barzelli elenca `SC204 angostura BITTER 0.200` due volte. Senza il
controllo si creavano due offerte identiche dello stesso fornitore — e
l'import si schiantava sull'unicità dell'impronta. Peggio: se fosse passato,
le due si sarebbero **confrontate fra loro** come se fossero di fornitori
diversi, e una delle due sarebbe risultata «più conveniente» dell'altra.

Trovato applicando il listino vero, non ragionando.

## L'annullamento

Il criterio della roadmap è severo e giusto: «`revert` riporta il database
esattamente allo stato precedente, verificato con confronto». Il collaudo lo
prende alla lettera — fotografia di prodotti, offerte e prezzi prima
dell'import, la stessa fotografia dopo l'annullamento, e le due stringhe
devono coincidere. Coincidono.

Il punto in cui era facile sbagliare è la **riapertura**: un prezzo che era
corrente e a cui l'import ha messo una data di fine deve tornare senza data di
fine. Saltare quel passo lascia l'offerta senza prezzo corrente, e il confronto
fra fornitori la salta **in silenzio** — nessun errore, nessun segnale,
semplicemente un prodotto che sparisce dai confronti.

Un'offerta che ha già ricevuto prezzi da un altro listino non si cancella: si
porterebbe via storico che non appartiene a questo import.

## Una rifattorizzazione invece di una copia

L'import scrive centonovanta prezzi dentro la propria transazione, e le
transazioni Prisma non si annidano — mentre `setPrice` della Fase 6 ne apriva
una propria. Il corpo è stato **estratto** in `applicaPrezzoInTransazione`, non
copiato: due copie delle stesse regole su periodi di validità e puntatore
corrente divergono, e divergerebbero in silenzio.

Nel farlo è emerso un uso deprecato: due query lanciate insieme dentro una
transazione condividono la connessione, e `pg` lo toglierà in versione 9. Non
si vedeva finché i prezzi si scrivevano uno alla volta a mano. (Ne resta uno
dentro Prisma stessa, fuori dal nostro codice.)

## La miglior offerta

Si ricalcola dopo ogni applicazione e dopo ogni annullamento, **fuori dalla
transazione**: è un dato derivato, e se il ricalcolo fallisse non deve poter
annullare un import corretto. Il peggio che capita è una miglior offerta
vecchia di qualche minuto.

Si ricalcola **da capo** e non a pezzi: aggiornare in modo incrementale
vorrebbe dire tenere il conto di quali offerte sono cambiate, e un conto
sbagliato lascerebbe indicato come migliore un prezzo che non lo è più — senza
che nulla lo segnali.

Un'offerta di cui non si sa quante bottiglie contenga il collo non partecipa:
non ha un prezzo al litro, ha un'ipotesi.

## API

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/price-lists/[id]/summary` | cosa succederebbe, senza applicare |
| `POST` | `/api/price-lists/[id]/apply` | applica, in una transazione |
| `POST` | `/api/price-lists/[id]/revert` | annulla un import applicato |

L'applicazione risponde `409` quando restano righe con la confezione cambiata,
e il messaggio dice quante sono e perché non si decide da soli.

## Verifica

Su una copia usa e getta del database e dello storage di produzione
(`scripts/collaudo-applicazione.ts`), sui listini veri.

| Criterio | Esito |
|---|---|
| un import reale arriva ad `APPLIED` | ✅ 189 offerte, 189 prodotti, 189 prezzi |
| prodotto identico: aggiorna solo il prezzo | ✅ |
| prezzo invariato: nessuna riga nuova | ✅ 189 invariati al secondo giro |
| confezione diversa: finisce in revisione | ✅ blocca l'applicazione e dice perché |
| codice nuovo: crea il prodotto | ✅ |
| due coperture non si cancellano a vicenda | ✅ 0 spariti |
| i prezzi finiscono nello storico | ✅ 189 righe, 189 prezzi correnti |
| gli spariti risultano `active=false` | ✅ disattivato, non cancellato |
| `revert` riporta allo stato precedente | ✅ **fotografia identica al byte** |
| importare due volte non duplica | ✅ secondo tentativo rifiutato |
| il secondo listino richiede meno interventi | ✅ vedi sotto |

## Il momento in cui il progetto fa quello che deve

Applicato il listino Barzelli (141 prodotti), il listino Cecconi è stato
riabbinato contro un catalogo non più vuoto. Quattro righe hanno trovato un
prodotto già esistente:

| Cecconi scrive | Barzelli scriveva | Somiglianza |
|---|---|---:|
| `RECOARO ACQUA BRILLANTE VAP CL.20` | `BRILLANTE RECOARO 1/5 VP` | 0,858 |
| `AMARETTO DI SARONNO 28% LT.1` | `AMARETTO DI SARONNO 1/1` | 0,828 |
| `HAVANA CLUB ESPECIAL RON 40% LT.1` | `HAVANA CLUB ESPECIAL 1/1` | 0,698 |
| `BOLS PEACH 17% CL.70` | `bols PEACH LIQUEUR 0.700` | 0,686 |

Sono gli stessi quattro prodotti, scritti in notazioni completamente diverse —
`1/5` contro `CL.20`, `1/1` contro `LT.1`, `0.700` contro `CL.70` — e il
sistema li propone correttamente, con il formato riconosciuto come identico in
tutti e quattro i casi.

**Restano due offerte distinte**, ognuna col suo codice e il suo storico
prezzi. Sopra ci sta un solo prodotto canonico, ed è quello che rende possibile
la domanda «dove conviene comprarlo» — che è la Fase 11.

## Cosa non c'è, e va detto

La schermata di revisione mostra i conteggi e i due pulsanti, ma **non**
permette ancora di modificare un campo riga per riga né di decidere le
confezioni cambiate dall'interfaccia. Oggi una confezione cambiata blocca
l'applicazione con un messaggio chiaro, ma per sbloccarla serve correggere la
riga altrove.

È il pezzo che manca alla fase, ed è onesto dirlo: sui listini della gelateria
non si è ancora presentato — zero confezioni cambiate su 331 righe — ma si
presenterà.

## Passo successivo

**Fase 11 — confronto prezzi e miglior offerta.** Il dato è già calcolato dopo
ogni import: manca la schermata che risponde a «dove conviene comprarlo», con
il prezzo per litro e per chilo messo a confronto fra fornitori.
