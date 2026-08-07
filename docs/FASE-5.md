# FASE 5 — Catalogo prodotti (manuale)

Data: 2026-08-07 · **codice e deploy completati** · quattro criteri su quattro
verificati sull'app viva.

## Risultato

L'app ha un catalogo. Prima della Fase 5 esistevano fornitori e un modello di
dominio testato ma nessuna schermata per usarli; ora si creano a mano i
**prodotti canonici**, si creano le **offerte fornitore** e si collegano fra
loro, e si cerca in tutto il catalogo con una barra unica.

La distinzione fondamentale del progetto diventa qui operativa:

- il **prodotto canonico** (`product`) è la cosa che si compra — «Coca Cola
  lattina 33 cl» — e non appartiene a nessun fornitore;
- l'**offerta fornitore** (`supplier_product`) è come quel prodotto compare nel
  listino di *un* fornitore, col suo codice articolo, la sua descrizione e la
  sua confezione;
- lo stesso prodotto canonico può avere più offerte, ed è esattamente il
  motivo per cui esiste: senza, «12 bottiglie a 9 €» e «24 a 16 €» restano due
  righe scollegate invece che due prezzi da confrontare.

La Fase 5 **non gestisce i prezzi** (Fase 6) e **non importa PDF** (Fase 7).
Prepara il terreno su cui l'import atterrerà: quando arriverà, dovrà creare e
collegare esattamente questi record, usando le stesse funzioni.

## Interfaccia

### Elenco prodotti — `/prodotti`

Schede su telefono, tabella su desktop. Filtri:

- `q`: testo libero su nome, marca e categoria;
- categoria;
- stato: tutti, **collegati** (con almeno un'offerta) oppure **orfani**;
- ordinamento: nome A→Z / Z→A, ultima modifica, numero di offerte.

Lo stato «orfano» non è un dettaglio tecnico: è la coda di lavoro. Un prodotto
canonico senza offerte non si può ordinare da nessuno, e va visto.

### Ricerca — la barra

La stessa barra che nella Fase 12 finirà nella schermata ordine. Cerca in
parallelo su quattro fronti — nome canonico, alias, descrizione del fornitore,
codice articolo — e mostra per ogni risultato **da dove** è arrivato il
riscontro. Digitando si vede il tempo di risposta: il criterio della fase è un
numero di millisecondi, e deve restare misurabile anche dopo.

### Scheda prodotto — `/prodotti/[id]`

Intestazione con formato e unità base, poi tre riquadri di sintesi: numero di
offerte, quante sono **confrontabili**, quante hanno la **confezione da
definire**. Sotto, l'elenco delle offerte per fornitore con codice articolo,
descrizione originale del listino, pezzi per confezione e contenuto totale, e
la sezione degli alias.

«Confezione da definire» è mostrato in chiaro e non nascosto: un'offerta di cui
non si sa quante bottiglie contenga il collo **non ha** un prezzo al litro, e
mostrargliene uno calcolato su un 1 di ripiego significherebbe dare a
un'ipotesi la faccia di un dato.

### Form

`/prodotti/nuovo`, `/prodotti/[id]/modifica` e
`/prodotti/[id]/offerte/nuova` usano gli stessi schemi Zod del server. Gli
errori restano attaccati al campo e i valori inseriti non si perdono dopo una
risposta negativa.

## Campi derivati: si calcolano sul server, sempre

`baseUnit`, `normalizedName`, `contentPerPack` e `fingerprint` **non sono
accettati dal client**. Gli schemi di input sono `.strict()`, quindi mandarli
non li fa ignorare: fa fallire la richiesta con `400`. Il server li ricalcola a
ogni scrittura con i moduli di dominio della Fase 2.

| Campo | Da dove esce | Perché non dal client |
|---|---|---|
| `baseUnit` | `baseDi(unitOfMeasure)` | CL, ML, DL e L devono cadere tutti su `L`, o il confronto fra fornitori si spezza |
| `normalizedName` | `analizzaDescrizione().nucleo` | è la chiave della ricerca: se la scrittura e la query normalizzassero diversamente, la ricerca non troverebbe e nessuno se ne accorgerebbe |
| `contentPerPack` | `unitSize` in unità base × `packQuantity` | è il divisore del prezzo unitario: un numero sbagliato qui produce un confronto plausibile e falso |
| `fingerprint` | nucleo + formato + confezione | serve all'abbinamento automatico della Fase 8 |

Verificato in produzione: creando un'offerta con `unitSize: "0.33"`,
`unitOfMeasure: "L"`, `packQuantity: 12`, il server ha risposto
`contentPerPack: 3.96`, `baseUnit: "L"`; con `packQuantity: 24`,
`contentPerPack: 7.92`.

## La ricerca

### Dove vive

`src/server/database/ricerca-catalogo.ts` è **l'unica deroga dichiarata** al
divieto di SQL grezzo. Il client scoped di `@/server/db` nasconde `$queryRaw`
dai tipi perché l'estensione che filtra per organizzazione non può intercettare
l'SQL: la strada è sbarrata, non lasciata aperta con una raccomandazione.

La somiglianza trigram però non è esprimibile con l'API di Prisma, e senza
indice trigram la ricerca è una scansione sequenziale. La deroga vive quindi in
un modulo solo, il cui nome la dichiara, con `organizationId` come primo
parametro obbligatorio di ogni funzione, ed è iscritta nell'elenco di esenzioni
di `eslint.config.mjs` con la motivazione accanto.

Il costruttore dell'SQL è **puro**: prende organizzazione, termine e limite e
restituisce un `Prisma.Sql`, senza toccare il database. Dieci test verificano
che il filtro sull'organizzazione compaia in ogni ramo della query, che il
termine non sia mai concatenato ma sempre parametrizzato, che `%` e `_` digitati
siano trattati come caratteri e non come jolly, e che il limite sia un
parametro. Un commento che dicesse le stesse cose non le garantirebbe.

### `word_similarity`, non `similarity`

Sui dati veri della gelateria, cercando «amaro»:

| Nome | `similarity` | `word_similarity` |
|---|---:|---:|
| `AVERNA AMARO 1/1` | 0,500 | 1,000 |
| `BRAULIO AMARO 1/1` | 0,429 | 1,000 |
| `MONTENEGRO AMARO 1/1` | 0,375 | 1,000 |
| `BRAULIO AMARO RISERVA 0.700` | **0,273** | 1,000 |

`similarity()` confronta due testi *interi*, quindi crolla man mano che il nome
si allunga. Con la soglia di default a 0,3 il quarto amaro sarebbe sparito dai
risultati — senza errore, senza avviso: semplicemente non compare.
`word_similarity()` confronta il termine con la migliore sequenza di parole del
nome, ed è l'operatore giusto per cercare una parola dentro una descrizione.

### Termini corti

Sotto i tre caratteri i trigrammi non esistono e l'indice non serve a nulla. Il
termine passa allora a una strategia **a prefisso**, che è anche ciò che ci si
aspetta digitando due lettere: «bi» deve dare «BIRRA…», non tutto ciò che
contiene una «i». La strategia scelta è nella risposta (`strategy`), non
implicita.

### Forma della query

```
WITH riscontri AS ( nome  UNION ALL  alias  UNION ALL  fornitore  UNION ALL  codice ),
     migliori  AS ( SELECT product_id, max(punteggio) AS score, via-migliore
                      FROM riscontri GROUP BY product_id
                     ORDER BY score DESC, product_id ASC LIMIT $limite )
SELECT p.*, (conteggio offerte), m.score, m.via
  FROM migliori m JOIN product p ON p.id = m.product_id
 ORDER BY m.score DESC, p.name ASC
```

Il conteggio delle offerte sta **dopo** il `LIMIT`, e non è un dettaglio:
calcolarlo prima costava una sottoquery per ogni candidato — su un termine
frequente come «birra», trecento conteggi invece di venti. La ricerca passava
da una decina di millisecondi a novanta. È l'unica modifica di performance
fatta in questa fase, ed è stata fatta perché misurata.

I riscontri dal nome del fornitore pesano 0,9: contano, ma meno del nome
canonico, che è quello che l'operatore ha scelto e corretto. Il codice articolo
si cerca sempre a prefisso in entrambe le strategie — un codice si digita per
intero o per l'inizio, mai «più o meno».

### Misura

`scripts/genera-dati-prova.ts` genera un catalogo realistico su un database usa
e getta e cronometra. Lo script **si rifiuta di partire** se riconosce il nome
del database di produzione. È rieseguibile: ripulisce l'organizzazione di prova
prima di rigenerare, e `--solo-misura` rimisura senza toccare i dati.

Su **5.000 prodotti e 9.973 offerte**, mediana e massimo su 15 esecuzioni:

| Termine | Strategia | Risultati | Mediana | Massimo |
|---|---|---:|---:|---:|
| `birra` | somiglianza | 20 | 15,6 ms | 19,1 ms |
| `amaro` | somiglianza | 20 | 14,6 ms | 16,0 ms |
| `acqua` | somiglianza | 20 | 14,7 ms | 24,4 ms |
| `gin` | somiglianza | 20 | 13,6 ms | 15,9 ms |
| `san benedetto` | somiglianza | 20 | 13,7 ms | 18,6 ms |
| `topping` | somiglianza | 20 | 21,3 ms | 26,9 ms |
| `bi` | prefisso | 20 | 6,6 ms | 12,8 ms |
| `A000123` | somiglianza | 1 | 10,9 ms | 13,4 ms |

**Caso peggiore 26,9 ms**, contro i 100 ms del criterio.

Un avvertimento onesto sul numero: subito dopo il caricamento massivo la stessa
misura dava 97,5 ms di picco, con mediana già a 48 ms. Era cache fredda —
`shared_buffers` vuoto e statistiche appena calcolate. I 26,9 ms sono il regime,
che è la condizione in cui l'app viene usata; i 97,5 ms restano documentati
perché il primo minuto dopo un import massiccio (Fase 7) sarà quella condizione
lì, non questa.

## Database

Migrazione `20260807153000_nome_normalizzato_prodotto_fornitore`, in tre passi
espliciti:

1. `supplier_product.normalized_name` aggiunta **nullable**;
2. backfill in SQL, dichiarato nel file come **approssimazione** della
   normalizzazione canonica;
3. `SET NOT NULL`.

Il passo 2 è un'approssimazione perché la normalizzazione vera vive in
TypeScript e non è riscrivibile fedelmente in SQL. La migrazione non finge il
contrario: il valore definitivo lo scrive `pnpm ricalcola-normalizzati`, che usa
la funzione canonica ed è idempotente (`--prova` per il giro a vuoto). Una
migrazione che avesse scritto l'approssimazione dichiarandola definitiva
avrebbe lasciato l'indice pieno di stringhe leggermente diverse da quelle che
la ricerca cerca — il guasto peggiore, perché muto.

L'indice `supplier_product_raw_name_trgm_idx` è stato sostituito da
`supplier_product_normalized_name_trgm_idx`: si cerca su ciò che è
normalizzato, non sulla descrizione grezza.

Le migrazioni si producono con `./scripts/nuova-migrazione.sh` (`migrate diff`),
non con `migrate dev`: il ruolo applicativo non ha `CREATEDB` e non può creare
il database ombra.

## API

Gli URL pubblici includono il `basePath` `/gelateria`; qui sono mostrati i
pathname applicativi.

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/products?q=&departmentId=&categoryId=&classification=&status=&sort=` | elenco filtrato, `200` |
| `POST` | `/api/products` | crea un prodotto canonico, `201` |
| `GET` | `/api/products/[id]` | scheda con offerte e alias, `200` o `404` |
| `PATCH` | `/api/products/[id]` | modifica parziale, `200` |
| `DELETE` | `/api/products/[id]` | cancella, `200` |
| `GET` | `/api/products/search?q=&limite=` | ricerca, `200` |
| `POST` | `/api/products/[id]/aliases` | aggiunge un sinonimo, `201` |
| `DELETE` | `/api/products/[id]/aliases/[aliasId]` | rimuove un sinonimo, `200` |
| `GET` | `/api/supplier-products?q=&supplierId=&status=` | elenco offerte, `200` |
| `POST` | `/api/supplier-products` | crea un'offerta, `201` |
| `PATCH` | `/api/supplier-products/[id]` | modifica parziale, `200` |
| `DELETE` | `/api/supplier-products/[id]` | cancella un'offerta, `200` |

La ricerca restituisce anche come ha lavorato:

```json
{
  "ok": true,
  "data": {
    "items": [{ "id": "…", "name": "BRAULIO AMARO 1/1", "offersCount": 1,
                "score": 1, "via": "nome" }],
    "normalized": "braulio",
    "strategy": "somiglianza",
    "elapsedMs": 8.38
  }
}
```

`via` dice da dove è arrivato il riscontro — `nome`, `alias`, `fornitore` o
`codice` — e serve tanto all'interfaccia quanto a capire, quando un risultato
sorprende, perché è lì.

Codici di stato, busta della risposta, limiti sul body, controllo `Origin` e
isolamento per organizzazione seguono le stesse regole della Fase 4. Gli errori
del catalogo sono mappati in un file solo (`src/app/api/products/errori.ts`),
usato da tutte e sette le route: elencarli in ognuna avrebbe prodotto, prima o
poi, il conflitto che risponde `409` da una parte e `400` dall'altra.

## Alias

Un alias è un sinonimo che porta allo stesso prodotto: «coca», «coca cola»,
«cocacola». Viene normalizzato con la stessa funzione dei nomi e partecipa alla
ricerca con peso 0,9.

Gli alias **negativi** esistono già nel modello ma non sono ancora usati dalla
ricerca: registrano un «questi due non sono lo stesso prodotto», e serviranno
all'abbinamento automatico della Fase 8 per non ripetere un errore che
l'operatore ha già corretto una volta.

## Verifica

Tutti e quattro i criteri della ROADMAP sono stati verificati **sull'app in
produzione**, via HTTP, non in locale e non a mano sul database.

| Criterio | Come | Esito |
|---|---|---|
| prodotto canonico con 2+ offerte collegate | `POST /api/products` + due `POST /api/supplier-products` su fornitori diversi; scheda `/prodotti/[id]` renderizzata | ✅ scheda: «Offerte 2», «Confrontabili 2», entrambi i fornitori e i codici presenti |
| «birra» in <100 ms su ≥5.000 righe | 5.000 prodotti + 9.973 offerte generate, 15 esecuzioni per termine | ✅ 15,6 ms mediana, 26,9 ms nel caso peggiore su otto termini |
| `content_per_pack` e `base_unit` calcolati e corretti | risposta del server alla creazione delle due offerte | ✅ 3,96 L e 7,92 L, `baseUnit: L`, entrambi calcolati sul server |
| ricerca insensibile ad accenti, maiuscole, punteggiatura | otto interrogazioni sullo stesso prodotto | ✅ tutte lo trovano |

Le otto interrogazioni: `birra artigianale`, `BIRRA ARTIGIANALE`,
`BÌRRÀ ARTIGIÁNALE`, `birra, artigianale!!`, `  Birra   Artigianale  `,
`artigianale birra` (ordine invertito), `VER-12` (codice articolo),
`verifica fase 5`.

I record creati per la verifica sono stati poi cancellati **attraverso le API**
e non con `DELETE` in SQL, così da collaudare anche quel percorso. Il database
di produzione è tornato esattamente ai 19 prodotti e 20 offerte di partenza,
con zero residui.

Per verificare senza conoscere la password condivisa esiste
`scripts/token-di-prova.ts`, che firma un cookie di sessione valido 15 minuti
con `SESSION_SECRET`. Non è una scorciatoia di sicurezza: chi ha
`SESSION_SECRET` può già fare tutto, e il token stateless è esattamente ciò che
il login emette dopo aver verificato la password.

## Stato dei controlli

```
pnpm test       176 test, 43 suite, 0 falliti
pnpm typecheck  pulito
pnpm lint       pulito
pnpm build      pulito
```

## Nota tecnica: le estensioni `.js`

I moduli di dominio della Fase 2 importavano con estensione `.js`
(`from './units.js'`), che è ESM corretto e funziona con `tsx`. Finché il
dominio è stato usato solo da test e script nessuno se n'è accorto; alla prima
importazione da codice applicativo la build è fallita, perché il bundler di
Next non risolve quelle estensioni. Ventuno import in dieci file sono stati
allineati alla convenzione già usata nel resto del progetto (senza estensione).

## Aperto

- **D11 chiusa** — DeepSeek Flash configurato; tetto applicativo mensile
  impostato a 5 USD. La chiave resta nel file root-only del servizio.
- **D15 chiusa per ora** — AD Beverage resta com'è; i listini verranno aggiunti
  quando saranno disponibili.
- **D18** — autorizzazione SMTP e casella mittente: serve alla Fase 17.
- La password condivisa attualmente in uso è di 7 caratteri
  (`MIN_PASSWORD_LENGTH`). Vale la pena allungarla prima che l'app contenga
  dati veri.

## Prossimo passo

Prima della Fase 6 è stata inserita la **Fase 5b — Reparti e categorie**, nata
da un'esigenza reale durante gli ordini. È documentata in
[FASE-5B.md](FASE-5B.md). Dopo la sua chiusura, il passo successivo resta la
**Fase 6 — Storico prezzi**: servizio `setPrice` append-only, prezzo alla data,
serie storica e grafico nella scheda prodotto.
