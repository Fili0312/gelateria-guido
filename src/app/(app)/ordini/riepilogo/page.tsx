import Link from 'next/link';
import { OrderSummary } from '@/components/orders/order-summary';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { ordersRepository } from '@/server/repositories/orders';

export const dynamic = 'force-dynamic';

/**
 * L'ultima schermata prima che l'ordine diventi un documento.
 *
 * Sta su una pagina sua e non dentro un pannello che si apre: confermare è la
 * cosa più difficile da disfare di tutta l'app, e merita che ci si arrivi
 * apposta invece di trovarcisi.
 */
export default async function RiepilogoPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const riepilogo = await ordersRepository(user.organizationId).riepilogo(user.id);

  return (
    <div className="space-y-5">
      <header>
        <Link href="/ordini" className="text-sm text-neutral-500 hover:underline">
          ← Ordine
        </Link>
        <Badge variant="brand" dot className="mt-2 block w-fit">
          Prima di confermare
        </Badge>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          Riepilogo
        </h1>
        <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
          Quello che stai per ordinare, diviso per fornitore. Le segnalazioni qui sotto non bloccano
          niente: sono le cose che vale la pena guardare prima.
        </p>
      </header>

      <OrderSummary riepilogo={riepilogo} endpointOrdine={withBasePath('/api/orders/current')} />
    </div>
  );
}
