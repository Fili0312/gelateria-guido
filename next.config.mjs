/**
 * L'app è servita da nginx su filippo.eventoyou.com/gelateria (decisione D1).
 *
 * `basePath` non è un dettaglio di deploy: Next lo usa per generare i link, gli
 * asset e le chiamate alle route handler. Sbagliarlo produce un sito che si
 * carica senza stile — lo stesso inciampo già visto su altri progetti di questo
 * server. Per questo il valore predefinito è quello di produzione: chi non
 * imposta nulla ottiene la configurazione giusta, non quella rotta.
 *
 * In sviluppo locale si può neutralizzare con NEXT_BASE_PATH="".
 *
 * @type {import('next').NextConfig}
 */
const requestedDistDir = process.env.NEXT_DIST_DIR?.trim();
if (
  requestedDistDir &&
  (!/^[.a-zA-Z0-9_-]+$/.test(requestedDistDir) || ['.', '..'].includes(requestedDistDir))
) {
  throw new Error('NEXT_DIST_DIR deve essere il nome semplice di una directory locale.');
}

const nextConfig = {
  reactStrictMode: true,
  basePath: process.env.NEXT_BASE_PATH ?? '/gelateria',
  poweredByHeader: false,
  outputFileTracingRoot: import.meta.dirname,
  ...(requestedDistDir ? { distDir: requestedDistDir } : {}),
};

export default nextConfig;
