import type { SupplierRelationCounts } from './dto';

function formatWholePart(value: string): string {
  const normalized = (value || '0').replace(/^0+(?=\d)/, '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatDecimalIt(value: string | null, suffix = ''): string {
  if (value === null) return 'Non indicato';
  const [wholeRaw = '', fractionRaw = ''] = value.split('.');
  const whole = formatWholePart(wholeRaw);
  const fraction = fractionRaw.replace(/0+$/, '');
  return `${whole}${fraction ? `,${fraction}` : ''}${suffix}`;
}

export function formatEuro(value: string | null): string {
  if (value === null) return 'Nessun minimo';
  const [wholeRaw = '', fractionRaw = ''] = value.split('.');
  const whole = formatWholePart(wholeRaw);
  const fraction = fractionRaw.padEnd(2, '0').slice(0, 2);
  return `€ ${whole},${fraction}`;
}

export function supplierInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export function linkedDataSummary(counts: SupplierRelationCounts): string[] {
  const labels: Array<[keyof SupplierRelationCounts, string, string]> = [
    ['supplierProducts', 'prodotto collegato', 'prodotti collegati'],
    ['priceLists', 'listino', 'listini'],
    ['importProfiles', 'profilo di importazione', 'profili di importazione'],
    ['orderLines', 'riga d’ordine', 'righe d’ordine'],
    ['orderDocuments', 'documento d’ordine', 'documenti d’ordine'],
    ['emailDeliveries', 'invio email', 'invii email'],
    ['aliases', 'alias prodotto', 'alias prodotto'],
  ];

  return labels.flatMap(([key, singular, plural]) => {
    const count = counts[key];
    return count > 0 ? [`${count} ${count === 1 ? singular : plural}`] : [];
  });
}
