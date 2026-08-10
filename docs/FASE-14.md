# FASE 14 — Riepilogo e conferma ordine

Data: 2026-08-10 · **in produzione**. È la fase che trasforma una bozza in un
documento.

## Risultato

Dal pannello dell'ordine si va al **riepilogo**: le righe divise per
fornitore, i subtotali, le segnalazioni, la nota. Premuto *Conferma*, l'ordine
prende un codice — `2026-0001` — passa a `CONFIRMED` e da lì non si modifica
più.

## Perché il riepilogo è una pagina sua

Confermare è la cosa più difficile da disfare di tutta l'app. Un pulsante
dentro il pannello, di fianco al `+`, si preme per sbaglio; una pagina in cui
si arriva apposta no.

E il riepilogo non è una vista più bella dell'ordine: è **l'ultima occasione
di accorgersi di qualcosa**. Per questo le segnalazioni stanno in cima, prima
delle righe.

## Le segnalazioni non bloccano

Quattro cose si dicono e nessuna ferma:

| | |
|---|---|
| **minimo d'ordine non raggiunto** | «bazzelli: 19,50 € su 50 € — mancano 30,50 €» |
| **prezzi cambiati dopo l'aggiunta** | «Amaretto: 16,83 € → 17,20 € (+0,37 €)» |
| **prezzi fermi da troppo** | col mese da cui non si muovono |
| **righe senza confronto** | nessun altro fornitore le vende |

Chi ordina sa cose che l'app non sa — che quel fornitore fa un'eccezione, che
quelle tre bottiglie servono stasera. Un blocco sul minimo d'ordine
impedirebbe proprio l'ordine urgente che si fa comunque, e la reazione a un
blocco che non si può togliere è smettere di usare lo strumento.

## I prezzi si rileggono al momento della conferma

Gli snapshot si riscrivono coi prezzi **correnti**, non con quelli di quando
le righe sono nate. Confermare a prezzi vecchi vorrebbe dire mandare al
fornitore un documento che lui non riconosce, e scoprirlo in fattura.

Ma non si fa in silenzio: il riepilogo li ha già elencati uno per uno, con il
prima, il dopo e la differenza. Un ordine che cambia totale mentre lo si
conferma è il modo più rapido per non fidarsi più dei numeri.

Se nel frattempo un'offerta ha perso il prezzo, la conferma si ferma e dice
quale: mandare una riga senza prezzo è peggio che non mandare l'ordine.

## Il codice

`2026-0042`: l'anno, e un progressivo che riparte da uno a gennaio. È
**l'unico riferimento** che noi e il fornitore abbiamo in comune — finirà sul
PDF, nell'oggetto dell'email, e sarà quello che lui cita al telefono quando
chiama per dire che una cassa manca. Un cuid è unico e illeggibile: nessuno lo
detta a voce.

**Senza buchi.** Il numero si calcola *dentro* la transazione che conferma: se
la conferma fallisce, il numero non è mai stato preso. Un buco nella
numerazione, in contabilità, è una domanda — «e il 41 dov'è?» — e diventa un
problema di fiducia da spiegare ogni volta.

**Massimo più uno, non un conteggio.** Contare quanti ce ne sono darebbe un
duplicato non appena un ordine venisse cancellato, e il duplicato si
scoprirebbe quando due PDF diversi arrivano allo stesso fornitore con lo
stesso numero sopra.

**Ignora ciò che non riconosce.** Un codice scritto a mano letto come «9999»
bloccherebbe la numerazione per sempre.

## Il doppio invio

Due chiamate simultanee risolvono la **stessa** bozza; dentro la transazione
la seconda trova lo stato già cambiato e restituisce l'ordine com'è — stesso
codice, `giaConfermato: true`, nessuna scrittura.

**Senza errore**, di proposito: un errore farebbe pensare che il primo invio
non sia andato, e la reazione naturale sarebbe premere ancora.

Il presidio è doppio: nel browser la seconda richiesta non parte nemmeno,
sul server la transazione la rende innocua. Il primo da solo non basta perché
la rete non è affidabile; il secondo da solo funzionerebbe, ma lascerebbe
partire richieste inutili.

## Verifica

`scripts/collaudo-conferma.ts`, su una copia — 16 controlli:

| Criterio | Esito |
|---|---|
| subtotali e totale generale corretti, IVA inclusa | ✅ righe = gruppi = totale, lordo = netto + IVA |
| gli snapshot si leggono senza il catalogo | ✅ vedi sotto |
| doppio invio non crea due ordini | ✅ cinque conferme simultanee, un codice, zero fallite |
| il codice è progressivo, senza buchi né duplicati | ✅ 0001…0005 di fila |

Il secondo criterio è provato **cancellando ciò che l'ordine referenziava**:
dopo la conferma i prodotti vengono rinominati «NOME CANCELLATO», i fornitori
«FORNITORE RINOMINATO», le offerte disattivate. Il dettaglio dell'ordine
continua a mostrare i nomi di allora e i totali continuano a tornare. È
l'unico modo di provare che il congelamento sia vero e non apparente.

Poi il giro completo nel browser: due prodotti, riepilogo, conferma, ordine
`2026-0001` con la riga «l'ordine è congelato».

## Cosa non c'è, e va detto

La specifica chiede che la conferma **generi anche l'Excel**: quello è la Fase
16, e la schermata dell'ordine confermato lo dice invece di tacerlo.

Modificare quantità e togliere righe **dal riepilogo** non c'è: si torna
all'ordine con un pulsante, dove i comandi ci sono già. Duplicarli in due
schermate significherebbe due posti da tenere allineati per un gesto che si fa
una volta ogni tanto.

Un ordine confermato non si annulla ancora: arriva in Fase 15 insieme allo
storico, dove c'è il posto per farlo.

## Passo successivo

**Fase 15 — storico ordini.** Elenco, filtri, dettaglio congelato, e
«riordina»: duplicare un ordine vecchio ai prezzi di oggi, dicendo cosa è
cambiato.
