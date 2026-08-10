'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AppIcon } from '@/components/app-icon';
import { Button, Checkbox, Input, Select, Textarea, useToast } from '@/components/ui';
import type { SupplierApiBody, SupplierDetail } from '@/features/suppliers/dto';
import { supplierInputSchema, type SupplierInput } from '@/features/suppliers/schema';

const EMPTY_SUPPLIER: SupplierInput = {
  name: '',
  code: null,
  vatNumber: null,
  email: null,
  phone: null,
  contactName: null,
  address: null,
  notes: null,
  pricesIncludeVat: false,
  defaultVatRate: null,
  minOrderValue: null,
  deliveryDays: null,
  extraDiscountPct: null,
  extraDiscountNote: null,
  orderEmail: null,
  orderEmailCc: null,
  sendOrdersByEmail: false,
  emailNote: null,
  active: true,
};

function detailAsInput(detail: SupplierDetail): SupplierInput {
  return {
    name: detail.name,
    code: detail.code,
    vatNumber: detail.vatNumber,
    email: detail.email,
    phone: detail.phone,
    contactName: detail.contactName,
    address: detail.address,
    notes: detail.notes,
    pricesIncludeVat: detail.pricesIncludeVat,
    defaultVatRate: detail.defaultVatRate,
    minOrderValue: detail.minOrderValue,
    deliveryDays: detail.deliveryDays,
    extraDiscountPct: detail.extraDiscountPct,
    extraDiscountNote: detail.extraDiscountNote,
    orderEmail: detail.orderEmail,
    orderEmailCc: detail.orderEmailCc,
    sendOrdersByEmail: detail.sendOrdersByEmail,
    emailNote: detail.emailNote,
    active: detail.active,
  };
}

function issuesToFields(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

function firstError(fields: Record<string, string[]>, field: string): string | undefined {
  return fields[field]?.[0];
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-neutral-100 px-5 py-5 sm:px-6">
      <h2 className="text-lg font-black tracking-tight text-neutral-950">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-neutral-500">{description}</p>
    </div>
  );
}

export function SupplierForm({
  mode,
  endpoint,
  cancelHref,
  initialSupplier,
}: {
  mode: 'create' | 'edit';
  endpoint: string;
  cancelHref: string;
  initialSupplier?: SupplierDetail;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<SupplierInput>(() =>
    initialSupplier ? detailAsInput(initialSupplier) : EMPTY_SUPPLIER,
  );
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  function textValue(field: keyof SupplierInput): string {
    const value = values[field];
    return typeof value === 'string' ? value : '';
  }

  function setText(field: keyof SupplierInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFields((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const parsed = supplierInputSchema.safeParse(values);
    if (!parsed.success) {
      const nextFields = issuesToFields(parsed.error.issues);
      setFields(nextFields);
      toast({
        title: 'Controlla i campi evidenziati',
        description: 'Uno o più valori non sono validi.',
        tone: 'error',
      });
      return;
    }

    setPending(true);
    setFields({});
    try {
      const response = await fetch(endpoint, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response
        .json()
        .catch(() => null)) as SupplierApiBody<SupplierDetail> | null;

      if (!response.ok || !body?.ok) {
        if (body && !body.ok && body.fields) setFields(body.fields);
        toast({
          title: mode === 'create' ? 'Creazione non riuscita' : 'Modifica non riuscita',
          description:
            body && !body.ok ? body.error : 'Il server non ha restituito una risposta valida.',
          tone: 'error',
        });
        return;
      }

      toast({
        title: mode === 'create' ? 'Fornitore creato' : 'Fornitore aggiornato',
        description: body.data.name,
        tone: 'success',
      });
      router.push(`/fornitori/${body.data.id}`);
      router.refresh();
    } catch {
      toast({
        title: 'Server non raggiungibile',
        description: 'Controlla la connessione e riprova.',
        tone: 'error',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <SectionHeader
          title="Identità e contatti"
          description="I riferimenti commerciali usati per riconoscere e contattare il fornitore."
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <Input
            name="name"
            label="Nome fornitore"
            required
            autoFocus
            maxLength={160}
            value={values.name}
            onChange={(event) => setText('name', event.target.value)}
            error={firstError(fields, 'name')}
            containerClassName="sm:col-span-2"
          />
          <Input
            name="code"
            label="Codice interno"
            maxLength={60}
            value={textValue('code')}
            onChange={(event) => setText('code', event.target.value)}
            error={firstError(fields, 'code')}
            placeholder="Es. FORN-001"
          />
          <Input
            name="vatNumber"
            label="Partita IVA"
            maxLength={32}
            value={textValue('vatNumber')}
            onChange={(event) => setText('vatNumber', event.target.value)}
            error={firstError(fields, 'vatNumber')}
          />
          <Input
            name="contactName"
            label="Referente commerciale"
            maxLength={120}
            value={textValue('contactName')}
            onChange={(event) => setText('contactName', event.target.value)}
            error={firstError(fields, 'contactName')}
          />
          <Input
            name="phone"
            label="Telefono"
            type="tel"
            autoComplete="tel"
            maxLength={50}
            value={textValue('phone')}
            onChange={(event) => setText('phone', event.target.value)}
            error={firstError(fields, 'phone')}
          />
          <Input
            name="email"
            label="Email commerciale"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={textValue('email')}
            onChange={(event) => setText('email', event.target.value)}
            error={firstError(fields, 'email')}
            hint="Può essere diversa dall’indirizzo dell’ufficio ordini."
            containerClassName="sm:col-span-2"
          />
          <Textarea
            name="address"
            label="Indirizzo"
            rows={3}
            maxLength={500}
            value={textValue('address')}
            onChange={(event) => setText('address', event.target.value)}
            error={firstError(fields, 'address')}
            containerClassName="sm:col-span-2"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <SectionHeader
          title="Condizioni di acquisto"
          description="Questi valori incidono sui confronti di prezzo e sulla preparazione degli ordini."
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <Select
            name="pricesIncludeVat"
            label="Regime prezzi del listino"
            value={values.pricesIncludeVat ? 'included' : 'excluded'}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                pricesIncludeVat: event.target.value === 'included',
              }))
            }
            error={firstError(fields, 'pricesIncludeVat')}
            hint="Non confrontare mai prezzi netti e lordi come se fossero uguali."
          >
            <option value="excluded">IVA esclusa (prezzi netti)</option>
            <option value="included">IVA inclusa (prezzi lordi)</option>
          </Select>
          <Input
            name="defaultVatRate"
            label="IVA predefinita (%)"
            inputMode="decimal"
            maxLength={6}
            placeholder="22"
            value={textValue('defaultVatRate')}
            onChange={(event) => setText('defaultVatRate', event.target.value)}
            error={firstError(fields, 'defaultVatRate')}
          />
          <Input
            name="minOrderValue"
            label="Minimo d’ordine (€)"
            inputMode="decimal"
            maxLength={15}
            placeholder="0,00"
            value={textValue('minOrderValue')}
            onChange={(event) => setText('minOrderValue', event.target.value)}
            error={firstError(fields, 'minOrderValue')}
            hint="Lascia vuoto se non esiste un minimo."
          />
          <Input
            name="extraDiscountPct"
            label="Sconto extra (%)"
            inputMode="decimal"
            maxLength={6}
            placeholder="10"
            value={textValue('extraDiscountPct')}
            onChange={(event) => setText('extraDiscountPct', event.target.value)}
            error={firstError(fields, 'extraDiscountPct')}
            hint="Premio a posteriori su tutti gli articoli. Non abbassa il prezzo dell’ordine — entra nel confronto e si conta a parte."
          />
          <Input
            name="extraDiscountNote"
            label="Nota sullo sconto"
            maxLength={300}
            placeholder="Es. accordo annuale, escluse le birre"
            value={textValue('extraDiscountNote')}
            onChange={(event) => setText('extraDiscountNote', event.target.value)}
            error={firstError(fields, 'extraDiscountNote')}
            hint="Le eccezioni si segnano sulla singola offerta, nella scheda prodotto."
          />
          <Input
            name="deliveryDays"
            label="Giorni di consegna"
            maxLength={160}
            placeholder="Es. martedì e venerdì"
            value={textValue('deliveryDays')}
            onChange={(event) => setText('deliveryDays', event.target.value)}
            error={firstError(fields, 'deliveryDays')}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <SectionHeader
          title="Invio ordini"
          description="Prepariamo ora i recapiti che verranno usati dall’invio automatico nella Fase 17."
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <Checkbox
            name="sendOrdersByEmail"
            label="Abilita l’invio degli ordini via email"
            description="Quando l’invio sarà attivo, il PDF partirà all’indirizzo dell’ufficio ordini."
            checked={values.sendOrdersByEmail}
            onChange={(event) =>
              setValues((current) => ({ ...current, sendOrdersByEmail: event.target.checked }))
            }
            error={firstError(fields, 'sendOrdersByEmail')}
            containerClassName="sm:col-span-2"
          />
          <Input
            name="orderEmail"
            label="Email ufficio ordini"
            type="email"
            required={values.sendOrdersByEmail}
            maxLength={254}
            value={textValue('orderEmail')}
            onChange={(event) => setText('orderEmail', event.target.value)}
            error={firstError(fields, 'orderEmail')}
          />
          <Input
            name="orderEmailCc"
            label="Email in copia (CC)"
            type="email"
            maxLength={254}
            value={textValue('orderEmailCc')}
            onChange={(event) => setText('orderEmailCc', event.target.value)}
            error={firstError(fields, 'orderEmailCc')}
          />
          <Textarea
            name="emailNote"
            label="Nota fissa nell’email"
            rows={4}
            maxLength={1500}
            value={textValue('emailNote')}
            onChange={(event) => setText('emailNote', event.target.value)}
            error={firstError(fields, 'emailNote')}
            placeholder="Es. Codice cliente, indicazioni di consegna…"
            containerClassName="sm:col-span-2"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <Textarea
          name="notes"
          label="Note interne"
          rows={5}
          maxLength={3000}
          value={textValue('notes')}
          onChange={(event) => setText('notes', event.target.value)}
          error={firstError(fields, 'notes')}
          hint="Visibili soltanto dentro l’applicazione."
        />
      </section>

      {firstError(fields, '_form') && (
        <p
          role="alert"
          className="text-aumento rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold"
        >
          {firstError(fields, '_form')}
        </p>
      )}

      <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:static sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <Link
          href={cancelHref}
          className="focus-visible:ring-brand-600 inline-flex min-h-12 items-center justify-center rounded-lg border border-neutral-300 bg-white px-5 text-base font-semibold text-neutral-800 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Annulla
        </Link>
        <Button
          type="submit"
          size="lg"
          loading={pending}
          loadingLabel="Salvataggio…"
          leadingIcon={<AppIcon name="check" className="h-5 w-5" />}
        >
          {mode === 'create' ? 'Crea fornitore' : 'Salva modifiche'}
        </Button>
      </div>
    </form>
  );
}
