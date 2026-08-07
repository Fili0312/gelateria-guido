#!/usr/bin/env bash
#
# Deploy di Gelateria Guido.
#
#   ./scripts/deploy.sh
#
# Fa il giro completo: dipendenze, client Prisma, build, migrazioni, riavvio, e
# soprattutto **verifica** che l'app sia davvero tornata su. Un deploy che non
# controlla l'esito non e' un deploy, e' una speranza.
#
# Dipendenze, generazione e build avvengono prima di toccare il database. Da
# quando partono le migrazioni, pero', non esiste rollback automatico: le
# migrazioni di produzione devono restare compatibili con la versione in uso.
# Se il riavvio o l'health check falliscono, lo script segnala l'errore e lascia
# all'operatore il recupero descritto in docs/OPERAZIONI.md.

set -euo pipefail
# Gli artefatti creati da root devono restare leggibili dall'utente non-root
# del servizio; i segreti sono fuori dalla build e mantengono permessi propri.
umask 0022

PROGETTO="/var/www/gelateria-guido"
FILE_VARIABILI="${GELATERIA_ENV_FILE:-/etc/gelateria/gelateria.env}"
SERVIZIO="gelateria"
HEALTH="http://127.0.0.1:3030/gelateria/api/health"
TENTATIVI=20

# In produzione i segreti vivono fuori dalla directory servita da Next. Oltre
# a ridurre l'esposizione del repository, questo evita che `next start` provi
# a rileggere un `.env` root-only e registri un falso errore a ogni avvio.
if [[ ! -r "$FILE_VARIABILI" ]]; then
  echo "File delle variabili non leggibile: $FILE_VARIABILI" >&2
  exit 78
fi
set -a
# shellcheck disable=SC1090
. "$FILE_VARIABILI"
set +a

UTENTE_SERVIZIO="${GELATERIA_SERVICE_USER:-gelateria-app}"
GRUPPO_SERVIZIO="${GELATERIA_SERVICE_GROUP:-$UTENTE_SERVIZIO}"

exec {deploy_lock_fd}>/run/lock/gelateria-deploy.lock
if ! flock -n "$deploy_lock_fd"; then
  echo "Un altro deploy di Gelateria Guido e' gia' in esecuzione." >&2
  exit 75
fi

cd "$PROGETTO"

echo "→ Dipendenze"
# Anche con NODE_ENV=production servono Prisma, TypeScript e il toolchain CSS
# per costruire la release; `--prod=false` impedisce a pnpm di potarli.
pnpm install --frozen-lockfile --prod=false

echo "→ Client Prisma"
pnpm exec prisma generate

echo "→ Build"
pnpm build

# Il template systemd rende scrivibile soltanto la cache runtime. Dopo una
# build eseguita da root ne riallineiamo i permessi, ma solo se l'utente di
# servizio e' gia' stato installato. Lo storage viene preparato una volta sola
# seguendo docs/OPERAZIONI.md e non viene ricorsivamente toccato a ogni deploy.
if id -u "$UTENTE_SERVIZIO" >/dev/null 2>&1; then
  echo "→ Permessi della cache runtime"
  install -d -o "$UTENTE_SERVIZIO" -g "$GRUPPO_SERVIZIO" -m 0700 "$PROGETTO/.next/cache"
  chown -R -- "$UTENTE_SERVIZIO:$GRUPPO_SERVIZIO" "$PROGETTO/.next/cache"
fi

# Fino a qui il database non e' stato modificato e il servizio non e' stato
# riavviato. La build resta in-place: il limite e' documentato nel runbook.
echo "→ Migrazioni del database"
pnpm exec prisma migrate deploy

echo "→ Riavvio del servizio"
systemctl restart "$SERVIZIO"

echo -n "→ Attendo che risponda"
for ((i = 1; i <= TENTATIVI; i++)); do
  if codice=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH" 2>/dev/null) &&
    [[ "$codice" == "200" ]]; then
    echo " ok"
    echo
    curl --fail --silent --show-error --max-time 5 "$HEALTH"
    echo
    echo "✓ Deploy completato — https://filippo.eventoyou.com/gelateria"
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo " no"
echo
echo "✗ L'app non risponde 200 su $HEALTH dopo $((TENTATIVI * 2))s."
echo "  Ultimo codice HTTP: ${codice:-nessuna risposta}"
echo "  Log:  journalctl -u $SERVIZIO -n 50 --no-pager"
exit 1
