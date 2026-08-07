#!/usr/bin/env bash
#
# Deploy di Gelateria Guido.
#
#   ./scripts/deploy.sh
#
# Fa il giro completo: dipendenze, migrazioni, client Prisma, build, riavvio, e
# soprattutto **verifica** che l'app sia davvero tornata su. Un deploy che non
# controlla l'esito non e' un deploy, e' una speranza.
#
# Se qualcosa fallisce lo script si ferma prima di riavviare: meglio la
# versione vecchia funzionante che quella nuova rotta.

set -euo pipefail

PROGETTO="/var/www/gelateria-guido"
SERVIZIO="gelateria"
HEALTH="http://127.0.0.1:3030/gelateria/api/health"
TENTATIVI=20

cd "$PROGETTO"

echo "→ Dipendenze"
pnpm install --frozen-lockfile

echo "→ Migrazioni del database"
pnpm exec prisma migrate deploy

echo "→ Client Prisma"
pnpm exec prisma generate

echo "→ Build"
pnpm build

echo "→ Riavvio del servizio"
systemctl restart "$SERVIZIO"

echo -n "→ Attendo che risponda"
for ((i = 1; i <= TENTATIVI; i++)); do
  if codice=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH" 2>/dev/null) &&
    [[ "$codice" == "200" ]]; then
    echo " ok"
    echo
    curl -s "$HEALTH"
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
