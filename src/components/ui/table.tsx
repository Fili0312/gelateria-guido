import {
  forwardRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { cn } from './cn';

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
  scrollLabel?: string;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  {
    containerClassName,
    scrollLabel = 'Tabella scorrevole orizzontalmente',
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto rounded-xl border border-neutral-200 bg-white',
        'focus-visible:ring-brand-600 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        containerClassName,
      )}
      tabIndex={0}
      role="region"
      aria-label={scrollLabel}
    >
      <table
        ref={ref}
        className={cn(
          'tabellare min-w-[40rem] border-separate border-spacing-0 text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
});

export const TableCaption = forwardRef<
  HTMLTableCaptionElement,
  HTMLAttributes<HTMLTableCaptionElement>
>(function TableCaption({ className, ...props }, ref) {
  return (
    <caption
      ref={ref}
      className={cn('px-4 py-3 text-left text-sm text-neutral-500', className)}
      {...props}
    />
  );
});

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableHeader({ className, ...props }, ref) {
  return <thead ref={ref} className={cn('bg-neutral-50', className)} {...props} />;
});

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableBody({ className, ...props }, ref) {
  return <tbody ref={ref} className={cn('divide-y divide-neutral-100', className)} {...props} />;
});

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  function TableRow({ className, ...props }, ref) {
    return (
      <tr
        ref={ref}
        className={cn(
          'transition-colors hover:bg-neutral-50 data-[selected=true]:bg-brand-50',
          className,
        )}
        {...props}
      />
    );
  },
);

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  { numeric = false, className, ...props },
  ref,
) {
  return (
    <th
      ref={ref}
      className={cn(
        'border-b border-neutral-200 px-4 py-3 text-left text-xs font-semibold tracking-wide text-neutral-600 uppercase',
        'first:rounded-tl-xl last:rounded-tr-xl',
        numeric && 'text-right whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
});

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { numeric = false, className, ...props },
  ref,
) {
  return (
    <td
      ref={ref}
      className={cn(
        'px-4 py-3 align-middle text-neutral-700',
        numeric && 'tabellare text-right whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
});

export interface TableEmptyProps extends HTMLAttributes<HTMLTableRowElement> {
  colSpan: number;
  cellClassName?: string;
}

export function TableEmpty({
  colSpan,
  className,
  cellClassName,
  children = 'Nessun risultato',
  ...props
}: TableEmptyProps) {
  return (
    <tr className={className} {...props}>
      <td
        colSpan={colSpan}
        className={cn('px-4 py-12 text-center text-sm text-neutral-500', cellClassName)}
      >
        {children}
      </td>
    </tr>
  );
}
