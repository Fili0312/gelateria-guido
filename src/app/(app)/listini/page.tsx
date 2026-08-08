import Link from 'next/link';
import { UploadDialog } from '@/components/price-lists/upload-dialog';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
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

const STATO: Record<string, { etichetta: string; tono: 'brand' | 'success' | 'danger' | 'neutral' }> = {
  QUEUED: { etichetta: 'in coda', tono: 'brand' },
  EXTRACTING: { etichetta: 'lettura', tono: 'brand' },
  SEGMENTING: { etichetta: 'righe', tono: 'brand' },
  DONE: { etichetta: 'pronto', tono: 'success' },
  FAILED: { etichetta: 'errore', tono: 'danger' },
  CANCELLED: { etichetta: 'annullato', tono: 'neutral' },
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
            Ogni listino appartiene a un fornitore e ha un <strong>nome</strong> che dice cosa copre.
            È il nome che permette di confrontare il listino nuovo con il precedente della stessa
            copertura, invece che con tutto il catalogo del fornitore.
          </p>
        </div>
        <UploadDialog
          fornitori={fornitori.items.map((f) => ({ id: f.id, name: f.name }))}
          endpoint={withBasePath('/api/price-lists')}
          endpointCoperture={withBasePath('/api/price-lists/coperture')}
        />
      </header>

      {risultato.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
          <h2 className="text-lg font-black text-neutral-950">Nessun listino caricato</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-500">
            {fornitori.items.length === 0
              ? 'Prima serve almeno un fornitore in anagrafica: è lui a determinare dove finiranno i prodotti importati.'
              : 'Carica il PDF di un fornitore per vedere le righe che l’app riesce a estrarne. Nessun prezzo viene toccato: in questa fase si legge soltanto.'}
          </p>
          {fornitori.items.length === 0 && (
            <Link href="/fornitori/nuovo" className="text-brand-700 mt-3 inline-block text-sm underline">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {risultato.items.map((listino) => {
                const fase = listino.lavorazione?.fase ?? 'QUEUED';
                const stato = STATO[fase] ?? { etichetta: fase.toLowerCase(), tono: 'neutral' as const };
                return (
                  <TableRow key={listino.id}>
                    <TableCell>
                      <Link
                        href={`/listini/${listino.id}`}
                        className="focus-visible:ring-brand-600 font-semibold text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
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
