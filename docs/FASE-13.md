# FASE 13 — Avviso prezzo migliore

Data: 2026-08-09 · **in produzione**. Informare senza infastidire.

## Risultato

Aggiungendo un prodotto all'ordine, se un altro fornitore lo fa a meno
compare una striscia sotto la riga:

> Disponibile a **17,92 €** da **bazzelli**. Risparmieresti **4,94 €** a
> confezione.
> `Usa il più conveniente`  ·  1 × 1 pz · 22,86 € → 17,92 €  ·  *non avvisarmi più*

E in fondo al pannello: «Su 1 riga risparmieresti 4,94 € cambiando fornitore».

## Le soglie **sono** la funzionalità

Un avviso che compare sempre viene ignorato sempre, e a quel punto tanto vale
non averlo. Perché una differenza valga la pena di essere detta deve superare
**entrambe** le soglie — percentuale **e** euro.

Il trenta per cento su una bottiglia da mezzo euro è quindici centesimi. Con
una soglia sola, l'elenco si riempirebbe di quelle proprio quando servirebbe
leggerlo. È il motivo per cui `meritaAvviso` chiede `gte` su tutte e due.

Sotto soglia il confronto **si calcola comunque** e resta nel dato: non si
grida, ma la riga sa di non essere la più conveniente. Il risparmio
complessivo dell'ordine invece conta solo ciò che è oltre soglia e non messo a
tacere — sommare anche i centesimi darebbe un totale che nessuno andrà mai a
incassare.

## Il calcolo si fa adesso, non si legge dallo snapshot

La riga d'ordine porta già `best_alternative_snapshot`, fotografato quando la
riga è nata. Serve a giustificare l'ordine dopo, non a decidere ora: i prezzi
cambiano, e un avviso vecchio di un mese consiglierebbe un fornitore che nel
frattempo è diventato il più caro.

L'avviso si calcola quindi **a ogni lettura dell'ordine**, sulle offerte vive,
con la stessa regola di dominio del confronto fra fornitori.

## Il cambio fra confezioni diverse

È il punto in cui è facilissimo sbagliare le quantità. Quattro colli da 12 non
sono quattro colli da 24: **sono due**.

Il ricalcolo si fa, ma non in silenzio. Il conto si mostra **prima** di far
premere:

```
4 × 12 = 48 pz → 2 × 24 = 48 pz
spesa 42,00 € → 39,20 €
```

E quando non torna esatto lo si dichiara invece di arrotondare di nascosto —
tre colli da 12 fanno 36 pezzi, che con colli da 24 sarebbero una confezione e
mezza:

```
3 × 12 = 36 pz → 2 × 24 = 48 pz — non è la stessa quantità: 18 contro 24
```

Un cambio di quantità fatto in silenzio si scopre alla consegna.

La riga vecchia sparisce e ne nasce una nuova: è un altro articolo, di un
altro fornitore, con un altro codice e un altro prezzo. Modificare quella
esistente lascerebbe uno snapshot che non corrisponde più a niente.

## Non blocca, e si può zittire

L'avviso sta sotto la riga e non chiede niente. «Non avvisarmi più» lo mette a
tacere per quella riga, registrandolo in `override_reason`: il confronto resta
calcolato — non si perde, si smette solo di gridarlo — e la riga esce dal
conteggio del risparmio potenziale.

Un avviso che costringe a rispondere per andare avanti viene chiuso senza
leggerlo, e a quel punto non ha informato nessuno.

## API

| Metodo | Endpoint | Esito |
|---|---|---|
| `POST` | `/api/orders/current/lines/[id]/switch-supplier` | passa al fornitore indicato, ricalcolando le confezioni |
| `PATCH` | `/api/orders/current/lines/[id]` | `{ ignoraAvviso: true }` mette a tacere |

L'avviso viaggia dentro `GET /api/orders/current`: una richiesta sola, perché
la schermata ordine ne fa una a ogni tasto premuto e una chiamata per riga non
starebbe dietro.

## Verifica

Il dominio è puro e ha 15 test, fra cui **l'esempio della specifica per
nome**: 10,50 € contro 9,80 € → 0,70 € a confezione, 2,80 € su quattro. E il
caso 12/24, con e senza resto.

`scripts/collaudo-avviso.ts` prova i quattro criteri sui dati veri, su una
copia — 20 controlli:

| Criterio | Esito |
|---|---|
| l'esempio della specifica produce l'avviso corretto | ✅ nel test puro, e sui dati veri: 4,94 €/conf, 19,76 € su 4 |
| sotto soglia non compare alcun avviso | ✅ alzate le soglie, `meritaAvviso` diventa `false` e il totale va a zero |
| lo swap fra 12 e 24 mantiene i pezzi e lo dichiara | ✅ nel test puro (48 pz → 48 pz) e nel non-esatto |
| si può ignorare e ordinare dal più caro | ✅ la riga resta dov'era, il conteggio scende |

Poi nel browser, sull'app vera: aggiunto il fornitore più caro, l'avviso
compare con l'importo giusto, il pulsante, il conto delle confezioni e il
«non avvisarmi più».

## Cosa non c'è, e va detto

Il collaudo sui dati veri prova lo swap su offerte da **un pezzo per
confezione**: il catalogo della gelateria non ha ancora una coppia 12-contro-24
con entrambe le confezioni dichiarate. Il caso è coperto dal test puro, che è
il posto giusto — su dati veri non si può far succedere apposta il caso che
serve — ma va detto che sul catalogo di oggi non si è visto succedere.

## Passo successivo

**Fase 14 — riepilogo e conferma ordine.** L'ordine si congela: numero
progressivo, snapshot definitivi, `CONFIRMED`. È il passo che rende gli ordini
un documento invece di una bozza.
