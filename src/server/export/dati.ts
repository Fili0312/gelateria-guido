import 'server-only';

import { Decimal } from 'decimal.js';
import { SETTINGS_ALL_KEYS, valoriDaRighe } from '@/features/settings/schema';
import type { UnitOfMeasureValue } from '@/features/products/schema';
import { prismaForOrganization } from '@/server/db';
import type { DatiDocumento, GruppoFornitore } from './template';

/**
 * Da un ordine confermato ai dati che i template stampano.
 *
 * ── Cosa si congela e cosa no ───────────────────────────────────────────
 * **Righe, prezzi, nomi degli articoli e nome del fornitore: dagli snapshot.**
 * Sono l'accordo commerciale, e devono restare quelli di allora anche se poi
 * il listino cambia. Una join di comodo al catalogo, qui, farebbe uscire un
 * PDF con i prezzi di oggi sotto un numero d'ordine di tre mesi fa.
 *
 * **Indirizzo, partita IVA ed email del fornitore: da adesso.** Non sono
 * l'accordo, sono il recapito — e il documento serve a mandarlo, quindi va
 * mandato dove il fornitore sta oggi. Congelare l'indirizzo significherebbe
 * ristampare un ordine e spedirlo alla sede vecchia.
 */

export type { DatiDocumento };

function intestazioneDefault(nomeOrganizzazione: string) {
  return {
    nome: nomeOrganizzazione,
    indirizzo: null,
    partitaIva: null,
    telefono: null,
    email: null,
  };
}

/** La data di consegna richiesta, contata dall'ordine. */
function giorniDopo(data: Date, giorni: number): Date {
  const quando = new Date(data);
  quando.setDate(quando.getDate() + giorni);
  return quando;
}

/** `''` è «non compilato», e nel documento vale come assente, non come vuoto. */
function oppureNull(testo: string | null | undefined): string | null {
  const t = testo?.trim();
  return t ? t : null;
}

/**
 * I totali dei gruppi che riceve — mai quelli dell'ordine intero.
 *
 * Si sommano gli **snapshot di riga**, non si ricalcolano da prezzo per
 * quantità: ricalcolare reintroduce l'arrotondamento e basta un centesimo di
 * scarto perché il totale del PDF e quello a schermo non coincidano. Il
 * fornitore che trova una differenza di un centesimo la contesta come se
 * fosse un errore, perché non ha modo di sapere che non lo è.
 */
export function totaliDi(gruppi: readonly GruppoFornitore[]): DatiDocumento['totali'] {
  let netto = new Decimal(0);
  let lordo = new Decimal(0);
  let righe = 0;
  let confezioni = 0;
  for (const g of gruppi) {
    netto = netto.plus(g.netto);
    lordo = lordo.plus(g.lordo);
    righe += g.righe.length;
    confezioni += g.confezioni;
  }
  return {
    netto: netto.toFixed(2),
    iva: lordo.minus(netto).toFixed(2),
    lordo: lordo.toFixed(2),
    righe,
    confezioni,
  };
}

/** Gli stessi dati, ristretti a un fornitore solo. */
export function soloFornitore(dati: DatiDocumento, supplierId: string): DatiDocumento | null {
  const gruppo = dati.gruppi.find((g) => g.supplierId === supplierId);
  if (!gruppo) return null;
  return { ...dati, gruppi: [gruppo], totali: totaliDi([gruppo]) };
}

export async function datiOrdine(
  organizationId: string,
  orderId: string,
): Promise<DatiDocumento | null> {
  const db = prismaForOrganization(organizationId);

  const ordine = await db.order.findFirst({
    where: { id: orderId, status: { not: 'DRAFT' } },
    select: {
      id: true,
      code: true,
      status: true,
      note: true,
      createdAt: true,
      confirmedAt: true,
      organization: { select: { name: true } },
      lines: {
        // Fuori le righe che il fornitore ha dichiarato di non avere.
        //
        // È il motivo per cui i documenti si rigenerano: mandargli un ordine
        // che contiene una cosa che lui stesso ha detto di non avere fa
        // perdere tempo a tutti e due, e il totale in fondo non
        // corrisponderebbe alla merce sul camion.
        where: { unavailableAt: null },
        select: {
          supplierId: true,
          nameSnapshot: true,
          supplierNameSnapshot: true,
          supplierCodeSnapshot: true,
          packQuantitySnapshot: true,
          packagingTypeSnapshot: true,
          unitSizeSnapshot: true,
          uomSnapshot: true,
          quantityPacks: true,
          unitPriceNetSnapshot: true,
          lineTotalNet: true,
          lineTotalGross: true,
          note: true,
        },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!ordine) return null;

  const [righeImpostazioni, fornitori] = await Promise.all([
    db.setting.findMany({
      where: { key: { in: SETTINGS_ALL_KEYS } },
      select: { key: true, value: true },
    }),
    db.supplier.findMany({
      where: { id: { in: [...new Set(ordine.lines.map((l) => l.supplierId))] } },
      select: {
        id: true,
        address: true,
        vatNumber: true,
        email: true,
        orderEmail: true,
        phone: true,
      },
    }),
  ]);

  const impostazioni = valoriDaRighe(righeImpostazioni);
  const base = intestazioneDefault(ordine.organization.name);
  const recapiti = new Map(fornitori.map((f) => [f.id, f]));

  const gruppi = new Map<string, GruppoFornitore>();
  for (const riga of ordine.lines) {
    let g = gruppi.get(riga.supplierId);
    if (!g) {
      const recapito = recapiti.get(riga.supplierId);
      g = {
        supplierId: riga.supplierId,
        supplierName: riga.supplierNameSnapshot,
        indirizzo: oppureNull(recapito?.address),
        partitaIva: oppureNull(recapito?.vatNumber),
        // L'indirizzo per gli ordini vince su quello generico: il commerciale
        // che manda i listini quasi mai è chi prende gli ordini.
        email: oppureNull(recapito?.orderEmail) ?? oppureNull(recapito?.email),
        telefono: oppureNull(recapito?.phone),
        righe: [],
        netto: '0',
        iva: '0',
        lordo: '0',
        confezioni: 0,
      };
      gruppi.set(riga.supplierId, g);
    }
    g.righe.push({
      supplierCode: riga.supplierCodeSnapshot,
      name: riga.nameSnapshot,
      packQuantity: riga.packQuantitySnapshot,
      packagingType: riga.packagingTypeSnapshot,
      // Gli snapshot non portano il nostro flag «confezione da definire»:
      // congelano cosa si è comprato, non i dubbi che avevamo. Un imballo
      // contraddittorio lo riconosce comunque `descriviCollo`.
      packQuantityConfirmed: true,
      unitSize: riga.unitSizeSnapshot.toString(),
      unitOfMeasure: riga.uomSnapshot as UnitOfMeasureValue,
      quantityPacks: riga.quantityPacks,
      priceNet: riga.unitPriceNetSnapshot.toString(),
      lineTotalNet: riga.lineTotalNet.toString(),
      note: riga.note,
    });
    g.netto = new Decimal(g.netto).plus(riga.lineTotalNet.toString()).toFixed(2);
    g.lordo = new Decimal(g.lordo).plus(riga.lineTotalGross.toString()).toFixed(2);
    g.iva = new Decimal(g.lordo).minus(g.netto).toFixed(2);
    g.confezioni += riga.quantityPacks;
  }

  // Alfabetico: l'ordine in cui sono state aggiunte le righe non significa
  // niente per chi guarda l'elenco dei documenti.
  const elenco = [...gruppi.values()].sort((a, b) =>
    a.supplierName.localeCompare(b.supplierName, 'it'),
  );

  return {
    ordine: {
      id: ordine.id,
      code: ordine.code,
      stato: ordine.status,
      note: oppureNull(ordine.note),
      confermatoIl: ordine.confirmedAt,
      creatoIl: ordine.createdAt,
    },
    intestazione: {
      nome: oppureNull(impostazioni.intestazioneNome) ?? base.nome,
      indirizzo: oppureNull(impostazioni.intestazioneIndirizzo),
      partitaIva: oppureNull(impostazioni.intestazionePiva),
      telefono: oppureNull(impostazioni.intestazioneTelefono),
      email: oppureNull(impostazioni.intestazioneEmail),
      // Se il magazzino non è dichiarato, si consegna alla sede: è la cosa
      // che succede comunque, e scriverla evita che il camion chieda.
      consegnaPresso:
        oppureNull(impostazioni.consegnaIndirizzo) ??
        oppureNull(impostazioni.intestazioneIndirizzo),
      consegnaEntro: giorniDopo(
        ordine.confirmedAt ?? ordine.createdAt,
        impostazioni.consegnaGiorni,
      ),
      condizioniPagamento: oppureNull(impostazioni.condizioniPagamento),
      bancaAppoggio: oppureNull(impostazioni.bancaAppoggio),
      clausolaAccettazione: oppureNull(impostazioni.clausolaAccettazione),
    },
    gruppi: elenco,
    totali: totaliDi(elenco),
  };
}
