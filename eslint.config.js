import js from '@eslint/js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
    // Base JS config
    js.configs.recommended,

    // Global ignores (packages are linted by pnpm -r lint)
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'coverage/**',
            'packages/**',
            'vitest.config.js',
            'vitest.config.ts',
            'src/tests/**',
            'html/**'
        ]
    },

    // TypeScript-specific config (root only; packages use pnpm -r lint)
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: __dirname,
                sourceType: 'module',
                ecmaVersion: 'latest'
            },
            globals: {
                console: true,
                process: true,
                require: true,
                module: true,
                Buffer: true
            }
        },
        plugins: {
            '@typescript-eslint': typescriptPlugin,
            prettier: prettierPlugin
        },
        rules: {
            // TypeScript
            'no-unused-vars': 'off', // Let @typescript-eslint handle it
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-module-boundary-types': 'warn', // helps with API boundaries

            // Prettier
            'prettier/prettier': [
                'error',
                {
                    tabWidth: 4,
                    endOfLine: 'auto', // Ensures consistent line endings across OSes
                    semi: true, // Add semicolons
                    singleQuote: true // Use single quotes
                }
            ]
        }
    }
];
