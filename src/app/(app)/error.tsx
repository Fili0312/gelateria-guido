'use client';

import { useEffect } from 'react';
import { AppIcon } from '@/components/app-icon';
import { Button } from '@/components/ui';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
      <div className="w-full rounded-3xl border border-red-100 bg-white p-7 text-center shadow-sm sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-700">
          <AppIcon name="warning" className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Qualcosa non ha funzionato</h1>
        <p className="mx-auto mt-2 max-w-md leading-6 text-neutral-500">
          I dati non sono stati modificati. Puoi riprovare; se il problema continua, controlla i log
          del servizio.
        </p>
        <div className="mt-6 flex justify-center">
          <Button onClick={reset}>Riprova</Button>
        </div>
      </div>
    </section>
  );
}
