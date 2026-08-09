'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { useToast } from '@/components/ui';

/**
 * Portare altri prodotti dentro i confronti.
 *
 * Un confronto nasce quando due fornitori vendono lo stesso articolo **sotto
 * lo stesso prodotto**. Se lo stesso rum sta a catalogo due volte con due
 * nomi diversi, non si confronta niente: non perché manchi un dato, ma
 * perché manca un collegamento.
 *
 * Questo pulsante cerca quei collegamenti e li fa. Non scrive un commento —
 * un commento non aggiunge una riga a questa tabella, e questa pagina serve
 * a confrontare.
 *
 * Le coppie **sicure** si collegano da sole. Quelle su cui il modello ha una
 * riserva no: «non ne sono sicuro» è una risposta, e trattarla come un sì la
 * butterebbe via. Quelle si decidono in «Da abbinare».
 */

interface Esito {
  prodottiEsaminati: number;
  coppieCandidate: number;
  coppieConfermate: number;
  chiamate: number;
  collegati: number;
  daDecidere: unknown[];
}

export function AiReading({ endpoint, confrontiAttuali }: { endpoint: string; confrontiAttuali: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);

  async function cerca() {
    if (
      !confirm(
        'Cercare altri prodotti da mettere a confronto?\n\n' +
          'Trova lo stesso articolo venduto da due fornitori con nomi diversi e li collega. ' +
          'Il formato deve già coincidere: quello lo verifica la regola, non il modello. ' +
          'Le coppie incerte non vengono toccate e restano da decidere in «Da abbinare».\n\n' +
          'È una chiamata a pagamento, contata sul budget mensile.',
      )
    ) {
      return;
    }
    setAttesa(true);
    try {
      const risposta = await fetch(endpoint, {
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
      toast({
        title:
          corpo.data.collegati > 0
            ? `${corpo.data.collegati} prodotti entrati nei confronti`
            : 'Nessun prodotto nuovo da confrontare',
        description:
          corpo.data.daDecidere.length > 0
            ? `${corpo.data.daDecidere.length} coppie restano da decidere in «Da abbinare».`
            : undefined,
        tone: 'success',
      });
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div>
        <h2 className="flex items-center gap-2 font-black text-neutral-950">
          <AppIcon name="sparkles" className="h-4 w-4 text-violet-600" />
          Trova altri confronti
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-600">
          Lo stesso articolo venduto da due fornitori con nomi diversi sta a catalogo due volte, e
          finché è così non si confronta. Questo lo cerca e lo <strong>collega</strong>: i prodotti
          entrano qui dentro. Il formato lo verifica la regola — 33 cl con 33 cl — al modello si
          chiede solo se «HAVANA CLUB 3 A. RHUM» e «HAVANA CLUB 3Y RON» sono la stessa bottiglia.
        </p>
        {esito && (
          <p className="mt-2 text-xs text-neutral-600">
            {esito.coppieCandidate} coppie col formato compatibile su {esito.prodottiEsaminati}{' '}
            prodotti · <strong className="text-green-700">{esito.collegati} collegate</strong>
            {esito.daDecidere.length > 0 && (
              <>
                {' · '}
                <Link href="/abbinamenti" className="text-brand-700 font-semibold hover:underline">
                  {esito.daDecidere.length} da decidere tu →
                </Link>
              </>
            )}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={attesa}
        onClick={() => void cerca()}
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none"
      >
        <AppIcon name="sparkles" className="h-4 w-4" />
        {attesa ? 'Sto cercando…' : confrontiAttuali === 0 ? 'Trova i primi confronti' : 'Trova altri confronti'}
      </button>
    </section>
  );
}
