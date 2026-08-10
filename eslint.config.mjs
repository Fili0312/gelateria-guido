// eslint-config-next 16 esporta configurazioni flat native: niente FlatCompat.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'src/generated/**', 'prisma/migrations/**'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Il denaro non passa mai per un float, e un `any` su un prezzo fa
      // perdere il tipo Decimal: l'errore si scoprirebbe solo in produzione.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Il client Prisma grezzo e' un'uscita di sicurezza: ogni altro modulo
      // applicativo deve passare dalla factory con organizationId obbligatorio.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/server/database/system-client',
              message:
                'Usare prismaForOrganization(); il client non scoped e riservato a login e health check.',
            },
            {
              name: '@/generated/prisma/client',
              message: 'Importare i tipi o il client Prisma dal confine @/server/db.',
            },
            {
              name: '@prisma/client',
              message: 'Importare i tipi o il client Prisma dal confine @/server/db.',
            },
          ],
          patterns: [
            {
              group: [
                '**/database/system-client',
                '**/database/system-client.*',
                '**/database/system-client/**',
              ],
              message:
                'Usare prismaForOrganization(); anche gli import relativi del client non scoped sono vietati.',
            },
            {
              group: [
                '**/generated/prisma/client',
                '**/generated/prisma/client.*',
                '**/generated/prisma/client/**',
              ],
              message: 'Importare i tipi o il client Prisma dal confine @/server/db.',
            },
          ],
        },
      ],
    },
  },
  {
    // I soli file autorizzati a toccare il client Prisma grezzo. Tenere
    // l'elenco qui, e corto, e' cio' che rende una deroga visibile in review
    // invece che nascosta dentro un import qualsiasi.
    files: [
      'src/server/db.ts',
      'src/server/database/system-client.ts',
      // La ricerca trigram non e' esprimibile con l'API di Prisma e usa
      // `Prisma.sql`. Il filtro per organizzazione, che qui l'estensione non
      // puo' applicare, e' garantito dai test di ricerca-catalogo.test.ts.
      'src/server/database/ricerca-catalogo.ts',
      // Stessa deroga, stesso motivo: i candidati all'abbinamento usano la
      // somiglianza trigram, e senza indice sarebbe una scansione del catalogo
      // per ogni riga importata. Il filtro per organizzazione e' garantito dai
      // test di candidati-abbinamento.test.ts.
      'src/server/database/candidati-abbinamento.ts',
      // `price_list_row` eredita l'organizzazione dal listino e non puo'
      // essere paginata globalmente dal client scoped. La query bounded fa
      // quindi il join esplicito con `price_list`; scope, LIMIT e OFFSET sono
      // parametrici e verificati da coda-abbinamento.test.ts.
      'src/server/database/coda-abbinamento.ts',
      'src/server/health.ts',
      'src/app/api/auth/login/route.ts',
      // La ripresa dei job all'avvio non ha una sessione da cui ricavare
      // l'organizzazione: non c'e' nessun utente, c'e' solo una lavorazione
      // rimasta appesa, e va cercata in tutto il database. Ogni altra query
      // del runner parte comunque da un priceListId, che l'organizzazione ce
      // l'ha addosso.
      'src/server/import/runner.ts',
      // Contabilita' e cache delle chiamate IA: `ai_call` e `ai_cache` non
      // sono raggiungibili dal client scoped (la cache non ha organizzazione,
      // e il conteggio della spesa deve poter girare anche dalla ripresa
      // all'avvio, che di sessione non ne ha).
      'src/server/ai/index.ts',
      // La cascata di abbinamento gira dentro la lavorazione del listino, che
      // parte anche dalla ripresa all'avvio: nessuna sessione da cui ricavare
      // l'organizzazione. Ogni query parte comunque da un organizationId
      // esplicito, passato dal chiamante.
      'src/server/import/matching/cascata.ts',
      'src/server/import/matching/proposte.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];
