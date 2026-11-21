// eslint.config.js — Analyse statique du serveur (npm run lint).
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      // Express reconnaît un gestionnaire d'erreurs à ses quatre paramètres : `next`, même inutilisé,
      // fait partie de la signature. La convention `_next` signale les paramètres volontairement ignorés.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
