export const DEFAULT_ORGANIZATION_SLUG = 'gelateria-guido';

const DIRECTLY_SCOPED_MODELS = new Set([
  'User',
  'Supplier',
  'PriceList',
  'Product',
  'SupplierProduct',
  'Order',
  'AiCall',
  'Setting',
  'AuditLog',
]);

/**
 * Questi modelli ereditano l'organizzazione dal genitore e non hanno una
 * colonna propria. Le operazioni dirette vengono quindi vietate: vanno fatte
 * come nested read/write partendo da un modello gia' scoped. In questo modo
 * l'assenza della colonna non diventa una scorciatoia che salta l'isolamento.
 */
const INDIRECTLY_SCOPED_MODELS = new Set([
  'PriceListRow',
  'SupplierImportProfile',
  'ImportJob',
  'ProductAlias',
  'ProductMatchCandidate',
  'SupplierProductPrice',
  'ProductBestOffer',
  'OrderLine',
  'OrderDocument',
  'EmailDelivery',
]);

const FILTERED_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'aggregate',
  'count',
  'groupBy',
  'findRaw',
]);

type QueryArgs = Record<string, unknown>;

export class OrganizationScopeError extends Error {
  override readonly name = 'OrganizationScopeError';
}

function asRecord(value: unknown, label: string): QueryArgs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OrganizationScopeError(`${label} non valido per una query scoped.`);
  }
  return value as QueryArgs;
}

function scopeWhere(args: QueryArgs, organizationId: string): QueryArgs {
  const where = args.where === undefined ? {} : asRecord(args.where, 'where');
  return { ...args, where: { ...where, organizationId } };
}

function scopeCreateData(data: unknown, organizationId: string): QueryArgs {
  const record = asRecord(data, 'data');
  if (record.organization !== undefined) {
    throw new OrganizationScopeError(
      'La relazione organization e gestita dallo scope e non va impostata a mano.',
    );
  }
  if (record.organizationId !== undefined && record.organizationId !== organizationId) {
    throw new OrganizationScopeError('Tentativo di scrittura in un’altra organizzazione.');
  }
  return { ...record, organizationId };
}

function validateUpdateData(data: unknown, organizationId: string): QueryArgs {
  const record = asRecord(data, 'data');
  if (record.organization !== undefined) {
    throw new OrganizationScopeError(
      'La relazione organization e gestita dallo scope e non puo essere modificata.',
    );
  }
  const requestedOrganization = record.organizationId;

  if (
    requestedOrganization !== undefined &&
    requestedOrganization !== organizationId &&
    !(
      typeof requestedOrganization === 'object' &&
      requestedOrganization !== null &&
      (requestedOrganization as QueryArgs).set === organizationId
    )
  ) {
    throw new OrganizationScopeError('Non e possibile spostare dati fra organizzazioni.');
  }

  return record;
}

/**
 * Trasformazione pura usata dall'estensione Prisma e dai test. E' esportata
 * per rendere verificabile l'invariante senza database e senza credenziali.
 */
export function applyOrganizationScope(
  model: string,
  operation: string,
  rawArgs: unknown,
  organizationId: string,
): QueryArgs {
  if (!organizationId) throw new OrganizationScopeError('organizationId obbligatorio.');
  const args = asRecord(rawArgs, 'args');

  if (model === 'Organization' || model === 'AiCache') {
    throw new OrganizationScopeError(
      `${model} e un modello di sistema e non e disponibile dal client scoped.`,
    );
  }
  if (INDIRECTLY_SCOPED_MODELS.has(model)) {
    throw new OrganizationScopeError(
      `${model} non ha organizationId: usare una query nested dal relativo genitore scoped.`,
    );
  }
  if (!DIRECTLY_SCOPED_MODELS.has(model)) {
    throw new OrganizationScopeError(
      `Modello ${model} non classificato per lo scope organizzazione.`,
    );
  }

  if (FILTERED_OPERATIONS.has(operation)) {
    const scoped = scopeWhere(args, organizationId);
    if (operation === 'update' || operation.startsWith('updateMany')) {
      return { ...scoped, data: validateUpdateData(args.data, organizationId) };
    }
    return scoped;
  }

  if (operation === 'create') {
    return { ...args, data: scopeCreateData(args.data, organizationId) };
  }

  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const data = Array.isArray(args.data)
      ? args.data.map((row) => scopeCreateData(row, organizationId))
      : scopeCreateData(args.data, organizationId);
    return { ...args, data };
  }

  if (operation === 'upsert') {
    return {
      ...scopeWhere(args, organizationId),
      create: scopeCreateData(args.create, organizationId),
      update: validateUpdateData(args.update, organizationId),
    };
  }

  throw new OrganizationScopeError(
    `Operazione ${model}.${operation} non classificata: accesso negato per sicurezza.`,
  );
}
