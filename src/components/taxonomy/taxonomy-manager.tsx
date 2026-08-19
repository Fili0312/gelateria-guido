'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Dialog, Input, Select, useToast } from '@/components/ui';
import type { CategoryItem, DepartmentItem, TaxonomyResult } from '@/features/taxonomy/dto';

/**
 * La gestione di reparti e categorie.
 *
 * Non c'è trascinamento per riordinare: su un tablet in magazzino il
 * drag-and-drop è la cosa che si sbaglia più spesso, e un campo «ordine»
 * numerico si corregge con la tastiera e si legge senza doverlo provare. È
 * anche l'unico modo perché l'ordine resti quello voluto dopo un ricaricamento
 * di pagina fatto a metà.
 */

interface Risposta {
  ok: boolean;
  error?: string;
  data?: {
    productsAffected?: number;
  };
}

type Modifica =
  | {
      tipo: 'reparto';
      id: string;
      name: string;
      color: string;
      sortOrder: string;
    }
  | {
      tipo: 'categoria';
      id: string;
      name: string;
      departmentId: string;
      sortOrder: string;
    };

export function TaxonomyManager({
  iniziale,
  endpointReparti,
  endpointCategorie,
}: {
  iniziale: TaxonomyResult;
  endpointReparti: string;
  endpointCategorie: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState(false);
  const [nuovoReparto, setNuovoReparto] = useState('');
  const [nuovaCategoria, setNuovaCategoria] = useState<Record<string, string>>({});
  const [modifica, setModifica] = useState<Modifica | null>(null);

  async function chiama(url: string, method: string, body?: unknown): Promise<Risposta | null> {
    setAttesa(true);
    try {
      const risposta = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const corpo = (await risposta.json().catch(() => null)) as Risposta | null;
      if (!risposta.ok || !corpo?.ok) {
        toast({
          title: 'Operazione non riuscita',
          description: corpo?.error ?? 'Il server non ha risposto correttamente.',
          tone: 'error',
        });
        return null;
      }
      router.refresh();
      return corpo;
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
      return null;
    } finally {
      setAttesa(false);
    }
  }

  async function creaReparto() {
    const name = nuovoReparto.trim();
    if (!name) return;
    const ultimo = iniziale.departments.at(-1)?.sortOrder ?? 0;
    const esito = await chiama(endpointReparti, 'POST', { name, sortOrder: ultimo + 10 });
    if (esito) {
      setNuovoReparto('');
      toast({ title: 'Reparto creato', description: name, tone: 'success' });
    }
  }

  async function creaCategoria(reparto: DepartmentItem) {
    const name = (nuovaCategoria[reparto.id] ?? '').trim();
    if (!name) return;
    const ultimo = reparto.categories.at(-1)?.sortOrder ?? 0;
    const esito = await chiama(endpointCategorie, 'POST', {
      departmentId: reparto.id,
      name,
      sortOrder: ultimo + 10,
    });
    if (esito) {
      setNuovaCategoria((p) => ({ ...p, [reparto.id]: '' }));
      toast({ title: 'Categoria creata', description: name, tone: 'success' });
    }
  }

  async function cancellaCategoria(categoria: CategoryItem) {
    // Il conteggio sta nella domanda, non nella risposta: «i 14 prodotti
    // dentro tornano da classificare» è un'informazione che serve *prima* di
    // decidere, non un messaggio da leggere a cose fatte.
    const avviso =
      categoria.productsCount > 0
        ? `\n\nI ${categoria.productsCount} prodotti dentro non vengono cancellati: tornano «da classificare».`
        : '';
    if (!confirm(`Cancellare la categoria «${categoria.name}»?${avviso}`)) return;

    const esito = await chiama(`${endpointCategorie}/${categoria.id}`, 'DELETE');
    if (esito) {
      toast({
        title: 'Categoria cancellata',
        description: esito.data?.productsAffected
          ? `${esito.data.productsAffected} prodotti sono ora da classificare.`
          : undefined,
        tone: 'success',
      });
    }
  }

  async function cancellaReparto(reparto: DepartmentItem) {
    if (!confirm(`Cancellare il reparto «${reparto.name}»?`)) return;
    const esito = await chiama(`${endpointReparti}/${reparto.id}`, 'DELETE');
    if (esito) toast({ title: 'Reparto cancellato', tone: 'success' });
  }

  async function salvaModifica() {
    if (!modifica || !modifica.name.trim()) return;
    const sortOrder = Number(modifica.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) {
      toast({ title: 'L’ordine deve essere un intero fra 0 e 10.000', tone: 'error' });
      return;
    }

    const reparto = modifica.tipo === 'reparto';
    const esito = await chiama(
      `${reparto ? endpointReparti : endpointCategorie}/${modifica.id}`,
      'PATCH',
      reparto
        ? { name: modifica.name, color: modifica.color, sortOrder }
        : {
            name: modifica.name,
            departmentId: modifica.departmentId,
            sortOrder,
          },
    );
    if (esito) {
      setModifica(null);
      toast({
        title: reparto ? 'Reparto aggiornato' : 'Categoria aggiornata',
        tone: 'success',
      });
    }
  }

  return (
    <div className="space-y-5">
      {iniziale.unclassified > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">{iniziale.unclassified}</strong>{' '}
          {iniziale.unclassified === 1 ? 'prodotto è' : 'prodotti sono'} senza categoria.{' '}
          <Link href="/prodotti?classification=unclassified" className="underline">
            Visibili a catalogo
          </Link>{' '}
          filtrando per «Da classificare».
        </p>
      )}

      <ul className="space-y-4">
        {iniziale.departments.map((reparto) => (
          <li
            key={reparto.id}
            className="rounded-2xl border border-neutral-200 bg-white shadow-sm"
            style={{ borderLeft: `4px solid ${reparto.color ?? '#475569'}` }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: reparto.color ?? '#475569' }}
                />
                <h3 className="truncate font-black text-neutral-950">{reparto.name}</h3>
                <Badge variant="neutral">{reparto.productsCount} prodotti</Badge>
                {!reparto.active && <Badge variant="neutral">disattivato</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={attesa}
                  onClick={() =>
                    setModifica({
                      tipo: 'reparto',
                      id: reparto.id,
                      name: reparto.name,
                      color: reparto.color ?? '#475569',
                      sortOrder: String(reparto.sortOrder),
                    })
                  }
                >
                  Modifica
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={attesa}
                  onClick={() =>
                    chiama(`${endpointReparti}/${reparto.id}`, 'PATCH', { active: !reparto.active })
                  }
                >
                  {reparto.active ? 'Disattiva' : 'Riattiva'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={attesa || reparto.categories.length > 0}
                  title={
                    reparto.categories.length > 0
                      ? 'Il reparto contiene delle categorie: svuotalo o disattivalo.'
                      : undefined
                  }
                  onClick={() => cancellaReparto(reparto)}
                >
                  Cancella
                </Button>
              </div>
            </div>

            <ul className="divide-y divide-neutral-100">
              {reparto.categories.map((categoria) => (
                <li
                  key={categoria.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="truncate text-sm text-neutral-800">{categoria.name}</span>
                    <span className="tabellare text-xs text-neutral-400">
                      {categoria.productsCount}
                    </span>
                    {!categoria.active && <Badge variant="neutral">disattivata</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Select
                      name={`reparto-${categoria.id}`}
                      label="Sposta nel reparto"
                      labelClassName="sr-only"
                      containerClassName="w-44"
                      value={categoria.departmentId}
                      disabled={attesa}
                      onChange={(e) =>
                        chiama(`${endpointCategorie}/${categoria.id}`, 'PATCH', {
                          departmentId: e.target.value,
                        })
                      }
                    >
                      {iniziale.departments.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={attesa}
                      onClick={() =>
                        setModifica({
                          tipo: 'categoria',
                          id: categoria.id,
                          name: categoria.name,
                          departmentId: categoria.departmentId,
                          sortOrder: String(categoria.sortOrder),
                        })
                      }
                    >
                      Modifica
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={attesa}
                      onClick={() =>
                        chiama(`${endpointCategorie}/${categoria.id}`, 'PATCH', {
                          active: !categoria.active,
                        })
                      }
                    >
                      {categoria.active ? 'Disattiva' : 'Riattiva'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={attesa}
                      onClick={() => cancellaCategoria(categoria)}
                    >
                      Cancella
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-end gap-2 border-t border-neutral-100 px-4 py-3">
              <Input
                name={`nuova-${reparto.id}`}
                label="Nuova categoria"
                labelClassName="sr-only"
                containerClassName="min-w-48 flex-1"
                placeholder={`Nuova categoria in ${reparto.name}`}
                value={nuovaCategoria[reparto.id] ?? ''}
                onChange={(e) => setNuovaCategoria((p) => ({ ...p, [reparto.id]: e.target.value }))}
                maxLength={80}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={attesa || !(nuovaCategoria[reparto.id] ?? '').trim()}
                onClick={() => creaCategoria(reparto)}
              >
                Aggiungi
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed border-neutral-300 px-4 py-4">
        <Input
          name="nuovo-reparto"
          label="Nuovo reparto"
          containerClassName="min-w-56 flex-1"
          placeholder="Per esempio: Magazzino"
          value={nuovoReparto}
          onChange={(e) => setNuovoReparto(e.target.value)}
          maxLength={80}
        />
        <Button type="button" disabled={attesa || !nuovoReparto.trim()} onClick={creaReparto}>
          Crea reparto
        </Button>
      </div>

      <Dialog
        open={modifica !== null}
        onOpenChange={(open) => {
          if (!open && !attesa) setModifica(null);
        }}
        title={modifica?.tipo === 'reparto' ? 'Modifica reparto' : 'Modifica categoria'}
        description="Denominazione e ordinamento sono utilizzati nei filtri e nella sequenza di compilazione dell’ordine."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={attesa}
              onClick={() => setModifica(null)}
            >
              Annulla
            </Button>
            <Button
              type="button"
              loading={attesa}
              disabled={!modifica?.name.trim()}
              onClick={salvaModifica}
            >
              Salva
            </Button>
          </>
        }
      >
        {modifica && (
          <div className="space-y-4">
            <Input
              name="modifica-nome"
              label="Nome"
              value={modifica.name}
              maxLength={80}
              required
              onChange={(e) => setModifica({ ...modifica, name: e.target.value })}
            />
            {modifica.tipo === 'reparto' ? (
              <Input
                name="modifica-colore"
                label="Colore"
                type="color"
                value={modifica.color}
                onChange={(e) => setModifica({ ...modifica, color: e.target.value })}
              />
            ) : (
              <Select
                name="modifica-reparto"
                label="Reparto"
                value={modifica.departmentId}
                onChange={(e) => setModifica({ ...modifica, departmentId: e.target.value })}
              >
                {iniziale.departments.map((reparto) => (
                  <option key={reparto.id} value={reparto.id}>
                    {reparto.name}
                  </option>
                ))}
              </Select>
            )}
            <Input
              name="modifica-ordine"
              label="Ordine"
              type="number"
              min={0}
              max={10_000}
              step={1}
              required
              value={modifica.sortOrder}
              hint="I valori più bassi compaiono per primi. Si consiglia di procedere per intervalli di 10."
              onChange={(e) => setModifica({ ...modifica, sortOrder: e.target.value })}
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}
