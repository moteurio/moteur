import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.e2e.ts'],
        // The steps share one server and one project, and run in order.
        sequence: { concurrent: false },
        fileParallelism: false,
        testTimeout: 30_000,
        hookTimeout: 60_000
    }
});
