import { prismaForOrganization, type OrganizationJsonInput } from '@/server/db';

/**
 * Unico confine per le impostazioni dell'organizzazione.
 *
 * Prisma richiede `organizationId` nel tipo di una create anche se
 * l'estensione scoped lo aggiunge a runtime. Lo inseriamo qui, nel repository,
 * affinche' pagine e azioni non possano e non debbano ripeterlo nelle query.
 */
export function settingsRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  return {
    findMany(keys: string[]) {
      return db.setting.findMany({
        where: { key: { in: keys } },
        select: { key: true, value: true },
      });
    },

    async setMany(entries: ReadonlyArray<readonly [string, OrganizationJsonInput]>) {
      await Promise.all(
        entries.map(async ([key, value]) => {
          const updated = await db.setting.updateMany({ where: { key }, data: { value } });
          if (updated.count === 0) {
            await db.setting.create({ data: { organizationId, key, value } });
          }
        }),
      );
    },
  };
}
