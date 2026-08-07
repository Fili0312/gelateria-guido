# FASE 4 — Gestione fornitori

Data: 2026-08-07 · **codice e deploy completati** · collaudo live superato.

## Risultato

La sezione Fornitori passa da riepilogo in sola lettura ad anagrafica
operativa. È possibile cercare e ordinare i fornitori, crearli, consultarne la
scheda, modificarli, disattivarli e riattivarli. La cancellazione fisica resta
disponibile soltanto per un record che non possiede alcun dato collegato.

L'anagrafica raccoglie già i dati che serviranno nelle fasi successive:

- identità e contatti commerciali;
- regime IVA del listino e aliquota predefinita;
- minimo d'ordine e giorni di consegna;
- indirizzo dell'ufficio ordini, eventuale CC e nota fissa per l'email;
- stato attivo/inattivo.

La Fase 4 **non invia email** e non importa listini: salva e valida soltanto le
impostazioni che saranno consumate rispettivamente nelle Fasi 17 e 7.

## Interfaccia

### Elenco

`/fornitori` mostra i totali complessivi, attivi e inattivi. La ricerca
case-insensitive comprende nome, codice, partita IVA, referente, email
commerciale ed email ordini. I filtri ammessi sono:

- stato: tutti, attivi o inattivi;
- ordinamento: nome crescente/decrescente o ultima modifica
  crescente/decrescente.

La vista usa schede compatte su telefono e tabella su desktop. Ogni riga rende
visibili stato, regime IVA, aliquota, minimo d'ordine, consegna e conteggio di
prodotti/listini collegati.

### Creazione, scheda e modifica

`/fornitori/nuovo` e `/fornitori/[id]/modifica` usano lo stesso form e lo
stesso schema Zod usato dal server. Gli errori restano associati al campo, i
valori inseriti non vengono persi dopo una risposta negativa e toast distinti
comunicano successo, errore applicativo o indisponibilità della rete.

La scheda `/fornitori/[id]` espone i tab Anagrafica, Listini, Prodotti, Prezzi
e Ordini. I contenuti non ancora gestiti dalle fasi successive mostrano uno
stato vuoto esplicito, senza simulare dati.

I controlli di modifica, disattivazione/riattivazione e cancellazione hanno
conferme separate. Disattivare non rimuove informazioni e resta quindi
l'operazione normale per un fornitore già usato.

## Regole di validazione

Il client aiuta l'utente, ma il server ripete sempre la validazione e resta
l'unica fonte autorevole. Il body è `strict`: identificativi, `organizationId`
e campi non previsti vengono rifiutati invece di essere ignorati.

| Regola | Comportamento |
|---|---|
| Nome | obbligatorio, rifilato; univoco nell'organizzazione ignorando maiuscole e spazi esterni |
| Campi opzionali | rifilati; una stringa vuota diventa `NULL` |
| Email commerciale, ordini e CC | devono contenere un singolo indirizzo valido quando valorizzate |
| Invio ordini | `sendOrdersByEmail = true` richiede `orderEmail` valida |
| IVA predefinita | decimale esatto compreso tra 0 e 100, massimo due cifre decimali |
| Minimo d'ordine | decimale esatto non negativo, massimo due cifre decimali |
| Booleani | sono accettati soltanto booleani JSON reali, non stringhe come `"false"` |
| PATCH | deve contenere almeno una modifica; i campi omessi conservano il valore corrente |

Virgola e punto sono accettati in input per i decimali. I valori vengono
normalizzati e attraversano applicazione e API come stringhe: denaro e
percentuali non vengono mai convertiti in floating point JavaScript.

Il vincolo tra invio email e indirizzo viene verificato anche dopo aver fuso un
PATCH parziale con il record corrente. Non è quindi possibile aggirarlo
attivando l'invio e cancellando l'indirizzo in due richieste diverse.

## Cancellazione e disattivazione

Un fornitore è cancellabile soltanto se tutti i conteggi seguenti sono zero:

- prodotti fornitore;
- listini e profili d'importazione;
- righe e documenti d'ordine;
- invii email;
- alias prodotto riferiti al fornitore.

La regola applicativa è intenzionalmente più restrittiva delle sole foreign
key: alcune relazioni del modello usano `CASCADE` o `SET NULL`, ma una
cancellazione non deve eliminare o scollegare silenziosamente storia utile.
Se esiste almeno un collegamento, l'API risponde `409 Conflict` con un
messaggio comprensibile e `canDeactivate: true`; l'interfaccia propone la
disattivazione. Un eventuale conflitto FK comparso tra controllo e delete viene
tradotto nello stesso errore, coprendo anche la scrittura concorrente.

La disattivazione è un normale `PATCH { "active": false }`: conserva il record
e tutte le relazioni. La riattivazione usa lo stesso percorso con `true`.

## Isolamento e sicurezza HTTP

Tutte le query passano da `prismaForOrganization(organizationId)`. Il client
scoped aggiunge l'organizzazione alle scritture e alle condizioni di lettura,
modifica e cancellazione; un identificativo appartenente a un'altra
organizzazione si comporta come inesistente e produce `404`, senza rivelarne
l'esistenza.

Le route risolvono nuovamente la sessione con `getCurrentUser()`: la protezione
del proxy non sostituisce il controllo server. Le risposte API non vengono
messe in cache.

Per `POST` e `PATCH`:

- il media type deve essere `application/json` (sono ammessi i parametri, per
  esempio `charset=UTF-8`);
- `Content-Length` e i byte effettivamente letti sono limitati a 64 KiB;
- JSON vuoto/malformato e UTF-8 non valido vengono rifiutati.

Per tutte le mutazioni (`POST`, `PATCH`, `DELETE`), se `Origin` è presente deve
coincidere con l'origin pubblico. Dietro nginx vengono accettati soltanto
`X-Forwarded-Host` e `X-Forwarded-Proto` singoli, validi e presenti insieme;
catene ambigue o mismatch vengono rifiutati. `DELETE` non usa un body
applicativo.

## API

Gli URL pubblici includono il `basePath` `/gelateria`; nella tabella sono
mostrati i pathname applicativi.

| Metodo | Endpoint | Esito |
|---|---|---|
| `GET` | `/api/suppliers?q=cecconi&status=active&sort=name-asc` | elenco filtrato con totali, `200` |
| `POST` | `/api/suppliers` | crea un fornitore, `201` |
| `GET` | `/api/suppliers/[id]` | scheda completa e conteggi, `200` o `404` |
| `PATCH` | `/api/suppliers/[id]` | modifica parziale/disattivazione, `200` |
| `DELETE` | `/api/suppliers/[id]` | cancella solo un record senza collegamenti, `200` con `{ ok: true, data: { id } }` |

Query della lista:

- `q`: testo libero rifilato, massimo 100 caratteri;
- `status`: `all` (default), `active`, `inactive`;
- `sort`: `name-asc` (default), `name-desc`, `updated-desc`, `updated-asc`.

La lista non è ancora paginata e restituisce al massimo 250 righe, oltre ai
conteggi complessivi di attivi e inattivi. Parametri sconosciuti o fuori
whitelist producono `400`.

Le risposte con contenuto usano una busta stabile:

```json
{ "ok": true, "data": {} }
```

Gli errori hanno sempre un messaggio destinato all'interfaccia; una
validazione può aggiungere `fields`, mentre il blocco cancellazione aggiunge
`canDeactivate` e i conteggi che impediscono l'operazione:

```json
{
  "ok": false,
  "error": "Il fornitore ha dati collegati e non può essere eliminato.",
  "canDeactivate": true,
  "counts": {
    "priceLists": 1,
    "supplierProducts": 20,
    "importProfiles": 0,
    "orderLines": 0,
    "orderDocuments": 0,
    "emailDeliveries": 0,
    "aliases": 0
  }
}
```

| Stato | Significato |
|---:|---|
| `400` | JSON valido ma payload/query non validi, oppure body JSON/UTF-8 malformato |
| `401` | sessione assente o non più valida |
| `403` | `Origin` presente ma non affidabile |
| `404` | fornitore inesistente o appartenente a un'altra organizzazione |
| `409` | nome già usato nell'organizzazione o cancellazione bloccata |
| `413` | body dichiarato o effettivo oltre 64 KiB |
| `415` | media type diverso da `application/json` |
| `500` | errore inatteso, senza dettagli interni nella risposta |

## Database

La migrazione `20260807130000_supplier_invariants` porta nel database gli
invarianti che PostgreSQL può garantire anche per scritture esterne alla UI:

- indice univoco su organizzazione e `lower(btrim(name))`;
- nome non vuoto dopo il trim;
- aliquota IVA tra 0 e 100;
- minimo d'ordine non negativo;
- email ordini non vuota quando l'invio è abilitato.

La sintassi completa dell'indirizzo email resta responsabilità dello schema
applicativo: PostgreSQL protegge la presenza, non tenta di implementare RFC
email con una constraint fragile.

## Test

La suite Node copre senza rete e senza database:

- normalizzazione dell'input completo e dei PATCH parziali;
- limiti di lunghezza, decimali esatti, booleani e campi sconosciuti;
- matrice email opzionale/obbligatoria;
- whitelist di ricerca, stato e ordinamento;
- decisione di cancellazione per ciascuna relazione;
- formattazione italiana senza passare da floating point;
- parser JSON limitato per Content-Type, Content-Length, stream, UTF-8 e JSON;
- confronto dell'Origin diretto e dietro reverse proxy, inclusi mismatch e
  header forwarded ambigui.

Controlli eseguiti prima del deploy:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm exec prisma validate
pnpm build
```

Esito: **142 test su 142 in 33 suite**, typecheck, ESLint, Prettier, schema
Prisma e build production Webpack verdi. Lo scope multi-tenant resta coperto a
livello dell'estensione Prisma; il collaudo live ha verificato repository,
constraint e codici HTTP sull'organizzazione reale senza creare una seconda
organizzazione artificiale in produzione.

## Collaudo e deploy eseguiti

Il preflight ha trovato 2 fornitori, nessun nome duplicato dopo
`lower(trim(name))` e nessuna riga incompatibile con le nuove constraint.
Subito prima del deploy è stato creato e verificato il backup:

`/var/backups/gelateria/gelateria_guido-20260807-133111-930475447.sql.gz`

Il dump è compresso correttamente, misura 10.824 byte, ha permessi `0600` e lo
storage è stato sincronizzato. La procedura seguente resta il runbook da
ripetere nei deploy futuri.

### 1. Preflight e backup

1. verificare che non esistano nomi duplicati, ignorando maiuscole e spazi
   esterni, né righe che violino le nuove constraint;
2. eseguire `./scripts/backup-db.sh` e verificare il nuovo dump con `gzip -t`;
3. completare tutti i controlli automatici elencati sopra;
4. verificare il diff della migrazione prima di applicarla.

L'indice univoco case-insensitive è il punto che può fermare legittimamente il
deploy se il database live contiene già duplicati. In quel caso i dati vanno
risolti esplicitamente: non si elimina né si rinomina automaticamente un
fornitore reale.

### 2. Deploy

È stato eseguito il ciclo versionato:

```bash
./scripts/deploy.sh
```

Lo script ha installato le dipendenze bloccate, generato Prisma, costruito
Next, applicato `20260807130000_supplier_invariants`, riavviato `gelateria` e
ottenuto il `200` dell'health check. `prisma migrate status` conferma 3
migrazioni applicate e schema aggiornato.
Non esiste rollback automatico dopo la migrazione: in caso di errore seguire
[OPERAZIONI.md](OPERAZIONI.md), senza rilanciare alla cieca.

### 3. Smoke test HTTPS

Sul percorso pubblico `https://filippo.eventoyou.com/gelateria` sono stati
eseguiti questi controlli:

1. verificare redirect della pagina protetta e `401` API senza sessione;
2. accedere e controllare che Barzelli e Cecconi siano visibili;
3. creare un fornitore temporaneo con nome univoco `ZZ COLLAUDO F4 <UTC>`;
4. provare ad abilitare l'invio senza email e verificare che il salvataggio sia
   rifiutato senza mutazioni;
5. compilare contatti, IVA, minimo, consegna ed email valida, poi riaprire la
   scheda e controllare il round-trip;
6. provare ricerca, ordinamento e filtri attivo/inattivo;
7. disattivare e riattivare il record temporaneo;
8. aprire tutte le sezioni predisposte della scheda;
9. cancellare soltanto il record temporaneo privo di collegamenti e verificare
   che non compaia più;
10. controllare health check e log del servizio e assicurarsi che non sia
    partita alcuna email.

Il test distruttivo su un fornitore con collegamenti va eseguito in un database
di collaudo, non sui record seed live. Il cleanup deve usare l'ID esatto della
fixture temporanea anche se un passaggio intermedio fallisce.

Esito live: confine anonimo `401`/redirect, lista seed, query e ricerca,
round-trip di tutti i campi, normalizzazione Decimal, errore email
condizionale, duplicato case-insensitive `409`, Origin ostile `403`, JSON
malformato `400`, media type `415`, body oltre 64 KiB `413`, sei pagine della
scheda, filtri attivo/inattivo, disattivazione, riattivazione, cancellazione e
successivo `404` tutti verificati. La fixture `ZZ COLLAUDO F4 …` è stata
rimossa; nessun dato seed è stato cancellato e nessun percorso invia email in
questa fase. Servizi `gelateria` e `nginx` attivi, log senza errori e percorsi
preesistenti del dominio ancora raggiungibili.

### 4. Chiusura della fase

La fase è **completata, pubblicata e collaudata in produzione**. Il codice live
parte dal commit `b38e3cc`; il commit documentale successivo registra questo
esito senza cambiare il comportamento applicativo.

## Prossimo passo

**Fase 5 — Catalogo prodotti manuale**: CRUD dei prodotti canonici e dei
prodotti fornitore, collegamento delle offerte, alias e ricerca veloce con
`pg_trgm`/`unaccent`.
