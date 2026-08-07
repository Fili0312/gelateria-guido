'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Checkbox, Input, useToast } from '@/components/ui';
import type { ProductAliasItem, ProductApiBody } from '@/features/products/dto';

/**
 * I sinonimi di un prodotto.
 *
 * Oggi si aggiungono a mano; dalla Fase 9 li scriverà anche la revisione
 * degli abbinamenti, ed è lì che diventano il meccanismo con cui il sistema
 * impara: ogni conferma umana evita una chiamata all'IA al listino seguente.
 * Un sinonimo «negativo» registra il contrario — «questi due non sono lo
 * stesso prodotto» — perché anche una smentita è informazione da non perdere.
 */
export function ProductAliases({
  productId,
  aliases,
  endpoint,
}: {
  productId: string;
  aliases: ProductAliasItem[];
  endpoint: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [testo, setTesto] = useState('');
  const [negativo, setNegativo] = useState(false);
  const [attesa, setAttesa] = useState(false);

  async function chiama(url: string, init: RequestInit, successo: string) {
    setAttesa(true);
    try {
      const risposta = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      const corpo = (await risposta.json().catch(() => null)) as ProductApiBody<unknown> | null;
      if (!risposta.ok || !corpo?.ok) {
        toast({
          title: 'Operazione non riuscita',
          description:
            corpo && !corpo.ok ? corpo.error : 'Il server non ha risposto correttamente.',
          tone: 'error',
        });
        return false;
      }
      toast({ title: successo, tone: 'success' });
      router.refresh();
      return true;
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
      return false;
    } finally {
      setAttesa(false);
    }
  }

  async function aggiungi(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (attesa || testo.trim().length < 2) return;
    const fatto = await chiama(
      `${endpoint}/${productId}/aliases`,
      { method: 'POST', body: JSON.stringify({ text: testo.trim(), negative: negativo }) },
      'Sinonimo aggiunto',
    );
    if (fatto) {
      setTesto('');
      setNegativo(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-2" aria-label="Sinonimi del prodotto">
        {aliases.length === 0 && (
          <li className="text-sm text-neutral-500">
            Nessun sinonimo. Servono a far trovare il prodotto anche quando un fornitore lo scrive
            in un altro modo.
          </li>
        )}
        {aliases.map((alias) => (
          <li key={alias.id}>
            <span
              className={`inline-flex min-h-tap items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                alias.negative
                  ? 'border-aumento/30 bg-aumento/5 text-aumento'
                  : 'border-neutral-200 bg-white text-neutral-800'
              }`}
            >
              {alias.negative && <span aria-hidden>≠</span>}
              {alias.text}
              <Badge variant="neutral" size="sm">
                {alias.source === 'USER' ? 'manuale' : alias.source === 'AI' ? 'IA' : 'fornitore'}
              </Badge>
              <button
                type="button"
                disabled={attesa}
                onClick={() =>
                  chiama(
                    `${endpoint}/${productId}/aliases/${alias.id}`,
                    { method: 'DELETE' },
                    'Sinonimo rimosso',
                  )
                }
                className="focus-visible:ring-brand-600 rounded p-1 text-neutral-400 hover:text-neutral-700 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                aria-label={`Rimuovi il sinonimo ${alias.text}`}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>

      <form onSubmit={aggiungi} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            id="nuovo-alias"
            label="Aggiungi un sinonimo"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="Come lo scrive un altro fornitore"
            maxLength={200}
          />
        </div>
        <Checkbox
          checked={negativo}
          onChange={(e) => setNegativo(e.currentTarget.checked)}
          label="Non è lo stesso prodotto"
        />
        <Button type="submit" disabled={attesa || testo.trim().length < 2}>
          Aggiungi
        </Button>
      </form>
    </div>
  );
}
