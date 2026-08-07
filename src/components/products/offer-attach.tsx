'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Checkbox, Input, Select, useToast } from '@/components/ui';
import type { ProductApiBody, SupplierProductListItem } from '@/features/products/dto';
import { etichettaUnita, formatoConfezione } from '@/features/products/format';
import {
  supplierProductInputSchema,
  UNITA_DI_MISURA,
  type SupplierProductInput,
} from '@/features/products/schema';

interface FornitoreScelta {
  id: string;
  name: string;
}

/**
 * Collega un'offerta a un prodotto canonico: o riusando una già in archivio
 * ma orfana, o creandone una nuova.
 *
 * Le due strade stanno nella stessa schermata di proposito. Dopo il primo
 * import di listini la coda degli orfani sarà lunga, e la strada giusta sarà
 * quasi sempre «riusa», non «crea»: metterle una accanto all'altra evita di
 * duplicare righe che il sistema ha già.
 */
export function OfferAttach({
  productId,
  productName,
  orfane,
  fornitori,
  endpointOfferte,
}: {
  productId: string;
  productName: string;
  orfane: SupplierProductListItem[];
  fornitori: FornitoreScelta[];
  endpointOfferte: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState(false);
  const [campi, setCampi] = useState<Record<string, string[]>>({});
  const [nuova, setNuova] = useState<SupplierProductInput>(() => ({
    supplierId: fornitori[0]?.id ?? '',
    supplierCode: null,
    rawName: '',
    description: null,
    brand: null,
    category: null,
    packagingType: null,
    packQuantity: 1,
    packQuantityConfirmed: false,
    unitSize: '1',
    unitOfMeasure: 'PIECE',
    vatRate: null,
    gtin: null,
    productId,
  }));

  async function collega(offerta: SupplierProductListItem) {
    if (attesa) return;
    setAttesa(true);
    try {
      const risposta = await fetch(`${endpointOfferte}/${offerta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ azione: 'collega', productId }),
      });
      const corpo = (await risposta.json().catch(() => null)) as ProductApiBody<unknown> | null;
      if (!risposta.ok || !corpo?.ok) {
        toast({
          title: 'Collegamento non riuscito',
          description: corpo && !corpo.ok ? corpo.error : 'Il server non ha risposto correttamente.',
          tone: 'error',
        });
        return;
      }
      toast({ title: 'Offerta collegata', description: offerta.rawName, tone: 'success' });
      router.push(`/prodotti/${productId}`);
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  async function crea(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (attesa) return;

    const analizzato = supplierProductInputSchema.safeParse(nuova);
    if (!analizzato.success) {
      const errori: Record<string, string[]> = {};
      for (const issue of analizzato.error.issues) {
        const campo = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
        (errori[campo] ??= []).push(issue.message);
      }
      setCampi(errori);
      toast({ title: 'Controlla i campi evidenziati', tone: 'error' });
      return;
    }

    setAttesa(true);
    setCampi({});
    try {
      const risposta = await fetch(endpointOfferte, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(analizzato.data),
      });
      const corpo = (await risposta.json().catch(() => null)) as ProductApiBody<SupplierProductListItem> | null;
      if (!risposta.ok || !corpo?.ok) {
        if (corpo && !corpo.ok && corpo.fields) setCampi(corpo.fields);
        toast({
          title: 'Creazione non riuscita',
          description: corpo && !corpo.ok ? corpo.error : 'Il server non ha risposto correttamente.',
          tone: 'error',
        });
        return;
      }
      toast({ title: 'Offerta creata e collegata', description: corpo.data.rawName, tone: 'success' });
      router.push(`/prodotti/${productId}`);
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  function cambia<K extends keyof SupplierProductInput>(chiave: K, valore: SupplierProductInput[K]) {
    setNuova((precedente) => ({ ...precedente, [chiave]: valore }));
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xl font-black text-neutral-950">Offerte senza prodotto</h2>
        <p className="text-sm text-neutral-500">
          Articoli di fornitore già in archivio ma non ancora collegati a nessun prodotto canonico.
        </p>
        {orfane.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500">
            Nessuna offerta orfana: sono tutte già collegate.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {orfane.map((offerta) => (
              <li
                key={offerta.id}
                className="flex min-h-tap flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-neutral-900">
                    {offerta.rawName}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {offerta.supplierName}
                    {offerta.supplierCode ? ` · ${offerta.supplierCode}` : ''} ·{' '}
                    {formatoConfezione(offerta.unitSize, offerta.unitOfMeasure, offerta.packQuantity)}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={attesa}
                  onClick={() => collega(offerta)}
                >
                  Collega
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-black text-neutral-950">Oppure creane una nuova</h2>
        <p className="text-sm text-neutral-500">
          Verrà collegata subito a «{productName}». Il contenuto della confezione e l’impronta si
          calcolano da soli: non vanno inseriti.
        </p>

        <form onSubmit={crea} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              name="supplierId"
              label="Fornitore"
              required
              value={nuova.supplierId}
              onChange={(e) => cambia('supplierId', e.target.value)}
              error={campi.supplierId?.[0]}
            >
              {fornitori.map((fornitore) => (
                <option key={fornitore.id} value={fornitore.id}>
                  {fornitore.name}
                </option>
              ))}
            </Select>
            <Input
              name="supplierCode"
              label="Codice articolo del fornitore"
              value={nuova.supplierCode ?? ''}
              onChange={(e) => cambia('supplierCode', e.target.value || null)}
              error={campi.supplierCode?.[0]}
              hint="È il codice con cui lui evade l’ordine."
            />
          </div>

          <Input
            name="rawName"
            label="Descrizione come la scrive il fornitore"
            required
            value={nuova.rawName}
            onChange={(e) => cambia('rawName', e.target.value)}
            error={campi.rawName?.[0]}
            hint="Copiala com’è, comprese le abbreviazioni: serve a riconoscerla nei listini futuri."
            maxLength={300}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              name="unitSize"
              label="Formato del pezzo"
              required
              inputMode="decimal"
              value={nuova.unitSize}
              onChange={(e) => cambia('unitSize', e.target.value)}
              error={campi.unitSize?.[0]}
            />
            <Select
              name="unitOfMeasure"
              label="Unità"
              value={nuova.unitOfMeasure}
              onChange={(e) =>
                cambia('unitOfMeasure', e.target.value as SupplierProductInput['unitOfMeasure'])
              }
              error={campi.unitOfMeasure?.[0]}
            >
              {UNITA_DI_MISURA.map((unita) => (
                <option key={unita} value={unita}>
                  {etichettaUnita(unita)}
                </option>
              ))}
            </Select>
            <Input
              name="packQuantity"
              label="Pezzi per confezione"
              required
              inputMode="numeric"
              value={String(nuova.packQuantity)}
              onChange={(e) => cambia('packQuantity', Number(e.target.value) || 1)}
              error={campi.packQuantity?.[0]}
            />
          </div>

          <Checkbox
            checked={nuova.packQuantityConfirmed}
            onChange={(e) => cambia('packQuantityConfirmed', e.currentTarget.checked)}
            label="So con certezza quanti pezzi contiene la confezione"
            description="Se non lo sai, lascia deselezionato: l’offerta resterà fuori dai confronti di prezzo invece di entrarci con un numero inventato."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="vatRate"
              label="Aliquota IVA"
              inputMode="decimal"
              value={nuova.vatRate ?? ''}
              onChange={(e) => cambia('vatRate', e.target.value || null)}
              error={campi.vatRate?.[0]}
            />
            <Input
              name="category"
              label="Categoria"
              value={nuova.category ?? ''}
              onChange={(e) => cambia('category', e.target.value || null)}
              error={campi.category?.[0]}
            />
          </div>

          {campi._form?.[0] && <p className="text-aumento text-sm">{campi._form[0]}</p>}

          <Button type="submit" disabled={attesa || fornitori.length === 0}>
            Crea e collega
          </Button>
          {fornitori.length === 0 && (
            <p className="text-sm text-neutral-500">
              Non ci sono fornitori in anagrafica: <Badge variant="warning">creane uno prima</Badge>
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
