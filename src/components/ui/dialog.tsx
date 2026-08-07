'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { cn } from './cn';
import { XIcon } from './icons';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel = 'Chiudi finestra',
  closeOnBackdrop = true,
  initialFocusRef,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      initialFocusRef?.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [initialFocusRef, open]);

  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    } else {
      onOpenChange(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl bg-white p-0 text-neutral-900 shadow-2xl',
        'backdrop:bg-neutral-950/50 backdrop:backdrop-blur-[1px]',
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) close();
      }}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-balance text-neutral-900">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-neutral-600">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className={cn(
              'hover:bg-neutral-100 -mr-2 inline-flex size-tap shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-800',
              'focus-visible:ring-brand-600 focus-visible:ring-2 focus-visible:outline-none',
            )}
            aria-label={closeLabel}
          >
            <XIcon />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {footer && (
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
