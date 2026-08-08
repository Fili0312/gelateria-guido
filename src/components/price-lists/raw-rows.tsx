'use client';

import { useState } from 'react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import type { CampiRiga, RigheListino } from '@/features/price-lists/dto';

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
  const [grezzo, setGrezzo] = useState(false);
  const mostrate = righe.items.filter((r) => r.tipo === vista);
  const interpretate = righe.items.some((r) => r.campi);

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

      {interpretate && vista === 'prodotto' && (
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={grezzo}
            onChange={(e) => setGrezzo(e.target.checked)}
            className="size-4 rounded border-neutral-300"
          />
          Mostra le celle grezze invece dei campi interpretati
        </label>
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
                {interpretate && vista === 'prodotto' && !grezzo ? (
                  <TableRow>
                    <TableHead className="w-24">Codice</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead className="w-20">Formato</TableHead>
                    <TableHead className="w-16">U.M.</TableHead>
                    <TableHead className="w-24 text-right">Listino</TableHead>
                    <TableHead className="w-24">Sconti</TableHead>
                    <TableHead className="w-24 text-right">Netto</TableHead>
                    <TableHead className="w-14 text-right">IVA</TableHead>
                    <TableHead className="w-8">
                      <span className="sr-only">Segnalazioni</span>
                    </TableHead>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableHead className="w-24">Pagina</TableHead>
                    <TableHead>Celle individuate</TableHead>
                    <TableHead className="w-28">A capo</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {interpretate && vista === 'prodotto' && !grezzo
                  ? mostrate.map((riga) => <RigaInterpretata key={riga.id} campi={riga.campi} />)
                  : mostrate.map((riga) => (
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

/**
 * Una riga con i campi già interpretati.
 *
 * Le segnalazioni non sono nascoste in un tooltip: una pastiglia colorata sta
 * in fondo alla riga, e il testo si legge passandoci sopra. Un errore che si
 * vede solo cercandolo è un errore che nessuno vede.
 */
function RigaInterpretata({ campi }: { campi: CampiRiga | null }) {
  if (!campi) {
    return (
      <TableRow>
        <TableCell colSpan={9} className="text-sm text-neutral-400">
          Riga non interpretata.
        </TableCell>
      </TableRow>
    );
  }

  const errori = campi.segnalazioni.filter((s) => s.gravita === 'errore');
  const avvisi = campi.segnalazioni.filter((s) => s.gravita === 'avviso');
  const formato =
    campi.unitSize && campi.unitOfMeasure && campi.unitOfMeasure !== 'PIECE'
      ? `${campi.unitSize} ${campi.unitOfMeasure.toLowerCase()}`
      : '—';

  return (
    <TableRow className={errori.length ? 'bg-red-50/50' : undefined}>
      <TableCell className="tabellare text-xs text-neutral-600">{campi.codice ?? '—'}</TableCell>
      <TableCell className="text-sm text-neutral-900">{campi.descrizione ?? '—'}</TableCell>
      <TableCell className="tabellare text-xs text-neutral-600">
        {formato}
        {campi.packQuantity > 1 && (
          <span className="block text-neutral-400">×{campi.packQuantity}</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-neutral-600">{campi.unitaDiVendita ?? '—'}</TableCell>
      <TableCell className="tabellare text-right text-sm">{campi.prezzoListino ?? '—'}</TableCell>
      <TableCell className="text-xs text-neutral-600">
        {campi.sconti.length > 0 ? campi.sconti.map((s) => `−${s}%`).join(' ') : '—'}
      </TableCell>
      <TableCell className="tabellare text-right text-sm font-semibold text-neutral-950">
        {campi.prezzoNetto ?? '—'}
      </TableCell>
      <TableCell className="tabellare text-right text-xs text-neutral-500">
        {campi.iva ? `${campi.iva}%` : '—'}
      </TableCell>
      <TableCell>
        {errori.length > 0 ? (
          <Badge variant="danger" title={errori.map((s) => s.messaggio).join('\n')}>
            !
          </Badge>
        ) : avvisi.length > 0 ? (
          <Badge variant="warning" title={avvisi.map((s) => s.messaggio).join('\n')}>
            ?
          </Badge>
        ) : (
          <span className="text-neutral-300">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
