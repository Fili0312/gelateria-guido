# FASE 8 — Provider IA e strutturazione delle righe

Data: 2026-08-08 · **in produzione**, sei criteri su sei verificati.

## Risultato, e una sorpresa

Le righe grezze diventano campi con un nome: codice, descrizione, prezzo di
listino, sconti, netto, IVA, formato e confezione.

La sorpresa è come. La roadmap dava per scontato che servisse un modello per
capire quale colonna fosse quale. **Non serve**, almeno su questi listini: un
documento che dichiara prezzo, sconti *e* netto contiene già la prova di quali
colonne siano quali. Basta cercare la combinazione per cui l'aritmetica torna.

```
4,61 × (1−0,06) × (1−0,10) = 3,90
```

Su tutti e tre i listini della gelateria il conto quadra, e **non si chiama
nessun modello**:

| Listino | Righe | Strutturate | Profilo | Chiamate IA |
|---|---:|---:|---|---:|
| Cecconi liquori | 189 | **189** (100%) | dimostrato dall'aritmetica | 0 |
| Barzelli bevande | 142 | **142** (100%) | dimostrato dall'aritmetica | 0 |
| Cecconi vini | 33 | **33** (100%) | dimostrato dall'aritmetica | 0 |

Il criterio della fase chiedeva l'85% al primo giro.

Questo non rende l'IA inutile: la rende **il ripiego invece della regola**. Un
listino che pubblica solo il prezzo finale non permette di distinguere il
prezzo dall'IVA guardando i numeri, e lì si chiede. Tutta l'impalcatura —
provider, cache, contabilità, tetto di spesa — è costruita e collaudata, e
scatta da sola quando serve.

La differenza pratica è fra un'estrazione **dimostrata** e una plausibile. La
schermata le mostra diverse, perché chi rivede un import deve sapere dove
guardare con più attenzione.

## Come si deduce il profilo

`src/server/import/profile/` — puro, senza database e senza rete.

1. **Indizi per colonna.** Per ogni colonna si guarda cosa contiene: quanti
   numeri, quante aliquote IVA plausibili, quanti codici U.M., la lunghezza
   media del testo.
2. **Codice, descrizione, U.M., IVA** si riconoscono da quegli indizi. La
   descrizione è la colonna con il testo più lungo; l'IVA è quella che
   contiene solo 4, 5, 10 o 22.
3. **Prezzo, sconti e netto** si cercano per aritmetica: per ogni coppia
   (listino, netto) gli sconti sono le colonne numeriche in mezzo, e si tiene
   la combinazione con più righe che tornano.
4. Se almeno il **95%** delle righe verificabili conferma, il profilo è
   dimostrato. Altrimenti si chiede al modello.

Lo spazio di ricerca è piccolo di proposito: provare ogni sottoinsieme di
colonne sarebbe esponenziale e non servirebbe — se la disposizione fosse
un'altra, l'aritmetica non tornerebbe e si passerebbe comunque a chiedere.

### Due difetti che ha trovato il collaudo

**I numeri sono allineati a destra.** Cercare le colonne dal solo bordo
sinistro spezzava la colonna del netto in due — `5,25` e `11,90` non
cominciano allo stesso punto — e con le colonne sbagliate l'aritmetica non
poteva tornare da nessuna parte.

Ma la regola non si applica cella per cella, ed è l'errore che ho fatto al
primo tentativo: in Cecconi i codici articolo sono `20561` (numero) e `7A0757`
(non numero), e allinearli su bordi diversi li spediva in due colonne diverse.
Il codice di metà prodotti spariva. **L'allineamento è una proprietà della
colonna**, e si decide guardando quale interpretazione tiene insieme più celle.

**Il profilo salvato applicato alla copertura sbagliata.** Il profilo dei
liquori Cecconi finiva sui suoi vini, che hanno colonne diverse: 0 righe
strutturate su 33. Due correzioni, e la seconda è quella che conta:

- il profilo si cerca per fornitore **e copertura**, non per solo fornitore;
- un profilo archiviato **non si applica mai a scatola chiusa**: si rimette
  alla prova con lo stesso conto che l'aveva dimostrato, e se non regge si
  torna a dedurre. Un fornitore che cambia impaginazione produrrebbe
  altrimenti righe sbagliate per sempre, senza fallire — che è il modo
  peggiore.

## Il profilo per fornitore

Quando è dimostrato, il profilo si archivia in `supplier_import_profile` per
`(fornitore, copertura)`. Dal listino successivo si riusa: verificato, non
creduto.

La versione si incrementa invece di sovrascrivere, così un fornitore che cambia
impaginazione lascia traccia di com'era prima. Un profilo identico al
precedente non crea una versione nuova: un archivio pieno di copie non racconta
niente.

**Un profilo dedotto ma non dimostrato non si salva.** Verrebbe riusato senza
che nessuno lo riveda, e sbaglierebbe in silenzio su tutti i listini successivi.

## La validazione

`src/server/import/validate.ts` — e **non la fa un modello**. Un prezzo
negativo, una confezione a zero o un netto che non torna sono errori di
aritmetica e di dominio, e vanno trovati con l'aritmetica e il dominio.

Nessun problema fa sparire una riga: ognuno diventa una segnalazione con una
gravità. Scartare in silenzio è il modo in cui gli import perdono prodotti
senza che nessuno se ne accorga.

| Regola | Gravità |
|---|---|
| descrizione mancante | errore |
| nessun prezzo ricavabile, o prezzo illeggibile | errore |
| listino ≤ 0, netto negativo | errore |
| confezione non intera o contenuto ≤ 0 | errore |
| netto dichiarato ≠ netto calcolato dagli sconti | avviso |
| prezzo fuori scala rispetto alla mediana del documento | avviso |
| aliquota IVA inesistente in Italia | avviso |
| confezione non dichiarata su un collo (decisione D17) | avviso |

La mediana si calcola **sul documento**, non su una costante: un listino di
semilavorati ha prezzi dieci volte quelli di uno di bibite, e una soglia
assoluta segnalerebbe come sospetto tutto l'uno o niente dell'altro.

### Il netto che non torna

`HENDRICK'S GIN` nel listino Barzelli: 27,48 con −6% e −7% fa 24,0243, ma il
documento dichiara 24,00. Non è un errore di lettura — è il fornitore che ha
arrotondato a modo suo.

**Vale il dichiarato**: è quello che si paga, ed è quello che finirà in
fattura. Ma la discordanza diventa un avviso, non viene ingoiata. È una riga su
142, e sarebbe passata inosservata per sempre.

## Il modello, quando serve

`src/server/ai/` — l'interfaccia `ProviderAi` è tutto ciò che il resto
dell'applicazione conosce. La chiave API vive solo dentro `deepseek.ts`: non
passa dall'interfaccia, non finisce nei log, non va a database.

**Cache.** La chiave contiene la versione del prompt: cambiarlo invalida solo
ciò che da quel prompt dipendeva. Una risposta dalla cache è contabilizzata a
costo zero, e viene servita **anche a budget esaurito** — leggere un appunto
già scritto non costa, quindi non si rifiuta.

**Contabilità.** Ogni chiamata scrive su `ai_call`: token, costo stimato,
latenza, se veniva dalla cache, su quale listino. La scrittura non può far
fallire il lavoro: se non si riesce a registrare, si perde una statistica, non
un import.

**Tetto di spesa.** Controllato prima di ogni chiamata nuova. Superato, la
lavorazione si ferma con un messaggio che dice quanto si è speso e quanto era
il tetto — non continua a spendere.

**Due regole nei prompt**, che spiegano perché sono scritti così: il modello
non calcola mai (niente sconti, niente totali: quelli li fa `decimal.js`), e
non decide ma propone (il codice valida con zod, l'operatore vede).

## Interfaccia

La scheda del listino mostra ora **come** si è arrivati alle colonne, con
parole diverse a seconda della provenienza:

- *dimostrato dall'aritmetica* — su N righe il conto torna;
- *riusato il profilo del fornitore* — riconosciuto su un listino precedente;
- *proposto da un modello* — il documento non dichiara il netto, vale la pena
  controllare qualche riga.

Le righe si vedono con i campi interpretati — codice, descrizione, formato,
listino, sconti, netto, IVA — e una pastiglia rossa o gialla in fondo quando
c'è una segnalazione. Una casella permette di tornare alle celle grezze, che
resta il modo di capire *perché* una riga è stata letta così.

## API

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/ai/usage` | speso, tetto, residuo, esaurito |

La strutturazione non ha un endpoint proprio: avviene dentro la lavorazione
del listino, nelle fasi `STRUCTURING` e `VALIDATING`. Separarla avrebbe
significato poter avere un listino estratto ma non interpretato, cioè uno stato
in più senza nessun uso.

## Verifica

Su una **copia usa e getta del database e dello storage di produzione**,
esercitata via HTTP dal server di produzione con `AI_MOCK=1`.

| Criterio | Esito |
|---|---|
| con `AI_MOCK=1` la pipeline gira senza rete | ✅ tre listini caricati e strutturati, zero traffico |
| ≥85% delle righe strutturate al primo giro | ✅ **100%** su tutti e tre (189, 142, 33) |
| il secondo import usa il profilo e riduce le chiamate di ≥80% | ✅ rilavorazione con `fonte: salvato`, 0 chiamate |
| ogni chiamata tracciata su `ai_call` con costo | ✅ una riga per chiamata; cache a costo zero |
| superato il budget il job si ferma e lo comunica | ✅ `AiBudgetError`: «Tetto di spesa mensile raggiunto: 6.00 di 5.00 dollari» |
| cambiare `AI_PROVIDER` non richiede modifiche al codice | ✅ tre configurazioni, stesso codice |

Verificato anche che la cache non risponda dopo un cambio di versione del
prompt, e che continui a servire a budget esaurito.

Il credito DeepSeek **non è stato toccato**: 1,84 $ prima e dopo.

## Nota sul credito

I tre listini della gelateria non consumano niente. Il tetto di 5 $ e il
credito di 1,84 $ diventeranno rilevanti solo con un fornitore che non si
lascia dedurre — e anche lì si tratta di una chiamata per fornitore, non per
listino.

## Passo successivo

**Fase 9 — abbinamento e normalizzazione.** Le righe strutturate diventano
prodotti canonici e offerte fornitore, con la cascata di abbinamento
(codice → alias → trigram → IA) e la memoria degli abbinamenti già confermati.
