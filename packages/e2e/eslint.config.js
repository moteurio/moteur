import shared from '../../eslint.shared-config.js';

export default [
    ...shared,
    {
        files: ['**/*.ts'],
        languageOptions: {
            globals: {
                fetch: 'readonly',
                NodeJS: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly'
            }
        }
    }
];
