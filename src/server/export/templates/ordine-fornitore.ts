import 'server-only';

import { euro, numero } from '@/features/products/format';
import { descriviCollo } from '@/features/products/packaging';
import { nomeFile } from '../nome-file';
import type { DatiDocumento, DocumentTemplate } from '../template';

/**
 * Il PDF che si manda al fornitore.
 *
 * È l'unica cosa di questa applicazione che esce dalla gelateria e finisce
 * sotto gli occhi di qualcun altro. Tre scelte contano più dell'aspetto:
 *
 *  1. **Il codice è il suo, non il nostro.** Il fornitore cerca a magazzino
 *     per il proprio codice articolo; il nostro id non lo sa nessuno e non
 *     serve a niente su carta. Dove il codice manca c'è la descrizione, e si
 *     vede che manca invece di stampare una casella vuota.
 *  2. **Si dice cosa arriva comprandone una.** Sotto la descrizione c'è
 *     «Collo da 12 · 70 cl l'uno» oppure «1 bottiglia · 70 cl»: le
 *     intestazioni restano «Q.tà» e «Prezzo cad.» perché valgono in
 *     entrambi i casi, mentre «Q.tà colli» stona su una bottiglia singola.
 *     Chi prepara il
 *     bancale conta casse, quindi la colonna principale sono le confezioni —
 *     ma il conteggio in pezzi c'è **sempre**, anche quando la confezione è
 *     da uno. Lasciandolo vuoto in quel caso resta un «2» solitario che si
 *     legge benissimo come due casse, e arrivano dodici volte troppe
 *     bottiglie: l'errore costa un rientro merce e una telefonata.
 *  3. **Il totale in fondo è il suo, e è imponibile.** I gruppi che arrivano
 *     qui sono già solo i suoi, e i totali descrivono i gruppi presenti: non
 *     c'è modo che in fondo compaia la cifra dell'ordine complessivo. L'IVA
 *     non si calcola e si scrive «+ IVA»: l'aliquota di ogni articolo quasi
 *     mai arriva dal listino, e sommarne una predefinita darebbe un totale
 *     dall'aria esatta che il fornitore poi smentisce in fattura.
 */

function scampa(testo: string): string {
  return testo
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataItaliana(data: Date | null): string {
  if (!data) return '—';
  return data.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

const STILE = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt; color: #171717; margin: 0; line-height: 1.45;
  }
  .testa { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  .chi { font-size: 13pt; font-weight: 800; margin: 0 0 2px; }
  .recapiti { font-size: 8.5pt; color: #525252; margin: 0; }
  .numero { text-align: right; }
  .numero h1 { font-size: 19pt; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
  .numero p { margin: 2px 0 0; font-size: 9pt; color: #525252; }
  .destinatario {
    margin-top: 18px; padding: 10px 12px; border: 1px solid #e5e5e5;
    border-radius: 6px; background: #fafafa;
  }
  .destinatario .etichetta {
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: #737373; margin: 0 0 3px;
  }
  .destinatario .nome { font-size: 12pt; font-weight: 800; margin: 0; }
  .blocchi { display: flex; gap: 12px; margin-top: 12px; }
  .blocco {
    flex: 1; border: 1px solid #e5e5e5; border-radius: 6px; padding: 9px 11px;
  }
  .blocco .etichetta {
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: #737373; margin: 0 0 3px;
  }
  .blocco p { margin: 0; font-size: 9pt; line-height: 1.4; }
  .blocco strong { font-weight: 700; }
  .condizioni {
    margin-top: 12px; border: 1px solid #e5e5e5; border-radius: 6px;
    padding: 9px 11px; font-size: 9pt; line-height: 1.5;
  }
  .condizioni dt {
    display: inline; font-size: 7.5pt; text-transform: uppercase;
    letter-spacing: 0.06em; color: #737373;
  }
  .condizioni dd { display: inline; margin: 0 14px 0 4px; }
  .accettazione {
    margin-top: 18px; border: 1px solid #171717; border-radius: 6px;
    padding: 10px 12px; font-size: 9pt; line-height: 1.5; page-break-inside: avoid;
  }
  .firma {
    margin-top: 26px; display: flex; justify-content: flex-end;
  }
  .firma span {
    border-top: 1px solid #737373; padding-top: 4px; width: 220px;
    text-align: center; font-size: 8pt; color: #737373;
  }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  thead { display: table-header-group; }
  th {
    text-align: left; font-size: 7.5pt; text-transform: uppercase;
    letter-spacing: 0.06em; color: #525252; border-bottom: 1.5px solid #171717;
    padding: 0 6px 5px; font-weight: 700;
  }
  td { padding: 6px; border-bottom: 1px solid #ededed; vertical-align: top; }
  tbody tr { page-break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .codice { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
  .descrizione { font-weight: 600; }
  .confezione { color: #737373; font-size: 8.5pt; }
  .nota-riga { color: #525252; font-size: 8.5pt; font-style: italic; }
  .quantita { font-weight: 800; white-space: nowrap; }
  .totali { margin-top: 14px; display: flex; justify-content: flex-end; page-break-inside: avoid; }
  .totali table { width: auto; min-width: 240px; margin: 0; }
  .totali td { border: 0; padding: 3px 0 3px 20px; }
  .totali .grande td {
    border-top: 1.5px solid #171717; padding-top: 7px; font-size: 13pt; font-weight: 800;
  }
  .nota {
    margin-top: 16px; padding: 9px 11px; border-left: 3px solid #a3a3a3;
    background: #fafafa; font-size: 9pt; page-break-inside: avoid;
  }
  .nota .etichetta {
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: #737373; margin: 0 0 2px;
  }
  .piede { margin-top: 22px; font-size: 8pt; color: #737373; }
`;

function html(dati: DatiDocumento): string {
  const g = dati.gruppi[0]!;
  const i = dati.intestazione;
  const t = dati.totali;

  const recapitiNostri = [i.indirizzo, i.partitaIva && `P.IVA ${i.partitaIva}`, i.telefono, i.email]
    .filter((x): x is string => Boolean(x))
    .map(scampa)
    .join(' · ');
  const recapitiSuoi = [
    g.indirizzo,
    g.partitaIva && `P.IVA ${g.partitaIva}`,
    g.telefono && `tel. ${g.telefono}`,
    g.email,
  ]
    .filter((x): x is string => Boolean(x))
    .map(scampa)
    .join(' · ');

  const righe = g.righe
    .map((r) => {
      const collo = descriviCollo(r);
      const pezzi = collo.pezzi * r.quantityPacks;
      return `<tr>
        <td class="codice">${r.supplierCode ? scampa(r.supplierCode) : '<span style="color:#a3a3a3;font-weight:400">—</span>'}</td>
        <td>
          <div class="descrizione">${scampa(r.name)}</div>
          <div class="confezione">${scampa(collo.titolo)}${collo.dettaglio ? ` · ${scampa(collo.dettaglio)}` : ''}</div>
          ${r.note ? `<div class="nota-riga">${scampa(r.note)}</div>` : ''}
        </td>
        <td class="num quantita">${numero(r.quantityPacks, 0)}</td>
        <td class="num confezione">${numero(pezzi, 0)} pz</td>
        <td class="num">${scampa(euro(r.priceNet))}</td>
        <td class="num" style="font-weight:700">${scampa(euro(r.lineTotalNet))}</td>
      </tr>`;
    })
    .join('\n');

  const titolo = `Ordine ${dati.ordine.code ?? ''} — ${g.supplierName}`;

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>${scampa(titolo)}</title><style>${STILE}</style></head>
<body>
  <div class="testa">
    <div>
      <p class="chi">${scampa(i.nome)}</p>
      ${recapitiNostri ? `<p class="recapiti">${recapitiNostri}</p>` : ''}
    </div>
    <div class="numero">
      <h1>Ordine di acquisto</h1>
      <p>n. <strong>${scampa(dati.ordine.code ?? 'in bozza')}</strong> del ${dataItaliana(dati.ordine.confermatoIl ?? dati.ordine.creatoIl)}</p>
    </div>
  </div>

  <div class="destinatario">
    <p class="etichetta">Spettabile</p>
    <p class="nome">${scampa(g.supplierName)}</p>
    ${recapitiSuoi ? `<p class="recapiti" style="margin-top:2px">${recapitiSuoi}</p>` : ''}
  </div>

  <div class="blocchi">
    <div class="blocco">
      <p class="etichetta">Consegnare presso</p>
      <p><strong>${scampa(i.nome)}</strong></p>
      ${i.consegnaPresso ? `<p>${scampa(i.consegnaPresso)}</p>` : ''}
      ${
        i.consegnaEntro
          ? `<p style="margin-top:4px">Consegna richiesta entro il <strong>${dataItaliana(i.consegnaEntro)}</strong></p>`
          : ''
      }
    </div>
    <div class="blocco">
      <p class="etichetta">Ordine</p>
      <p>Numero <strong>${scampa(dati.ordine.code ?? 'in bozza')}</strong></p>
      <p>Data ${dataItaliana(dati.ordine.confermatoIl ?? dati.ordine.creatoIl)}</p>
      ${i.telefono ? `<p style="margin-top:4px">Per informazioni: ${scampa(i.telefono)}</p>` : ''}
    </div>
  </div>

  ${
    i.condizioniPagamento || i.bancaAppoggio
      ? `<dl class="condizioni">
      ${i.condizioniPagamento ? `<dt>Pagamento</dt><dd>${scampa(i.condizioniPagamento)}</dd>` : ''}
      ${i.bancaAppoggio ? `<dt>Banca d'appoggio</dt><dd>${scampa(i.bancaAppoggio)}</dd>` : ''}
    </dl>`
      : ''
  }

  <table>
    <thead>
      <tr>
        <th style="width:12%">Cod. art.</th>
        <th>Descrizione</th>
        <th class="num" style="width:8%">Q.tà</th>
        <th class="num" style="width:10%">Pezzi tot.</th>
        <th class="num" style="width:14%">Prezzo cad.</th>
        <th class="num" style="width:14%">Totale</th>
      </tr>
    </thead>
    <tbody>
${righe}
    </tbody>
  </table>

  <div class="totali">
    <table>
      <tr>
        <td style="color:#525252">${t.righe} ${t.righe === 1 ? 'articolo' : 'articoli'} · ${t.confezioni} ${t.confezioni === 1 ? 'confezione' : 'confezioni'}</td>
        <td></td>
      </tr>
      <tr class="grande">
        <td>Totale imponibile</td>
        <td class="num">${scampa(euro(t.netto))}</td>
      </tr>
    </table>
  </div>

  ${
    dati.ordine.note
      ? `<div class="nota"><p class="etichetta">Nota</p>${scampa(dati.ordine.note)}</div>`
      : ''
  }

  <p class="piede">
    Tutti gli importi sono <strong>IVA esclusa</strong>: l'imposta la applica il fornitore in fattura.
    I prezzi sono quelli concordati a listino.
    Per qualsiasi difformità fare riferimento al numero d’ordine ${scampa(dati.ordine.code ?? '')}.
  </p>
</body></html>`;
}

export const ordineFornitorePdf: DocumentTemplate = {
  key: 'ordine-fornitore-pdf',
  label: 'Ordine per il fornitore (PDF)',
  format: 'PDF',
  ambito: 'per-fornitore',
  predefinito: true,
  nomeFile: (dati) =>
    nomeFile({
      data: dati.ordine.confermatoIl ?? dati.ordine.creatoIl,
      codice: dati.ordine.code,
      qualifica: dati.gruppi[0]?.supplierName ?? 'fornitore',
      estensione: 'pdf',
    }),
  build: (dati, contesto) => contesto.stampaPdf(html(dati)),
};
