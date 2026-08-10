# FASE 15 — Storico ordini

Data: 2026-08-10 · **in produzione**. Ritrovare e riusare quello che si è
ordinato.

## Risultato

**Ordini fatti** (`/ordini/storico`): elenco paginato con filtri per stato,
fornitore, periodo e **ricerca per prodotto contenuto**. Aprendone uno si
vede l'ordine congelato; da lì si **riordina** o si **annulla**.

## Il dettaglio non tocca il catalogo

Nessun `select` della query che legge un ordine passa da prodotti, offerte o
fornitori: tutto viene dagli snapshot. È la ragione per cui gli snapshot
esistono, e basta una join di comodo perché un ordine di sei mesi fa cominci a
mostrare il nome di oggi.

Il collaudo lo prova **facendo passare i sei mesi**: dopo la conferma raddoppia
tutti i prezzi, rinomina i prodotti «RINOMINATO DOPO», i fornitori «FORNITORE
CAMBIATO» e disattiva un'offerta. Poi riapre l'ordine e verifica che il totale,
i nomi, i fornitori e ogni singola riga siano ancora quelli di allora.

## Riordina

Rimette le righe nella bozza, e le due cose che lo rendono affidabile invece
che soltanto comodo:

**Ai prezzi di oggi.** Riordinare a prezzi vecchi darebbe una bozza che cambia
totale alla conferma, e la conferma è dove non si vogliono sorprese.

**Dicendo cosa non si è potuto rimettere**, articolo per articolo e col
motivo: «il fornitore non lo tiene più a listino», «non ha più un prezzo
corrente», «l'articolo non è più a catalogo». Un riordino che salta tre righe
in silenzio è peggio di uno che fallisce — la mancanza si scopre alla consegna,
quando non si può più fare niente.

E dice anche cosa è cambiato di prezzo, col prima e il dopo. Sul collaudo, coi
prezzi raddoppiati: 2 copiate, 2 cambiate, 1 saltata, ognuna col suo perché.

L'esito resta sullo schermo finché non si va via. Sono le informazioni per cui
si è premuto, e un toast che sparisce dopo tre secondi le porta con sé.

## Annullare non è cancellare

Un ordine annullato **resta**, col suo numero e col suo contenuto, e lo stato
dice cosa è successo. Cancellarlo lascerebbe un buco nella numerazione e
nessun modo di sapere se era stato mandato.

Annullarlo due volte non cambia la data del primo annullamento: la seconda
pressione non deve riscrivere quando è successo.

## Le bozze non sono ordini

L'elenco esclude i `DRAFT`. Una bozza non è un ordine: è un ordine che non è
ancora successo, e contarla insieme alle altre gonfierebbe la spesa del mese
con una spesa che nessuno ha fatto.

## La paginazione c'è da subito

Non «quando serviranno»: un elenco che cresce di un ordine al giorno diventa
illeggibile fra un anno, e aggiungerla dopo vuol dire rifare una schermata che
è già in uso.

## Verifica

`scripts/collaudo-storico.ts`, su una copia — 21 controlli.

| Criterio | Esito |
|---|---|
| un ordine vecchio mostra i prezzi di allora | ✅ prezzi raddoppiati, nomi cambiati, fornitore rinominato: l'ordine non si muove |
| «riordina» crea una bozza corretta e segnala le differenze | ✅ 2 copiate ai prezzi nuovi, 2 differenze dichiarate, 1 saltata col motivo |
| i filtri funzionano su un volume realistico | ✅ vedi sotto |

Il filtro per fornitore si prova con **due** fornitori: uno che negli ordini
c'è e uno che non c'è. Provarlo solo col primo non distingue un filtro che
funziona da uno che non filtra affatto — ed è successo: il primo giro passava
mostrando tutti e sette gli ordini.

Poi il giro completo nel browser: conferma, dettaglio `2026-0002` con la riga
del congelamento, riordino, elenco con due ordini.

## Cosa non c'è, e va detto

La **riscarica dell'Excel** che la specifica elenca qui non c'è: quel file lo
genera la Fase 16, e non esiste ancora niente da riscaricare. La pagina lo
dice invece di tacerlo.

Gli stati `SENT` e `RECEIVED` esistono nel modello e nei filtri, ma nessuno li
imposta: `SENT` arriverà con l'invio email della Fase 17. Metterli nei filtri
adesso costa nulla e evita di rifare la schermata dopo.

## Passo successivo

**Fase 16 — un PDF per fornitore.** È il punto in cui l'app smette di essere
uno strumento d'analisi e diventa quello con cui si ordina davvero: da un
ordine confermato, un documento per ogni fornitore, pronto da mandare.
