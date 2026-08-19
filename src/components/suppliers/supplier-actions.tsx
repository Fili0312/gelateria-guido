'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, useToast } from '@/components/ui';
import type { SupplierApiBody, SupplierDetail } from '@/features/suppliers/dto';
import { supplierHasLinkedData } from '@/features/suppliers/dto';
import { linkedDataSummary } from '@/features/suppliers/format';

type PendingAction = 'status' | 'delete' | null;

export function SupplierActions({
  supplier,
  endpoint,
}: {
  supplier: SupplierDetail;
  endpoint: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingAction>(null);
  const hasLinkedData = supplierHasLinkedData(supplier.counts);
  const linkedSummary = linkedDataSummary(supplier.counts);

  async function changeStatus() {
    const nextActive = !supplier.active;
    const action = nextActive ? 'riattivare' : 'disattivare';
    if (!window.confirm(`Vuoi ${action} ${supplier.name}?`)) return;

    setPending('status');
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      });
      const body = (await response
        .json()
        .catch(() => null)) as SupplierApiBody<SupplierDetail> | null;
      if (!response.ok || !body?.ok) {
        toast({
          title: 'Stato non aggiornato',
          description:
            body && !body.ok ? body.error : 'Il server non ha restituito una risposta valida.',
          tone: 'error',
        });
        return;
      }

      toast({
        title: nextActive ? 'Fornitore riattivato' : 'Fornitore disattivato',
        description: nextActive
          ? 'È nuovamente disponibile nelle operazioni.'
          : 'I dati collegati sono rimasti invariati.',
        tone: 'success',
      });
      router.refresh();
    } catch {
      toast({
        title: 'Server non raggiungibile',
        description: 'Verificare la connessione e riprovare.',
        tone: 'error',
      });
    } finally {
      setPending(null);
    }
  }

  async function deleteSupplier() {
    if (supplier.active || hasLinkedData) return;
    if (
      !window.confirm(
        `Eliminare definitivamente ${supplier.name}? Questa operazione non può essere annullata.`,
      )
    ) {
      return;
    }

    setPending('delete');
    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      const body = (await response.json().catch(() => null)) as SupplierApiBody<{
        id: string;
      }> | null;
      if (!response.ok || !body?.ok) {
        toast({
          title: 'Cancellazione non riuscita',
          description:
            body && !body.ok ? body.error : 'Il server non ha restituito una risposta valida.',
          tone: 'error',
        });
        router.refresh();
        return;
      }

      toast({
        title: 'Fornitore eliminato',
        description: supplier.name,
        tone: 'success',
      });
      router.push('/fornitori');
      router.refresh();
    } catch {
      toast({
        title: 'Server non raggiungibile',
        description: 'Verificare la connessione e riprovare.',
        tone: 'error',
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant={supplier.active ? 'secondary' : 'primary'}
          onClick={changeStatus}
          loading={pending === 'status'}
          loadingLabel="Aggiornamento stato"
          disabled={pending !== null}
        >
          {supplier.active ? 'Disattiva' : 'Riattiva'}
        </Button>
        {!supplier.active && !hasLinkedData && (
          <Button
            variant="danger"
            onClick={deleteSupplier}
            loading={pending === 'delete'}
            loadingLabel="Cancellazione fornitore"
            disabled={pending !== null}
          >
            Elimina definitivamente
          </Button>
        )}
      </div>
      {supplier.active && (
        <p className="max-w-sm text-xs leading-5 text-neutral-500">
          Per cancellarlo definitivamente, disattivalo prima.
        </p>
      )}
      {!supplier.active && hasLinkedData && (
        <p className="max-w-sm text-xs leading-5 text-neutral-500">
          Non è eliminabile perché conserva {linkedSummary.join(', ')}. Può restare inattivo senza
          perdere lo storico.
        </p>
      )}
    </div>
  );
}
