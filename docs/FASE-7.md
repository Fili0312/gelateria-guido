# FASE 7 — Estrazione PDF deterministica

Data: 2026-08-08 · **in produzione**, sette criteri su sette verificati.

## Risultato

Si carica il PDF di un fornitore e si vedono le righe che l'app ne ricava,
**senza una singola chiamata a un modello linguistico**. È la separazione che
la roadmap chiedeva: quando un import andrà storto si potrà dire se ha
sbagliato l'estrazione o l'IA, perché sono due passi distinti e questo è il
primo.

In questa fase non si importa niente. Non si tocca un prezzo, non si crea un
prodotto: si legge, si mostra, si giudica. L'interpretazione dei campi arriva
nella Fase 8, l'applicazione al catalogo nella Fase 10.

## Copertura sui listini veri

Il criterio chiede il 90% delle righe prodotto per ciascun PDF, contate a mano.

| Listino | Pagine | Attese | Trovate | |
|---|---:|---:|---:|---|
| Barzelli (TeamSystem) | 6 | 142 | **142** | 100% |
| Cecconi liquori (iTextSharp) | 9 | 189 | **189** | 100% |
| Cecconi vini e spumanti | 2 | 33 | **33** | 100% |

I conteggi di riferimento stanno in `tests/fixtures/listini/atteso.json` e sono
stati ricavati **a mano dal testo dei documenti**, prima di scrivere il
segmentatore. Non vanno rigenerati da questo codice: misurare un programma con
i numeri che produce lui stesso non misura niente.

Il file registra anche l'errore in cui sono cascato al primo giro: contare i
codici Barzelli con un prefisso di due lettere ne perde sei, perché ne esistono
di tre (`BIR655`, `GEL348`). Il conteggio giusto è 142, non 136.

## Come funziona l'estrazione

Cinque passi, tutti deterministici.

1. **Parole con coordinate.** `pdftotext -bbox-layout` dà ogni parola con la
   sua posizione. Si usa questo e non il solo `-layout` perché il testo
   allineato con gli spazi è già un'interpretazione: poppler decide quanti
   spazi mettere, e due colonne vicine possono fondersi in una.
2. **Righe visive.** Le parole si raggruppano per coordinata verticale, e
   dentro la riga si separano in celle per distanza orizzontale.
3. **Cornice.** Le righe che si ripetono su quasi tutte le pagine **e alla
   stessa altezza** sono intestazioni, non dati.
4. **Colonne.** Una colonna esiste dove molte righe cominciano una cella: non
   si assume un numero di colonne né un ordine.
5. **Classificazione e fusione.** Ogni riga diventa prodotto, sezione o
   ignota; le continuazioni si fondono nella descrizione del prodotto sopra.

### Le quattro regole imparate misurando

Nessuna di queste è venuta da un ragionamento a tavolino. Tutte da un
comportamento sbagliato visto sui listini veri.

**Due numeri adiacenti non stanno mai nella stessa cella.** In Cecconi il
prezzo e il primo sconto distano 5,4 punti — *meno* dei 4,8 che separano due
parole dentro una descrizione Barzelli. La distanza da sola non li separa, e
stringere la soglia spezzerebbe «SAN PELLEGRINO» in due celle. La regola giusta
è di contenuto: in una tabella un numero è sempre un valore a sé. Senza,
`5,25 10,00` restava una cella sola: prezzo letto male e sconto perso.

**Una continuazione deve stare nella colonna della descrizione ed essere la
riga subito sotto.** Servono entrambe. In Cecconi lo stacco fra l'ultimo
prodotto e il blocco dei totali è di 505 punti contro 13 di interlinea: la
distanza basterebbe. In Barzelli è di 19 contro 15, cioè 1,25 interlinee: la
distanza non basta affatto, e senza il vincolo sulla colonna
`Totale ordine: 5.287,11` finiva dentro l'ultimo prodotto del listino. Il
conteggio restava giusto — 189 righe — e l'errore si sarebbe scoperto tre fasi
dopo, come un prezzo sbagliato.

**Il testo a capo va nella cella della descrizione, non in coda alla riga.**
Attaccarlo in fondo dava `… 16,02 22 VAP` invece di `… CL.20 VAP`. Il formato
del prodotto sta proprio dentro quel «VAP» o quel «CL.70», e in fondo alla riga
è irrecuperabile.

**Una cornice deve stare alla stessa altezza, ma non identica su ogni pagina.**
La prima versione pretendeva altezze coincidenti. Sui documenti veri la prima
pagina ha un blocco intestatario più alto, quindi la riga delle colonne sta 85
punti più in basso lì che altrove: il riconoscimento è passato da 8 pattern a
1, e 250 righe di cornice sono rientrate fra i dati. **I prodotti restavano
189**, giusti per caso, perché il classificatore è robusto. Ora si guarda se la
maggioranza delle occorrenze si addensa attorno alla mediana.

Quest'ultimo è il motivo per cui `segment.test.ts` non verifica solo il numero
di prodotti ma anche che la cornice venga riconosciuta e che le righe non
capite restino poche: sono le due cose che quel numero non vede.

### Il caso più insidioso, misurato

Il **28% dei prodotti Cecconi** (53 su 189) ha la descrizione spezzata su due
righe. La roadmap lo chiamava «il caso più insidioso»: non è un caso limite, è
un quarto del listino.

### I codici dichiarati a parte

Cecconi mette sotto ogni prodotto una riga `EAN: 20561`. Su **189 righe su
189** quel numero è identico al codice della prima colonna: non aggiunge
niente. Incollarlo alla descrizione la sporcherebbe, e dalla Fase 9 finirebbe
dentro il nome normalizzato su cui gira la ricerca prodotti.

Viene quindi tolto dalla descrizione e registrato a parte, in
`extracted.codici`. La descrizione resta `ALISEA NATURALE CL.50 PET`, non
`ALISEA NATURALE CL.50 PET EAN: 20561`.

Una riga di questo tipo può essere attribuita **anche attraverso un salto di
pagina**, a differenza di un pezzo di descrizione. La ragione è che si
etichetta da sola: «VAP» in cima a una pagina non dice a chi appartiene,
`EAN: 40201` sì. Sono le sei righe che prima restavano fra le «non capite».

Un test verifica che i due codici coincidano: se un fornitore ci mettesse un
EAN vero e diverso dal codice interno, quel test lo direbbe invece di lasciarlo
buttare via.

## Caricamento

`POST /api/price-lists`, `multipart/form-data`. **Fornitore e nome del listino
sono obbligatori**, e il pulsante resta disabilitato finché mancano.

Il fornitore decide dove finiranno i prodotti. Il nome (`scope_label`) decide
con quale listino precedente il nuovo verrà confrontato: senza, caricare
«liquori» di Cecconi farebbe risultare spariti tutti i suoi vini — il modo
peggiore di sbagliare, perché sembra un aggiornamento riuscito.

Il nome si normalizza subito (minuscolo, spazi compressi), altrimenti
«liquori», «Liquori» e «liquori » diventerebbero tre coperture diverse dello
stesso scaffale. La finestra suggerisce quelli già usati e, quando se ne sceglie
uno esistente, dichiara cosa sostituirà: «Cecconi / liquori — ultimo
caricamento 28/02/2025, fermo da 160 giorni, 189 righe prodotto».

I controlli, in quest'ordine: media type, `Content-Length`, metadati, poi il
file. Se il fornitore manca, la richiesta muore prima che si scriva un byte sul
disco. Il file è riconosciuto dai **primi byte** e non dall'estensione: un
`.doc` rinominato `.pdf` viene respinto subito invece di fallire a valle con un
messaggio che non aiuta.

### Lo storage, e un guasto che ha trovato il collaudo

I PDF sono **indirizzati dal contenuto**: il nome sul disco è lo sha256, mai
quello che aveva sul computer di chi lo carica. Così un nome come
`../../etc/passwd` non tocca il filesystem, e due caricamenti dello stesso file
occupano un posto solo.

Proprio quest'ultima proprietà nascondeva un difetto grave. Al secondo
caricamento dello stesso PDF il file esiste già; la richiesta viene rifiutata
come doppione; e la pulizia dell'errore **cancellava il file — quello del primo
listino, che era buono**. Il listino restava in elenco con il PDF sparito.

Non lo si vedeva da nessuna schermata. È saltato fuori solo perché la prova di
ripresa dopo riavvio non trovava più il file da rileggere. Ora `salvaPdf` dice
se è stato lui a creare il file, e la pulizia tocca solo quello. Il nome
definitivo si crea con `link` e non con `rename`: `rename` sovrascriverebbe in
silenzio, `link` fallisce con `EEXIST`, che è l'informazione che serve ed è
atomica.

## La lavorazione

`import_job` avanza per fasi (`QUEUED → EXTRACTING → SEGMENTING → DONE`),
aggiorna un **battito** a ogni lotto di 100 righe e salva un checkpoint.

Gira dentro il server web, non in un processo a parte. È la scelta giusta a
questa scala — i listini sono uno o due alla settimana e l'estrazione dura
pochi secondi, mentre un worker separato porterebbe una coda, un servizio
systemd in più e un modo nuovo di rompersi. Il prezzo è che un deploy fatto
mentre un import gira lo interrompe a metà, ed è esattamente perché esiste la
ripresa.

`src/instrumentation.ts` gira all'avvio del server e rimette in moto i job il
cui ultimo battito è più vecchio di due minuti. **La ripresa non si fida del
checkpoint**: riparte da quante righe risultano davvero scritte, perché dopo
un'interruzione il database è la verità e il checkpoint è solo un'ipotesi che
poteva non essere stata salvata. L'unicità di
`(price_list_id, page_number, line_number)` garantisce che non si dupliqui
nulla anche se il conteggio fosse in ritardo.

Annullare ferma la lavorazione entro un lotto, ma **non cancella niente**: le
righe già estratte restano visibili. Chi ha fermato un import per sbaglio deve
poter vedere cosa era stato letto fin lì.

## Interfaccia

`/listini` elenca i listini con stato e conteggio; il caricamento è una
finestra con i tre campi obbligatori e il preavviso di sostituzione.

`/listini/[id]` mostra l'avanzamento — che si aggiorna ogni due secondi finché
la fase non è terminale, poi smette — e le righe grezze. Lo stato che conta di
più non è «a che punto è» ma **«sta ancora lavorando?»**: un job senza segni di
vita viene dichiarato interrotto invece di restare per sempre a metà barra.

Le righe si vedono per tipo, e il contatore delle **non capite** è sempre in
vista e cliccabile. È il numero che dice se l'estrazione ha funzionato:
mostrare solo ciò che il programma ha riconosciuto darebbe sempre l'impressione
che sia andata bene, e nasconderebbe proprio il caso da guardare.

## API

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/price-lists?q=&supplierId=&status=` | elenco, `200` |
| `POST` | `/api/price-lists` | carica ed estrae, `201` |
| `GET` | `/api/price-lists/[id]` | scheda + stato lavorazione, `200` |
| `GET` | `/api/price-lists/[id]/rows?tipo=&pagina=` | righe grezze, `200` |
| `POST` | `/api/price-lists/[id]/cancel` | ferma la lavorazione, `200` |
| `GET` | `/api/price-lists/coperture?supplierId=` | coperture già usate, `200` |

Codici: `400` dati non validi, `401` sessione assente, `403` origin non
fidato, `404` inesistente o di un'altra organizzazione, `409` file già
caricato, `413` oltre 20 MB, `415` non multipart.

## Verifica

Tutti i criteri sono stati verificati su una **copia usa e getta del database e
dello storage di produzione**, esercitata via HTTP dal server di produzione.

| Criterio | Esito |
|---|---|
| non si carica senza fornitore e nome | ✅ tre tentativi, tre errori sul campo giusto |
| dice quale listino sostituirà e da quando è fermo | ✅ endpoint coperture, con data e conteggio |
| i PDF della Fase 0 producono righe grezze | ✅ 142, 189, 33 prodotti |
| copertura ≥90% per PDF | ✅ 100% su tutti e tre |
| un PDF scansionato dà un errore chiaro | ✅ «Il PDF sembra scansionato… Serve il file originale del fornitore» — servizio ancora vivo |
| ricaricare lo stesso file viene rifiutato | ✅ `409`, con data e copertura del caricamento originale |
| il job sopravvive a un riavvio e riprende | ✅ troncato a 92/212, servizio riavviato, ripreso e finito a 212 con 0 duplicati |

Il PDF scansionato è stato costruito rasterizzando una pagina vera in
un'immagine e incapsulandola in un PDF senza testo: è esattamente ciò che
produce uno scanner.

Le due schermate nuove sono state aperte con un browser vero e non hanno errori
di console — il controllo che nella Fase 6 aveva scoperto un guasto invisibile
al codice di test.

## Note tecniche

**`server-only` e i test.** I moduli di server dichiarano
`import 'server-only'`, che fuori da Next lancia un'eccezione: è il marcatore
che impedisce di importarli da un componente client. Per poterli provare, la
suite gira con `--conditions=react-server`, la stessa condizione con cui Next
risolve i moduli quando rende un componente server. È il modo di provarli
**come girano davvero**, invece di togliere il marcatore.

**nginx.** Il blocco `/gelateria/` accetta già 25 MB con timeout a 300 secondi.
Il limite dell'app è 20 MB, quindi il messaggio che l'utente vede è quello
dell'app e non un errore secco del proxy.

**Nessuna migrazione.** `price_list`, `price_list_row` e `import_job` erano già
nello schema dalla Fase 2.

## Passo successivo

**Fase 8 — provider IA e strutturazione delle righe.** Da qui in avanti serve
la chiave DeepSeek con del credito: al 2026-08-08 il conto ha 1,84 $, condivisi
con il progetto `china`.
