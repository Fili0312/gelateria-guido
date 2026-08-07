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

export default async function SuppliersPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const suppliers = await prismaForOrganization(user.organizationId).supplier.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      active: true,
      pricesIncludeVat: true,
      defaultVatRate: true,
      deliveryDays: true,
      _count: { select: { supplierProducts: true, priceLists: true } },
    },
  });

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="brand">Anteprima dati</Badge>
            <span className="text-xs text-neutral-400">CRUD nella Fase 4</span>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Fornitori
          </h1>
          <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
            Le anagrafiche già presenti nel database. La modifica completa arriva nella prossima
            fase.
          </p>
        </div>
        <div className="tabellare text-sm text-neutral-500">
          <strong className="text-neutral-900">{suppliers.length}</strong> fornitori totali
        </div>
      </header>

      <Table scrollLabel="Elenco dei fornitori">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Regime prezzi</TableHead>
            <TableHead>IVA</TableHead>
            <TableHead numeric>Prodotti</TableHead>
            <TableHead numeric>Listini</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.map((supplier) => (
            <TableRow key={supplier.id}>
              <TableCell className="font-bold text-neutral-950">{supplier.name}</TableCell>
              <TableCell>
                <Badge variant={supplier.active ? 'success' : 'neutral'} dot>
                  {supplier.active ? 'Attivo' : 'Inattivo'}
                </Badge>
              </TableCell>
              <TableCell>IVA {supplier.pricesIncludeVat ? 'inclusa' : 'esclusa'}</TableCell>
              <TableCell numeric>
                {supplier.defaultVatRate ? `${supplier.defaultVatRate.toString()}%` : '—'}
              </TableCell>
              <TableCell numeric>{supplier._count.supplierProducts}</TableCell>
              <TableCell numeric>{supplier._count.priceLists}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
