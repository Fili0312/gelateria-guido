# FASE 12 — Creazione ordine

Data: 2026-08-09 · **in produzione**. È la schermata principale: quella che si
apre per fare la spesa, e che deve essere veloce fino a sembrare banale.

## Risultato

Una barra di ricerca grande col fuoco già dentro. Si scrive, si preme Invio,
il prodotto è nell'ordine. In fondo allo schermo una barra dice sempre
«1 prodotto · 2 confezioni · 29,08 €», e si apre sul riepilogo senza lasciare
la ricerca.

Accanto a ogni risultato c'è già scritto **da chi conviene comprarlo** — è la
Fase 11 che smette di essere una pagina da consultare e diventa un
suggerimento che compare mentre si ordina.

## Due interazioni

Il criterio dice «≤2 interazioni da ricerca ad aggiunto». Sono: **scrivere** e
**premere Invio**. Non c'è un passo di conferma, non c'è una scheda da aprire,
non c'è un menu da cui scegliere il fornitore — il più conveniente è già
proposto, e gli altri stanno sotto «Altri N fornitori» per chi vuole cambiare.

Perché funzioni, ogni riga deve bastare a decidere senza aprire nulla: nome,
formato, prezzo della confezione, prezzo al litro, fornitore, badge del
miglior prezzo. Un elenco che costringe ad aprire una scheda per sapere il
prezzo raddoppia i gesti per ogni articolo, e un ordine ne ha trenta.

## Tre accorgimenti sulla velocità percepita

Non è la velocità del server, ed è quella che conta.

**Debounce a 150 ms.** Senza, si parte a ogni tasto: dieci richieste per
«amaretto», nove inutili, e la decima in coda dietro le altre.

**Annullamento della richiesta precedente.** Senza, le risposte tornano fuori
ordine e l'elenco mostra i risultati di «amar» mentre nel campo c'è scritto
«amaretto». È il difetto peggiore di una ricerca a digitazione, perché sembra
che l'app abbia capito male.

**Aggiornamento ottimistico con ritorno indietro.** La quantità cambia subito
e la richiesta parte dietro; se fallisce si torna esattamente allo stato di
prima e lo si dice. Aspettare il server a ogni `+` costa duecento
millisecondi per clic, e su trenta righe sono trenta attese.

Una richiesta sola per battuta, non due: la ricerca restituisce già le offerte
confrontate, il prezzo, il fornitore migliore **e** quante confezioni sono già
nell'ordine. Una ricerca più una chiamata per riga non starebbe dietro a chi
digita.

## Il difetto trovato: le aggiunte simultanee si perdevano

Il primo giro del collaudo lanciava dieci aggiunte simultanee e le lasciava
fallire in silenzio con un `catch`. Sopravviveva una riga, sembrava tutto a
posto — e **nove confezioni erano sparite**.

La causa era l'isolamento serializzabile: dieci transazioni sulla stessa riga
d'ordine si abortiscono a vicenda, e con tre tentativi qualcuna non ce la fa.
Il numero di tentativi non è la soluzione: sposta solo la soglia.

La soluzione è **prendere il lock sulla riga dell'ordine** all'inizio di ogni
modifica e passare a `read committed`. Chi arriva dopo aspetta, e quando entra
vede tutto ciò che il precedente ha scritto — quindi legge le righe giuste,
somma i totali giusti e non duplica niente.

Nel farlo è emerso il secondo inganno: l'aggiornamento a vuoto
`update({ data: {} })` **non prende nessun lock**, perché Prisma non emette
alcuna `UPDATE` quando non c'è niente da aggiornare. Sembrava serializzato e
non lo era: quattro aggiunte su dieci fallivano sul vincolo di unicità. Serve
una scrittura vera — si tocca `updatedAt`, che è anche corretto nel merito.

Ora dieci aggiunte simultanee danno una riga sola con quantità dieci, e
nessuna fallisce.

## Cosa succede aggiungendo due volte lo stesso articolo

Non nascono due righe: il vincolo `(ordine, offerta)` lo impedisce a livello
di database, non solo di interfaccia. La seconda aggiunta **aumenta la
quantità**, che è quello che si intende ricercando di nuovo lo stesso
articolo. Contro il doppio clic accidentale c'è un secondo presidio nel
browser: una mutazione già in volo per quella offerta non ne fa partire
un'altra.

## Cosa non si può ordinare

Un'offerta **senza prezzo corrente** viene rifiutata con un messaggio scritto:
si finirebbe con una riga il cui totale è zero e nessuno saprebbe quanto
costa. Un prodotto in quello stato **resta comunque nei risultati**, con
scritto perché non si può aggiungere — farlo sparire farebbe cercare ancora.

Un'offerta non più a listino viene rifiutata allo stesso modo.

## I totali

Si calcolano in un modulo puro (`domain/orders/totals.ts`) e si ricalcolano
**sempre dalle righe**, mai a incrementi: un totale aggiornato per differenza
diverge alla prima operazione persa, e diverge in silenzio.

L'invariante è quella della fattura: `totale riga = prezzo della confezione ×
numero di confezioni`. Il prezzo al litro **non entra nel conto** — serve a
scegliere il fornitore, non a fatturare.

Si arrotonda per riga e poi si somma, perché è così che si legge un ordine
stampato: chi controlla somma le righe che vede. Senza aliquota IVA
dichiarata l'IVA resta zero e non si suppone il 22%: un'aliquota inventata
produce un totale credibile e sbagliato, cioè quello che nessuno ricontrolla.

La barra mostra i numeri che **arrivano dal server** dopo ogni modifica, non
una somma fatta nel browser: due conti diversi sullo stesso ordine
divergerebbero al primo arrotondamento.

## Perché si fotografa tutto

Nome, fornitore, codice, confezione, prezzo e IVA finiscono nella riga come
copie. Un ordine è un documento: se domani il fornitore cambia listino,
l'ordine di ieri deve continuare a dire cosa si era ordinato e a che prezzo.
Leggere il prezzo dal listino al momento della stampa darebbe un documento che
cambia da solo.

Si fotografa anche **cosa diceva il confronto**: se si è comprato dal più
caro, la riga dice chi era il più conveniente e di quanto. Senza, un ordine
riletto fra un mese non si sa giustificare.

## Verifica

Due collaudi, perché i criteri sono di due tipi diversi.

`scripts/collaudo-ordine.ts` — su una copia usa e getta, 23 controlli:

| | Esito |
|---|---|
| due letture trovano la stessa bozza | ✅ |
| cinque richieste simultanee creano una bozza sola | ✅ |
| aggiungere due volte non crea due righe | ✅ 2 + 1 = 3 |
| dieci aggiunte simultanee: nessuna persa | ✅ una riga, quantità 10 |
| la somma delle righe è il totale, anche nel database | ✅ |
| ogni riga vale prezzo × confezioni | ✅ |
| un'offerta senza prezzo è rifiutata, e dice perché | ✅ |
| una sessione nuova ritrova la stessa bozza | ✅ |
| i totali per fornitore sommano al totale | ✅ |

Il collaudo del browser (Playwright, sull'app vera) copre i criteri che sono
affermazioni su cosa succede premendo:

| Criterio | Esito |
|---|---|
| da ricerca ad «aggiunto» in ≤2 interazioni | ✅ scrivere, Invio |
| l'ordine sopravvive a refresh e cambio dispositivo | ✅ |
| i totali della barra sono coerenti con le righe | ✅ al centesimo |
| tutto utilizzabile con la sola tastiera | ✅ ↑↓, Invio, Tab |
| su tablet nessun bersaglio troppo piccolo | ✅ tutti ≥ 44×44 |

Il collaudo del browser ha trovato due bersagli sotto i 44 px — la casella
«Solo con più fornitori» e il pulsante «Altri N fornitori», entrambi alti
sedici pixel. Su tablet si ordina col dito, e mancare quel pulsante significa
aprire il prodotto sbagliato.

Ne ha anche trovati tre falsi, tutti miei: due blocchi che si sporcavano lo
stato a vicenda e un confronto fra la somma dei netti e il totale **lordo**,
che dava uno scarto del 22% — cioè esattamente l'IVA, non un errore di
calcolo.

## Cosa non c'è, e va detto

I filtri rapidi della specifica sono a metà: c'è «solo con più fornitori» e la
ricerca copre nome, sinonimo, descrizione del fornitore e codice, ma non ci
sono ancora «per categoria» e «già ordinati di recente» nell'interfaccia — il
secondo richiede lo storico ordini, che arriva in Fase 15. I parametri esistono
già nell'API.

Non c'è la griglia con le foto: la lista densa è il default della specifica, e
le foto dei prodotti non ci sono ancora.

## Passo successivo

**Fase 13 — avviso prezzo migliore.** Il suggerimento che compare *mentre* si
aggiunge, quando si sta scegliendo un fornitore che costa più di un altro:
«Barzelli lo fa a 0,26 € in meno — vuoi cambiare?», col ricalcolo delle
confezioni equivalenti quando i formati non coincidono.
