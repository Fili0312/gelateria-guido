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
        className="tabellare focus:bg-brand-100 h-11 w-7 cursor-text rounded-r-full bg-transparent pr-0.5 text-center text-base font-bold text-neutral-950 outline-none"
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
          grande ? 'text-xl min-[400px]:text-2xl' : 'text-base'
        }`}
      >
        {euro(offerta.priceNet)}
      </span>
      {/* Il prezzo per unità solo se la confezione è dichiarata: altrimenti
          sarebbe diviso per un numero inventato e sembrerebbe un dato vero. */}
      {offerta.unitPrice && offerta.packQuantityConfirmed && (
        <span className="tabellare text-xs font-normal text-neutral-400 min-[360px]:text-sm">
          {euro(offerta.unitPrice)}/{offerta.unitPriceBasis === 'PER_KG' ? 'kg' : 'L'}
        </span>
      )}
      {sconto && (
        <span
          className="rounded-lg bg-violet-50 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-violet-700"
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
      className={`rounded-2xl border bg-white transition-colors ${
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
      <div className="flex items-center gap-3 p-3 min-[400px]:gap-4 min-[400px]:p-4">
        <FotoProdotto
          src={risultato.imageUrl}
          nome={risultato.name}
          categoria={risultato.category?.name}
          className="h-[5.5rem] w-16 min-[360px]:h-[6rem] min-[360px]:w-[4.25rem] min-[400px]:h-[6.5rem] min-[400px]:w-[4.75rem]"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            {risultato.category ? (
              <span className="truncate rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-bold tracking-wide text-violet-600 uppercase">
                {risultato.category.name}
              </span>
            ) : (
              <span />
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
                className="-my-1.5 -mr-1 inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-0.5 rounded-lg px-1 text-xs font-semibold whitespace-nowrap text-neutral-400 transition-colors hover:text-neutral-700"
              >
                {/* Il numero, non una freccia muta: da chiusa la card deve
                    dire che sotto c'è un confronto, o nessuno la apre. Ma in
                    grigio e in piccolo — è una seconda scelta, e non deve
                    competere col bottone verde. */}
                {/* Solo il numero: la parola per esteso si portava via
                    ottanta pixel sulla riga della categoria, e «VODKA»
                    diventava «VOD…». Cosa significhi lo dice l'etichetta
                    per chi non vede lo schermo, e la freccia per chi lo
                    vede. */}
                <span aria-hidden>+{altre.length}</span>
                <AppIcon
                  name="chevron"
                  className={`h-3 w-3 transition-transform ${aperto ? 'rotate-90' : ''}`}
                />
              </button>
            )}
          </div>
          {/* Piccolo apposta.
              La colonna è stretta — prezzo e comandi stanno di fianco — e a
              diciassette pixel ci entravano due parole per riga: il nome si
              spezzava prima di dire cosa fosse. A tredici ce ne stanno il
              doppio, e perdere l'ultima parola di «… Vodka Litro» costa
              meno che perdere la prima.

              Il nome del listino è tutto maiuscolo perché nasce per essere
              stampato e letto a magazzino. A schermo occupa più spazio a
              parità di parole, va a capo prima e si tronca proprio sulla
              parola che distingue il prodotto: si leggeva «ABSOLUT
              CITRON…». Il dato non cambia — cambia come lo si mostra.

              Tre righe sotto i quattrocento pixel, due sopra. Su uno
              schermo stretto, con il comando quantità accanto, al nome
              restano ottantaquattro pixel: in due righe ci sta «Absolut
              Citron…», che è di nuovo il troncamento da cui siamo partiti.
              Venti pixel di card in più valgono il nome intero. */}
          <p className="mt-1 line-clamp-3 text-sm leading-[1.35] font-bold text-neutral-950 min-[400px]:text-base">
            {nomeLeggibile(risultato.name)}
          </p>

          {prima ? (
            <>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-neutral-500">
                <ColloBadge confezione={prima} />
                <span className="truncate">{prima.supplierName}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                {prima.migliore && (
                  <span className="inline-flex items-center gap-0.5 rounded-lg bg-green-50 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-green-700">
                    <span aria-hidden>★</span> conviene
                  </span>
                )}
                {prima.stale && (
                  <span className="rounded-lg bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                    prezzo fermo
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="text-neutral-500">
                {formatoConfezione(risultato.unitSize, risultato.unitOfMeasure, 1)}
              </span>
              <span className="text-amber-700">{risultato.nonOrdinabile}</span>
            </p>
          )}
        </div>

        {/* Larghezza **riservata**, uguale nei due stati.
            Premendo «+» il bottone da quarantotto pixel diventa il comando
            quantità da centoventi, e tutta la card si riassestava sotto il
            dito: il nome si accorciava, le righe si spostavano, e il secondo
            tocco finiva altrove. Lo spazio del comando c'è già prima che
            serva, quindi non si muove niente. */}
        {prima && (
          <div className="ml-auto flex w-[6.25rem] shrink-0 flex-col items-end gap-2 min-[400px]:w-[6.75rem]">
            <Prezzo offerta={prima} grande />
            <div className="flex items-center gap-1.5">
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
          </div>
        )}
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
