'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { Button, Input, Select, useToast } from '@/components/ui';
import type { ProductApiBody, ProductDetail } from '@/features/products/dto';
import { productInputSchema, UNITA_DI_MISURA, type ProductInput } from '@/features/products/schema';
import { etichettaUnita, formatoUnitario } from '@/features/products/format';
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

function Sezione({
  titolo,
  nota,
  children,
}: {
  titolo: string;
  nota: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-900/[0.025]">
      <h2 className="font-black text-neutral-950">{titolo}</h2>
      <p className="mt-1 mb-4 max-w-2xl text-sm leading-5 text-neutral-500">{nota}</p>
      <div className="space-y-4">{children}</div>
    </section>
  );
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

  /** Com'è scritto il formato mentre lo si digita. */
  const anteprimaFormato =
    valori.unitSize && Number(valori.unitSize) > 0
      ? formatoUnitario(valori.unitSize, valori.unitOfMeasure)
      : null;

  return (
    <form onSubmit={invia} className="space-y-4" noValidate>
      {/* Il modulo era una colonna di dieci campi tutti uguali: si compilava
          leggendo ogni etichetta, perché niente diceva quali andassero
          insieme. Ora sono tre gruppi con un titolo, e il titolo risponde
          alla domanda «cosa sto dicendo adesso». */}
      <Sezione
        titolo="Che cos’è"
        nota="Il nome è quello che userai tu per cercarlo. Le descrizioni dei fornitori restano le loro, e si collegano sotto."
      >
        <Input
          name="name"
          label="Nome del prodotto"
          required
          value={valori.name}
          onChange={(e) => cambia('name', e.target.value)}
          error={campi.name?.[0]}
          hint="Il formato può stare nel nome: viene riconosciuto."
          maxLength={200}
        />
        {anteprima && (
          <p className="text-xs leading-5 text-neutral-500">
            Lo ritroverai anche scrivendolo in modo diverso: accenti, maiuscole e punteggiatura non
            contano.
          </p>
        )}
        <Input
          name="brand"
          label="Marca"
          value={valori.brand ?? ''}
          onChange={(e) => cambia('brand', e.target.value || null)}
          error={campi.brand?.[0]}
        />
      </Sezione>

      <Sezione
        titolo="Quanto ce n’è dentro"
        nota="È il formato del singolo pezzo, non della cassa: quanti pezzi ci sono in un collo lo dice il listino di ogni fornitore."
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
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
            onChange={(e) =>
              cambia('unitOfMeasure', e.target.value as ProductInput['unitOfMeasure'])
            }
            error={campi.unitOfMeasure?.[0]}
          >
            {UNITA_DI_MISURA.map((unita) => (
              <option key={unita} value={unita}>
                {etichettaUnita(unita)}
              </option>
            ))}
          </Select>
          {/* L'anteprima mentre si scrive: «70» e «cl» separati non fanno
              vedere l'errore, «70 cl» sì — ed è la stringa che finirà su ogni
              schermata e sui confronti. */}
          <p className="sm:pb-2">
            <span className="block text-[11px] tracking-wide text-neutral-400 uppercase">
              Verrà scritto
            </span>
            <span className="text-sm font-bold text-neutral-950">{anteprimaFormato ?? '—'}</span>
          </p>
        </div>
      </Sezione>

      <Sezione
        titolo="Dove va"
        nota="La categoria raggruppa l’ordine per reparto. Si può lasciare vuota e assegnarla dopo, anche in blocco con l’IA."
      >
        <CategorySelect
          reparti={reparti}
          value={valori.categoryId}
          onChange={(id) => cambia('categoryId', id)}
          error={campi.categoryId?.[0]}
        />
        <Input
          name="gtin"
          label="Codice a barre"
          value={valori.gtin ?? ''}
          onChange={(e) => cambia('gtin', e.target.value || null)}
          error={campi.gtin?.[0]}
          hint="Da 8 a 14 cifre. Nei listini della gelateria non ce n’è nessuno: si compila solo se lo si ha davvero."
          inputMode="numeric"
        />
      </Sezione>

      {/* I comandi restano a portata anche scorrendo: un modulo che si salva
          solo tornando in fondo fa perdere le modifiche a chi non ci torna. */}
      <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg shadow-neutral-900/10 backdrop-blur sm:flex-row sm:items-center">
        <Button type="submit" disabled={attesa} className="min-h-11">
          {attesa ? 'Salvo…' : mode === 'create' ? 'Crea prodotto' : 'Salva modifiche'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={attesa}
          className="min-h-11"
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}
