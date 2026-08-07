import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrganizationPrismaClient } from '@/server/db';
import { applyOrganizationScope, OrganizationScopeError } from './organization-scope';

const ORG = 'org-gelateria';
type HasRawQuery = '$queryRaw' extends keyof OrganizationPrismaClient ? true : false;
type HasUnscopedOrderLine = 'orderLine' extends keyof OrganizationPrismaClient ? true : false;
const RAW_QUERY_IS_HIDDEN: HasRawQuery = false;
const UNSCOPED_ORDER_LINE_IS_HIDDEN: HasUnscopedOrderLine = false;

describe('scope Prisma per organizzazione', () => {
  it('nasconde dai tipi query raw e delegate senza organizationId', () => {
    assert.equal(RAW_QUERY_IS_HIDDEN, false);
    assert.equal(UNSCOPED_ORDER_LINE_IS_HIDDEN, false);
  });

  it('aggiunge organizationId a letture, aggiornamenti e cancellazioni', () => {
    assert.deepEqual(
      applyOrganizationScope('Supplier', 'findMany', { where: { active: true } }, ORG),
      {
        where: { active: true, organizationId: ORG },
      },
    );
    assert.deepEqual(
      applyOrganizationScope(
        'Product',
        'update',
        { where: { id: 'p1' }, data: { name: 'X' } },
        ORG,
      ),
      { where: { id: 'p1', organizationId: ORG }, data: { name: 'X' } },
    );
    assert.deepEqual(applyOrganizationScope('Order', 'delete', { where: { id: 'o1' } }, ORG), {
      where: { id: 'o1', organizationId: ORG },
    });
  });

  it('imposta organizationId in create, createMany e upsert', () => {
    assert.deepEqual(
      applyOrganizationScope('Supplier', 'create', { data: { name: 'Cecconi' } }, ORG),
      {
        data: { name: 'Cecconi', organizationId: ORG },
      },
    );
    assert.deepEqual(
      applyOrganizationScope('User', 'createMany', { data: [{ name: 'A' }, { name: 'B' }] }, ORG),
      {
        data: [
          { name: 'A', organizationId: ORG },
          { name: 'B', organizationId: ORG },
        ],
      },
    );
    assert.deepEqual(
      applyOrganizationScope(
        'Setting',
        'upsert',
        {
          where: { organizationId_key: { organizationId: ORG, key: 'iva' } },
          create: { key: 'iva' },
          update: { value: 22 },
        },
        ORG,
      ),
      {
        where: {
          organizationId_key: { organizationId: ORG, key: 'iva' },
          organizationId: ORG,
        },
        create: { key: 'iva', organizationId: ORG },
        update: { value: 22 },
      },
    );
  });

  it('rifiuta scritture esplicitamente assegnate a un altro tenant', () => {
    assert.throws(
      () =>
        applyOrganizationScope(
          'Supplier',
          'create',
          { data: { name: 'X', organizationId: 'org-altra' } },
          ORG,
        ),
      OrganizationScopeError,
    );
    assert.throws(
      () =>
        applyOrganizationScope(
          'Supplier',
          'update',
          { where: { id: 's1' }, data: { organizationId: { set: 'org-altra' } } },
          ORG,
        ),
      OrganizationScopeError,
    );
    assert.throws(
      () =>
        applyOrganizationScope(
          'Supplier',
          'update',
          { where: { id: 's1' }, data: { organization: { connect: { id: 'org-altra' } } } },
          ORG,
        ),
      /relazione organization.*non puo essere modificata/,
    );
  });

  it('vieta delegate privi di organizationId e modelli di sistema', () => {
    assert.throws(
      () => applyOrganizationScope('OrderLine', 'findMany', {}, ORG),
      /query nested.*genitore scoped/,
    );
    assert.throws(
      () => applyOrganizationScope('AiCache', 'findMany', {}, ORG),
      /modello di sistema/,
    );
  });
});
