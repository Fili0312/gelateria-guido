# FASE 11 — Confronto prezzi e miglior offerta

Data: 2026-08-09 · **in produzione**. È la fase che risponde alla domanda per
cui esiste tutto il resto: **dove conviene comprarlo**.

## Risultato

Una voce nuova nel menu, **Convenienti**: per ogni prodotto la migliore
offerta accanto alla più cara, la differenza al litro o al chilo, e quanto si
risparmia su una confezione. Ordinata per impatto in euro.

E il catalogo non è più muto: ogni riga di `/prodotti` mostra il prezzo, il
prezzo per unità e **la confezione a cui quel prezzo si riferisce**.

## Perché non basta ordinare per prezzo

È l'intera ragione del progetto, e va detta ogni volta:

| | netto | contenuto | al litro |
|---|---:|---:|---:|
| collo da 12 | 9,00 € | 6 L | 1,5000 €/L |
| collo da 24 | **16,00 €** | 12 L | **1,3333 €/L** |
| collo da 6 | 4,20 € | 3 L | 1,4000 €/L |

Ordinando per prezzo netto vince il collo da 6, che è il **peggiore**. Il
migliore è quello col netto più alto di tutti. Un test lo verifica per nome, e
un altro verifica esplicitamente che il netto più basso **non** vinca: se
quest'ultimo si rompe, il progetto ha smesso di fare la sua unica cosa.

## Una regola sola, in tre schermate

`domain/pricing/comparison.ts` è **puro** e decide da solo chi vince. Lo usano
il catalogo, la pagina Convenienti, la scheda prodotto e il ricalcolo di
`product_best_offer`.

Non è pignoleria. Ogni schermata che ordina le offerte per conto proprio
sembra innocua — è pur sempre il prezzo unitario — ma basta una regola diversa
su un pareggio o su un'unità non confrontabile perché due pagine indichino
fornitori diversi come «più conveniente», e **nessuna delle due sembri
sbagliata guardandola da sola**.

Anche il momento di riferimento è un argomento, non `new Date()` preso
dentro: un test che dipende da «oggi» cambia risultato coi mesi, e quando
fallisce non si sa se è colpa del codice o del calendario.

## Cosa si rifiuta di fare

**Confrontare chili con litri.** Servirebbe una densità che non abbiamo, e il
risultato sarebbe plausibile e falso — che è peggio di nessun risultato,
perché un numero falso non si riconosce e un'assenza sì.

**Confrontare una confezione ignota.** Il prezzo al litro di un collo di cui
non si sa quante bottiglie contenga non è un dato: è un'ipotesi.

In entrambi i casi l'offerta non sparisce: finisce fra le escluse **col
motivo**, così l'interfaccia dice *perché* un fornitore non compare invece di
lasciar pensare che non esista.

## Tre cose che si sarebbero potute sbagliare in silenzio

**«Un solo fornitore» non è «pari».** I prodotti senza confronto stanno in un
elenco separato, con scritto perché. Fonderli coi confronti produrrebbe una
tabella in cui non si distingue una scelta fatta da una scelta impossibile.

**I prezzi fermi si dichiarano, non si escludono.** Un prezzo di due anni fa
resta in classifica e può vincere, ma porta un'etichetta. Escluderlo farebbe
sparire un fornitore senza dirlo.

**Le due soglie valgono insieme.** Il 30% su una bottiglia da mezzo euro è
quindici centesimi: un elenco di avvisi pieno di quelli è inutile proprio
quando servirebbe. Perché una riga dica «vale il cambio» deve superare **sia**
la percentuale **sia** gli euro.

## Le impostazioni cominciano a contare

Soglie dell'avviso e mesi oltre i quali un prezzo è fermo erano già nel form
delle impostazioni dalla Fase 1, ma **nessuno le leggeva**. Ora le legge il
confronto.

Chiavi e valori predefiniti stavano in tre posti — la pagina che le mostra,
l'azione che le salva, e adesso il confronto. Sono stati unificati in
`features/settings/schema.ts`: tre copie di una mappa di chiavi divergono, e
divergerebbero in silenzio, perché una chiave scritta diversamente non dà
errore — restituisce il valore predefinito per sempre, e l'impostazione
salvata dall'utente semplicemente non fa niente.

## Il risparmio è un euro vero

Non una proiezione annua: senza lo storico ordini (Fase 15) non si sa quanto
si compra. È **quanto si risparmia su una confezione della migliore** rispetto
alla stessa quantità comprata dalla più cara — un numero che si ricontrolla a
mano, e infatti il collaudo lo ricontrolla: (1,5000 − 1,3333) × 12 L = 2,00 €.

La tabella mette la migliore accanto alla più cara di proposito. Un risparmio
da solo è un numero da credere sulla parola; affiancato a ciò da cui nasce, si
verifica.

## Il ricalcolo, e perché non si legge da `product_best_offer`

Il report si calcola **in diretta** dalle offerte. La tabella denormalizzata
resta, ma serve alla schermata ordine della Fase 12, dove il confronto va
letto per ogni riga di risultato mentre si digita.

Sul report sarebbe stata la scelta sbagliata: `product_best_offer` congela il
giudizio al momento dell'import, e un prezzo diventerebbe fermo senza che
niente lo ricalcoli. Le soglie si applicano **adesso**.

Il ricalcolo ora **scrive solo dove qualcosa cambia**: a dati fermi non tocca
una riga (0 scritture, 10 ms su 142 prodotti). I decimali si confrontano per
valore e non per stringa — il database restituisce `11.10` dove il calcolo
produce `11.1`, e un confronto testuale riscriverebbe tutto a ogni giro,
rendendo la scorciatoia inutile proprio nel caso per cui esiste.

## Il difetto trovato: l'annullamento non funzionava

**Viene dalla Fase 10, ed era in produzione.** `annullaImport` cancella le
offerte create dall'import, ma `product_best_offer` le referenzia: la chiave
esterna blocca la cancellazione e l'annullamento fallisce a metà.

Verificato sulla copia di produzione: premere «Annulla l'import» sul listino
Barzelli applicato l'8 agosto restituiva un errore di vincolo. Non si vedeva
prima perché con il catalogo vuoto nessuna miglior offerta puntava a nulla.

La correzione toglie la miglior offerta prima di cancellare l'offerta; si
ricalcola comunque in fondo alla stessa funzione, quindi non si butta via
niente che non venga riscritto. Dopo la correzione: 141 prezzi, 141 offerte e
141 prodotti rimossi, fotografia identica a quella di partenza.

Il collaudo della Fase 10 ora lo prende: senza la correzione il criterio 9
fallisce. Sono state anche corrette tre sue asserzioni scritte per un catalogo
vuoto, che ora segnavano rosso su comportamenti corretti — un collaudo che
segna rosso a torto insegna a ignorarlo.

## Il difetto trovato: l'abbinamento guarda il catalogo di allora

L'abbinamento avviene **al momento dell'import**, contro il catalogo di quel
momento. Il listino Cecconi è stato caricato quando il catalogo era vuoto:
applicandolo oggi creerebbe 189 prodotti nuovi, compresi quelli che Barzelli
vende già.

Nessuno se ne accorgerebbe. L'import riuscirebbe, i numeri tornerebbero, e
semplicemente non ci sarebbe **mai niente da confrontare** — la pagina appena
costruita resterebbe vuota per sempre senza che nulla lo segnali.

Ora la scheda del listino ha **Ricalcola gli abbinamenti**, e un avviso quando
serve davvero: *nessuna riga si aggancia a un prodotto già a catalogo, eppure
di prodotti ce ne sono N*. Le righe già confermate a mano non si toccano —
ricalcolare non deve poter cancellare una decisione di una persona.

Il segnale giusto è «righe agganciate a un prodotto esistente», non «prodotti
nuovi»: quest'ultimo conta i codici fornitore mai visti e resta alto anche
dopo un aggancio riuscito. Con il segnale sbagliato l'avviso non sarebbe mai
sparito, e si sarebbe premuto il pulsante a vuoto.

Verificato: prima del ricalcolo 0 righe agganciate, dopo 4 — e sono i quattro
articoli che i due fornitori scrivono in notazioni diverse.

## API

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/reports/convenient` | confronti e non-confrontabili, in due elenchi |
| `GET` | `/api/products/[id]/offers` | il confronto di un prodotto |
| `POST` | `/api/admin/recompute-best-offers` | ricalcolo completo |
| `POST` | `/api/price-lists/[id]/rematch` | riabbina un listino in revisione |

## Verifica

`scripts/collaudo-confronto.ts`, su una copia usa e getta.

| Criterio | Esito |
|---|---|
| con 3 offerte il migliore è giusto anche a confezioni diverse (12/24) | ✅ vince il collo da 24, netto più alto di tutti |
| la pagina è ordinata per impatto e filtrabile | ✅ euro, percentuale, nome; per reparto, categoria, fornitore, soglia |
| i non confrontabili sono elencati a parte | ✅ due elenchi, ognuno col motivo |
| il ricalcolo sul catalogo resta sotto qualche secondo | ✅ 710 prodotti in 2,2 s; a dati fermi 10 ms |

Il catalogo vero è troppo piccolo perché il tempo dica qualcosa: il collaudo
lo moltiplica per cinque prima di misurare.

## Cosa non c'è, e va detto

Il **risparmio annuo stimato** richiede lo storico ordini: arriva in Fase 15,
e fino ad allora si mostra solo il risparmio unitario. È scritto anche nella
roadmap, non è una dimenticanza.

Resta aperto dalla Fase 10: la schermata di revisione non permette ancora di
correggere una riga né di decidere una confezione cambiata dall'interfaccia.

## Passo successivo

**Fase 12 — creazione ordine.** La schermata principale: ricerca grande,
aggiunta rapida, barra del totale sempre visibile. È lì che il confronto
appena costruito smette di essere una pagina da consultare e diventa il
suggerimento che compare mentre si ordina.
