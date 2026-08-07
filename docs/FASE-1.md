# FASE 1 — Setup e infrastruttura · ✅ completata

Data: 2026-08-07 · Live su **https://filippo.eventoyou.com/gelateria**

Doppio ruolo di questo documento: rendicontazione della fase e **runbook**
operativo del progetto.

---

## Com'è fatta

| Pezzo | Scelta | Dove |
|---|---|---|
| App | Next 16.3 (App Router) + React 19.2 | `src/app/` |
| Stile | Tailwind 4 con token propri | `src/app/globals.css` |
| Database | PostgreSQL 16 · db `gelateria_guido` · ruolo `gelateria` | locale, 127.0.0.1:5432 |
| ORM | Prisma 7.9 con adapter `pg` | `prisma/`, `src/server/db.ts` |
| Servizio | systemd `gelateria` sulla porta **3030** | `/etc/systemd/system/gelateria.service` |
| Proxy | nginx `location /gelateria` | `/etc/nginx/sites-available/filippo` |
| Backup | cron giornaliero 03:30 | `/etc/cron.d/gelateria` |

Estensioni Postgres attive: `pg_trgm`, `unaccent`, `pgcrypto`, `btree_gin` —
create dalla migrazione `20260807000000_estensioni`. Sono tutte *trusted* su
PG16, quindi le crea il ruolo dell'app: una installazione da zero non ha
bisogno del superutente.

---

## Comandi

```bash
cd /var/www/gelateria-guido

# Sviluppo (senza basePath, su http://localhost:3030)
NEXT_BASE_PATH= pnpm dev

# Controlli
pnpm typecheck && pnpm lint && pnpm format:check

# Deploy completo: dipendenze, client, build, migrazioni, riavvio, verifica
./scripts/deploy.sh

# Backup a mano (gira comunque ogni notte alle 03:30)
./scripts/backup-db.sh

# Log
journalctl -u gelateria -f
tail -f /var/log/gelateria-backup.log

# Stato leggibile da una macchina
curl -s https://filippo.eventoyou.com/gelateria/api/health | jq
```

**Ripristino da backup:** non riversare un dump direttamente sul database
live. La procedura verificabile su database nuovo, con collaudo e cutover, è in
[OPERAZIONI.md](OPERAZIONI.md#ripristino-sicuro).

---

## Cose da sapere prima di metterci le mani

- **`basePath` ha come default `/gelateria`, non stringa vuota.** È deliberato:
  su questo server è già capitato che una build senza basePath producesse un
  sito senza stile. Chi non configura nulla ottiene la versione giusta; per
  lavorare in locale si passa `NEXT_BASE_PATH=`.
- **Il file live `/etc/gelateria/gelateria.env` è `chmod 600` e non entra in
  git.** Lo legge systemd via `EnvironmentFile`. `.env.example` documenta ogni
  variabile, anche quelle che
  serviranno solo dalla Fase 8 (DeepSeek) — così non ci si dimentica che
  esistono.
- **Il client Prisma non è versionato** (`src/generated/`): lo rigenera
  `deploy.sh`.
- **`deploy.sh` costruisce prima di migrare** e non riavvia se build o
  migrazioni falliscono; non dichiara riuscito un deploy finché `/api/health`
  non risponde 200. Il limite della build in-place e il recupero dopo una
  migrazione sono documentati in [OPERAZIONI.md](OPERAZIONI.md).
- **`backup-db.sh` cancella i dump parziali.** Un archivio pieno di dump
  troncati è peggio di un archivio vuoto, perché sembra un backup che c'è.
  Verificato con un `pg_dump` che fallisce di proposito.
- **I PDF dei listini sono già esclusi da git** (`.gitignore` scritto prima del
  `git init`): sono i prezzi d'acquisto della gelateria.
- **Memoria limitata a 512 MB** (`NODE_OPTIONS` nell'unit): il VPS ha 7 GB già
  impegnati da china (2 servizi), menu-digitale, MySQL, Postgres e Redis.

---

## Verifiche fatte (i criteri di completamento della fase)

| Criterio | Esito |
|---|---|
| `https://filippo.eventoyou.com/gelateria` risponde | ✅ 200, CSS incluso (12,9 KB, `text/css`) — verificato anche con screenshot |
| `systemctl status gelateria` attivo, riavvio automatico | ✅ dopo `kill -9` il servizio è tornato su da solo e ha risposto 200 |
| Avvio al boot | ✅ `enabled` |
| `deploy.sh` esegue un ciclo completo | ✅ dipendenze → migrazioni → client → build → riavvio → health 200 |
| `psql` si connette con l'utente dell'app | ✅ |
| Estensioni create | ✅ `btree_gin, pg_trgm, pgcrypto, unaccent` |
| Il dump di backup è ripristinabile | ✅ **provato davvero**: ripristinato in un database vuoto, estensioni e tabella migrazioni ritrovate |
| Rimozione dei dump parziali | ✅ provata con `pg_dump` che fallisce |

Verificato anche che il resto del server non si sia mosso: `/china` e i siti
vetrina rispondono come prima.

**Nota su `/gelateria-guido/`**: restituisce 500 (ciclo di redirect interno
di nginx, perché l'alias punta a un `dist/` mai esistito). È **preesistente**
— quei blocchi sono in configurazione da almeno il 2 luglio — e non c'entra
con questa fase. Si sistema quando vuoi, rimuovendo quei blocchi o creando la
vetrina; non l'ho toccato perché D1 ha deciso di lasciarli stare.

---

## Cosa NON c'è ancora, di proposito

- **Nessuna tabella di dominio.** Arrivano tutte insieme in Fase 2, quando i
  PDF reali avranno chiarito se servono i prezzi a scaglioni (D7). Farlo ora
  significherebbe rischiare una migrazione su dati veri.
- **Nessun login.** È la Fase 3. Finché l'app non contiene dati, la pagina di
  stato è pubblica e non espone nulla di sensibile — ma **il login va messo
  prima di caricare il primo listino vero**.

---

## Prossimo passo

**Fase 2 — Modello dati e nucleo deterministico.** Serve prima la risposta a
D7 (prezzi a scaglioni), che arriva dai PDF: mettili in
`tests/fixtures/listini/` e lancia
`python3 scripts/analizza-listino.py tests/fixtures/listini`.
