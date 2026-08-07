import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppIcon } from '@/components/app-icon';
import { LoginForm } from '@/components/login-form';
import { getCurrentUser } from '@/server/auth';
import { safeNextPath } from '@/server/auth/redirect-path';
import { withBasePath } from '@/server/base-path';

export const metadata: Metadata = {
  title: 'Accedi · Gelateria Guido',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const currentUser = await getCurrentUser();
  if (currentUser) redirect('/');

  const query = await searchParams;

  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-white lg:grid-cols-[1.08fr_0.92fr]">
      <section className="bg-brand-900 relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div
          aria-hidden
          className="bg-brand-500/25 absolute -top-24 -left-20 h-96 w-96 rounded-full blur-3xl"
        />
        <div
          aria-hidden
          className="absolute right-[-8rem] bottom-[-9rem] h-[30rem] w-[30rem] rounded-full bg-white/7 blur-2xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="bg-brand-500 grid h-12 w-12 place-items-center rounded-2xl text-sm font-black tracking-tight shadow-xl shadow-black/20">
            GG
          </span>
          <div>
            <p className="font-extrabold tracking-tight">Gelateria Guido</p>
            <p className="text-sm text-white/60">Gestione acquisti</p>
          </div>
        </div>

        <div className="relative max-w-xl pb-6">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80">
            <AppIcon name="sparkles" className="h-4 w-4 text-lime-300" />
            Prezzi chiari, ordini più semplici
          </span>
          <h1 className="text-5xl leading-[1.05] font-black tracking-[-0.04em] text-balance xl:text-6xl">
            Ogni listino,
            <br />
            finalmente al suo posto.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/65 xl:text-lg">
            Confronta confezioni diverse, conserva lo storico e prepara gli ordini senza rincorrere
            fogli e PDF.
          </p>
        </div>

        <p className="relative text-xs text-white/40">Accesso riservato · Gelateria Guido</p>
      </section>

      <section className="relative flex items-center justify-center bg-neutral-50 px-5 py-10 sm:px-8 lg:bg-white">
        <div
          aria-hidden
          className="bg-brand-100/70 absolute top-[-6rem] right-[-6rem] h-64 w-64 rounded-full blur-3xl lg:hidden"
        />
        <div className="relative w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="bg-brand-600 grid h-11 w-11 place-items-center rounded-2xl text-sm font-black text-white">
              GG
            </span>
            <div>
              <p className="font-extrabold tracking-tight">Gelateria Guido</p>
              <p className="text-xs text-neutral-500">Gestione acquisti</p>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl shadow-neutral-900/5 sm:p-9 lg:border-0 lg:p-0 lg:shadow-none">
            <div className="mb-8">
              <span className="bg-brand-50 text-brand-700 mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl">
                <AppIcon name="shield" className="h-5 w-5" />
              </span>
              <h2 className="text-3xl font-black tracking-[-0.03em] text-neutral-950">
                Bentornati
              </h2>
              <p className="mt-2 leading-6 text-neutral-500">
                Inserisci la password condivisa per continuare.
              </p>
            </div>

            <LoginForm
              endpoint={withBasePath('/api/auth/login')}
              nextPath={safeNextPath(query.next)}
            />
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-neutral-400">
            <AppIcon name="shield" className="h-3.5 w-3.5" />
            Sessione protetta e cookie non accessibile al browser
          </p>
        </div>
      </section>
    </main>
  );
}
