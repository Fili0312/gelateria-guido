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
 * Esegue una scrittura atomica mantenendo lo scope dell'organizzazione.
 *
 * `Serializable` serve per gli intervalli temporali: due prezzi inseriti in
 * contemporanea devono entrambi rileggere lo storico dopo l'altro, non
 * chiudere la stessa riga producendo due periodi aperti. PostgreSQL ne aborta
 * uno con P2034; il retry rilegge la nuova catena e la ricostruisce.
 */
export async function transactionForOrganization<T>(
  organizationId: string,
  operation: (tx: OrganizationPrismaClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts deve essere almeno 1.');
  }

  const db = createOrganizationPrismaClient(organizationId);
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => operation(tx as unknown as OrganizationPrismaClient),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (prismaErrorCode(error) !== 'P2034' || attempt >= maxAttempts) throw error;
    }
  }
}
