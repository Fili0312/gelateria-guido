/**
 * Da «ABSOLUT CITRON VODKA LITRO» ai pezzi che servono per cercare una foto.
 *
 * ── Perché non basta il nome ────────────────────────────────────────────
 * Il nome del listino è scritto per un magazziniere: tutto maiuscolo,
 * abbreviato, col formato appiccicato in coda. Passarlo così a una ricerca
 * significa cercare «LITRO» insieme a «ABSOLUT», e trovare qualunque cosa.
 *
 * Qui si separano marca, variante e formato, perché ognuno di quei pezzi
 * pesa in modo diverso: la **marca sbagliata** rende la foto inutilizzabile,
 * la variante sbagliata la rende ingannevole (una Citron al posto di una
 * Vanilia), il formato sbagliato quasi non conta — la bottiglia da 70 cl e
 * quella da 1 L si assomigliano.
 *
 * ── Cosa fa la regola e cosa no ─────────────────────────────────────────
 * La regola sa **togliere**: formati, gradazioni, sigle d'imballo, parole di
 * servizio. Non sa **riconoscere**: che «Absolut» è una marca e «Citron» la
 * sua variante non è deducibile dal testo, è sapere come è fatto il mondo.
 * Per quello c'è `marca-ia.ts`, che interviene solo dopo, e solo dove la
 * regola non è arrivata.
 */

/** I pezzi con cui si cerca e si giudica una foto. */
export interface ProdottoNormalizzato {
  /** Il nome ripulito: senza formato, senza sigle, in minuscolo. */
  name: string;
  brand: string | null;
  /** «Citron», «Vaniglia»: ciò che distingue due prodotti della stessa marca. */
  variant: string | null;
  /** Il formato leggibile, come lo scriverebbe un umano: «1 L», «75 cl». */
  size: string | null;
  /** Il barcode, quando il listino lo porta. Vale più di tutto il resto. */
  ean: string | null;
  category: string | null;
  /** La stringa da mandare alla ricerca. */
  imageQuery: string;
}

export interface DatiProdotto {
  name: string;
  /** Necessaria soltanto per contabilità, cache e budget del fallback IA. */
  organizationId?: string;
  brand?: string | null;
  /** Riconosciuta dal modello insieme alla marca, quando c'è. */
  variante?: string | null;
  gtin?: string | null;
  categoria?: string | null;
  unitSize?: string | number | null;
  unitOfMeasure?: string | null;
  /** Fornitori attivi: AD si consulta soltanto quando compare qui. */
  fornitori?: readonly string[];
  /** Nei riempimenti ufficiali AD evita di ripiegare su foto community OFF. */
  soloAdBeverage?: boolean;
}

/**
 * Parole che nel nome di un listino non descrivono il prodotto.
 *
 * Sono di tre tipi, e vale la pena distinguerli perché si allungano per
 * ragioni diverse: **imballo** (come è confezionato), **servizio** (come è
 * venduto), **formato a parole** (il formato scritto invece che in cifre).
 */
const RUMORE = new Set([
  // imballo
  'ct',
  'ct.',
  'co',
  'co.',
  'cf',
  'cf.',
  'pz',
  'pz.',
  'conf',
  'conf.',
  'collo',
  'cartone',
  'cassa',
  'scatola',
  'fardello',
  'blister',
  'astuccio',
  'box',
  'bott',
  'bott.',
  'bottiglia',
  'bottiglie',
  'lattina',
  'lattine',
  'brick',
  'vetro',
  'pet',
  'plastica',
  'alluminio',
  'banda',
  'tappo',
  // servizio
  'x',
  'da',
  'di',
  'con',
  'senza',
  'per',
  'al',
  'alla',
  'the',
  'in',
  'assortiti',
  'assortito',
  'misto',
  'misti',
  'vari',
  'varie',
  'gusti',
  'nuovo',
  'nuova',
  'offerta',
  'promo',
  'omaggio',
  'sfuso',
  // formato a parole
  'litro',
  'litri',
  'lt',
  'lt.',
  'l',
  'ml',
  'cl',
  'cc',
  'gr',
  'gr.',
  'g',
  'kg',
  'kg.',
  'mg',
  'grammi',
  'chilo',
  'chili',
  // abbreviazioni che i listini usano al posto della parola intera: da sole
  // non sono nomi di niente, e cercarle non restringe niente
  'nat',
  'nat.',
  'gas',
  'gass',
  'friz',
  'frizz',
]);

/** Il formato, scritto come lo scriverebbe una persona. */
export function formatoLeggibile(
  unitSize: string | number | null | undefined,
  unitOfMeasure: string | null | undefined,
): string | null {
  const quanto = Number(unitSize);
  if (!Number.isFinite(quanto) || quanto <= 0) return null;
  const sigla: Record<string, string> = {
    L: 'L',
    DL: 'dl',
    CL: 'cl',
    ML: 'ml',
    KG: 'kg',
    HG: 'hg',
    G: 'g',
    MG: 'mg',
    PIECE: 'pz',
    LITER: 'L',
    MILLILITER: 'ml',
    CENTILITER: 'cl',
    KILOGRAM: 'kg',
    GRAM: 'g',
  };
  const um = sigla[unitOfMeasure ?? ''] ?? null;
  if (!um) return null;
  // `1.0 L` non lo scrive nessuno, e in una ricerca vale meno di `1 L`.
  const numero = Number.isInteger(quanto) ? String(quanto) : String(quanto).replace(/\.?0+$/, '');
  return `${numero} ${um}`;
}

/**
 * Toglie dal nome tutto ciò che è formato, gradazione o imballo.
 *
 * Le gradazioni («34%», «40 VOL») se ne vanno perché non compaiono quasi mai
 * nei nomi delle schede prodotto, e presenti nella ricerca la peggiorano.
 */
export function nomePulito(grezzo: string): string {
  const senzaFormati = grezzo
    .toLowerCase()
    // 1,5 lt · 70cl · 33 ml · 250g · 1x24
    .replace(/\b\d+[.,]?\d*\s*(lt|l|ml|cl|cc|kg|gr?|mg|pz)\b\.?/g, ' ')
    // 34% · 40 vol · 40°
    .replace(/\b\d+[.,]?\d*\s*(?:%|vol\b|°)/g, ' ')
    .replace(/\b\d+\s*[x×]\s*\d+\b/g, ' ')
    // `x24`, `x 6`: il moltiplicatore d'imballo senza il primo numero.
    .replace(/\b[x×]\s*\d+\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ');

  const parole = senzaFormati
    .split(/\s+/)
    // Le lettere singole non sono il nome di niente: restano dagli «O»
    // di «NAT O GAS» e dalle iniziali puntate, e in una ricerca allargano
    // il risultato senza restringerlo mai.
    .filter((p) => p.length > 1)
    .filter((p) => !RUMORE.has(p))
    // Un numero da solo, rimasto dopo aver tolto la sua unità, non dice
    // niente: era la metà di un formato.
    .filter((p) => !/^\d+$/.test(p));

  return parole.join(' ').trim();
}

/** Un EAN vero: 8, 12, 13 o 14 cifre, con la cifra di controllo che torna. */
export function eanValido(grezzo: string | null | undefined): string | null {
  const cifre = (grezzo ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(cifre.length)) return null;

  // La cifra di controllo è ciò che distingue un barcode da un numero di
  // riga lungo tredici cifre. Senza questo controllo si finisce a chiedere
  // alla fonte codici inventati, e ogni tanto uno **esiste**: è così che si
  // mette la foto di un altro prodotto con la massima confidenza possibile.
  const rovescio = [...cifre].reverse().map(Number);
  const controllo = rovescio[0]!;
  let somma = 0;
  for (let i = 1; i < rovescio.length; i += 1) {
    somma += rovescio[i]! * (i % 2 === 1 ? 3 : 1);
  }
  return (10 - (somma % 10)) % 10 === controllo ? cifre : null;
}

/**
 * La normalizzazione deterministica.
 *
 * `brand` resta `null` quando nessuno l'ha dichiarato: **inventarlo dal
 * primo token del nome** sarebbe comodo e sbagliato — su «ACQUA PANNA
 * NATURALE» darebbe marca «acqua», e da lì in poi ogni acqua somiglierebbe a
 * ogni altra. Chi vuole la marca la chiede a `marca-ia.ts`.
 */
export function normalizza(prodotto: DatiProdotto): ProdottoNormalizzato {
  const name = nomePulito(prodotto.name);
  const brand = prodotto.brand?.trim().toLowerCase() || null;
  const variant = prodotto.variante?.trim().toLowerCase() || null;
  const size = formatoLeggibile(prodotto.unitSize, prodotto.unitOfMeasure);
  const ean = eanValido(prodotto.gtin);

  // La marca non si ripete nella query se è già dentro al nome: «absolut
  // absolut citron» pesa peggio di «absolut citron» in qualunque ricerca.
  const conMarca = brand && !name.includes(brand) ? `${brand} ${name}` : name;

  return {
    name,
    brand,
    variant,
    size,
    ean,
    category: prodotto.categoria?.trim() || null,
    imageQuery: [conMarca, size].filter(Boolean).join(' ').trim(),
  };
}
