'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth';
import {
  CAMPI_IMPOSTAZIONI,
  SETTINGS_KEYS,
  settingsFormSchema,
  type SettingsValues,
} from '@/features/settings/schema';
import { settingsRepository } from '@/server/repositories/settings';

export interface SettingsActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  requestId?: number;
}

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

  // I campi si ricavano dallo schema invece di elencarli a mano: elencandoli,
  // aggiungerne uno allo schema e scordarselo qui lo fa **salvare come
  // predefinito senza un errore**. È già successo con lo sconto del
  // fornitore: la riga si aggiornava, il campo restava vuoto, e nessuno
  // segnalava niente.
  const parsed = settingsFormSchema.safeParse(
    Object.fromEntries(CAMPI_IMPOSTAZIONI.map((campo) => [campo, formData.get(campo)])),
  );

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i valori: una o più soglie non sono valide.',
      requestId: Date.now(),
    };
  }

  const entries = Object.entries(parsed.data) as [keyof SettingsValues, string | number][];

  try {
    await settingsRepository(user.organizationId).setMany(
      entries.map(([field, value]) => [SETTINGS_KEYS[field], value] as const),
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
