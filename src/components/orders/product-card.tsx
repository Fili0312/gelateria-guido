'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { FotoProdotto } from '@/components/products/foto-prodotto';
import { ColloBadge } from '@/components/products/collo-badge';
import type { OffertaOrdinabile, RisultatoOrdinabile } from '@/features/orders/dto';
import { CONFEZIONI_MAX, CONFEZIONI_MIN } from '@/features/orders/schema';
import { euro, formatoConfezione, nomeLeggibile } from '@/features/products/format';

/**
 * Un prodotto da ordinare, come card.
 *
 * ── Cosa c'è e cosa è stato tolto ───────────────────────────────────────
 * Solo ciò che serve a decidere se metterlo nell'ordine: **foto, nome,
 * formato, fornitore, prezzo, e il bottone**. Tutto il resto — codici,
 * aliquote, date — sta nella scheda prodotto, dove si va quando ci si sta
 * facendo una domanda, non mentre si compila un ordine.
 *
 * La gerarchia è pensata per chi scorre col pollice e non legge: la foto
 * dice *cosa* è, il prezzo grande dice *quanto*, il bottone verde dice
 * *dove premere*. Nome e fornitore si leggono solo se i primi tre non sono
 * bastati.
 *
 * ── Perché il prezzo è il secondo elemento per grandezza ────────────────
 * Perché è la ragione per cui questa app esiste: confrontare i fornitori. Un
 * prezzo scritto piccolo accanto al nome obbligherebbe a fermarsi su ogni
 * riga per leggerlo, e chi ordina cinquanta prodotti non si ferma.
 */

/** Il comando quantità, quando il prodotto è già dentro. */
function Quantita({
  nome,
  quantita,
  onCambia,
  onTogli,
}: {
  nome: string;
  quantita: number;
  onCambia: (q: number) => void;
  onTogli: () => void;
}) {
  // `null` mentre non si sta scrivendo: così il campo segue le modifiche che
  // arrivano da altrove — il «+», o l'ordine ricaricato — invece di restare
  // fermo su quello che c'era all'apertura della pagina.
  const [bozza, setBozza] = useState<string | null>(null);

  function conferma() {
    if (bozza === null) return;
    const richiesta = Number(bozza);
    setBozza(null);
    // Un campo svuotato non vuol dire zero: vuol dire che ci si è ripensati.
    if (!bozza.trim() || !Number.isFinite(richiesta)) return;
    if (richiesta < CONFEZIONI_MIN) {
      onTogli();
      return;
    }
    const limitata = Math.min(richiesta, CONFEZIONI_MAX);
    if (limitata !== quantita) onCambia(limitata);
  }

  const meno = quantita <= CONFEZIONI_MIN;

  // Una pastiglia tonda, **accanto** al bottone e non al suo posto.
  //
  // Il «+» resta dov'è e continua ad aggiungere: aggiungendo la seconda
  // confezione il dito non deve cercare un altro bersaglio. La pastiglia
  // compare a sinistra, nello spazio che era già riservato, e serve a
  // togliere o a scrivere il numero — cinquanta casse d'acqua non si fanno
  // a colpi di «+».
  return (
    <span className="border-brand-200 bg-brand-50 flex shrink-0 items-center rounded-full border">
      <button
        type="button"
        onClick={() => (meno ? onTogli() : onCambia(quantita - 1))}
        aria-label={meno ? `Togli ${nome} dall’ordine` : 'Una confezione in meno'}
        className="text-brand-700 hover:bg-brand-100 active:bg-brand-200 grid h-11 w-8 cursor-pointer place-items-center rounded-l-full transition-colors"
      >
        <span aria-hidden className="text-base leading-none font-bold">
          {meno ? '×' : '−'}
        </span>
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={bozza ?? String(quantita)}
        onChange={(e) => setBozza(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => conferma()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setBozza(null);
            e.currentTarget.blur();
          }
        }}
        aria-label={`Confezioni di ${nome}`}
        className="tabellare focus:bg-brand-100 h-11 w-7 cursor-text rounded-r-full bg-transparent pr-0.5 text-center text-[15px] font-bold text-neutral-950 outline-none"
      />
    </span>
  );
}

function Aggiungi({ etichetta, onClick }: { etichetta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etichetta}
      className="bg-brand-600 hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-600 grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-full text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
      >
        <path d="M12 5.5v13M5.5 12h13" />
      </svg>
    </button>
  );
}

/** Prezzo, sconto e badge: il blocco che si legge per decidere. */
function Prezzo({ offerta, grande }: { offerta: OffertaOrdinabile; grande: boolean }) {
  const sconto = Number(offerta.scontoExtraPct) > 0;
  return (
    <div className="flex flex-col items-end gap-0.5">
      {/* Il numero più grande della card: è la ragione per cui questa app
          esiste. Tutto il resto si legge solo se questo non è bastato. */}
      <span
        className={`tabellare leading-none font-extrabold text-neutral-950 ${
          // Un filo più piccolo sui telefoni stretti: a 320 pixel ogni
          // millimetro tolto qui è un millimetro dato al nome, che è
          // l'unica cosa che davvero non può essere troncata.
          grande ? 'text-[1.3rem] min-[400px]:text-[1.45rem]' : 'text-base'
        }`}
      >
        {euro(offerta.priceNet)}
      </span>
      {/* Il prezzo per unità solo se la confezione è dichiarata: altrimenti
          sarebbe diviso per un numero inventato e sembrerebbe un dato vero. */}
      {offerta.unitPrice && offerta.packQuantityConfirmed && (
        <span className="tabellare text-[12px] font-normal text-neutral-400 min-[360px]:text-[13px]">
          {euro(offerta.unitPrice)}/{offerta.unitPriceBasis === 'PER_KG' ? 'kg' : 'L'}
        </span>
      )}
      {sconto && (
        <span
          className="rounded-lg bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-violet-700"
          title={`Sconto concordato: paghi ${euro(offerta.priceNet)} e ti tornano indietro ${euro(
            Number(offerta.priceNet) - Number(offerta.prezzoEffettivo),
          )}`}
        >
          −{offerta.scontoExtraPct}% → {euro(offerta.prezzoEffettivo)}
        </span>
      )}
    </div>
  );
}

export function ProductCard({
  risultato,
  attiva,
  perOfferta,
  onSeleziona,
  onAggiungi,
  onCambiaQuantita,
  onRimuovi,
}: {
  risultato: RisultatoOrdinabile;
  attiva: boolean;
  perOfferta: Map<string, { rigaId: string; quantita: number }>;
  onSeleziona: () => void;
  onAggiungi: (supplierProductId: string) => void;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  onRimuovi: (rigaId: string) => void;
}) {
  const prima = risultato.offerte[0];
  const altre = risultato.offerte.slice(1);
  // Le card con più fornitori nascono **chiuse**: con nove fornitori e
  // cinquecento prodotti un elenco in cui un terzo delle voci è alto il
  // triplo delle altre non si scorre. Il confronto non si perde — davanti
  // c'è già il più conveniente col suo prezzo, e accanto quanti altri ce
  // l'hanno.
  const [aperto, setAperto] = useState(false);
  const elemento = useRef<HTMLLIElement>(null);
  const gia = prima ? perOfferta.get(prima.supplierProductId) : undefined;

  useEffect(() => {
    if (attiva) elemento.current?.scrollIntoView({ block: 'nearest' });
  }, [attiva]);

  return (
    <li
      ref={elemento}
      onMouseEnter={onSeleziona}
      className={`overflow-hidden rounded-2xl border bg-white transition-colors ${
        // Verde solo quando il prodotto è **dentro l'ordine**: è un'informazione
        // vera. Un bordo verde su ogni card sotto il dito lo renderebbe un
        // colore di sfondo, e allora non direbbe più niente.
        gia ? 'border-brand-300 bg-brand-50/50' : 'border-neutral-200'
      }`}
    >
      {/* Una riga sola, sempre.
          Il ritorno a capo automatico dava card alte duecentottanta pixel a
          trecentoventi e centosettanta a trecentonovanta: scorrendo, la
          stessa lista cambiava passo a seconda del telefono. Le misure
          scalano invece coi punti d'interruzione — foto, prezzo e comando
          quantità si stringono tutti — e il nome tiene sempre le sue due
          righe con dentro le parole che distinguono il prodotto. */}
      {/* ── Come è messa la card ──────────────────────────────────────
          La foto occupa **tutto il fianco sinistro**, a filo e a tutta
          altezza: niente margini attorno, niente sporgenze fuori dal bordo.

          Il nome sta su una riga **sua**, larga quanto tutta la colonna.
          Prima divideva la larghezza con prezzo e comandi e a
          trecentoventi pixel gliene restavano ottantasei: «Absolut Citron
          Vodka Litro» ci finiva a pezzi di una parola per riga. Ora ne ha
          centonovantasei sullo stesso telefono, e il nome si legge — che è
          la prima cosa che si guarda scorrendo. */}
      <div className="flex items-stretch">
        <FotoProdotto
          src={risultato.imageUrl}
          nome={risultato.name}
          categoria={risultato.category?.name}
          className="w-[4.25rem] shrink-0 self-stretch rounded-none min-[360px]:w-[4.75rem] min-[400px]:w-[5.25rem]"
        />

        <div className="min-w-0 flex-1 px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {risultato.category && (
                <span className="truncate rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-violet-600 uppercase">
                  {risultato.category.name}
                </span>
              )}
              {altre.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAperto((v) => !v)}
                  aria-expanded={aperto}
                  aria-label={
                    aperto
                      ? `Nascondi gli altri fornitori di ${risultato.name}`
                      : `Mostra gli altri ${altre.length} fornitori di ${risultato.name}`
                  }
                  className="-my-2 inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-0.5 rounded-lg px-1 text-[11px] font-semibold whitespace-nowrap text-neutral-400 transition-colors hover:text-neutral-700"
                >
                  {/* Solo il numero: «fornitore» per esteso si portava via
                      ottanta pixel e faceva diventare «VODKA» un «VOD…». */}
                  <span aria-hidden>+{altre.length}</span>
                  <AppIcon
                    name="chevron"
                    className={`h-3 w-3 transition-transform ${aperto ? 'rotate-90' : ''}`}
                  />
                </button>
              )}
            </div>

            {prima && <Prezzo offerta={prima} grande />}
          </div>

          {/* Il nome del listino è tutto maiuscolo perché nasce per essere
              stampato e letto a magazzino. A schermo occupa più spazio a
              parità di parole e si troncava proprio sulla parola che
              distingue il prodotto: si leggeva «ABSOLUT CITRON…». Il dato
              non cambia — l'ordine di acquisto riporta ancora la dicitura
              del fornitore. */}
          <p className="mt-1.5 line-clamp-2 text-[16px] leading-[1.25] font-bold text-neutral-950 min-[360px]:text-[17px] min-[400px]:text-[17.5px]">
            {nomeLeggibile(risultato.name)}
          </p>

          <div className="mt-1.5 flex items-end justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-neutral-500">
              {prima ? (
                <>
                  <ColloBadge confezione={prima} />
                  <span className="truncate">{prima.supplierName}</span>
                  {prima.migliore && (
                    <span className="inline-flex items-center gap-0.5 rounded-lg bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-green-700">
                      <span aria-hidden>★</span> conviene
                    </span>
                  )}
                  {prima.stale && (
                    <span className="rounded-lg bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      prezzo fermo
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span>{formatoConfezione(risultato.unitSize, risultato.unitOfMeasure, 1)}</span>
                  <span className="text-amber-700">{risultato.nonOrdinabile}</span>
                </>
              )}
            </span>

            {/* Il «+» **non si sposta** quando il prodotto entra
                nell'ordine: la pastiglia compare accanto, e il dito che
                aggiunge la seconda confezione ritrova il bersaglio dov'era. */}
            {prima && (
              <div className="flex shrink-0 items-center gap-1.5">
                {gia && (
                  <Quantita
                    nome={risultato.name}
                    quantita={gia.quantita}
                    onCambia={(q) => onCambiaQuantita(gia.rigaId, q)}
                    onTogli={() => onRimuovi(gia.rigaId)}
                  />
                )}
                <Aggiungi
                  etichetta={
                    gia
                      ? `Un’altra confezione di ${risultato.name}`
                      : `Aggiungi ${risultato.name} all’ordine`
                  }
                  onClick={() =>
                    gia
                      ? onCambiaQuantita(gia.rigaId, Math.min(gia.quantita + 1, CONFEZIONI_MAX))
                      : onAggiungi(prima.supplierProductId)
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {aperto && altre.length > 0 && (
        <div className="border-t border-neutral-200">
          {/* Perché guardare le alternative: senza questa riga sono solo altri
              numeri, e restano lì senza far decidere niente. */}
          {risultato.confrontato && risultato.risparmioPerConfezione && (
            <p className="bg-green-50/70 px-3 py-1.5 text-xs text-green-900">
              Conviene da <strong>{prima!.supplierName}</strong>:{' '}
              <strong>{euro(risultato.risparmioPerConfezione)}</strong> in meno a confezione.
            </p>
          )}
          <ul className="divide-y divide-neutral-100">
            {altre.map((offerta) => {
              const suo = perOfferta.get(offerta.supplierProductId);
              return (
                <li
                  key={offerta.supplierProductId}
                  className="flex items-center gap-3 px-3 py-2 pl-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-800">
                      {offerta.supplierName}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {formatoConfezione(
                        offerta.unitSize,
                        offerta.unitOfMeasure,
                        offerta.packQuantity,
                      )}
                    </span>
                  </span>
                  <Prezzo offerta={offerta} grande={false} />
                  {suo ? (
                    <Quantita
                      nome={`${risultato.name} da ${offerta.supplierName}`}
                      quantita={suo.quantita}
                      onCambia={(q) => onCambiaQuantita(suo.rigaId, q)}
                      onTogli={() => onRimuovi(suo.rigaId)}
                    />
                  ) : (
                    <Aggiungi
                      etichetta={`Aggiungi ${risultato.name} da ${offerta.supplierName}`}
                      onClick={() => onAggiungi(offerta.supplierProductId)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}
