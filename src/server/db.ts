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
