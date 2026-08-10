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
BUILD_RELEASE="$PROGETTO/.next-release"
BUILD_PRECEDENTE="$PROGETTO/.next-previous"
servizio_fermato=0

riavvia_servizio_su_uscita() {
  local stato=$?
  trap - EXIT
  if ((servizio_fermato)); then
    echo "→ Uscita imprevista durante lo scambio: provo a riavviare il servizio" >&2
    systemctl start "$SERVIZIO" || true
  fi
  exit "$stato"
}
trap riavvia_servizio_su_uscita EXIT

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

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Il worktree non e' pulito: prima crea un commit, cosi' il deploy resta reversibile." >&2
  exit 65
fi
echo "→ Revisione $(git rev-parse --short=12 HEAD)"

echo "→ Dipendenze"
# Anche con NODE_ENV=production servono Prisma, TypeScript e il toolchain CSS
# per costruire la release; `--prod=false` impedisce a pnpm di potarli.
pnpm install --frozen-lockfile --prod=false

echo "→ Client Prisma"
pnpm exec prisma generate

echo "→ Test"
pnpm test

echo "→ Controllo tipi"
pnpm typecheck

echo "→ Lint"
pnpm lint

echo "→ Formattazione"
pnpm format:check

echo "→ Build"
if [[ -e "$BUILD_RELEASE" ]]; then
  rm -rf -- "$BUILD_RELEASE"
fi
NEXT_DIST_DIR=".next-release" pnpm build

# Git permette di tornare indietro col codice, non con i dati. Il dump viene
# creato dopo tutti i gate e prima della prima operazione che può modificare
# PostgreSQL, così ogni release ha un punto di ripristino verificato.
echo "→ Backup prima del deploy"
./scripts/backup-db.sh

# Fino a qui il database non e' stato modificato e il servizio continua a
# leggere la vecchia `.next`: la build nuova vive in una directory separata.
echo "→ Migrazioni del database"
pnpm exec prisma migrate deploy

echo "→ Pubblicazione della build"
systemctl stop "$SERVIZIO"
servizio_fermato=1
if [[ -e "$BUILD_PRECEDENTE" ]]; then
  rm -rf -- "$BUILD_PRECEDENTE"
fi
if [[ -d "$PROGETTO/.next" ]]; then
  mv -- "$PROGETTO/.next" "$BUILD_PRECEDENTE"
fi
if ! mv -- "$BUILD_RELEASE" "$PROGETTO/.next"; then
  echo "✗ Non riesco a pubblicare la nuova build; ripristino quella precedente." >&2
  if [[ -d "$BUILD_PRECEDENTE" && ! -e "$PROGETTO/.next" ]]; then
    mv -- "$BUILD_PRECEDENTE" "$PROGETTO/.next"
  fi
  systemctl start "$SERVIZIO"
  exit 1
fi

# Il template systemd rende scrivibile soltanto la cache runtime. Dopo lo
# scambio riallineiamo esclusivamente quella directory; lo storage viene
# preparato una volta sola seguendo docs/OPERAZIONI.md.
if id -u "$UTENTE_SERVIZIO" >/dev/null 2>&1; then
  echo "→ Permessi della cache runtime"
  install -d -o "$UTENTE_SERVIZIO" -g "$GRUPPO_SERVIZIO" -m 0700 "$PROGETTO/.next/cache"
  chown -R -- "$UTENTE_SERVIZIO:$GRUPPO_SERVIZIO" "$PROGETTO/.next/cache"
fi

echo "→ Avvio del servizio"
systemctl start "$SERVIZIO"
servizio_fermato=0

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
