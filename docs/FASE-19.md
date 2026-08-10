# FASE 19 — Dashboard

Data: 2026-08-10 · **completata**.

## Risultato

La panoramica ora espone dati operativi reali e collegati al dettaglio:

- spesa mensile degli ultimi dodici mesi e ripartizione per reparto;
- prodotti con maggiore impatto di spesa e fornitori più utilizzati;
- maggiori aumenti fra prezzo corrente e prezzo precedente;
- risparmio potenziale annuo sui consumi osservati;
- ultimi listini caricati col loro stato effettivo;
- prodotti senza confronto e offerte realmente sparite dai listini;
- code di lavoro da completare.

Ogni riquadro e ogni riga porta a ordini, prodotto, fornitore, listino o report
«Convenienti». I numeri non sono elementi decorativi senza una strada per
verificarli.

## Storico: valori congelati, associazione aggiornata

Spesa, quantità, confezioni, nomi di prodotti e fornitori arrivano dagli
snapshot delle righe confermate. Un prezzo o un nome cambiato oggi non
riscrive quindi i mesi passati.

L'attribuzione al prodotto canonico segue invece
`supplier_product.productId`: se un'offerta è stata abbinata o rimappata dopo
l'ordine, quello storico entra nel prodotto corretto. `order_line.productId`
resta un ripiego quando oggi l'offerta non è collegata. Il reparto segue la
stessa precedenza; non esiste uno snapshot storico della tassonomia.

Entrano soltanto ordini `CONFIRMED`, `SENT` e `RECEIVED`. Bozze e annullati non
gonfiano consumi e spesa.

## Classifiche confrontabili

«Prodotti più acquistati» è ordinato per spesa netta, non per numero di pezzi:
mille coni, dodici bottiglie e un secchio da cinque chili non hanno una unità
comune. Pezzi, confezioni e numero di ordini restano visibili dentro ogni riga,
ma non vengono confrontati fra articoli incompatibili.

I fornitori sono ordinati per spesa netta e mostrano anche quota, ordini e
confezioni. Nomi e importi sono quelli fotografati al momento dell'acquisto.

## Risparmio potenziale annuo

Il totale riusa lo stesso helper puro delle statistiche prodotto. Per ogni
prodotto:

1. ricostruisce il consumo fisico dagli snapshot (`quantità × confezione ×
   formato`);
2. converte correttamente cl/litri, g/kg o pezzi;
3. annualizza il periodo osservato;
4. applica la differenza unitaria corrente fra migliore e più cara del dominio
   «Convenienti».

Unità miste o incompatibili vengono escluse invece di produrre una stima
plausibile e falsa. L'interfaccia dichiara che è un potenziale massimo: minimi
d'ordine, consegne e altri vincoli possono rendere ragionevole un fornitore
diverso.

## Mesi e fuso della gelateria

I mesi sono civili in `Europe/Rome`, non nel fuso del server. Per esempio un
ordine del 31 agosto alle 22:30 UTC è già del primo settembre in Italia e
finisce nella barra di settembre. Anche i limiti della query partono dalla
mezzanotte italiana corretta, con ora solare e ora legale.

## Cosa significa «sparito»

La sezione non tratta ogni `supplier_product.active = false` come una
sparizione: quel flag comprende anche disattivazioni manuali. Conta solo le
offerte con `disappearedAt`, cioè quelle marcate dal confronto con una
copertura di listino applicata.

## Cache e isolamento

La parte aggregata per organizzazione usa `unstable_cache`, il modello
previsto da questa configurazione Next senza Cache Components. `organizationId`
è un argomento e quindi parte della chiave: due tenant non possono condividere
un risultato. La durata è 30 secondi, così una conferma o un import diventano
visibili rapidamente anche senza accoppiare la lettura a ogni mutazione.

La bozza non entra mai nella cache condivisa: viene riletta per `userId` a ogni
richiesta. Il repository parte sempre da `prismaForOrganization`; nessuna
query applicativa usa il client di sistema.

## API

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/dashboard` | panoramica completa dell'organizzazione e bozza dell'utente |

Senza sessione risponde `401`. La risposta mantiene il contratto comune
`{ ok, data | error }` e `Cache-Control: no-store`: il browser non conserva
dati di un utente, mentre la sola aggregazione server mantiene la cache
tenant-scoped descritta sopra.

## Verifica

I test puri coprono:

- mesi vuoti e totali mensili;
- passaggio di mese alla mezzanotte italiana;
- ora solare e ora legale;
- quantità, nomi e importi dagli snapshot;
- aggregazione distinta di ordini e fornitori;
- righe senza prodotto canonico ancora raggiungibili;
- rematch successivo che prevale sul vecchio `productId`;
- consumo annualizzato e rifiuto di unità incompatibili tramite l'helper F18.

Controlli eseguiti:

- test dashboard, timezone e helper condiviso: **18/18**;
- ESLint sui file della fase: superato;
- query aggregata read-only sul database reale: **115 ms** a freddo su 313
  prodotti, 2 ordini e 12 confronti, prima della cache.

La misurazione non ha creato né modificato dati.
