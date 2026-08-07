'use client';

import { Select } from '@/components/ui';
import type { DepartmentItem } from '@/features/taxonomy/dto';

/**
 * Il selettore della categoria: un solo controllo, con i reparti come gruppi.
 *
 * Due tendine in cascata — prima il reparto, poi la categoria — sarebbero due
 * tocchi invece di uno e, su telefono, due tastiere native da aprire e
 * chiudere. Un `optgroup` mostra la stessa gerarchia in un colpo solo, ed è
 * un controllo nativo: funziona col dito, con la tastiera e con lo screen
 * reader senza che noi si debba reimplementare niente.
 */
export function CategorySelect({
  reparti,
  value,
  onChange,
  name = 'categoryId',
  label = 'Categoria',
  error,
  includiVuoto = true,
  hint,
}: {
  reparti: readonly DepartmentItem[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  name?: string;
  label?: string;
  error?: string;
  includiVuoto?: boolean;
  hint?: string;
}) {
  return (
    <Select
      name={name}
      label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      error={error}
      hint={hint}
    >
      {includiVuoto && <option value="">Da classificare</option>}
      {reparti.map((reparto) => (
        <optgroup key={reparto.id} label={reparto.name}>
          {reparto.categories.map((categoria) => (
            <option
              key={categoria.id}
              value={categoria.id}
              disabled={!reparto.active || !categoria.active}
            >
              {categoria.name}
              {!reparto.active || !categoria.active ? ' (non attiva)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
