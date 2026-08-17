'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { Button, useToast } from '@/components/ui';
import type { EsitoConferma, OrderApiBody, RiepilogoOrdine } from '@/features/orders/dto';
import { haSegnalazioniRiepilogo } from '@/features/orders/summary';
import { euro, formatoConfezione } from '@/features/products/format';

/**
 * L'ultima schermata prima che l'ordine diventi un documento.
 *
 * Non è una vista più bella dell'ordine: è **l'ultima occasione di
 * accorgersi di qualcosa**. Per questo le segnalazioni stanno in cima, prima
 * delle righe, e nessuna di esse blocca — chi ordina sa cose che l'app non
 * sa, e un blocco su un minimo d'ordine impedirebbe proprio l'ordine urgente
 * da tre bottiglie che si fa comunque.
 */

function Segnalazione({
  tono,
  titolo,
  children,
}: {
  tono: 'attenzione' | 'nota';
  titolo: string;
  children: React.ReactNode;
}) {
  const colore =
    tono === 'attenzione'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-neutral-200 bg-white text-neutral-700';
  return (
    <div className={`rounded-xl border px-4 py-3 ${colore}`}>
      <p className="text-sm font-semibold">{titolo}</p>
      <div className="mt-1 space-y-0.5 text-xs leading-5">{children}</div>
    </div>
  );
}

export function OrderSummary({
  riepilogo,
  endpointOrdine,
}: {
  riepilogo: RiepilogoOrdine;
  endpointOrdine: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState(false);
  const [nota, setNota] = useState(riepilogo.ordine.note ?? '');
  // Il doppio invio si ferma qui **e** nel server: qui perché la seconda
  // richiesta non parta nemmeno, là perché la rete non è affidabile.
  const inVolo = useRef(false);

  const o = riepilogo.ordine;
  const t = o.totali;

  async function conferma() {
    if (inVolo.current) return;
    if (
      !confirm(
        `Confermare l’ordine?\n\n${t.righe} prodotti · ${t.confezioni} confezioni · ${euro(t.netto)}\n\n` +
          'Da qui in poi non si modifica più: si potrà solo annullare. I prezzi usati sono quelli ' +
          'di adesso.',
      )
    ) {
      return;
    }
    inVolo.current = true;
    setAttesa(true);
    try {
      const risposta = await fetch(`${endpointOrdine}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          orderId: o.id,
          updatedAt: o.updatedAt,
          priceVersion: riepilogo.priceVersion,
          note: nota || null,
        }),
      });
      const corpo = (await risposta.json()) as OrderApiBody<EsitoConferma>;
      if (!corpo.ok) {
        toast({
          title: 'Non è stato possibile confermare',
          description: corpo.error,
          tone: 'error',
        });
        inVolo.current = false;
        // Una versione vecchia del riepilogo viene sostituita con quella vera;
        // l'operatore ricontrolla i numeri prima di riprovare.
        router.refresh();
        return;
      }
      toast({
        title: `Ordine ${corpo.data.code} confermato`,
        description: `${corpo.data.righe} righe · ${euro(corpo.data.netto)}`,
        tone: 'success',
      });
      router.push(`/ordini/${corpo.data.orderId}`);
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
      inVolo.current = false;
    } finally {
      setAttesa(false);
    }
  }

  if (!riepilogo.confermabile) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
        <p className="text-sm leading-6 text-neutral-500">
          L’ordine è vuoto: non c’è niente da confermare.
        </p>
        <Link
          href="/ordini"
          className="bg-brand-600 hover:bg-brand-700 mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-lg px-4 text-sm font-semibold text-white"
        >
          Torna al catalogo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Le segnalazioni, prima delle righe ────────────────────────── */}
      {haSegnalazioniRiepilogo(riepilogo) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {riepilogo.minimiNonRaggiunti.length > 0 && (
            <Segnalazione tono="attenzione" titolo="Minimo d’ordine non raggiunto">
              {riepilogo.minimiNonRaggiunti.map((m) => (
                <p key={m.supplierId}>
                  <strong>{m.supplierName}</strong>: {euro(m.netto)} su {euro(m.minimo)} — mancano{' '}
                  {euro(m.manca)}
                </p>
              ))}
            </Segnalazione>
          )}

          {riepilogo.prezziCambiati.length > 0 && (
            <Segnalazione tono="attenzione" titolo="Prezzi cambiati dopo l’aggiunta">
              <p className="mb-1">
                Confermando si usano quelli di adesso, non quelli di quando hai aggiunto la riga.
              </p>
              {riepilogo.prezziCambiati.map((p) => (
                <p key={p.rigaId}>
                  <strong>{p.name}</strong>: {euro(p.prezzoAllora)} → {euro(p.prezzoAdesso)} (
                  {Number(p.differenza) > 0 ? '+' : ''}
                  {euro(p.differenza)})
                </p>
              ))}
            </Segnalazione>
          )}

          {riepilogo.prezziFermi.length > 0 && (
            <Segnalazione tono="nota" titolo="Prezzi che non si aggiornano da tempo">
              {riepilogo.prezziFermi.map((p) => (
                <p key={p.rigaId}>
                  <strong>{p.name}</strong> · {p.supplierName} — dal{' '}
                  {new Date(p.valeDa).toLocaleDateString('it-IT')}
                </p>
              ))}
            </Segnalazione>
          )}

          {riepilogo.senzaConfronto.length > 0 && (
            <Segnalazione
              tono="nota"
              titolo={`${riepilogo.senzaConfronto.length} righe senza confronto`}
            >
              <p>
                Per questi articoli non ci sono almeno due offerte confrontabili, quindi non si sa
                se convengono. Non è un problema: è una cosa che non si sa.
              </p>
            </Segnalazione>
          )}
        </div>
      )}

      {/* ── Le righe, per fornitore ───────────────────────────────────── */}
      {o.perFornitore.map((gruppo) => (
        <section
          key={gruppo.supplierId}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
            <h2 className="font-black text-neutral-950">{gruppo.supplierName}</h2>
            <p className="tabellare text-sm text-neutral-600">
              {gruppo.righe} righe · {gruppo.confezioni} conf. ·{' '}
              <strong className="text-neutral-950">{euro(gruppo.netto)}</strong>
              {Number(gruppo.ritornoAtteso) > 0 && (
                <span className="ml-2 text-violet-700">
                  {euro(gruppo.ritornoAtteso)} torneranno indietro
                </span>
              )}
            </p>
          </header>
          <ul className="divide-y divide-neutral-100">
            {o.righe
              .filter((r) => r.supplierId === gruppo.supplierId)
              .map((riga) => (
                <li
                  key={riga.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2"
                >
                  <span className="tabellare w-10 shrink-0 font-bold text-neutral-950">
                    {riga.quantityPacks}×
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-neutral-950">{riga.name}</span>
                    <span className="ml-2 text-xs text-neutral-500">
                      {formatoConfezione(riga.unitSize, riga.unitOfMeasure, riga.packQuantity)}
                      {riga.supplierCode && ` · cod. ${riga.supplierCode}`}
                    </span>
                    {riga.avviso?.meritaAvviso && !riga.avvisoIgnorato && (
                      <span className="mt-0.5 block text-xs text-amber-700">
                        {riga.avviso.migliore.supplierName} lo fa a{' '}
                        {euro(riga.avviso.migliore.priceNet)} — {euro(riga.avviso.risparmioTotale)}{' '}
                        in meno su questa riga
                      </span>
                    )}
                  </span>
                  <span className="tabellare text-xs text-neutral-500">{euro(riga.priceNet)}</span>
                  <span className="tabellare w-20 text-right text-sm font-bold text-neutral-950">
                    {euro(riga.lineTotalNet)}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {/* ── Totali e conferma ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <label className="block">
          <span className="text-sm font-semibold text-neutral-800">Nota per l’ordine</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Es. consegnare di mattina, citofonare al laboratorio"
            className="focus:border-brand-500 focus:ring-brand-500/30 mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-4"
          />
          <span className="text-xs text-neutral-500">Finirà sul documento per il fornitore.</span>
        </label>

        <dl className="mt-4 space-y-1 border-t border-neutral-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-600">
              {t.righe} prodotti · {t.confezioni} confezioni
            </dt>
            <dd className="tabellare font-semibold text-neutral-950">{euro(t.netto)}</dd>
          </div>
          {/* Il totale è il **netto**, e accanto c'è scritto «+ IVA».
              Sommare un'IVA calcolata sull'aliquota predefinita darebbe un
              numero dall'aria esatta e sbagliato ogni volta che un articolo
              non sta al 22% — e chi lo legge non ha modo di accorgersene. */}
          <div className="flex items-baseline justify-between border-t border-neutral-100 pt-2">
            <dt className="font-semibold text-neutral-900">
              Totale <span className="font-normal text-neutral-500">+ IVA</span>
            </dt>
            <dd className="tabellare text-2xl font-black text-neutral-950">{euro(t.netto)}</dd>
          </div>
          {Number(t.ritornoAtteso) > 0 && (
            <div className="flex justify-between rounded-lg bg-violet-50 px-2 py-1 text-xs text-violet-800">
              <dt>Sconti concordati, a rimborso</dt>
              <dd className="tabellare font-semibold">{euro(t.ritornoAtteso)}</dd>
            </div>
          )}
          {t.righeConAvviso > 0 && (
            <div className="flex justify-between rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
              <dt>
                Cambiando fornitore su {t.righeConAvviso}{' '}
                {t.righeConAvviso === 1 ? 'riga' : 'righe'} risparmieresti
              </dt>
              <dd className="tabellare font-semibold">{euro(t.risparmioPotenziale)}</dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void conferma()} disabled={attesa} className="min-h-11">
            {attesa ? 'Sto confermando…' : 'Conferma l’ordine'}
          </Button>
          <Link
            href="/ordini"
            className="focus-visible:ring-brand-600 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
          >
            Torna a modificare
          </Link>
          <span className="flex items-center gap-1.5 text-xs text-neutral-500">
            <AppIcon name="warning" className="h-3.5 w-3.5" />
            Dopo la conferma l’ordine non si modifica più: si può solo annullare.
          </span>
        </div>
      </section>
    </div>
  );
}
