'use client';

import { useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { Badge, Button, Dialog } from '@/components/ui';

export function NewListDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        leadingIcon={<AppIcon name="lists" className="h-5 w-5" />}
        onClick={() => setOpen(true)}
      >
        Nuovo listino
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="L’importazione arriva nella Fase 7"
        description="Il nucleo dati è già pronto; prima completiamo anagrafiche, catalogo e storico manuale, così l’estrattore non diventa un punto unico di blocco."
        footer={
          <Button onClick={() => setOpen(false)} fullWidth>
            Ho capito
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-4">
            <span className="bg-brand-100 text-brand-700 grid h-10 w-10 shrink-0 place-items-center rounded-xl">
              <AppIcon name="sparkles" className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-neutral-900">Il prossimo passo</p>
                <Badge variant="brand">Fase 4</Badge>
              </div>
              <p className="mt-1 text-sm leading-6 text-neutral-600">
                Gestire i fornitori, poi catalogo e storico. Le sezioni sono già predisposte nel
                menu.
              </p>
            </div>
          </div>
          <p className="text-sm leading-6 text-neutral-500">
            Nessun dato viene perso: i listini reali restano nello storage protetto e saranno
            collegati al fornitore durante l’importazione.
          </p>
        </div>
      </Dialog>
    </>
  );
}
