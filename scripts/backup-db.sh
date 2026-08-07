#!/usr/bin/env bash
#
# Backup di Gelateria Guido: database + PDF dei listini.
#
#   ./scripts/backup-db.sh
#
# Perche' esiste: lo storico prezzi non e' ricostruibile. Se si perde il
# database, l'unico modo di riaverlo e' ricaricare tutti i listini di tutti i
# fornitori di tutti i mesi passati — cioe' non riaverlo. Per lo stesso motivo
# vengono copiati anche i PDF originali: sono la fonte da cui tutto deriva.
#
# Non ripristinare direttamente sopra il database live: la procedura sicura,
# con database nuovo, verifica e cutover, e' in docs/OPERAZIONI.md.

set -euo pipefail
umask 077

PROGETTO="/var/www/gelateria-guido"
DESTINAZIONE="/var/backups/gelateria"
GIORNI_DI_STORIA=30

cd "$PROGETTO"

# La password del database sta nel .env, fuori da git. Non usiamo `set -a`:
# pg_dump non deve ereditare chiavi IA, SMTP o altri segreti non necessari.
# shellcheck disable=SC1091
. ./.env

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL mancante in $PROGETTO/.env" >&2
  exit 1
fi

mkdir -p "$DESTINAZIONE"
chmod 700 "$DESTINAZIONE"

# Due invocazioni non devono scrivere, ripulire o ruotare gli stessi file.
lock="$DESTINAZIONE/.backup.lock"
exec {lock_fd}>"$lock"
if ! flock -n "$lock_fd"; then
  echo "Un altro backup di Gelateria Guido e' gia' in esecuzione." >&2
  exit 75
fi

# Nanosecondi + lock evitano collisioni e impediscono di sovrascrivere un dump.
marca=$(date +%Y%m%d-%H%M%S-%N)
dump="$DESTINAZIONE/gelateria_guido-$marca.sql.gz"
while [[ -e "$dump" ]]; do
  dump="$DESTINAZIONE/gelateria_guido-$marca-$RANDOM.sql.gz"
done
parziale=$(mktemp "$DESTINAZIONE/.gelateria_guido-$marca.XXXXXX.sql.gz.part")

pulisci_parziale() {
  if [[ -n "${parziale:-}" && -f "$parziale" ]]; then
    rm -f -- "$parziale"
  fi
}

fallimento() {
  local stato="$1"
  trap - ERR
  exit "$stato"
}

interrotto() {
  local segnale="$1"
  local codice="$2"
  echo "Backup interrotto da $segnale; rimuovo il dump parziale." >&2
  trap - "$segnale"
  exit "$codice"
}

# EXIT fa la pulizia effettiva anche dopo ERR, INT o TERM. Quando il file e'
# stato pubblicato atomicamente, `parziale` viene svuotato e non viene rimosso.
trap pulisci_parziale EXIT
trap 'fallimento $?' ERR
trap 'interrotto INT 130' INT
trap 'interrotto TERM 143' TERM

# Il wrapper separa la URI nelle variabili PG* che libpq comprende. Passare la
# URI in PGDATABASE non funziona (viene trattata come un semplice nome DB),
# mentre passarla a `--dbname` esporrebbe la password nella command line.
url_dump="$DATABASE_URL"
unset DATABASE_URL

echo "→ Dump del database"
DATABASE_URL="$url_dump" node scripts/pg-dump-safe.mjs --no-owner --no-privileges |
  gzip -9 >"$parziale"
unset url_dump

# Un dump vuoto e' peggio di nessun dump: da' l'illusione di essere coperti.
dimensione=$(stat -c%s "$parziale")
if ((dimensione < 1024)); then
  echo "✗ Il dump e' sospettosamente piccolo ($dimensione byte): non lo tengo." >&2
  exit 1
fi

# Verifica la struttura gzip prima di rendere visibile il nuovo backup. `mv`
# resta nello stesso filesystem ed e' quindi atomico.
gzip -t -- "$parziale"
if ! gzip -cd -- "$parziale" | awk '
  /^CREATE TABLE public\.organization \(/ { organization_schema = 1 }
  /^CREATE TABLE public\.supplier_product_price \(/ { price_schema = 1 }
  /^COPY public\.organization .* FROM stdin;$/ { in_organization_data = 1; next }
  in_organization_data && /^\\\.$/ { in_organization_data = 0; next }
  in_organization_data { organization_data = 1 }
  END { exit !(organization_schema && price_schema && organization_data) }
'; then
  echo "✗ Il dump non contiene schema e dati attesi: non lo tengo." >&2
  exit 1
fi
chmod 600 "$parziale"
mv -n -- "$parziale" "$dump"
if [[ -e "$parziale" ]]; then
  echo "✗ Esiste gia' un dump con nome $dump: non lo sovrascrivo." >&2
  exit 1
fi
parziale=""
echo "  $dump ($((dimensione / 1024)) KB)"

# I PDF non si cancellano mai, quindi lo specchio e' solo in aggiunta: niente
# --delete, cosi' un file rimosso per errore resta comunque nel backup.
stato_storage=0
if [[ -d "${STORAGE_DIR:-$PROGETTO/storage}" ]]; then
  echo "→ Specchio dei PDF e degli export"
  if rsync -a "${STORAGE_DIR:-$PROGETTO/storage}/" "$DESTINAZIONE/storage/"; then
    if riepilogo_storage=$(du -sh "$DESTINAZIONE/storage" | cut -f1); then
      echo "  $riepilogo_storage in $DESTINAZIONE/storage"
    fi
  else
    stato_storage=$?
    echo "✗ Dump completato, ma lo specchio dello storage e' fallito." >&2
  fi
fi

echo "→ Pulizia dei dump piu' vecchi di $GIORNI_DI_STORIA giorni"
eliminati=$(find "$DESTINAZIONE" -maxdepth 1 -name 'gelateria_guido-*.sql.gz' \
  -mtime +"$GIORNI_DI_STORIA" -print -delete | wc -l)
echo "  eliminati: $eliminati"

if ((stato_storage != 0)); then
  echo "✗ Backup incompleto: controllare rsync; la rotazione dei dump e' comunque avvenuta." >&2
  exit "$stato_storage"
fi

echo "✓ Backup completato ($(find "$DESTINAZIONE" -maxdepth 1 -name '*.sql.gz' | wc -l) dump conservati)"
