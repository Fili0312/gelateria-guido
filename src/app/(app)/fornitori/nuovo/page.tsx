import Link from 'next/link';
import { SupplierForm } from '@/components/suppliers/supplier-form';
import { Badge } from '@/components/ui';
import { withBasePath } from '@/server/base-path';

export default function NewSupplierPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header>
        <Link href="/fornitori" className="text-brand-700 text-sm font-bold hover:underline">
          ← Torna ai fornitori
        </Link>
        <div className="mt-4">
          <Badge variant="brand">Nuova anagrafica</Badge>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Nuovo fornitore
          </h1>
          <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
            Inserisci ora anche condizioni ed email ordini: eviterai di ricompilare l’anagrafica
            quando arriveranno listini e invii automatici.
          </p>
        </div>
      </header>

      <SupplierForm
        mode="create"
        endpoint={withBasePath('/api/suppliers')}
        cancelHref="/fornitori"
      />
    </div>
  );
}
