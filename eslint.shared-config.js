// eslint.shared-config.js
import js from '@eslint/js';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
    js.configs.recommended,
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**']
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                sourceType: 'module',
                ecmaVersion: 'latest'
            },
            globals: {
                ...js.environments?.node?.globals,
                Buffer: true,
                console: true,
                process: true,
                it: true,
                expect: true
            }
        },
        plugins: {
            '@typescript-eslint': typescriptPlugin,
            prettier: prettierPlugin
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            'prettier/prettier': [
                'error',
                {
                    semi: true,
                    singleQuote: true,
                    endOfLine: 'lf'
                }
            ]
        }
    }
];
