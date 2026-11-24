// Configuration ESLint unique pour tout le monorepo (format « flat »).
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/web/next-env.d.ts',
      'apps/web/android/**',
      'apps/web/ios/**',
      'apps/web/public/ocr/**',
      'apps/web/public/ton-juste/**', // jeu construit par pnpm build:ton-juste
      '_ancien-web-avant-six-app/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Une conversation ne doit jamais finir dans la console : seuls warn et error passent.
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      // L'app n'utilise pas React Compiler ; on garde les règles classiques des Hooks.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      ...jsxA11y.flatConfigs.strict.rules,
      // Les réponses de l'IA s'affichent en texte, jamais en HTML.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Interdit : afficher du texte, jamais du HTML (risque XSS / injection).',
        },
      ],
    },
  },
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['**/scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['apps/web/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['apps/web/integration/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Application de bureau : processus Electron en CommonJS (require est la seule façon de charger electron ici).
    files: ['apps/bureau/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Barre du haut de l'app de bureau : page web locale (barre.html).
    files: ['apps/bureau/barre.js', 'apps/bureau/menu.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
);
