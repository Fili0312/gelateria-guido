import Link from 'next/link';
import { SupplierList } from '@/components/suppliers/supplier-list';
import { Badge, Button, Input, Select } from '@/components/ui';
import { supplierListQuerySchema } from '@/features/suppliers/schema';
import { getCurrentUser } from '@/server/auth';
import { suppliersRepository } from '@/server/repositories/suppliers';

export const dynamic = 'force-dynamic';

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const query = await searchParams;
  const parsed = supplierListQuerySchema.safeParse({
    q: firstValue(query.q),
    status: firstValue(query.status),
    sort: firstValue(query.sort),
  });
  const filters = parsed.success ? parsed.data : supplierListQuerySchema.parse({});
  const result = await suppliersRepository(user.organizationId).list(filters);
  const filtering = filters.q !== '' || filters.status !== 'all';

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Badge variant="brand" dot>
            Anagrafiche operative
          </Badge>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Fornitori
          </h1>
          <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
            Contatti, condizioni di acquisto e indirizzi per gli ordini in un unico posto.
          </p>
        </div>
        <Link
          href="/fornitori/nuovo"
          className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
        >
          Nuovo fornitore
        </Link>
      </header>

      <section aria-label="Riepilogo fornitori" className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Totali</p>
          <p className="tabellare mt-1 text-2xl font-black text-neutral-950">{result.total}</p>
        </article>
        <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Attivi</p>
          <p className="tabellare mt-1 text-2xl font-black text-emerald-700">{result.active}</p>
        </article>
        <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Inattivi</p>
          <p className="tabellare mt-1 text-2xl font-black text-neutral-600">{result.inactive}</p>
        </article>
      </section>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(14rem,1fr)_12rem_13rem_auto] md:items-end"
      >
        <Input
          name="q"
          label="Cerca"
          defaultValue={filters.q}
          placeholder="Nome, codice, contatto o email"
          maxLength={100}
        />
        <Select name="status" label="Stato" defaultValue={filters.status}>
          <option value="all">Tutti</option>
          <option value="active">Solo attivi</option>
          <option value="inactive">Solo inattivi</option>
        </Select>
        <Select name="sort" label="Ordina" defaultValue={filters.sort}>
          <option value="name-asc">Nome A–Z</option>
          <option value="name-desc">Nome Z–A</option>
          <option value="updated-desc">Modificati di recente</option>
          <option value="updated-asc">Meno recenti</option>
        </Select>
        <div className="flex gap-2">
          <Button type="submit" fullWidth>
            Applica
          </Button>
          {filtering && (
            <Link
              href="/fornitori"
              className="focus-visible:ring-brand-600 inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none"
            >
              Azzera
            </Link>
          )}
        </div>
      </form>

      <SupplierList items={result.items} hasFilters={filtering} />

      {result.items.length > 0 && (
        <p className="text-center text-xs text-neutral-500">
          {result.items.length === result.total && !filtering
            ? `${result.total} fornitori`
            : `${result.items.length} risultati · ${result.total} fornitori complessivi`}
        </p>
      )}
    </div>
  );
}
