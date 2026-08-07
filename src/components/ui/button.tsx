import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { SpinnerIcon } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-900 disabled:bg-brand-300',
  secondary:
    'border border-neutral-300 bg-white text-neutral-800 shadow-sm hover:border-neutral-400 hover:bg-neutral-50 active:bg-neutral-100',
  danger:
    'bg-aumento text-white shadow-sm hover:brightness-90 active:brightness-75 disabled:opacity-45',
  ghost: 'bg-transparent text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-tap px-3 py-2 text-sm',
  md: 'min-h-tap px-4 py-2.5 text-sm',
  lg: 'min-h-12 px-5 py-3 text-base',
  icon: 'size-tap p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel = 'Operazione in corso',
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    disabled,
    type = 'button',
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold transition-colors',
        'focus-visible:ring-brand-600 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <SpinnerIcon />
          <span className="sr-only">{loadingLabel}: </span>
        </>
      ) : (
        leadingIcon
      )}
      {size === 'icon' && typeof children === 'string' ? (
        <span className="sr-only">{children}</span>
      ) : (
        children
      )}
      {!loading && trailingIcon}
    </button>
  );
});
