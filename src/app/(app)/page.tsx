import Link from 'next/link';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { NewListDialog } from '@/components/new-list-dialog';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { prismaForOrganization } from '@/server/db';

export const dynamic = 'force-dynamic';

function StatCard({
  label,
  value,
  note,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: number;
  note: string;
  icon: AppIconName;
  tone?: 'brand' | 'amber' | 'neutral';
}) {
  const colors = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    neutral: 'bg-neutral-100 text-neutral-600',
  };

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-900/[0.025]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-500">{label}</p>
          <p className="tabellare mt-2 text-3xl font-black tracking-[-0.04em] text-neutral-950">
            {value}
          </p>
        </div>
        <span className={`grid h-11 w-11 place-items-center rounded-2xl ${colors[tone]}`}>
          <AppIcon name={icon} className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-neutral-500">{note}</p>
    </article>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const db = prismaForOrganization(user.organizationId);
  const [
    fornitori,
    prodotti,
    categorie,
    daClassificare,
    offertePrezzate,
    confezioniIncerte,
    ultimiFornitori,
  ] = await Promise.all([
    db.supplier.count({ where: { active: true } }),
    db.product.count(),
    db.category.count({ where: { active: true } }),
    db.product.count({ where: { categoryId: null } }),
    db.supplierProduct.count({ where: { active: true, currentPriceId: { not: null } } }),
    db.supplierProduct.count({ where: { active: true, packQuantityConfirmed: false } }),
    db.supplier.findMany({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        pricesIncludeVat: true,
        defaultVatRate: true,
        updatedAt: true,
      },
    }),
  ]);

  const formatter = new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand" dot>
              Fase 6 completata
            </Badge>
            <span className="text-xs font-medium text-neutral-400">Storico prezzi operativo</span>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Buongiorno, {user.name}
          </h1>
          <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
            Fornitori, catalogo e storico prezzi sono operativi. Qui trovi lo stato dei dati e il
            punto esatto da cui continuare il lavoro.
          </p>
        </div>
        <NewListDialog />
      </header>

      <section aria-labelledby="riepilogo-title">
        <h2 id="riepilogo-title" className="sr-only">
          Riepilogo
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            label="Fornitori attivi"
            value={fornitori}
            note="Anagrafiche operative"
            icon="suppliers"
          />
          <StatCard
            label="Prodotti"
            value={prodotti}
            note="Catalogo canonico seedato"
            icon="products"
          />
          <StatCard
            label="Categorie attive"
            value={categorie}
            note="Raggruppate per reparto"
            icon="lists"
          />
          <StatCard
            label="Da classificare"
            value={daClassificare}
            note="Prodotti ancora senza categoria"
            icon="warning"
            tone={daClassificare > 0 ? 'amber' : 'neutral'}
          />
          <StatCard
            label="Offerte prezzate"
            value={offertePrezzate}
            note="Con un prezzo corrente"
            icon="sparkles"
          />
          <StatCard
            label="Confezioni da verificare"
            value={confezioniIncerte}
            note="Escluse dai confronti finché incerte"
            icon="warning"
            tone="amber"
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-900/[0.025]">
          <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-bold text-neutral-950">Fornitori recenti</h2>
              <p className="mt-0.5 text-xs text-neutral-500">Dati reali del database</p>
            </div>
            <Link
              href="/fornitori"
              className="text-brand-700 hover:text-brand-900 inline-flex min-h-11 items-center gap-1 text-sm font-bold"
            >
              Vedi tutti
              <AppIcon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
          <Table
            containerClassName="border-0 rounded-none shadow-none"
            scrollLabel="Elenco fornitori recenti"
          >
            <TableHeader>
              <TableRow>
                <TableHead>Fornitore</TableHead>
                <TableHead>Prezzi</TableHead>
                <TableHead>IVA predefinita</TableHead>
                <TableHead>Aggiornato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ultimiFornitori.map((fornitore) => (
                <TableRow key={fornitore.id}>
                  <TableCell className="font-bold text-neutral-900">{fornitore.name}</TableCell>
                  <TableCell>
                    <Badge variant="neutral">
                      IVA {fornitore.pricesIncludeVat ? 'inclusa' : 'esclusa'}
                    </Badge>
                  </TableCell>
                  <TableCell numeric>
                    {fornitore.defaultVatRate ? `${fornitore.defaultVatRate.toString()}%` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-neutral-500">
                    {formatter.format(fornitore.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <aside className="bg-brand-900 relative overflow-hidden rounded-2xl p-6 text-white shadow-lg shadow-neutral-900/10">
          <div
            aria-hidden
            className="bg-brand-500/25 absolute -right-16 -bottom-20 h-56 w-56 rounded-full blur-2xl"
          />
          <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-lime-300">
            <AppIcon name="sparkles" className="h-5 w-5" />
          </span>
          <div className="relative mt-6">
            <Badge variant="brand">Prossima: Fase 7</Badge>
            <h2 className="mt-3 text-2xl font-black tracking-tight">Estrazione dei listini PDF</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Caricamento per fornitore e listino, estrazione deterministica delle righe e anteprima
              verificabile prima di importare.
            </p>
            <Link
              href="/prodotti"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-neutral-950 transition-colors hover:bg-lime-50"
            >
              Apri il catalogo
              <AppIcon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
