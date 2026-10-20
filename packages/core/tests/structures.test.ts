import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getStructure, getStructureFromCore, listStructures } from '../src/structures.js';
import { validateStructureField } from '../src/validators/fields/core/validateStructureField.js';
import type { Field } from '@moteurio/types/Field.js';

describe('core structures', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-structures-'));
        const dir = path.join(root, 'data', 'core', 'structures');
        fs.mkdirSync(dir, { recursive: true });
        // Core structure files identify themselves with "id", not "type".
        fs.writeFileSync(
            path.join(dir, 'seo.json'),
            JSON.stringify({
                id: 'core/seo',
                label: 'SEO',
                fields: {
                    seoTitle: {
                        type: 'core/text',
                        label: 'SEO title',
                        options: { required: true }
                    },
                    seoImage: { type: 'core/image', label: 'Share image' }
                }
            })
        );
        fs.writeFileSync(path.join(dir, 'README.md'), '# not a structure');
        vi.stubEnv('DATA_ROOT', root);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('loads core structures from data/core/structures under the data root', async () => {
        expect(getStructureFromCore('core/seo').fields.seoTitle.type).toBe('core/text');
        expect(Object.keys(await listStructures())).toContain('core/seo');
    });

    it('validates a structure field against a core structure', () => {
        const field = {
            type: 'core/structure',
            label: 'SEO',
            options: { structure: 'core/seo' }
        } as Field;
        // seoImage is optional and absent: no issue.
        expect(validateStructureField({ seoTitle: 'Hello' }, field, 'data.seo')).toEqual([]);
        expect(validateStructureField({ seoImage: { src: '/a.jpg' } }, field, 'data.seo')).toEqual([
            expect.objectContaining({ type: 'error', path: 'data.seo.seoTitle' })
        ]);
    });

    it('fetches a namespaced core structure by id', async () => {
        expect((await getStructure('core/seo')).label).toBe('SEO');
        await expect(getStructure('../etc/passwd')).rejects.toThrow(/Invalid structureId/);
        await expect(getStructure('a/b/c')).rejects.toThrow(/Invalid structureId/);
    });

    it('reports an unknown structure', () => {
        expect(() => getStructureFromCore('core/nope')).toThrow(/not found/);
    });

    it('lets a file in data/core override the shipped structure', () => {
        const seo = getStructureFromCore('core/seo');
        expect(seo.fields.seoImage.type).toBe('core/image');
        expect(seo.fields.seoDescription).toBeUndefined();
    });
});
