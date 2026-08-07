# FASE 3 — Autenticazione e guscio applicativo

Data: 2026-08-07 · **codice completato e collaudato localmente** · attivazione
live in attesa della password definitiva.

## Risultato

L'applicazione non è più una pagina di stato: ora ha accesso protetto,
navigazione responsive e prime schermate collegate ai dati reali. La scelta è
quella già fissata in D4: una sola password condivisa, senza email e senza
password in chiaro nel database.

- `POST /api/auth/login` verifica un hash Argon2id preso da `.env`.
- Il body di login viene interrotto oltre 4 KiB; applicazione e nginx limitano
  inoltre a otto i tentativi ravvicinati per indirizzo, contenendo sia il brute
  force sia il costo CPU/RAM di Argon2id.
- La sessione dura sette giorni ed è firmata con HMAC-SHA256; nel cookie ci
  sono soltanto gli identificativi di utente e organizzazione.
- Il cookie è `httpOnly`, `secure`, `sameSite=lax` e limitato al percorso
  `/gelateria`.
- Il proxy esegue il controllo rapido di firma e scadenza; `getCurrentUser()`
  verifica poi nel database che utente e organizzazione esistano ancora e che
  l'utente sia attivo.
- `POST /api/auth/logout` invalida il cookie nel browser.

## Isolamento dei dati

Il codice applicativo riceve Prisma soltanto attraverso
`prismaForOrganization(organizationId)`. L'estensione aggiunge il filtro a
letture, modifiche e cancellazioni e inserisce l'organizzazione nelle nuove
righe. I modelli figli privi della colonna possono essere raggiunti soltanto
con query annidate dal genitore già isolato.

Il client Prisma senza scope è confinato a bootstrap/login e health check. Una
regola ESLint impedisce di importarlo altrove, mentre i test verificano che
query raw e delegate non isolabili non compaiano nel tipo del client pubblico.

## Interfaccia

Il guscio usa una barra laterale su desktop e una navigazione orizzontale
scorrevole su telefono e tablet. Sono presenti dashboard, fornitori, prodotti,
listini, ordini e impostazioni. Dashboard, fornitori e prodotti leggono i dati
seed reali; listini e ordini sono destinazioni vere predisposte per le fasi
successive.

I componenti base richiesti sono tutti usati: `Button`, `Input`, `Table`,
`Dialog`, `Badge`, `Stepper` e toast. I controlli interattivi hanno area minima
di 44 px, focus da tastiera visibile e supporto a movimento ridotto.

## Collaudo eseguito

Con un hash temporaneo, poi rimosso dal progetto, sono stati verificati:

1. redirect anonimo da `/gelateria` e dalle sottorotte a `/gelateria/login`,
   senza duplicare il `basePath`;
2. password errata → `401`, password corretta → cookie e dashboard `200`;
3. accesso a dashboard e impostazioni con dati reali;
4. stop e riavvio completo del processo Next, conservando la stessa sessione;
5. logout e successivo redirect al login;
6. body oltre limite → `413`, primi otto tentativi errati → `401`, nono →
   `429`, senza impedire l'accesso da un altro indirizzo;
7. resa visiva a 1440×1000 e 390×844.

I controlli automatici da ripetere prima di ogni deploy sono:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm exec prisma validate
pnpm build
```

Esito al completamento: **94 test su 94** in 26 suite, typecheck, ESLint,
Prettier e schema Prisma verdi; build production Next completata in una copia
temporanea per non sovrascrivere gli artefatti usati dal processo live.

## Attivazione live

`APP_PASSWORD_HASH` nel `.env` live è intenzionalmente ancora vuoto: non è
stata inventata una credenziale al posto del proprietario. Per scegliere la
password senza scriverla nella cronologia della shell:

```bash
cd /var/www/gelateria-guido
read -rsp 'Nuova password condivisa: ' GELATERIA_PASSWORD; printf '\n'
printf '%s' "$GELATERIA_PASSWORD" | pnpm --silent auth:hash
unset GELATERIA_PASSWORD
```

Il comando stampa l'intera assegnazione `APP_PASSWORD_HASH="..."` da sostituire
nel `.env`. I dollari sono già escapati: rimuovere quei backslash romperebbe
l'hash quando Next carica il file. Il primo deploy accetta temporaneamente un
minimo di 7 caratteri su richiesta del proprietario; al primo cambio va
ripristinato un minimo di almeno 8 ed è preferibile una frase lunga e non
riutilizzata.

Cambiare soltanto `APP_PASSWORD_HASH` non chiude le sessioni già firmate. Se la
password può essere stata compromessa, rigenerare nello stesso intervento
anche `SESSION_SECRET` con `openssl rand -base64 48`: al riavvio tutte le
sessioni esistenti verranno invalidate e sarà necessario accedere di nuovo.

Prima del deploy live si crea un nuovo backup, poi si seguono installazione e
verifiche in [OPERAZIONI.md](OPERAZIONI.md). I template `deploy/` non modificano
il server finché non vengono installati manualmente.

Al momento di questo handoff il servizio live continua intenzionalmente a
servire la versione precedente: gira ancora come `root` e ascolta su `*:3030`.
Attivare insieme hash definitivo, nuova unit systemd e binding su
`127.0.0.1`; riavviare soltanto uno di questi pezzi lascerebbe il sistema
incoerente o renderebbe impossibile l'accesso.
