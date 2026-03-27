import shared from '../../eslint.shared-config.js';

export default [
    ...shared,
    {
        files: ['**/*.ts'],
        languageOptions: {
            globals: {
                NodeJS: 'readonly'
            }
        }
    }
];
