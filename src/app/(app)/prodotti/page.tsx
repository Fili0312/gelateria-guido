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

const UNIT_LABEL: Record<string, string> = {
  LITER: 'L',
  CENTILITER: 'cl',
  MILLILITER: 'ml',
  KILOGRAM: 'kg',
  GRAM: 'g',
  PIECE: 'pz',
};

export default async function ProductsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const db = prismaForOrganization(user.organizationId);
  const [products, total] = await Promise.all([
    db.product.findMany({
      orderBy: { normalizedName: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        category: true,
        unitSize: true,
        unitOfMeasure: true,
        _count: { select: { supplierProducts: true } },
      },
    }),
    db.product.count(),
  ]);

  return (
    <div className="space-y-7">
      <header>
        <div className="flex items-center gap-2">
          <Badge variant="brand">Anteprima dati</Badge>
          <span className="text-xs text-neutral-400">Ricerca e schede nella Fase 5</span>
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          Prodotti
        </h1>
        <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
          Il catalogo canonico: lo stesso articolo può avere più offerte e confezioni fornitore.
        </p>
      </header>

      <Table scrollLabel="Catalogo prodotti">
        <TableHeader>
          <TableRow>
            <TableHead>Prodotto</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Formato</TableHead>
            <TableHead numeric>Offerte</TableHead>
            <TableHead>Stato</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="max-w-xl font-bold text-neutral-950">{product.name}</TableCell>
              <TableCell className="text-neutral-500">{product.category ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap">
                {product.unitSize.toString()}{' '}
                {UNIT_LABEL[product.unitOfMeasure] ?? product.unitOfMeasure}
              </TableCell>
              <TableCell numeric>{product._count.supplierProducts}</TableCell>
              <TableCell>
                <Badge variant="brand">Canonico</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {total > products.length && (
        <p className="text-center text-xs text-neutral-500">
          Mostrati i primi {products.length} prodotti su {total}.
        </p>
      )}
    </div>
  );
}
