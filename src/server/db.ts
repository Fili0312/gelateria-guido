import { Prisma } from '@/generated/prisma/client';
import {
  applyOrganizationScope,
  OrganizationScopeError,
} from '@/server/database/organization-scope';
import { systemPrisma } from '@/server/database/system-client';

/**
 * Punto di ingresso Prisma per il codice applicativo.
 *
 * Il client senza scope vive intenzionalmente in `database/system-client` ed
 * e' riservato a health check e bootstrap. Da questo modulo e' esportata solo
 * la factory che rende organizationId obbligatorio.
 */

/**
 * Client da usare per ogni query applicativa. Tutti i modelli che possiedono
 * `organizationId` vengono filtrati automaticamente e ricevono la colonna in
 * scrittura; i delegate che non possono essere isolati direttamente vengono
 * rifiutati e vanno raggiunti come operazioni nested dal loro genitore.
 *
 * Il codice di dominio deve partire sempre da questa factory.
 */
function createOrganizationPrismaClient(organizationId: string) {
  if (!organizationId) throw new OrganizationScopeError('organizationId obbligatorio.');

  return systemPrisma.$extends(
    Prisma.defineExtension({
      name: 'organization-scope',
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            const scopedArgs = applyOrganizationScope(model, operation, args, organizationId);
            return query(scopedArgs as typeof args);
          },
        },
      },
    }),
  );
}

type ExtendedOrganizationPrismaClient = ReturnType<typeof createOrganizationPrismaClient>;
type ClientControlMethod = Extract<keyof ExtendedOrganizationPrismaClient, `$${string}`>;
type NonDirectlyScopedDelegate =
  | 'organization'
  | 'priceListRow'
  | 'supplierImportProfile'
  | 'importJob'
  | 'productAlias'
  | 'productMatchCandidate'
  | 'supplierProductPrice'
  | 'productBestOffer'
  | 'orderLine'
  | 'orderDocument'
  | 'emailDelivery'
  | 'aiCache';

/** Espone solo i delegate dei modelli, mai query raw o metodi di controllo. */
export type OrganizationPrismaClient = Omit<
  ExtendedOrganizationPrismaClient,
  ClientControlMethod | NonDirectlyScopedDelegate
>;
export type OrganizationJsonInput = Prisma.InputJsonValue;

export function prismaForOrganization(organizationId: string): OrganizationPrismaClient {
  return createOrganizationPrismaClient(organizationId);
}

function prismaErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * Il livello di isolamento di una scrittura.
 *
 * `serializable` serve quando la correttezza dipende da **cosa altri stanno
 * facendo altrove**: gli intervalli temporali dei prezzi, per esempio, dove
 * due inserimenti simultanei devono entrambi rileggere lo storico dopo
 * l'altro invece di chiudere la stessa riga producendo due periodi aperti.
 * PostgreSQL ne aborta uno con P2034 e il retry ricostruisce.
 *
 * `riga-bloccata` serve quando la correttezza dipende da **una riga sola** e
 * quella riga viene aggiornata per prima: chi arriva dopo aspetta il lock,
 * e quando entra vede tutto ciò che il precedente ha scritto. È il caso
 * dell'ordine, dove ogni modifica passa da `order` prima di toccare le righe.
 *
 * La distinzione conta: a isolamento serializzabile dieci aggiunte
 * simultanee allo stesso ordine si abortiscono a vicenda, e con un numero
 * finito di tentativi qualcuna **si perde in silenzio**. Con il lock si
 * mettono semplicemente in fila.
 */
export type Isolamento = 'serializable' | 'riga-bloccata';

/**
 * Esegue una scrittura atomica mantenendo lo scope dell'organizzazione.
 */
export async function transactionForOrganization<T>(
  organizationId: string,
  operation: (tx: OrganizationPrismaClient) => Promise<T>,
  opzioni: { maxAttempts?: number; isolamento?: Isolamento } = {},
): Promise<T> {
  const { maxAttempts = 3, isolamento = 'serializable' } = opzioni;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts deve essere almeno 1.');
  }

  const isolationLevel =
    isolamento === 'serializable'
      ? Prisma.TransactionIsolationLevel.Serializable
      : Prisma.TransactionIsolationLevel.ReadCommitted;

  const db = createOrganizationPrismaClient(organizationId);
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => operation(tx as unknown as OrganizationPrismaClient),
        { isolationLevel },
      );
    } catch (error) {
      if (prismaErrorCode(error) !== 'P2034' || attempt >= maxAttempts) throw error;
    }
  }
}
