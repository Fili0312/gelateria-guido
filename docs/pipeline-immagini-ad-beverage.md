# Pipeline immagini AD Beverage

## Fonte reale

Verificata il 18 agosto 2026. `https://www.adbeverage.it/catalogo.html` e'
una pagina statica: `catalogo.js` crea un client Supabase e legge la tabella
pubblica `prodotti`, a pagine da 1.000 record, selezionando:

- `id`
- `codice`
- `nome`
- `categoria`
- `descrizione`
- `foto_url`

Il client applicativo ricava URL Supabase e chiave anonima dallo script
pubblico, poi usa direttamente la REST API strutturata. Non usa HTML parsing,
Playwright o automazione browser. Il catalogo viene caricato una volta e
messo in cache in memoria per sei ore; un errore viene memorizzato per quindici
minuti per non produrre centinaia di tentativi e log uguali.

## Ordine e sicurezza

La fonte AD viene consultata soltanto se il prodotto globale ha almeno
un'offerta attiva del fornitore `AD Beverage`:

1. catalogo ufficiale AD Beverage, soglia automatica `0,90`;
2. Open Food Facts, soglia esistente e invariata `0,80`;
3. nessuna foto, con il segnaposto categoria gia' esistente.

Il matcher giudica tutti i 2.135 prodotti attivi e sceglie il migliore. Marca,
variante, formato e tipo di confezione sono vincoli: un conflitto esplicito
non puo' essere compensato da parole generiche. I risultati tra `0,80` e
`0,899` restano dubbi e non vengono associati automaticamente. Un quasi pari
fra due prodotti diversi viene scartato come ambiguo.

Le date operative del listino vengono ignorate; annata del vino ed eta' del
distillato restano invece parte dell'identita'. `2012` e `2013` non sono
considerati refusi equivalenti.

## Immagini e metadati

L'URL remoto non arriva mai al frontend. Sono accettati soltanto HTTPS e host
ufficiali AD/Supabase; la foto viene scaricata con timeout, validata per MIME e
dimensione, salvata nell'archivio content-addressed esistente e servita da
`/api/immagini/<productId>`.

I campi esistenti vengono valorizzati cosi':

- `imageSource = AD_BEVERAGE`
- `imageExternalId = codice AD`, con fallback all'UUID della riga
- `imageConfidence = confidence del matcher`
- `imageUpdatedAt = ora della ricerca`

Non sono state aggiunte colonne.

## Dry-run reale

Campione stratificato di 30 prodotti sui 227 collegati ad AD Beverage:
Vodka 4, Gin 4, Rum 4, Amaro 3, Liquore 3, Aperitivo/Bitter 3, Acqua 3,
Bibite 3, Vino/Spumante 3. Nel database locale AD non ha una categoria
letterale `Vino`; le dieci referenze vinicole collegate sono `Spumante`.

- foto AD Beverage affidabili: **12**
- foto OFF gia' registrate sugli stessi prodotti: **7**
- foto AD che la copertura OFF attuale non aveva: **8**
- match scartati per sicurezza: **18**
- match dubbi: **1**

Il confronto OFF usa i metadati gia' salvati nel database e non invia nomi
locali a servizi esterni. Il comando e':

```bash
./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
  scripts/dry-run-ad-beverage.ts --quanti 30
```

## Diritti delle immagini

Non e' stata trovata sul sito una licenza o un'autorizzazione esplicita al
riuso sistematico delle immagini; le pagine AD indicizzate riportano invece
"Tutti i diritti riservati". L'integrazione tecnica e il dry-run sono pronti,
ma non e' stato eseguito alcun import massivo. Prima di lanciarlo serve una
conferma dei diritti o un'autorizzazione di AD Beverage.
