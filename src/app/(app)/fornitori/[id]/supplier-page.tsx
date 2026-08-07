import { notFound, redirect } from 'next/navigation';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { getSupplierDetail } from '@/server/repositories/suppliers';

export async function loadSupplier(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supplier = await getSupplierDetail(user.organizationId, id);
  if (!supplier) notFound();
  return supplier;
}

export function FutureSupplierSection({
  title,
  description,
  phase,
  icon,
  linkedLabel,
}: {
  title: string;
  description: string;
  phase: number;
  icon: AppIconName;
  linkedLabel?: string;
}) {
  return (
    <section className="relative grid min-h-72 place-items-center overflow-hidden rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center shadow-sm">
      <div aria-hidden className="bg-brand-50 absolute h-56 w-56 rounded-full blur-3xl" />
      <div className="relative max-w-lg">
        <span className="bg-brand-50 text-brand-700 mx-auto grid h-14 w-14 place-items-center rounded-2xl">
          <AppIcon name={icon} className="h-7 w-7" />
        </span>
        <Badge variant="neutral" className="mt-5">
          Operativa nella Fase {phase}
        </Badge>
        <h2 className="mt-3 text-xl font-black tracking-tight text-neutral-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">{description}</p>
        {linkedLabel && (
          <p className="bg-brand-50 text-brand-900 mt-5 rounded-xl px-4 py-3 text-sm font-semibold">
            {linkedLabel}
          </p>
        )}
      </div>
    </section>
  );
}
