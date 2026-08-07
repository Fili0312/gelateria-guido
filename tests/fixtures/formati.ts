/**
 * Il test-set del parser dei formati.
 *
 * Ogni riga viene da un listino vero della gelateria — Barzelli (aprile
 * 2026) o Cecconi (febbraio/marzo 2025) — copiata come sta, comprese le
 * maiuscole a caso, gli spazi mancanti e le abbreviazioni. Le attese sono
 * annotate a mano leggendo il PDF.
 *
 * Serve a due cose: misurare il parser su dati reali invece che su esempi
 * inventati, e accorgersi se una modifica futura rompe un caso che oggi
 * funziona.
 */

import type { UnitOfMeasure } from '../../src/server/domain/packaging/units.js';

export interface CasoFormato {
  /** La descrizione come la scrive il fornitore. */
  testo: string;
  /** Il codice U.M. della colonna, quando c'e'. */
  um?: string;
  /** Da quale listino viene. */
  fonte: 'barzelli' | 'cecconi' | 'sintetico';
  atteso: {
    unitSize: string;
    uom: UnitOfMeasure;
    packQuantity: number;
    /** Quando indicato, si verifica anche la certezza della confezione. */
    packQuantityConfirmed?: boolean;
  };
  /** Parole che devono restare nel nucleo dopo aver tolto il formato. */
  nucleoContiene?: string[];
  /** Parole che NON devono restare: sono formato, non nome. */
  nucleoNonContiene?: string[];
}

export const CASI_FORMATO: CasoFormato[] = [
  // ── Barzelli: la notazione a frazione di litro ────────────────────────
  {
    testo: 'AMARETTO DI SARONNO 1/1',
    um: 'BT',
    fonte: 'barzelli',
    atteso: { unitSize: '1', uom: 'L', packQuantity: 1, packQuantityConfirmed: true },
    nucleoContiene: ['amaretto', 'saronno'],
  },
  {
    testo: 'BITTER S.PELL.ROSSO 1/10 VP',
    um: 'BT',
    fonte: 'barzelli',
    atteso: { unitSize: '0.1', uom: 'L', packQuantity: 1 },
  },
  {
    testo: 'BRILLANTE RECOARO 1/5 VP',
    um: 'BT',
    fonte: 'barzelli',
    atteso: { unitSize: '0.2', uom: 'L', packQuantity: 1 },
  },
  {
    // Nessuno spazio fra il nome e il formato: esiste davvero.
    testo: "AMARO TONICO D'ERBORISTA VARNELLI1/1",
    um: 'BT',
    fonte: 'barzelli',
    atteso: { unitSize: '1', uom: 'L', packQuantity: 1 },
    nucleoContiene: ['varnelli'],
  },
  {
    testo: 'CAMPARI SODA 1/10 VP (CTx100)',
    um: 'CT',
    fonte: 'barzelli',
    atteso: { unitSize: '0.1', uom: 'L', packQuantity: 100, packQuantityConfirmed: true },
  },

  // ── Barzelli: litri col punto decimale ───────────────────────────────
  {
    testo: 'BRAULIO AMARO RISERVA 0.700',
    um: 'BT',
    fonte: 'barzelli',
    atteso: { unitSize: '0.7', uom: 'L', packQuantity: 1 },
    nucleoNonContiene: ['700'],
  },
  {
    testo: 'angostura BITTER 0.200',
    um: 'BT',
    fonte: 'barzelli',
    atteso: { unitSize: '0.2', uom: 'L', packQuantity: 1 },
  },
  {
    testo: "CA' DEL BOSCO FRANCIAC. CUVEE' 0.750",
    um: 'BT',
    fonte: 'barzelli',
    atteso: { unitSize: '0.75', uom: 'L', packQuantity: 1 },
  },
  {
    // Il numero dopo il nome NON e' un formato: e' un codice di prodotto.
    testo: 'BONAV. MASCHIO GR.BARRIQUE 903 0.700',
    um: 'BT',
    fonte: 'barzelli',
    atteso: { unitSize: '0.7', uom: 'L', packQuantity: 1 },
    nucleoContiene: ['903'],
  },
  {
    // I gradi alcolici non sono un formato.
    testo: 'BEEFEATER GIN 40^ 1/1',
    um: 'BT',
    fonte: 'barzelli',
    atteso: { unitSize: '1', uom: 'L', packQuantity: 1 },
  },

  // ── Barzelli: cartoni ────────────────────────────────────────────────
  {
    testo: 'APEROLSODA cl.12.5 *BAR* Ctx48 VP',
    um: 'CT',
    fonte: 'barzelli',
    atteso: { unitSize: '12.5', uom: 'CL', packQuantity: 48, packQuantityConfirmed: true },
  },
  {
    testo: 'S.BENED. ACQ. TOWER NAT. 1/1 ctx12',
    um: 'CT',
    fonte: 'barzelli',
    atteso: { unitSize: '1', uom: 'L', packQuantity: 12, packQuantityConfirmed: true },
  },
  {
    testo: 'COCA COLA LATTINA 0.33',
    um: 'PZ',
    fonte: 'barzelli',
    atteso: { unitSize: '0.33', uom: 'L', packQuantity: 1, packQuantityConfirmed: true },
  },

  // ── Cecconi: unita' prefissa ─────────────────────────────────────────
  {
    testo: 'ALISEA NATURALE CL.50 PET',
    um: 'CO',
    fonte: 'cecconi',
    // Si compra a collo ma il listino non dice di quante bottiglie:
    // il "1" e' un ripiego e va dichiarato come tale.
    atteso: { unitSize: '50', uom: 'CL', packQuantity: 1, packQuantityConfirmed: false },
    nucleoContiene: ['alisea', 'naturale'],
  },
  {
    testo: 'FIVE LAKES SIBERIA VODKA 40% LT.1',
    um: 'UN',
    fonte: 'cecconi',
    atteso: { unitSize: '1', uom: 'L', packQuantity: 1, packQuantityConfirmed: true },
  },
  {
    testo: 'BERTAGNOLLI GRAPPA GEWURZTRAMINER 42% CL.70',
    um: 'UN',
    fonte: 'cecconi',
    atteso: { unitSize: '70', uom: 'CL', packQuantity: 1 },
  },
  {
    testo: 'ACQUA FRIZ. 1,5 lt conf.6',
    um: 'CO',
    fonte: 'cecconi',
    atteso: { unitSize: '1.5', uom: 'L', packQuantity: 6, packQuantityConfirmed: true },
  },
  {
    testo: 'LILLET BLANC 17% CL.75',
    um: 'UN',
    fonte: 'cecconi',
    atteso: { unitSize: '75', uom: 'CL', packQuantity: 1 },
  },
  {
    testo: 'GOLDBERG YUZU TONIC CL.20',
    um: 'CO',
    fonte: 'cecconi',
    atteso: { unitSize: '20', uom: 'CL', packQuantity: 1, packQuantityConfirmed: false },
  },
  {
    testo: 'BITTER FUSETTI 25% LT.1',
    um: 'UN',
    fonte: 'cecconi',
    atteso: { unitSize: '1', uom: 'L', packQuantity: 1 },
  },
  {
    // Nessun formato scritto: e' un pezzo, e va bene cosi'.
    testo: 'GLENALLACHIE MEIKLE TOIR PEATED',
    um: 'UN',
    fonte: 'cecconi',
    atteso: { unitSize: '1', uom: 'PIECE', packQuantity: 1, packQuantityConfirmed: true },
  },
  {
    // L'annata resta nel nome: distingue il prodotto.
    testo: 'KALTERN GEWURZTRAMINER DOC 2023',
    um: 'UN',
    fonte: 'cecconi',
    atteso: { unitSize: '1', uom: 'PIECE', packQuantity: 1 },
    nucleoContiene: ['2023'],
  },
  {
    testo: 'ALISEA GASSATA CL.50 PET X24',
    um: 'CO',
    fonte: 'cecconi',
    atteso: { unitSize: '50', uom: 'CL', packQuantity: 24, packQuantityConfirmed: true },
  },
  {
    testo: 'SAN BENEDETTO LITRO GAS PETX12 ELITE',
    um: 'CO',
    fonte: 'cecconi',
    atteso: { unitSize: '1', uom: 'L', packQuantity: 12, packQuantityConfirmed: true },
  },
  {
    testo: "BECK'S CL 33X24",
    um: 'CO',
    fonte: 'cecconi',
    atteso: { unitSize: '33', uom: 'CL', packQuantity: 24, packQuantityConfirmed: true },
  },
  {
    testo: 'SUCCO PESCA 200 ml x 24',
    um: 'CO',
    fonte: 'cecconi',
    atteso: { unitSize: '200', uom: 'ML', packQuantity: 24, packQuantityConfirmed: true },
  },
  {
    // Due numeri senza unita': ventiquattro confezioni da tre bicchieri.
    testo: "ESTATHE TE' BICCH. PESCA 3x24",
    um: 'CO',
    fonte: 'cecconi',
    atteso: { unitSize: '1', uom: 'PIECE', packQuantity: 72, packQuantityConfirmed: true },
  },
  {
    testo: 'ZUCCHERO SEMOLATO KG 25 SACCO',
    um: 'SC',
    fonte: 'cecconi',
    atteso: { unitSize: '25', uom: 'KG', packQuantity: 1 },
  },
  {
    testo: 'ZUCCHERO A VELO GR.500 X20',
    um: 'CO',
    fonte: 'cecconi',
    atteso: { unitSize: '500', uom: 'G', packQuantity: 20, packQuantityConfirmed: true },
  },
  {
    testo: 'CACAO AMARO POLVERE KG 1',
    um: 'PZ',
    fonte: 'cecconi',
    atteso: { unitSize: '1', uom: 'KG', packQuantity: 1 },
  },

  // ── I tre modi di scrivere la stessa birra (punto 3 della specifica) ──
  {
    testo: 'Birra XYZ 33cl x12',
    fonte: 'sintetico',
    atteso: { unitSize: '33', uom: 'CL', packQuantity: 12 },
    nucleoContiene: ['birra', 'xyz'],
    nucleoNonContiene: ['33', '12'],
  },
  {
    testo: 'XYZ Birra cl.33 conf. 12pz',
    fonte: 'sintetico',
    atteso: { unitSize: '33', uom: 'CL', packQuantity: 12 },
    nucleoContiene: ['birra', 'xyz'],
  },
  {
    testo: 'Birra XYZ bottiglia 0,33L 12 pezzi',
    fonte: 'sintetico',
    atteso: { unitSize: '0.33', uom: 'L', packQuantity: 12 },
    nucleoContiene: ['birra', 'xyz'],
  },

  // ── Prodotti da gelateria ────────────────────────────────────────────
  {
    testo: 'Variegato Amarena cart. 4 x 2,5 kg',
    fonte: 'sintetico',
    atteso: { unitSize: '2.5', uom: 'KG', packQuantity: 4 },
  },
  {
    testo: 'Pasta Nocciola Piemonte IGP secchiello 5 kg',
    fonte: 'sintetico',
    atteso: { unitSize: '5', uom: 'KG', packQuantity: 1 },
  },
  {
    testo: 'Coni Wafer n.120',
    fonte: 'sintetico',
    atteso: { unitSize: '1', uom: 'PIECE', packQuantity: 120 },
  },
  {
    testo: 'Palettine legno conf. 1000 pz',
    fonte: 'sintetico',
    atteso: { unitSize: '1', uom: 'PIECE', packQuantity: 1000 },
  },
  {
    testo: 'Topping Caramello ml 950',
    fonte: 'sintetico',
    atteso: { unitSize: '950', uom: 'ML', packQuantity: 1 },
  },
  {
    testo: 'Granella Nocciola sacchetto 1 kg',
    fonte: 'sintetico',
    atteso: { unitSize: '1', uom: 'KG', packQuantity: 1 },
  },
  {
    testo: '470gr NOCCIOLE TOSTATE',
    fonte: 'sintetico',
    atteso: { unitSize: '470', uom: 'G', packQuantity: 1 },
  },
];
