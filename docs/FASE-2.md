# FASE 2 — Modello dati e nucleo deterministico · ✅ completata

Data: 2026-08-07

**Obiettivo della fase.** Lo schema completo e — soprattutto — il modulo
unità/prezzi corretto e testato. È la fase su cui poggia tutto il resto:
riscrivere questi due moduli dopo, con dati veri dentro, significherebbe
migrare.

---

## Lo schema

**22 tabelle, 20 enum, una migrazione sola.** Farne otto incrementali con dati
dentro sarebbe costato di più. Il ragionamento dietro ogni entità sta in
[ANALISI.md](ANALISI.md) §3; qui restano le tre regole che spiegano metà delle
colonne:

1. **`organization_id` ovunque.** Oggi c'è una gelateria sola; il giorno che ce
   ne fosse un'altra, la colonna c'è già.
2. **I prezzi non si aggiornano mai.** Un prezzo nuovo chiude il precedente e
   se ne inserisce uno nuovo. Da qui vengono gratis storico, variazioni,
   «prezzo alla data dell'ordine» e l'annullamento di un import sbagliato.
3. **Niente si cancella.** Un prodotto sparito da un listino diventa
   `active = false`: cancellarlo porterebbe via storico prezzi e righe d'ordine.

### Quello che Prisma non sa esprimere, aggiunto a mano

| | Perché |
|---|---|
| 4 indici **GIN trigram** (`product.normalized_name`, `product_alias.normalized_text`, `supplier_product.raw_name`, `supplier_product.supplier_code`) | senza, cercare «birra» su qualche migliaio di prodotti è una scansione sequenziale. Servono sia alla barra di ricerca (Fase 12) sia ai candidati di abbinamento (Fase 9) |
| **Un solo prezzo corrente per prodotto** (indice unico parziale su `valid_to IS NULL`) | si potrebbe controllare nel codice, ma il codice si dimentica: basta un import che va in errore a metà, o due richieste in parallelo, e il confronto dice due cose diverse a seconda della query |
| **Una sola bozza d'ordine per utente** (indice unico parziale su `status = 'DRAFT'`) | il carrello è uno |

Entrambi gli invarianti sono stati **provati**: il database rifiuta il secondo
prezzo corrente con un errore di vincolo, non con un silenzio.

### Migrazioni senza database ombra

`prisma migrate dev` vuole un «database ombra» che crea e distrugge da solo, e
per farlo il ruolo `gelateria` dovrebbe avere il permesso di creare database.
È lo stesso ruolo con cui gira il servizio web esposto su internet: non gli si
danno privilegi che servono solo in fase di sviluppo.

Il flusso è quindi `prisma migrate diff`, incapsulato in
[`scripts/nuova-migrazione.sh`](../scripts/nuova-migrazione.sh):

```bash
./scripts/nuova-migrazione.sh nome_migrazione   # genera il .sql dal diff
#   → rileggilo, aggiungi indici trigram/parziali se servono
pnpm db:deploy                                   # applica
```

Lo script segnala in rosso le istruzioni `DROP`, perché sono quelle che
meritano una seconda lettura.

---

## Il nucleo deterministico

Due moduli in `src/server/domain/`, **senza una riga di Prisma, React o Next**:
girano nei test senza database e senza rete. Verificato meccanicamente.

### `packaging/` — unità di misura e confezioni

Il pezzo di codice più importante del progetto dopo l'apply dell'import.
Estrae formato e confezione dalla descrizione, che è dove i fornitori li
scrivono.

**Due convenzioni di mestiere** che nessuna libreria generica indovina, prese
dai listini veri e ora regole esplicite:

- **`1/1` è un litro**, `1/2` mezzo, `1/5` venti centilitri, `1/10` dieci.
  La frazione è di litro. Compare 55 volte da Barzelli.
- **`0.700` sono 70 cl**, non 700 millilitri: litri col punto decimale.

E quattro trappole che il parser evita per costruzione: `40^` (gradi
alcolici), `903` (codice dentro il nome), `2006` (annata del vino), `28/02`
(data) **non** sono formati.

**La regola che ordina tutto il resto:** ciò che è misurato in pezzi è una
*confezione*, non un formato. «conf. 12 pz» sono dodici pezzi dentro un collo,
non un pezzo da dodici.

**`packQuantityConfirmed`** è il campo che non sembra necessario finché non lo
è. Nei listini veri i pezzi per collo sono dichiarati solo nel 3% delle righe,
ma l'85% degli articoli si vende a pezzo singolo — quindi il default 1 è giusto
quasi sempre. Il flag distingue «so che è 1» da «non lo so e ho messo 1»:
senza, il prezzo al litro di un collo verrebbe calcolato su un numero
inventato, e sembrerebbe un dato come tutti gli altri.

Provato sul database vero: l'articolo Cecconi `20561` (ALISEA CL.50 a collo,
pezzi non dichiarati) risulterebbe a 9,44 €/L contro gli 0,44 €/L dello stesso
prodotto con la confezione nota — **21 volte peggio**, e falso. `confrontaOfferte`
lo esclude e lo dichiara, invece di pubblicare il numero.

### `pricing/` — sconti, prezzi unitari, storico

**Sconti a cascata.** Barzelli ha due colonne di sconto, Cecconi cinque, e si
applicano in sequenza: `4,61 × 0,94 × 0,90 = 3,90`. Non si sommano — 6% + 10%
fanno 15,4%, non 16%.

**L'arrotondamento è al pari (bancario), non per eccesso.** Verificato su
dodici righe reali: half-even le indovina tutte, half-up sbaglia i due
pareggi (`5,25 −10% = 4,725 → 4,72` e `21,45 −10% = 19,305 → 19,30`). Sono due
pareggi su dodici casi: pochi per chiamarla una certezza, abbastanza per non
scegliere l'altro. Per questo `MODO_ARROTONDAMENTO` è una costante con un nome.

**Il prezzo che si salva è quello stampato sul listino**, non quello
ricalcolato: è il numero che finirà in fattura. Il calcolo serve come
controllo — `verificaNetto()` confronta i due e, se non tornano, quasi sempre
significa che gli sconti sono stati letti male dal PDF. Meglio scoprirlo in
revisione che sei mesi dopo, guardando uno storico che non torna.

**Il caso del punto 5 della specifica** funziona: 12 bottiglie da 33 cl a 9 €
sono 2,27 €/L, 24 a 16 € sono 2,02 €/L — il secondo conviene dell'11%, cosa
invisibile confrontando 9 con 16.

**Due cose che il confronto si rifiuta di fare**, ed è il motivo per cui esiste
una funzione invece di un `Math.min`: confrontare chili con litri (servirebbe
una densità che non abbiamo) e confrontare un'offerta con la confezione ignota.
In entrambi i casi dichiara l'incertezza invece di produrre un numero.

---

## Test

**64 test, tutti verdi, nessuno tocca il database o la rete.**

Il test-set del parser sta in [`tests/fixtures/formati.ts`](../tests/fixtures/formati.ts):
**40 casi, di cui 30 righe copiate dai listini veri** (13 Barzelli, 17 Cecconi),
comprese le maiuscole a caso e gli spazi mancanti. Il criterio della fase
chiedeva ≥95%; il risultato è **40/40 = 100%**, e il test stampa i falliti
invece di nasconderli — un parser che passa «quasi tutti» i test senza dire
quali ha mancato non è misurato, è solo verde.

I test degli sconti sono dodici righe reali con il netto calcolato dal
gestionale del fornitore: se passano, il nostro conto è lo stesso del loro. È
l'unico modo di saperlo senza aspettare la prima fattura.

```bash
pnpm test        # 64 test, ~0,5 s, senza database
pnpm typecheck
pnpm lint
```

---

## Il seed

`pnpm db:seed` popola con i **due fornitori veri** e 20 righe copiate dai loro
listini. I prezzi entrano dal codice, non da un import: l'importazione PDF
arriva in Fase 7. È idempotente.

Cosa produce, e perché i numeri non tornano a occhio:

| | |
|---|---|
| fornitori | 2 |
| prodotti canonici | **19** |
| prodotti fornitore | 20 |
| prezzi | 20 |
| confezione da definire | 4 |

**19 canonici da 20 righe** perché due offerte confluiscono sullo stesso
prodotto: ALISEA CL.50 comprata a pezzo e comprata a collo da 24. È il modello
che funziona — stesso articolo, stesso formato unitario, due confezioni
diverse, confrontabili.

---

## Verifiche fatte (i criteri di completamento)

| Criterio | Esito |
|---|---|
| `prisma migrate deploy` va a buon fine da zero | ✅ provato su un database vuoto creato apposta, poi rimosso |
| Il seed popola un database usabile | ✅ e rilanciato due volte non duplica nulla |
| Il parser supera ≥95% dei casi di Fase 0 | ✅ **40/40 (100%)**, 30 dei quali righe reali |
| `unitPrice()` risolve 12×33cl a 9 € contro 24×33cl a 16 € | ✅ 2,2727 €/L contro 2,0202 €/L, −11,1% |
| I test del dominio girano senza database e senza rete | ✅ verificato anche meccanicamente: nessun import di Prisma, rete, React o Next in `domain/` |
| Invarianti difesi dal database | ✅ il secondo prezzo corrente viene rifiutato con errore di vincolo |
| L'app resta in piedi | ✅ deploy completo, `/api/health` risponde 200 con 2 migrazioni applicate |

---

## Da sapere per le fasi successive

- **Il denaro è sempre `Decimal`**, mai `number`. Il dominio usa `decimal.js`
  direttamente (non `Prisma.Decimal`) per restare indipendente dall'ORM; al
  confine col database si converte con `.toString()`.
- **`tsx` è il runner dei test e degli script** (`pnpm test`, `pnpm db:seed`):
  lo strip-types di Node non risolve gli import con estensione `.js`, che sono
  però la forma corretta per l'ESM.
- **`packQuantityConfirmed = false` non è un dettaglio**: ogni schermata che
  mostra un prezzo per unità deve gestirlo, o mostrerà numeri inventati con la
  stessa faccia di quelli veri.
- Lo schema contiene già le tabelle delle fasi 7–17 (import, ordini, documenti,
  invii email, IA). Sono vuote, ma non serviranno migrazioni per riempirle.

## Prossimo passo

**Fase 3 — Autenticazione e guscio applicativo**: login a password unica
condivisa (decisione D4), protezione delle rotte, scope `organization_id`
centralizzato nei repository, e i componenti UI di base con i vincoli di D12
(bersagli ≥44 px, tastiera completa su desktop).
