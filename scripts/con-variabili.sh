#!/usr/bin/env bash
#
# Esegue un comando con le variabili d'ambiente di produzione caricate.
#
#   ./scripts/con-variabili.sh pnpm exec prisma migrate deploy
#   ./scripts/con-variabili.sh tsx prisma/seed.ts
#
# Perche' serve: dalla Fase 4 i segreti non stanno piu' in un `.env` dentro il
# repository ma in /etc/gelateria/gelateria.env, letto da systemd. Ottima cosa
# per la sicurezza, ma gli strumenti da riga di comando che si aspettavano
# `dotenv` (il seed, le migrazioni, il diff dello schema) restavano senza
# DATABASE_URL — e fallivano in modo poco chiaro, o peggio, riuscivano a meta'.
#
# Il percorso si puo' cambiare con GELATERIA_ENV_FILE, come in deploy.sh.

set -euo pipefail

FILE_VARIABILI="${GELATERIA_ENV_FILE:-/etc/gelateria/gelateria.env}"

# In sviluppo puo' esserci ancora un .env locale: si usa quello, se il file di
# produzione non e' leggibile (tipicamente perche' non si e' root).
if [[ ! -r "$FILE_VARIABILI" && -r .env ]]; then
  FILE_VARIABILI=.env
fi

if [[ ! -r "$FILE_VARIABILI" ]]; then
  echo "Variabili non trovate: ne' $FILE_VARIABILI ne' ./.env sono leggibili." >&2
  echo "In produzione serve root; in sviluppo copia .env.example in .env." >&2
  exit 78
fi

set -a
# shellcheck disable=SC1090
. "$FILE_VARIABILI"
set +a

exec "$@"
