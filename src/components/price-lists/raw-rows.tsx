'use client';

import { useState } from 'react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import type { RigheListino } from '@/features/price-lists/dto';

/**
 * Le righe grezze, come le ha lette il segmentatore.
 *
 * La schermata mostra di default i soli prodotti, ma il contatore delle righe
 * **non capite** è sempre in vista e cliccabile. È il numero che dice se
 * l'estrazione ha funzionato: mostrare solo ciò che il programma ha
 * riconosciuto darebbe sempre l'impressione che sia andata bene, e nasconde
 * proprio il caso che va guardato.
 *
 * Nessuna di queste righe è ancora un prodotto: qui si vede il testo
 * originale e le celle individuate, e si giudica. L'interpretazione dei campi
 * arriva nella Fase 8.
 */

type Vista = 'prodotto' | 'sezione' | 'ignota';

export function RawRows({ righe }: { righe: RigheListino }) {
  const [vista, setVista] = useState<Vista>('prodotto');
  const mostrate = righe.items.filter((r) => r.tipo === vista);

  const schede: { chiave: Vista; etichetta: string; valore: number; tono: 'brand' | 'neutral' | 'warning' }[] =
    [
      { chiave: 'prodotto', etichetta: 'Righe prodotto', valore: righe.prodotti, tono: 'brand' },
      { chiave: 'sezione', etichetta: 'Righe di sezione', valore: righe.sezioni, tono: 'neutral' },
      { chiave: 'ignota', etichetta: 'Non capite', valore: righe.ignote, tono: 'warning' },
    ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {schede.map((scheda) => (
          <button
            key={scheda.chiave}
            type="button"
            onClick={() => setVista(scheda.chiave)}
            aria-pressed={vista === scheda.chiave}
            className={`focus-visible:ring-brand-600 min-h-tap rounded-xl border px-4 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              vista === scheda.chiave
                ? 'border-brand-600 bg-brand-50'
                : 'border-neutral-200 bg-white hover:border-neutral-400'
            }`}
          >
            <span className="block text-xs text-neutral-500">{scheda.etichetta}</span>
            <span className="tabellare block text-xl font-black text-neutral-950">
              {scheda.valore}
            </span>
          </button>
        ))}
      </div>

      {vista === 'ignota' && righe.ignote > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
          Righe che il segmentatore non ha saputo classificare. Nei documenti veri sono quasi sempre
          intestazioni e blocchi di indirizzo della prima pagina — cioè cose che è giusto non
          importare. Se qui compaiono dei prodotti, l’estrazione va corretta prima di procedere.
        </p>
      )}

      {mostrate.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-10 text-center text-sm text-neutral-500">
          Nessuna riga di questo tipo.
        </p>
      ) : (
        <>
          {/* Su telefono la tabella diventa un elenco di schede. */}
          <ul className="space-y-2 lg:hidden">
            {mostrate.map((riga) => (
              <li
                key={riga.id}
                className="rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-sm"
              >
                <span className="text-xs text-neutral-400">
                  p{riga.pagina} · riga {riga.numero}
                </span>
                <p className="mt-1 break-words text-neutral-900">{riga.testo}</p>
                {riga.continuazioni.length > 0 && (
                  <p className="mt-1 text-xs text-neutral-500">
                    unita con {riga.continuazioni.length}{' '}
                    {riga.continuazioni.length === 1 ? 'riga a capo' : 'righe a capo'}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Pagina</TableHead>
                  <TableHead>Celle individuate</TableHead>
                  <TableHead className="w-28">A capo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mostrate.map((riga) => (
                  <TableRow key={riga.id}>
                    <TableCell className="tabellare text-xs text-neutral-500">
                      p{riga.pagina} · {riga.numero}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1.5">
                        {riga.celle.length === 0 ? (
                          <span className="text-sm text-neutral-500">{riga.testo}</span>
                        ) : (
                          riga.celle.map((cella, indice) => (
                            <span
                              key={`${riga.id}-${indice}`}
                              className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-xs text-neutral-800"
                              title={`colonna ${cella.colonna >= 0 ? cella.colonna : 'non riconosciuta'} · x ${cella.x}`}
                            >
                              {cella.testo}
                            </span>
                          ))
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      {riga.continuazioni.length > 0 ? (
                        <Badge variant="neutral">{riga.continuazioni.length}</Badge>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {righe.totale > mostrate.length && vista === 'prodotto' && (
            <p className="text-xs text-neutral-500">
              Mostrate le prime {mostrate.length} righe di {righe.totale}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
