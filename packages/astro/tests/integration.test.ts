import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import { moteur, originalOf } from '../src/images.js';

function setup(options?: Parameters<typeof moteur>[0], remotePatterns: unknown[] = []) {
    const updateConfig = vi.fn();
    const hook = moteur(options).hooks['astro:config:setup'] as (p: unknown) => void;
    hook({ config: { image: { remotePatterns } }, updateConfig });
    return updateConfig.mock.calls[0][0].image.remotePatterns;
}

afterEach(() => vi.unstubAllEnvs());

describe('moteur()', () => {
    it('lets the build read pictures from api.moteur.io by default', () => {
        vi.stubEnv('MOTEUR_API_URL', '');
        expect(setup()).toEqual([{ protocol: 'https', hostname: 'api.moteur.io' }]);
    });

    it('follows MOTEUR_API_URL, port included, and keeps the site’s own patterns', () => {
        vi.stubEnv('MOTEUR_API_URL', 'http://localhost:3100');
        const mine = { protocol: 'https', hostname: 'cdn.example.com' };
        expect(setup(undefined, [mine])).toEqual([
            mine,
            { protocol: 'http', hostname: 'localhost', port: '3100' }
        ]);
    });

    it('takes an address of its own', () => {
        expect(setup({ apiUrl: 'https://moteur.example.org' })).toEqual([
            { protocol: 'https', hostname: 'moteur.example.org' }
        ]);
    });
});

describe('originalOf', () => {
    it('is the uploaded file, from a field or an asset', () => {
        expect(originalOf({ assetId: 'a', _resolved: { url: 'https://x/a.jpg' } })).toBe(
            'https://x/a.jpg'
        );
        expect(originalOf({ url: 'https://x/b.jpg' })).toBe('https://x/b.jpg');
        expect(originalOf({ assetId: 'a', _resolved: null })).toBeUndefined();
        expect(originalOf(null)).toBeUndefined();
    });
});

describe('env', () => {
    it('reads the environment first, then the site’s .env files', () => {
        const dir = mkdtempSync(join(tmpdir(), 'moteur-env-'));
        writeFileSync(join(dir, '.env'), 'MOTEUR_TEST_VAR=from-file\n');
        const cwd = process.cwd();
        process.chdir(dir);
        try {
            vi.stubEnv('MOTEUR_TEST_VAR', '');
            expect(env('MOTEUR_TEST_VAR')).toBe('from-file');
            vi.stubEnv('MOTEUR_TEST_VAR', 'from-env');
            expect(env('MOTEUR_TEST_VAR')).toBe('from-env');
        } finally {
            process.chdir(cwd);
        }
    });
});
