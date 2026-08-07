#!/usr/bin/env bash
#
# Crea una nuova migrazione dal diff fra il database e lo schema.
#
#   ./scripts/nuova-migrazione.sh aggiunta_scaglioni
#
# Perche' non `prisma migrate dev`: quel comando vuole un "database ombra"
# che crea e distrugge da solo, e per farlo il ruolo dell'app dovrebbe avere
# il permesso di creare database. E' lo stesso ruolo con cui gira il servizio
# web esposto su internet: non gli si danno privilegi che gli servono solo in
# fase di sviluppo. `migrate diff` ottiene lo stesso risultato senza.
#
# Dopo aver eseguito questo script: apri il file SQL, controllalo (soprattutto
# se ci sono DROP), aggiungi a mano quello che Prisma non sa esprimere
# (indici trigram, indici parziali), poi applica con `pnpm db:deploy`.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <nome_migrazione>" >&2
  echo "Esempio: $0 aggiunta_scaglioni" >&2
  exit 1
fi

nome="$1"
cartella="prisma/migrations/$(date +%Y%m%d%H%M%S)_${nome}"

cd "$(dirname "$0")/.."

mkdir -p "$cartella"
./scripts/con-variabili.sh pnpm exec prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script >"$cartella/migration.sql"

righe=$(grep -cve '^\s*$' "$cartella/migration.sql" || true)

# Quando non c'e' deriva, Prisma non produce un file vuoto ma un file con
# dentro il commento "-- This is an empty migration.". Contare le righe non
# basta: senza questo controllo si accumulerebbero migrazioni che non fanno
# nulla, e ognuna e' una riga in piu' da leggere per capire cosa e' successo.
if ((righe == 0)) || grep -qi 'empty migration' "$cartella/migration.sql"; then
  echo "Nessuna differenza fra schema e database: non serve una migrazione."
  rm -f "$cartella/migration.sql"
  rmdir "$cartella"
  exit 0
fi

echo "Scritte $righe righe in $cartella/migration.sql"

if grep -qiE '^\s*(DROP|ALTER TABLE .* DROP)' "$cartella/migration.sql"; then
  echo
  echo "⚠  La migrazione contiene istruzioni DROP. Rileggila prima di applicarla:"
  grep -inE '^\s*(DROP|ALTER TABLE .* DROP)' "$cartella/migration.sql" | head -20
fi

echo
echo "Prossimi passi:"
echo "  1. rileggi   $cartella/migration.sql"
echo "  2. aggiungi  indici trigram / parziali, se ne servono"
echo "  3. applica   pnpm db:deploy"
