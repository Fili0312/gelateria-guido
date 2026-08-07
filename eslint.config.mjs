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
];
