import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'eval/.build',
      'tools/shortlist/.venv',
      'tools/smoke/.venv',
      'tools/catalog/.cache',
      '**/*.tmp.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/chat/**/*.ts'],
    rules: {
      // Frontera regulatoria (D8/D10/D12): el chat nunca importa el modulo de insulina.
      // Refuerza src/chat/boundary.test.ts a nivel de lint.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/insulin', '**/insulin/**', 'insulin', 'insulin/**'],
              message:
                'La frontera regulatoria prohibe que el chat importe el modulo de insulina (D8/D10/D12).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly' },
    },
  },
  {
    files: ['e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        indexedDB: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        HTMLAnchorElement: 'readonly',
      },
    },
  },
  {
    files: ['eval/**/*.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
);
