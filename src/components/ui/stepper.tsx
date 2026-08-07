'use client';

import {
  useId,
  useState,
  type FocusEventHandler,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from './cn';
import { MinusIcon, PlusIcon } from './icons';

export interface StepperProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'className'
> {
  value: number;
  onValueChange: (value: number) => void;
  label: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  visuallyHideLabel?: boolean;
  decrementLabel?: string;
  incrementLabel?: string;
  containerClassName?: string;
  inputClassName?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}

function decimalPlaces(value: number): number {
  const valueAsString = String(value);
  return valueAsString.includes('.') ? (valueAsString.split('.')[1]?.length ?? 0) : 0;
}

function clamp(value: number, min: number, max: number | undefined): number {
  return Math.min(Math.max(value, min), max ?? Number.POSITIVE_INFINITY);
}

function snapToStep(value: number, min: number, max: number | undefined, step: number): number {
  const precision = Math.max(decimalPlaces(min), decimalPlaces(step));
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(clamp(snapped, min, max).toFixed(precision));
}

export function Stepper({
  value,
  onValueChange,
  label,
  min = 0,
  max,
  step = 1,
  visuallyHideLabel = false,
  decrementLabel = 'Diminuisci quantità',
  incrementLabel = 'Aumenta quantità',
  containerClassName,
  inputClassName,
  id,
  name,
  disabled,
  readOnly,
  onBlur,
  'aria-describedby': ariaDescribedBy,
  ...props
}: StepperProps) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  const [draft, setDraft] = useState<string | null>(null);
  const validStep = Number.isFinite(step) && step > 0 ? step : 1;

  function setNext(next: number) {
    const normalized = snapToStep(next, min, max, validStep);
    setDraft(null);
    if (normalized !== value) onValueChange(normalized);
  }

  const decrementDisabled = disabled || readOnly || value <= min;
  const incrementDisabled = disabled || readOnly || (max !== undefined && value >= max);

  return (
    <div className={cn('grid w-fit gap-1.5', containerClassName)}>
      <label
        htmlFor={fieldId}
        className={cn('text-sm font-semibold text-neutral-800', visuallyHideLabel && 'sr-only')}
      >
        {label}
      </label>

      <div className="inline-flex items-stretch rounded-lg shadow-sm">
        <button
          type="button"
          disabled={decrementDisabled}
          onClick={() => setNext(value - validStep)}
          className={cn(
            'border-neutral-300 hover:bg-neutral-50 inline-flex min-h-tap min-w-tap items-center justify-center rounded-l-lg border bg-white text-neutral-700 transition-colors',
            'focus-visible:ring-brand-600 focus-visible:z-10 focus-visible:ring-2 focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-300',
          )}
          aria-label={decrementLabel}
        >
          <MinusIcon />
        </button>

        <input
          id={fieldId}
          name={name}
          type="number"
          inputMode={validStep % 1 === 0 ? 'numeric' : 'decimal'}
          min={min}
          max={max}
          step={validStep}
          value={draft ?? String(value)}
          disabled={disabled}
          readOnly={readOnly}
          aria-describedby={ariaDescribedBy}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            if (raw === '') return;

            const parsed = Number(raw);
            if (Number.isFinite(parsed) && parsed >= min && (max === undefined || parsed <= max)) {
              onValueChange(parsed);
            }
          }}
          onBlur={(event) => {
            const raw = event.currentTarget.value.trim();
            const parsed = raw === '' ? value : Number(raw);
            setNext(Number.isFinite(parsed) ? parsed : value);
            onBlur?.(event);
          }}
          className={cn(
            'tabellare -mx-px min-h-tap w-20 border border-neutral-300 bg-white px-2 text-center text-base text-neutral-900 sm:w-24 sm:text-sm',
            'focus:border-brand-600 focus:ring-brand-600/20 focus:z-10 focus:ring-3 focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            inputClassName,
          )}
          {...props}
        />

        <button
          type="button"
          disabled={incrementDisabled}
          onClick={() => setNext(value + validStep)}
          className={cn(
            'border-neutral-300 hover:bg-neutral-50 inline-flex min-h-tap min-w-tap items-center justify-center rounded-r-lg border bg-white text-neutral-700 transition-colors',
            'focus-visible:ring-brand-600 focus-visible:z-10 focus-visible:ring-2 focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-300',
          )}
          aria-label={incrementLabel}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}
