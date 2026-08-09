'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveSettings, type SettingsActionState } from '@/app/(app)/impostazioni/actions';
import { AppIcon } from '@/components/app-icon';
import { Button, Stepper, useToast } from '@/components/ui';

import type { SettingsValues } from '@/features/settings/schema';

export type { SettingsValues };

const INITIAL_STATE: SettingsActionState = { status: 'idle' };

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 border-b border-neutral-100 py-5 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="max-w-2xl">
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-neutral-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function SettingsForm({ initialValues }: { initialValues: SettingsValues }) {
  const [values, setValues] = useState(initialValues);
  const [state, action, pending] = useActionState(saveSettings, INITIAL_STATE);
  const { toast } = useToast();

  useEffect(() => {
    if (state.status === 'success') {
      toast({ title: state.message ?? 'Impostazioni salvate.', tone: 'success' });
    } else if (state.status === 'error') {
      toast({ title: 'Salvataggio non riuscito', description: state.message, tone: 'error' });
    }
  }, [state.requestId, state.status, state.message, toast]);

  return (
    <form action={action}>
      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-900/[0.025]">
        <div className="border-b border-neutral-100 px-5 py-5 sm:px-6">
          <h2 className="text-lg font-black tracking-tight text-neutral-950">Prezzi e ordini</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Valori predefiniti usati nei calcoli e nei nuovi ordini.
          </p>
        </div>
        <div className="px-5 sm:px-6">
          <SettingRow
            title="IVA predefinita"
            description="Applicata quando il prodotto o il fornitore non specificano un’aliquota diversa."
          >
            <div className="flex items-center gap-2">
              <Stepper
                name="defaultVat"
                label="IVA predefinita in percentuale"
                visuallyHideLabel
                min={0}
                max={100}
                step={1}
                value={values.defaultVat}
                onValueChange={(defaultVat) => setValues((current) => ({ ...current, defaultVat }))}
                disabled={pending}
              />
              <span className="w-5 text-sm font-bold text-neutral-500">%</span>
            </div>
          </SettingRow>
          <SettingRow
            title="Prezzo non aggiornato dopo"
            description="Oltre questa età il prezzo viene mostrato come dato potenzialmente vecchio."
          >
            <div className="flex items-center gap-2">
              <Stepper
                name="staleMonths"
                label="Mesi prima di considerare il prezzo non aggiornato"
                visuallyHideLabel
                min={1}
                max={60}
                value={values.staleMonths}
                onValueChange={(staleMonths) =>
                  setValues((current) => ({ ...current, staleMonths }))
                }
                disabled={pending}
              />
              <span className="w-10 text-sm font-medium text-neutral-500">mesi</span>
            </div>
          </SettingRow>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-900/[0.025]">
        <div className="border-b border-neutral-100 px-5 py-5 sm:px-6">
          <h2 className="text-lg font-black tracking-tight text-neutral-950">Soglie di avviso</h2>
          <p className="mt-1 text-sm text-neutral-500">
            L’avviso “esiste di meglio” compare solo quando sono superate sia la percentuale sia la
            cifra.
          </p>
        </div>
        <div className="px-5 sm:px-6">
          <SettingRow
            title="Risparmio percentuale minimo"
            description="Evita avvisi su differenze percentuali trascurabili."
          >
            <div className="flex items-center gap-2">
              <Stepper
                name="alertPercentage"
                label="Risparmio percentuale minimo"
                visuallyHideLabel
                min={0}
                max={100}
                step={0.5}
                value={values.alertPercentage}
                onValueChange={(alertPercentage) =>
                  setValues((current) => ({ ...current, alertPercentage }))
                }
                disabled={pending}
              />
              <span className="w-5 text-sm font-bold text-neutral-500">%</span>
            </div>
          </SettingRow>
          <SettingRow
            title="Risparmio assoluto minimo"
            description="L’offerta alternativa deve far risparmiare almeno questa cifra per confezione."
          >
            <div className="flex items-center gap-2">
              <Stepper
                name="alertEuro"
                label="Risparmio minimo in euro"
                visuallyHideLabel
                min={0}
                max={10_000}
                step={0.05}
                value={values.alertEuro}
                onValueChange={(alertEuro) => setValues((current) => ({ ...current, alertEuro }))}
                disabled={pending}
              />
              <span className="w-5 text-sm font-bold text-neutral-500">€</span>
            </div>
          </SettingRow>
          <SettingRow
            title="Variazione prezzo da confermare"
            description="Un import che supera questa variazione richiede una conferma esplicita."
          >
            <div className="flex items-center gap-2">
              <Stepper
                name="priceChangePercentage"
                label="Variazione prezzo da confermare"
                visuallyHideLabel
                min={0}
                max={1_000}
                step={5}
                value={values.priceChangePercentage}
                onValueChange={(priceChangePercentage) =>
                  setValues((current) => ({ ...current, priceChangePercentage }))
                }
                disabled={pending}
              />
              <span className="w-5 text-sm font-bold text-neutral-500">%</span>
            </div>
          </SettingRow>
        </div>
      </section>

      <div className="sticky bottom-3 z-10 mt-6 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg shadow-neutral-900/10 backdrop-blur sm:static sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <p className="hidden items-center gap-2 text-xs text-neutral-500 sm:flex">
          <AppIcon name="check" className="text-brand-600 h-4 w-4" />I valori sono salvati per
          l’intera organizzazione
        </p>
        <Button type="submit" size="lg" loading={pending} loadingLabel="Salvataggio…">
          Salva impostazioni
        </Button>
      </div>
    </form>
  );
}
