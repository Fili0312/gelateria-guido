# Operazioni e ripristino

Questo documento accompagna i template versionati in `deploy/`. I file sotto
`deploy/` **non sono installati automaticamente**: cambiarli nel repository non
modifica il server live.

## Installazione dell'infrastruttura versionata

L'applicazione deve girare con l'utente di sistema senza login
`gelateria-app`, distinto dal ruolo PostgreSQL `gelateria`. I comandi seguenti
sono una procedura amministrativa: vanno riletti ed eseguiti manualmente come
root in una finestra di manutenzione.

```bash
cd /var/www/gelateria-guido

# Una volta sola.
getent passwd gelateria-app >/dev/null || \
  useradd --system --user-group --no-create-home --home-dir /nonexistent \
    --shell /usr/sbin/nologin gelateria-app

# I segreti live restano fuori dal repository. systemd li legge come root e
# passa le variabili al processo; l'utente web non apre il file.
install -d -o root -g root -m 0700 /etc/gelateria
install -o root -g root -m 0600 .env /etc/gelateria/gelateria.env
cmp --silent .env /etc/gelateria/gelateria.env
install -d -o root -g root -m 0700 /var/backups/gelateria
mv .env /var/backups/gelateria/gelateria.env.pre-externalization
chmod 0600 /var/backups/gelateria/gelateria.env.pre-externalization

# Le sole directory scrivibili dal processo web.
install -d -o gelateria-app -g gelateria-app -m 0700 storage
install -d -o gelateria-app -g gelateria-app -m 0700 .next/cache
chown -R -- gelateria-app:gelateria-app storage

# Il cron gira come root: repository e script non devono essere scrivibili
# dall'utente web.
chown root:root . scripts scripts/backup-db.sh scripts/deploy.sh \
  scripts/pg-dump-safe.mjs
chmod 0755 . scripts scripts/backup-db.sh scripts/deploy.sh \
  scripts/pg-dump-safe.mjs
touch /var/log/gelateria-backup.log
chown root:root /var/log/gelateria-backup.log
chmod 0600 /var/log/gelateria-backup.log

install -o root -g root -m 0644 deploy/systemd/gelateria.service \
  /etc/systemd/system/gelateria.service
install -o root -g root -m 0644 deploy/cron/gelateria-backup \
  /etc/cron.d/gelateria
install -o root -g root -m 0644 deploy/logrotate/gelateria-backup \
  /etc/logrotate.d/gelateria-backup
install -d -o root -g root -m 0755 /etc/nginx/snippets
install -o root -g root -m 0644 deploy/nginx/gelateria-http.conf \
  /etc/nginx/conf.d/gelateria-http.conf
install -o root -g root -m 0644 deploy/nginx/gelateria.conf \
  /etc/nginx/snippets/gelateria.conf
```

Nel blocco HTTPS `server` di `filippo.eventoyou.com`, rimuovere i due blocchi
live duplicati `location = /gelateria` e `location ^~ /gelateria/`, quindi
inserire:

```nginx
include /etc/nginx/snippets/gelateria.conf;
```

Prima di applicare o ricaricare qualsiasi cosa:

```bash
systemd-analyze verify deploy/systemd/gelateria.service
nginx -t
bash -n scripts/deploy.sh scripts/backup-db.sh
node --check scripts/pg-dump-safe.mjs
```

Solo dopo esito positivo si eseguono `systemctl daemon-reload`, il deploy e i
reload di nginx/cron. Verificare infine che il processo non sia root e che la
porta non ascolti su `*`:

```bash
systemctl show gelateria -p User -p Group -p MainPID
ss -ltnp | grep ':3030'
curl --fail --silent http://127.0.0.1:3030/gelateria/api/health
curl --fail --silent https://filippo.eventoyou.com/gelateria/api/health
```

L'esito atteso di `ss` e' `127.0.0.1:3030`. Una richiesta a
`http://IP-PUBBLICO:3030` deve fallire; va mantenuta anche una regola firewall
che neghi la porta 3030 dall'esterno.

### Rotazione delle credenziali di accesso

La procedura per generare `APP_PASSWORD_HASH` senza lasciare la password nella
cronologia è in
[FASE-3.md](FASE-3.md#attivazione-live-e-rotazione-password). Sostituire la
riga in `/etc/gelateria/gelateria.env`. Per una rotazione ordinaria basta
aggiornare l'hash. Se invece la password può essere stata letta da terzi,
aggiornare anche `SESSION_SECRET`: è la chiave che firma i cookie e la sua
rotazione invalida immediatamente tutte le sessioni esistenti.

### Deploy: garanzie e limite attuale

`scripts/deploy.sh` impedisce due esecuzioni contemporanee con un lock, poi
esegue dipendenze, generazione Prisma e build **prima**
delle migrazioni. Un errore in queste tre fasi non cambia il database e non
riavvia il servizio. La build modifica comunque `.next` in-place: finche' non
ci saranno directory di release separate non e' una pubblicazione atomica. Le
migrazioni non hanno rollback automatico: devono essere additive o comunque
compatibili con la versione gia' in esecuzione.

Il deploy non usa ancora directory di release con switch atomico. Se fallisce
dopo la migrazione o dopo il riavvio:

1. non rilanciare il deploy alla cieca;
2. leggere `journalctl -u gelateria -n 100 --no-pager`;
3. controllare lo stato della migrazione e la compatibilita' col commit
   precedente;
4. ripristinare codice e build del commit noto solo dopo aver verificato che lo
   schema sia compatibile; una migrazione distruttiva richiede invece un
   ripristino dati pianificato.

## Backup

Il cron esegue il backup ogni giorno alle 03:30 secondo il fuso orario del
server. Lo script:

- impedisce esecuzioni sovrapposte con `flock`;
- crea il dump con nome univoco e lo pubblica con una rinomina atomica;
- rimuove il file parziale anche su errore, `INT` o `TERM`;
- verifica dimensione minima, integrita' gzip e presenza dello schema e dei
  dati fondamentali della gelateria;
- passa host, utente, password e database a `pg_dump` con variabili libpq,
  senza mettere la URI PostgreSQL nella command line;
- conserva 30 giorni di dump e uno specchio additivo dello storage.

Lo specchio e' una protezione dalle cancellazioni, non un archivio a versioni:
se un file viene modificato mantenendo lo stesso percorso, la copia precedente
viene sostituita al backup successivo.

Controlli non invasivi:

```bash
tail -n 100 /var/log/gelateria-backup.log
find /var/backups/gelateria -maxdepth 1 -name '*.sql.gz' -printf '%TY-%Tm-%Td %TT %s %p\n'
gzip -t /var/backups/gelateria/gelateria_guido-DATA.sql.gz
```

Il backup locale non protegge dalla perdita dell'intero VPS. Dump e storage
devono essere copiati anche fuori server, cifrati prima del trasferimento, con
monitoraggio dell'eta' dell'ultimo backup. Almeno periodicamente va eseguita una
prova di ripristino completa.

## Ripristino sicuro

Non usare `gunzip | psql` direttamente su `gelateria_guido`: il dump SQL non
rimuove in modo affidabile gli oggetti preesistenti e un errore a meta' puo'
lasciare il database incoerente. Ripristinare sempre in un database nuovo.

Scegliere nomi espliciti e controllarli prima di ogni comando:

```bash
set -euo pipefail
BACKUP=/var/backups/gelateria/gelateria_guido-DATA.sql.gz
RESTORE_DB=gelateria_restore_AAAAMMGG

gzip -t -- "$BACKUP"
sudo -u postgres createdb --owner=gelateria "$RESTORE_DB"
gzip -cd -- "$BACKUP" | \
  psql --host=127.0.0.1 --username=gelateria --dbname="$RESTORE_DB" \
    --set=ON_ERROR_STOP=on --single-transaction
```

La password non va scritta nella cronologia della shell: usare un file
temporaneo `PGPASSFILE` con permessi `0600`, oppure una `.pgpass` gia'
predisposta per l'operatore.

Prima del cutover:

1. verificare numero e stato delle righe in `_prisma_migrations`;
2. eseguire query di consistenza e uno smoke test dell'app puntato al database
   ripristinato;
3. copiare lo storage in una directory temporanea e confrontarlo, senza
   sovrascrivere quello live;
4. creare un ulteriore backup del database live;
5. fermare le scritture, rinominare i database con un piano di ritorno e
   riavviare l'app soltanto durante una finestra di manutenzione;
6. conservare il vecchio database finche' il collaudo non e' concluso.

Il cutover modifica dati e servizio: non e' parte di uno script automatico e
richiede autorizzazione esplicita.
