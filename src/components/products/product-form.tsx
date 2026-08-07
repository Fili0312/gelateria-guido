'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { Button, Input, Select, useToast } from '@/components/ui';
import type { ProductApiBody, ProductDetail } from '@/features/products/dto';
import { productInputSchema, UNITA_DI_MISURA, type ProductInput } from '@/features/products/schema';
import { etichettaUnita } from '@/features/products/format';
import { CategorySelect } from '@/components/taxonomy/category-select';
import type { DepartmentItem } from '@/features/taxonomy/dto';

const VUOTO: ProductInput = {
  name: '',
  brand: null,
  categoryId: null,
  unitSize: '1',
  unitOfMeasure: 'PIECE',
  gtin: null,
};

function issuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const campi: Record<string, string[]> = {};
  for (const issue of issues) {
    const campo = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
    (campi[campo] ??= []).push(issue.message);
  }
  return campi;
}

export function ProductForm({
  mode,
  endpoint,
  iniziale,
  reparti,
}: {
  mode: 'create' | 'edit';
  endpoint: string;
  iniziale?: ProductInput;
  reparti: readonly DepartmentItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [valori, setValori] = useState<ProductInput>(() => iniziale ?? VUOTO);
  const [campi, setCampi] = useState<Record<string, string[]>>({});
  const [attesa, setAttesa] = useState(false);

  function cambia<K extends keyof ProductInput>(chiave: K, valore: ProductInput[K]) {
    setValori((precedente) => ({ ...precedente, [chiave]: valore }));
  }

  /**
   * L'anteprima mostra come verrà scritto il nome nell'indice di ricerca.
   * Non è un vezzo: il nome normalizzato è ciò che si cerca davvero, e vederlo
   * mentre si scrive evita di scoprire troppo tardi che un prodotto non si
   * trova perché il nome è tutto formato e niente sostanza.
   */
  const anteprima = useMemo(() => valori.name.trim(), [valori.name]);

  async function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (attesa) return;

    const analizzato = productInputSchema.safeParse(valori);
    if (!analizzato.success) {
      setCampi(issuesToFields(analizzato.error.issues));
      toast({ title: 'Controlla i campi evidenziati', tone: 'error' });
      return;
    }

    setAttesa(true);
    setCampi({});
    try {
      const risposta = await fetch(endpoint, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(analizzato.data),
      });
      const corpo = (await risposta
        .json()
        .catch(() => null)) as ProductApiBody<ProductDetail> | null;

      if (!risposta.ok || !corpo?.ok) {
        if (corpo && !corpo.ok && corpo.fields) setCampi(corpo.fields);
        toast({
          title: mode === 'create' ? 'Creazione non riuscita' : 'Modifica non riuscita',
          description:
            corpo && !corpo.ok ? corpo.error : 'Il server non ha risposto correttamente.',
          tone: 'error',
        });
        return;
      }

      toast({
        title: mode === 'create' ? 'Prodotto creato' : 'Prodotto aggiornato',
        description: corpo.data.name,
        tone: 'success',
      });
      router.push(`/prodotti/${corpo.data.id}`);
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  return (
    <form onSubmit={invia} className="space-y-5" noValidate>
      <Input
        name="name"
        label="Nome del prodotto"
        required
        value={valori.name}
        onChange={(e) => cambia('name', e.target.value)}
        error={campi.name?.[0]}
        hint="Come lo chiami tu, non come lo scrive il fornitore. Il formato può stare nel nome: viene riconosciuto."
        maxLength={200}
      />

      {anteprima && (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          Verrà cercato anche scrivendolo in modo diverso: accenti, maiuscole e punteggiatura non
          contano.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="unitSize"
          label="Formato del singolo pezzo"
          required
          inputMode="decimal"
          value={valori.unitSize}
          onChange={(e) => cambia('unitSize', e.target.value)}
          error={campi.unitSize?.[0]}
          hint="Per una bottiglia da 33 cl scrivi 33 e scegli «cl»."
        />
        <Select
          name="unitOfMeasure"
          label="Unità di misura"
          value={valori.unitOfMeasure}
          onChange={(e) => cambia('unitOfMeasure', e.target.value as ProductInput['unitOfMeasure'])}
          error={campi.unitOfMeasure?.[0]}
        >
          {UNITA_DI_MISURA.map((unita) => (
            <option key={unita} value={unita}>
              {etichettaUnita(unita)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="brand"
          label="Marca"
          value={valori.brand ?? ''}
          onChange={(e) => cambia('brand', e.target.value || null)}
          error={campi.brand?.[0]}
        />
        <CategorySelect
          reparti={reparti}
          value={valori.categoryId}
          onChange={(id) => cambia('categoryId', id)}
          error={campi.categoryId?.[0]}
          hint="Serve a raggruppare l'ordine per reparto. Si può lasciare vuota e assegnare dopo."
        />
      </div>

      <Input
        name="gtin"
        label="Codice a barre"
        value={valori.gtin ?? ''}
        onChange={(e) => cambia('gtin', e.target.value || null)}
        error={campi.gtin?.[0]}
        hint="Da 8 a 14 cifre. Nei listini della gelateria non ce n’è nessuno: si compila solo se lo si ha davvero."
        inputMode="numeric"
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={attesa}>
          {mode === 'create' ? 'Crea prodotto' : 'Salva modifiche'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={attesa}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
