# Manuale rapido — Gelateria Guido

## 1. Preparare fornitori e catalogo

Da **Fornitori** crea o completa l'anagrafica: nome, recapiti, minimo d'ordine,
giorni di consegna e sconto extra. L'indirizzo dell'ufficio ordini viene
riportato nei documenti; l'invio email dall'app e' attualmente in pausa.

Il **Catalogo** contiene un prodotto canonico per articolo e formato. Le
descrizioni e i codici dei singoli fornitori restano nelle offerte collegate:
non rinominare un prodotto per farlo assomigliare a un solo listino.

## 2. Caricare e applicare un listino

1. Apri **Listini**, premi **Nuovo listino**, scegli fornitore e copertura e
   carica il PDF.
2. Attendi che la lavorazione arrivi a **Revisione**.
3. Controlla righe non capite, errori, variazioni anomale e confezioni.
4. In **Confronti**, decidi gli abbinamenti ambigui: conferma il prodotto
   proposto, rifiutalo, creane uno nuovo oppure escludi esplicitamente la riga.
5. Torna al listino e leggi il riepilogo prima di premere **Applica al
   catalogo**. Il pulsante resta bloccato finche' esistono decisioni o errori
   irrisolti.

L'applicazione non cancella gli articoli scomparsi: li rende inattivi e conserva
prezzi e ordini passati. Un import nuovo si puo' annullare soltanto finche'
resta l'ultimo di quel fornitore e i dati coinvolti non sono stati modificati o
usati in seguito. In caso contrario carica un listino correttivo.

## 3. Confrontare i prezzi

**Confronti** ordina le offerte sul costo per unita' confrontabile, non sul
solo prezzo del collo. I prodotti con un solo fornitore, un prezzo mancante o
una confezione incerta sono elencati a parte: non sono considerati
automaticamente convenienti. Un prezzo vecchio viene segnalato come fermo.

Dalla scheda prodotto si vedono offerte, storico prezzi e statistiche degli
acquisti. Le statistiche usano i valori fotografati negli ordini confermati,
quindi non cambiano quando arriva un listino successivo.

## 4. Preparare un ordine

1. Apri **Ordini**, cerca o filtra i prodotti e aggiungi le confezioni.
2. Se compare **Lo trovi a meno**, valuta il cambio fornitore; l'app ricalcola
   le confezioni equivalenti prima di modificare la riga.
3. Apri il **Riepilogo** e controlla minimi, prezzi cambiati, prezzi fermi,
   righe senza confronto e totale per fornitore.
4. Inserisci l'eventuale nota e premi **Conferma ordine** una sola volta. Anche
   in caso di doppio clic o risposta di rete persa viene creato un solo ordine.
   Se righe o prezzi sono cambiati dopo l'apertura del riepilogo, la conferma
   viene rifiutata: ricarica e ricontrolla.
5. Nel dettaglio dell'ordine genera i **PDF per fornitore** e il riepilogo
   **Excel**. Scaricali e inviali manualmente.

## 5. Storico e correzioni

Da **Storico ordini** puoi filtrare, riaprire un ordine, rigenerare i documenti,
annullarlo senza cancellarlo oppure copiarlo nella bozza ai prezzi correnti.
Il riordino dichiara gli articoli saltati e sostituisce la bozza solo se tutta
l'operazione riesce.

La **Panoramica** mostra spesa e code di lavoro. Ogni numero e' un collegamento:
aprilo per correggere il dato che lo compone, invece di trattarlo come una
statistica isolata.

## 6. Se qualcosa non torna

- Non forzare un'applicazione o una conferma rifiutata: il messaggio indica il
  dato cambiato o ancora da decidere.
- Non ricaricare lo stesso PDF con un nome diverso: il file duplicato viene
  riconosciuto apposta.
- Per un errore di import gia' seguito da altro lavoro, usa un listino
  correttivo; non cancellare prezzi dal database.
- Per un guasto del servizio annota ora, schermata e operazione. La procedura
  tecnica di controllo, backup e ripristino e' in `docs/OPERAZIONI.md`.

