import { AppIcon } from '@/components/app-icon';
import { SettingsForm, type SettingsValues } from '@/components/settings-form';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { SESSION_COOKIE_NAME } from '@/server/auth';
import { settingsRepository } from '@/server/repositories/settings';

export const dynamic = 'force-dynamic';

const DEFAULTS: SettingsValues = {
  defaultVat: 22,
  alertPercentage: 3,
  alertEuro: 0.3,
  staleMonths: 6,
  priceChangePercentage: 40,
};

const SETTING_KEYS = new Map<string, keyof SettingsValues>([
  ['ordini.ivaPredefinita', 'defaultVat'],
  ['avviso.sogliaPercentuale', 'alertPercentage'],
  ['avviso.sogliaEuro', 'alertEuro'],
  ['prezzi.mesiPrimaDiConsiderarloFermo', 'staleMonths'],
  ['import.variazioneDaConfermare', 'priceChangePercentage'],
]);

function numericSetting(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const rows = await settingsRepository(user.organizationId).findMany([...SETTING_KEYS.keys()]);

  const values = { ...DEFAULTS };
  for (const row of rows) {
    const field = SETTING_KEYS.get(row.key);
    if (field) values[field] = numericSetting(row.value, DEFAULTS[field]);
  }

  return (
    <div className="space-y-7">
      <header>
        <Badge variant="brand">Configurazione organizzazione</Badge>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          Impostazioni
        </h1>
        <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
          Regole predefinite per prezzi e avvisi. Le modifiche valgono su tutti i dispositivi.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
        <SettingsForm initialValues={values} />

        <aside className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm xl:sticky xl:top-8">
          <span className="bg-brand-50 text-brand-700 grid h-11 w-11 place-items-center rounded-2xl">
            <AppIcon name="shield" className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-black text-neutral-950">Accesso protetto</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            La sessione usa il cookie <code className="text-xs">{SESSION_COOKIE_NAME}</code>,
            firmato e non leggibile dal JavaScript della pagina.
          </p>
          <dl className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Utente</dt>
              <dd className="font-bold text-neutral-800">{user.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Ruolo</dt>
              <dd className="font-bold text-neutral-800">{user.role}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Cookie</dt>
              <dd className="font-bold text-neutral-800">httpOnly · secure</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
