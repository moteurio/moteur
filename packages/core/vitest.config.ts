import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    test: {
        setupFiles: ['./tests/setup.ts'],
        globals: true,
        environment: 'node', // change to 'jsdom' if testing DOM
        include: ['tests/**/*.test.ts'], // adjust as needed
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            skipFull: false, // <= keep report even if everything is covered
            reportsDirectory: './coverage'
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    }
});
