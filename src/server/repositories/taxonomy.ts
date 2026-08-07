import 'server-only';

import type {
  CategoryItem,
  DepartmentItem,
  ProductCategoryRef,
  TaxonomyResult,
} from '@/features/taxonomy/dto';
import type {
  CategoryInput,
  CategoryPatch,
  DepartmentInput,
  DepartmentPatch,
  TaxonomyQuery,
} from '@/features/taxonomy/schema';
import { prismaForOrganization } from '@/server/db';

export class TaxonomyNotFoundError extends Error {
  override readonly name = 'TaxonomyNotFoundError';
}

export class TaxonomyConflictError extends Error {
  override readonly name = 'TaxonomyConflictError';
}

/**
 * Il `select` che porta con sé il reparto.
 *
 * Sta qui e non nel repository dei prodotti perché lo usano entrambi: la
 * scheda prodotto, l'elenco e la ricerca mostrano tutte «Bar · Amari», e
 * ricostruirlo in tre punti diversi significa vederlo divergere.
 */
export const CATEGORY_REF_SELECT = {
  id: true,
  name: true,
  departmentId: true,
  department: { select: { name: true, color: true } },
} as const;

interface CategoryRefRecord {
  id: string;
  name: string;
  departmentId: string;
  department: { name: string; color: string | null };
}

export function mapCategoryRef(
  record: CategoryRefRecord | null | undefined,
): ProductCategoryRef | null {
  if (!record) return null;
  return {
    id: record.id,
    name: record.name,
    departmentId: record.departmentId,
    departmentName: record.department.name,
    departmentColor: record.department.color,
  };
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export function taxonomyRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  /**
   * Verifica che una categoria esista **in questa organizzazione**.
   *
   * È il vincolo che la migrazione ha deciso di non mettere come foreign key
   * composita: qui c'è, in un punto solo, e ogni scrittura che tocca
   * `categoryId` ci passa. Restituisce l'id validato, così chi chiama non può
   * dimenticarsi di usarlo.
   */
  async function assertCategoryBelongs(categoryId: string | null): Promise<string | null> {
    if (categoryId === null) return null;
    const trovata = await db.category.findFirst({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!trovata) {
      throw new TaxonomyNotFoundError('La categoria indicata non esiste.');
    }
    return trovata.id;
  }

  async function assertDepartmentBelongs(departmentId: string): Promise<string> {
    const trovato = await db.department.findFirst({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!trovato) throw new TaxonomyNotFoundError('Il reparto indicato non esiste.');
    return trovato.id;
  }

  return {
    assertCategoryBelongs,

    /**
     * Tutta la tassonomia in una richiesta sola.
     *
     * Sono quattro reparti e trenta categorie: paginarla o caricarla a pezzi
     * costerebbe più codice di quanto risparmi, e ogni schermata che la usa
     * la vuole intera (il selettore del form, i filtri, le impostazioni).
     */
    async tree(query: TaxonomyQuery): Promise<TaxonomyResult> {
      const soloAttivi = query.includiInattivi ? {} : { active: true };

      const [reparti, nonClassificati] = await Promise.all([
        db.department.findMany({
          where: soloAttivi,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            color: true,
            sortOrder: true,
            active: true,
            categories: {
              where: soloAttivi,
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              select: {
                id: true,
                departmentId: true,
                name: true,
                sortOrder: true,
                active: true,
                _count: { select: { products: true } },
              },
            },
          },
        }),
        db.product.count({ where: { categoryId: null } }),
      ]);

      const departments: DepartmentItem[] = reparti.map((r) => {
        const categories: CategoryItem[] = r.categories.map((c) => ({
          id: c.id,
          departmentId: c.departmentId,
          name: c.name,
          sortOrder: c.sortOrder,
          active: c.active,
          productsCount: c._count.products,
        }));
        return {
          id: r.id,
          name: r.name,
          color: r.color,
          sortOrder: r.sortOrder,
          active: r.active,
          categories,
          productsCount: categories.reduce((somma, c) => somma + c.productsCount, 0),
        };
      });

      return { departments, unclassified: nonClassificati };
    },

    async createDepartment(input: DepartmentInput): Promise<string> {
      try {
        const creato = await db.department.create({
          data: {
            organizationId,
            name: input.name,
            color: input.color,
            sortOrder: input.sortOrder,
            active: input.active,
          },
          select: { id: true },
        });
        return creato.id;
      } catch (error) {
        if (errorCode(error) === 'P2002' || nomeDuplicato(error)) {
          throw new TaxonomyConflictError('Esiste già un reparto con questo nome.');
        }
        throw error;
      }
    },

    async updateDepartment(id: string, patch: DepartmentPatch): Promise<void> {
      const corrente = await db.department.findFirst({ where: { id }, select: { id: true } });
      if (!corrente) throw new TaxonomyNotFoundError('Reparto non trovato.');
      try {
        await db.department.update({ where: { id }, data: patch });
      } catch (error) {
        if (errorCode(error) === 'P2002' || nomeDuplicato(error)) {
          throw new TaxonomyConflictError('Esiste già un reparto con questo nome.');
        }
        throw error;
      }
    },

    /**
     * Un reparto con categorie dentro non si cancella: si disattiva.
     *
     * Il controllo anticipato dà un messaggio utile; la foreign key RESTRICT
     * ripete la stessa regola nel database e chiude la finestra fra conteggio
     * e cancellazione in presenza di due richieste concorrenti.
     */
    async deleteDepartment(id: string): Promise<void> {
      const reparto = await db.department.findFirst({
        where: { id },
        select: { id: true, _count: { select: { categories: true } } },
      });
      if (!reparto) throw new TaxonomyNotFoundError('Reparto non trovato.');
      if (reparto._count.categories > 0) {
        throw new TaxonomyConflictError(
          'Il reparto contiene delle categorie: svuotalo o disattivalo invece di cancellarlo.',
        );
      }
      try {
        await db.department.delete({ where: { id } });
      } catch (error) {
        if (errorCode(error) === 'P2003') {
          throw new TaxonomyConflictError(
            'Il reparto contiene delle categorie: svuotalo o disattivalo invece di cancellarlo.',
          );
        }
        throw error;
      }
    },

    async createCategory(input: CategoryInput): Promise<string> {
      const departmentId = await assertDepartmentBelongs(input.departmentId);
      try {
        const creata = await db.category.create({
          data: {
            organizationId,
            departmentId,
            name: input.name,
            sortOrder: input.sortOrder,
            active: input.active,
          },
          select: { id: true },
        });
        return creata.id;
      } catch (error) {
        if (errorCode(error) === 'P2002' || nomeDuplicato(error)) {
          throw new TaxonomyConflictError('Esiste già una categoria con questo nome nel reparto.');
        }
        throw error;
      }
    },

    async updateCategory(id: string, patch: CategoryPatch): Promise<void> {
      const corrente = await db.category.findFirst({ where: { id }, select: { id: true } });
      if (!corrente) throw new TaxonomyNotFoundError('Categoria non trovata.');
      if (patch.departmentId !== undefined) await assertDepartmentBelongs(patch.departmentId);
      try {
        await db.category.update({ where: { id }, data: patch });
      } catch (error) {
        if (errorCode(error) === 'P2002' || nomeDuplicato(error)) {
          throw new TaxonomyConflictError('Esiste già una categoria con questo nome nel reparto.');
        }
        throw error;
      }
    },

    /**
     * Cancellare una categoria **non** cancella i prodotti: tornano «da
     * classificare» (`ON DELETE SET NULL`). Il conteggio si mostra prima di
     * chiedere conferma, così quel «tornano da classificare» è un numero e
     * non una sorpresa.
     */
    async deleteCategory(id: string): Promise<{ productsAffected: number }> {
      const categoria = await db.category.findFirst({
        where: { id },
        select: { id: true, _count: { select: { products: true } } },
      });
      if (!categoria) throw new TaxonomyNotFoundError('Categoria non trovata.');
      await db.category.delete({ where: { id } });
      return { productsAffected: categoria._count.products };
    },
  };
}

/**
 * L'indice unico su `lower(btrim(name))` è un indice di espressione, che
 * Prisma non conosce: la violazione non arriva come `P2002` ma come errore
 * grezzo di PostgreSQL, con il nome del vincolo dentro il messaggio.
 * Riconoscerlo qui è ciò che trasforma un 500 in un «esiste già».
 */
function nomeDuplicato(error: unknown): boolean {
  const messaggio =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  return (
    messaggio.includes('department_organization_name_key') ||
    messaggio.includes('category_department_name_key')
  );
}
