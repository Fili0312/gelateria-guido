'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { Button, Input, Select, useToast } from '@/components/ui';
import type { ProductApiBody, ProductDetail } from '@/features/products/dto';
import { productInputSchema, UNITA_DI_MISURA, type ProductInput } from '@/features/products/schema';
import { etichettaUnita, formatoUnitario } from '@/features/products/format';
import {
  FORNITURA_VUOTA,
  fornituraSchema,
  oggiCalendario,
  type Fornitura,
} from '@/features/products/fornitura';
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
  fornitori,
  endpointOfferte,
  endpointPrezzi,
}: {
  mode: 'create' | 'edit';
  endpoint: string;
  iniziale?: ProductInput;
  reparti: readonly DepartmentItem[];
  /** I fornitori attivi, per la sezione «da chi lo compri». */
  fornitori: readonly { id: string; name: string }[];
  endpointOfferte: string;
  /** `{id}` viene sostituito con l'offerta appena creata. */
  endpointPrezzi: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [valori, setValori] = useState<ProductInput>(() => iniziale ?? VUOTO);
  const [campi, setCampi] = useState<Record<string, string[]>>({});
  const [attesa, setAttesa] = useState(false);
  // La fornitura è **facoltativa**: si apre solo se la si vuole compilare, e
  // un prodotto senza fornitore resta un prodotto legittimo.
  const [conFornitura, setConFornitura] = useState(false);
  const [fornitura, setFornitura] = useState<Fornitura>(FORNITURA_VUOTA);

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

  /**
   * Crea l'offerta del fornitore e ci registra il prezzo di listino.
   *
   * Il nome dell'offerta è quello del prodotto: è la descrizione con cui il
   * fornitore lo chiama, e finché non arriva un suo listino l'unica che
   * abbiamo è la nostra. Il formato pure, se non se n'è indicato uno diverso
   * — spesso il collo è di pezzi identici a quello dichiarato sopra.
   */
  async function collegaFornitura(productId: string): Promise<{ ok: boolean; errore?: string }> {
    const analizzata = fornituraSchema.safeParse(fornitura);
    if (!analizzata.success) {
      return { ok: false, errore: analizzata.error.issues[0]?.message ?? 'Dati non validi.' };
    }
    const f = analizzata.data;

    try {
      const rispostaOfferta = await fetch(endpointOfferte, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          supplierId: f.supplierId,
          rawName: valori.name,
          supplierCode: f.supplierCode,
          packQuantity: f.packQuantity,
          // Dichiarato a mano vuol dire dichiarato: chi scrive «6» sa che
          // sono sei. È diverso dall'1 di ripiego che mette un import
          // quando il listino non dice quanti pezzi ci sono nel collo.
          packQuantityConfirmed: true,
          unitSize: f.unitSize.trim() || valori.unitSize,
          unitOfMeasure: f.unitOfMeasure ?? valori.unitOfMeasure,
          productId,
        }),
      });
      const corpoOfferta = (await rispostaOfferta.json().catch(() => null)) as {
        ok: boolean;
        data?: { id: string };
        error?: string;
      } | null;
      if (!rispostaOfferta.ok || !corpoOfferta?.ok || !corpoOfferta.data) {
        return { ok: false, errore: corpoOfferta?.error ?? 'Offerta non creata.' };
      }

      const rispostaPrezzo = await fetch(
        endpointPrezzi.replace('{id}', encodeURIComponent(corpoOfferta.data.id)),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            priceList: f.priceList.replace(',', '.'),
            discounts: [],
            vatRate: null,
            validFrom: oggiCalendario(),
          }),
        },
      );
      const corpoPrezzo = (await rispostaPrezzo.json().catch(() => null)) as {
        ok: boolean;
        error?: string;
      } | null;
      if (!rispostaPrezzo.ok || !corpoPrezzo?.ok) {
        return {
          ok: false,
          errore: `Fornitore collegato, prezzo no: ${corpoPrezzo?.error ?? 'errore del server'}`,
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, errore: 'Server non raggiungibile.' };
    }
  }

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

      // ── Il fornitore e il prezzo, se sono stati compilati ─────────────
      //
      // Tre chiamate in fila e non una sola: prodotto, offerta, prezzo sono
      // tre cose distinte anche nel database, e comporle qui riusa il
      // percorso già collaudato invece di aprirne uno nuovo.
      //
      // Se una delle due ultime non riesce **si dice quale**, e il prodotto
      // resta creato. È il motivo per cui si finisce comunque sulla sua
      // scheda: da lì il pezzo mancante si aggiunge in due clic, mentre un
      // errore che annulla tutto farebbe riscrivere anche ciò che era
      // andato bene.
      const esito = conFornitura ? await collegaFornitura(corpo.data.id) : null;

      toast({
        title:
          esito === null || esito.ok
            ? mode === 'create'
              ? 'Prodotto creato'
              : 'Prodotto aggiornato'
            : 'Prodotto salvato, fornitore no',
        description: esito === null || esito.ok ? corpo.data.name : esito.errore,
        tone: esito === null || esito.ok ? 'success' : 'error',
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

      <Sezione
        titolo="Da chi lo compri"
        nota={
          fornitori.length === 0
            ? 'Non c’è ancora nessun fornitore: crealo prima, poi torna qui.'
            : mode === 'create'
              ? 'Facoltativo. Compilandolo il prodotto nasce già ordinabile, con un prezzo e un fornitore — altrimenti resta in catalogo senza prezzo, e nei confronti non compare.'
              : 'Facoltativo. Aggiunge **un altro** fornitore a questo prodotto: quelli già collegati restano dove sono.'
        }
      >
        {fornitori.length > 0 && (
          <>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={conFornitura}
                onChange={(e) => setConFornitura(e.target.checked)}
                className="text-brand-600 focus:ring-brand-500/30 mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-neutral-300 focus:ring-4"
              />
              <span className="text-sm font-semibold text-neutral-900">
                {mode === 'create'
                  ? 'So già da chi lo compro e quanto costa'
                  : 'Aggiungi un fornitore con il suo prezzo'}
              </span>
            </label>

            {conFornitura && (
              <div className="space-y-4 border-l-2 border-neutral-100 pl-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    name="supplierId"
                    label="Fornitore"
                    required
                    value={fornitura.supplierId}
                    onChange={(e) => setFornitura((f) => ({ ...f, supplierId: e.target.value }))}
                  >
                    <option value="">Scegli…</option>
                    {fornitori.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    name="priceList"
                    label="Prezzo di listino"
                    required
                    inputMode="decimal"
                    value={fornitura.priceList}
                    onChange={(e) => setFornitura((f) => ({ ...f, priceList: e.target.value }))}
                    hint="Quello scritto sul listino, prima degli sconti. Gli sconti concordati si impostano sul fornitore."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    name="supplierCode"
                    label="Codice del fornitore"
                    value={fornitura.supplierCode ?? ''}
                    onChange={(e) =>
                      setFornitura((f) => ({ ...f, supplierCode: e.target.value || null }))
                    }
                    hint="Facoltativo. È l’unico codice che lui sa cercare a magazzino."
                  />
                  <Input
                    name="packQuantity"
                    label="Pezzi per confezione"
                    inputMode="numeric"
                    value={String(fornitura.packQuantity)}
                    onChange={(e) =>
                      setFornitura((f) => ({
                        ...f,
                        packQuantity: Number(e.target.value.replace(/[^0-9]/g, '')) || 1,
                      }))
                    }
                    hint="Quante bottiglie ci sono nel collo che ti consegna. 1 se lo compri a pezzo."
                  />
                </div>

                {/* Il conto, scritto per esteso.
                    Il prezzo di listino è per **confezione**: con sei
                    bottiglie in un collo, 60 € non sono 60 € a bottiglia.
                    Vederlo mentre si scrive evita l\u2019errore che poi si
                    ritrova nei confronti fra fornitori. */}
                {fornitura.priceList.trim() && (
                  <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
                    {fornitura.packQuantity > 1 ? (
                      <>
                        Confezione da <strong>{fornitura.packQuantity}</strong>:{' '}
                        {fornitura.priceList.replace('.', ',')} € il collo, cioè{' '}
                        <strong>
                          {(Number(fornitura.priceList.replace(',', '.')) / fornitura.packQuantity)
                            .toFixed(2)
                            .replace('.', ',')}{' '}
                          €
                        </strong>{' '}
                        al pezzo.
                      </>
                    ) : (
                      <>
                        <strong>{fornitura.priceList.replace('.', ',')} €</strong> al pezzo.
                      </>
                    )}
                  </p>
                )}
              </div>
            )}
          </>
        )}
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
