# Listini PDF di prova

## Cosa mettere qui

I **listini veri** dei fornitori della gelateria, così come arrivano.
Servono 3–5 file di fornitori diversi, scelti per essere il più possibile
diversi tra loro:

- uno **semplice**: tabella pulita, poche colonne;
- uno **complesso**: molte colonne, sezioni, sconti, magari più prezzi per riga;
- uno **brutto**: mal formattato, o generato male, o con il testo storto;
- se ne esiste uno **scansionato** (fotografato/acquisito da scanner), metti
  anche quello: serve a decidere se vale la pena aggiungere l'OCR.

Non serve che siano recenti né completi. Servono **rappresentativi**.

## Come si analizzano

```bash
cd /var/www/gelateria-guido
python3 scripts/analizza-listino.py tests/fixtures/listini
```

Lo script scrive `tests/fixtures/REPORT.md` e risponde da solo alle domande
che decidono lo schema del database:

| Domanda | Decisione |
|---|---|
| Il PDF ha un livello di testo o è una scansione? | D0 (serve OCR?) |
| Ci sono prezzi a scaglioni di quantità? | **D7** (serve la tabella `price_tier`?) |
| Si parla di IVA, e con quali aliquote? Netto o lordo? | **D6** |
| Ci sono immagini dei prodotti? | D8 |
| Quante colonne ha la tabella, e dove cadono? | conferma la scelta dei profili per fornitore |
| Quali forme di unità e confezione usa questo fornitore? | diventa il **test-set del parser** di Fase 2 |

Le regressioni che leggono questi file si eseguono esplicitamente con:

```bash
pnpm test:real-pdf
```

`pnpm test` resta eseguibile anche su CI e clone puliti: se `atteso.json` non
c'e', salta solo i casi riservati e continua a eseguire tutti i test portabili.

## Privacy

Questi file contengono i prezzi d'acquisto della gelateria: sono dati
commerciali riservati. La cartella è esclusa da git (`.gitignore`) e i PDF
non escono mai dal server. Le uniche righe che vengono inviate a un servizio
esterno sono quelle mandate all'LLM durante l'importazione, ed è una scelta
consapevole (vedi ANALISI §6).
