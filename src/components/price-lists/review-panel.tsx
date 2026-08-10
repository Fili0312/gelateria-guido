'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, useToast } from '@/components/ui';
import type { PriceListApiBody } from '@/features/price-lists/dto';

/**
 * Il pannello di revisione: cosa succederà al catalogo, e i due pulsanti.
 *
 * È l'ultima schermata prima che l'import tocchi i prezzi, e l'unica occasione
 * di accorgersi di un errore prima che entri nello storico. Per questo mostra
 * i numeri **prima** di chiedere conferma, e non li nasconde dietro un
 * riepilogo generico: «140 aggiornamenti» e «140 aggiornamenti di cui 3 con
 * variazioni oltre il 40%» sono due situazioni diverse.
 */

export interface Anteprima {
  riepilogo: {
    nuovi: number;
    aggiornati: number;
    invariati: number;
    confezioneCambiata: number;
    spariti: number;
    duplicati: number;
    aumentati: number;
    diminuiti: number;
    anomale: number;
  };
  daDecidere: {
    rigaId: string | null;
    differenze: string[];
    prezzoPrima: string | null;
    prezzoDopo: string | null;
    nuovaConfezioneApplicabile: boolean;
  }[];
  anomale: {
    rigaId: string | null;
    variazionePct: string | null;
    prezzoPrima: string | null;
    prezzoDopo: string | null;
  }[];
}

function Numero({
  etichetta,
  valore,
  tono = 'neutro',
}: {
  etichetta: string;
  valore: number;
  tono?: 'neutro' | 'buono' | 'attenzione';
}) {
  const colore =
    tono === 'buono'
      ? 'border-green-200 bg-green-50'
      : tono === 'attenzione'
        ? 'border-amber-200 bg-amber-50'
        : 'border-neutral-200 bg-white';
  return (
    <div className={`rounded-xl border px-4 py-3 ${colore}`}>
      <dt className="text-xs text-neutral-600">{etichetta}</dt>
      <dd className="tabellare mt-1 text-2xl font-black text-neutral-950">{valore}</dd>
    </div>
  );
}

export function ReviewPanel({
  anteprima,
  stato,
  endpointApply,
  endpointRevert,
  endpointRematch,
  endpointRows,
  hrefRigheDaCorreggere,
  hrefRigheDaDecidere,
  prodottiACatalogo,
  righeAgganciate,
  righeDaDecidere,
  righeNonImportabili,
}: {
  anteprima: Anteprima;
  stato: string;
  endpointApply: string;
  endpointRevert: string;
  endpointRematch: string;
  endpointRows: string;
  hrefRigheDaCorreggere: string;
  hrefRigheDaDecidere: string;
  /** Quanti prodotti ci sono già in catalogo: serve a spiegare il riabbinamento. */
  prodottiACatalogo: number;
  /** Righe che propongono un prodotto **già a catalogo**. */
  righeAgganciate: number;
  /** Abbinamenti ambigui che una persona deve ancora confermare o rifiutare. */
  righeDaDecidere: number;
  /** Righe incluse con almeno un errore deterministico. */
  righeNonImportabili: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState(false);
  const r = anteprima.riepilogo;
  const applicato = stato === 'APPLIED';
  const statoNonApplicabile = !applicato && stato !== 'REVIEW';
  const bloccato =
    r.confezioneCambiata > 0 ||
    righeDaDecidere > 0 ||
    righeNonImportabili > 0 ||
    statoNonApplicabile;

  async function chiama(endpoint: string, conferma: string, riuscito: string) {
    if (!confirm(conferma)) return;
    setAttesa(true);
    try {
      const risposta = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      const corpo = (await risposta.json().catch(() => null)) as PriceListApiBody<unknown> | null;
      if (!risposta.ok || !corpo?.ok) {
        toast({
          title: 'Non è stato possibile completare',
          description: corpo && !corpo.ok ? corpo.error : undefined,
          tone: 'error',
        });
        return;
      }
      toast({ title: riuscito, tone: 'success' });
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  async function decidiConfezione(
    rigaId: string,
    decisioneConfezione: 'MANTIENI_PRECEDENTE' | 'ACCETTA_NUOVA',
    conferma: string,
  ) {
    if (!confirm(conferma)) return;
    setAttesa(true);
    try {
      const risposta = await fetch(`${endpointRows}/${encodeURIComponent(rigaId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ decisioneConfezione }),
      });
      const corpo = (await risposta.json().catch(() => null)) as PriceListApiBody<unknown> | null;
      if (!risposta.ok || !corpo?.ok) {
        toast({
          title: 'Non è stato possibile decidere la confezione',
          description: corpo && !corpo.ok ? corpo.error : undefined,
          tone: 'error',
        });
        return;
      }
      toast({ title: 'Decisione sulla confezione registrata', tone: 'success' });
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-neutral-950">
          {applicato ? 'Import applicato' : 'Cosa succederà al catalogo'}
        </h2>
        {applicato && <Badge variant="success">applicato</Badge>}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Numero
          etichetta="Prodotti nuovi"
          valore={r.nuovi}
          tono={r.nuovi > 0 ? 'buono' : 'neutro'}
        />
        <Numero etichetta="Prezzi aggiornati" valore={r.aggiornati} />
        <Numero etichetta="Invariati" valore={r.invariati} />
        <Numero
          etichetta="Confezione cambiata"
          valore={r.confezioneCambiata}
          tono={r.confezioneCambiata > 0 ? 'attenzione' : 'neutro'}
        />
        <Numero
          etichetta="Spariti"
          valore={r.spariti}
          tono={r.spariti > 0 ? 'attenzione' : 'neutro'}
        />
      </dl>

      {r.aggiornati > 0 && (
        <p className="text-sm text-neutral-600">
          Dei {r.aggiornati} prezzi che cambiano: <strong>{r.aumentati}</strong> in aumento,{' '}
          <strong>{r.diminuiti}</strong> in calo
          {r.anomale > 0 && (
            <>
              , e <strong className="text-amber-700">{r.anomale} oltre il 40%</strong> — quasi
              sempre è una colonna letta male, non un aumento vero
            </>
          )}
          .
        </p>
      )}

      {r.confezioneCambiata > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm leading-6 text-amber-900">
            <strong className="font-semibold">
              {r.confezioneCambiata === 1
                ? 'Una riga ha la confezione cambiata'
                : `${r.confezioneCambiata} righe hanno la confezione cambiata`}
            </strong>{' '}
            rispetto al listino precedente. Vanno decise prima di applicare: aggiornare solo il
            prezzo farebbe sembrare un cambio di prezzo quello che è un cambio di confezione, e
            falserebbe lo storico e ogni confronto futuro.
          </p>
          <ul className="mt-3 space-y-3 text-xs text-amber-900">
            {anteprima.daDecidere.map((d, i) => (
              <li
                key={d.rigaId ?? i}
                className="rounded-lg border border-amber-200 bg-white/60 p-3"
              >
                <p>
                  {d.differenze.join(' · ')}
                  {d.prezzoPrima && d.prezzoDopo && ` — prezzo ${d.prezzoPrima} → ${d.prezzoDopo}`}
                </p>
                {d.rigaId && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={attesa}
                      onClick={() =>
                        decidiConfezione(
                          d.rigaId!,
                          'MANTIENI_PRECEDENTE',
                          'Usare per questa riga la confezione già presente in catalogo? Prezzo e descrizione letti dal file restano invariati.',
                        )
                      }
                    >
                      Mantieni la confezione precedente
                    </Button>
                    <Button
                      size="sm"
                      disabled={attesa || !d.nuovaConfezioneApplicabile}
                      title={
                        d.nuovaConfezioneApplicabile
                          ? undefined
                          : 'È cambiato il formato unitario: non può essere trattato come una semplice nuova confezione.'
                      }
                      onClick={() =>
                        decidiConfezione(
                          d.rigaId!,
                          'ACCETTA_NUOVA',
                          'Confermare la nuova confezione? L’offerta corrente verrà aggiornata e il nuovo prezzo conserverà il proprio valore unitario nello storico.',
                        )
                      }
                    >
                      Accetta la nuova confezione
                    </Button>
                  </div>
                )}
                {!d.nuovaConfezioneApplicabile && (
                  <p className="mt-2 text-amber-800">
                    È cambiato il formato unitario. Per registrarlo come prodotto diverso serve una
                    nuova policy sul riuso del codice fornitore; per ora correggi la riga oppure
                    mantieni il formato precedente.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {righeDaDecidere > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <strong className="font-semibold">
            {righeDaDecidere === 1
              ? 'Un abbinamento aspetta una decisione.'
              : `${righeDaDecidere} abbinamenti aspettano una decisione.`}
          </strong>{' '}
          Una proposta ambigua non può diventare un prodotto del catalogo senza conferma.
          <Link href={hrefRigheDaDecidere} className="ml-1 font-semibold underline">
            Apri le righe da decidere
          </Link>
          .
        </div>
      )}

      {righeNonImportabili > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">
          <strong className="font-semibold">
            {righeNonImportabili === 1
              ? 'Una riga contiene un errore di validazione.'
              : `${righeNonImportabili} righe contengono errori di validazione.`}
          </strong>{' '}
          Controlla i campi letti dal PDF. Se la riga non va importata, escludila esplicitamente
          dalla coda completa del listino.
          <Link href={hrefRigheDaCorreggere} className="ml-1 font-semibold underline">
            Apri tutte le righe del listino
          </Link>
          .
        </div>
      )}

      {statoNonApplicabile && (
        <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          Questo listino è in stato <strong>{stato}</strong>: si può applicare soltanto quando è in
          revisione.
        </p>
      )}

      {/* Il caso che rovina il catalogo in silenzio.
          L'abbinamento avviene al momento dell'import, contro il catalogo di
          allora. Un listino caricato quando il catalogo era vuoto non ha
          trovato niente, e applicandolo creerebbe un prodotto nuovo per ogni
          riga — compresi quelli che un altro fornitore vende già. Nessuno se
          ne accorgerebbe: l'import riuscirebbe, i numeri tornerebbero, e
          semplicemente non ci sarebbe mai niente da confrontare. */}
      {!applicato && prodottiACatalogo > 0 && righeAgganciate === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm leading-6 text-amber-900">
            <strong className="font-semibold">
              Nessuna riga si aggancia a un prodotto già a catalogo
            </strong>
            , eppure di prodotti ce ne sono {prodottiACatalogo}. Se questo listino è stato caricato
            quando il catalogo era più vuoto, gli abbinamenti sono stati cercati contro quello di
            allora. Ricalcolali prima di applicare: altrimenti i prodotti che un altro fornitore
            vende già verranno <strong>duplicati invece che affiancati</strong>, e senza
            affiancamento non c’è niente da confrontare.
          </p>
        </div>
      )}

      {r.duplicati > 0 && (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-600">
          {r.duplicati} {r.duplicati === 1 ? 'riga ripete' : 'righe ripetono'} un codice già
          presente in questo stesso listino, e{' '}
          {r.duplicati === 1 ? 'viene saltata' : 'vengono saltate'}. Crearle produrrebbe due offerte
          identiche dello stesso fornitore, che poi si confronterebbero fra loro.
        </p>
      )}

      {r.spariti > 0 && !applicato && (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-600">
          {r.spariti} {r.spariti === 1 ? 'prodotto non compare' : 'prodotti non compaiono'} più in
          questo listino: {r.spariti === 1 ? 'verrà disattivato' : 'verranno disattivati'}, mai
          cancellati — lo storico e gli ordini passati restano.
        </p>
      )}

      <div className="flex flex-wrap gap-3 border-t border-neutral-100 pt-4">
        {applicato ? (
          <Button
            variant="secondary"
            disabled={attesa}
            onClick={() =>
              chiama(
                endpointRevert,
                'Annullare questo import? Prezzi, offerte e prodotti creati tornano come prima.',
                'Import annullato',
              )
            }
          >
            Annulla l’import
          </Button>
        ) : (
          <Button
            disabled={attesa || bloccato}
            title={
              bloccato
                ? 'Prima vanno risolte tutte le righe e il listino deve essere in revisione.'
                : undefined
            }
            onClick={() =>
              chiama(
                endpointApply,
                `Applicare al catalogo? ${r.nuovi} nuovi, ${r.aggiornati} prezzi aggiornati, ${r.spariti} disattivati. Verrà salvata una fotografia per l’annullamento sicuro.`,
                'Import applicato al catalogo',
              )
            }
          >
            Applica al catalogo
          </Button>
        )}
        {!applicato && !statoNonApplicabile && (
          <Button
            variant="secondary"
            disabled={attesa}
            onClick={() =>
              chiama(
                endpointRematch,
                'Ricalcolare gli abbinamenti di questo listino contro il catalogo di adesso? Le righe già confermate a mano non si toccano.',
                'Abbinamenti ricalcolati',
              )
            }
          >
            Ricalcola gli abbinamenti
          </Button>
        )}
        <span className="self-center text-xs text-neutral-500">
          {applicato
            ? 'Si può annullare finché questo resta l’ultimo listino e i dati coinvolti non vengono usati o modificati.'
            : 'L’applicazione salva una fotografia dello stato precedente per un annullamento controllato.'}
        </span>
      </div>
    </section>
  );
}
