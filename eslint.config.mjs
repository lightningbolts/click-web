import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      '.wrangler/**',
      'node_modules/**',
      'coverage/**',
      'out/**',
      'public/**',
      'supabase/functions/**',
      'scripts/**',
    ],
  },
  {
    rules: {
      // Baseline: warn on legacy debt; ratchet toward error as files are touched.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler / React 19 plugin rules — widespread in existing UI; do not block CI yet.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react/display-name': 'warn',
      '@next/next/no-img-element': 'warn',
      '@next/next/no-location-assign-relative-destination': 'warn',
    },
  },
];

export default eslintConfig;
