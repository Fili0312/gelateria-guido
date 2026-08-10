# Gelateria Guido — ordini e listini fornitori

Applicazione web per gestire i listini dei fornitori e comporre gli ordini di
una gelateria: dal PDF del listino che arriva per email fino al documento
d'ordine pronto da mandare.

Il problema che risolve è concreto. Gli stessi articoli si comprano da più
fornitori, ciascuno con il suo listino, i suoi codici, le sue confezioni e i
suoi sconti a cascata. Capire chi conviene davvero — a parità di contenuto,
non di prezzo di listino — a mano non si fa.

**In produzione:** <https://filippo.eventoyou.com/gelateria>

## Cosa fa

| | |
|---|---|
| **Import listini** | dal PDF al catalogo: estrazione deterministica, IA solo dove serve conoscenza del mondo, revisione prima di applicare, annullamento |
| **Catalogo** | prodotti, offerte per fornitore, storico prezzi, reparti e categorie |
| **Confronto** | chi conviene a parità di contenuto reale, con lo sconto extra concordato incluso nel calcolo ma non nel totale da pagare |
| **Ordine** | composizione per reparti, avviso quando esiste di meglio, riepilogo, conferma con codice progressivo |
| **Storico** | ordini congelati, riordino ai prezzi di oggi, annullamento |
| **Documenti** | un PDF per ogni fornitore più il riepilogo in Excel |
| **Analisi** | statistiche acquisti per prodotto, andamento dei prezzi e dashboard operativa |

Manca l'invio automatico per email (Fase 17): i documenti si scaricano e si
allegano a mano.

## Come è fatto

Next.js 16 (App Router) · React 19 · Tailwind 4 · Prisma 7 su PostgreSQL 16
(`pg_trgm`, `unaccent`) · decimal.js per ogni importo · DeepSeek per i passaggi
che richiedono conoscenza del mondo.

Due principi che spiegano gran parte delle scelte:

**Regola deterministica prima, IA solo per ciò che la richiede.** Sulla
classificazione di 326 articoli, 174 li ha risolti una regola e 152 il modello,
per 0,0084 $ in tutto. Un modello che indovina ciò che una regola sa è costo e
imprevedibilità in cambio di niente.

**Gli ordini si congelano.** Un ordine confermato conserva prezzi, descrizioni
e nomi del momento in cui è stato fatto, e non li rilegge mai più dal catalogo.
È l'accordo commerciale, e deve reggere anche sei mesi dopo.

## Sviluppo

```bash
pnpm install
cp .env.example .env          # poi compila DATABASE_URL
pnpm exec prisma generate
pnpm dev
```

```bash
pnpm test                     # suite completa
pnpm test:real-pdf            # regressioni sui listini riservati, se presenti
pnpm exec tsc --noEmit        # tipi
pnpm build
```

I test girano con `tsx --conditions=react-server`. La suite normale e' portabile:
su un clone senza i listini riservati salta soltanto i casi che leggono quei PDF.
`test:real-pdf` invece fallisce esplicitamente se le fixture non sono installate.

### Migrazioni

```bash
./scripts/nuova-migrazione.sh nome_della_migrazione
```

### Collaudi

Gli script `scripts/collaudo-*.ts` verificano i criteri di una fase su dati
veri. **Si rifiutano di girare sul database di produzione**: vanno puntati su
una copia.

```bash
sudo -u postgres psql -c "CREATE DATABASE gelateria_prova TEMPLATE gelateria_guido OWNER gelateria"
DATABASE_URL=postgresql://…/gelateria_prova STORAGE_DIR=/tmp/prova \
  pnpm exec tsx --conditions=react-server scripts/collaudo-documenti.ts
```

### Deploy

```bash
./scripts/deploy.sh
```

Test, tipi, lint, formattazione, build, backup pre-migrazione, migrazioni,
riavvio di `gelateria.service` (porta 3030) e verifica che risponda. Il deploy
si rifiuta di partire da un worktree non committato.

## Documentazione

[Il manuale d'uso](docs/MANUALE-USO.md) descrive il flusso quotidiano dalla
ricezione del listino ai documenti d'ordine. [Il runbook](docs/OPERAZIONI.md)
copre deploy, backup e ripristino.

`docs/ROADMAP.md` è il documento principale: venti fasi, ciascuna con obiettivo,
criteri di completamento e — per quelle fatte — cosa è rimasto fuori e perché.

`docs/FASE-*.md` racconta ogni fase conclusa: le decisioni prese, i difetti
trovati e come sono stati verificati.

## Cosa non finisce nel repo

I listini dei fornitori contengono i prezzi d'acquisto della gelateria: sono
esclusi da `.gitignore` da prima del primo commit. Fuori anche `storage/` (PDF
caricati e documenti generati) e ogni `.env`. Le chiavi API si leggono solo
dall'ambiente.
