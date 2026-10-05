// @ts-check
import { globalIgnores } from 'eslint/config';
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  globalIgnores([
    '**/node_modules/**',
    '.claude/**',
    'apps/*/dist/**',
    'apps/*/.next/**',
    'apps/*/out/**',
    'apps/*/build/**',
    'apps/*/next-env.d.ts',
    'apps/api/src/generated/**',
    'packages/*/dist/**',
    'eslint.config.mjs',
  ]),
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/api/{src,apps,libs,test}/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      eslintPluginPrettierRecommended,
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['packages/contracts/src/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      eslintPluginPrettierRecommended,
    ],
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['apps/admin/**/*.{js,jsx,ts,tsx}', 'apps/storefront/**/*.{js,jsx,ts,tsx}'],
    extends: [...nextVitals, ...nextTs],
    settings: {
      next: {
        rootDir: ['apps/admin/', 'apps/storefront/'],
      },
    },
  },
);
