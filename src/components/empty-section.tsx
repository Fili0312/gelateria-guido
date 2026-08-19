import Link from 'next/link';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { Badge } from '@/components/ui';

export function EmptySection({
  title,
  description,
  phase,
  icon,
  nextHref = '/',
}: {
  title: string;
  description: string;
  phase: number;
  icon: AppIconName;
  nextHref?: string;
}) {
  return (
    <div className="space-y-7">
      <header>
        <Badge variant="neutral">Fase {phase}</Badge>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl leading-6 text-neutral-500">{description}</p>
      </header>

      <section className="relative grid min-h-[23rem] place-items-center overflow-hidden rounded-3xl border border-dashed border-neutral-300 bg-white p-7 text-center">
        <div aria-hidden className="bg-brand-50 absolute h-64 w-64 rounded-full blur-3xl" />
        <div className="relative max-w-md">
          <span className="bg-brand-50 text-brand-700 mx-auto grid h-16 w-16 place-items-center rounded-3xl">
            <AppIcon name={icon} className="h-8 w-8" />
          </span>
          <h2 className="mt-5 text-xl font-extrabold tracking-tight">Sezione predisposta</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Rotta, navigazione, autenticazione, caricamento ed errori sono già collegati. Le
            funzioni operative entrano nella fase indicata, senza dover rifare il guscio.
          </p>
          <Link
            href={nextHref}
            className="text-brand-700 hover:text-brand-900 mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold"
          >
            Torna alla panoramica
            <AppIcon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
