'use client';

import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';
import { AlertTriangleIcon, ChevronDownIcon } from './icons';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
  labelClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    containerClassName,
    labelClassName,
    className,
    id,
    name,
    required,
    disabled,
    multiple,
    children,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const descriptions = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-1.5', containerClassName)}>
      <label
        htmlFor={fieldId}
        className={cn('text-sm font-semibold text-neutral-800', labelClassName)}
      >
        {label}
        {required && (
          <span className="text-aumento ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          name={name}
          required={required}
          disabled={disabled}
          multiple={multiple}
          aria-describedby={descriptions}
          aria-invalid={error ? true : ariaInvalid}
          className={cn(
            'min-h-tap w-full rounded-lg border bg-white px-3 py-2 text-base text-neutral-900 shadow-sm transition-colors sm:text-sm',
            'focus:border-brand-600 focus:ring-brand-600/20 focus:ring-3 focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
            multiple ? 'min-h-28 py-2' : 'appearance-none pr-10',
            error
              ? 'border-aumento focus:border-aumento focus:ring-aumento/15'
              : 'border-neutral-300 hover:border-neutral-400',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        {!multiple && (
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-neutral-500" />
        )}
      </div>

      {hint && (
        <p id={hintId} className="text-xs leading-5 text-neutral-500">
          {hint}
        </p>
      )}

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
