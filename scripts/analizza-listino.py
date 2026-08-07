#!/usr/bin/env python3
"""
Triage dei listini PDF — strumento di Fase 0.

Non estrae prodotti: risponde alle domande che decidono lo schema del database
e la fattibilità dell'estrattore, prima che venga scritta una riga di codice
applicativo.

Per ogni PDF risponde a:
  · il PDF ha un livello di testo, o è una scansione? (→ serve OCR?)
  · quante righe sembrano righe di prodotto, e quante hanno un prezzo?
  · quante colonne ha la tabella, e dove cadono?
  · ci sono PREZZI A SCAGLIONI? (decisione D7: cambia lo schema)
  · si parla di IVA, e con quali aliquote? (decisione D6)
  · ci sono sconti in riga?
  · ci sono immagini? (decisione D8)
  · quali forme di unità di misura e confezione usa questo fornitore?
    (→ diventa il test-set del parser di Fase 2)

Uso:
    python3 scripts/analizza-listino.py tests/fixtures/listini
    python3 scripts/analizza-listino.py un-listino.pdf
    python3 scripts/analizza-listino.py <cartella> --report tests/fixtures/REPORT.md

Nessuna dipendenza esterna oltre a poppler-utils (pdfinfo/pdftotext/pdfimages),
già presente sul server.
"""

from __future__ import annotations

import argparse
import collections
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------
# Espressioni regolari del dominio.
#
# Sono volutamente permissive: qui serve *contare segnali*, non estrarre dati.
# Il parser vero (Fase 2) sarà molto più severo.
# --------------------------------------------------------------------------

# Prezzo in formato italiano: 1.234,56 / 12,50 / 9.90 — con o senza simbolo.
RE_PREZZO = re.compile(r"(?<![\d,.])\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}(?![\d])")

# Codice articolo a inizio riga: alfanumerico, 3-18 caratteri, con almeno una
# cifra — altrimenti si contano anche le intestazioni di sezione ("SEMILAVORATI").
RE_CODICE = re.compile(r"^\s*(?=[A-Z0-9._/\-]*\d)([A-Z0-9][A-Z0-9._/\-]{2,17})(?=\s{2,}|\s[A-Za-z])")

# Coordinate delle parole in `pdftotext -bbox-layout`.
RE_WORD_BOX = re.compile(r'<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)"')

# Quantità + unità di misura attaccate o separate: "33cl", "cl.33", "5 kg", "gr.500"
RE_UNITA = re.compile(
    r"\b(?:(\d+(?:[.,]\d+)?)\s*(mg|gr?|grammi|hg|kg|ml|cl|dl|lt|l|litri|pz|pezzi|pcs|pz\.|un|nr|n°)"
    r"|(mg|gr?|grammi|hg|kg|ml|cl|dl|lt|l|litri|pz|pezzi|pcs|un|nr|n°)\.?\s*(\d+(?:[.,]\d+)?))\b",
    re.IGNORECASE,
)

# Moltiplicatore di confezione: "12x33cl", "4 x 2,5kg", "x 6"
RE_MOLTIPLICATORE = re.compile(r"\b(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE)

# Parole che indicano una confezione.
RE_CONFEZIONE = re.compile(
    r"\b(conf\.?|confezione|cf\.?|cart\.?|cartone|ct\.?|box|scatola|scat\.?|sacco|sacchetto|"
    r"secchiello|secchio|busta|bustina|blister|vaschetta|barattolo|bottiglia|bt\.?|lattina|"
    r"astuccio|espositore|collo|pallet|cassa|da\s+\d+)\b",
    re.IGNORECASE,
)

RE_IVA = re.compile(r"\b(i\.?v\.?a\.?)\b", re.IGNORECASE)
RE_ALIQUOTA = re.compile(r"\b(4|5|10|22)\s*%")
RE_SCONTO = re.compile(r"\b(sconto|sconti|sc\.|scontato|omaggio|promo|promozione)\b", re.IGNORECASE)
RE_A_RICHIESTA = re.compile(r"\b(a\s+richiesta|su\s+richiesta|n\.?d\.?|n/d|quotazione)\b", re.IGNORECASE)
RE_NETTO_LORDO = re.compile(r"\b(netto|netti|lordo|lordi|imponibile|iva\s+esclusa|iva\s+inclusa|\+\s*iva)\b", re.IGNORECASE)

# Unità normalizzate, per il vocabolario aggregato.
UNITA_NOTE = {
    "mg": "massa", "g": "massa", "gr": "massa", "grammi": "massa", "hg": "massa", "kg": "massa",
    "ml": "volume", "cl": "volume", "dl": "volume", "l": "volume", "lt": "volume", "litri": "volume",
    "pz": "conteggio", "pezzi": "conteggio", "pcs": "conteggio", "un": "conteggio",
    "nr": "conteggio", "n°": "conteggio",
}


@dataclass
class Esito:
    """Il risultato del triage di un singolo PDF."""

    percorso: Path
    pagine: int = 0
    dimensione_kb: int = 0
    produttore: str = ""
    cifrato: bool = False

    caratteri_totali: int = 0
    caratteri_per_pagina: list[int] = field(default_factory=list)
    pagine_vuote: list[int] = field(default_factory=list)

    righe_totali: int = 0
    righe_con_prezzo: int = 0
    righe_con_codice: int = 0
    righe_con_unita: int = 0
    righe_multi_prezzo: int = 0          # sospetto scaglioni o prezzo doppio
    righe_a_richiesta: int = 0

    colonne_stimate: int = 0
    colonne_sinistra: list[int] = field(default_factory=list)   # testo allineato a sinistra
    colonne_destra: list[int] = field(default_factory=list)     # numeri allineati a destra
    metodo_colonne: str = ""

    menziona_iva: int = 0
    aliquote: collections.Counter = field(default_factory=collections.Counter)
    menziona_sconto: int = 0
    menziona_netto_lordo: collections.Counter = field(default_factory=collections.Counter)

    immagini: int = 0

    vocabolario_unita: collections.Counter = field(default_factory=collections.Counter)
    vocabolario_confezione: collections.Counter = field(default_factory=collections.Counter)
    esempi_formato: list[str] = field(default_factory=list)
    campione_righe: list[str] = field(default_factory=list)

    errore: str = ""

    # -- giudizi sintetici -------------------------------------------------

    @property
    def verdetto_testo(self) -> str:
        if self.errore:
            return "ERRORE"
        if self.pagine == 0:
            return "ERRORE"
        media = self.caratteri_totali / max(self.pagine, 1)
        if media < 100:
            return "SCANSIONATO"        # nessun livello di testo: servirebbe OCR
        if self.pagine_vuote:
            return "MISTO"              # alcune pagine sono immagini
        if media < 400:
            return "POVERO"             # testo presente ma scarno: da guardare a mano
        return "USABILE"

    @property
    def densita_prodotti(self) -> float:
        """Quota di righe che sembrano righe di listino."""
        if not self.righe_totali:
            return 0.0
        return self.righe_con_prezzo / self.righe_totali

    @property
    def sospetto_scaglioni(self) -> bool:
        """≥15% di righe con più prezzi = probabile listino a scaglioni."""
        if not self.righe_con_prezzo:
            return False
        return self.righe_multi_prezzo / self.righe_con_prezzo > 0.15


# --------------------------------------------------------------------------
# Estrazione
# --------------------------------------------------------------------------


def _esegui(cmd: list[str]) -> str:
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=120)
        return out.stdout.decode("utf-8", errors="replace")
    except (subprocess.SubprocessError, OSError) as exc:  # pragma: no cover
        raise RuntimeError(f"{cmd[0]} fallito: {exc}") from exc


def leggi_metadati(esito: Esito) -> None:
    testo = _esegui(["pdfinfo", str(esito.percorso)])
    for riga in testo.splitlines():
        if ":" not in riga:
            continue
        chiave, valore = riga.split(":", 1)
        chiave, valore = chiave.strip().lower(), valore.strip()
        if chiave == "pages":
            esito.pagine = int(valore) if valore.isdigit() else 0
        elif chiave == "producer":
            esito.produttore = valore
        elif chiave == "encrypted":
            esito.cifrato = not valore.lower().startswith("no")
    esito.dimensione_kb = esito.percorso.stat().st_size // 1024


def conta_immagini(esito: Esito) -> None:
    testo = _esegui(["pdfimages", "-list", str(esito.percorso)])
    # La prima riga è l'intestazione, la seconda un separatore.
    righe = [r for r in testo.splitlines() if r.strip()]
    esito.immagini = max(0, len(righe) - 2)


def estrai_testo(esito: Esito) -> str:
    """`-layout` conserva l'allineamento delle colonne: metà del lavoro."""
    return _esegui(["pdftotext", "-layout", "-enc", "UTF-8", str(esito.percorso), "-"])


def misura_pagine(esito: Esito, testo: str) -> None:
    pagine = testo.split("\f")
    if pagine and not pagine[-1].strip():
        pagine.pop()
    for numero, pagina in enumerate(pagine, start=1):
        n = len(pagina.strip())
        esito.caratteri_per_pagina.append(n)
        if n < 100:
            esito.pagine_vuote.append(numero)
    esito.caratteri_totali = sum(esito.caratteri_per_pagina)


def _picchi(valori: collections.Counter, soglia: int, tolleranza: float) -> list[int]:
    """Raggruppa coordinate vicine: posizioni entro `tolleranza` sono una colonna."""
    candidate = sorted(v for v, n in valori.items() if n >= soglia)
    colonne: list[int] = []
    for v in candidate:
        if not colonne or v - colonne[-1] > tolleranza:
            colonne.append(int(v))
    return colonne


def stima_colonne_bbox(esito: Esito) -> bool:
    """
    Colonne dalle coordinate reali delle parole (`pdftotext -bbox-layout`).

    È il metodo che userà l'estrattore vero (Fase 7), e sui listini stretti è
    l'unico che funziona: quando le colonne numeriche sono separate da un solo
    spazio, l'euristica sugli spazi le fonde in una sola.

    Si guardano due allineamenti, perché in un listino convivono entrambi:
      · xMin ricorrenti  → colonne di testo allineate a sinistra (codice, descrizione)
      · xMax ricorrenti  → colonne di numeri allineate a destra (prezzi, quantità)
    """
    try:
        xml = _esegui(["pdftotext", "-bbox-layout", "-enc", "UTF-8", str(esito.percorso), "-"])
    except RuntimeError:
        return False

    inizi: collections.Counter = collections.Counter()
    fini: collections.Counter = collections.Counter()
    for match in RE_WORD_BOX.finditer(xml):
        inizi[round(float(match.group(1)))] += 1
        fini[round(float(match.group(2)))] += 1

    if not inizi:
        return False

    # Una colonna vera ricorre su almeno metà delle righe di prodotto. Il
    # riferimento sono le righe con prezzo, non tutte le righe: intestazioni e
    # note non seguono la griglia della tabella.
    base = esito.righe_con_prezzo or esito.righe_totali
    soglia = max(4, int(base * 0.5))
    esito.colonne_sinistra = _picchi(inizi, soglia, tolleranza=6)
    esito.colonne_destra = _picchi(fini, soglia, tolleranza=6)

    # Ogni colonna genera un bordo sinistro *e* uno destro, quindi sommare i due
    # allineamenti raddoppierebbe il conto. Ogni colonna è però allineata in un
    # modo solo — testo a sinistra, numeri a destra — e l'allineamento
    # dominante restituisce il numero giusto di colonne.
    esito.colonne_stimate = max(len(esito.colonne_sinistra), len(esito.colonne_destra))
    esito.metodo_colonne = "coordinate (bbox)"
    return esito.colonne_stimate > 0


def stima_colonne_spazi(righe: list[str]) -> tuple[int, list[int]]:
    """Ripiego: le colonne dove molte righe iniziano un blocco dopo ≥2 spazi."""
    posizioni: collections.Counter = collections.Counter()
    for riga in righe:
        for match in re.finditer(r"(?:^|\s{2,})(\S)", riga):
            posizioni[match.start(1)] += 1
    if not posizioni:
        return 0, []
    colonne = _picchi(posizioni, max(3, len(righe) // 10), tolleranza=3)
    return len(colonne), colonne


def analizza_righe(esito: Esito, testo: str) -> None:
    righe = [r.rstrip() for r in testo.replace("\f", "\n").splitlines()]
    righe_utili = [r for r in righe if r.strip()]
    esito.righe_totali = len(righe_utili)

    for riga in righe_utili:
        prezzi = RE_PREZZO.findall(riga)
        if prezzi:
            esito.righe_con_prezzo += 1
            if len(prezzi) >= 2:
                esito.righe_multi_prezzo += 1
            if len(esito.campione_righe) < 20 and len(riga.strip()) > 25:
                esito.campione_righe.append(riga.strip())

        if RE_CODICE.match(riga):
            esito.righe_con_codice += 1
        if RE_A_RICHIESTA.search(riga):
            esito.righe_a_richiesta += 1
        if RE_IVA.search(riga):
            esito.menziona_iva += 1
        riga_di_sconto = bool(RE_SCONTO.search(riga))
        if riga_di_sconto:
            esito.menziona_sconto += 1
        else:
            # "Sconto 5%" non è un'aliquota IVA: si contano le percentuali solo
            # dove non si sta parlando di sconti.
            for aliquota in RE_ALIQUOTA.findall(riga):
                esito.aliquote[aliquota + "%"] += 1
        for parola in RE_NETTO_LORDO.findall(riga):
            esito.menziona_netto_lordo[parola.lower()] += 1

        trovata_unita = False
        for match in RE_UNITA.finditer(riga):
            unita = (match.group(2) or match.group(3) or "").lower()
            if unita:
                esito.vocabolario_unita[unita] += 1
                trovata_unita = True
                if len(esito.esempi_formato) < 40:
                    esito.esempi_formato.append(match.group(0).strip())
        for match in RE_MOLTIPLICATORE.finditer(riga):
            esito.vocabolario_confezione[f"{match.group(0).strip()} (moltiplicatore)"] += 1
            trovata_unita = True
        for match in RE_CONFEZIONE.finditer(riga):
            esito.vocabolario_confezione[match.group(0).strip().lower()] += 1

        if trovata_unita:
            esito.righe_con_unita += 1

    # Le colonne si stimano dopo, perché la soglia dipende da quante righe di
    # prodotto ha davvero questo listino.
    if not stima_colonne_bbox(esito):
        esito.colonne_stimate, esito.colonne_sinistra = stima_colonne_spazi(righe_utili)
        esito.metodo_colonne = "spazi (ripiego)"


def analizza(percorso: Path) -> Esito:
    esito = Esito(percorso=percorso)
    try:
        leggi_metadati(esito)
        if esito.cifrato:
            esito.errore = "PDF cifrato: impossibile estrarre il testo"
            return esito
        conta_immagini(esito)
        testo = estrai_testo(esito)
        misura_pagine(esito, testo)
        if esito.verdetto_testo != "SCANSIONATO":
            analizza_righe(esito, testo)
    except Exception as exc:  # noqa: BLE001 — qui vogliamo davvero non fermarci
        esito.errore = str(exc)
    return esito


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------


def scheda(esito: Esito) -> str:
    r: list[str] = []
    r.append(f"## {esito.percorso.name}\n")

    if esito.errore:
        r.append(f"**ERRORE:** {esito.errore}\n")
        return "\n".join(r)

    verdetto = esito.verdetto_testo
    simbolo = {"USABILE": "✅", "MISTO": "⚠️", "POVERO": "⚠️", "SCANSIONATO": "❌", "ERRORE": "❌"}[verdetto]

    r.append(f"**Livello di testo: {simbolo} {verdetto}** · "
             f"{esito.pagine} pagine · {esito.dimensione_kb} KB · "
             f"{esito.caratteri_totali:,} caratteri estratti "
             f"({esito.caratteri_totali // max(esito.pagine, 1):,}/pagina)".replace(",", "."))
    if esito.produttore:
        r.append(f"· generato da `{esito.produttore}`")
    r.append("")

    if verdetto == "SCANSIONATO":
        r.append("> Nessun livello di testo: questo listino richiederebbe OCR "
                 "(`tesseract` **non è installato** sul server). Vedi decisione D0.\n")
        return "\n".join(r)

    if esito.pagine_vuote:
        r.append(f"> ⚠️ Pagine senza testo (probabilmente immagini): "
                 f"{', '.join(str(p) for p in esito.pagine_vuote[:12])}"
                 f"{' …' if len(esito.pagine_vuote) > 12 else ''}\n")

    r.append("### Struttura\n")
    r.append("| Metrica | Valore |")
    r.append("|---|---|")
    r.append(f"| Righe di testo | {esito.righe_totali} |")
    r.append(f"| Righe con un prezzo | {esito.righe_con_prezzo} "
             f"({esito.densita_prodotti:.0%} del totale) |")
    r.append(f"| Righe con codice articolo a inizio riga | {esito.righe_con_codice} |")
    r.append(f"| Righe con unità/confezione riconoscibile | {esito.righe_con_unita} |")
    r.append(f"| Colonne stimate | **{esito.colonne_stimate}** "
             f"— metodo: {esito.metodo_colonne} |")
    if esito.colonne_sinistra:
        r.append(f"| ↳ allineate a sinistra (testo) | {len(esito.colonne_sinistra)} "
                 f"a x = {', '.join(str(p) for p in esito.colonne_sinistra[:14])} |")
    if esito.colonne_destra:
        r.append(f"| ↳ allineate a destra (numeri) | {len(esito.colonne_destra)} "
                 f"a x = {', '.join(str(p) for p in esito.colonne_destra[:14])} |")
    r.append(f"| Immagini incorporate | {esito.immagini} |")
    r.append("")

    r.append("### Segnali che decidono lo schema\n")

    if esito.sospetto_scaglioni:
        r.append(f"- 🔴 **Possibili prezzi a scaglioni (D7)**: {esito.righe_multi_prezzo} righe "
                 f"su {esito.righe_con_prezzo} hanno 2+ prezzi "
                 f"({esito.righe_multi_prezzo / max(esito.righe_con_prezzo, 1):.0%}). "
                 f"**Da guardare a mano**: potrebbero anche essere due colonne prezzo "
                 f"(es. netto e lordo) invece che scaglioni.")
    elif esito.righe_multi_prezzo:
        r.append(f"- 🟡 {esito.righe_multi_prezzo} righe con 2+ prezzi "
                 f"({esito.righe_multi_prezzo / max(esito.righe_con_prezzo, 1):.0%}): "
                 f"sotto la soglia di sospetto, ma vale un'occhiata.")
    else:
        r.append("- ✅ Un prezzo per riga: nessun segnale di scaglioni.")

    if esito.menziona_iva or esito.aliquote:
        aliquote = ", ".join(f"{a} ({n}×)" for a, n in esito.aliquote.most_common())
        r.append(f"- **IVA (D6)**: {esito.menziona_iva} menzioni. "
                 f"Aliquote trovate: {aliquote or 'nessuna esplicita'}.")
    else:
        r.append("- **IVA (D6)**: mai menzionata → probabilmente listino al netto, **da confermare**.")

    if esito.menziona_netto_lordo:
        parole = ", ".join(f"«{p}» ({n}×)" for p, n in esito.menziona_netto_lordo.most_common(6))
        r.append(f"- **Netto/lordo (D6)**: {parole}")

    if esito.menziona_sconto:
        r.append(f"- 🟡 **Sconti in riga**: {esito.menziona_sconto} menzioni "
                 f"→ verificare se il prezzo di listino è già scontato.")

    if esito.righe_a_richiesta:
        r.append(f"- 🟡 **Prodotti senza prezzo** («a richiesta», «n.d.»): "
                 f"{esito.righe_a_richiesta} righe → vanno importati senza prezzo, non scartati.")

    if esito.immagini > 5:
        r.append(f"- **Immagini (D8)**: {esito.immagini} immagini incorporate "
                 f"→ potenzialmente estraibili con `pdfimages`, ma associarle alla riga "
                 f"giusta è un problema a sé.")
    r.append("")

    if esito.vocabolario_unita:
        r.append("### Unità di misura usate da questo fornitore\n")
        for unita, n in esito.vocabolario_unita.most_common():
            dimensione = UNITA_NOTE.get(unita, "?")
            r.append(f"- `{unita}` × {n} ({dimensione})")
        r.append("")

    if esito.vocabolario_confezione:
        r.append("### Forme di confezione\n")
        for forma, n in esito.vocabolario_confezione.most_common(25):
            r.append(f"- `{forma}` × {n}")
        r.append("")

    if esito.esempi_formato:
        unici = list(dict.fromkeys(esito.esempi_formato))[:25]
        r.append("### Esempi di formato (per il test-set del parser, Fase 2)\n")
        r.append("```")
        r.extend(unici)
        r.append("```\n")

    if esito.campione_righe:
        r.append("### Campione di righe con prezzo\n")
        r.append("```")
        r.extend(esito.campione_righe[:20])
        r.append("```\n")

    return "\n".join(r)


def riepilogo(esiti: list[Esito]) -> str:
    r: list[str] = []
    r.append("# Triage dei listini PDF — Fase 0\n")
    r.append("Generato da `scripts/analizza-listino.py`. "
             "Serve a rispondere alle decisioni D0, D6, D7, D8 di "
             "[DECISIONI.md](../../docs/DECISIONI.md) **prima** di scrivere codice.\n")

    r.append("## Quadro d'insieme\n")
    r.append("| File | Testo | Pagine | Righe con prezzo | Colonne | Scaglioni? | IVA | Immagini |")
    r.append("|---|---|---|---|---|---|---|---|")
    for e in esiti:
        if e.errore:
            r.append(f"| `{e.percorso.name}` | ❌ ERRORE | — | — | — | — | — | — |")
            continue
        scaglioni = "🔴 sospetti" if e.sospetto_scaglioni else "✅ no"
        iva = "sì" if (e.menziona_iva or e.aliquote) else "no"
        r.append(f"| `{e.percorso.name}` | {e.verdetto_testo} | {e.pagine} | "
                 f"{e.righe_con_prezzo} | {e.colonne_stimate} | {scaglioni} | {iva} | {e.immagini} |")
    r.append("")

    validi = [e for e in esiti if not e.errore and e.verdetto_testo != "SCANSIONATO"]
    scansionati = [e for e in esiti if e.verdetto_testo == "SCANSIONATO"]

    r.append("## Conclusioni automatiche\n")

    if scansionati:
        r.append(f"- ❌ **{len(scansionati)} listino/i senza livello di testo** "
                 f"({', '.join(e.percorso.name for e in scansionati)}). "
                 f"`tesseract` non è installato: o si aggiunge una fase OCR, o questi "
                 f"fornitori restano a inserimento manuale.")
    else:
        r.append("- ✅ Tutti i listini hanno un livello di testo estraibile: **niente OCR necessario**.")

    con_scaglioni = [e for e in validi if e.sospetto_scaglioni]
    if con_scaglioni:
        r.append(f"- 🔴 **D7 — possibili prezzi a scaglioni** in "
                 f"{', '.join(e.percorso.name for e in con_scaglioni)}. "
                 f"Da verificare a mano sul PDF: se confermato, lo schema di Fase 2 "
                 f"deve prevedere una tabella `price_tier`.")
    elif validi:
        r.append("- ✅ **D7** — nessun segnale di prezzi a scaglioni: un prezzo per prodotto basta.")

    con_iva = [e for e in validi if e.menziona_iva or e.aliquote]
    if con_iva:
        aliquote = collections.Counter()
        for e in con_iva:
            aliquote.update(e.aliquote)
        r.append(f"- **D6 — IVA** menzionata in {len(con_iva)}/{len(validi)} listini. "
                 f"Aliquote osservate: {', '.join(a for a, _ in aliquote.most_common()) or 'nessuna esplicita'}. "
                 f"Resta da confermare **per fornitore** se i prezzi sono al netto o al lordo.")
    elif validi:
        r.append("- **D6 — IVA** mai menzionata: probabilmente tutti al netto, **da confermare a voce**.")

    con_immagini = [e for e in validi if e.immagini > 5]
    if con_immagini:
        r.append(f"- **D8 — immagini** presenti in "
                 f"{', '.join(f'{e.percorso.name} ({e.immagini})' for e in con_immagini)}.")
    elif validi:
        r.append("- ✅ **D8** — nessun listino con immagini rilevanti: si conferma «v1 senza foto».")

    if validi:
        media_colonne = sum(e.colonne_stimate for e in validi) / len(validi)
        r.append(f"- Struttura tabellare: da {min(e.colonne_stimate for e in validi)} a "
                 f"{max(e.colonne_stimate for e in validi)} colonne "
                 f"(media {media_colonne:.1f}) → conferma che serve un "
                 f"**profilo di mappatura per fornitore** e non un parser unico.")
    r.append("")

    if validi:
        unita = collections.Counter()
        confezioni = collections.Counter()
        for e in validi:
            unita.update(e.vocabolario_unita)
            confezioni.update(e.vocabolario_confezione)

        r.append("## Vocabolario complessivo → test-set del parser (Fase 2)\n")
        r.append("### Unità di misura\n")
        for u, n in unita.most_common():
            r.append(f"- `{u}` × {n} ({UNITA_NOTE.get(u, '?')})")
        r.append("")
        r.append("### Confezioni\n")
        for c, n in confezioni.most_common(40):
            r.append(f"- `{c}` × {n}")
        r.append("")

    r.append("---\n")
    for e in esiti:
        r.append(scheda(e))
        r.append("---\n")

    return "\n".join(r)


# --------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="Triage dei listini PDF (Fase 0)")
    parser.add_argument("percorso", help="file PDF o cartella che li contiene")
    parser.add_argument("--report", help="file markdown da scrivere",
                        default="tests/fixtures/REPORT.md")
    args = parser.parse_args()

    origine = Path(args.percorso)
    if origine.is_dir():
        pdf = sorted(p for p in origine.rglob("*.pdf"))
    elif origine.is_file():
        pdf = [origine]
    else:
        print(f"Percorso inesistente: {origine}", file=sys.stderr)
        return 1

    if not pdf:
        print(f"Nessun PDF trovato in {origine}.\n"
              f"Metti i listini dei fornitori in {origine}/ e rilancia.", file=sys.stderr)
        return 1

    print(f"Analizzo {len(pdf)} listino/i…\n")
    esiti = []
    for p in pdf:
        print(f"  · {p.name}", end="", flush=True)
        e = analizza(p)
        esiti.append(e)
        print(f"  → {e.verdetto_testo}"
              f"{'  ⚠ scaglioni?' if e.sospetto_scaglioni else ''}"
              f"{'  ⚠ ' + e.errore if e.errore else ''}")

    testo = riepilogo(esiti)
    destinazione = Path(args.report)
    destinazione.parent.mkdir(parents=True, exist_ok=True)
    destinazione.write_text(testo, encoding="utf-8")

    print(f"\nReport scritto in {destinazione}")
    scansionati = sum(1 for e in esiti if e.verdetto_testo == "SCANSIONATO")
    scaglioni = sum(1 for e in esiti if e.sospetto_scaglioni)
    if scansionati:
        print(f"⚠  {scansionati} listino/i richiederebbero OCR (tesseract non installato)")
    if scaglioni:
        print(f"⚠  {scaglioni} listino/i con sospetti prezzi a scaglioni → verificare a mano (D7)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
