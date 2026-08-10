# FASE 16 — Documenti d'ordine

Data: 2026-08-10 · **in produzione**. È la fase in cui l'app smette di essere
uno strumento d'analisi e diventa quella con cui si ordina.

## Risultato

Da un ordine confermato, il pulsante **Genera i documenti** produce un PDF per
ogni fornitore — coi suoi articoli, i suoi codici e il suo totale — più il
riepilogo dell'ordine intero in Excel. Si scaricano uno a uno o tutti insieme
in uno zip.

Provato sull'ordine vero `2026-0001`: due PDF (bazzelli 43 kB, cecconi 46 kB)
e un Excel da 8 kB.

## Il PDF

Tre cose contano più dell'aspetto.

**Il codice è il suo, non il nostro.** Il fornitore cerca a magazzino per il
proprio codice articolo; il nostro identificativo non lo sa nessuno e su carta
non serve a niente. Il collaudo verifica entrambe le metà: i nove codici del
fornitore ci sono tutti, e i nostri id non compaiono.

**Le quantità sono in confezioni, coi pezzi accanto — sempre.** La prima
versione lasciava la colonna «Pezzi» vuota quando la confezione era da uno, e
restava un «2» solitario che si legge benissimo come due casse. L'errore costa
un rientro merce e una telefonata.

**Il totale in fondo è il suo.** I gruppi che arrivano al template sono già
solo i suoi, e i totali descrivono per costruzione i gruppi presenti: non c'è
modo che in fondo alla pagina compaia la cifra dell'ordine complessivo. Chi
riceve legge l'ultimo numero in basso, e quel numero dev'essere quello che
paga lui.

## Cosa si congela e cosa no

**Righe, prezzi, descrizioni e nome del fornitore: dagli snapshot.** Sono
l'accordo commerciale.

**Indirizzo, partita IVA ed email del fornitore: da adesso.** Non sono
l'accordo, sono il recapito — e il documento serve a mandarlo. Congelare
l'indirizzo vorrebbe dire ristampare un ordine e spedirlo alla sede vecchia.

## Rigenerare non sovrascrive

Ogni generazione ha una cartella sua, `exports/<ordine>/<generazione>/`. Chi ha
già mandato un PDF e poi rigenera deve poter tornare a vedere **esattamente**
il file che ha mandato: quando il fornitore contesta una riga si discute su
quel documento, e deve esserci ancora. In elenco la generazione più recente sta
in cima, le precedenti sotto, sbiadite.

## Perché generare è un gesto e non un effetto della conferma

Confermare e stampare falliscono per ragioni diverse — un prezzo sparito la
prima, un browser che non parte la seconda. Legarle significherebbe che
Chromium impedisce di confermare un ordine. Separate, un guasto della stampa
lascia l'ordine confermato e si ritenta il documento.

## Un formato nuovo non esce da `server/export/`

`DocumentTemplate` dichiara `key`, `label`, `format`, `ambito`, `nomeFile` e
`build`; il registro è l'unico elenco. API, schermate e zip non nominano mai un
template: lo chiedono al registro. Il collaudo lo verifica con un `grep`, non a
parole — nessun file fuori da `server/export/` contiene una chiave.

L'`ambito` (`per-fornitore` / `unico`) lo applica l'orchestratore: quando il
template viene chiamato i gruppi che riceve sono già quelli giusti, e non può
sbagliare a filtrare mandando a Cecconi le righe di Barzelli.

## Il PDF si stampa col browser

Il template è una pagina HTML, stampata dal Chromium che sul server c'è già.
Una libreria di disegno PDF vorrebbe dire posizionare rettangoli a mano e
gestirsi le interruzioni di pagina su una tabella lunga. Il prezzo è un
processo esterno, e si paga **una volta per infornata**: tre fornitori costano
un avvio, non tre.

Due cose sono venute fuori solo in produzione, e in produzione soltanto:

**Chromium stava sotto `/root/.cache`**, dove `gelateria-app` non arriva. Ora
c'è una copia condivisa in `/opt/ms-playwright`, indicata da `CHROMIUM_PATH`
nell'env del servizio.

**`HOME=/nonexistent`.** È la scelta giusta per un demone, ma Chromium ci vuole
scrivere il crashpad e senza riuscirci muore all'avvio, con un errore
(`--database is required`) che non ha niente a che vedere con la causa. La
correzione è nel codice e non nell'unità systemd: è un'esigenza di Chromium,
non del servizio.

**Il sandbox resta acceso.** La prima stesura lo spegneva «perché gira da
root»: il servizio gira come `gelateria-app`, la motivazione era falsa e la
barriera si buttava via per niente. Si disattiva solo girando da root, cioè
negli script di collaudo, dove Chromium altrimenti si rifiuta di partire.

## Il guasto trovato provando a salvare

L'intestazione dei documenti sono cinque campi nuovi in Impostazioni. Per
evitare di rileggerli a mano — il difetto che aveva fatto sparire lo sconto del
fornitore — l'elenco dei campi si ricava dallo schema. Solo che l'elenco era
esportato dal file `'use server'` dell'azione, e **un modulo `'use server'` può
esportare soltanto funzioni asincrone**.

Compilava. Passava il build. Poi dava 500 al primo salvataggio, e non si
salvava più **nessuna** impostazione, nemmeno le soglie che c'erano da mesi.

È saltato fuori solo perché il collaudo salva davvero dal form e ricarica la
pagina per rileggere. Ora la validazione sta in `features/settings/schema.ts`,
e un test scandisce i file `'use server'` verificando che esportino solo
funzioni asincrone — provato sul difetto vero: rimettendo l'export, fallisce.

## Verifica

`scripts/collaudo-documenti.ts`, su una copia — 40 controlli.

| Criterio | Esito |
|---|---|
| un ordine con 3 fornitori dà 3 PDF, ciascuno coi soli suoi prodotti | ✅ e nessuna riga degli altri |
| i nomi contengono fornitore e data, e sono ordinabili | ✅ vedi sotto |
| il PDF mostra il codice articolo del fornitore, non il nostro | ✅ 9 su 9, e nessun id interno |
| i totali di ogni PDF coincidono al centesimo con l'app | ✅ e il totale complessivo non compare |
| l'Excel riepilogativo apre senza avvisi | ✅ i numeri sono numeri, la somma torna |
| i documenti si riscaricano identici dallo storico | ✅ anche dopo aver distrutto ciò che referenziavano |
| aggiungere un template non richiede modifiche fuori da `server/export/` | ✅ verificato col grep |

I PDF si verificano **leggendone il testo** con `pdftotext`. Un PDF da 46 kB
con dentro le righe del fornitore sbagliato pesa esattamente quanto uno giusto.

Il criterio 1 vuole tre fornitori e in produzione ce ne sono due a listino: il
collaudo se ne fabbrica un terzo invece di accontentarsi. Con due soli, un PDF
che contenesse tutto sarebbe indistinguibile da uno che contiene il complemento
dell'altro.

Sui nomi, il controllo «comincia con la data» non distingue la data di conferma
da quella di oggi finché coincidono. Si retrodata la conferma a marzo e si
rigenera: il nome deve seguire l'ordine, non l'orologio.

Il congelamento si prova come nella Fase 15, distruggendo ciò che il documento
referenziava — fornitori rinominati, prodotti disattivati — e riscaricando: gli
stessi byte, e dentro nessuna traccia dei nomi nuovi.

## Cosa non c'è, e va detto

**L'intestazione è vuota.** I cinque campi in Impostazioni ci sono e si
salvano, ma nessuno li ha compilati: al momento il PDF ripiega sul nome
dell'organizzazione, «Gelateria Guido», senza indirizzo né partita IVA. Vanno
messi prima di mandare un documento a un fornitore.

**I nomi dei fornitori sono in minuscolo** — «bazzelli», «cecconi» — come sono
in anagrafica. Su un documento che esce si legge male. Correggerli in
anagrafica li corregge dappertutto; non li aggiusta il template, perché
sistemare i nomi a scrittura automatica rovina i «d'» e le sigle.

**Il CSV** è previsto dal modello (`DocumentFormat`) ma nessun template lo
produce: serve quando un fornitore chiederà il suo tracciato, e inventarlo
adesso significherebbe indovinarlo.

## Passo successivo

**Fase 17 — invio automatico ai fornitori.** È l'ultimo passo dell'MVP: il PDF
che parte da solo all'indirizzo ordini del fornitore. Serve prima
l'autorizzazione alle credenziali SMTP Aruba — finché non arriva, la posta
resta in modalità `log`.
