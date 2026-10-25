import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Import boundaries (docs/toolbox-architecture-plan.md, 2.6 and 3.3):
 * - platform never imports a tool; app.module/tool-registry are the only files that list tools
 * - a tool imports the platform, never another tool, never the app wiring
 * - inside the reader, summaries never imports reading
 */
const noToolsFromPlatform = {
  files: ['src/platform/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['@tools/*', '**/tools/**'], message: 'platform code must not import tool code' },
          { group: ['@/app.module', '@/tool-registry'], message: 'platform code must not import the app wiring' },
        ],
      },
    ],
  },
};

const toolBoundaries = {
  files: ['src/tools/reader/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { regex: '^@tools/(?!reader(/|$))', message: 'a tool must not import another tool' },
          { group: ['@/app.module', '@/tool-registry'], message: 'tools must not import the app wiring' },
        ],
      },
    ],
  },
};

const summariesNotReading = {
  files: ['src/tools/reader/summaries/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { regex: '^@tools/(?!reader(/|$))', message: 'a tool must not import another tool' },
          { group: ['**/reading/**'], message: 'summaries must not depend on reading' },
          { group: ['@/app.module', '@/tool-registry'], message: 'tools must not import the app wiring' },
        ],
      },
    ],
  },
};

const specOverrides = {
  files: ['**/*.spec.ts'],
  rules: {
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
  },
};

export default [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, // needs project
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  noToolsFromPlatform,
  toolBoundaries,
  summariesNotReading,
  specOverrides,
];
