import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  condizioniRigheStorico,
  raggruppaRigheStoriche,
  type RigaStoricaDaRaggruppare,
} from './history';

function riga(supplierId: string, id: string, lineTotalNet: string): RigaStoricaDaRaggruppare {
  return {
    id,
    supplierId,
    nameSnapshot: `Prodotto ${id}`,
    supplierNameSnapshot: 'Fornitore omonimo',
    supplierCodeSnapshot: null,
    packQuantitySnapshot: 1,
    unitSizeSnapshot: { toString: () => '1' },
    uomSnapshot: 'PIECE',
    quantityPacks: 1,
    unitPriceNetSnapshot: { toString: () => lineTotalNet },
    lineTotalNet: { toString: () => lineTotalNet },
    note: null,
  };
}

describe('raggruppamento dello storico', () => {
  it('non fonde due fornitori diversi che hanno lo stesso nome', () => {
    const gruppi = raggruppaRigheStoriche([
      riga('fornitore-a', 'a', '10'),
      riga('fornitore-b', 'b', '20'),
    ]);
    assert.equal(gruppi.length, 2);
    assert.deepEqual(gruppi.map((g) => g.supplierId).sort(), ['fornitore-a', 'fornitore-b']);
  });

  it('somma invece le righe della stessa identità', () => {
    const [gruppo] = raggruppaRigheStoriche([
      riga('fornitore-a', 'a', '10'),
      riga('fornitore-a', 'b', '20'),
    ]);
    assert.equal(gruppo?.righe.length, 2);
    assert.equal(gruppo?.netto, '30');
  });
});

describe('filtri sulle righe dello storico', () => {
  it('mantiene insieme filtro fornitore e ricerca prodotto', () => {
    assert.deepEqual(condizioniRigheStorico({ supplierId: 'fornitore-a', q: 'amaretto' }), [
      { lines: { some: { supplierId: 'fornitore-a' } } },
      {
        lines: {
          some: {
            nameSnapshot: { contains: 'amaretto', mode: 'insensitive' },
          },
        },
      },
    ]);
  });

  it('non aggiunge condizioni quando entrambi i filtri sono assenti', () => {
    assert.deepEqual(condizioniRigheStorico({}), []);
  });
});
