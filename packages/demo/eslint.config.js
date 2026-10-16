import shared from '../../eslint.shared-config.js';

export default [
    ...shared,
    {
        files: ['**/*.ts'],
        languageOptions: {
            globals: {
                NodeJS: 'readonly',
                setTimeout: 'readonly',
                setImmediate: 'readonly',
                performance: 'readonly',
                Buffer: 'readonly'
            }
        }
    }
];
