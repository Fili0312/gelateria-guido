'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AppIcon } from '@/components/app-icon';
import { Badge, Button, Dialog, Input, Select, useToast } from '@/components/ui';
import type { CoperturaEsistente, PriceListApiBody } from '@/features/price-lists/dto';
import { MAX_PDF_BYTE, normalizzaCopertura } from '@/features/price-lists/schema';

/**
 * Il caricamento di un listino.
 *
 * Il pulsante «Carica» resta disabilitato finché non ci sono tutti e tre —
 * fornitore, nome del listino, file — e non è una scortesia: un listino
 * attribuito al fornitore sbagliato inquina il catalogo in un modo che poi si
 * districa a mano riga per riga, e il momento in cui evitarlo costa nulla è
 * questo.
 *
 * Appena scelto il fornitore la finestra dice **cosa si sta per sostituire**.
 * Mostrarlo dopo, a import avviato, significherebbe mostrarlo quando è troppo
 * tardi per cambiare idea.
 */

interface Fornitore {
  id: string;
  name: string;
}

const DATA_ITALIANA = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function quandoFermo(giorni: number): string {
  if (giorni <= 0) return 'caricato oggi';
  if (giorni === 1) return 'fermo da ieri';
  if (giorni < 60) return `fermo da ${giorni} giorni`;
  return `fermo da ${Math.round(giorni / 30)} mesi`;
}

export function UploadDialog({
  fornitori,
  endpoint,
  endpointCoperture,
}: {
  fornitori: readonly Fornitore[];
  endpoint: string;
  endpointCoperture: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [scopeLabel, setScopeLabel] = useState('');
  const [modalita, setModalita] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [file, setFile] = useState<File | null>(null);
  /** Le coperture arrivano dal server e sono legate al fornitore scelto:
   *  si tengono insieme, cosi' non puo' capitare di mostrare quelle di un
   *  fornitore accanto al nome di un altro mentre la richiesta e' in volo. */
  const [caricate, setCaricate] = useState<{ supplierId: string; items: CoperturaEsistente[] }>({
    supplierId: '',
    items: [],
  });
  const [campi, setCampi] = useState<Record<string, string[]>>({});
  const [attesa, setAttesa] = useState(false);

  useEffect(() => {
    if (!supplierId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const risposta = await fetch(
          `${endpointCoperture}?supplierId=${encodeURIComponent(supplierId)}`,
          {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          },
        );
        const corpo = (await risposta.json()) as PriceListApiBody<{ items: CoperturaEsistente[] }>;
        if (corpo.ok) setCaricate({ supplierId, items: corpo.data.items });
      } catch {
        // Le coperture sono un aiuto, non un requisito: se non arrivano si
        // carica lo stesso, semplicemente senza il preavviso.
      }
    })();
    return () => controller.abort();
  }, [supplierId, endpointCoperture]);

  // Senza fornitore, o mentre sta arrivando la risposta per un fornitore
  // diverso, non si mostra niente: si ricava dallo stato invece di azzerarlo
  // dentro l'effetto, che sarebbe un render a cascata.
  const coperture = caricate.supplierId === supplierId ? caricate.items : [];
  const normalizzata = normalizzaCopertura(scopeLabel);
  const sostituisce = coperture.find((c) => c.scopeLabel === normalizzata) ?? null;
  const fornitore = fornitori.find((f) => f.id === supplierId);
  const completo = Boolean(supplierId && normalizzata.length >= 2 && file);

  function chiudi() {
    setOpen(false);
    setSupplierId('');
    setScopeLabel('');
    setFile(null);
    setCampi({});
  }

  async function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!completo || attesa || !file) return;

    setAttesa(true);
    setCampi({});
    try {
      const modulo = new FormData();
      modulo.set('supplierId', supplierId);
      modulo.set('scopeLabel', scopeLabel);
      modulo.set('mode', modalita);
      modulo.set('file', file);

      const risposta = await fetch(endpoint, { method: 'POST', body: modulo });
      const corpo = (await risposta.json().catch(() => null)) as PriceListApiBody<{
        id: string;
      }> | null;

      if (!risposta.ok || !corpo?.ok) {
        if (corpo && !corpo.ok && corpo.fields) setCampi(corpo.fields);
        toast({
          title: 'Caricamento non riuscito',
          description:
            corpo && !corpo.ok ? corpo.error : 'Il server non ha risposto correttamente.',
          tone: 'error',
        });
        return;
      }

      toast({ title: 'Listino caricato', description: 'Estrazione in corso.', tone: 'success' });
      chiudi();
      router.push(`/listini/${corpo.data.id}`);
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  return (
    <>
      <Button
        leadingIcon={<AppIcon name="lists" className="h-5 w-5" />}
        onClick={() => setOpen(true)}
        disabled={fornitori.length === 0}
        title={fornitori.length === 0 ? 'Serve almeno un fornitore in anagrafica.' : undefined}
      >
        Carica un listino
      </Button>

      <Dialog
        open={open}
        onOpenChange={(aperto) => (aperto ? setOpen(true) : chiudi())}
        title="Carica un listino"
        description="Fornitore e nome del listino sono obbligatori: decidono dove finiranno i prodotti e con quale listino precedente verrà confrontato."
      >
        <form onSubmit={invia} className="space-y-5" noValidate>
          <Select
            name="supplierId"
            label="Fornitore"
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            error={campi.supplierId?.[0]}
          >
            <option value="">Scegli il fornitore…</option>
            {fornitori.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>

          <div className="space-y-2">
            <Input
              name="scopeLabel"
              label="Nome del listino"
              required
              value={scopeLabel}
              onChange={(e) => setScopeLabel(e.target.value)}
              error={campi.scopeLabel?.[0]}
              placeholder="liquori, vini e spumanti, gelato 2026…"
              hint="Dice cosa copre. Serve a confrontare il nuovo listino con il precedente della stessa copertura, e non con tutto il catalogo del fornitore."
              maxLength={60}
              list="coperture-usate"
            />
            <datalist id="coperture-usate">
              {coperture.map((c) => (
                <option key={c.scopeLabel} value={c.scopeLabel} />
              ))}
            </datalist>

            {coperture.length > 0 && !sostituisce && (
              <p className="text-xs text-neutral-500">
                Già usati per {fornitore?.name}:{' '}
                {coperture.map((c) => (
                  <button
                    key={c.scopeLabel}
                    type="button"
                    className="text-brand-700 mr-2 underline"
                    onClick={() => setScopeLabel(c.scopeLabel)}
                  >
                    {c.scopeLabel}
                  </button>
                ))}
              </p>
            )}

            {sostituisce && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                <strong className="font-semibold">
                  {fornitore?.name} / {sostituisce.scopeLabel}
                </strong>{' '}
                — ultimo caricamento {DATA_ITALIANA.format(new Date(sostituisce.ultimoCaricamento))}{' '}
                ({quandoFermo(sostituisce.giorniFermo)})
                {sostituisce.prodotti > 0 ? `, ${sostituisce.prodotti} righe prodotto` : ''}.
                <br />
                {modalita === 'FULL'
                  ? 'Questo caricamento lo sostituirà.'
                  : 'Essendo un aggiornamento, questo caricamento non lo sostituisce: aggiunge e corregge soltanto.'}
              </p>
            )}
          </div>

          {/* La domanda che evita il danno peggiore dell'import.
              Si dichiara e non si indovina: un file di venti righe può essere
              il listino intero di un fornitore piccolo, e supporlo parziale
              lascerebbe a catalogo articoli che non si vendono più. */}
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold text-neutral-800">
              Cosa contiene questo file
            </legend>
            {(
              [
                [
                  'FULL',
                  'Il listino completo',
                  'Tutto quello che il fornitore vende per questa copertura. Gli articoli che non ci sono verranno disattivati: non li vende più.',
                ],
                [
                  'PARTIAL',
                  'Solo un aggiornamento',
                  'Poche righe, per esempio i soli rincari. Si aggiornano quelle e i nuovi articoli si aggiungono; tutto il resto resta com’è.',
                ],
              ] as const
            ).map(([valore, titolo, spiegazione]) => (
              <label
                key={valore}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                  modalita === valore
                    ? 'border-brand-500 bg-brand-50/60'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={valore}
                  checked={modalita === valore}
                  onChange={() => setModalita(valore)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                />
                <span>
                  <span className="block text-sm font-semibold text-neutral-950">{titolo}</span>
                  <span className="block text-xs leading-5 text-neutral-600">{spiegazione}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="grid gap-1.5">
            <label htmlFor="file-listino" className="text-sm font-semibold text-neutral-800">
              File PDF
              <span className="text-aumento ml-1" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="file-listino"
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="min-h-tap file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
            />
            <p className="text-xs text-neutral-500">
              Massimo {Math.round(MAX_PDF_BYTE / 1024 / 1024)} MB. Un PDF scansionato non può essere
              letto: serve il file originale del fornitore.
            </p>
            {campi.file?.[0] && (
              <p className="text-aumento text-xs font-medium" role="alert">
                {campi.file[0]}
              </p>
            )}
            {file && (
              <p className="text-xs text-neutral-600">
                <Badge variant="neutral">{(file.size / 1024 / 1024).toFixed(1)} MB</Badge>{' '}
                {file.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={!completo || attesa}>
              {attesa ? 'Carico…' : 'Carica ed estrai'}
            </Button>
            <Button type="button" variant="ghost" onClick={chiudi} disabled={attesa}>
              Annulla
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
