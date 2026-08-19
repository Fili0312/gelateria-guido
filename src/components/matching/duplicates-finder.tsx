'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { useToast } from '@/components/ui';
import { euro } from '@/features/products/format';

/**
 * Trovare lo stesso articolo venduto da due fornitori.
 *
 * La coda qui sopra decide riga per riga **al momento dell'import**. Questo
 * guarda il catalogo intero e cerca una cosa diversa: due prodotti già
 * creati che sono la stessa bottiglia scritta in due modi.
 *
 * Ogni coppia si conferma a mano. Fondere due prodotti che non c'entrano è un
 * errore che si scopre tardi — quando un confronto dice una sciocchezza — e
 * si disfa a mano, quindi la decisione resta di una persona.
 */

interface OffertaDelDoppione {
  supplierName: string;
  supplierCode: string | null;
  priceNet: string | null;
  unitPrice: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
}

interface Doppione {
  aId: string;
  aNome: string;
  aFormato: string;
  aOfferte: OffertaDelDoppione[];
  bId: string;
  bNome: string;
  bFormato: string;
  bOfferte: OffertaDelDoppione[];
  somiglianza: number;
  motivo: string | null;
  sicuro: boolean;
  risparmioPerConfezione: string | null;
}

interface Esito {
  prodottiEsaminati: number;
  coppieCandidate: number;
  coppieConfermate: number;
  chiamate: number;
  doppioni: Doppione[];
  daDecidere: Doppione[];
  collegati: number;
}

/** Un lato della coppia: nome, formato e cosa costa da chi. */
function Lato({
  nome,
  formato,
  offerte,
}: {
  nome: string;
  formato: string;
  offerte: OffertaDelDoppione[];
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="truncate text-sm font-semibold text-neutral-950" title={nome}>
        {nome}
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">{formato}</p>
      <ul className="mt-2 space-y-1">
        {offerte.map((o, i) => (
          <li key={i} className="tabellare flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="font-semibold text-neutral-800">{o.supplierName}</span>
            {o.priceNet ? (
              <>
                <span className="text-neutral-950">{euro(o.priceNet)}</span>
                {o.packQuantityConfirmed && o.unitPrice ? (
                  <span className="text-neutral-400">{euro(o.unitPrice, 4)} per unità</span>
                ) : (
                  <span className="text-amber-700">confezione da definire</span>
                )}
                {o.packQuantity > 1 && (
                  <span className="text-neutral-500">collo da {o.packQuantity}</span>
                )}
              </>
            ) : (
              <span className="text-neutral-400">senza prezzo</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Gruppo({
  titolo,
  spiega,
  doppioni,
  inCorso,
  onUnisci,
  incerto = false,
}: {
  titolo: string;
  spiega: string;
  doppioni: Doppione[];
  inCorso: string | null;
  onUnisci: (d: Doppione) => void;
  incerto?: boolean;
}) {
  return (
    <div>
      <h3 className="flex flex-wrap items-baseline gap-2 text-sm font-extrabold text-neutral-950">
        {titolo}
        <span className="text-xs font-normal text-neutral-500">{spiega}</span>
      </h3>
      <ul className="mt-2 space-y-2">
        {doppioni.map((d) => {
          const chiave = `${d.aId}|${d.bId}`;
          return (
            <li
              key={chiave}
              className={`rounded-xl border bg-white p-3 ${
                incerto ? 'border-amber-300' : 'border-neutral-200'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <Lato nome={d.aNome} formato={d.aFormato} offerte={d.aOfferte} />
                <div className="grid shrink-0 place-items-center px-1 text-neutral-300">
                  <span aria-hidden className="text-lg">
                    ↔
                  </span>
                </div>
                <Lato nome={d.bNome} formato={d.bFormato} offerte={d.bOfferte} />
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-neutral-500">
                  {d.motivo && <span className="text-neutral-600">{d.motivo} · </span>}
                  somiglianza {d.somiglianza}
                  {d.risparmioPerConfezione && Number(d.risparmioPerConfezione) > 0 && (
                    <span className="font-semibold text-green-700">
                      {' · '}collegandoli si vede {euro(d.risparmioPerConfezione)} di differenza a
                      confezione
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  disabled={inCorso !== null}
                  onClick={() => onUnisci(d)}
                  className="bg-brand-600 hover:bg-brand-700 inline-flex min-h-9 cursor-pointer items-center rounded-lg px-3 text-sm font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-60"
                >
                  {inCorso === chiave ? 'Collegamento…' : 'Conferma: stesso articolo'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DuplicatesFinder({
  endpointCerca,
  endpointUnisci,
}: {
  endpointCerca: string;
  endpointUnisci: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [fatti, setFatti] = useState<Set<string>>(new Set());

  async function cerca() {
    if (
      !confirm(
        'Analizzare il catalogo per trovare altri confronti?\n\n' +
          'Cerca lo stesso articolo venduto da due fornitori con nomi diversi. Le coppie di cui ' +
          'il modello è sicuro vengono collegate subito; quelle incerte restano qui da ' +
          'confermare.\n\nÈ una chiamata a pagamento, contata sul budget mensile.',
      )
    ) {
      return;
    }
    setAttesa(true);
    try {
      const risposta = await fetch(endpointCerca, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ usaModello: true, collegaSicuri: true }),
      });
      const corpo = (await risposta.json()) as { ok: boolean; data?: Esito; error?: string };
      if (!corpo.ok || !corpo.data) {
        toast({ title: 'Ricerca non riuscita', description: corpo.error, tone: 'error' });
        return;
      }
      setEsito(corpo.data);
      setFatti(new Set());
      toast({
        title:
          corpo.data.collegati > 0
            ? `${corpo.data.collegati} prodotti entrati nei confronti`
            : 'Nessun collegamento nuovo',
        description:
          corpo.data.daDecidere.length > 0
            ? `${corpo.data.daDecidere.length} coppie aspettano una tua conferma qui sotto.`
            : `${corpo.data.coppieCandidate} coppie esaminate su ${corpo.data.prodottiEsaminati} prodotti.`,
        tone: 'success',
      });
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  async function unisci(d: Doppione) {
    const chiave = `${d.aId}|${d.bId}`;
    setInCorso(chiave);
    try {
      const risposta = await fetch(endpointUnisci, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ primoId: d.aId, secondoId: d.bId }),
      });
      const corpo = (await risposta.json()) as {
        ok: boolean;
        data?: { sopravvissutoNome: string; offerteSpostate: number };
        error?: string;
      };
      if (!corpo.ok || !corpo.data) {
        toast({ title: 'Non è stato possibile unire', description: corpo.error, tone: 'error' });
        return;
      }
      setFatti((f) => new Set(f).add(chiave));
      toast({
        title: `Collegati sotto «${corpo.data.sopravvissutoNome}»`,
        description: `${corpo.data.offerteSpostate} offerte restano distinte e ora si confrontano fra loro.`,
        tone: 'success',
      });
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setInCorso(null);
    }
  }

  const vivi = (elenco: Doppione[]) => elenco.filter((d) => !fatti.has(`${d.aId}|${d.bId}`));
  const incerti = vivi(esito?.daDecidere ?? []);

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-extrabold text-neutral-950">
            <AppIcon name="sparkles" className="h-4 w-4 text-violet-600" />
            Analizza il catalogo
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-600">
            Analisi sull’intero catalogo, non limitata all’ultimo listino. Il{' '}
            <strong>formato</strong> deve già coincidere — 33 cl con 33 cl — e lo verifica la
            regola, non il modello: al modello si chiede solo se «HAVANA CLUB 3 A. RHUM» e «HAVANA
            CLUB 3Y RON» sono la stessa bottiglia. I pezzi per confezione <strong>non</strong>{' '}
            devono coincidere: un collo da 24 e uno da 12 sono lo stesso prodotto, e a dire quale
            conviene ci pensa il prezzo al litro.
          </p>
        </div>
        <button
          type="button"
          disabled={attesa}
          onClick={() => void cerca()}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none"
        >
          <AppIcon name="sparkles" className="h-4 w-4" />
          {attesa ? 'Sto analizzando…' : esito ? 'Analizza di nuovo' : 'Analizza con IA'}
        </button>
      </div>

      {esito && (
        <div className="mt-3">
          <p className="text-xs text-neutral-500">
            {esito.coppieCandidate} coppie col formato compatibile su {esito.prodottiEsaminati}{' '}
            prodotti · {esito.chiamate} chiamate ·{' '}
            <strong className="text-green-700">{esito.collegati} collegate</strong>
          </p>

          {incerti.length === 0 ? (
            <p className="mt-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
              {esito.collegati > 0
                ? `${esito.collegati} prodotti collegati: ora si confrontano. Niente da decidere a mano.`
                : 'Nessuna coppia nuova da collegare.'}
            </p>
          ) : (
            <div className="mt-3">
              <Gruppo
                titolo={`${incerti.length} da decidere tu`}
                spiega="Il modello pensa che siano lo stesso articolo ma non se la sente di garantirlo. Guarda i nomi: se sono la stessa cosa, collegali."
                doppioni={incerti}
                inCorso={inCorso}
                onUnisci={unisci}
                incerto
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
