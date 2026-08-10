import Link from 'next/link';
import { UploadDialog } from '@/components/price-lists/upload-dialog';
import {
  Badge,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { priceListListQuerySchema } from '@/features/price-lists/schema';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { priceListsRepository } from '@/server/repositories/price-lists';
import { suppliersRepository } from '@/server/repositories/suppliers';

export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const STATO: Record<
  string,
  { etichetta: string; tono: 'brand' | 'success' | 'danger' | 'neutral' }
> = {
  QUEUED: { etichetta: 'in coda', tono: 'brand' },
  EXTRACTING: { etichetta: 'lettura', tono: 'brand' },
  SEGMENTING: { etichetta: 'righe', tono: 'brand' },
  DONE: { etichetta: 'pronto', tono: 'success' },
  FAILED: { etichetta: 'errore', tono: 'danger' },
  CANCELLED: { etichetta: 'annullato', tono: 'neutral' },
};

const STATO_LISTINO: Record<
  string,
  { etichetta: string; tono: 'brand' | 'success' | 'danger' | 'neutral' }
> = {
  REVIEW: { etichetta: 'da rivedere', tono: 'brand' },
  APPLYING: { etichetta: 'applicazione', tono: 'brand' },
  APPLIED: { etichetta: 'applicato', tono: 'success' },
  FAILED: { etichetta: 'errore', tono: 'danger' },
  DISCARDED: { etichetta: 'scartato', tono: 'neutral' },
  REVERTED: { etichetta: 'annullato', tono: 'neutral' },
};

export default async function PriceListsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const grezzi = await searchParams;
  const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const analizzato = priceListListQuerySchema.safeParse({
    q: primo(grezzi.q),
    supplierId: primo(grezzi.supplierId),
    status: primo(grezzi.status),
  });
  const filtri = analizzato.success ? analizzato.data : priceListListQuerySchema.parse({});

  const [risultato, fornitori] = await Promise.all([
    priceListsRepository(user.organizationId).list(filtri),
    suppliersRepository(user.organizationId).list({ q: '', status: 'active', sort: 'name-asc' }),
  ]);
  const conFiltri = filtri.q !== '' || filtri.supplierId !== '' || filtri.status !== 'all';

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Badge variant="brand" dot>
            Importazione
          </Badge>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Listini
          </h1>
          <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
            Ogni listino appartiene a un fornitore e ha un <strong>nome</strong> che dice cosa
            copre. È il nome che permette di confrontare il listino nuovo con il precedente della
            stessa copertura, invece che con tutto il catalogo del fornitore.
          </p>
        </div>
        <UploadDialog
          fornitori={fornitori.items.map((f) => ({ id: f.id, name: f.name }))}
          endpoint={withBasePath('/api/price-lists')}
          endpointCoperture={withBasePath('/api/price-lists/coperture')}
        />
      </header>

      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
        <Input
          name="q"
          label="Cerca listino"
          defaultValue={filtri.q}
          placeholder="Copertura o nome del file"
        />
        <Select name="supplierId" label="Fornitore" defaultValue={filtri.supplierId}>
          <option value="">Tutti</option>
          {fornitori.items.map((fornitore) => (
            <option key={fornitore.id} value={fornitore.id}>
              {fornitore.name}
            </option>
          ))}
        </Select>
        <Select name="status" label="Stato" defaultValue={filtri.status}>
          <option value="all">Tutti</option>
          <option value="in-corso">In lavorazione</option>
          <option value="pronti">Pronti</option>
          <option value="falliti">Con errore</option>
        </Select>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="focus-visible:ring-brand-600 min-h-11 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
          >
            Filtra
          </button>
          {conFiltri && (
            <Link href="/listini" className="text-sm text-neutral-500 hover:underline">
              Azzera
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-neutral-600">
        <strong className="text-neutral-950">{risultato.totale}</strong>{' '}
        {risultato.totale === 1 ? 'listino' : 'listini'}
      </p>

      {risultato.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
          <h2 className="text-lg font-black text-neutral-950">
            {conFiltri ? 'Nessun listino corrisponde ai filtri' : 'Nessun listino caricato'}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-500">
            {conFiltri
              ? 'Prova a cambiare o azzerare i filtri.'
              : fornitori.items.length === 0
                ? 'Prima serve almeno un fornitore in anagrafica: è lui a determinare dove finiranno i prodotti importati.'
                : 'Carica il PDF di un fornitore per vedere le righe che l’app riesce a estrarne. Nessun prezzo viene toccato: in questa fase si legge soltanto.'}
          </p>
          {fornitori.items.length === 0 && (
            <Link
              href="/fornitori/nuovo"
              className="text-brand-700 mt-3 inline-block text-sm underline"
            >
              Aggiungi un fornitore
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listino</TableHead>
                <TableHead>Fornitore</TableHead>
                <TableHead>Caricato</TableHead>
                <TableHead>Righe</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Apri</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {risultato.items.map((listino) => {
                const fase = listino.lavorazione?.fase ?? 'QUEUED';
                const stato = STATO_LISTINO[listino.status] ??
                  STATO[fase] ?? { etichetta: fase.toLowerCase(), tono: 'neutral' as const };
                return (
                  <TableRow key={listino.id} className="hover:bg-neutral-50">
                    <TableCell>
                      {/* Il nome deve *sembrare* un link, non solo esserlo: in
                          nero e senza sottolineatura nessuno lo clicca, e le
                          righe estratte restano invisibili anche se ci sono
                          tutte. E' successo al primo collaudo vero. */}
                      <Link
                        href={`/listini/${listino.id}`}
                        className="text-brand-700 focus-visible:ring-brand-600 font-semibold underline decoration-brand-300 underline-offset-2 hover:decoration-brand-600 focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {listino.scopeLabel}
                      </Link>
                      <span className="block max-w-xs truncate text-xs text-neutral-400">
                        {listino.originalFilename}
                      </span>
                    </TableCell>
                    <TableCell>{listino.supplierName}</TableCell>
                    <TableCell className="tabellare text-sm text-neutral-600">
                      {DATA.format(new Date(listino.uploadedAt))}
                    </TableCell>
                    <TableCell className="tabellare">
                      {listino.prodotti > 0 ? `${listino.prodotti} prodotti` : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={stato.tono}>{stato.etichetta}</Badge>
                      {listino.lavorazione?.interrotto && (
                        <Badge variant="warning" className="ml-1">
                          interrotta
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/listini/${listino.id}`}
                        className="text-brand-700 focus-visible:ring-brand-600 min-h-tap inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold whitespace-nowrap hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
                      >
                        Vedi le righe →
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
