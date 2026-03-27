import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Root Vitest config for reference. Actual tests live in packages (api, cli, client, core, presence).
 * Run all tests from root: pnpm test
 * Run tests in a package: pnpm --filter @moteurio/core test
 * Run tests in the graphical UI: pnpm test:ui
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: [],
        passWithNoTests: true,
        // Projects for test:ui — only packages that have vitest.config and tests
        projects: [
            'packages/ai',
            'packages/api',
            'packages/cli',
            'packages/client',
            'packages/core',
            'packages/plugin-sdk',
            'packages/presence'
        ]
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    }
});
