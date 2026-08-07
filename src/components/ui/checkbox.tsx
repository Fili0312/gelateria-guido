'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { AlertTriangleIcon } from './icons';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
  labelClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    description,
    error,
    containerClassName,
    labelClassName,
    className,
    id,
    name,
    required,
    disabled,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const descriptions =
    [ariaDescribedBy, descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-1.5', containerClassName)}>
      <label
        htmlFor={fieldId}
        className={cn(
          'flex min-h-tap items-start gap-3 rounded-lg border px-3 py-2 transition-colors',
          'focus-within:ring-brand-600 focus-within:ring-2 focus-within:ring-offset-2',
          disabled
            ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-500'
            : 'cursor-pointer border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50',
          Boolean(error) && 'border-aumento bg-red-50/40 focus-within:ring-aumento',
          labelClassName,
        )}
      >
        <input
          ref={ref}
          id={fieldId}
          name={name}
          type="checkbox"
          required={required}
          disabled={disabled}
          aria-describedby={descriptions}
          aria-invalid={error ? true : ariaInvalid}
          className={cn(
            'accent-brand-600 mt-1 size-5 shrink-0 rounded border-neutral-300',
            'focus-visible:outline-none',
            'disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />
        <span className="min-w-0">
          <span
            className={cn(
              'block text-sm font-semibold',
              disabled ? 'text-neutral-500' : 'text-neutral-800',
            )}
          >
            {label}
            {required && (
              <span className="text-aumento ml-1" aria-hidden="true">
                *
              </span>
            )}
          </span>
          {description && (
            <span id={descriptionId} className="mt-0.5 block text-xs leading-5 text-neutral-500">
              {description}
            </span>
          )}
        </span>
      </label>

      {error && (
        <p
          id={errorId}
          className="text-aumento flex items-start gap-1.5 text-xs font-medium leading-5"
          role="alert"
        >
          <AlertTriangleIcon className="mt-0.5 size-4" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
});
