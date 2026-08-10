import 'server-only';

import ExcelJS from 'exceljs';
import { formatoConfezione } from '@/features/products/format';
import { nomeFile } from '../nome-file';
import type { DatiDocumento, DocumentTemplate } from '../template';

/**
 * Il riepilogo dell'ordine intero, in Excel.
 *
 * Non è il documento che si manda: è quello che si tiene. Serve a controllare
 * la fattura quando arriva, a rifare i conti, a incollare due colonne in un
 * altro foglio. Per questo tre scelte:
 *
 *  - **i numeri sono numeri**, non testo formattato. Un «17,20 €» scritto
 *    come stringa non si somma, e un riepilogo su cui non si può fare una
 *    somma non serve a niente;
 *  - **una riga per articolo**, raggruppata per fornitore, coi subtotali —
 *    la stessa struttura del riepilogo a schermo, così i due si confrontano
 *    senza doverli interpretare;
 *  - **niente celle unite**: si uniscono bene da guardare e malissimo da
 *    ordinare, filtrare o copiare, che è tutto quello per cui questo file
 *    esiste.
 */

const EURO = '#,##0.00\\ "€"';

function intestazioneFoglio(foglio: ExcelJS.Worksheet, dati: DatiDocumento) {
  const i = dati.intestazione;
  const data = dati.ordine.confermatoIl ?? dati.ordine.creatoIl;

  foglio.addRow([`Ordine ${dati.ordine.code ?? 'in bozza'}`]).font = { bold: true, size: 15 };
  foglio.addRow([i.nome]).font = { bold: true };
  const recapiti = [i.indirizzo, i.partitaIva && `P.IVA ${i.partitaIva}`, i.telefono, i.email]
    .filter(Boolean)
    .join(' · ');
  if (recapiti) foglio.addRow([recapiti]).font = { color: { argb: 'FF737373' } };
  foglio.addRow([`Del ${data.toLocaleDateString('it-IT')}`]).font = {
    color: { argb: 'FF737373' },
  };
  if (dati.ordine.note) foglio.addRow([`Nota: ${dati.ordine.note}`]);
  foglio.addRow([]);
}

const COLONNE = [
  { header: 'Fornitore', key: 'fornitore', width: 22 },
  { header: 'Cod. articolo', key: 'codice', width: 14 },
  { header: 'Descrizione', key: 'nome', width: 46 },
  { header: 'Confezione', key: 'confezione', width: 18 },
  { header: 'Conf. ordinate', key: 'confezioni', width: 14 },
  { header: 'Pezzi totali', key: 'pezzi', width: 12 },
  { header: 'Prezzo conf.', key: 'prezzo', width: 14 },
  { header: 'Totale riga', key: 'totale', width: 14 },
] as const;

async function costruisci(dati: DatiDocumento): Promise<Uint8Array> {
  const cartella = new ExcelJS.Workbook();
  cartella.creator = dati.intestazione.nome;
  cartella.created = dati.ordine.confermatoIl ?? dati.ordine.creatoIl;

  const foglio = cartella.addWorksheet('Ordine', {
    views: [{ state: 'frozen', ySplit: 0 }],
  });
  intestazioneFoglio(foglio, dati);

  const rigaTestata = foglio.addRow(COLONNE.map((c) => c.header));
  rigaTestata.font = { bold: true };
  rigaTestata.eachCell((cella) => {
    cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    cella.border = { bottom: { style: 'thin', color: { argb: 'FF171717' } } };
  });
  COLONNE.forEach((c, indice) => {
    foglio.getColumn(indice + 1).width = c.width;
  });
  // Il filtro automatico sulla sola testata: è il gesto per cui si apre un
  // riepilogo in Excel — isolare un fornitore, o cercare un articolo.
  foglio.autoFilter = {
    from: { row: rigaTestata.number, column: 1 },
    to: { row: rigaTestata.number, column: COLONNE.length },
  };

  for (const gruppo of dati.gruppi) {
    for (const r of gruppo.righe) {
      const riga = foglio.addRow([
        gruppo.supplierName,
        r.supplierCode ?? '',
        r.name,
        formatoConfezione(r.unitSize, r.unitOfMeasure, r.packQuantity),
        r.quantityPacks,
        r.packQuantity * r.quantityPacks,
        Number(r.priceNet),
        Number(r.lineTotalNet),
      ]);
      riga.getCell(7).numFmt = EURO;
      riga.getCell(8).numFmt = EURO;
    }
    const subtotale = foglio.addRow([
      `Totale ${gruppo.supplierName}`,
      '',
      '',
      '',
      gruppo.confezioni,
      '',
      '',
      Number(gruppo.netto),
    ]);
    subtotale.font = { bold: true };
    subtotale.getCell(8).numFmt = EURO;
    subtotale.eachCell((cella) => {
      cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
    });
    foglio.addRow([]);
  }

  const t = dati.totali;
  const totale = foglio.addRow([
    'TOTALE ORDINE',
    '',
    '',
    '',
    t.confezioni,
    '',
    '',
    Number(t.netto),
  ]);
  totale.font = { bold: true, size: 12 };
  totale.getCell(8).numFmt = EURO;
  totale.eachCell((cella) => {
    cella.border = { top: { style: 'double', color: { argb: 'FF171717' } } };
  });
  if (Number(t.iva) > 0) {
    const iva = foglio.addRow(['IVA', '', '', '', '', '', '', Number(t.iva)]);
    iva.getCell(8).numFmt = EURO;
    const lordo = foglio.addRow(['TOTALE CON IVA', '', '', '', '', '', '', Number(t.lordo)]);
    lordo.font = { bold: true, size: 12 };
    lordo.getCell(8).numFmt = EURO;
  }

  const buffer = await cartella.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export const riepilogoXlsx: DocumentTemplate = {
  key: 'riepilogo-ordine-xlsx',
  label: 'Riepilogo dell’ordine (Excel)',
  format: 'XLSX',
  ambito: 'unico',
  predefinito: true,
  nomeFile: (dati) =>
    nomeFile({
      data: dati.ordine.confermatoIl ?? dati.ordine.creatoIl,
      codice: dati.ordine.code,
      qualifica: 'riepilogo',
      estensione: 'xlsx',
    }),
  build: (dati) => costruisci(dati),
};
