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
# Il dump si ripristina con:
#   gunzip -c FILE.sql.gz | psql -h 127.0.0.1 -U gelateria -d gelateria_guido

set -euo pipefail

PROGETTO="/var/www/gelateria-guido"
DESTINAZIONE="/var/backups/gelateria"
GIORNI_DI_STORIA=30

cd "$PROGETTO"

# La password del database sta nel .env, che e' chmod 600 e fuori da git.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL mancante in $PROGETTO/.env" >&2
  exit 1
fi

mkdir -p "$DESTINAZIONE"
chmod 700 "$DESTINAZIONE"

marca=$(date +%Y%m%d-%H%M%S)
dump="$DESTINAZIONE/gelateria_guido-$marca.sql.gz"

# `?schema=public` serve a Prisma ma pg_dump lo rifiuta come parametro di URI.
url_dump="${DATABASE_URL%%\?*}"

# Se il dump fallisce a meta', il file parziale non deve sopravvivere: un
# archivio pieno di dump troncati e' peggio di un archivio vuoto, perche' sembra
# un backup che c'e'.
trap '[[ -f "$dump" ]] && rm -f "$dump"' ERR

echo "→ Dump del database"
pg_dump --dbname="$url_dump" --no-owner --no-privileges | gzip -9 >"$dump"
chmod 600 "$dump"

# Un dump vuoto e' peggio di nessun dump: da' l'illusione di essere coperti.
dimensione=$(stat -c%s "$dump")
if ((dimensione < 1024)); then
  echo "✗ Il dump e' sospettosamente piccolo ($dimensione byte): non lo tengo." >&2
  rm -f "$dump"
  exit 1
fi
echo "  $dump ($((dimensione / 1024)) KB)"
trap - ERR

# I PDF non si cancellano mai, quindi lo specchio e' solo in aggiunta: niente
# --delete, cosi' un file rimosso per errore resta comunque nel backup.
if [[ -d "${STORAGE_DIR:-$PROGETTO/storage}" ]]; then
  echo "→ Specchio dei PDF e degli export"
  rsync -a "${STORAGE_DIR:-$PROGETTO/storage}/" "$DESTINAZIONE/storage/"
  echo "  $(du -sh "$DESTINAZIONE/storage" | cut -f1) in $DESTINAZIONE/storage"
fi

echo "→ Pulizia dei dump piu' vecchi di $GIORNI_DI_STORIA giorni"
eliminati=$(find "$DESTINAZIONE" -maxdepth 1 -name 'gelateria_guido-*.sql.gz' \
  -mtime +"$GIORNI_DI_STORIA" -print -delete | wc -l)
echo "  eliminati: $eliminati"

echo "✓ Backup completato ($(find "$DESTINAZIONE" -maxdepth 1 -name '*.sql.gz' | wc -l) dump conservati)"
