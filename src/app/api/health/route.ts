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

  // L'endpoint e' pubblico per poter essere interrogato da nginx e dal deploy,
  // ma il corpo non deve pubblicare versione di Postgres, estensioni o errori
  // interni. I dettagli restano disponibili nella dashboard autenticata.
  return NextResponse.json(
    { ok: stato.ok },
    {
      status: stato.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
