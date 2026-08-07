import { hashPassword } from '../src/server/auth/password';

async function readPasswordFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error(
      'La password va passata su stdin, per esempio: read -rs PASSWORD; printf \'%s\' "$PASSWORD" | pnpm auth:hash',
    );
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  // `read` e i file di testo aggiungono normalmente un solo newline finale:
  // non deve diventare parte della password, gli altri spazi invece si'.
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

async function main(): Promise<void> {
  const password = await readPasswordFromStdin();
  const encodedHash = await hashPassword(password);

  // Next espande `$NOME` dentro i file .env. Un hash Argon2 contiene diversi
  // dollari, quindi stampiamo direttamente una riga dotenv-safe da incollare:
  // senza gli escape, Next leggerebbe un hash mutilato e il login resterebbe
  // correttamente (ma misteriosamente) disabilitato.
  const dotenvSafeHash = encodedHash.replaceAll('$', '\\$');
  process.stdout.write(`APP_PASSWORD_HASH="${dotenvSafeHash}"\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Impossibile generare lo hash.';
  process.stderr.write(`Errore: ${message}\n`);
  process.exitCode = 1;
});
