# FASE 9 — Abbinamento e normalizzazione

Data: 2026-08-08 · **in produzione**, quattro criteri su quattro verificati.

## Risultato

Ogni riga di listino arriva con una **proposta**: questo è il prodotto
«ALISEA naturale 50 cl» che hai già in catalogo, oppure è un prodotto nuovo,
oppure non me la sento di decidere e la metto in coda.

La cosa che vale la pena capire, perché è il modello di tutto il progetto:

> L'acqua di Cecconi e l'acqua di Barzelli restano **due offerte distinte**,
> ognuna col suo codice articolo, la sua confezione e il suo storico prezzi.
> Sopra ci sta **un solo** prodotto canonico, che serve unicamente a dire
> «queste due sono la stessa cosa» — ed è quel collegamento a rendere
> possibile la domanda «dove conviene comprarla».

Scollegare è sempre possibile: le due offerte restano intatte coi loro prezzi.

## La cascata

L'ordine non è efficienza, è una gerarchia di certezza. Ogni gradino costa
meno e sbaglia meno del successivo.

| | Metodo | Esito |
|---|---|---|
| 1 | stesso fornitore, stesso codice articolo | non è un abbinamento: è la stessa offerta di prima, si aggiorna |
| 2 | **sinonimo confermato** da una persona | automatico, costo zero |
| 3 | somiglianza alta **e formato identico** | automatico |
| 4 | zona grigia | si propone, decide una persona |
| 5 | niente di credibile | prodotto nuovo |

Il passo con il codice a barre di ANALISI §5 non è implementato: nei listini
veri non ce n'è uno. Cecconi stampa un `EAN:` che ripete il codice interno,
Barzelli non ne ha. Resta nel modello per il giorno che arrivi un fornitore
con GTIN veri.

### Il formato è un cancello, non un punto in più

«Birra XYZ 33cl» e «Birra XYZ 66cl» differiscono di due caratteri: qualunque
misura testuale li dà per identici. Sono due prodotti diversi, e fonderli
metterebbe il prezzo dell'uno nello storico dell'altro **senza che nessuna
schermata lo segnali**.

Quindi il formato non entra nel punteggio: lo azzera. Formati diversi, nessun
abbinamento, qualunque cosa dica il testo. Fra chili e litri non si converte
mai — servirebbe una densità che non abbiamo, e il risultato sarebbe
plausibile e falso.

### Ogni conferma insegna

È il meccanismo che rende la revisione un investimento decrescente invece di
un costo che si ripete:

- **confermare** scrive un sinonimo. Al listino successivo quella descrizione
  si abbina da sola, senza punteggi e senza modelli;
- **rifiutare** scrive un sinonimo *negativo*. Quella proposta sbagliata non
  torna più, e non viene rifiutata di nuovo dalla stessa persona ogni mese;
- **scollegare** un'offerta scrive anch'esso un negativo, così il prossimo
  import non rifà l'abbinamento appena sciolto.

## Le tre correzioni imparate misurando

**Confrontavo `33` con `0,33`.** Il numero nella descrizione sta nell'unità in
cui è scritto: «33 cl» dà 33, «0,33 L» dà 0,33. Senza convertirli entrambi in
unità base risultavano formati diversi, cioè due prodotti diversi, pur essendo
la stessa bottiglia.

**«bottiglia» e «confezione» sporcavano il confronto.** Un fornitore scrive
«bottiglia 0,33L», l'altro «conf. 12pz»: la sovrapposizione di parole scendeva
da 1 a 0,67 su descrizioni che parlano della stessa cosa — abbastanza da
mandare in revisione un abbinamento ovvio.

**E la stessa cosa impediva ai candidati di arrivare.** Ripulire solo al
momento del punteggio non bastava: «xyz birra confezione» non superava la
soglia della query contro «birra xyz», quindi il candidato giusto non entrava
nemmeno nell'elenco da valutare. Va ripulito **prima di cercare**. È la
differenza fra uno su tre e tre su tre dei modi di scrivere la stessa birra.

Le parole di confezione restano comunque nel nome del prodotto, dove servono
alla ricerca del catalogo: si tolgono solo qui.

## L'IA

`decidiDaArbitrato` esiste ed è provato, ma sui dati della gelateria **non
viene mai chiamato**: la zona grigia si risolve con la somiglianza e il
formato. Le regole valgono comunque per il giorno che serva:

- sotto confidenza 0,85 la risposta del modello resta una proposta da
  confermare, non un abbinamento;
- un suo «sono diversi» **non crea un prodotto nuovo da solo**. Sbagliare
  quello è meno visibile che sbagliare un «sono uguali», ma produce due
  duplicati che nessuno noterà mai.

## Le soglie

Stanno in una costante esportata (`SOGLIE_PREDEFINITE`) con i valori di
ANALISI §5.2: automatica 0,92, minima 0,65, confidenza IA 0,85, massimo 5
candidati. Vanno tarate sui dati veri, e chi le tara non deve fare un deploy
per provare un valore — il passaggio a `setting` è il primo lavoro della
prossima fase che le tocchi.

## Cosa **non** fa questa fase

Non crea prodotti, non crea offerte, non tocca prezzi. Le proposte vivono
sulle righe di staging (`price_list_row`), con `match_status` e
`proposed_action`. La riconciliazione col catalogo è la Fase 10, e la
separazione non è formale: un import che scrivesse direttamente sul dominio
non si potrebbe annullare.

## Interfaccia

`/abbinamenti` — la coda di revisione. Mostra di default solo le righe in
dubbio: gli automatici si possono guardare, ma non è lì che serve guardare.

Ogni riga porta **il perché** della proposta, non solo la proposta: «sinonimo
già confermato» e «somiglianza 0,71» sono informazioni diverse. Le quattro
azioni — è questo / non è questo / è nuovo / ignora — stanno tutte sulla riga
e costano un clic: sono decine di righe, e un dialogo per ognuna renderebbe la
revisione un lavoro che nessuno fa.

## API

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/matching/coda?priceListId=&stato=` | le righe che aspettano una decisione |
| `POST` | `/api/matching/[id]/decide` | conferma / nuovo / rifiuta / ignora |
| `POST` | `/api/supplier-products/[id]/detach` | scollega un'offerta dal suo prodotto |

## Verifica

Su una copia usa e getta del database di produzione
(`scripts/collaudo-abbinamento.ts`).

| Criterio | Esito |
|---|---|
| i tre modi di scrivere la stessa birra si abbinano allo stesso prodotto | ✅ 3 su 3, punteggio 0,883 |
| 33 cl e 66 cl non si abbinano mai | ✅ formato incompatibile, prodotto nuovo |
| confermare crea il sinonimo, e al secondo giro basta quello | ✅ da `NUOVO`/trigram a `AUTO`/alias |
| un abbinamento si può annullare e non viene riproposto | ✅ dopo il rifiuto la proposta sparisce |

Verificato anche il caso di Filippo: la stessa acqua da due fornitori diversi
produce due righe con codici diversi (`20561` e `AC900`), entrambe proposte
sullo stesso prodotto canonico. Due offerte, due prezzi, un prodotto.

## Prestazioni

189 righe abbinate in **0,6 secondi**, ognuna con due query trigram. In
sequenza e non in parallelo: venti query in volo insieme prenderebbero le
connessioni che servono al resto dell'applicazione, e il tempo qui non lo sta
aspettando nessuno — gira dentro la lavorazione del listino.

## Passo successivo

**Fase 10 — revisione e applicazione.** La fase che protegge l'integrità di
tutto il sistema: la regola di riconciliazione, la schermata che mostra «12
nuovi, 140 aggiornamenti di prezzo, 3 con la confezione cambiata», e
l'annullamento di un import sbagliato. È da lì che `/prodotti` smette di
essere vuoto.
