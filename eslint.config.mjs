import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/** Downgrade strict Next defaults so `npm run lint` reflects new changes without failing on legacy patterns. */
const pragmaticOverrides = {
  rules: {
    'react/display-name': 'warn',
    'react/no-unescaped-entities': 'warn',
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/rules-of-hooks': 'warn',
    'react-hooks/static-components': 'warn',
    'react-hooks/purity': 'warn',
    '@next/next/no-html-link-for-pages': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
  },
};

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [...nextCoreWebVitals, pragmaticOverrides];

export default eslintConfig;
