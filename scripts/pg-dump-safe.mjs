#!/usr/bin/env node

import { spawn } from 'node:child_process';

const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) {
  process.stderr.write('DATABASE_URL mancante per pg-dump-safe.\n');
  process.exit(2);
}

let databaseUrl;
try {
  databaseUrl = new URL(rawDatabaseUrl);
} catch {
  process.stderr.write('DATABASE_URL non e una URL PostgreSQL valida.\n');
  process.exit(2);
}

if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
  process.stderr.write('DATABASE_URL deve usare il protocollo postgres o postgresql.\n');
  process.exit(2);
}

const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
if (!databaseUrl.hostname || !databaseUrl.username || !databaseName) {
  process.stderr.write('DATABASE_URL deve contenere host, utente e database.\n');
  process.exit(2);
}

const childEnvironment = {
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  LANG: process.env.LANG ?? 'C.UTF-8',
  PGHOST: databaseUrl.hostname,
  PGPORT: databaseUrl.port || '5432',
  PGUSER: decodeURIComponent(databaseUrl.username),
  PGPASSWORD: decodeURIComponent(databaseUrl.password),
  PGDATABASE: databaseName,
};

const sslMode = databaseUrl.searchParams.get('sslmode');
if (sslMode) childEnvironment.PGSSLMODE = sslMode;

// `--dbname` rimetterebbe le credenziali nella command line: questo wrapper
// esiste precisamente per evitarlo.
const argumentsFromCaller = process.argv.slice(2);
if (argumentsFromCaller.some((argument) => argument === '-d' || argument.startsWith('--dbname'))) {
  process.stderr.write('Non passare --dbname: la connessione arriva soltanto dall’ambiente.\n');
  process.exit(2);
}

const child = spawn('pg_dump', argumentsFromCaller, {
  env: childEnvironment,
  stdio: ['ignore', 'inherit', 'inherit'],
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}

child.once('error', (error) => {
  process.stderr.write(`Impossibile avviare pg_dump: ${error.message}\n`);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143);
});
