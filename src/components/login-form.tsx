'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';

interface LoginResponse {
  ok: boolean;
  error?: string;
}

export function LoginForm({ endpoint, nextPath }: { endpoint: string; nextPath: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(undefined);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok || !data?.ok) {
        const fallbackError =
          response.status === 429
            ? 'Troppi tentativi. Attendi un minuto e riprova.'
            : response.status === 413
              ? 'La richiesta è troppo grande. Ricarica la pagina e riprova.'
              : 'Non riesco a completare l’accesso. Riprova fra poco.';
        setError(data?.error ?? fallbackError);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError('Il server non risponde. Controlla la connessione e riprova.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Input
        id="password"
        name="password"
        type="password"
        label="Password condivisa"
        autoComplete="current-password"
        autoFocus
        required
        minLength={7}
        maxLength={256}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={error}
        hint={
          error ? undefined : 'La stessa password usata dalla gelateria su tutti i dispositivi.'
        }
      />
      <Button type="submit" size="lg" fullWidth loading={loading} loadingLabel="Accesso in corso…">
        Entra nell&apos;app
      </Button>
    </form>
  );
}
