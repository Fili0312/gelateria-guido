'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { AlertTriangleIcon } from './icons';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
  labelClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
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

      <input
        ref={ref}
        id={fieldId}
        name={name}
        required={required}
        disabled={disabled}
        aria-describedby={descriptions}
        aria-invalid={error ? true : ariaInvalid}
        className={cn(
          'min-h-tap w-full rounded-lg border bg-white px-3 py-2 text-base text-neutral-900 shadow-sm transition-colors sm:text-sm',
          'placeholder:text-neutral-400',
          'focus:border-brand-600 focus:ring-brand-600/20 focus:ring-3 focus:outline-none',
          'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
          error
            ? 'border-aumento focus:border-aumento focus:ring-aumento/15'
            : 'border-neutral-300 hover:border-neutral-400',
          className,
        )}
        {...props}
      />

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
