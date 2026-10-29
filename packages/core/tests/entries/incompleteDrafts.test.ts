import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import { initRepo } from '../../src/git/index.js';
import { putProjectJson } from '../../src/utils/projectStorage.js';
import { modelKey } from '../../src/utils/storageKeys.js';
import { createEntry, publishEntry, updateEntry } from '../../src/entries.js';
import { submitForReview } from '../../src/reviews.js';
import { validateEntry } from '../../src/validators/validateEntry.js';
import { missingRequired, missingRequiredFields } from '../../src/validators/entryComplete.js';

const projectId = 'incomplete-drafts';
const user = { id: 'u1', name: 'Ada', isActive: true, roles: ['admin'], projects: [projectId] };
const model: ModelSchema = {
    id: 'article',
    label: 'Article',
    fields: {
        title: { type: 'core/text', label: 'Title', options: { required: true } },
        slug: { type: 'core/text', label: 'Slug', options: { required: true } },
        excerpt: { type: 'core/text', label: 'Excerpt' }
    }
} as ModelSchema;

describe('incomplete drafts', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-incomplete-'));
        const projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'P',
                defaultLocale: 'en',
                users: ['u1'],
                workflow: { enabled: true }
            })
        );
        await initRepo(projDir);
        await putProjectJson(projectId, modelKey('article'), model);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const draft = { id: 'new-one', type: 'article', data: { title: 'Un essai' } } as Entry;

    it('lets a draft hold unfinished blocks and groups too, not a live entry', async () => {
        // A block whose picture is required, and a group (object) whose label is.
        const blocks = path.join(tempDir, 'data', 'projects', projectId, 'blocks');
        await fs.mkdir(blocks, { recursive: true });
        await fs.writeFile(
            path.join(blocks, 'figure.json'),
            JSON.stringify({
                type: 'site/figure',
                label: 'Figure',
                fields: {
                    image: { type: 'core/text', label: 'Image', required: true },
                    caption: { type: 'core/text', label: 'Caption' }
                }
            })
        );
        const long: ModelSchema = {
            ...model,
            fields: {
                ...model.fields,
                body: { type: 'core/block-list', label: 'Body' },
                cta: {
                    type: 'core/object',
                    label: 'Call to action',
                    fields: { label: { type: 'core/text', label: 'Label', required: true } }
                }
            }
        } as ModelSchema;
        const unfinished = {
            ...draft,
            data: {
                title: 'Un essai',
                body: [{ type: 'site/figure', data: { caption: 'Soon' } }],
                cta: { url: '/' }
            }
        } as Entry;

        const asDraft = await validateEntry(projectId, unfinished, long, { draft: true });
        expect(asDraft.valid).toBe(true);
        expect(asDraft.issues.map(i => [i.type, i.path.split('.').slice(-1)[0]])).toEqual(
            expect.arrayContaining([
                ['warning', 'image'],
                ['warning', 'label']
            ])
        );
        // Going live: the unfinished block and group are named, by where they are.
        expect(missingRequired(unfinished, long, projectId)).toEqual({
            fields: ['slug', 'body', 'cta'],
            where: ['slug', 'body[0].image', 'cta.label']
        });
        const live = await validateEntry(projectId, unfinished, long, { draft: false });
        expect(live.valid).toBe(false);
        expect(live.issues.filter(i => i.type === 'error').length).toBeGreaterThanOrEqual(3);
    });

    it('validates a draft with empty required fields as warnings, a live entry as errors', async () => {
        const asDraft = await validateEntry(projectId, draft, model, { draft: true });
        expect(asDraft.valid).toBe(true);
        expect(asDraft.issues).toEqual([
            expect.objectContaining({ type: 'warning', code: 'ENTRY_MISSING_REQUIRED_FIELD' })
        ]);
        const strict = await validateEntry(projectId, draft, model);
        expect(strict.valid).toBe(false);
        expect(missingRequiredFields(draft, model)).toEqual(['slug']);
    });

    it('saves an incomplete draft but refuses review and publishing until it is complete', async () => {
        await createEntry(user, projectId, 'article', draft);

        await expect(submitForReview(projectId, user, 'article', 'new-one')).rejects.toMatchObject({
            statusCode: 400,
            code: 'ENTRY_INCOMPLETE',
            missing: ['slug']
        });
        await expect(
            updateEntry(user, projectId, 'article', 'new-one', { status: 'in_review' })
        ).rejects.toThrow(/review needs every required field: "new-one" has no slug/);
        await expect(publishEntry(user, projectId, 'article', 'new-one')).rejects.toThrow(
            /Publishing needs every required field/
        );
        await expect(
            updateEntry(user, projectId, 'article', 'new-one', { status: 'published' })
        ).rejects.toMatchObject({ code: 'ENTRY_INCOMPLETE' });

        await updateEntry(user, projectId, 'article', 'new-one', { data: { slug: 'un-essai' } });
        const live = await publishEntry(user, projectId, 'article', 'new-one');
        expect(live.status).toBe('published');
    });
});
