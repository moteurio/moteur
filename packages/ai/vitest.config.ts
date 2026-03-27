import { defineConfig } from 'vitest/config';

/** Local config so `vitest run` from this package does not inherit root `projects` paths. */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            skipFull: false,
            reportsDirectory: './coverage'
        }
    }
});
