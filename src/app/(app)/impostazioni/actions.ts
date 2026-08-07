'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/server/auth';
import { settingsRepository } from '@/server/repositories/settings';

export interface SettingsActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  requestId?: number;
}

const settingsSchema = z.object({
  defaultVat: z.coerce.number().min(0).max(100),
  alertPercentage: z.coerce.number().min(0).max(100),
  alertEuro: z.coerce.number().min(0).max(10_000),
  staleMonths: z.coerce.number().int().min(1).max(60),
  priceChangePercentage: z.coerce.number().min(0).max(1_000),
});

const KEYS = {
  defaultVat: 'ordini.ivaPredefinita',
  alertPercentage: 'avviso.sogliaPercentuale',
  alertEuro: 'avviso.sogliaEuro',
  staleMonths: 'prezzi.mesiPrimaDiConsiderarloFermo',
  priceChangePercentage: 'import.variazioneDaConfermare',
} as const;

export async function saveSettings(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: 'error',
      message: 'Sessione scaduta. Accedi di nuovo.',
      requestId: Date.now(),
    };
  }

  const parsed = settingsSchema.safeParse({
    defaultVat: formData.get('defaultVat'),
    alertPercentage: formData.get('alertPercentage'),
    alertEuro: formData.get('alertEuro'),
    staleMonths: formData.get('staleMonths'),
    priceChangePercentage: formData.get('priceChangePercentage'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i valori: una o più soglie non sono valide.',
      requestId: Date.now(),
    };
  }

  const entries = Object.entries(parsed.data) as [keyof typeof KEYS, number][];

  try {
    await settingsRepository(user.organizationId).setMany(
      entries.map(([field, value]) => [KEYS[field], value] as const),
    );
  } catch {
    return {
      status: 'error',
      message: 'Non è stato possibile salvare le impostazioni. Riprova.',
      requestId: Date.now(),
    };
  }

  revalidatePath('/impostazioni');
  return { status: 'success', message: 'Impostazioni salvate.', requestId: Date.now() };
}
