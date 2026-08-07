import { NextResponse } from 'next/server';
import { leggiStato } from '@/server/health';

export const dynamic = 'force-dynamic';

/**
 * Health check leggibile da una macchina.
 *
 * Lo usa `deploy.sh` per decidere se il deploy è riuscito, e potrà usarlo un
 * monitoraggio esterno. Restituisce 503 quando qualcosa non va, così basta il
 * codice HTTP: nessuno deve interpretare il corpo per capirlo.
 */
export async function GET() {
  const stato = await leggiStato();
  return NextResponse.json(stato, { status: stato.ok ? 200 : 503 });
}
