'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, useToast } from '@/components/ui';
import type { CodaAbbinamento, MatchingApiBody, RigaDaAbbinare } from '@/features/matching/dto';

/**
 * La coda «Da abbinare».
 *
 * Ogni riga mostra **perché** è stata proposta, non solo cosa: «sinonimo già
 * confermato» e «somiglianza 0,71» sono due informazioni diverse, e chi
 * rivede deve poter decidere in un colpo d'occhio quanto fidarsi.
 *
 * Le azioni sono quattro e stanno tutte sulla riga, senza aprire niente:
 * confermare deve costare un clic, perché sono decine di righe e un dialogo
 * per ognuna renderebbe la revisione un lavoro che nessuno fa.
 */

export function MatchingQueue({
  iniziale,
  endpoint,
  hrefPrecedente,
  hrefSuccessiva,
}: {
  iniziale: CodaAbbinamento;
  endpoint: string;
  hrefPrecedente: string | null;
  hrefSuccessiva: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState<string | null>(null);
  const [fatte, setFatte] = useState<Set<string>>(new Set());

  async function decidi(riga: RigaDaAbbinare, corpo: Record<string, unknown>, messaggio: string) {
    setAttesa(riga.id);
    try {
      const risposta = await fetch(`${endpoint}/${riga.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo),
      });
      const esito = (await risposta.json().catch(() => null)) as MatchingApiBody<unknown> | null;
      if (!risposta.ok || !esito?.ok) {
        toast({
          title: 'Non è stato possibile registrare la decisione',
          description: esito && !esito.ok ? esito.error : undefined,
          tone: 'error',
        });
        return;
      }
      // La riga sparisce subito dall'elenco, senza ricaricare la pagina: chi
      // rivede sta scorrendo, e un salto di scorrimento a ogni clic renderebbe
      // il lavoro insopportabile.
      setFatte((precedenti) => new Set(precedenti).add(riga.id));
      toast({ title: messaggio, description: riga.descrizione.slice(0, 60), tone: 'success' });
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(null);
    }
  }

  const rimaste = iniziale.items.filter((r) => !fatte.has(r.id));

  if (iniziale.totale === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
        <h2 className="text-lg font-black text-neutral-950">Niente da decidere</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-500">
          Nessuna riga è rimasta in dubbio. Le righe che l’app ha saputo abbinare da sola, e quelle
          che diventeranno prodotti nuovi, si vedono dalla scheda del listino.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fatte.size > 0 && (
        <p className="text-sm text-neutral-500">
          {fatte.size} {fatte.size === 1 ? 'riga decisa' : 'righe decise'}.{' '}
          <button
            type="button"
            className="text-brand-700 underline"
            onClick={() => router.refresh()}
          >
            Ricarica per vedere il resto
          </button>
        </p>
      )}

      <ul className="space-y-3">
        {rimaste.map((riga) => (
          <li
            key={riga.id}
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
            aria-busy={attesa === riga.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-neutral-950">{riga.descrizione}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {riga.fornitore} · {riga.listino} · p{riga.pagina}
                  {riga.codice && ` · cod. ${riga.codice}`} · {riga.formato}
                  {riga.prezzoNetto && ` · ${riga.prezzoNetto} €`}
                </p>
              </div>
              <Badge variant={riga.stato === 'PENDING' ? 'warning' : 'neutral'}>
                {riga.stato === 'PENDING' ? 'da decidere' : riga.stato.toLowerCase()}
              </Badge>
            </div>

            {riga.motivo && (
              <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600">
                {riga.motivo}
              </p>
            )}

            {riga.problemi.length > 0 && (
              <ul className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-900">
                {riga.problemi.map((problema) => (
                  <li key={problema}>{problema}</li>
                ))}
              </ul>
            )}

            {!riga.giaRivista && riga.candidati.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {riga.candidati.map((candidato) => (
                  <li
                    key={candidato.productId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-neutral-900">
                        {candidato.nome}
                      </span>
                      <span className="text-xs text-neutral-500">
                        somiglianza {candidato.punteggio}
                        {candidato.via === 'alias' && ' · sinonimo già confermato'}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={attesa !== null}
                        onClick={() =>
                          decidi(
                            riga,
                            { tipo: 'conferma', productId: candidato.productId },
                            'Abbinato, e il sinonimo è stato imparato',
                          )
                        }
                      >
                        È questo
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={attesa !== null}
                        onClick={() =>
                          decidi(
                            riga,
                            { tipo: 'rifiuta', productId: candidato.productId },
                            'Segnato come diverso: non verrà più riproposto',
                          )
                        }
                      >
                        Non è questo
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : !riga.giaRivista ? (
              <p className="mt-3 text-sm text-neutral-500">
                Nessun prodotto simile in catalogo con questo formato.
              </p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-amber-800">
                La decisione precedente resta registrata, ma questa riga blocca ancora il listino.
                Puoi escluderla esplicitamente qui sotto.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
              {!riga.giaRivista && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={attesa !== null}
                  onClick={() => decidi(riga, { tipo: 'nuovo' }, 'Segnato come prodotto nuovo')}
                >
                  È un prodotto nuovo
                </Button>
              )}
              {(!riga.giaRivista || riga.bloccaImport) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={attesa !== null}
                  onClick={() => decidi(riga, { tipo: 'ignora' }, 'Riga ignorata')}
                >
                  {riga.giaRivista ? 'Escludi e sblocca il listino' : 'Ignora questa riga'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {iniziale.pagine > 1 && (
        <nav
          aria-label="Pagine della coda di abbinamento"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm"
        >
          <span className="text-neutral-600">
            Pagina {iniziale.paginaCorrente} di {iniziale.pagine} · {iniziale.totale} righe
          </span>
          <span className="flex items-center gap-2">
            {hrefPrecedente ? (
              <Link
                href={hrefPrecedente}
                className="min-h-tap rounded-lg border border-neutral-300 px-3 py-2 font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                ← Precedente
              </Link>
            ) : (
              <span className="min-h-tap rounded-lg border border-neutral-200 px-3 py-2 text-neutral-400">
                ← Precedente
              </span>
            )}
            {hrefSuccessiva ? (
              <Link
                href={hrefSuccessiva}
                className="min-h-tap rounded-lg border border-neutral-300 px-3 py-2 font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                Successiva →
              </Link>
            ) : (
              <span className="min-h-tap rounded-lg border border-neutral-200 px-3 py-2 text-neutral-400">
                Successiva →
              </span>
            )}
          </span>
        </nav>
      )}
    </div>
  );
}
