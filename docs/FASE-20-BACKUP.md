# FASE 20 — Prova reale di ripristino

Data: 2026-08-10 (UTC).

## Risultato

Il backup giornaliero è stato ripristinato davvero in un database PostgreSQL
nuovo e isolato, mai sopra `gelateria_guido`. Il dump è integro, viene caricato
interamente in una transazione con arresto al primo errore, accetta le
migrazioni successive presenti nel repository e risponde correttamente allo
stesso health check usato dall'applicazione.

Database temporaneo usato per tutta la prova:
`gelateria_restore_codex_20260810`. Al termine è stato eliminato e ne è stata
verificata l'assenza. Il database e lo storage live non sono stati modificati.

## Punto di ripristino

È stato scelto il dump completo più recente disponibile al momento della
prova:

| Proprietà | Valore |
|---|---|
| file | `/var/backups/gelateria/gelateria_guido-20260810-033001-280812258.sql.gz` |
| data | 2026-08-10 03:30:01 UTC |
| dimensione | 154.811 byte |
| SHA-256 | `3c7f06a16eb37a15d1171661ed155d0238a73ee2ee8cde58ad977ba649209524` |
| verifica gzip | superata con `gzip -t` |
| log cron | `Backup completato`, 13 dump conservati |

## Procedura eseguita

Prima della creazione è stata interrogata `pg_database`: il nome temporaneo
non esisteva. Il ripristino è stato quindi eseguito con i comandi seguenti;
l'accesso locale come utente di sistema `postgres` evita di scrivere password
nella shell.

```bash
gzip -t -- /var/backups/gelateria/gelateria_guido-20260810-033001-280812258.sql.gz
sudo -u postgres createdb --owner=gelateria gelateria_restore_codex_20260810
gzip -cd -- /var/backups/gelateria/gelateria_guido-20260810-033001-280812258.sql.gz | \
  sudo -u postgres psql --no-psqlrc \
    --dbname=gelateria_restore_codex_20260810 \
    --set=ON_ERROR_STOP=on --single-transaction
```

Il dump delle 03:30 conteneva 6 migrazioni, tutte concluse e nessuna annullata.
Il repository corrente ne contiene 7: la migrazione successiva al backup,
`20260810091116_sconto_extra_fornitore`, è stata applicata sul clone con
`prisma migrate deploy`. Stato finale: 7 su 7 applicate.

## Controlli sui dati ripristinati

I conteggi immediatamente successivi al ripristino erano:

| Entità | Righe |
|---|---:|
| organizzazioni | 1 |
| utenti | 1 |
| fornitori | 2 |
| prodotti | 326 |
| offerte fornitore | 330 |
| prezzi storici | 330 |
| listini | 2 |
| ordini | 1 |
| righe ordine | 0 |

Entrambi i listini erano `APPLIED`; l'ordine presente era una bozza senza
righe. Sono stati verificati inoltre:

- 49 foreign key presenti, tutte validate;
- zero riferimenti orfani essenziali fra organizzazioni, utenti, fornitori,
  prodotti, offerte, prezzi, listini, ordini e righe ordine;
- zero relazioni che attraversano organizzazioni diverse nei percorsi
  essenziali;
- zero puntatori `current_price_id` appartenenti a un'offerta diversa;
- zero ordini con totale netto o lordo diverso dalla somma delle righe.

Lo smoke test ha invocato `leggiStato()` del codice applicativo con
`DATABASE_URL` puntata esclusivamente al clone. Esito: database raggiungibile,
7 migrazioni, estensioni `btree_gin`, `pg_trgm`, `pgcrypto` e `unaccent`
presenti, nessuna estensione mancante, `ok: true`.

## Verifica dello storage

Il confronto è stato eseguito senza copiare né sovrascrivere file, con `rsync`
in modalità `--dry-run --checksum` in entrambe le direzioni e con un controllo
puntuale dei percorsi salvati nel database ripristinato.

- lo specchio del backup conteneva 2 file per 219.035 byte;
- tutti i 2 file citati dal clone esistevano nello specchio, con percorsi
  relativi sicuri; nessun riferimento era mancante;
- i file già nello specchio coincidevano col corrispondente file live;
- lo storage live conteneva 8 file per 422.191 byte: i 6 file aggiuntivi erano
  export di ordini creati dopo il backup delle 03:30 e quindi non erano citati
  da quel dump.

Il punto di ripristino provato è quindi completo rispetto ai suoi riferimenti.
La differenza evidenzia il normale RPO del backup giornaliero: gli export
creati dopo le 03:30 entreranno nel ciclo successivo. Il mirror è additivo e
non è stato modificato durante la verifica.

## Collaudi distruttivi sul clone

I collaudi applicativi che scrivono dati sono stati puntati soltanto a
`gelateria_restore_codex_20260810`, con
`STORAGE_DIR=/tmp/gelateria-restore-collaudi-20260810`. Nessun comando ha usato
il nome `gelateria_guido`.

È stato avviato:

```bash
sudo -u postgres env \
  DATABASE_URL='postgresql://postgres@localhost/gelateria_restore_codex_20260810?host=/var/run/postgresql' \
  STORAGE_DIR=/tmp/gelateria-restore-collaudi-20260810 \
  NODE_ENV=production \
  ./node_modules/.bin/tsx --conditions=react-server \
    scripts/collaudo-applicazione.ts
```

Il collaudo si è fermato prima di scrivere: lo scenario sceglie un listino già
`APPLIED`, mentre la regola di sicurezza corrente accetta correttamente solo
un listino `REVIEW` con job concluso. Dopo il rifiuto entrambi i listini erano
ancora `APPLIED`. È quindi un harness precedente all'irrigidimento della
procedura di import, non un errore del dump o del ripristino.

I collaudi `collaudo-conferma.ts`, `collaudo-storico.ts` e
`collaudo-documenti.ts` non sono stati avviati: repository e firme degli
ordini erano in modifica concorrente durante la prova. Caricare una versione
intermedia avrebbe prodotto un esito non ripetibile. Vanno rilanciati su un
nuovo clone dopo la stabilizzazione di quelle modifiche; non sono necessari
per dichiarare ripristinabile il punto verificato, già coperto da migrazioni,
vincoli, query di consistenza e health check applicativo.

## Chiusura della prova

Prima della rimozione `current_database()` ha restituito esattamente
`gelateria_restore_codex_20260810`; l'unica sessione collegata era quella del
controllo stesso. È stato quindi eseguito:

```bash
sudo -u postgres dropdb gelateria_restore_codex_20260810
```

La query successiva su `pg_database` ha restituito `0`: il clone non esiste
più. Anche la directory temporanea dei collaudi, rimasta vuota, è stata
rimossa. Nessun database, file di storage o configurazione live è stato
eliminato o sovrascritto.
