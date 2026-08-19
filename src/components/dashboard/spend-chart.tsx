import type { PuntoSpesa } from '@/server/repositories/dashboard';
import { euro } from '@/features/products/format';

/**
 * La spesa degli ultimi dodici mesi.
 *
 * SVG scritto a mano, come il grafico dello storico prezzi: una libreria di
 * grafici per dodici barre pesa più del resto della pagina, e questo disegno
 * arriva già fatto dal server — niente attesa, niente salto di layout.
 *
 * I mesi senza ordini restano nell'asse. Un buco è un dato: comprimere solo i
 * mesi pieni farebbe sembrare continua una spesa che non lo è.
 */

const ALTEZZA = 132;

export function SpendChart({ punti }: { punti: PuntoSpesa[] }) {
  const massimo = Math.max(...punti.map((p) => Number(p.netto)), 1);
  const totale = punti.reduce((n, p) => n + Number(p.netto), 0);

  if (totale === 0) {
    return (
      <div className="grid h-[132px] place-items-center rounded-xl border border-dashed border-neutral-300 px-4 text-center">
        <p className="text-sm leading-6 text-neutral-500">
          Nessun ordine confermato. La spesa mensile comparirà a partire dal primo ordine.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        // `items-stretch` e non `items-end`: le colonne devono essere alte
        // quanto il contenitore, altrimenti l'altezza in percentuale delle
        // barre si risolve contro un'altezza automatica e viene **zero**. Il
        // grafico resta lì, con gli assi e le etichette al posto giusto, e
        // non disegna niente — sembra «nessun dato» invece di un difetto.
        // A mettere le barre in basso ci pensa `justify-end` di ogni colonna.
        className="flex items-stretch gap-1"
        style={{ height: ALTEZZA }}
        role="img"
        aria-label={`Spesa degli ultimi ${punti.length} mesi, totale ${euro(totale)}`}
      >
        {punti.map((p) => {
          const quota = Number(p.netto) / massimo;
          return (
            <div key={p.chiave} className="group relative flex flex-1 flex-col justify-end">
              <div
                className={`rounded-t transition-colors ${
                  Number(p.netto) > 0 ? 'bg-brand-500 group-hover:bg-brand-600' : 'bg-neutral-200'
                }`}
                style={{ height: `${Math.max(quota * 100, Number(p.netto) > 0 ? 4 : 2)}%` }}
              />
              {/* Il valore compare all'hover: dodici etichette sempre accese
                  rendono illeggibile un grafico alto centotrenta pixel. */}
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block">
                {euro(p.netto)} · {p.ordini} {p.ordini === 1 ? 'ordine' : 'ordini'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {punti.map((p) => (
          <span key={p.chiave} className="flex-1 text-center text-xs text-neutral-400">
            {p.etichetta}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * La ripartizione per reparto, a barra unica.
 *
 * Una torta con sei fette da leggere di sbieco dice meno di una barra in cui
 * le proporzioni si confrontano di fianco. E funziona anche in bianco e nero,
 * perché ogni fetta porta la sua etichetta sotto.
 */
export function DepartmentSplit({
  reparti,
  daBozza,
}: {
  reparti: {
    departmentId: string | null;
    nome: string;
    colore: string | null;
    netto: string;
    quota: number;
  }[];
  daBozza: boolean;
}) {
  if (reparti.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm leading-6 text-neutral-500">
        Nessun dato da ripartire: inserire articoli nell’ordine in corso o confermare il primo
        ordine.
      </p>
    );
  }

  const PREDEFINITI = ['#16a34a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

  return (
    <div>
      {daBozza && (
        <p className="mb-2 text-xs text-neutral-500">
          Dati dell’ordine in corso: non risultano ordini confermati.
        </p>
      )}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
        {reparti.map((r, i) => (
          <div
            key={r.departmentId ?? 'senza'}
            style={{
              width: `${r.quota}%`,
              backgroundColor: r.colore ?? PREDEFINITI[i % PREDEFINITI.length],
            }}
            title={`${r.nome}: ${euro(r.netto)}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {reparti.map((r, i) => (
          <li key={r.departmentId ?? 'senza'} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: r.colore ?? PREDEFINITI[i % PREDEFINITI.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-neutral-700">{r.nome}</span>
            <span className="tabellare text-xs text-neutral-500">{Math.round(r.quota)}%</span>
            <span className="tabellare w-20 text-right font-semibold text-neutral-900">
              {euro(r.netto)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
