import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  condizioniRigheStorico,
  raggruppaRigheStoriche,
  type RigaStoricaDaRaggruppare,
} from './history';

function riga(
  supplierId: string,
  id: string,
  lineTotalNet: string,
  unavailableAt: Date | null = null,
): RigaStoricaDaRaggruppare {
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
    unavailableAt,
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

describe('righe non disponibili', () => {
  it('restano in elenco ma fuori dal totale del fornitore', () => {
    // Il fornitore ha consegnato tutto tranne una cosa. La riga deve
    // restare — lo storico deve dire cosa era stato ordinato — ma i soldi
    // no: quella merce non arriva e non si paga.
    const gruppi = raggruppaRigheStoriche([
      riga('f', 'a', '10'),
      riga('f', 'b', '25', new Date('2026-08-19T08:00:00Z')),
      riga('f', 'c', '5'),
    ]);
    assert.equal(gruppi.length, 1);
    assert.equal(gruppi[0]!.righe.length, 3, 'le righe restano tutte');
    assert.equal(gruppi[0]!.netto, '15', 'il totale conta solo la merce che arriva');
    assert.deepEqual(
      gruppi[0]!.righe.map((r) => r.nonDisponibile),
      [false, true, false],
    );
  });
});
