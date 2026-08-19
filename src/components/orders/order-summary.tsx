'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { Button, useToast } from '@/components/ui';
import type { EsitoConferma, OrderApiBody, RiepilogoOrdine } from '@/features/orders/dto';
import { haSegnalazioniRiepilogo } from '@/features/orders/summary';
import { euro, formatoConfezione, nomeLeggibile } from '@/features/products/format';

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
          L’ordine non contiene articoli: non è possibile confermarlo.
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
    <div className="space-y-4 pb-28">
      {/* ── Cosa si sta per confermare, in testa ──────────────────────── */}
      {/* Il totale era in fondo, dopo l'elenco di tutte le righe: su un
          ordine da cinquanta articoli bisognava scorrere fino in fondo per
          sapere quanto si stava per impegnare. È il primo dato che serve, e
          sta al primo posto. */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[13px] text-neutral-500">
              {t.righe} {t.righe === 1 ? 'articolo' : 'articoli'} · {t.confezioni} confezioni ·{' '}
              {o.perFornitore.length} {o.perFornitore.length === 1 ? 'fornitore' : 'fornitori'}
            </p>
            <p className="mt-0.5 text-[13px] text-neutral-500">Totale al netto dell’IVA</p>
          </div>
          <p className="tabellare text-3xl leading-none font-extrabold text-neutral-950">
            {euro(t.netto)}
          </p>
        </div>

        <ul className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100 text-[13px]">
          {o.perFornitore.map((g) => (
            <li key={g.supplierId} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-neutral-700">{g.supplierName}</span>
              <span className="tabellare shrink-0 font-semibold text-neutral-950">
                {euro(g.netto)}
              </span>
            </li>
          ))}
        </ul>
      </section>

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
            <Segnalazione tono="attenzione" titolo="Prezzi variati dopo l’inserimento">
              <p className="mb-1">
                Alla conferma vengono applicati i prezzi correnti, non quelli registrati al momento
                dell’inserimento.
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
            <Segnalazione tono="nota" titolo="Prezzi non aggiornati di recente">
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
                Per questi articoli non sono disponibili almeno due offerte confrontabili: la
                convenienza non è verificabile.
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
                  {euro(gruppo.ritornoAtteso)} a rimborso
                </span>
              )}
            </p>
          </header>
          <ul className="divide-y divide-neutral-100">
            {o.righe
              .filter((r) => r.supplierId === gruppo.supplierId)
              .map((riga) => (
                <li key={riga.id} className="flex items-start gap-3 px-3.5 py-2.5">
                  <span className="tabellare w-9 shrink-0 pt-0.5 font-bold text-neutral-950">
                    {riga.quantityPacks}×
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-[1.25] font-semibold text-neutral-950">
                      {nomeLeggibile(riga.name)}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-neutral-500">
                      {formatoConfezione(riga.unitSize, riga.unitOfMeasure, riga.packQuantity)} ·{' '}
                      {euro(riga.priceNet)} a confezione
                      {riga.supplierCode && ` · cod. ${riga.supplierCode}`}
                    </span>
                    {riga.avviso?.meritaAvviso && !riga.avvisoIgnorato && (
                      <span className="mt-1 block text-[13px] text-amber-700">
                        Disponibile a {euro(riga.avviso.migliore.priceNet)} da{' '}
                        {riga.avviso.migliore.supplierName}: {euro(riga.avviso.risparmioTotale)} in
                        meno su questa riga
                      </span>
                    )}
                  </span>
                  <span className="tabellare w-20 shrink-0 pt-0.5 text-right font-bold text-neutral-950">
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
            placeholder="Es. consegna in mattinata, accesso dal laboratorio"
            className="focus:border-brand-500 focus:ring-brand-500/30 mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-4"
          />
          <span className="text-xs text-neutral-500">
            Riportata sul documento inviato al fornitore.
          </span>
        </label>

        <dl className="mt-4 space-y-1 border-t border-neutral-100 pt-4 text-sm">
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
            <div className="flex justify-between gap-3 rounded-xl bg-violet-50 px-2.5 py-1.5 text-[13px] text-violet-800">
              <dt>Sconti concordati, a rimborso</dt>
              <dd className="tabellare font-semibold">{euro(t.ritornoAtteso)}</dd>
            </div>
          )}
          {t.righeConAvviso > 0 && (
            <div className="flex justify-between gap-3 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-900">
              <dt>
                Risparmio disponibile cambiando fornitore su {t.righeConAvviso}{' '}
                {t.righeConAvviso === 1 ? 'riga' : 'righe'}
              </dt>
              <dd className="tabellare font-semibold">{euro(t.risparmioPotenziale)}</dd>
            </div>
          )}
        </dl>

        <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-5 text-neutral-500">
          <AppIcon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Dopo la conferma l’ordine può essere corretto dalla sua scheda oppure annullato.
        </p>
      </section>

      {/* ── La conferma, sempre raggiungibile ─────────────────────────── */}
      {/* Stava in fondo, dopo l'elenco: su un ordine da cinquanta righe
          bisognava scorrere fino in fondo per confermarlo, e per rileggere
          una riga si tornava su perdendo il pulsante. In barra fissa si
          controlla e si conferma senza rincorrere niente. */}
      <div className="pb-sicuro fixed inset-x-0 bottom-0 z-30 px-3 sm:px-6 lg:pl-72">
        <div className="mx-auto w-full max-w-[94rem] sm:px-1 xl:px-4">
          <div className="border-brand-200 flex items-center gap-2 rounded-2xl border bg-white/95 p-2 shadow-lg shadow-neutral-900/10 backdrop-blur">
            <Link
              href="/ordini"
              className="focus-visible:ring-brand-600 inline-flex min-h-12 shrink-0 cursor-pointer items-center rounded-xl px-3 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none"
            >
              Modifica
            </Link>
            <span className="min-w-0 flex-1 text-right">
              <span className="block text-[12px] text-neutral-500">
                {t.righe} {t.righe === 1 ? 'articolo' : 'articoli'} · più IVA
              </span>
              <span className="tabellare block text-lg leading-tight font-extrabold text-neutral-950">
                {euro(t.netto)}
              </span>
            </span>
            <Button onClick={() => void conferma()} disabled={attesa} className="min-h-12 shrink-0">
              {attesa ? 'Conferma…' : 'Conferma l’ordine'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
