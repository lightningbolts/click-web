import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Quiet Presence guardrails (redesign spec §5, §12). Errors in redesigned code; the legacy
 * tree is migrated phase by phase and joins `REDESIGNED` as it is rewritten.
 */
const REDESIGNED = [
  'components/ds/**',
  'components/app-shell/**',
  'components/home/**',
  'components/clicks/**',
  'components/people/**',
  'components/me/**',
  'components/place/**',
  'app/(app)/**',
];

const classLiteral = (regex, message) => [
  { selector: `Literal[value=/${regex}/]`, message },
  { selector: `TemplateElement[value.raw=/${regex}/]`, message },
];

const tokenOnlyClasses = [
  ...classLiteral('text-\\[(9|10|11)px\\]', 'Below type-badge (12px) is not allowed. Use type-meta / type-badge.'),
  ...classLiteral('rounded-\\[', 'Use the radius scale (rounded-xs…xl, rounded-pill).'),
  ...classLiteral('(^|\\s)backdrop-blur', 'Use material-glass / material-glass-dark.'),
];

const hexClasses = classLiteral(
  '(bg|text|border|fill|stroke|ring|from|to|via)-\\[#',
  'No hex colors in className — use a token (spec §4.1).',
);

const noDialogGlobals = {
  selector: "CallExpression[callee.object.name='window'][callee.property.name=/^(confirm|alert)$/]",
  message: 'Use ConfirmDialog / useConfirm or a toast instead of window.confirm/alert.',
};

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
      'no-restricted-syntax': ['warn', noDialogGlobals],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'maplibre-gl',
              message: "Import from '@/lib/maps/maplibre' (worker URL is set there) or load via loadMaplibre().",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['lib/maps/**', '__tests__/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: REDESIGNED,
    rules: {
      'no-restricted-syntax': ['error', noDialogGlobals, ...tokenOnlyClasses, ...hexClasses],
    },
  },
  {
    // The design system and palette helpers own the few literal colors (avatar palette, brand).
    files: ['components/ds/**', 'lib/ui/**'],
    rules: { 'no-restricted-syntax': ['error', noDialogGlobals, ...tokenOnlyClasses] },
  },
];

export default eslintConfig;
