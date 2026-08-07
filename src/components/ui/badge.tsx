import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  success: 'bg-diminuzione/10 text-diminuzione ring-diminuzione/20',
  warning: 'bg-attenzione/15 text-amber-900 ring-attenzione/25',
  danger: 'bg-aumento/10 text-aumento ring-aumento/20',
};

const dotClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-neutral-400',
  brand: 'bg-brand-600',
  success: 'bg-diminuzione',
  warning: 'bg-attenzione',
  danger: 'bg-aumento',
};

export function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('size-1.5 rounded-full', dotClasses[variant])} aria-hidden />}
      {children}
    </span>
  );
}
