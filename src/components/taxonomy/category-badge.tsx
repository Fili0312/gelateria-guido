import type { ProductCategoryRef } from '@/features/taxonomy/dto';

/**
 * La pastiglia «Bar · Amari e liquori».
 *
 * Il colore viene dal reparto e non da una tavolozza fissa: quattro reparti
 * distinti a colpo d'occhio valgono più di quattro grigi coerenti, in una
 * schermata dove le righe sono decine e si scorre in fretta.
 *
 * Quando la categoria manca non si disegna un vuoto: si scrive «Da
 * classificare», perché è una cosa da fare e non l'assenza di un dato.
 */
export function CategoryBadge({
  categoria,
  compatta = false,
}: {
  categoria: ProductCategoryRef | null;
  compatta?: boolean;
}) {
  if (!categoria) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
        Da classificare
      </span>
    );
  }

  const colore = categoria.departmentColor ?? '#475569';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        // Il fondo è lo stesso colore molto diluito: la pastiglia si legge
        // anche quando il reparto ha un colore scuro, senza dover calcolare
        // un contrasto per ciascuno.
        backgroundColor: `${colore}14`,
        color: colore,
        border: `1px solid ${colore}33`,
      }}
      title={`${categoria.departmentName} · ${categoria.name}`}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: colore }}
      />
      {compatta ? categoria.name : `${categoria.departmentName} · ${categoria.name}`}
    </span>
  );
}
