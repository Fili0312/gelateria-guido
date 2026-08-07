import { Badge } from '@/components/ui';
import { SupplierDetailShell } from '@/components/suppliers/supplier-detail-shell';
import { formatDecimalIt, formatEuro } from '@/features/suppliers/format';
import { withBasePath } from '@/server/base-path';
import { loadSupplier } from './supplier-page';

function DetailItem({
  term,
  children,
  wide = false,
}: {
  term: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{term}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 font-semibold break-words text-neutral-900">
        {children}
      </dd>
    </div>
  );
}

function DetailCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="border-b border-neutral-100 px-5 py-4">
        <h2 className="font-black tracking-tight text-neutral-950">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-neutral-500">{description}</p>
      </header>
      <dl className="grid gap-5 p-5 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await loadSupplier(id);

  return (
    <SupplierDetailShell
      supplier={supplier}
      activeTab="anagrafica"
      endpoint={withBasePath(`/api/suppliers/${supplier.id}`)}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <DetailCard
          title="Identità e contatti"
          description="Riferimenti commerciali e amministrativi del fornitore."
        >
          <DetailItem term="Codice interno">{supplier.code ?? 'Non indicato'}</DetailItem>
          <DetailItem term="Partita IVA">{supplier.vatNumber ?? 'Non indicata'}</DetailItem>
          <DetailItem term="Referente">{supplier.contactName ?? 'Non indicato'}</DetailItem>
          <DetailItem term="Telefono">
            {supplier.phone ? (
              <a className="text-brand-700 hover:underline" href={`tel:${supplier.phone}`}>
                {supplier.phone}
              </a>
            ) : (
              'Non indicato'
            )}
          </DetailItem>
          <DetailItem term="Email commerciale" wide>
            {supplier.email ? (
              <a className="text-brand-700 hover:underline" href={`mailto:${supplier.email}`}>
                {supplier.email}
              </a>
            ) : (
              'Non indicata'
            )}
          </DetailItem>
          <DetailItem term="Indirizzo" wide>
            {supplier.address ?? 'Non indicato'}
          </DetailItem>
        </DetailCard>

        <DetailCard
          title="Condizioni di acquisto"
          description="Regole usate per rendere confrontabili listini e ordini."
        >
          <DetailItem term="Prezzi del listino">
            {supplier.pricesIncludeVat ? 'IVA inclusa' : 'IVA esclusa'}
          </DetailItem>
          <DetailItem term="IVA predefinita">
            {formatDecimalIt(supplier.defaultVatRate, '%')}
          </DetailItem>
          <DetailItem term="Minimo d’ordine">{formatEuro(supplier.minOrderValue)}</DetailItem>
          <DetailItem term="Giorni di consegna">
            {supplier.deliveryDays ?? 'Non indicati'}
          </DetailItem>
        </DetailCard>

        <DetailCard
          title="Invio degli ordini"
          description="Impostazioni già pronte per l’automazione della Fase 17."
        >
          <DetailItem term="Invio via email">
            <Badge variant={supplier.sendOrdersByEmail ? 'success' : 'neutral'} dot>
              {supplier.sendOrdersByEmail ? 'Abilitato' : 'Non abilitato'}
            </Badge>
          </DetailItem>
          <DetailItem term="Email ufficio ordini">
            {supplier.orderEmail ? (
              <a className="text-brand-700 hover:underline" href={`mailto:${supplier.orderEmail}`}>
                {supplier.orderEmail}
              </a>
            ) : (
              'Non indicata'
            )}
          </DetailItem>
          <DetailItem term="Email in copia" wide>
            {supplier.orderEmailCc ? (
              <a
                className="text-brand-700 hover:underline"
                href={`mailto:${supplier.orderEmailCc}`}
              >
                {supplier.orderEmailCc}
              </a>
            ) : (
              'Non indicata'
            )}
          </DetailItem>
          <DetailItem term="Nota fissa nell’email" wide>
            {supplier.emailNote ?? 'Nessuna nota fissa'}
          </DetailItem>
        </DetailCard>

        <DetailCard title="Note interne" description="Informazioni visibili soltanto nell’app.">
          <DetailItem term="Note" wide>
            {supplier.notes ?? 'Nessuna nota interna'}
          </DetailItem>
        </DetailCard>
      </div>
    </SupplierDetailShell>
  );
}
