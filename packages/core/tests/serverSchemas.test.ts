import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { deleteServerSchema, listServerSchemas, saveServerSchema } from '../src/serverSchemas.js';
import { listBlocks } from '../src/blocks.js';

describe('server-wide blocks and structures', () => {
    let dataRoot: string;

    beforeEach(() => {
        dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-server-schemas-'));
        vi.stubEnv('DATA_ROOT', dataRoot);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(dataRoot, { recursive: true, force: true });
    });

    it('lists shipped blocks as shipped', () => {
        const hero = listServerSchemas('blocks').find(b => b.type === 'core/hero');
        expect(hero?.origin).toBe('shipped');
    });

    it('adds a block every project sees, then removes it', () => {
        const added = saveServerSchema('blocks', 'banner', { label: 'Banner', fields: {} });
        expect(added).toMatchObject({ type: 'core/banner', origin: 'file' });
        expect(listBlocks()['core/banner']?.label).toBe('Banner');

        deleteServerSchema('blocks', 'core/banner');
        expect(listBlocks()['core/banner']).toBeUndefined();
    });

    it('changes a shipped block and brings it back on delete', () => {
        const shippedLabel = listBlocks()['core/hero'].label;
        const changed = saveServerSchema('blocks', 'hero', { label: 'Big hero', fields: {} });
        expect(changed.origin).toBe('changed');
        expect(listBlocks()['core/hero'].label).toBe('Big hero');

        deleteServerSchema('blocks', 'hero');
        expect(listBlocks()['core/hero'].label).toBe(shippedLabel);
    });

    it('refuses names outside core and deleting shipped ones', () => {
        expect(() =>
            saveServerSchema('blocks', 'acme/banner', { label: 'B', fields: {} })
        ).toThrow();
        expect(() => saveServerSchema('blocks', '../x', { label: 'B', fields: {} })).toThrow();
        expect(() => deleteServerSchema('structures', 'seo')).toThrow(/shipped/);
    });
});
